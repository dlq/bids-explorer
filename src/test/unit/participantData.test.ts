import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import type { DirectoryEntry, DirectorySource } from '../../core/directory';
import { logicalFolder } from '../../core/logicalLayout';
import {
  isRootParticipant,
  linkedDerivativeDatasets,
  participantPipelines,
  participantDerivativeLayout,
} from '../../core/participantData';
import { LogicalDirectorySource } from '../../sources/logicalDirectory';
import { zipFixture } from '../zipFixture';

const signal = new AbortController().signal;

void test('participant view keeps original raw and derivative branches across loose files and archive members', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bids-participant-view-'));
  try {
    for (const path of [
      'sub-01/ses-1/anat',
      'derivatives/pipe-a/sub-01/ses-2/anat',
      'derivatives/pipe-b/sub-1/anat',
    ])
      await mkdir(join(folder, path), { recursive: true });
    await writeFile(join(folder, 'derivatives/pipe-a/sub-01/ses-2/anat/sub-01_ses-2_T1w.nii'), '');
    await writeFile(
      join(folder, 'wrapped.zip'),
      zipFixture([
        { name: 'derivatives/pipe-c/sub-01/anat/sub-01_T1w.nii' },
        { name: 'derivatives/pipe-c/sub-01/anat/sub-01_T1w.nii' },
      ]),
    );
    const source = new LogicalDirectorySource();
    const root = await source.root(pathToFileURL(folder).href);
    const original = (await source.children(root, signal)).find(isRootParticipant)!;
    const result = await participantPipelines(source, root, original, signal);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(
      result.pipelines.map(({ name }) => name),
      ['pipe-a', 'pipe-c'],
    );
    assert.equal(result.pipelines[0].participant.relativePath, 'derivatives/pipe-a/sub-01');
    assert(!isRootParticipant(result.pipelines[0].participant));
    assert.equal((await source.children(original, signal))[0].name, 'ses-1');
    assert.equal((await source.children(result.pipelines[0].participant, signal))[0].name, 'ses-2');
    const [anat] = await source.children(result.pipelines[1].participant, signal);
    const choices = await source.children(anat, signal);
    assert.deepEqual(
      choices.map((row) => row.archive?.memberIndex),
      [0, 1],
    );
    assert(
      choices.every(
        (row) => row.archive?.memberPath === 'derivatives/pipe-c/sub-01/anat/sub-01_T1w.nii',
      ),
    );
    await assert.rejects(participantPipelines(source, root, root, signal), /directly under/);
    await assert.rejects(
      participantPipelines(source, { ...root, datasetUri: 'file:///other' }, original, signal),
      /registered dataset/,
    );
    await assert.rejects(participantPipelines(source, root, original, AbortSignal.abort()), {
      name: 'AbortError',
    });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

void test('participant pipeline discovery preserves verified matches when branches are partial, deferred or inaccessible', async () => {
  const root: DirectoryEntry = {
    datasetUri: 'file:///dataset',
    uri: 'file:///dataset',
    relativePath: '',
    name: 'dataset',
    kind: 'directory',
  };
  const dir = (relativePath: string): DirectoryEntry => ({
    ...root,
    relativePath,
    name: relativePath.split('/').at(-1)!,
  });
  const subject = logicalFolder(root, 'sub-01', 'subject', [dir('sub-01')], '01');
  const derivatives = dir('derivatives');
  const pipelines = Array.from({ length: 33 }, (_, i) => dir('derivatives/p' + i));
  const canonical = dir('derivatives/p0/sub-01');
  const provisional = {
    ...dir('derivatives/p0/sub-01.zip'),
    archive: {
      sourceUri: 'file:///dataset/derivatives/p0/sub-01.zip',
      containerPath: 'derivatives/p0/sub-01.zip',
      memberPath: '',
    },
  };
  const source: DirectorySource = {
    root: () => Promise.resolve(root),
    revision: () => Promise.resolve({ size: 0, modifiedAt: 0 }),
    async children(entry) {
      await Promise.resolve();
      if (entry === root)
        return [derivatives, { ...dir('page'), paging: { page: 1, failures: 1 } }];
      if (entry === derivatives) return pipelines;
      if (entry === pipelines[0])
        return [logicalFolder(entry, 'sub-01', 'subject', [canonical, provisional], '01')];
      if (entry === pipelines[1]) throw new Error('denied');
      if (entry === pipelines[2])
        return [logicalFolder(entry, 'sub-01', 'subject', [provisional], '01')];
      return [];
    },
  };
  const result = await participantPipelines(source, root, subject, signal);
  assert.deepEqual(
    result.pipelines.map(({ name }) => name),
    ['p0'],
  );
  assert.deepEqual(result.pipelines[0].participant.logical?.sources, [canonical]);
  assert.match(result.issues.join('\n'), /dataset root.*not inspected/);
  assert.match(result.issues.join('\n'), /first 32/);
  assert.match(result.issues.join('\n'), /Could not read derivatives\/p1/);
  assert.match(result.issues.join('\n'), /archives in p2/);
  assert.deepEqual(
    await participantPipelines(
      { ...source, children: () => Promise.resolve([]) },
      root,
      subject,
      signal,
    ),
    { pipelines: [], issues: [] },
  );
});

void test('separate derivative roots require an explicit registered link and preserve source identity', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bids-linked-derivatives-'));
  try {
    const raw = join(folder, 'raw');
    const derived = join(folder, 'preproc');
    const unrelated = join(folder, 'unrelated');
    for (const path of [raw, derived, unrelated])
      await mkdir(join(path, 'sub-01', 'anat'), { recursive: true });
    await writeFile(join(derived, 'sub-01/anat/sub-01_T1w.nii'), '');
    const source = new LogicalDirectorySource();
    const [root, pipeline, other] = await Promise.all(
      [raw, derived, unrelated].map((path) => source.root(pathToFileURL(path).href)),
    );
    const registered = [root, pipeline, other];
    const [participant] = await source.children(root, signal);
    for (const setting of [undefined, null, {}, { [root.uri]: pipeline.uri }])
      assert.deepEqual(linkedDerivativeDatasets(root, registered, setting), {
        roots: [],
        issues: [],
      });
    assert.deepEqual(await participantPipelines(source, root, participant, signal), {
      pipelines: [],
      issues: [],
    });

    const absent = pathToFileURL(join(folder, 'absent')).href;
    const setting = {
      [root.uri]: [pipeline.uri, pipeline.uri, root.uri, absent, 123, 'https://invalid'],
    };
    const links = linkedDerivativeDatasets(root, registered, setting);
    assert.deepEqual(links.roots, [pipeline]);
    assert.match(links.issues.join(), /not registered.*absent/);
    const result = await participantPipelines(source, root, participant, signal, links.roots);
    assert.equal(result.pipelines.length, 1);
    assert.equal(result.pipelines[0].participant.datasetUri, pipeline.datasetUri);
    const [anat] = await source.children(result.pipelines[0].participant, signal);
    assert.equal(
      (await source.children(anat, signal))[0].uri,
      pathToFileURL(join(derived, 'sub-01/anat/sub-01_T1w.nii')).href,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

void test('derivative session layout matches exact labels, retains sessionless outputs and performs only shallow participant reads', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bids-derivative-sessions-'));
  try {
    for (const path of [
      'sub-01/ses-01/anat',
      'derivatives/pipeline/sub-01/ses-01/anat',
      'derivatives/pipeline/sub-01/ses-1/anat',
      'derivatives/pipeline/sub-01/ses-03/func',
      'derivatives/pipeline/sub-01/anat',
    ])
      await mkdir(join(folder, path), { recursive: true });
    const source = new LogicalDirectorySource();
    const root = await source.root(pathToFileURL(folder).href);
    const participant = (await source.children(root, signal)).find(isRootParticipant)!;
    const children = source.children.bind(source);
    const seen: string[] = [];
    source.children = (entry, abort) => {
      seen.push(entry.relativePath);
      return children(entry, abort);
    };
    const layout = await participantDerivativeLayout(source, root, participant, signal);
    assert.deepEqual([...layout.sessions.keys()], ['01', '1', '03']);
    assert.equal(layout.sessionless.length, 1);
    assert.equal(
      layout.sessions.get('03')![0].branch.relativePath,
      'derivatives/pipeline/sub-01/ses-03',
    );
    assert.equal(layout.sessions.get('01')![0].branch.name, 'ses-01');
    assert.ok(!seen.some((path) => /ses-|anat|func/.test(path)));
    assert.deepEqual(layout.issues, []);
    source.children = async (entry, abort) => {
      const rows = await children(entry, abort);
      return entry.relativePath === 'derivatives/pipeline/sub-01'
        ? [...rows, { ...participant, paging: { page: 1, failures: 1 } }]
        : rows;
    };
    const partial = await participantDerivativeLayout(source, root, participant, signal);
    assert.equal(partial.sessions.size, 3);
    assert.match(partial.issues.join(), /Some sessions.*not inspected/);
    source.children = (entry, abort) =>
      entry.relativePath === 'derivatives/pipeline/sub-01'
        ? Promise.reject(new Error('denied'))
        : children(entry, abort);
    const failed = await participantDerivativeLayout(source, root, participant, signal);
    assert.equal(failed.sessions.size, 0);
    assert.match(failed.issues.join(), /Could not inspect sessions/);
    const controller = new AbortController();
    source.children = async (entry, abort) => {
      const rows = await children(entry, abort);
      if (entry.relativePath === 'derivatives/pipeline/sub-01') controller.abort();
      return rows;
    };
    await assert.rejects(
      participantDerivativeLayout(source, root, participant, controller.signal),
      /abort/i,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
