import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { DatasetBrowser } from '../../core/browser';
import { LocalDirectorySource } from '../../sources/localDirectory';
import { DatasetTreeProvider, type EntryElement } from '../../ui/datasetTree';

interface ExplorerApi {
  provider: DatasetTreeProvider;
  ready: Promise<void>;
}

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 15000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'Expected workspace recognition event did not complete');
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
}

suite('Automatic workspace recognition', () => {
  test('opening a BIDS workspace activates the extension and populates roots without Add Dataset', async function () {
    this.timeout(20000);
    const extension = vscode.extensions.getExtension<ExplorerApi>(
      'bids-explorer-dev.bids-explorer',
    );
    assert.ok(extension);
    await waitFor(() => extension.isActive);
    const { provider, ready } = extension.exports;
    await ready;
    const uri = vscode.workspace.workspaceFolders![0].uri.toString();
    const root = provider.browser.datasets().find((entry) => entry.uri === uri);
    assert.ok(root, 'The fixture workspace should be recognized automatically');
    assert.equal(provider.browser.snapshot(root).coverage, 'unknown');
  });

  test('new workspace roots are recognized and removed automatically, with explicit Add retaining manual ownership', async function () {
    this.timeout(20000);
    const extension = vscode.extensions.getExtension<ExplorerApi>(
      'bids-explorer-dev.bids-explorer',
    )!;
    const { provider } = extension.exports;
    const folder = await mkdtemp(join(tmpdir(), 'bids-auto-workspace-'));
    const uri = vscode.Uri.file(folder);
    const marker = vscode.Uri.file(join(folder, 'dataset_description.json'));
    try {
      await writeFile(marker.fsPath, '{}');
      let index = vscode.workspace.workspaceFolders!.length;
      assert.ok(vscode.workspace.updateWorkspaceFolders(index, 0, { uri }));
      await waitFor(() =>
        provider.browser.datasets().some((entry) => entry.uri === uri.toString()),
      );
      assert.equal(
        provider.browser.datasets().filter((entry) => entry.uri === uri.toString()).length,
        1,
      );
      index = vscode.workspace.workspaceFolders!.findIndex(
        (item) => item.uri.toString() === uri.toString(),
      );
      assert.ok(vscode.workspace.updateWorkspaceFolders(index, 1));
      await waitFor(
        () => !provider.browser.datasets().some((entry) => entry.uri === uri.toString()),
      );
      index = vscode.workspace.workspaceFolders!.length;
      assert.ok(vscode.workspace.updateWorkspaceFolders(index, 0, { uri }));
      await waitFor(() =>
        provider.browser.datasets().some((entry) => entry.uri === uri.toString()),
      );
      await vscode.commands.executeCommand('bidsExplorer.addDataset', uri);
      index = vscode.workspace.workspaceFolders!.findIndex(
        (item) => item.uri.toString() === uri.toString(),
      );
      await new Promise<void>((resolve, reject) => {
        const listener = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
          if (event.removed.some((item) => item.uri.toString() === uri.toString())) {
            listener.dispose();
            resolve();
          }
        });
        if (!vscode.workspace.updateWorkspaceFolders(index, 1)) {
          listener.dispose();
          reject(new Error('Could not request fixture workspace removal'));
        }
      });
      // A Refresh waits for any recognition work; manually registered roots remain.
      await vscode.commands.executeCommand('bidsExplorer.refresh');
      const retained = provider.browser.datasets().find((entry) => entry.uri === uri.toString());
      assert.ok(retained);
      await vscode.commands.executeCommand(
        'bidsExplorer.removeDataset',
        provider.element(retained),
      );
      assert.equal(new TextDecoder().decode(await vscode.workspace.fs.readFile(marker)), '{}');
    } finally {
      const index = vscode.workspace.workspaceFolders!.findIndex(
        (item) => item.uri.toString() === uri.toString(),
      );
      if (index >= 0) vscode.workspace.updateWorkspaceFolders(index, 1);
      const root = provider.browser.datasets().find((entry) => entry.uri === uri.toString());
      if (root)
        await vscode.commands.executeCommand('bidsExplorer.removeDataset', provider.element(root));
      await rm(folder, { recursive: true, force: true });
    }
  });
});

