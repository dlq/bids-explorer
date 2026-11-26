import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, lstat, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import * as vscode from 'vscode';
import { extensionId } from '../extensionId';
import { edfRecordingFixture } from '../edfFixture';
import { zipFixture } from '../zipFixture';
import { tarFixture, tarRecord } from '../tarFixture';
import { squashfsFile } from '../squashfsFixture';
import { archiveResourceUri, entryArchiveUri } from '../../core/archiveUri';
import { LogicalDirectorySource } from '../../sources/logicalDirectory';
import { loadRecordingWindow } from '../../sources/recordingWindow';
import { loadRecordingMetadata } from '../../sources/recordingMetadata';
import { RecordingPreviewManager } from '../../ui/recordingPreview';
import { RecordingWaveformManager } from '../../ui/recordingWaveform';
import type { RecordingTrace } from '../../core/recordingTypes';
import { assertHostMessages } from './assertHostMessages';

async function state(
  panel: vscode.WebviewPanel,
  matches: (value: Record<string, unknown>) => boolean = () => true,
) {
  let result: Record<string, unknown> | undefined;
  const listener = panel.webview.onDidReceiveMessage((value: unknown) => {
    if (
      value &&
      typeof value === 'object' &&
      'type' in value &&
      value.type === 'rendered' &&
      matches(value)
    )
      result = value;
  });
  try {
    const deadline = Date.now() + 15000;
    while (!result) {
      assert.ok(Date.now() < deadline, 'Expected recording waveform state');
      await panel.webview.postMessage({ type: 'inspect' });
      await new Promise((r) => setTimeout(r, 30));
    }
    return result;
  } finally {
    listener.dispose();
  }
}
function controls(panel: vscode.WebviewPanel): void {
  const nonce = /nonce="([a-f0-9]+)"/.exec(panel.webview.html)![1];
  panel.webview.html = panel.webview.html.replace(
    '</head>',
    `<script nonce="${nonce}">
  const testApi=acquireVsCodeApi();window.acquireVsCodeApi=()=>testApi;let testToken;
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin)return;
    if(event.data?.type==='snapshot')testToken=event.data.snapshot.token;
    if(event.data?.type!=='testControl')return;
    if(event.data.request){testApi.postMessage({type:'loadWindow',token:event.data.stale?'old-token':testToken,request:event.data.request});return;}
    if(event.data.id==='shadePixels'){const c=document.querySelector('canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let orange=0;for(let i=0;i<d.length;i+=4)if(d[i]>150&&d[i]>d[i+1]&&d[i+1]>d[i+2]&&d[i+3])orange++;testApi.postMessage({type:'shadePixels',orange});return;}
    if(event.data.id==='pixels'){const c=document.querySelector('canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let blue=0;for(let i=0;i<d.length;i+=4)if(d[i+2]>150&&d[i+2]>d[i]*1.2&&d[i+3])blue++;testApi.postMessage({type:'pixels',blue});return;}
    if(event.data.id==='themePixels'){document.body.style.setProperty('--vscode-foreground','#00ff00');requestAnimationFrame(()=>requestAnimationFrame(()=>{const c=document.querySelector('canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let green=0;for(let i=0;i<d.length;i+=4)if(d[i]<50&&d[i+1]>200&&d[i+2]<50&&d[i+3])green++;testApi.postMessage({type:'themePixels',green});}));return;}
    const target=document.getElementById(event.data.id);
    if(target instanceof HTMLSelectElement){target.value=event.data.value;target.dispatchEvent(new Event('change'));return;}
    if(target instanceof HTMLInputElement&&target.type!=='checkbox'){target.value=event.data.value;target.dispatchEvent(new Event('input'));}else target?.click();
  });</script></head>`,
  );
}

