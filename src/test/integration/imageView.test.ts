import { extensionId } from '../extensionId';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import * as vscode from 'vscode';
import type { ImageView } from '../../ui/imageView';
import { DatasetBrowser } from '../../core/browser';
import { LocalDirectorySource } from '../../sources/localDirectory';
import { DatasetTreeProvider, type EntryElement } from '../../ui/datasetTreeProvider';
import { niftiFixture } from '../niftiFixture';

suite('Native Image view', () => {
  test('renders source-backed metadata, controls the selected image and follows selection/disposal without losing focus', async function () {
    this.timeout(45000);
    const { imageView } = await vscode.extensions
      .getExtension<{ imageView: ImageView }>(extensionId)!
      .activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-imageview-'));
    const provider = new DatasetTreeProvider(new DatasetBrowser(new LocalDirectorySource()));
    const panels: vscode.WebviewPanel[] = [];
    try {
      const scaled = gunzipSync(niftiFixture());
      scaled.writeFloatLE(1.1234567, 112);
      await writeFile(join(folder, 'sub-01_task-test_bold.nii.gz'), gzipSync(scaled));
      await writeFile(join(folder, 'sub-02_T1w.nii.gz'), niftiFixture());
      await writeFile(
        join(folder, 'task-test_bold.json'),
        '{"RepetitionTime":2,"EchoTime":0.03,"TaskName":"<script>not executable</script>"}',
      );
      const root = provider.browser.register(
        await provider.browser.source.root(vscode.Uri.file(folder).toString()),
      );
      const rows = await provider.getChildren(provider.element(root));
      const first = rows.find(
        (row): row is EntryElement =>
          row.type === 'entry' && row.entry.name.endsWith('_bold.nii.gz'),
      )!;
      const second = rows.find(
        (row): row is EntryElement =>
          row.type === 'entry' && row.entry.name.endsWith('_T1w.nii.gz'),
      )!;
      panels.push(
        await vscode.commands.executeCommand<vscode.WebviewPanel>('bidsExplorer.openFile', first),
      );
      await vscode.commands.executeCommand('bidsExplorer.imageControls.focus');
      const viewDeadline = Date.now() + 10000;
      while (!(imageView as unknown as { view?: vscode.WebviewView }).view) {
        assert.ok(Date.now() < viewDeadline);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      const view = (imageView as unknown as { view?: vscode.WebviewView }).view;
      assert.ok(view);
      const nonce = /nonce="([a-f0-9]+)"/.exec(view.webview.html)![1];
      view.webview.html = view.webview.html.replace(
        '</body>',
        `<script nonce="${nonce}">const testApi=acquireVsCodeApi();window.acquireVsCodeApi=()=>testApi;let imageToken='';window.addEventListener('message',event=>{if(event.data?.type==='image')imageToken=event.data.image?.target??'';if(event.data?.type==='testToken')testApi.postMessage({type:'testToken',token:imageToken});if(event.data?.type==='testReplay')testApi.postMessage({type:'control',target:event.data.token,control:{action:'colormap',value:'hot'}});if(event.data?.type==='testAction'){const el=document.getElementById(event.data.id);if(event.data.value!==undefined){el.value=event.data.value;el.dispatchEvent(new Event('change'));}else el.click();}});</script></body>`,
      );
      let report: {
        text?: string;
        controlsEnabled?: boolean;
        volumeVisible?: boolean;
        positionExpanded?: boolean;
        sourceGroups?: number;
        metadataBeforeControls?: boolean;
        minimum?: string;
        maximum?: string;
      } = {};
      let imageToken = '';
      const listener = view.webview.onDidReceiveMessage(
        (message: { type: string; token?: string } & typeof report) => {
          if (message.type === 'rendered') report = message;
          if (message.type === 'testToken') imageToken = message.token ?? '';
        },
      );
      const wait = async (predicate: () => boolean) => {
        const deadline = Date.now() + 12000;
        while (!predicate()) {
          assert.ok(Date.now() < deadline, report.text ?? 'No image view reply');
          await view.webview.postMessage({ type: 'inspect' });
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
      };
      try {
        await wait(() => !!report.controlsEnabled && !!report.text?.includes('TR (s)'));
        await view.webview.postMessage({ type: 'testToken' });
        await wait(() => !!imageToken);
        const firstToken = imageToken;
        assert.match(report.text!, /Participant 01/);
        assert.match(report.text!, /2 × 2 × 2 voxels/);
        assert.match(report.text!, /TE \(ms\)/);
        assert.match(report.text!, /30/);
        assert.equal(report.volumeVisible, false);
        assert.equal(report.positionExpanded, false);
        assert.equal(report.sourceGroups, 1);
        assert.equal(report.metadataBeforeControls, true);
        assert.doesNotMatch(
          report.text!,
          /Cancel loading|Move crosshair by one voxel|Voxel position/,
        );
        assert.match(report.text!, /<script>not executable<\/script>/);
        let display: { layout?: string; minimum?: number; maximum?: number } | undefined;
        const imageListener = panels[0].webview.onDidReceiveMessage(
          (message: { display: typeof display }) => {
            display = message.display;
          },
        );
        try {
          await view.webview.postMessage({ type: 'testAction', id: 'layout', value: 'coronal' });
          await wait(() => display?.layout === 'coronal');
          const exactMaximum = display!.maximum;
          assert.notEqual(
            Number(report.maximum),
            exactMaximum,
            'The fixture must exercise display rounding',
          );
          display = undefined;
          await view.webview.postMessage({ type: 'testAction', id: 'window' });
          await wait(() => display?.maximum !== undefined);
          assert.equal(
            display!.maximum,
            exactMaximum,
            'Applying unedited, shortened limits must retain full precision',
          );
        } finally {
          imageListener.dispose();
        }
        panels.push(
          await vscode.commands.executeCommand<vscode.WebviewPanel>(
            'bidsExplorer.openFile',
            second,
          ),
        );
        await wait(
          () =>
            !!report.text?.includes('Participant 02') &&
            !!report.text.includes('No applicable JSON'),
        );
        assert.doesNotMatch(report.text!, /TR \(s\)|not executable/);
        let secondMap = '';
        const secondListener = panels[1].webview.onDidReceiveMessage(
          (message: { display?: { colormap: string } }) => {
            secondMap = message.display?.colormap ?? '';
          },
        );
        try {
          await view.webview.postMessage({ type: 'testReplay', token: firstToken });
          await panels[1].webview.postMessage('inspect');
          await wait(() => !!secondMap);
          assert.equal(
            secondMap,
            'gray',
            'A queued control for the previous image must not affect the newly selected image',
          );
        } finally {
          secondListener.dispose();
        }

        panels[0].reveal();
        await wait(() => !!report.text?.includes('Participant 01'));
        panels[0].dispose();
        panels[1].dispose();
        await wait(() => !!report.text?.includes('Open an image from BIDS'));
        assert.equal(report.controlsEnabled, false);
      } finally {
        listener.dispose();
      }
    } finally {
      for (const panel of panels) panel?.dispose();
      provider.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });
});
