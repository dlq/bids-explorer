import { strict as assert } from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { entryArchiveUri } from '../../core/archiveUri';
import type { DirectoryEntry, DirectorySource } from '../../core/directory';
import { findRecordedScan } from '../../core/scanNavigation';
import type { TextSnapshot } from '../../core/textSnapshot';
import { LogicalDirectorySource } from '../../sources/logicalDirectory';
import { readTextSnapshot } from '../../sources/textSnapshotReader';
import { squashfsFiles } from '../squashfsFixture';
import { tarFixture, tarRecord } from '../tarFixture';

const datasetUri = 'file:///study';
const revision = { size: 10, modifiedAt: 1 };
const entry = (
  relativePath: string,
  kind: DirectoryEntry['kind'] = 'directory',
): DirectoryEntry => ({
  datasetUri,
  relativePath,
  uri: relativePath ? datasetUri + '/' + relativePath : datasetUri,
  name: relativePath.split('/').at(-1)!,
  kind,
});
const root = entry('');
const subject = entry('sub-01');
const table = entry('sub-01/sub-01_scans.tsv', 'file');
const modality = entry('sub-01/anat');
const target = entry('sub-01/anat/sub-01_T1w.nii', 'file');
const filename = 'anat/sub-01_T1w.nii';
const snapshot: TextSnapshot = { text: '', sourceUri: table.uri, revision, capturedAt: '' };
const archive = (source: DirectoryEntry, memberPath: string, memberIndex = 0): DirectoryEntry => ({
  ...source,
  archive: {
    sourceUri: 'file:///study/data.zip',
    containerPath: 'data.zip',
    memberPath,
    memberIndex,
    revision,
  },
});

function fixture() {
  const branches = new Map<string, DirectoryEntry[]>([
    ['', [subject]],
    [subject.relativePath, [table, modality]],
    [modality.relativePath, [target]],
  ]);
  const reads: string[] = [];
  const source: DirectorySource = {
    root() {
      return Promise.resolve(root);
    },
    children(parent) {
      reads.push(parent.relativePath);
      const list = branches.get(parent.relativePath);
      return list ? Promise.resolve(list) : Promise.reject(new Error('Unreadable'));
    },
    revision() {
      return Promise.resolve(revision);
    },
  };
  const find = (
    recorded = filename,
    data = snapshot,
    path = table.relativePath,
    signal = new AbortController().signal,
  ) => findRecordedScan(source, root, path, data, recorded, signal);
  return { branches, reads, source, find };
}

void test('follows only the exact relative branch and retains physical duplicate archive ordinals', async () => {
  const { branches, reads, find } = fixture();
  const first = archive(target, 'wrapper/sub-01/anat/sub-01_T1w.nii', 7);
  const second = archive(target, first.archive!.memberPath, 8);
  branches.set(modality.relativePath, [
    target,
    first,
    second,
    first,
    entry(target.relativePath + '.gz', 'file'),
  ]);
  const result = await find();
  assert.equal(result.status, 'found');
  if (result.status !== 'found') return;
  assert.deepEqual(result.entries, [target, first, second]);
  assert.deepEqual(result.ancestors, [root, subject, modality]);
  assert.equal(result.unchecked, false);
  assert.equal(result.unreadable, false);
  assert.deepEqual(reads, ['', subject.relativePath, modality.relativePath]);
});

void test('uses the archived table’s physical identity and container revision', async () => {
  const { branches, find, source } = fixture();
  const archived = archive(table, 'wrapper/sub-01/sub-01_scans.tsv', 4);
  branches.set(subject.relativePath, [table, archived, modality]);
  const data = {
    ...snapshot,
    archiveSource: archived.archive as NonNullable<TextSnapshot['archiveSource']>,
    revision: { size: 42, modifiedAt: 1 },
  };
  assert.equal((await find(filename, data)).status, 'found');
  for (const archiveSource of [
    { ...data.archiveSource, sourceUri: 'file:///other.zip' },
    { ...data.archiveSource, memberPath: 'other.tsv' },
    { ...data.archiveSource, memberIndex: 5 },
  ]) {
    assert.equal((await find(filename, { ...data, archiveSource })).status, 'stale');
  }
  source.revision = () => Promise.resolve({ ...revision, modifiedAt: 2 });
  assert.equal((await find(filename, data)).status, 'stale');
  source.revision = () => Promise.reject(new Error('Unavailable'));
  assert.equal((await find()).status, 'unreadable');
});

void test('rejects unsafe references before reading and blocks nested dataset boundaries', async () => {
  const { branches, reads, find } = fixture();
  for (const filename of [
    '',
    'n/a',
    '../outside.nii',
    '/outside.nii',
    'file:///outside.nii',
    'https://example.org/outside.nii',
    'C:\\outside.nii',
    'anat//scan.nii',
  ]) {
    assert.equal((await find(filename)).status, 'invalid');
  }
  assert.deepEqual(reads, []);
  assert.equal((await find('a/'.repeat(24) + 'scan.nii')).status, 'unchecked');
  branches.set(modality.relativePath, [
    target,
    entry('sub-01/anat/dataset_description.json', 'file'),
  ]);
  assert.equal((await find()).status, 'invalid');
  branches.set(modality.relativePath, [
    target,
    entry('sub-01/anat/dataset_description.json', 'symlink'),
  ]);
  assert.equal((await find()).status, 'invalid');
});

