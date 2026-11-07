import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { niftiFixture } from '../niftiFixture';
import { image, records, squashfsFile, squashfsSuperblock } from '../squashfsFixture';

suite('SquashFS inspection', () => {
  test('opens a header report with explicitly unknown member coverage', async () => {
    await vscode.extensions.getExtension('bids-explorer-dev.bids-explorer')!.activate();
    const directory = await mkdtemp(join(tmpdir(), 'bids-sqfs-inspect-'));
    try {
      const image = vscode.Uri.file(join(directory, 'fixture.sqfs'));
      await writeFile(image.fsPath, squashfsSuperblock());
      const document = await vscode.commands.executeCommand<vscode.TextDocument>(
        'bidsExplorer.inspectSquashfs',
        image,
      );
      assert.ok(document);
      const report = JSON.parse(document.getText()) as {
        coverage: string;
        superblock: { inodeCount: number };
        note: string;
      };
      assert.equal(report.coverage, 'superblock-only');
      assert.equal(report.superblock.inodeCount, 3);
      assert.match(report.note, /Member and participant coverage is unknown/);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

suite('SquashFS logical tree', () => {
  test('the next-page tree action replaces rows and retains unavailable source coverage', async () => {
    const extension = vscode.extensions.getExtension<{
      provider: import('../../ui/datasetTreeProvider').DatasetTreeProvider;
    }>('bids-explorer-dev.bids-explorer')!;
    const { provider } = await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-sqfs-collection-'));
    let root: import('../../core/directory').DirectoryEntry | undefined;
    try {
      const subjects = Array.from({ length: 202 }, (_, i): [string, number] => [
        `sub-${String(i).padStart(4, '0')}`,
        1,
      ]);
      await writeFile(join(folder, 'first.sqfs'), image(records(subjects), { split: 1024 }));
      await writeFile(join(folder, 'second.sqfs'), image(records([subjects[0], subjects[201]])));
      await writeFile(join(folder, 'unavailable.sqfs'), squashfsSuperblock());
      root = await vscode.commands.executeCommand(
        'bidsExplorer.addDataset',
        vscode.Uri.file(folder),
      );
      assert.ok(root);
      const element = provider.element(root);
      const first = await provider.getChildren(element);
      const firstSubject = first[0];
      assert(firstSubject.type === 'entry');
      assert.equal(firstSubject.entry.logical?.sources.length, 2);
      const next = first
        .map((row) => provider.getTreeItem(row).command)
        .find((command) => command?.command === 'bidsExplorer.nextPage');
      assert.ok(next);
      await vscode.commands.executeCommand(next.command, ...((next.arguments ?? []) as unknown[]));
      const second = await provider.getChildren(element);
      assert.deepEqual(
        second.filter((row) => row.type === 'entry').map((row) => row.entry.name),
        ['sub-0200', 'sub-0201'],
      );
      assert(
        second.some((row) => row.type === 'message' && row.message.includes('end of listing')),
      );
      assert(second.some((row) => row.type === 'message' && row.message.includes('1 SquashFS')));
      const back = second
        .map((row) => provider.getTreeItem(row).command)
        .find((command) => command?.command === 'bidsExplorer.previousPage');
      assert.ok(back);
      await vscode.commands.executeCommand(back.command, ...((back.arguments ?? []) as unknown[]));
      const restored = await provider.getChildren(element);
      assert.equal(restored.filter((row) => row.type === 'entry').length, 200);
      assert(!restored.some((row) => row.type === 'message' && row.action === 'previousPage'));
    } finally {
      if (root)
        await vscode.commands.executeCommand('bidsExplorer.removeDataset', provider.element(root));
      await rm(folder, { recursive: true, force: true });
    }
  });
});

suite('SquashFS member opening', () => {
  test('the grouped dataset description shows shared fields and shard-specific values', async () => {
    const extension = vscode.extensions.getExtension<{
      provider: import('../../ui/datasetTreeProvider').DatasetTreeProvider;
    }>('bids-explorer-dev.bids-explorer')!;
    const { provider } = await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-sqfs-comparison-'));
    let root: import('../../core/directory').DirectoryEntry | undefined;
    try {
      for (const [shard, name] of [
        ['a.sqfs', '<script>'],
        ['b.sqfs', 'Diffusion'],
      ])
        await writeFile(
          join(folder, shard),
          squashfsFile(
            'dataset_description.json',
            Buffer.from(JSON.stringify({ Name: name, BIDSVersion: '1.10.0' })),
          ),
        );
      root = await vscode.commands.executeCommand(
        'bidsExplorer.addDataset',
        vscode.Uri.file(folder),
      );
      assert.ok(root);
      const [row] = await provider.getChildren(provider.element(root));
      assert.equal(provider.getTreeItem(row).label, 'Dataset description');
      assert.equal((await provider.getChildren(row)).length, 2);
      const panel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        row,
      );
      assert.ok(panel);
      assert.match(panel.webview.html, /2 of 2 sources/);
      assert.match(panel.webview.html, /&lt;script&gt;/);
      assert.match(panel.webview.html, /Diffusion/);
      assert.doesNotMatch(panel.webview.html, /<script>/);
      panel.dispose();
    } finally {
      if (root)
        await vscode.commands.executeCommand('bidsExplorer.removeDataset', provider.element(root));
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('tree clicks preview selected JSON and hand selected NIfTI bytes to VS Code', async () => {
    const extension = vscode.extensions.getExtension<{
      provider: import('../../ui/datasetTreeProvider').DatasetTreeProvider;
    }>('bids-explorer-dev.bids-explorer')!;
    const { provider } = await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-sqfs-open-'));
    let root: import('../../core/directory').DirectoryEntry | undefined;
    try {
      const scan = niftiFixture();
      await writeFile(join(folder, 'image.sqfs'), squashfsFile('sub-01_T1w.nii.gz', scan));
      await writeFile(
        join(folder, 'metadata.sqfs'),
        squashfsFile('dataset_description.json', Buffer.from('{"Name":"SquashFS fixture"}'), {
          fragment: true,
        }),
      );
      root = await vscode.commands.executeCommand(
        'bidsExplorer.addDataset',
        vscode.Uri.file(folder),
      );
      assert.ok(root);
      const rows = await provider.getChildren(provider.element(root));
      const json = rows.find((row) => row.type === 'entry' && row.entry.name.endsWith('.json'));
      const mri = rows.find((row) => row.type === 'entry' && row.entry.name.endsWith('.nii.gz'));
      assert.ok(json && mri);
      for (const row of [json, mri]) {
        assert.equal(provider.getTreeItem(row).command?.command, 'bidsExplorer.openFile');
        assert.equal(provider.getTreeItem(row).resourceUri?.scheme, 'bids-squashfs');
      }
      const raw = await vscode.workspace.openTextDocument(provider.getTreeItem(json).resourceUri!);
      assert.equal(raw.getText(), '{"Name":"SquashFS fixture"}');
      const panel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        json,
      );
      assert.ok(panel);
      panel.dispose();
      const cached = await vscode.commands.executeCommand<string>('bidsExplorer.openFile', mri);
      assert.ok(cached);
      assert.deepEqual(await readFile(vscode.Uri.parse(cached).fsPath), scan);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } finally {
      if (root)
        await vscode.commands.executeCommand('bidsExplorer.removeDataset', provider.element(root));
      await rm(folder, { recursive: true, force: true });
    }
  });
});
