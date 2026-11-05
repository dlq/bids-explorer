import { gzipSync } from 'node:zlib';
import { zipFixture } from '../zipFixture';
import { tarFixture, tarRecord } from '../tarFixture';
import { squashfsFiles } from '../squashfsFixture';
import { LogicalDirectorySource } from '../../sources/logicalDirectory';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { DatasetBrowser } from '../../core/browser';
import { LocalDirectorySource } from '../../sources/localDirectory';
import { DatasetTreeProvider } from '../../ui/datasetTree';
import { GradientPreviewManager, isGradientFile } from '../../ui/gradientPreview';

async function rendered(
  panel: vscode.WebviewPanel,
  index: number,
): Promise<Record<string, unknown>> {
  let result: Record<string, unknown> | undefined;
  const listener = panel.webview.onDidReceiveMessage((message: unknown) => {
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'rendered' &&
      'selectedIndex' in message &&
      message.selectedIndex === index
    )
      result = message;
  });
  try {
    const deadline = Date.now() + 15000;
    while (!result) {
      assert.ok(Date.now() < deadline, 'The real webview should render and acknowledge selection');
      await panel.webview.postMessage({ type: 'selectVolume', index });
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    return result;
  } finally {
    listener.dispose();
  }
}

suite('Read-only diffusion gradient preview', () => {
  test('tree and explicit commands open a real script-enabled preview with linked selection and paired identity', async function () {
    this.timeout(30000);
    const extension = vscode.extensions.getExtension('bids-explorer-dev.bids-explorer')!;
    await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-gradient-host-'));
    let panel: vscode.WebviewPanel | undefined;
    const provider = new DatasetTreeProvider(new DatasetBrowser(new LocalDirectorySource()));
    try {
      const bval = vscode.Uri.file(join(folder, 'dwi.bval')),
        bvec = vscode.Uri.file(join(folder, 'dwi.bvec'));
      await writeFile(bval.fsPath, '0 1000 1000 2000');
      await writeFile(bvec.fsPath, '0 1 0 0\n0 0 1 0\n0 0 0 1');
      const before = await Promise.all([readFile(bval.fsPath), readFile(bvec.fsPath)]);
      assert.equal(isGradientFile(bval), true);
      assert.equal(isGradientFile(vscode.Uri.parse('https://example.org/dwi.bval')), false);
      const root = provider.browser.register(
        await provider.browser.source.root(vscode.Uri.file(folder).toString()),
      );
      const entry = (await provider.getChildren(provider.element(root))).find(
        (e) => e.type === 'entry' && e.entry.name === 'dwi.bval',
      )!;
      assert.equal(provider.getTreeItem(entry).contextValue, 'gradient');
      panel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        entry,
      );
      assert.ok(panel);
      const initial = await rendered(panel, 0);
      assert.equal(initial.volumeCount, 4);
      assert.equal(initial.lowBCount, 1);
      assert.equal(initial.directionCount, 3);
      assert.equal(initial.groupCount, 3);
      const selected = await rendered(panel, 3);
      assert.equal(selected.selectedBValue, 2000);
      const same = await vscode.commands.executeCommand('bidsExplorer.previewGradients', bvec);
      assert.equal(same, panel);
      assert.match(panel.webview.html, /default-src 'none'/);
      assert.match(panel.webview.html, /connect-src 'none'/);
      assert.match(panel.webview.html, /type="module"/);
      assert.ok(
        !panel.webview.html.includes('0 1000 1000 2000'),
        'Dataset values travel as messages, never HTML',
      );
      assert.equal(panel.webview.options.localResourceRoots?.length, 2);
      assert.deepEqual(await Promise.all([readFile(bval.fsPath), readFile(bvec.fsPath)]), before);
    } finally {
      panel?.dispose();
      provider.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('manager deduplicates concurrent opens, reports load failures and rejects opens after disposal', async function () {
    this.timeout(30000);
    const extension = vscode.extensions.getExtension('bids-explorer-dev.bids-explorer')!;
    const manager = new GradientPreviewManager(extension.extensionUri);
    const folder = await mkdtemp(join(tmpdir(), 'bids-gradient-lifetime-'));
    try {
      const bval = vscode.Uri.file(join(folder, 'dwi.bval'));
      await writeFile(bval.fsPath, '1000');
      await assert.rejects(manager.open(bval), /ENOENT/);
      await writeFile(join(folder, 'dwi.bvec'), '1\n0\n0');
      const a = manager.open(bval),
        b = manager.open(vscode.Uri.file(join(folder, 'dwi.bvec')));
      assert.equal(a, b);
      const panel = await a;
      assert.equal((await rendered(panel, 0)).directionCount, 1);
      panel.dispose();
      const fresh = await manager.open(bval);
      assert.notEqual(fresh, panel);
      manager.dispose();
      await assert.rejects(manager.open(bval), /closed/);
    } finally {
      manager.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });
});

suite('Archived diffusion gradients', () => {
  const files = [
    { name: 'dwi.bval', text: '0 1000' },
    { name: 'dwi.bvec', text: '0 1\n0 0\n0 0' },
  ];
  const tar = tarFixture(...files.map(({ name, text }) => tarRecord(name, Buffer.from(text))));
  for (const [suffix, bytes] of [
    ['zip', zipFixture(files)],
    ['tar', tar],
    ['tar.gz', gzipSync(tar)],
    ['sqfs', squashfsFiles(files)],
  ] as const) {
    test(`renders both gradient files from ${suffix} through the tree`, async function () {
      this.timeout(20000);
      await vscode.extensions.getExtension('bids-explorer-dev.bids-explorer')!.activate();
      const folder = await mkdtemp(join(tmpdir(), 'bids-gradient-archive-'));
      const provider = new DatasetTreeProvider(new DatasetBrowser(new LogicalDirectorySource()));
      let panel: vscode.WebviewPanel | undefined;
      try {
        await writeFile(join(folder, 'sample.' + suffix), bytes);
        const root = provider.browser.register(
          await provider.browser.source.root(vscode.Uri.file(folder).toString()),
        );
        const entries = await provider.getChildren(provider.element(root));
        for (const { name } of files) {
          const row = entries.find((entry) => entry.type === 'entry' && entry.entry.name === name);
          assert.ok(row);
          assert.equal(provider.getTreeItem(row).contextValue, 'gradient');
          panel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
            'bidsExplorer.openFile',
            row,
          );
          assert.ok(panel);
          assert.equal((await rendered(panel, 1)).volumeCount, 2);
          panel.dispose();
          panel = undefined;
        }
      } finally {
        panel?.dispose();
        provider.dispose();
        await rm(folder, { recursive: true, force: true });
      }
    });
  }
});
