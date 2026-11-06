import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { HistoryPreviewManager } from '../../ui/historyPreview';
import { DocumentPreviewManager } from '../../ui/documentPreview';
import { InheritanceInspector } from '../../ui/inheritanceInspector';
import { DatasetTreeProvider } from '../../ui/datasetTreeProvider';
import { DatasetBrowser } from '../../core/browser';
import { LocalDirectorySource } from '../../sources/localDirectory';
import { GradientPreviewManager } from '../../ui/gradientPreview';

function controls(panel: vscode.WebviewPanel): void {
  const nonce = /nonce="([a-f0-9]+)"/.exec(panel.webview.html)![1];
  panel.webview.html = panel.webview.html.replace(
    '</body>',
    `<script nonce="${nonce}">window.addEventListener('message',event=>{if(event.data?.type!=='testControl')return;const node=event.data.source?document.querySelector('#sources button'):document.getElementById(event.data.id);if(node instanceof HTMLInputElement){node.value=event.data.value;node.dispatchEvent(new Event('input'));}else node?.click();});</script></body>`,
  );
}
async function state(
  panel: vscode.WebviewPanel,
  matches: (value: Record<string, unknown>) => boolean = () => true,
): Promise<Record<string, unknown>> {
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
      assert.ok(Date.now() < deadline, 'Expected packaged document preview');
      await panel.webview.postMessage({ type: 'inspect' });
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
    }
    return result;
  } finally {
    listener.dispose();
  }
}
async function text(uri: vscode.Uri): Promise<void> {
  const deadline = Date.now() + 5000;
  while (vscode.window.activeTextEditor?.document.uri.toString() !== uri.toString()) {
    assert.ok(Date.now() < deadline);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
}
suite('History and metadata document previews', () => {
  test('history displays recorded headers/unparsed text safely, pages/filters and retains snapshots on failed reload', async function () {
    this.timeout(30000);
    const extension = vscode.extensions.getExtension('bids-explorer-dev.bids-explorer')!;
    await extension.activate();
    const manager = new HistoryPreviewManager(extension.extensionUri);
    const folder = await mkdtemp(join(tmpdir(), 'bids-history-ui-'));
    const uri = vscode.Uri.file(join(folder, 'CHANGES'));
    try {
      const original =
        'Unstructured <img> history\n' +
        Array.from({ length: 25 }, (_, i) => `${i}.0 2026-99-42\n  - recorded change ${i}\n`).join(
          '',
        );
      await writeFile(uri.fsPath, original);
      const provider = new DatasetTreeProvider(new DatasetBrowser(new LocalDirectorySource()));
      const entry = provider.element({
        datasetUri: vscode.Uri.file(folder).toString(),
        uri: uri.toString(),
        relativePath: 'CHANGES',
        name: 'CHANGES',
        kind: 'file',
      });
      assert.equal(provider.getTreeItem(entry).contextValue, 'history');
      const clicked = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        entry,
      );
      assert.ok(clicked);
      await state(clicked);
      clicked.dispose();
      provider.dispose();
      const panel = await manager.open(uri);
      controls(panel);
      const initial = await state(panel);
      assert.equal(initial.recordCount, 26);
      assert.equal(initial.firstTitle, 'Unparsed source text');
      assert.match(String(initial.firstText), /<img>/);
      assert.equal(await manager.open(uri), panel);
      assert.ok(!panel.webview.html.includes('Unstructured <img>'));
      await panel.webview.postMessage({ type: 'testControl', id: 'next' });
      assert.equal((await state(panel, (s) => s.page === 1)).page, 1);
      await panel.webview.postMessage({ type: 'testControl', id: 'filter', value: '24.0' });
      const release = await state(panel, (s) => s.firstTitle === '24.0 2026-99-42');
      assert.equal(release.page, 0);
      assert.doesNotMatch(String(release.firstText), /^24\.0 2026-99-42/);
      await panel.webview.postMessage({ type: 'testControl', source: true });
      await text(uri);
      assert.equal(vscode.window.activeTextEditor?.document.getText(), original);
      panel.reveal();
      await state(panel);
      await writeFile(uri.fsPath, 'x'.repeat(1024 * 1024 + 1));
      await panel.webview.postMessage({ type: 'testControl', id: 'reload' });
      assert.equal(
        (await state(panel, (s) => String(s.error).includes('previous snapshot'))).recordCount,
        26,
      );
      assert.equal(await vscode.commands.executeCommand('bidsExplorer.openFile', entry), undefined);
      await text(uri);
      await writeFile(uri.fsPath, original);
      assert.equal(await readFile(uri.fsPath, 'utf8'), original);
      await assert.rejects(manager.open(vscode.Uri.file(join(folder, 'README'))), /CHANGES/);
      manager.dispose();
      await assert.rejects(manager.open(uri), /closed/);
      const generic = new DocumentPreviewManager(extension.extensionUri);
      const pending = generic.open('cancel', () =>
        Promise.resolve({
          title: 'Test',
          subtitle: '',
          notice: '',
          records: [],
          sources: [],
          actions: [],
        }),
      );
      generic.cancelPending();
      await assert.rejects(pending, /abort/i);
      generic.dispose();
      const fallback = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.previewHistory',
        uri,
      );
      assert.ok(fallback);
      fallback.dispose();
    } finally {
      manager.dispose();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await rm(folder, { recursive: true, force: true });
    }
  });
  test('inspector gradient action opens independently inherited sources and refuses newly ambiguous matches', async function () {
    this.timeout(30000);
    const extension = vscode.extensions.getExtension('bids-explorer-dev.bids-explorer')!;
    const gradients = new GradientPreviewManager(extension.extensionUri),
      inspector = new InheritanceInspector(extension.extensionUri, gradients);
    const folder = await mkdtemp(join(tmpdir(), 'bids-inherited-gradient-ui-'));
    let gradientPanel: vscode.WebviewPanel | undefined;
    const open = gradients.openResolved.bind(gradients);
    gradients.openResolved = async (entry) => {
      gradientPanel = await open(entry);
      return gradientPanel;
    };
    try {
      await mkdir(join(folder, 'sub-01/dwi'), { recursive: true });
      const image = join(folder, 'sub-01/dwi/sub-01_dwi.nii');
      await writeFile(image, 'unchanged synthetic MRI');
      await writeFile(join(folder, 'dwi.bval'), '0 1000');
      await writeFile(join(folder, 'dwi.bvec'), '0 1\n0 0\n0 0');
      await writeFile(join(folder, 'sub-01/dwi/sub-01_dwi.bval'), '0 2000');
      const entry = {
        datasetUri: vscode.Uri.file(folder).toString(),
        uri: vscode.Uri.file(image).toString(),
        relativePath: 'sub-01/dwi/sub-01_dwi.nii',
        name: 'sub-01_dwi.nii',
        kind: 'file' as const,
      };
      const panel = await inspector.open(entry);
      assert.ok(panel);
      controls(panel);
      assert.ok(((await state(panel)).actions as string[]).includes('gradients'));
      await writeFile(join(folder, 'sub-01/dwi/dwi.bval'), '0 1000');
      await panel.webview.postMessage({ type: 'testControl', id: 'action-gradients' });
      await state(panel, (s) => String(s.error).includes('unambiguously'));
      assert.equal(gradientPanel, undefined);
      await rm(join(folder, 'sub-01/dwi/dwi.bval'));
      await panel.webview.postMessage({ type: 'testControl', id: 'action-gradients' });
      const deadline = Date.now() + 10000;
      while (!gradientPanel) {
        assert.ok(Date.now() < deadline);
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
      assert.equal((await state(gradientPanel)).volumeCount, 2);
      assert.equal(await readFile(image, 'utf8'), 'unchanged synthetic MRI');
    } finally {
      inspector.dispose();
      gradients.dispose();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await rm(folder, { recursive: true, force: true });
    }
  });
});
