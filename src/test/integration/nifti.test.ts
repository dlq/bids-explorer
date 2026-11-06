import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as vscode from 'vscode';
import { DatasetBrowser } from '../../core/browser';
import { LocalDirectorySource } from '../../sources/localDirectory';
import { DatasetTreeProvider } from '../../ui/datasetTreeProvider';
import { niftiFixture } from '../niftiFixture';

suite('Progressive NIfTI viewer', () => {
  test('renders the first and full volume of loose NIfTI and gzip images', async function () {
    this.timeout(60000);
    await vscode.extensions.getExtension('bids-explorer-dev.bids-explorer')!.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-nifti-host-'));
    const provider = new DatasetTreeProvider(new DatasetBrowser(new LocalDirectorySource()));
    const first = gunzipSync(niftiFixture());
    first.writeInt16LE(4, 40);
    first.writeInt16LE(2, 48);
    const image = Buffer.concat([first, Buffer.alloc(8, 123)]);
    try {
      for (const [suffix, bytes] of [
        ['nii', image],
        ['nii.gz', gzipSync(image)],
      ] as const) {
        await writeFile(join(folder, `sub-01_task-test_bold.${suffix}`), bytes);
      }
      const root = provider.browser.register(
        await provider.browser.source.root(vscode.Uri.file(folder).toString()),
      );
      const entries = await provider.getChildren(provider.element(root));
      assert.equal(entries.length, 2);
      for (const entry of entries) {
        const panel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
          'bidsExplorer.openFile',
          entry,
        );
        assert.ok(panel);
        const treeIcon = provider.getTreeItem(entry).iconPath;
        assert.ok(treeIcon && typeof treeIcon === 'object' && 'light' in treeIcon);
        assert.match(treeIcon.light.path, /imaging-light\.svg$/);
        assert.deepEqual(panel.iconPath, treeIcon);
        let report: { status?: string; previewFrames?: number; loadedFrames?: number } = {};
        const listener = panel.webview.onDidReceiveMessage((state: typeof report) => {
          report = state;
        });
        try {
          const deadline = Date.now() + 20000;
          while (!report.loadedFrames && !report.status?.startsWith('Unable')) {
            assert.ok(
              Date.now() < deadline,
              `Viewer timed out: ${report.status ?? 'no webview reply'}`,
            );
            await panel.webview.postMessage('inspect');
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          assert.equal(report.loadedFrames, 2, report.status);
          assert.equal(report.previewFrames, 2);
        } finally {
          listener.dispose();
          panel.dispose();
        }
      }
    } finally {
      provider.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });
});