void test('separates missing, unreadable, unchecked and stale scope', async () => {
  const { branches, find } = fixture();
  assert.equal((await find('anat/Sub-01_T1w.nii')).status, 'missing');
  assert.equal((await find('func/scan.nii')).status, 'missing');
  assert.equal((await find(filename, snapshot, 'sub-02/sub-02_scans.tsv')).status, 'unchecked');
  branches.set(subject.relativePath, [modality]);
  assert.equal((await find()).status, 'stale');
  branches.set(subject.relativePath, [table, { ...modality, kind: 'symlink' }]);
  assert.equal((await find()).status, 'unreadable');
  branches.set(subject.relativePath, [table, modality, { ...modality, uri: 'file:///second' }]);
  assert.equal((await find()).status, 'unchecked');
  branches.set(subject.relativePath, [table, modality]);
  branches.delete(modality.relativePath);
  assert.equal((await find()).status, 'unreadable');
  branches.set(modality.relativePath, [{ ...target, kind: 'symlink' }]);
  assert.equal((await find()).status, 'unreadable');
  const pending = archive(entry('sub-01/anat/data.zip'), '');
  branches.set(modality.relativePath, [pending]);
  assert.equal((await find()).status, 'unchecked');
  branches.set(modality.relativePath, [
    { ...pending, logical: { kind: 'overlay', sources: [pending] } },
    target,
    {
      ...entry('sub-01/anat/page'),
      paging: { page: 2, failures: 1, next: () => Promise.resolve([]) },
    },
  ]);
  const partial = await find();
  assert.equal(partial.status, 'found');
  if (partial.status === 'found') {
    assert.equal(partial.unchecked, true);
    assert.equal(partial.unreadable, true);
  }
  branches.set(modality.relativePath, [
    { ...entry('page'), name: target.name, paging: { page: 2, failures: 0 } },
  ]);
  assert.equal((await find()).status, 'unchecked');
});

void test('locates directory recordings and checks their dataset boundaries', async () => {
  const { branches, find } = fixture();
  const directory = entry('sub-01/anat/sub-01_meg.ds');
  const physical = archive(directory, 'wrapper/sub-01_meg.ds');
  const provisional = archive(directory, '');
  const logical: DirectoryEntry = {
    ...directory,
    logical: { kind: 'overlay', sources: [directory, physical, provisional] },
  };
  branches.set(modality.relativePath, [logical]);
  assert.equal((await find('anat/sub-01_meg.ds')).status, 'unreadable');
  branches.set(directory.relativePath, []);
  const result = await find('anat/sub-01_meg.ds');
  assert.equal(result.status, 'found');
  if (result.status === 'found') {
    assert.equal(result.entries.length, 2);
    assert.equal(result.unchecked, true);
    assert.deepEqual(result.directories, [logical]);
  }
  branches.set(directory.relativePath, [
    entry(directory.relativePath + '/dataset_description.json', 'file'),
  ]);
  assert.equal((await find('anat/sub-01_meg.ds')).status, 'invalid');
});

void test('stops a cancelled lookup', async () => {
  const { find, source } = fixture();
  const controller = new AbortController();
  source.children = () => {
    controller.abort();
    return Promise.reject(new Error('Interrupted read'));
  };
  await assert.rejects(find(filename, snapshot, table.relativePath, controller.signal), {
    name: 'AbortError',
  });
});

void test('follows an archived scans table in a wrapped tar or a SquashFS shard', async () => {
  const name = 'sub-01/sub-01_scans.tsv';
  const files = [
    { name, text: 'filename\n' + filename + '\n' },
    { name: target.relativePath, text: 'scan' },
  ];
  const fixtures = [
    [
      'data.tar',
      tarFixture(
        tarRecord('wrapper/dataset_description.json', Buffer.from('{}')),
        ...files.map(({ name, text }) => tarRecord('wrapper/' + name, Buffer.from(text))),
      ),
    ],
    [
      'data.squashfs',
      squashfsFiles([
        { name: target.name, text: 'scan' },
        { name: 'sub-01_scans.tsv', text: 'filename\n' + target.name + '\n' },
      ]),
    ],
  ] as const;
  for (const [container, bytes] of fixtures) {
    const folder = await mkdtemp(join(tmpdir(), 'bids-scan-archives-'));
    try {
      await writeFile(join(folder, container), bytes);
      const source = new LogicalDirectorySource();
      const signal = new AbortController().signal;
      const root = await source.root(pathToFileURL(folder).href);
      const branch = container.endsWith('.tar')
        ? (await source.children(root, signal)).find((entry) => entry.name === subject.name)
        : root;
      assert.ok(branch);
      const table = (await source.children(branch, signal)).find(
        (entry) => entry.name === 'sub-01_scans.tsv',
      );
      assert.ok(table);
      const snapshot = await readTextSnapshot(entryArchiveUri(table), signal);
      const result = await findRecordedScan(
        source,
        root,
        table.relativePath,
        snapshot,
        container.endsWith('.tar') ? filename : target.name,
        signal,
      );
      assert.equal(result.status, 'found');
      if (result.status === 'found') {
        assert.equal(result.entries.length, 1);
        assert.equal(
          (await readTextSnapshot(entryArchiveUri(result.entries[0]), signal)).text,
          'scan',
        );
      }
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
});
