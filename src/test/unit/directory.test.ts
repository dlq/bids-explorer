import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  describeEntry,
  isRecognizedBidsEntry,
  recognizableEntries,
  folderEntities,
  entryKey,
  orderEntries,
  type DirectoryEntry,
} from '../../core/directory';
import {
  LocalDirectorySource,
  directoryRoot,
  recognizeLocalDataset,
} from '../../sources/localDirectory';

const signal = (): AbortSignal => new AbortController().signal;
const source = new LocalDirectorySource();
const node = (name: string, kind: DirectoryEntry['kind'] = 'directory'): DirectoryEntry => ({
  datasetUri: 'file:///data',
  uri: 'file:///data/' + name,
  relativePath: name,
  name,
  kind,
});

void test('canonical labels do not normalize ambiguous names or hide physical folders', () => {
  const cases: [DirectoryEntry, string][] = [
    [directoryRoot(pathToFileURL(tmpdir()).toString()), 'Dataset'],
    [node('sub-001'), 'Participant'],
    [node('ses-retest'), 'Session'],
    [node('derivatives'), 'Derivatives'],
    [node('anat'), 'Anatomical'],
    [node('func'), 'Functional'],
    [node('dwi'), 'Diffusion'],
    [node('fmap'), 'Field maps'],
    [node('perf'), 'Perfusion'],
    [node('eeg'), 'EEG'],
    [node('meg'), 'MEG'],
    [node('ieeg'), 'Intracranial EEG'],
    [node('pet'), 'PET'],
    [node('notes'), 'Folder'],
    [node('sub-001_ses-02'), 'Folder'],
    [{ ...node('derivatives'), relativePath: 'pipeline/derivatives' }, 'Folder'],
    [node('sub-01', 'file'), 'file'],
    [node('link', 'symlink'), 'symlink'],
  ];
  for (const [entry, expected] of cases) assert.equal(describeEntry(entry), expected);
  assert.notEqual(
    entryKey(node('sub-01')),
    entryKey({ ...node('sub-01'), datasetUri: 'file:///other' }),
  );
});

void test('cooperative ordering handles empty, odd and multiple merge runs with natural directory-first order', async () => {
  assert.deepEqual(await orderEntries([], signal()), []);
  const entries = Array.from({ length: 800 }, (_, i) => node(`sub-${800 - i}`));
  entries.push(node('a.json', 'file'), node('b.json', 'file'));
  const ordered = await orderEntries(entries, signal());
  assert.equal(ordered.length, 802);
  assert.deepEqual(
    ordered.slice(0, 3).map((e) => e.name),
    ['sub-1', 'sub-2', 'sub-3'],
  );
  assert.deepEqual(
    ordered.slice(-2).map((e) => e.name),
    ['a.json', 'b.json'],
  );
  assert.equal(entries[0].name, 'sub-800');
  assert.ok(Object.isFrozen(ordered));
  const odd = await orderEntries(entries.slice(0, 600), signal());
  assert.equal(odd.length, 600);
});

void test('ordering yields to cancellation before and during work', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(orderEntries([node('a')], controller.signal), { name: 'AbortError' });
  await assert.rejects(orderEntries([], controller.signal), { name: 'AbortError' });
  const during = new AbortController();
  const promise = orderEntries(
    Array.from({ length: 2000 }, (_, i) => node(String(i))),
    during.signal,
  );
  setImmediate(() => during.abort());
  await assert.rejects(promise, { name: 'AbortError' });
});