suite('BIDS Explorer directory workflows', () => {
  test('native Explorer handoff tolerates an unconfirmed workspace update', async function () {
    this.timeout(15000);
    const extension = vscode.extensions.getExtension<ExplorerApi>(
      'bids-explorer-dev.bids-explorer',
    )!;
    const { provider } = await extension.activate();
    const first = await mkdtemp(join(tmpdir(), 'bids-pending-workspace-'));
    const second = await mkdtemp(join(tmpdir(), 'bids-handoff-workspace-'));
    const firstUri = vscode.Uri.file(first),
      secondUri = vscode.Uri.file(second);
    try {
      const root = await provider.browser.source.root(secondUri.toString());
      assert.ok(
        vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders!.length, 0, {
          uri: firstUri,
        }),
      );
      await vscode.commands.executeCommand(
        'bidsExplorer.showInFileExplorer',
        provider.element(root),
      );
      assert.ok(
        vscode.workspace.workspaceFolders!.some(
          (folder) => folder.uri.toString() === secondUri.toString(),
        ),
      );
    } finally {
      for (const uri of [firstUri, secondUri]) {
        const index = vscode.workspace.workspaceFolders!.findIndex(
          (folder) => folder.uri.toString() === uri.toString(),
        );
        if (index >= 0)
          await new Promise<void>((resolve, reject) => {
            const listener = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
              if (event.removed.some((folder) => folder.uri.toString() === uri.toString())) {
                listener.dispose();
                resolve();
              }
            });
            if (!vscode.workspace.updateWorkspaceFolders(index, 1)) {
              listener.dispose();
              reject(new Error('Could not remove handoff fixture'));
            }
          });
      }
      await rm(first, { recursive: true, force: true });
      await rm(second, { recursive: true, force: true });
    }
  });

  test('commands register a real dataset, open a file, show provenance and remove registration without deleting data', async () => {
    const extension = vscode.extensions.getExtension<ExplorerApi>(
      'bids-explorer-dev.bids-explorer',
    );
    assert.ok(extension);
    const { provider } = await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-extension-'));
    try {
      await mkdir(join(folder, 'sub-01', 'anat'), { recursive: true });
      await writeFile(join(folder, 'sub-01', 'anat', 'sub-01_T1w.json'), '{}');
      await writeFile(
        join(folder, 'dataset_description.json'),
        '{"Name":"Synthetic integration data"}\n',
      );
      await vscode.commands.executeCommand('bidsExplorer.addDataset', vscode.Uri.file(folder));
      await vscode.commands.executeCommand('bidsExplorer.addDataset', vscode.Uri.file(folder));
      const roots = await provider.getChildren();
      const root = roots.find(
        (e) => e.type === 'entry' && e.entry.uri === vscode.Uri.file(folder).toString(),
      ) as EntryElement;
      assert.ok(root);
      assert.equal(
        roots.filter((e) => e.type === 'entry' && e.entry.uri === root.entry.uri).length,
        1,
      );
      const rows = await provider.getChildren(root);
      const participant = rows.find((e) => e.type === 'entry' && e.entry.name === 'sub-01')!;
      const anatomy = (await provider.getChildren(participant))[0];
      const file = (await provider.getChildren(anatomy))[0] as EntryElement;
      await vscode.commands.executeCommand('bidsExplorer.openFile', file);
      assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), file.entry.uri);
      await vscode.commands.executeCommand('bidsExplorer.showDetails', file);
      const details: unknown = JSON.parse(vscode.window.activeTextEditor.document.getText());
      assert.ok(typeof details === 'object' && details !== null && 'sourceUri' in details);
      assert.equal(details.sourceUri, file.entry.uri);
      await vscode.commands.executeCommand('bidsExplorer.showInFileExplorer', root);
      assert.ok(
        vscode.workspace.workspaceFolders?.some(
          (folder) => folder.uri.toString() === root.entry.uri,
        ),
      );
      await vscode.commands.executeCommand('bidsExplorer.showInFileExplorer', root);
      assert.equal(
        vscode.workspace.workspaceFolders?.filter(
          (folder) => folder.uri.toString() === root.entry.uri,
        ).length,
        1,
      );
      await vscode.commands.executeCommand('bidsExplorer.refresh', root);
      assert.equal(provider.browser.snapshot(root.entry).coverage, 'unknown');
      await vscode.commands.executeCommand('bidsExplorer.removeDataset', root);
      assert.ok(!provider.browser.datasets().some((e) => e.uri === root.entry.uri));
      assert.ok(
        (await vscode.workspace.fs.stat(vscode.Uri.file(folder))).type & vscode.FileType.Directory,
      );
    } finally {
      const registered = provider.browser
        .datasets()
        .find((entry) => entry.uri === vscode.Uri.file(folder).toString());
      if (registered)
        await vscode.commands.executeCommand(
          'bidsExplorer.removeDataset',
          provider.element(registered),
        );
      const workspaceIndex =
        vscode.workspace.workspaceFolders?.findIndex(
          (item) => item.uri.toString() === vscode.Uri.file(folder).toString(),
        ) ?? -1;
      if (workspaceIndex >= 0) vscode.workspace.updateWorkspaceFolders(workspaceIndex, 1);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('native tree is lazy, labels canonical folders, preserves physical names and isolates branch refresh', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'bids-tree-'));
    const browser = new DatasetBrowser(new LocalDirectorySource()),
      provider = new DatasetTreeProvider(browser);
    try {
      for (const relative of [
        'sub-01/anat',
        'sub-02/ses-test/func',
        'derivatives/pipeline',
        'notes',
        '.datalad',
      ])
        await mkdir(join(folder, relative), { recursive: true });
      await writeFile(join(folder, 'sub-01', 'anat', 'sub-01_T1w.json'), '{}');
      await writeFile(join(folder, '.DS_Store'), 'metadata');
      const root = browser.register(await browser.source.root(vscode.Uri.file(folder).toString()));
      const top = (await provider.getChildren())[0] as EntryElement;
      assert.equal(browser.snapshot(root).coverage, 'unknown');
      assert.equal(
        provider.getTreeItem(top).collapsibleState,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      assert.equal(browser.snapshot(root).coverage, 'unknown');
      assert.equal((provider.getTreeItem(top).iconPath as vscode.ThemeIcon).id, 'database');
      const children = await provider.getChildren(top);
      assert.ok(!children.some((e) => e.type === 'entry' && e.entry.name.startsWith('.')));
      const a = children.find(
        (e) => e.type === 'entry' && e.entry.name === 'sub-01',
      ) as EntryElement;
      const b = children.find(
        (e) => e.type === 'entry' && e.entry.name === 'sub-02',
      ) as EntryElement;
      const derivatives = children.find(
        (e) => e.type === 'entry' && e.entry.name === 'derivatives',
      ) as EntryElement;
      assert.equal(provider.getTreeItem(a).description, 'Participant');
      assert.equal((provider.getTreeItem(a).iconPath as vscode.ThemeIcon).id, 'person');
      assert.equal(provider.getTreeItem(derivatives).description, 'Derivatives');
      assert.equal(
        (provider.getTreeItem(derivatives).iconPath as vscode.ThemeIcon).id,
        'git-branch',
      );
      const pipeline = (await provider.getChildren(derivatives))[0];
      assert.equal(provider.getTreeItem(pipeline).description, 'Pipeline');
      assert.equal(
        (provider.getTreeItem(pipeline).iconPath as vscode.ThemeIcon).id,
        'settings-gear',
      );
      assert.equal(browser.snapshot(a.entry).coverage, 'unknown');
      const anatomy = (await provider.getChildren(a))[0] as EntryElement;
      assert.equal(provider.getTreeItem(anatomy).description, 'Anatomical');
      assert.equal((provider.getTreeItem(anatomy).iconPath as vscode.ThemeIcon).id, 'layers');
      const session = (await provider.getChildren(b))[0] as EntryElement;
      assert.equal(provider.getTreeItem(session).description, 'Session');
      assert.equal((provider.getTreeItem(session).iconPath as vscode.ThemeIcon).id, 'calendar');
      const functional = (await provider.getChildren(session))[0] as EntryElement;
      assert.equal(provider.getTreeItem(functional).description, 'Functional');
      assert.equal((provider.getTreeItem(functional).iconPath as vscode.ThemeIcon).id, 'pulse');
      const file = (await provider.getChildren(anatomy))[0] as EntryElement;
      assert.equal(provider.getTreeItem(file).command?.command, 'bidsExplorer.openFile');
      assert.deepEqual(await provider.getChildren(file), []);
      const events: unknown[] = [];
      const subscription = provider.onDidChangeTreeData((e) => events.push(e));
      provider.refresh(a);
      assert.equal(events[0], a);
      assert.equal(browser.snapshot(a.entry).coverage, 'unknown');
      assert.equal(browser.snapshot(b.entry).coverage, 'complete');
      const before = provider.getTreeItem(a).id;
      assert.equal(provider.getTreeItem(a).label, 'sub-01');
      await provider.getChildren(a);
      assert.equal(provider.getTreeItem(a).id, before);
      assert.ok(!children.some((e) => e.type === 'entry' && e.entry.name === 'notes'));
      subscription.dispose();
    } finally {
      provider.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('failed listing stays visible, is retryable, and retains stale children', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'bids-failure-'));
    const browser = new DatasetBrowser(new LocalDirectorySource()),
      provider = new DatasetTreeProvider(browser);
    try {
      await mkdir(join(folder, 'sub-01'));
      const root = browser.register(await browser.source.root(vscode.Uri.file(folder).toString()));
      const top = provider.element(root);
      const first = await provider.getChildren(top);
      await rm(folder, { recursive: true, force: true });
      provider.refresh(top);
      const failed = await provider.getChildren(top);
      assert.equal(failed[0], first[0]);
      const message = failed[1];
      assert.equal(message.type, 'message');
      assert.match(message.type === 'message' ? message.message : '', /Could not list folder/);
      assert.equal(provider.getTreeItem(message).command?.command, 'bidsExplorer.refresh');
      assert.deepEqual(await provider.getChildren(message), []);
      assert.equal(browser.snapshot(root).coverage, 'failed');
      assert.equal(browser.snapshot(root).stale, true);
      await mkdir(folder);
      provider.refresh(message);
      assert.deepEqual(await provider.getChildren(top), []);
    } finally {
      provider.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('symlink entries are visible but cannot expand or open through the tree', async function () {
    if (process.platform === 'win32') this.skip();
    const folder = await mkdtemp(join(tmpdir(), 'bids-link-tree-'));
    const browser = new DatasetBrowser(new LocalDirectorySource()),
      provider = new DatasetTreeProvider(browser);
    try {
      await mkdir(join(folder, 'actual'));
      await symlink(join(folder, 'actual'), join(folder, 'sub-linked'));
      const root = browser.register(await browser.source.root(vscode.Uri.file(folder).toString()));
      const link = (await provider.getChildren(provider.element(root))).find(
        (e) => e.type === 'entry' && e.entry.name === 'sub-linked',
      )!;
      const item = provider.getTreeItem(link);
      assert.equal(item.command, undefined);
      assert.equal(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
      assert.match(String(item.description), /not followed/);
      assert.deepEqual(await provider.getChildren(link), []);
      browser.remove(root);
      provider.registrationChanged();
      assert.deepEqual(await provider.getChildren(), []);
    } finally {
      provider.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });
});

suite('BIDS Explorer cancellation', () => {
  test('cancel pending listings retains completed work and exposes a retry instead of absence', async () => {
    let finish!: (entries: readonly import('../../core/directory').DirectoryEntry[]) => void;
    const source = {
      root: () =>
        Promise.resolve({
          datasetUri: 'file:///cancel',
          uri: 'file:///cancel',
          relativePath: '',
          name: 'cancel',
          kind: 'directory' as const,
        }),
      children: () =>
        new Promise<readonly import('../../core/directory').DirectoryEntry[]>((resolve) => {
          finish = resolve;
        }),
      revision: () => Promise.resolve({ size: 0, modifiedAt: 0 }),
    };
    const browser = new DatasetBrowser(source),
      provider = new DatasetTreeProvider(browser);
    try {
      const root = browser.register(await source.root());
      const loading = provider.getChildren(provider.element(root));
      // withProgress schedules the task; synchronize on the adapter rather than timing.
      while (!finish) await new Promise<void>((resolve) => setImmediate(resolve));
      provider.cancelPending();
      finish([]);
      const rows = await loading;
      assert.equal(rows.length, 1);
      assert.equal(rows[0].type, 'message');
      assert.match(rows[0].type === 'message' ? rows[0].message : '', /canceled/);
      assert.equal(browser.snapshot(root).coverage, 'unknown');
    } finally {
      provider.dispose();
    }
  });
});

suite('BIDS Explorer unfamiliar entries', () => {
  test('unrecognized contents point to native Explorer without declaring the dataset invalid', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'bids-unrecognized-'));
    const browser = new DatasetBrowser(new LocalDirectorySource());
    const provider = new DatasetTreeProvider(browser);
    try {
      await mkdir(join(folder, '.datalad'));
      await writeFile(join(folder, 'notes.txt'), 'Keep me unchanged');
      const root = browser.register(await browser.source.root(vscode.Uri.file(folder).toString()));
      const rows = await provider.getChildren(provider.element(root));
      assert.equal(rows.length, 1);
      assert.equal(
        provider.getTreeItem(rows[0]).command?.command,
        'bidsExplorer.showInFileExplorer',
      );
      assert.equal(browser.snapshot(root).coverage, 'complete');
      assert.equal(browser.snapshot(root).physicalChildCount, 2);
      assert.equal(browser.snapshot(root).children.length, 0);
      assert.ok(
        (await vscode.workspace.fs.stat(vscode.Uri.file(join(folder, '.datalad')))).type &
          vscode.FileType.Directory,
      );
    } finally {
      provider.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });
});