suite('EDF waveform windows', () => {
  test('renders calibrated plots, navigates time/channels, rejects stale actions and retains data on errors/cancellation', async function () {
    this.timeout(40000);
    const extension = vscode.extensions.getExtension(extensionId)!;
    await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-waveform-ui-')),
      file = join(folder, 'task-rest_eeg.edf');
    let paused = false;
    const manager = new RecordingWaveformManager(
      extension.extensionUri,
      (snapshot, request, signal) =>
        paused
          ? new Promise((_, reject) =>
              signal.addEventListener('abort', () => reject(new Error('Cancelled')), {
                once: true,
              }),
            )
          : loadRecordingWindow(snapshot, request, signal),
    );
    try {
      const original = edfRecordingFixture();
      await writeFile(file, original);
      const uri = vscode.Uri.file(file);
      const panel = await manager.open(uri, 'run');
      controls(panel);
      await assertHostMessages(panel.webview);
      const initial = await state(panel, (s) => s.traceCount === 2 && !s.busy);
      const trace = initial.firstTrace as RecordingTrace;
      assert.match(String(initial.selection), /2 of 2 signal channels selected/);
      assert.equal((initial.channelLabels as string[]).length, 2);
      assert.equal(initial.title, 'EEG');
      assert.equal(trace.unit, 'uV');
      assert.equal(trace.sampleCount, 2000);
      assert.equal(trace.minimum, -100);
      assert.equal(trace.maximum, 100);
      assert.equal(await manager.open(uri, 'run'), panel);
      let blue = 0;
      const pixels = panel.webview.onDidReceiveMessage((message: unknown) => {
        if (
          message &&
          typeof message === 'object' &&
          'type' in message &&
          message.type === 'pixels' &&
          'blue' in message
        )
          blue = Number(message.blue);
      });
      await panel.webview.postMessage({ type: 'testControl', id: 'pixels' });
      const deadline = Date.now() + 5000;
      while (!blue) {
        assert.ok(Date.now() < deadline);
        await new Promise((r) => setTimeout(r, 20));
      }
      pixels.dispose();
      assert.ok(blue > 100, 'The canvas paints the signal, not just axes');
      await panel.webview.postMessage({ type: 'testControl', id: 'duration', value: '5' });
      await panel.webview.postMessage({ type: 'testControl', id: 'start', value: '10' });
      await panel.webview.postMessage({ type: 'testControl', id: 'load' });
      assert.equal((await state(panel, (s) => s.startSeconds === 10 && !s.busy)).endSeconds, 15);
      await panel.webview.postMessage({ type: 'testControl', id: 'next' });
      assert.equal((await state(panel, (s) => s.startSeconds === 15 && !s.busy)).endSeconds, 20);
      await panel.webview.postMessage({ type: 'testControl', id: 'previous' });
      await state(panel, (s) => s.startSeconds === 10 && !s.busy);
      await panel.webview.postMessage({ type: 'testControl', id: 'filter', value: 'ECG' });
      await panel.webview.postMessage({ type: 'testControl', id: 'channel-1' });
      await panel.webview.postMessage({ type: 'testControl', id: 'load' });
      await state(panel, (s) => s.traceCount === 1 && !s.busy);
      await panel.webview.postMessage({
        type: 'testControl',
        request: { startSeconds: 0, durationSeconds: 5, channels: [999] },
        stale: true,
      });
      assert.equal((await state(panel)).error, '');
      await panel.webview.postMessage({
        type: 'testControl',
        request: { startSeconds: 0, durationSeconds: 5, channels: [2] },
      });
      assert.match(String((await state(panel, (s) => !!s.error)).error), /annotation/);
      paused = true;
      await panel.webview.postMessage({ type: 'testControl', id: 'load' });
      await state(panel, (s) => s.busy === true);
      await panel.webview.postMessage({ type: 'testControl', id: 'cancel' });
      const cancelled = await state(
        panel,
        (s) => String(s.status).includes('cancelled') && !s.busy,
      );
      assert.equal(cancelled.traceCount, 1);
      paused = false;
      await writeFile(file, Buffer.concat([original, Buffer.from('changed')]));
      await panel.webview.postMessage({ type: 'testControl', id: 'load' });
      assert.equal((await state(panel, (s) => String(s.error).includes('changed'))).traceCount, 1);
      await writeFile(file, original);
      await panel.webview.postMessage({ type: 'testControl', id: 'reload' });
      await state(panel, (s) => s.traceCount === 0 && !s.busy && !s.error);
      await panel.webview.postMessage({ type: 'testControl', id: 'load' });
      await state(panel, (s) => s.traceCount === 2 && !s.busy);
      assert.deepEqual(await readFile(file), original);
    } finally {
      manager.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('integrates source-backed channel status and events without replacing EDF calibration or blocking waveform loading', async function () {
    this.timeout(40000);
    const extension = vscode.extensions.getExtension(extensionId)!;
    await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-recording-metadata-ui-'));
    const source = new LogicalDirectorySource(),
      manager = new RecordingWaveformManager(extension.extensionUri);
    let paused = false,
      opened = '';
    try {
      await mkdir(join(folder, 'sub-01/eeg'), { recursive: true });
      const file = join(folder, 'sub-01/eeg/sub-01_task-rest_eeg.edf');
      const channels = join(folder, 'sub-01/eeg/sub-01_task-rest_channels.tsv');
      const eventPath = join(folder, 'task-rest_events.tsv');
      await writeFile(file, edfRecordingFixture());
      await writeFile(
        channels,
        'name\ttype\tunits\tsampling_frequency\tstatus\tstatus_description\nECG\tECG\tmV\t100\tgood\tn/a\nFz\tEEG\tV\t999\tbad\tRecorded noisy channel\n',
      );
      await writeFile(
        eventPath,
        'onset\tduration\ttrial_type\tsample\n-1\t2\ttraining\t0001\n5\t0\t<script>cue</script>\t0002\n15\tn/a\tresponse\t0003\n' +
          Array.from({ length: 60 }, (_, i) => `11\t1\textra-${i}\t${i}\n`).join(''),
      );
      let target = await source.root(vscode.Uri.file(folder).toString());
      for (const part of ['sub-01', 'eeg', 'sub-01_task-rest_eeg.edf'])
        target = (await source.children(target, new AbortController().signal)).find(
          (e) => e.name === part,
        )!;
      const panel = await manager.open(vscode.Uri.file(file), 'metadata', undefined, {
        load: (signal, choices) =>
          paused
            ? new Promise((_, reject) =>
                signal.addEventListener('abort', () => reject(new Error('Cancelled')), {
                  once: true,
                }),
              )
            : loadRecordingMetadata(source, target, signal, choices),
        open: (entry) => {
          opened = entry.uri;
          return Promise.resolve();
        },
      });
      controls(panel);
      await assertHostMessages(panel.webview);
      const initial = await state(
        panel,
        (s) => s.traceCount === 2 && s.eventRows === 63 && !s.tablesBusy,
      );
      assert.match(
        (initial.channelDetails as string[])[0],
        /Type EEG.*Recorded status: bad.*Recorded noisy channel/,
      );
      assert.match((initial.channelDetails as string[])[0], /TSV V; EDF uV/);
      assert.match(String((initial.plotAccessibility as string[])[0]), /recorded bad/);
      assert.match((initial.channelDetails as string[])[0], /TSV 999 Hz; EDF 200 Hz/);
      assert.equal((initial.firstTrace as RecordingTrace).unit, 'uV');
      assert.equal((initial.firstTrace as RecordingTrace).samplingFrequency, 200);
      assert.equal(
        initial.eventMarkers,
        2,
        'Negative intervals overlap the window, future events remain off the timeline',
      );
      assert.match(
        String(initial.eventTimelineText),
        /training · -1–1 s · Partly outside this window/,
      );
      assert.match(
        String(initial.eventTimelineText),
        /<script>cue<\/script> · 5 s \(instantaneous\).*Go to event/,
      );
      assert.equal(
        initial.eventAxisStart,
        initial.waveformAxisStart,
        'Event and waveform axes share the same pixel origin',
      );
      assert.equal(
        initial.eventAxisEnd,
        initial.waveformAxisEnd,
        'Event and waveform axes share the same endpoint',
      );
      await panel.webview.postMessage({ type: 'testControl', id: 'goto-event-3' });
      await state(panel, (s) => s.startSeconds === 5 && !s.busy);
      await panel.webview.postMessage({ type: 'testControl', id: 'previous' });
      await state(panel, (s) => s.startSeconds === 0 && !s.busy);
      assert.match(String(initial.eventPage), /1–50 of 63/);
      await panel.webview.postMessage({ type: 'testControl', id: 'events-next' });
      await state(panel, (s) => String(s.eventPage).startsWith('51–63'));
      await panel.webview.postMessage({
        type: 'testControl',
        id: 'event-filter',
        value: 'response',
      });
      await state(panel, (s) => String(s.eventPage).includes('1–1 of 1'));
      await panel.webview.postMessage({ type: 'testControl', id: 'event-4' });
      const jumped = await state(panel, (s) => s.startSeconds === 10 && !s.busy);
      assert.equal(jumped.eventMarkers, 12);
      assert.match(String(jumped.eventTimelineText), /61 overlap.*First 12 intervals/);
      assert.ok(String(initial.eventText).includes('<script>cue</script>'));
      assert.equal(initial.eventScriptCount, 0);
      await panel.webview.postMessage({ type: 'testControl', id: 'open-events-table' });
      const openDeadline = Date.now() + 5000;
      while (!opened) {
        assert.ok(Date.now() < openDeadline);
        await new Promise((r) => setTimeout(r, 20));
      }
      assert.equal(opened, vscode.Uri.file(eventPath).toString());
      await writeFile(channels, 'name\ttype\tunits\nFz\tEEG\tuV\nFz\tEEG\tuV\n');
      source.refresh();
      await panel.webview.postMessage({ type: 'testControl', id: 'reload-tables' });
      await state(panel, (s) =>
        String((s.channelDetails as string[])?.[0]).includes('No unique matching'),
      );
      paused = true;
      await panel.webview.postMessage({ type: 'testControl', id: 'reload-tables' });
      await state(panel, (s) => s.tablesBusy === true);
      await panel.webview.postMessage({ type: 'testControl', id: 'cancel-tables' });
      const cancelled = await state(
        panel,
        (s) => String(s.tablesStatus).includes('cancelled') && !s.tablesBusy,
      );
      assert.equal(cancelled.eventRows, 63);
      assert.equal(cancelled.traceCount, 2);
      paused = false;
      await writeFile(eventPath, 'bad\tcolumns\nx\ty\n');
      source.refresh();
      await panel.webview.postMessage({ type: 'testControl', id: 'reload-tables' });
      await state(panel, (s) => s.eventRows === 0 && !s.tablesBusy);
      assert.deepEqual(await readFile(file), edfRecordingFixture());
    } finally {
      manager.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('stacks compatible EEG channels with fixed shared scales, display gain and event shading', async function () {
    this.timeout(30000);
    const extension = vscode.extensions.getExtension(extensionId)!;
    await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-stacked-eeg-ui-')),
      source = new LogicalDirectorySource(),
      manager = new RecordingWaveformManager(extension.extensionUri);
    try {
      const file = join(folder, 'sub-01_task-rest_eeg.edf'),
        original = edfRecordingFixture();
      original.write('Cz'.padEnd(16), 272, 16, 'ascii');
      for (let record = 0; record < 10; record++)
        for (let sample = 0; sample < 400; sample++)
          original.writeInt16LE(
            (sample % 2 ? 1 : -1) * (record < 5 ? 6553 : 26213),
            1024 + record * 1240 + sample * 2,
          );
      await writeFile(file, original);
      await writeFile(
        join(folder, 'sub-01_task-rest_channels.tsv'),
        'name\ttype\tunits\nFz\tEEG\tuV\nCz\tEEG\tmV\n',
      );
      await writeFile(
        join(folder, 'sub-01_task-rest_events.tsv'),
        'onset\tduration\ttrial_type\n5\t1\tcue\n15\t0\tresponse\n',
      );
      const root = await source.root(vscode.Uri.file(folder).toString()),
        target = (await source.children(root, new AbortController().signal)).find((e) =>
          e.name.endsWith('.edf'),
        )!;
      const panel = await manager.open(vscode.Uri.file(file), 'stacked', undefined, {
        load: (s, c) => loadRecordingMetadata(source, target, s, c),
        open: () => Promise.resolve(),
      });
      controls(panel);
      const initial = await state(
        panel,
        (s) => s.traceCount === 2 && s.eventRows === 2 && !s.busy && !s.tablesBusy,
      );
      const groups = initial.displayGroups as {
        extent: number;
        unit: string;
        shared: boolean;
        channels: number[];
      }[];
      assert.equal(initial.canvasCount, 1);
      assert.equal(groups[0].unit, 'µV');
      assert.equal(groups[0].shared, true);
      assert.deepEqual(groups[0].channels, [0, 1]);
      assert.match(String(initial.displayText), /Shared scale/);
      assert.match(String(initial.displayText), /Source mV → display µV \(×1000\)/);
      const pixels = async () => {
        let result: number | undefined;
        const listener = panel.webview.onDidReceiveMessage((m: unknown) => {
          if (
            m &&
            typeof m === 'object' &&
            'type' in m &&
            m.type === 'shadePixels' &&
            'orange' in m
          )
            result = Number(m.orange);
        });
        try {
          await panel.webview.postMessage({ type: 'testControl', id: 'shadePixels' });
          const deadline = Date.now() + 5000;
          while (result === undefined) {
            assert.ok(Date.now() < deadline);
            await new Promise((r) => setTimeout(r, 20));
          }
          return result;
        } finally {
          listener.dispose();
        }
      };
      assert.ok(
        (await pixels()) > 100,
        'Event interval is visibly shaded across the stacked traces',
      );
      await panel.webview.postMessage({ type: 'testControl', id: 'shade-events' });
      await state(panel, (s) => s.shading === false);
      assert.equal(await pixels(), 0);
      await panel.webview.postMessage({ type: 'testControl', id: 'shade-events' });
      await state(panel, (s) => s.shading === true);
      await panel.webview.postMessage({ type: 'testControl', id: 'amplitude-larger' });
      await state(panel, (s) => s.amplitudeGain === 2);
      await panel.webview.postMessage({ type: 'testControl', id: 'amplitude-smaller' });
      await state(panel, (s) => s.amplitudeGain === 1);
      await panel.webview.postMessage({ type: 'testControl', id: 'next' });
      const next = await state(panel, (s) => s.startSeconds === 10 && !s.busy);
      assert.equal(
        (next.displayGroups as typeof groups)[0].extent,
        groups[0].extent,
        'Paging retains the initial physical scale',
      );
      assert.match(String(next.displayText), /exceed the display range/);
      await panel.webview.postMessage({ type: 'testControl', id: 'amplitude-fit' });
      const fitted = await state(panel, (s) => (s.displayGroups as typeof groups)[0].extent > 70);
      assert.equal(fitted.amplitudeGain, 1);
      await panel.webview.postMessage({
        type: 'testControl',
        id: 'trace-layout',
        value: 'individual',
      });
      const separate = await state(panel, (s) => s.canvasCount === 2);
      assert.deepEqual(
        (separate.displayGroups as typeof groups).map((g) => g.unit),
        ['uV', 'mV'],
      );
      let green = 0;
      const themeListener = panel.webview.onDidReceiveMessage((m: unknown) => {
        if (m && typeof m === 'object' && 'type' in m && m.type === 'themePixels' && 'green' in m)
          green = Number(m.green);
      });
      try {
        await panel.webview.postMessage({ type: 'testControl', id: 'themePixels' });
        const deadline = Date.now() + 5000;
        while (!green) {
          assert.ok(Date.now() < deadline, 'Theme changes repaint labels and scale bars');
          await new Promise((r) => setTimeout(r, 20));
        }
        assert.ok(green > 100, 'The canvas uses the updated foreground colour');
        const themed = await state(panel);
        assert.equal(themed.startSeconds, separate.startSeconds);
        assert.equal(themed.amplitudeGain, separate.amplitudeGain);
        assert.deepEqual(themed.displayGroups, separate.displayGroups);
      } finally {
        themeListener.dispose();
      }
      assert.deepEqual(await readFile(file), original);
    } finally {
      manager.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('opens the same signal window from supported archives and declines discontinuous timing', async function () {
    this.timeout(30000);
    const extension = vscode.extensions.getExtension(extensionId)!;
    await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-waveform-archive-ui-')),
      manager = new RecordingWaveformManager(extension.extensionUri),
      defaultManager = new RecordingPreviewManager(extension.extensionUri);
    try {
      {
        const file = join(folder, 'sub-01_task-rest_eeg.edf');
        await writeFile(file, edfRecordingFixture());
        let inspected = false;
        const panel = await defaultManager.open(vscode.Uri.file(file), () => {
          inspected = true;
          return Promise.resolve();
        });
        controls(panel);
        await state(panel, (s) => s.traceCount === 2 && !s.busy);
        await panel.webview.postMessage({ type: 'testControl', id: 'metadata' });
        const deadline = Date.now() + 5000;
        while (!inspected) {
          assert.ok(Date.now() < deadline, 'Metadata remains accessible in the waveform editor');
          await new Promise((r) => setTimeout(r, 20));
        }
        panel.dispose();
      }
      const name = 'task-rest_eeg.edf',
        data = edfRecordingFixture(),
        tar = tarFixture(tarRecord(name, data));
      for (const [filename, bytes, format] of [
        ['recording.zip', zipFixture([{ name, bytes: data, method: 8 }]), undefined],
        ['recording.tar', tar, 'tar'],
        ['recording.tgz', gzipSync(tar), 'tar'],
      ] as const) {
        const file = join(folder, filename);
        await writeFile(file, bytes);
        const stat = await lstat(file);
        const uri = archiveResourceUri({
          sourceUri: vscode.Uri.file(file).toString(),
          memberPath: name,
          memberIndex: 0,
          format,
          revision: { size: stat.size, modifiedAt: stat.mtimeMs },
        });
        const panel = await defaultManager.open(vscode.Uri.parse(uri), undefined, filename);
        const value = await state(panel, (s) => s.traceCount === 2 && !s.busy);
        assert.equal((value.firstTrace as RecordingTrace).minimum, -100);
        panel.dispose();
      }
      const dir = join(folder, 'squash');
      await mkdir(dir);
      await writeFile(join(dir, 'recording.sqfs'), squashfsFile(name, data, { gzip: true }));
      const source = new LogicalDirectorySource(),
        [entry] = await source.children(
          await source.root(vscode.Uri.file(dir).toString()),
          new AbortController().signal,
        );
      const panel = await defaultManager.open(
        vscode.Uri.parse(entryArchiveUri(entry)),
        undefined,
        'squash',
      );
      await state(panel, (s) => s.traceCount === 2 && !s.busy);
      panel.dispose();
      const discontinuous = Buffer.from(data);
      discontinuous.write('EDF+D', 192);
      const file = join(folder, 'gaps.edf');
      await writeFile(file, discontinuous);
      const gaps = await manager.open(vscode.Uri.file(file), 'gaps');
      assert.match(String((await state(gaps, (s) => !!s.error)).error), /gap timing/);
      gaps.dispose();
    } finally {
      defaultManager.dispose();
      manager.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });
});
