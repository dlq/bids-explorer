import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, lstat, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import * as vscode from 'vscode';
import { extensionId } from '../extensionId';
import { edfFixture } from '../edfFixture';
import { zipFixture } from '../zipFixture';
import { tarFixture, tarRecord } from '../tarFixture';
import { squashfsFile } from '../squashfsFixture';
import { archiveResourceUri, entryArchiveUri } from '../../core/archiveUri';
import { DatasetBrowser } from '../../core/browser';
import { LogicalDirectorySource } from '../../sources/logicalDirectory';
import { DatasetTreeProvider } from '../../ui/datasetTreeProvider';
import { RecordingPreviewManager, isEdfRecording } from '../../ui/recordingPreview';
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
      assert.ok(Date.now() < deadline, 'Expected a rendered recording summary');
      await panel.webview.postMessage({ type: 'inspect' });
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return result;
  } finally {
    listener.dispose();
  }
}

suite('EDF recording summaries', () => {
  test('default EDF opening is header-only, source-backed and accessible through the packaged client', async function () {
    this.timeout(30000);
    const extension = vscode.extensions.getExtension(extensionId)!;
    await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-recording-ui-'));
    const provider = new DatasetTreeProvider(new DatasetBrowser(new LogicalDirectorySource()));
    const manager = new RecordingPreviewManager(extension.extensionUri);
    let defaultPanel: vscode.WebviewPanel | undefined;
    try {
      const file = join(folder, 'sub-01/eeg/sub-01_task-rest_eeg.edf');
      await mkdir(join(folder, 'sub-01/eeg'), { recursive: true });
      await writeFile(
        join(folder, 'dataset_description.json'),
        '{"Name":"Synthetic EEG","BIDSVersion":"1.11.2"}',
      );
      const original = Buffer.concat([edfFixture('EDF+D'), Buffer.alloc(4096, 99)]);
      await writeFile(file, original);
      const uri = vscode.Uri.file(file);
      const root = await provider.browser.source.root(vscode.Uri.file(folder).toString());
      const entry = provider.element({
        datasetUri: root.uri,
        uri: uri.toString(),
        relativePath: 'sub-01/eeg/sub-01_task-rest_eeg.edf',
        name: 'sub-01_task-rest_eeg.edf',
        kind: 'file',
      });
      assert.equal(provider.getTreeItem(entry).command?.command, 'bidsExplorer.openFile');
      defaultPanel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        entry,
      );
      assert.ok(defaultPanel);
      const initial = await state(defaultPanel);
      assert.equal(initial.title, 'Recording summary');
      assert.match(String(initial.firstText), /Signal channels: 2/);
      assert.match(String(initial.firstText), /not elapsed session time/);
      assert.doesNotMatch(String(initial.firstText), /PRIVATE/);
      assert.equal(initial.sourceCount, 0, 'Binary EDF is not offered as original text');
      defaultPanel.dispose();
      defaultPanel = undefined;

      let inspected = false;
      const panel = await manager.open(uri, () => {
        inspected = true;
        return Promise.resolve();
      });
      const nonce = /nonce="([a-f0-9]+)"/.exec(panel.webview.html)![1];
      panel.webview.html = panel.webview.html.replace(
        '</body>',
        `<script nonce="${nonce}">window.addEventListener('message',event=>{if(event.data?.type!=='testControl')return;const node=document.getElementById(event.data.id);if(node instanceof HTMLInputElement){node.value=event.data.value;node.dispatchEvent(new Event('input'));}else node?.click();});</script></body>`,
      );
      await assertHostMessages(panel.webview);
      await state(panel);
      assert.equal(await manager.open(uri), panel);
      const otherContext = await manager.open(uri, undefined, 'another-logical-placement');
      assert.notEqual(
        otherContext,
        panel,
        'Physical reuse cannot borrow another logical metadata context',
      );
      otherContext.dispose();
      panel.reveal();
      await panel.webview.postMessage({ type: 'testControl', id: 'filter', value: 'Fz' });
      const channel = await state(panel, (value) => value.firstTitle === '1. Fz');
      assert.match(String(channel.firstText), /200 Hz/);
      assert.match(String(channel.firstText), /uV/);
      await panel.webview.postMessage({ type: 'testControl', id: 'action-metadata' });
      const deadline = Date.now() + 5000;
      while (!inspected) {
        assert.ok(Date.now() < deadline);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await writeFile(file, 'malformed');
      await panel.webview.postMessage({ type: 'testControl', id: 'reload' });
      const failed = await state(panel, (value) =>
        String(value.error).includes('previous snapshot'),
      );
      assert.match(
        String(failed.firstText),
        /200 Hz/,
        'Failed reload preserves the previous summary',
      );
      await writeFile(file, original);
      assert.deepEqual(await readFile(file), original);
      assert.equal(isEdfRecording(vscode.Uri.parse('https://example.com/run.edf')), false);
      await assert.rejects(manager.open(vscode.Uri.file(join(folder, 'other.txt'))), /EDF/);
      const pendingManager = new RecordingPreviewManager(extension.extensionUri);
      const pending = pendingManager.open(uri);
      pendingManager.cancelPending();
      await assert.rejects(pending, /abort/i);
      pendingManager.dispose();
    } finally {
      defaultPanel?.dispose();
      manager.dispose();
      provider.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('archive summaries render the same technical channels without binary text fallback', async function () {
    this.timeout(30000);
    const extension = vscode.extensions.getExtension(extensionId)!;
    await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-recording-archives-ui-'));
    const manager = new RecordingPreviewManager(extension.extensionUri);
    try {
      const name = 'task-rest_eeg.edf';
      const data = Buffer.concat([edfFixture('EDF+C'), Buffer.alloc(4096)]);
      const tar = tarFixture(tarRecord(name, data));
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
        const panel = await manager.open(vscode.Uri.parse(uri));
        const rendered = await state(panel);
        assert.match(String(rendered.firstText), /Signal channels: 2/);
        panel.dispose();
      }
      const squashFolder = join(folder, 'squash');
      await mkdir(squashFolder);
      await writeFile(
        join(squashFolder, 'recording.sqfs'),
        squashfsFile(name, data, { gzip: true }),
      );
      const source = new LogicalDirectorySource();
      const [entry] = await source.children(
        await source.root(vscode.Uri.file(squashFolder).toString()),
        new AbortController().signal,
      );
      const panel = await manager.open(vscode.Uri.parse(entryArchiveUri(entry)));
      assert.match(String((await state(panel)).firstText), /Signal channels: 2/);
      panel.dispose();
    } finally {
      manager.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });
});
