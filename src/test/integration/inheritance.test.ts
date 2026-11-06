import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { DatasetTreeProvider } from '../../ui/datasetTreeProvider';
import { DatasetBrowser } from '../../core/browser';
import { LocalDirectorySource } from '../../sources/localDirectory';
import { InheritanceInspector } from '../../ui/inheritanceInspector';

suite('Inherited metadata inspection', () => {
  test('explicit tree inspection shows inherited values and companion sources without changing default opening or files', async function () {
    this.timeout(20000);
    await vscode.extensions.getExtension('bids-explorer-dev.bids-explorer')!.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-inheritance-host-'));
    const provider = new DatasetTreeProvider(new DatasetBrowser(new LocalDirectorySource()));
    try {
      await mkdir(join(folder, 'sub-01/dwi'), { recursive: true });
      await writeFile(join(folder, 'dwi.json'), '{"Shared":1,"Override":2}');
      await writeFile(join(folder, 'dwi.bval'), '0 1000');
      await writeFile(join(folder, 'dwi.bvec'), '0 1\n0 0\n0 0');
      const image = join(folder, 'sub-01/dwi/sub-01_dwi.nii');
      await writeFile(image, 'synthetic image: never parsed');
      await writeFile(
        join(folder, 'sub-01/dwi/sub-01_dwi.json'),
        '{"Override":3,"TaskName":"' + 'x'.repeat(5000) + '"}',
      );
      const root = provider.browser.register(
        await provider.browser.source.root(vscode.Uri.file(folder).toString()),
      );
      const element = provider.element({
        datasetUri: root.uri,
        uri: vscode.Uri.file(image).toString(),
        relativePath: 'sub-01/dwi/sub-01_dwi.nii',
        name: 'sub-01_dwi.nii',
        kind: 'file',
      });
      assert.equal(provider.getTreeItem(element).command?.command, 'bidsExplorer.openFile');
      const panel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.inspectMetadata',
        element,
      );
      assert.ok(panel);
      const nonce = /nonce="([a-f0-9]+)"/.exec(panel.webview.html)![1];
      panel.webview.html = panel.webview.html.replace(
        '</body>',
        `<script nonce="${nonce}">window.addEventListener('message',event=>{if(event.data?.type==='testAction')document.getElementById('action-'+event.data.id)?.click();});</script></body>`,
      );
      let rendered = false;
      const listener = panel.webview.onDidReceiveMessage((message: unknown) => {
        if (
          message &&
          typeof message === 'object' &&
          'type' in message &&
          message.type === 'rendered'
        )
          rendered = true;
      });
      const deadline = Date.now() + 15000;
      while (!rendered) {
        assert.ok(Date.now() < deadline);
        await panel.webview.postMessage({ type: 'inspect' });
        await new Promise<void>((resolve) => setTimeout(resolve, 40));
      }
      listener.dispose();
      await panel.webview.postMessage({ type: 'testAction', id: 'report' });
      while (vscode.window.activeTextEditor?.document.uri.scheme !== 'untitled') {
        assert.ok(Date.now() < deadline);
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
      const document = vscode.window.activeTextEditor.document;
      const result = JSON.parse(document.getText()) as {
        status: string;
        fields: { key: string; valueText: string; truncated: boolean; history: unknown[] }[];
        related: { status: string; selected: { relativePath: string } }[];
      };
      assert.equal(result.status, 'resolved');
      assert.equal(result.fields.find((f) => f.key === 'Override')?.valueText, '3');
      assert.equal(result.fields.find((f) => f.key === 'Override')?.history.length, 2);
      assert.equal(result.fields.find((f) => f.key === 'TaskName')?.truncated, true);
      assert.equal(result.related[0].selected.relativePath, 'dwi.bval');
      assert.equal(await readFile(image, 'utf8'), 'synthetic image: never parsed');
      assert.equal(await readFile(join(folder, 'dwi.json'), 'utf8'), '{"Shared":1,"Override":2}');
      // Exercise inspector lifetime/cancellation independently of the command's shared instance.
      const inspector = new InheritanceInspector(
        vscode.extensions.getExtension('bids-explorer-dev.bids-explorer')!.extensionUri,
      );
      const pending = inspector.open(element.entry);
      inspector.cancelPending();
      assert.equal(await pending, undefined);
      const unsupported = {
        ...element.entry,
        uri: vscode.Uri.file(join(folder, 'dwi.json')).toString(),
      };
      assert.equal(await inspector.open(unsupported), undefined);
      inspector.dispose();
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      provider.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });
});
