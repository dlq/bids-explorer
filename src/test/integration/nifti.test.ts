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
    first.writeFloatLE(10, 292); // Translate the image affine along X.
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
          coordinates?: { voxel: number[]; physical?: number[]; units?: string };
          voxelValue?: string;
          positionError?: string;
          navigationEnabled?: boolean;
          playing?: boolean;
          playbackRate?: number;
          edgePadding?: Record<string, number>;
          blackPadding?: Record<string, number>;
          renderedPanels?: number[];
          clipPlanes?: number[][];
          camera?: number[];
          signal?: { frames: number[]; values: (number | null)[]; x: number[]; axis: string };
          signalPosition?: number;
          slicePositions?: number[];
          lightbox?: { count: number; error?: string };
          information?: { label: string; value: string }[];
          display?: {
            layout: string;
            colormap: string;
            minimum: number;
            maximum: number;
            crosshair: boolean;
            frame: number;
            orientation?: string;
          };
        } = {};
        let showedFirstFrame = false;
        const listener = panel.webview.onDidReceiveMessage((state: typeof report) => {
          if (state.status?.startsWith('Showing frame 1 of 2.') && !state.loadedFrames)
            showedFirstFrame = true;
          // Routine image updates omit inspection-only fields such as camera and clip planes.
          report = { ...report, ...state, signal: state.signal ?? report.signal };
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
          assert.ok(showedFirstFrame, 'The first frame must render before the full image');
          assert.doesNotMatch(panel.webview.html, /data-source=|connect-src/);
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
          const setControl = async (
            control: { action: string; value?: unknown },
            done: () => boolean,
          ) => {
            await panel.webview.postMessage({ type: 'imageControl', control });
            const deadline = Date.now() + 5000;
            while (!done()) {
              assert.ok(Date.now() < deadline, `Control did not settle: ${control.action}`);
              await panel.webview.postMessage('inspect');
              await new Promise((resolve) => setTimeout(resolve, 30));
            }
          };
          await setControl(
            { action: 'position', value: { space: 'voxel', coordinates: [0, 0, 0] } },
            () => report.coordinates?.voxel.join() === '0,0,0',
          );
          assert.deepEqual(report.coordinates?.physical, [10, 0, 0]);
          assert.equal(report.coordinates.units, 'mm');
          assert.equal(report.voxelValue, '0');
          await setControl(
            { action: 'position', value: { space: 'physical', coordinates: [11, 0, 0] } },
            () => report.coordinates?.voxel.join() === '1,0,0',
          );
          assert.equal(report.voxelValue, '20');
          const signalDeadline = Date.now() + 5000;
          while (report.signal?.values.join() !== '20,123') {
            assert.ok(Date.now() < signalDeadline, JSON.stringify(report.signal));
            await panel.webview.postMessage('inspect');
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          assert.deepEqual(report.signal.frames, [1, 2]);
          assert.equal(report.signal.axis, 'Volume');
          await setControl(
            { action: 'signalTiming', value: { starts: [0, 3.5], units: 'Bq/mL' } },
            () => report.signal?.axis === 'Time (s) · JSON frame times',
          );
          assert.deepEqual(report.signal.x, [0, 3.5]);
          await setControl({ action: 'frame', value: 2 }, () => report.signalPosition === 3.5);
          await setControl({ action: 'frame', value: 1 }, () => report.signalPosition === 0);

          await setControl(
            { action: 'position', value: { space: 'voxel', coordinates: [2, 0, 0] } },
            () => /outside/.test(report.positionError ?? ''),
          );
          assert.deepEqual(report.coordinates?.voxel, [1, 0, 0]);
          await setControl(
            { action: 'orientation', value: 'radiological' },
            () => report.display?.orientation === 'radiological',
          );
          assert.deepEqual(report.coordinates?.voxel, [1, 0, 0]);
          await setControl(
            { action: 'volumeMode', value: 'cutaway' },
            () => report.clipPlanes?.length === 3,
          );
          assert.deepEqual(report.clipPlanes, [
            [-0.25, 270, 0],
            [0.25, 0, 0],
            [0.25, 0, -90],
          ]);
          await setControl(
            { action: 'cutawayCorner', value: ['left', 'posterior', 'inferior'] },
            () => report.clipPlanes?.[0][1] === 90,
          );
          assert.deepEqual(report.clipPlanes, [
            [0.25, 90, 0],
            [-0.25, 180, 0],
            [-0.25, 0, 90],
          ]);
          await setControl(
            { action: 'position', value: { space: 'voxel', coordinates: [0, 1, 1] } },
            () => report.clipPlanes?.[0][0] === -0.25,
          );
          assert.deepEqual(report.clipPlanes, [
            [-0.25, 90, 0],
            [0.25, 180, 0],
            [0.25, 0, 90],
          ]);
          await setControl(
            { action: 'layout', value: 'volume' },
            () => report.renderedPanels?.join() === '4',
          );
          await setControl(
            { action: 'volumeMode', value: 'full' },
            () => report.clipPlanes?.length === 0,
          );
          await setControl(
            { action: 'volumeMode', value: 'cutaway' },
            () => report.clipPlanes?.length === 3,
          );
          await setControl(
            { action: 'layout', value: 'lightbox' },
            () =>
              report.renderedPanels?.join() === '0,0' &&
              report.slicePositions?.join() === '0.25,0.75',
          );
          await setControl(
            { action: 'lightbox', value: { plane: 'sagittal' } },
            () => report.renderedPanels?.join() === '2,2',
          );
          await setControl(
            { action: 'lightbox', value: { plane: 'sagittal', first: 0, last: 1, step: 2 } },
            () => report.renderedPanels?.join() === '2' && report.slicePositions?.join() === '0.25',
          );
          await setControl(
            { action: 'lightbox', value: { plane: 'sagittal', first: 0, last: 2, step: 1 } },
            () => !!report.lightbox?.error,
          );
          assert.equal(report.lightbox?.count, 1);
          assert.deepEqual(report.renderedPanels, [2]);
          let png: Buffer | undefined;
          const capture = panel.webview.onDidReceiveMessage(
            (message: { type?: string; request?: string; bytes?: ArrayBuffer }) => {
              if (
                message.type === 'screenshotCaptured' &&
                message.request === 'test-lightbox' &&
                message.bytes instanceof ArrayBuffer
              )
                png = Buffer.from(message.bytes);
            },
          );
          try {
            await panel.webview.postMessage({
              type: 'captureScreenshot',
              request: 'test-lightbox',
              imageName: 'Synthetic screenshot',
            });
            const deadline = Date.now() + 5000;
            while (!png) {
              assert.ok(
                Date.now() < deadline,
                'Expected a PNG capture from the displayed Lightbox',
              );
              await new Promise((resolve) => setTimeout(resolve, 30));
            }
            assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
            assert.equal(png.toString('ascii', 12, 16), 'IHDR');
            assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(16) <= 2048);
            assert.ok(png.readUInt32BE(20) > 56 && png.readUInt32BE(20) <= 2104);
          } finally {
            capture.dispose();
          }
          await setControl(
            { action: 'layout', value: 'quad' },
            () => report.renderedPanels?.length === 4,
          );
          assert.equal(report.playbackRate, 5);
          await setControl({ action: 'playbackRate', value: 2 }, () => report.playbackRate === 2);
          await panel.webview.postMessage({
            type: 'imageControl',
            control: { action: 'playbackRate', value: 0 },
          });
          await panel.webview.postMessage('inspect');
          await new Promise((resolve) => setTimeout(resolve, 40));
          assert.equal(report.playbackRate, 2);
          await setControl({ action: 'play' }, () => report.playing === true);
          await setControl(
            { action: 'playbackRate', value: 1 },
            () => report.playing === true && report.playbackRate === 1,
          );
          await setControl({ action: 'pause' }, () => report.playing === false);
          await setControl({ action: 'playbackRate', value: 2 }, () => report.playbackRate === 2);
          const pausedFrame = report.display.frame;
          await new Promise((resolve) => setTimeout(resolve, 650));
          await panel.webview.postMessage('inspect');
          await new Promise((resolve) => setTimeout(resolve, 40));
          assert.equal(report.display.frame, pausedFrame, 'Pause must stop volume changes');
          await setControl({ action: 'play' }, () => report.playing === true);
          await setControl(
            { action: 'frame', value: 1 },
            () => report.playing === false && report.display?.frame === 1,
          );
          await setControl({ action: 'play' }, () => report.playing === true);
          const playbackDeadline = Date.now() + 5000;
          while (report.playing || report.display.frame !== 2) {
            assert.ok(Date.now() < playbackDeadline, 'Playback must stop at the last volume');
            await panel.webview.postMessage('inspect');
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          await setControl(
            { action: 'play' },
            () => report.playing === true && report.display?.frame === 1,
          );
          await setControl({ action: 'pause' }, () => report.playing === false);
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
          assert.equal(report.voxelValue, '123');
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
          await setControl(
            { action: 'reset' },
            () =>
              report.display?.frame === 1 &&
              report.display.layout === 'quad' &&
              report.clipPlanes?.length === 3 &&
              report.camera?.join() === '225,35',
          );
          assert.equal(report.display.orientation, 'neurological');
          await panel.webview.postMessage('inspect');
          await new Promise((resolve) => setTimeout(resolve, 50));
          assert.equal(report.clipPlanes?.length, 3);
          assert.deepEqual(report.camera, [225, 35]);
          assert.deepEqual([report.display.minimum, report.display.maximum], originalWindow);
          assert.deepEqual([...report.renderedPanels].sort(), [0, 1, 2, 4]);
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
            [...report.renderedPanels].sort(),
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
          await setControl({ action: 'frame', value: 1 }, () => report.display?.frame === 1);
          await setControl({ action: 'play' }, () => report.playing === true);
          await setControl({ action: 'cancel' }, () => report.playing === false);
          const cancelledFrame = report.display.frame;
          await new Promise((resolve) => setTimeout(resolve, 650));
          await panel.webview.postMessage('inspect');
          await new Promise((resolve) => setTimeout(resolve, 40));
          assert.equal(report.display.frame, cancelledFrame, 'Cancellation must clear playback');
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
