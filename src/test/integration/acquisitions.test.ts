import { extensionId } from '../extensionId';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as vscode from 'vscode';
import { DatasetTreeProvider, type EntryElement } from '../../ui/datasetTreeProvider';
import { DatasetBrowser } from '../../core/browser';
import type { DirectoryEntry } from '../../core/directory';
import { niftiFixture } from '../niftiFixture';
import { zipFixture } from '../zipFixture';
import { tarFixture, tarRecord } from '../tarFixture';
import { squashfsFiles } from '../squashfsFixture';

suite('Logical acquisition browsing', () => {
  for (const format of ['loose', 'zip', 'tar', 'squashfs'])
    test(`${format} acquisitions expose source-backed children and inherited metadata`, async function () {
      this.timeout(30000);
      const { provider } = await vscode.extensions
        .getExtension<{ provider: DatasetTreeProvider }>(extensionId)!
        .activate();
      const folder = await mkdtemp(join(tmpdir(), 'bids-acquisition-'));
      let root: DirectoryEntry | undefined;
      try {
        const directory = join(folder, 'sub-01', 'func');
        await mkdir(directory, { recursive: true });
        await writeFile(
          join(folder, 'dataset_description.json'),
          '{"Name":"Acquisition study","BIDSVersion":"1.11.2"}',
        );
        await writeFile(
          join(folder, 'task-rest_bold.json'),
          '{"RepetitionTime":2,"EchoTime":0.03,"AcquisitionDuration":300}',
        );
        const image = 'sub-01_task-rest_run-01_bold.nii.gz';
        const local = 'sub-01_task-rest_run-01_bold.json';
        const events = 'sub-01_task-rest_run-01_events.tsv';
        const files = [
          { name: image, bytes: niftiFixture() },
          { name: local, bytes: Buffer.from('{"TaskName":"Resting state"}') },
          { name: events, bytes: Buffer.from('onset\tduration\n0\t1') },
        ];
        if (format === 'loose')
          for (const file of files) await writeFile(join(directory, file.name), file.bytes);
        if (format === 'zip') await writeFile(join(directory, 'scans.zip'), zipFixture(files));
        if (format === 'tar')
          await writeFile(
            join(directory, 'scans.tar'),
            tarFixture(...files.map((file) => tarRecord(file.name, file.bytes))),
          );
        // The minimal SquashFS writer stores text; geometry is irrelevant to metadata-only checks.
        if (format === 'squashfs')
          await writeFile(
            join(directory, 'scans.sqfs'),
            squashfsFiles(
              [...files]
                .sort((a, b) => (a.name < b.name ? -1 : 1))
                .map((file) => ({
                  name: file.name,
                  text: file.name.endsWith('.gz') ? 'fixture image' : file.bytes.toString(),
                })),
            ),
          );
        root = await vscode.commands.executeCommand<DirectoryEntry>(
          'bidsExplorer.addDataset',
          vscode.Uri.file(folder),
        );
        assert.ok(root);
        const subjects = await provider.getChildren(provider.element(root));
        const subject = subjects.find(
          (row) => row.type === 'entry' && row.entry.name === 'sub-01',
        )!;
        const [modality] = await provider.getChildren(subject);
        assert.equal(provider.getTreeItem(modality).label, 'Functional');
        const groups = await provider.getChildren(modality);
        assert.equal(groups.length, 1);
        const group = groups[0] as EntryElement;
        assert.ok(group.acquisition, JSON.stringify(group));
        const treeItem = provider.getTreeItem(group);
        assert.equal(treeItem.label, 'BOLD');
        assert.match(String(treeItem.description), /Task rest · Run 01 · NIfTI image/);
        assert.doesNotMatch(String(treeItem.description), /ZIP source|Tar source|SquashFS source/);
        assert.equal(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
        assert.equal(provider.summaries?.snapshot(group.entry).status, 'unloaded');
        assert.equal(provider.getParent(group), modality);
        const resources = await provider.getChildren(group);
        assert.deepEqual(
          resources.map((row) => provider.getTreeItem(row).label),
          ['Image', 'Acquisition metadata', 'Original JSON', 'Events'],
        );
        assert.equal(provider.getParent(resources[0]), group);
        assert.equal((resources[0] as EntryElement).entry, group.entry);
        assert.notEqual(provider.getTreeItem(resources[0]).id, treeItem.id);
        assert.equal(
          provider.getTreeItem(resources[1]).command?.command,
          'bidsExplorer.inspectMetadata',
        );
        const panel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
          'bidsExplorer.inspectMetadata',
          resources[1],
        );
        assert.ok(panel);
        panel.dispose();
        const deadline = Date.now() + 10000;
        while (provider.summaries?.snapshot(group.entry).status === 'loading') {
          assert.ok(Date.now() < deadline, 'Summary must complete');
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        assert.equal(
          provider.summaries?.snapshot(group.entry).status,
          'ready',
          provider.summaries?.snapshot(group.entry).error,
        );
        assert.match(
          String(provider.getTreeItem(group).description),
          /TR 2 s · TE 30 ms · duration 300 s/,
        );
        provider.refresh(group);
        assert.equal(provider.summaries?.snapshot(group.entry).status, 'unloaded');
      } finally {
        if (root) provider.browser.remove(root);
        provider.registrationChanged();
        await rm(folder, { recursive: true, force: true });
      }
    });
  for (const format of ['loose', 'zip', 'tar', 'squashfs'])
    test(`${format} multi-echo collections preserve shared events, per-echo metadata and parents`, async function () {
      this.timeout(30000);
      const { provider } = await vscode.extensions
        .getExtension<{ provider: DatasetTreeProvider }>(extensionId)!
        .activate();
      const folder = await mkdtemp(join(tmpdir(), 'bids-echoes-'));
      let root: DirectoryEntry | undefined;
      try {
        const directory = join(folder, 'sub-01', 'func');
        await mkdir(directory, { recursive: true });
        const files = [
          ...[1, 2, 10].flatMap((echo) => [
            { name: `sub-01_task-test_run-01_echo-${echo}_bold.nii.gz`, bytes: niftiFixture() },
            {
              name: `sub-01_task-test_run-01_echo-${echo}_bold.json`,
              bytes: Buffer.from(JSON.stringify({ EchoTime: echo / 1000 })),
            },
          ]),
          {
            name: 'sub-01_task-test_run-01_events.tsv',
            bytes: Buffer.from('onset\tduration\n0\t1'),
          },
          { name: 'sub-01_task-test_run-02_echo-1_bold.nii.gz', bytes: niftiFixture() },
        ];
        if (format === 'loose')
          for (const file of files) await writeFile(join(directory, file.name), file.bytes);
        if (format === 'zip') await writeFile(join(directory, 'scans.zip'), zipFixture(files));
        if (format === 'tar')
          await writeFile(
            join(directory, 'scans.tar'),
            tarFixture(...files.map((file) => tarRecord(file.name, file.bytes))),
          );
        if (format === 'squashfs')
          await writeFile(
            join(directory, 'scans.sqfs'),
            squashfsFiles(
              [...files]
                .sort((a, b) => (a.name < b.name ? -1 : 1))
                .map((file) => ({
                  name: file.name,
                  text: file.name.endsWith('.gz') ? 'fixture image' : file.bytes.toString(),
                })),
            ),
          );
        root = await vscode.commands.executeCommand<DirectoryEntry>(
          'bidsExplorer.addDataset',
          vscode.Uri.file(folder),
        );
        assert.ok(root);
        const subjects = await provider.getChildren(provider.element(root));
        const subject = subjects.find(
          (row) => row.type === 'entry' && row.entry.name === 'sub-01',
        )!;
        const [modality] = await provider.getChildren(subject);
        const groups = await provider.getChildren(modality);
        assert.equal(groups.length, 2, 'Different runs remain distinct');
        const collection = groups.find(
          (row): row is EntryElement => row.type === 'entry' && !!row.acquisition?.echoes,
        )!;
        assert.ok(collection);
        const item = provider.getTreeItem(collection);
        assert.equal(item.label, 'BOLD');
        assert.match(String(item.description), /Task test · Run 01 · 3 echoes/);
        assert.doesNotMatch(String(item.description), /Echo 1/);
        assert.equal(item.command, undefined);
        assert.equal(provider.getParent(collection), modality);
        const children = await provider.getChildren(collection);
        assert.deepEqual(
          children.map((row) => provider.getTreeItem(row).label),
          ['Events', 'Echo 1', 'Echo 2', 'Echo 10'],
        );
        for (const echo of children.slice(1)) {
          assert.equal(provider.getParent(echo), collection);
          const resources = await provider.getChildren(echo);
          assert.deepEqual(
            resources.map((row) => provider.getTreeItem(row).label),
            ['Image', 'Acquisition metadata', 'Original JSON'],
          );
          assert.equal(provider.getParent(resources[0]), echo);
        }
        assert.equal(
          new Set([item.id, ...children.map((row) => provider.getTreeItem(row).id)]).size,
          5,
        );
        provider.refresh(children[1]);
        const refreshed = await provider.getChildren(modality);
        assert.ok(
          refreshed.some((row) => row.type === 'entry' && row.acquisition?.echoes?.length === 3),
        );
      } finally {
        if (root) provider.browser.remove(root);
        provider.registrationChanged();
        await rm(folder, { recursive: true, force: true });
      }
    });
  test('partial and paged listings retain flat resources and source conflicts stay visible', async () => {
    const root: DirectoryEntry = {
      datasetUri: 'file:///fixture',
      uri: 'file:///fixture',
      relativePath: '',
      name: 'fixture',
      kind: 'directory',
    };
    const image: DirectoryEntry = {
      ...root,
      relativePath: 'sub-01_T1w.nii',
      name: 'sub-01_T1w.nii',
      uri: 'file:///fixture/sub-01_T1w.nii',
      kind: 'file',
    };
    const browser = new DatasetBrowser({
      root: () => Promise.resolve(root),
      revision: () => Promise.resolve({ size: 1, modifiedAt: 1 }),
      children: () =>
        Promise.resolve([
          { ...image, paging: { page: 1, failures: 0, next: () => Promise.resolve([]) } },
        ]),
    });
    browser.register(root);
    const provider = new DatasetTreeProvider(browser);
    try {
      const rows = await provider.getChildren(provider.element(root));
      assert.ok(rows.some((row) => row.type === 'message' && row.action === 'nextPage'));
      // A paging marker is not itself a data entry; use an actual image beside it.
      const unpaged = new DatasetBrowser({
        root: () => Promise.resolve(root),
        revision: () => Promise.resolve({ size: 1, modifiedAt: 1 }),
        children: () =>
          Promise.resolve([
            image,
            {
              ...root,
              name: 'page marker',
              paging: { page: 1, failures: 0, next: () => Promise.resolve([]) },
            },
          ]),
      });
      unpaged.register(root);
      const partial = new DatasetTreeProvider(unpaged);
      try {
        const [resource] = await partial.getChildren(partial.element(root));
        assert.equal((resource as EntryElement).acquisition, undefined);
        assert.equal(
          partial.getTreeItem(resource).collapsibleState,
          vscode.TreeItemCollapsibleState.None,
        );
      } finally {
        partial.dispose();
      }
    } finally {
      provider.dispose();
    }
  });
});

suite('Logical metadata-first ordering', () => {
  test('metadata precedes session, modality and acquisition subtrees while scans retain semantic order', async () => {
    const { provider } = await vscode.extensions
      .getExtension<{ provider: DatasetTreeProvider }>(extensionId)!
      .activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-logical-order-'));
    let root: DirectoryEntry | undefined;
    try {
      const func = join(folder, 'sub-01', 'ses-02', 'func');
      await mkdir(func, { recursive: true });
      for (const [path, content] of [
        ['dataset_description.json', '{}'],
        ['sub-01/sub-01_sessions.tsv', 'session_id\nses-02'],
        ['sub-01/ses-02/sub-01_ses-02_scans.tsv', 'filename\nfunc/fixture'],
        ['sub-01/ses-02/func/task-rest_bold.json', '{"TaskName":"Rest"}'],
        ['sub-01/ses-02/func/sub-01_ses-02_task-rest_run-10_bold.nii', ''],
        ['sub-01/ses-02/func/sub-01_ses-02_task-rest_run-02_bold.nii', ''],
        ['sub-01/ses-02/func/sub-01_ses-02_acq-highres_T1w.nii', ''],
      ])
        await writeFile(join(folder, path), content);
      root = await vscode.commands.executeCommand<DirectoryEntry>(
        'bidsExplorer.addDataset',
        vscode.Uri.file(folder),
      );
      assert.ok(root);
      const top = await provider.getChildren(provider.element(root));
      assert.equal((top[0] as EntryElement).entry.name, 'dataset_description.json');
      const subject = top.find((row) => row.type === 'entry' && row.entry.name === 'sub-01')!;
      const subjectRows = await provider.getChildren(subject);
      assert.equal((subjectRows[0] as EntryElement).entry.name, 'sub-01_sessions.tsv');
      const session = subjectRows.find(
        (row) => row.type === 'entry' && row.entry.name === 'ses-02',
      )!;
      const sessionRows = await provider.getChildren(session);
      assert.equal((sessionRows[0] as EntryElement).entry.name, 'sub-01_ses-02_scans.tsv');
      const modality = sessionRows.find(
        (row) => row.type === 'entry' && row.entry.name === 'func',
      )!;
      const rows = await provider.getChildren(modality);
      assert.equal((rows[0] as EntryElement).entry.name, 'task-rest_bold.json');
      assert.ok(rows.slice(1).every((row) => row.type === 'entry' && row.acquisition));
      assert.deepEqual(
        rows.slice(1).map((row) => provider.getTreeItem(row).label),
        ['BOLD', 'BOLD', 'T1-weighted'],
      );
      assert.match(String(provider.getTreeItem(rows[1]).description), /Run 02/);
      assert.match(String(provider.getTreeItem(rows[2]).description), /Run 10/);
    } finally {
      if (root) {
        provider.browser.remove(root);
        provider.registrationChanged();
      }
      await rm(folder, { recursive: true, force: true });
    }
  });
});
