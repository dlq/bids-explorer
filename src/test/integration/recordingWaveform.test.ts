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
    if(event.data.id==='pixels'){const c=document.querySelector('canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let blue=0;for(let i=0;i<d.length;i+=4)if(d[i+2]>150&&d[i+2]>d[i]*1.2&&d[i+3])blue++;testApi.postMessage({type:'pixels',blue});return;}
    const target=document.getElementById(event.data.id);
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