void test('directory source reads only requested children, preserves arbitrary names and never modifies content', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bids-directory-'));
  try {
    for (const path of [
      'sub-01/anat',
      'sub-02/ses-test/func',
      'derivatives/pipeline/sub-01/anat',
      'unfamiliar',
    ])
      await mkdir(join(folder, path), { recursive: true });
    const special = 'spaces # % ü.json';
    await writeFile(join(folder, special), '{}\n');
    await writeFile(join(folder, 'sub-01/anat/sub-01_T1w.json'), '{"Modality":"MR"}\n');
    const inventory = async (path: string): Promise<string[]> => {
      const rows: string[] = [];
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const file = join(path, entry.name);
        if (entry.isDirectory())
          rows.push(...(await inventory(file)).map((value) => entry.name + '/' + value));
        else
          rows.push(
            entry.name +
              ':' +
              createHash('sha256')
                .update(await readFile(file))
                .digest('hex'),
          );
      }
      return rows.sort();
    };
    const before = await inventory(folder);
    const root = await source.root(pathToFileURL(folder).toString() + '/');
    assert.equal(root.uri, pathToFileURL(folder).toString());
    const children = await source.children(root, signal());
    assert.equal(children.length, 5);
    assert.ok(!children.some((e) => e.relativePath.includes('/')));
    const subject = children.find((e) => e.name === 'sub-01')!;
    const anatomy = (await source.children(subject, signal()))[0];
    assert.equal(anatomy.relativePath, 'sub-01/anat');
    assert.equal(
      (await source.children(anatomy, signal()))[0].relativePath,
      'sub-01/anat/sub-01_T1w.json',
    );
    const file = children.find((e) => e.name === special)!;
    assert.equal(fileURLToPath(file.uri), join(folder, special));
    assert.deepEqual(await readFile(fileURLToPath(file.uri), 'utf8'), '{}\n');
    assert.equal((await source.revision(file)).size, 3);
    assert.ok((await source.revision(file)).modifiedAt > 0);
    assert.deepEqual(await inventory(folder), before);
    await assert.rejects(source.root(file.uri), /ordinary directory/);
    await assert.rejects(source.children(file, signal()), /ordinary directory/);
    await assert.rejects(source.root(pathToFileURL(join(folder, 'missing')).toString()), {
      code: 'ENOENT',
    });
    const canceled = new AbortController();
    canceled.abort();
    await assert.rejects(source.children(root, canceled.signal), { name: 'AbortError' });
    assert.throws(() => directoryRoot('https://example.com/data'));
    assert.equal(directoryRoot(pathToFileURL(parse(folder).root).toString()).kind, 'directory');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

void test(
  'symlinks and special files are visible but are never treated as ordinary files/directories',
  { skip: process.platform === 'win32' },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), 'bids-links-'));
    try {
      await mkdir(join(folder, 'actual'));
      await symlink(join(folder, 'actual'), join(folder, 'linked'));
      await promisify(execFile)('mkfifo', [join(folder, 'socket')]);
      const root = await source.root(pathToFileURL(folder).toString());
      const children = await source.children(root, signal());
      const link = children.find((e) => e.name === 'linked')!;
      assert.equal(link.kind, 'symlink');
      assert.equal(children.find((e) => e.name === 'socket')!.kind, 'other');
      await assert.rejects(source.root(link.uri), /ordinary directory/);
      await assert.rejects(source.children(link, signal()), /ordinary directory/);
      await assert.rejects(source.revision(link), /Symbolic links/);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);

