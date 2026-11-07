import { assertHostMessages } from './assertHostMessages';
import { extensionId } from '../extensionId';
import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { MetadataPreviewManager, isDatasetDescription } from '../../ui/metadataPreview';
import { DatasetTreeProvider } from '../../ui/datasetTreeProvider';
import { DatasetBrowser } from '../../core/browser';
import { LocalDirectorySource } from '../../sources/localDirectory';

async function rendered(
  panel: vscode.WebviewPanel,
  count: number,
): Promise<Record<string, unknown>> {
  let result: Record<string, unknown> | undefined;
  const listener = panel.webview.onDidReceiveMessage((message: unknown) => {
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'rendered' &&
      'fieldCount' in message &&
      message.fieldCount === count
    )
      result = message;
  });
  try {
    const deadline = Date.now() + 15000;
    while (!result) {
      assert.ok(
        Date.now() < deadline,
        'Metadata webview should load its packaged module and render recorded fields',
      );
      await panel.webview.postMessage({ type: 'inspect' });
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    return result;
  } finally {
    listener.dispose();
  }
}

suite('Recorded dataset metadata', () => {
  test('tree clicks default to duplicate-aware metadata previews, with explicit preview and raw JSON access', async function () {
    this.timeout(30000);
    await vscode.extensions.getExtension(extensionId)!.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-metadata-host-'));
    const provider = new DatasetTreeProvider(new DatasetBrowser(new LocalDirectorySource()));
    let panel: vscode.WebviewPanel | undefined;
    try {
      const uri = vscode.Uri.file(join(folder, 'dataset_description.json'));
      const text =
        '{"Name":"<img src=x onerror=alert(1)>","Name":"duplicate","BIDSVersion":"1.10.0","Large":9007199254740993,' +
        Array.from({ length: 22 }, (_, i) => `"custom${i}":${i}`).join(',') +
        '}';
      await writeFile(uri.fsPath, text);
      const before = await readFile(uri.fsPath);
      const root = provider.browser.register(
        await provider.browser.source.root(vscode.Uri.file(folder).toString()),
      );
      const entry = (await provider.getChildren(provider.element(root)))[0];
      assert.equal(provider.getTreeItem(entry).contextValue, 'metadata');
      assert.equal(isDatasetDescription(uri), true);
      assert.equal(
        isDatasetDescription(vscode.Uri.parse('https://example.org/dataset_description.json')),
        false,
      );
      panel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        entry,
      );
      assert.ok(panel);
      assert.equal(
        await vscode.commands.executeCommand('bidsExplorer.previewMetadata', entry),
        panel,
      );
      await assertHostMessages(panel.webview);
      const state = await rendered(panel, 26);
      assert.equal(state.sourceUri, uri.toString());
      assert.equal(state.duplicateCount, 1);
      assert.equal(state.visibleCount, 20);
      assert.equal(state.firstKey, 'Name');
      assert.equal(
        await vscode.commands.executeCommand('bidsExplorer.previewMetadata', uri),
        panel,
      );
      assert.match(panel.webview.html, /default-src 'none'/);
      assert.match(panel.webview.html, /connect-src 'none'/);
      assert.ok(!panel.webview.html.includes('<img src=x'));
      assert.equal(panel.webview.options.localResourceRoots?.length, 2);
      assert.deepEqual(await readFile(uri.fsPath), before);
    } finally {
      panel?.dispose();
      provider.dispose();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('a descriptor that cannot be previewed opens as original JSON without changing bytes', async function () {
    this.timeout(20000);
    const folder = await mkdtemp(join(tmpdir(), 'bids-metadata-fallback-'));
    const provider = new DatasetTreeProvider(new DatasetBrowser(new LocalDirectorySource()));
    try {
      const uri = vscode.Uri.file(join(folder, 'dataset_description.json'));
      await writeFile(uri.fsPath, '{ invalid JSON }');
      const root = provider.browser.register(
        await provider.browser.source.root(vscode.Uri.file(folder).toString()),
      );
      const entry = (await provider.getChildren(provider.element(root)))[0];
      await vscode.commands.executeCommand('bidsExplorer.openFile', entry);
      assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), uri.toString());
      assert.equal(vscode.window.activeTextEditor.document.getText(), '{ invalid JSON }');
      assert.equal((await readFile(uri.fsPath)).toString(), '{ invalid JSON }');
    } finally {
      provider.dispose();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('physical raw/derivative descriptors keep separate panels; pending opens coalesce and failures are retryable', async function () {
    this.timeout(30000);
    const extension = vscode.extensions.getExtension(extensionId)!;
    const manager = new MetadataPreviewManager(extension.extensionUri);
    const folder = await mkdtemp(join(tmpdir(), 'bids-metadata-lifetime-'));
    try {
      const raw = vscode.Uri.file(join(folder, 'dataset_description.json'));
      await assert.rejects(manager.open(raw), /ENOENT/);
      await writeFile(raw.fsPath, 'not JSON');
      await assert.rejects(manager.open(raw), SyntaxError);
      await writeFile(raw.fsPath, '{"Name":"Raw"}');
      const first = manager.open(raw),
        second = manager.open(raw);
      assert.equal(first, second);
      const panel = await first;
      assert.equal((await rendered(panel, 1)).sourceUri, raw.toString());
      const path = join(folder, 'derivatives', 'demo');
      await mkdir(path, { recursive: true });
      const derivative = vscode.Uri.file(join(path, 'dataset_description.json'));
      await writeFile(
        derivative.fsPath,
        '{"Name":"Outputs","GeneratedBy":[{"Name":"demo","Version":"2"}]}',
      );
      const derivedPanel = await manager.open(derivative);
      assert.notEqual(derivedPanel, panel);
      assert.equal((await rendered(derivedPanel, 2)).sourceUri, derivative.toString());
      assert.equal(await manager.open(raw), panel);
      panel.dispose();
      const fresh = await manager.open(raw);
      assert.notEqual(fresh, panel);
      manager.dispose();
      await assert.rejects(manager.open(raw), /closed/);
    } finally {
      manager.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });
});
