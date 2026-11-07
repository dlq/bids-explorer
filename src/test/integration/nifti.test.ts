import { assertHostMessages } from './assertHostMessages';
import { extensionId } from '../extensionId';
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
    await vscode.extensions.getExtension(extensionId)!.activate();
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
        const repeated = await Promise.all([
          vscode.commands.executeCommand('bidsExplorer.openFile', entry),
          vscode.commands.executeCommand('bidsExplorer.openFile', entry),
        ]);
        assert.ok(
          repeated.every((value) => value === panel),
          'Repeated opens must reveal the same viewer without restarting its image request',
        );
        const treeIcon = provider.getTreeItem(entry).iconPath;
        assert.ok(treeIcon && typeof treeIcon === 'object' && 'light' in treeIcon);
        assert.match(treeIcon.light.path, /imaging-light\.svg$/);
        assert.deepEqual(panel.iconPath, treeIcon);
        let report: {
          status?: string;
          previewFrames?: number;
          loadedFrames?: number;
          position?: string;
          navigationEnabled?: boolean;
          edgePadding?: Record<string, number>;
          blackPadding?: Record<string, number>;
          renderedPanels?: number[];
          information?: { label: string; value: string }[];
          display?: {
            layout: string;
            colormap: string;
            minimum: number;
            maximum: number;
            crosshair: boolean;
            frame: number;
          };
        } = {};
        const listener = panel.webview.onDidReceiveMessage((state: typeof report) => {
          report = state;
        });
        try {
          await assertHostMessages(panel.webview, 'inspect');
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
          assert.equal(report.navigationEnabled, true);
          assert.equal(report.display?.layout, 'quad');
          assert.deepEqual(
            [...report.renderedPanels!].sort(),
            [0, 1, 2, 4],
            'Default view must contain axial, coronal, sagittal and 3D panels',
          );
          assert.match(report.position ?? '', /Voxel position X/);
          assert.equal(
            report.information?.find((row) => row.label === 'Dimensions')?.value,
            '2 × 2 × 2 voxels',
          );
          assert.equal(
            report.information?.find((row) => row.label === 'Voxel spacing')?.value,
            '1 × 1 × 1 mm',
          );
          assert.doesNotMatch(panel.webview.html, /<label>Frame/);
          const originalWindow = [report.display.minimum, report.display.maximum];
          for (const control of [
            { action: 'layout', value: 'axial' },
            { action: 'colormap', value: 'viridis' },
            { action: 'window', value: [10, 90] },
            { action: 'frame', value: 2 },
            { action: 'crosshair', value: false },
          ])
            await panel.webview.postMessage({ type: 'imageControl', control });
          const controlsDeadline = Date.now() + 5000;
          while (
            report.display?.frame !== 2 ||
            report.display.colormap !== 'viridis' ||
            String(report.display.layout) !== 'axial' ||
            report.display.minimum !== 10 ||
            report.display.maximum !== 90 ||
            report.display.crosshair !== false
          ) {
            assert.ok(
              Date.now() < controlsDeadline,
              `Image controls did not settle: ${JSON.stringify(report.display)}`,
            );
            await panel.webview.postMessage('inspect');
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          assert.equal(report.display.layout, 'axial');
          assert.equal(report.display.minimum, 10);
          assert.equal(report.display.maximum, 90);
          assert.equal(report.display.crosshair, false);
          for (const control of [
            { action: 'window', value: [100, 1] },
            { action: 'frame', value: 999 },
            { action: 'colormap', value: 'https://example.invalid' },
          ])
            await panel.webview.postMessage({ type: 'imageControl', control });
          await panel.webview.postMessage('inspect');
          await new Promise((resolve) => setTimeout(resolve, 50));
          assert.equal(report.display.minimum, 10);
          assert.equal(report.display.frame, 2);
          assert.equal(report.display.colormap, 'viridis');
          await panel.webview.postMessage({ type: 'imageControl', control: { action: 'reset' } });
          while (Number(report.display.frame) !== 1 || String(report.display.layout) !== 'quad') {
            assert.ok(Date.now() < controlsDeadline);
            await panel.webview.postMessage('inspect');
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          assert.deepEqual([report.display.minimum, report.display.maximum], originalWindow);
          assert.deepEqual([...report.renderedPanels!].sort(), [0, 1, 2, 4]);
          await panel.webview.postMessage({
            type: 'imageControl',
            control: { action: 'layout', value: 'multiplanar' },
          });
          while (String(report.display.layout) !== 'multiplanar') {
            assert.ok(Date.now() < controlsDeadline);
            await panel.webview.postMessage('inspect');
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          assert.deepEqual(
            [...report.renderedPanels!].sort(),
            [0, 1, 2],
            'Three planes must exclude 3D',
          );
          while (!report.edgePadding) {
            assert.ok(Date.now() < controlsDeadline);
            await panel.webview.postMessage('inspect');
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          for (const padding of Object.values(report.edgePadding))
            assert.ok(
              Math.abs(padding - 8) < 1,
              `Visible edge gap should be 8 CSS pixels, got ${padding}`,
            );
          for (const padding of Object.values(report.blackPadding!))
            assert.ok(
              Math.abs(padding - 8) < 1,
              `Black inset should be 8 CSS pixels, got ${padding}`,
            );
          const previousPosition = report.position;
          await panel.webview.postMessage({
            type: 'imageControl',
            control: { action: 'move', value: { axis: 'x', step: -1 } },
          });
          const movementDeadline = Date.now() + 5000;
          while (report.position === previousPosition) {
            assert.ok(
              Date.now() < movementDeadline,
              'Image position must change without a canvas pointer event',
            );
            await panel.webview.postMessage('inspect');
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
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

suite('Empty NIfTI placeholders', () => {
  test('shows an immediate explanation without loading NiiVue or fetching empty image bytes; repeat opens reuse the panel', async () => {
    await vscode.extensions.getExtension(extensionId)!.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-empty-nifti-'));
    const provider = new DatasetTreeProvider(new DatasetBrowser(new LocalDirectorySource()));
    try {
      for (const suffix of ['nii', 'nii.gz'])
        await writeFile(join(folder, `sub-01_T1w.${suffix}`), '');
      const root = provider.browser.register(
        await provider.browser.source.root(vscode.Uri.file(folder).toString()),
      );
      const rows = await provider.getChildren(provider.element(root));
      for (const row of rows) {
        const [first, second] = await Promise.all([
          vscode.commands.executeCommand<vscode.WebviewPanel>('bidsExplorer.openFile', row),
          vscode.commands.executeCommand<vscode.WebviewPanel>('bidsExplorer.openFile', row),
        ]);
        assert.ok(first);
        assert.equal(first, second);
        assert.match(first.webview.html, /This file is empty \(0 bytes\)/);
        assert.doesNotMatch(first.webview.html, /<canvas|<script|Loading image/);
        first.dispose();
        const reopened = await vscode.commands.executeCommand<vscode.WebviewPanel>(
          'bidsExplorer.openFile',
          row,
        );
        assert.ok(reopened);
        assert.notEqual(reopened, first);
        reopened.dispose();
      }
    } finally {
      provider.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });
});
