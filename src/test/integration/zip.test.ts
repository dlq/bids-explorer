import { extensionId } from '../extensionId';
import { waitForArchivePreview } from './waitForArchivePreview';
import { niftiFixture } from '../niftiFixture';
import { entryArchiveUri, parseArchiveUri, archiveResourceUri } from '../../core/archiveUri';
import { WorkspaceFolderHandoff } from '../../ui/workspaceFolderHandoff';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ArchiveImageCache } from '../../sources/archiveImageCache';
import * as vscode from 'vscode';
import { zipFixture } from '../zipFixture';

suite('Archive URI platform boundary', () => {
  test('VS Code URI serialization preserves member source/revision fields', () => {
    const original = archiveResourceUri({
      sourceUri: 'file:///tmp/archive%20name.zip',
      memberPath: 'folder/a +%.json',
      memberIndex: 2,
      revision: { size: 123, modifiedAt: 1.25 },
    });
    assert.deepEqual(
      parseArchiveUri(vscode.Uri.parse(original).toString()),
      parseArchiveUri(original),
    );
  });
});

suite('ZIP index entry point', () => {
  test('explicit command inspects a ZIP at a deeper physical path, bounds its report and preserves source bytes', async function () {
    this.timeout(15000);
    await vscode.extensions.getExtension(extensionId)!.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-zip-command-'));
    try {
      const nested = join(folder, 'sub-01', 'ses-02');
      await mkdir(nested, { recursive: true });
      const uri = vscode.Uri.file(join(nested, 'anat.zip'));
      const bytes = zipFixture(
        Array.from({ length: 205 }, (_, i) => ({
          name: `sub-01_run-${i}_T1w.nii`,
          text: 'fixture',
        })),
      );
      await writeFile(uri.fsPath, bytes);
      const document = await vscode.commands.executeCommand<vscode.TextDocument>(
        'bidsExplorer.inspectZip',
        uri,
      );
      assert.ok(document);
      assert.equal(document.languageId, 'json');
      const report = JSON.parse(document.getText()) as {
        totalMembers: number;
        displayedMembers: number;
        sourceUri: string;
        coverage: string;
        note: string;
        members: { resource: { memberPath: string } }[];
      };
      assert.equal(report.sourceUri, uri.toString());
      assert.equal(report.coverage, 'complete');
      assert.equal(report.totalMembers, 205);
      assert.equal(report.displayedMembers, 200);
      assert.equal(report.members.length, 200);
      assert.match(report.note, /have not been decompressed or verified/);
      assert.equal(report.members[0].resource.memberPath, 'sub-01_run-0_T1w.nii');
      assert.deepEqual(await readFile(uri.fsPath), bytes);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

suite('ZIP-backed dataset tree', () => {
  test('Add Dataset browses ZIP subject/session branches and hands off the selected MRI', async function () {
    this.timeout(15000);
    const extension = vscode.extensions.getExtension<{
      provider: import('../../ui/datasetTreeProvider').DatasetTreeProvider;
    }>(extensionId)!;
    const api = await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-zip-navigation-'));
    let root: import('../../core/directory').DirectoryEntry | undefined;
    try {
      const zip = join(folder, 'sub-01_ses-2.zip');
      const bytes = zipFixture([
        {
          name: 'sub-01_ses-2/Resample_B0/sub-01_ses-2_desc-b0_dwi.nii.gz',
          bytes: niftiFixture(),
          method: 8,
        },
        { name: 'sub-01_ses-2/.datalad/config' },
      ]);
      await writeFile(zip, bytes);
      await writeFile(join(folder, 'dwi.json'), '{"CrossSourceField":42}');
      root = await vscode.commands.executeCommand(
        'bidsExplorer.addDataset',
        vscode.Uri.file(folder),
      );
      assert.ok(root);
      const roots = await api.provider.getChildren(api.provider.element(root));
      assert.equal(
        roots.filter((entry) => entry.type === 'entry' && entry.entry.kind === 'directory').length,
        1,
        'Archive-backed subject must appear directly in the logical tree',
      );
      const [sidecar, subject] = roots;
      assert.ok(sidecar?.type === 'entry' && sidecar.entry.name === 'dwi.json');
      assert.ok(subject?.type === 'entry' && subject.entry.name === 'sub-01');
      const item = api.provider.getTreeItem(subject);
      assert.equal(item.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
      assert.equal((item.iconPath as vscode.ThemeIcon).id, 'person');
      const sessions = (await api.provider.getChildren(subject)).filter(
        (row) => row.type === 'entry',
      );
      assert.equal(sessions.length, 1);
      assert.equal(api.provider.getTreeItem(sessions[0]).label, '2');
      assert.equal(
        (api.provider.getTreeItem(sessions[0]).iconPath as vscode.ThemeIcon).id,
        'calendar',
      );
      const processing = await api.provider.getChildren(sessions[0]);
      assert.equal(processing.length, 1);
      const images = await api.provider.getChildren(processing[0]);
      assert.equal(images.length, 1);
      const imageItem = api.provider.getTreeItem(images[0]);
      assert.equal(imageItem.contextValue, 'archiveImage');
      const icon = imageItem.iconPath;
      assert.ok(icon && typeof icon === 'object' && 'dark' in icon);
      assert.match(icon.dark.path, /imaging-dark\.svg$/);
      assert.match(String(imageItem.description), /NIfTI image/);
      assert.equal(images[0].type, 'entry');
      if (images[0].type !== 'entry') throw new Error('Expected archive member');
      assert.equal(
        images[0].entry.archive!.memberPath,
        'sub-01_ses-2/Resample_B0/sub-01_ses-2_desc-b0_dwi.nii.gz',
      );
      const inspector = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.inspectMetadata',
        images[0],
      );
      assert.ok(inspector);
      inspector.dispose();
      await vscode.commands.executeCommand('bidsExplorer.showDetails', images[0]);
      const text = vscode.window.activeTextEditor!.document.getText();
      assert.match(text, /memberPath/);
      assert.match(text, /ZIP container/);
      const extracted = await vscode.commands.executeCommand<string>(
        'bidsExplorer.openFile',
        images[0],
      );
      assert.ok(extracted?.startsWith('file:'));
      assert.deepEqual(await readFile(vscode.Uri.parse(extracted).fsPath), niftiFixture());
      const builtInTabs = () =>
        vscode.window.tabGroups.all
          .flatMap((group) => group.tabs)
          .filter(
            (tab) =>
              tab.input instanceof vscode.TabInputWebview &&
              tab.input.viewType.includes('bidsExplorer.progressiveNifti'),
          ).length;
      const tabDeadline = Date.now() + 5000;
      while (!builtInTabs()) {
        assert.ok(Date.now() < tabDeadline, 'Built-in image tab must appear');
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      assert.equal(builtInTabs(), 1);
      assert.equal(
        await vscode.commands.executeCommand('bidsExplorer.openFile', images[0]),
        extracted,
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(builtInTabs(), 1, 'Reopening an archived image must reuse its viewer');
      const explicit = await vscode.commands.executeCommand<string>(
        'bidsExplorer.openImageWith',
        images[0],
        'default',
      );
      assert.equal(explicit, extracted);
      assert.equal(await vscode.commands.executeCommand('bidsExplorer.clearImageCache'), false);
      const extractedPath = vscode.Uri.parse(explicit).fsPath;
      const otherWindow = new ArchiveImageCache(dirname(dirname(extractedPath)));
      assert.equal(await otherWindow.clear(), false);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      assert.equal(
        await vscode.commands.executeCommand('bidsExplorer.openFile', images[0]),
        explicit,
      );
      assert.equal(await otherWindow.clear(), false);
      const viewerDeadline = Date.now() + 5000;
      while (
        !vscode.window.tabGroups.all.some((group) =>
          group.tabs.some((tab) => tab.input instanceof vscode.TabInputWebview),
        )
      ) {
        assert.ok(Date.now() < viewerDeadline, 'Default archive opening should show a webview');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.deepEqual(await readFile(extractedPath), niftiFixture());
      assert.deepEqual(await readFile(zip), bytes);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      let cleared = false;
      for (let attempt = 0; attempt < 40 && !cleared; attempt++) {
        cleared = await otherWindow.clear();
        if (!cleared) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.equal(cleared, true, 'Closing the last tab should release the cache guard');
      await assert.rejects(readFile(extractedPath), { code: 'ENOENT' });
    } finally {
      if (root)
        await vscode.commands.executeCommand(
          'bidsExplorer.removeDataset',
          api.provider.element(root),
        );
      await rm(folder, { recursive: true, force: true });
    }
  });
});

suite('Declared descriptorless collections', () => {
  test('workspace declarations populate and remove an automatic root without a dataset marker', async function () {
    this.timeout(15000);
    const extension = vscode.extensions.getExtension<{
      provider: import('../../ui/datasetTreeProvider').DatasetTreeProvider;
    }>(extensionId)!;
    const api = await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-declared-collection-'));
    const uri = vscode.Uri.file(folder);
    const handoff = new WorkspaceFolderHandoff();
    const settings = vscode.workspace.getConfiguration('bidsExplorer');
    const before = settings.inspect<string[]>('collectionRoots')?.workspaceValue;
    const waitFor = async (present: boolean): Promise<void> => {
      const deadline = Date.now() + 5000;
      while (
        api.provider.browser.datasets().some((root) => root.uri === uri.toString()) !== present
      ) {
        assert.ok(Date.now() < deadline, 'Collection root should follow its declaration');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };
    try {
      await writeFile(
        join(folder, 'sub-01_ses-2.zip'),
        zipFixture([{ name: 'sub-01_ses-2/anat/sub-01_T1w.nii' }]),
      );
      await handoff.add(uri);
      await settings.update(
        'collectionRoots',
        [uri.toString()],
        vscode.ConfigurationTarget.Workspace,
      );
      await waitFor(true);
      await settings.update('collectionRoots', before, vscode.ConfigurationTarget.Workspace);
      await waitFor(false);
    } finally {
      await settings.update('collectionRoots', before, vscode.ConfigurationTarget.Workspace);
      const index =
        vscode.workspace.workspaceFolders?.findIndex(
          (folder) => folder.uri.toString() === uri.toString(),
        ) ?? -1;
      if (index >= 0)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            listener.dispose();
            reject(new Error('Workspace removal confirmation timed out'));
          }, 5000);
          const listener = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            if (event.removed.some((folder) => folder.uri.toString() === uri.toString())) {
              clearTimeout(timer);
              listener.dispose();
              resolve();
            }
          });
          if (!vscode.workspace.updateWorkspaceFolders(index, 1)) {
            clearTimeout(timer);
            listener.dispose();
            reject(new Error('Workspace removal rejected'));
          }
        });
      handoff.dispose();
      await rm(folder, { recursive: true, force: true });
    }
  });
});

suite('Archive metadata viewing', () => {
  test('tree JSON, table and gradient entry points render from original archive URIs; raw text is read-only', async function () {
    this.timeout(30000);
    const extension = vscode.extensions.getExtension<{
      provider: import('../../ui/datasetTreeProvider').DatasetTreeProvider;
    }>(extensionId)!;
    const api = await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-archive-previews-'));
    let root: import('../../core/directory').DirectoryEntry | undefined;
    const panels: vscode.WebviewPanel[] = [];
    try {
      const bytes = zipFixture([
        {
          name: 'sub-01_ses-2/Read_BIDS/info.json',
          text: '{"TaskName":"Archived task","Large":9007199254740993}',
        },
        { name: 'sub-01_ses-2/Read_BIDS/events.tsv', text: 'onset\tduration\n0\t1\n0\t2' },
        { name: 'sub-01_ses-2/Read_BIDS/events.json', text: '{"duration":{"Units":"s"}}' },
        { name: 'sub-01_ses-2/Read_BIDS/dwi.bval', text: '0 1000' },
        { name: 'sub-01_ses-2/Read_BIDS/dwi.bvec', text: '0 1\n0 0\n0 0' },
        { name: 'sub-01_ses-2/Read_BIDS/structure.json', text: '[{"N":9007199254740993},"<img>"]' },
      ]);
      const path = join(folder, 'sub-01_ses-2.zip');
      await writeFile(path, bytes);
      root = await vscode.commands.executeCommand(
        'bidsExplorer.addDataset',
        vscode.Uri.file(folder),
      );
      assert.ok(root);
      const subjects = await api.provider.getChildren(api.provider.element(root));
      const sessions = await api.provider.getChildren(subjects[0]);
      const processing = await api.provider.getChildren(sessions[0]);
      const entries = await api.provider.getChildren(processing[0]);
      const selected = (name: string) => {
        const found = entries.find((e) => e.type === 'entry' && e.entry.name === name);
        assert.ok(found && found.type === 'entry');
        return found;
      };
      const jsonEntry = selected('info.json');
      const jsonPanel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        jsonEntry,
      );
      panels.push(jsonPanel);
      const jsonState = await waitForArchivePreview(
        jsonPanel,
        (message) => message.fieldCount === 2,
      );
      assert.ok(String(jsonState.sourceUri).startsWith('bids-zip:'));
      const arrayPanel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        selected('structure.json'),
      );
      panels.push(arrayPanel);
      const arrayState = await waitForArchivePreview(
        arrayPanel,
        (message) => message.fieldCount === 2,
      );
      assert.equal(arrayState.firstKey, '0');
      assert.equal(arrayState.title, 'structure.json');
      jsonPanel.reveal();

      const nonce = /nonce="([a-f0-9]+)"/.exec(jsonPanel.webview.html)![1];
      jsonPanel.webview.html = jsonPanel.webview.html.replace(
        '</body>',
        `<script nonce="${nonce}">window.addEventListener('message',event=>{if(event.data?.type==='testControl')document.getElementById(event.data.id)?.click();});</script></body>`,
      );
      await waitForArchivePreview(jsonPanel, (message) => message.fieldCount === 2);
      await jsonPanel.webview.postMessage({ type: 'testControl', id: 'raw' });
      const deadline = Date.now() + 10000;
      while (vscode.window.activeTextEditor?.document.uri.scheme !== 'bids-zip') {
        assert.ok(Date.now() < deadline);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      const raw = vscode.window.activeTextEditor.document;
      assert.match(raw.getText(), /9007199254740993/);
      await assert.rejects(
        Promise.resolve(vscode.workspace.fs.writeFile(raw.uri, Buffer.from('must not write'))),
      );
      assert.equal(
        raw.uri.toString(),
        vscode.Uri.parse(entryArchiveUri(jsonEntry.entry)).toString(),
      );
      const tablePanel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        selected('events.tsv'),
      );
      panels.push(tablePanel);
      const tableState = await waitForArchivePreview(
        tablePanel,
        (message) => message.dictionaryStatus === 'loaded',
      );
      assert.equal(tableState.dictionarySourceCount, 1);
      const gradients = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        selected('dwi.bval'),
      );
      panels.push(gradients);
      await waitForArchivePreview(gradients, (message) => message.volumeCount === 2);
      assert.equal(
        await vscode.commands.executeCommand('bidsExplorer.clearImageCache'),
        false,
        'Open preview/editor tabs must prevent cache clearing',
      );
      assert.deepEqual(await readFile(path), bytes);
    } finally {
      for (const panel of panels) panel?.dispose();
      if (root)
        await vscode.commands.executeCommand(
          'bidsExplorer.removeDataset',
          api.provider.element(root),
        );
      await rm(folder, { recursive: true, force: true });
    }
  });
});

suite('Saved archive placements', () => {
  test('workspace settings place a ZIP subtree and preserve the member URI', async () => {
    const extension =
      vscode.extensions.getExtension<ReturnType<typeof import('../../extension').activate>>(
        extensionId,
      )!;
    const { provider } = await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-saved-placement-'));
    const settings = vscode.workspace.getConfiguration('bidsExplorer');
    const setting = 'archivePlacements';
    const previous = settings.inspect(setting)?.workspaceValue;
    const archive = join(folder, 'sub-99.zip');
    const memberPath = 'delivery/anat/sub-01_T1w.json';
    let root: import('../../core/directory').DirectoryEntry | undefined;
    try {
      await writeFile(archive, zipFixture([{ name: memberPath, text: '{"fixture":true}' }]));
      root = await vscode.commands.executeCommand(
        'bidsExplorer.addDataset',
        vscode.Uri.file(folder),
      );
      assert.ok(root);
      const dataset = provider.element(root);
      assert.equal(provider.getTreeItem((await provider.getChildren(dataset))[0]).label, '99');
      await settings.update(
        setting,
        {
          [root.datasetUri]: [
            { archivePath: 'sub-99.zip', memberRoot: 'delivery', logicalRoot: 'sub-01' },
          ],
        },
        vscode.ConfigurationTarget.Workspace,
      );
      const [subject] = await provider.getChildren(dataset);
      assert.equal(provider.getTreeItem(subject).label, '01');
      const [anat] = (await provider.getChildren(subject)).filter((row) => row.type === 'entry');
      const [sidecar] = await provider.getChildren(anat);
      assert.equal(sidecar.type, 'entry');
      if (sidecar.type !== 'entry') throw new Error('Expected an archive member.');
      const ref = parseArchiveUri(entryArchiveUri(sidecar.entry));
      assert.equal(ref.memberPath, memberPath);
      assert.equal(vscode.Uri.parse(ref.sourceUri).fsPath, archive);
      const document = await vscode.workspace.openTextDocument(
        vscode.Uri.parse(entryArchiveUri(sidecar.entry)),
      );
      assert.equal(document.getText(), '{"fixture":true}');
    } finally {
      await settings.update(setting, previous, vscode.ConfigurationTarget.Workspace);
      if (root)
        await vscode.commands.executeCommand('bidsExplorer.removeDataset', provider.element(root));
      await rm(folder, { recursive: true, force: true });
    }
  });
});