void test('listing a large directory remains shallow and can be canceled after IO begins', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bids-wide-'));
  try {
    await Promise.all(Array.from({ length: 1025 }, (_, i) => mkdir(join(folder, `sub-${i}`))));
    const root = await source.root(pathToFileURL(folder).toString());
    const children = await source.children(root, signal());
    assert.equal(children.length, 1025);
    assert.ok(children.every((e) => e.kind === 'directory' && !e.relativePath.includes('/')));
    const controller = new AbortController();
    const pending = source.children(root, controller.signal);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

void test('source details preserve explicit folder entities and leading zeros without deriving them from filenames', () => {
  assert.deepEqual(
    folderEntities({
      ...node('sub-001_ses-test_T1w.json', 'file'),
      relativePath: 'sub-001/ses-test/anat/sub-001_ses-test_T1w.json',
    }),
    [
      { entity: 'subject', value: '001', originalFolderPath: 'sub-001' },
      { entity: 'session', value: 'test', originalFolderPath: 'sub-001/ses-test' },
    ],
  );
  assert.deepEqual(folderEntities(node('sub-001', 'file')), []);
  assert.deepEqual(folderEntities({ ...node('root'), relativePath: '' }), []);
  assert.deepEqual(folderEntities(node('ses-01')), [
    { entity: 'session', value: '01', originalFolderPath: 'ses-01' },
  ]);
  assert.deepEqual(folderEntities(node('sub-001_ses-2')), []);
});

void test('BIDS projection excludes administrative and unfamiliar entries without validating or altering the physical source', async () => {
  const folder = (path: string): DirectoryEntry => ({
    ...node(path.split('/').at(-1)!),
    relativePath: path,
  });
  const file = (path: string): DirectoryEntry => ({ ...folder(path), kind: 'file' });
  const visible = [
    folder(''),
    folder('sub-01'),
    folder('sub-01/ses-test'),
    folder('sub-01/anat'),
    folder('sub-01/ses-test/func'),
    folder('derivatives'),
    folder('derivatives/fmriprep'),
    folder('derivatives/fmriprep/sub-01'),
    folder('derivatives/fmriprep/sub-01/ses-test/anat'),
    file('dataset_description.json'),
    file('participants.tsv'),
    file('README'),
    file('CHANGES'),
    file('task-rhyme_bold.json'),
    file('dwi.bval'),
    file('sub-01/sub-01_sessions.tsv'),
    file('sub-01/anat/sub-01_T1w.nii.gz'),
    file('derivatives/fmriprep/dataset_description.json'),
    { ...folder('sub-linked'), kind: 'symlink' as const },
    { ...file('sub-01/anat/sub-01_T1w.nii.gz'), kind: 'symlink' as const },
  ];
  const hidden = [
    folder('.datalad'),
    file('.DS_Store'),
    file('.datalad/config'),
    folder('notes'),
    folder('anat'),
    folder('sub-01/notes'),
    folder('sub-01/ses-test/notes'),
    folder('sub-01/anat/arbitrary'),
    folder('sub-01_ses-test'),
    file('notes.txt'),
    file('sub-01/README'),
    file('sub-01/anat/image.json'),
    { ...folder('sub-01'), kind: 'other' as const },
    { ...folder('link'), kind: 'symlink' as const },
  ];
  for (const entry of visible) assert.equal(isRecognizedBidsEntry(entry), true, entry.relativePath);
  for (const entry of hidden) assert.equal(isRecognizedBidsEntry(entry), false, entry.relativePath);
  const physical = [...visible, ...hidden];
  assert.deepEqual(await recognizableEntries(physical, signal()), visible);
  assert.equal(physical.length, visible.length + hidden.length);
  const canceled = new AbortController();
  canceled.abort();
  await assert.rejects(recognizableEntries(physical, canceled.signal), { name: 'AbortError' });
  await assert.rejects(recognizableEntries([], canceled.signal), { name: 'AbortError' });
  assert.equal(describeEntry(folder('derivatives/fmriprep')), 'Pipeline');
});

void test('automatic recognition checks only root marker metadata without parsing or traversing data', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bids-recognition-'));
  try {
    const uri = pathToFileURL(folder).toString();
    assert.equal(await recognizeLocalDataset(uri), undefined);
    await mkdir(join(folder, 'nested'));
    await writeFile(join(folder, 'nested', 'dataset_description.json'), '{}');
    assert.equal(await recognizeLocalDataset(uri), undefined);
    await writeFile(
      join(folder, 'dataset_description.json'),
      'Not valid JSON; recognition is not validation.',
    );
    const before = await readFile(join(folder, 'dataset_description.json'), 'utf8');
    const calls: string[] = [];
    const detected = await recognizeLocalDataset(uri, async (path) => {
      calls.push(path);
      return lstat(path);
    });
    assert.equal(detected?.uri, uri);
    assert.deepEqual(calls, [folder, join(folder, 'dataset_description.json')]);
    assert.equal(await readFile(join(folder, 'dataset_description.json'), 'utf8'), before);
    assert.equal((await recognizeLocalDataset(uri))?.uri, uri);
    await assert.rejects(recognizeLocalDataset(pathToFileURL(join(folder, 'absent')).toString()), {
      code: 'ENOENT',
    });
    assert.equal(
      await recognizeLocalDataset(
        pathToFileURL(join(folder, 'dataset_description.json')).toString(),
      ),
      undefined,
    );
    assert.equal(await recognizeLocalDataset('https://example.com/dataset'), undefined);
    await assert.rejects(
      recognizeLocalDataset(uri, (path) =>
        path === folder
          ? lstat(path)
          : Promise.reject(Object.assign(new Error('denied'), { code: 'EACCES' })),
      ),
      /denied/,
    );
    await assert.rejects(
      recognizeLocalDataset(uri, (path) =>
        path === folder ? lstat(path) : Promise.reject(new Error('unknown IO error')),
      ),
      /unknown IO error/,
    );
    await rm(join(folder, 'dataset_description.json'));
    await mkdir(join(folder, 'dataset_description.json'));
    assert.equal(await recognizeLocalDataset(uri), undefined);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

void test(
  'automatic recognition never follows symbolic-link roots or markers',
  { skip: process.platform === 'win32' },
  async () => {
    const folder = await mkdtemp(join(tmpdir(), 'bids-recognition-links-'));
    try {
      await mkdir(join(folder, 'data'));
      await writeFile(join(folder, 'descriptor.json'), '{}');
      await symlink(
        join(folder, 'descriptor.json'),
        join(folder, 'data', 'dataset_description.json'),
      );
      await symlink(join(folder, 'data'), join(folder, 'link'));
      assert.equal(
        await recognizeLocalDataset(pathToFileURL(join(folder, 'data')).toString()),
        undefined,
      );
      assert.equal(
        await recognizeLocalDataset(pathToFileURL(join(folder, 'link')).toString()),
        undefined,
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
);
