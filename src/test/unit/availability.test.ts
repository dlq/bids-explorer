import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  availabilityBrowseMatches,
  availabilityMatches,
  availabilityModalities,
  availabilityPage,
  datasetAvailability,
} from '../../core/availability';
import type { DirectoryEntry, DirectorySource } from '../../core/directory';
import { logicalFolder } from '../../core/logicalLayout';

const root: DirectoryEntry = {
  datasetUri: 'file:///example',
  uri: 'file:///example',
  relativePath: '',
  name: 'example',
  kind: 'directory',
};
const dir = (relativePath: string): DirectoryEntry => ({
  ...root,
  relativePath,
  name: relativePath.split('/').at(-1)!,
});
const file = (relativePath: string): DirectoryEntry => ({ ...dir(relativePath), kind: 'file' });
const subject = (parent: DirectoryEntry, id: string) =>
  logicalFolder(
    parent,
    'sub-' + id,
    'subject',
    [dir([parent.relativePath, 'sub-' + id].filter(Boolean).join('/'))],
    id,
  );
const signal = new AbortController().signal;

function fixture(entries: ReadonlyMap<string, DirectoryEntry[]>): DirectorySource {
  return {
    root: () => Promise.resolve(root),
    revision: () => Promise.resolve({ size: 0, modifiedAt: 0 }),
    children: (entry) => {
      const rows = entries.get(entry.relativePath);
      return rows ? Promise.resolve(rows) : Promise.reject(new Error('unavailable'));
    },
  };
}

void test('availability separates positive, absent and uninspected data within each source', async () => {
  const derivatives = dir('derivatives');
  const pipeline = dir('derivatives/preproc');
  const [one, two] = [subject(root, '01'), subject(root, '02')];
  const derived = subject(pipeline, '01');
  const source = fixture(
    new Map([
      ['', [one, two, derivatives]],
      ['derivatives', [pipeline]],
      [pipeline.relativePath, [derived]],
      [one.relativePath, [dir('sub-01/ses-01'), dir('sub-01/ses-02')]],
      [
        'sub-01/ses-01',
        [dir('sub-01/ses-01/anat'), dir('sub-01/ses-01/func'), dir('sub-01/ses-01/dwi')],
      ],
      ['sub-01/ses-01/anat', [file('sub-01/ses-01/anat/sub-01_ses-01_T1w.nii')]],
      ['sub-01/ses-01/func', [file('sub-01/ses-01/func/sub-01_ses-01_task-rest_bold.nii')]],
      ['sub-01/ses-02', [file('sub-01/ses-02/sub-01_ses-02_scans.tsv')]],
      [two.relativePath, [file('sub-02/sub-02_T1w.nii.gz')]],
      [derived.relativePath, [dir('derivatives/preproc/sub-01/ses-02')]],
    ]),
  );
  const result = await datasetAvailability(source, root, signal);
  assert.equal(result.partial, true);
  assert.deepEqual(result.columns, ['No session', 'ses-01', 'ses-02']);
  assert.deepEqual(result.sources, ['Raw', 'preproc']);
  const missing = { modalities: [], complete: true };
  const unchecked = { modalities: [], complete: false };
  assert.deepEqual(
    availabilityPage(result, [0, 1], 0).flatMap(({ sources }) =>
      sources.map((row) => [row.sourceIndex, ...row.cells]),
    ),
    [
      [0, missing, { modalities: ['anat', 'func'], complete: false }, missing],
      [1, missing, missing, unchecked],
      [0, { modalities: ['Other'], complete: true }, missing, missing],
      [1, missing, missing, missing],
    ],
  );
  await assert.rejects(datasetAvailability(source, root, AbortSignal.abort()), {
    name: 'AbortError',
  });
});

void test('availability bounds listing work and leaves unverified archive and paged evidence unknown', async () => {
  const participants = Array.from({ length: 25 }, (_, i) => subject(root, String(i)));
  const derivatives = dir('derivatives');
  const pipelines = Array.from({ length: 9 }, (_, i) => dir('derivatives/p' + i));
  const base = new Map<string, DirectoryEntry[]>([
    ['', [...participants, derivatives]],
    ['derivatives', pipelines],
  ]);
  for (const pipeline of pipelines) {
    const candidate = subject(pipeline, '0');
    const archive = {
      ...candidate.logical!.sources[0],
      archive: {
        sourceUri: 'file:///example/archive.zip',
        containerPath: 'archive.zip',
        memberPath: '',
      },
    };
    base.set(pipeline.relativePath, [
      logicalFolder(pipeline, candidate.name, 'subject', [archive], '0'),
    ]);
  }
  const first = participants[0];
  base.set(first.relativePath, [
    { ...dir('page'), paging: { page: 1, failures: 1 } },
    ...Array.from({ length: 33 }, (_, i) => dir(first.relativePath + '/ses-' + i)),
  ]);
  for (let i = 0; i < 33; i++) base.set(first.relativePath + '/ses-' + i, []);
  for (const participant of participants.slice(1)) {
    const folders = Array.from({ length: participant === participants[1] ? 260 : 20 }, (_, i) =>
      dir(participant.relativePath + '/anat' + i),
    );
    // Canonical modality branches have recognized names.
    base.set(
      participant.relativePath,
      folders.map((folder) => ({
        ...folder,
        relativePath: participant.relativePath + '/anat',
        name: 'anat',
      })),
    );
    base.set(participant.relativePath + '/anat', []);
  }
  const result = await datasetAvailability(fixture(base), root, signal);
  assert.equal(result.participants.length, 25);
  assert.equal(result.sources.length, 10);
  assert.equal(result.columns.length, 33);
  assert(result.partial);
  const page = availabilityPage(result, [0, 24], 0);
  assert(page[0].sources[1].cells.every((cell) => !cell.complete && !cell.modalities.length));
  assert(page[1].sources[0].cells.some((cell) => !cell.modalities.length));
});

void test('a 50,000-participant index follows source pages and pages only the confirmed matches', async () => {
  const total = 50_000;
  const derivatives = dir('derivatives');
  const pipeline = dir('derivatives/preproc');
  const id = (index: number) => String(index).padStart(5, '0');
  const participantPage = (offset: number): DirectoryEntry[] => [
    ...(offset === 0 ? [derivatives] : []),
    ...Array.from({ length: 200 }, (_, index) => subject(root, id(offset + index))),
    {
      ...dir('page'),
      paging: {
        page: offset / 200 + 1,
        failures: 0,
        next:
          offset + 200 < total ? () => Promise.resolve(participantPage(offset + 200)) : undefined,
      },
    },
  ];
  const source: DirectorySource = {
    ...fixture(new Map()),
    children: (entry) => {
      const path = entry.relativePath;
      if (path === '') return Promise.resolve(participantPage(0));
      if (path === derivatives.relativePath) return Promise.resolve([pipeline]);
      if (path === pipeline.relativePath) {
        return Promise.resolve(
          Array.from({ length: 102 }, (_, index) => subject(pipeline, id(total - 102 + index))),
        );
      }
      const [participant, session, modality] = path
        .replace(/^derivatives\/preproc\//, '')
        .split('/');
      const position = Number(participant.slice(4));
      if (!session) {
        return Promise.resolve([
          dir(path + '/ses-01'),
          ...(position === total - 1 || path.startsWith('derivatives/')
            ? []
            : [dir(path + '/ses-02')]),
        ]);
      }
      if (!modality) return Promise.resolve([dir(path + '/anat')]);
      return Promise.resolve([file(path + '/' + participant + '_' + session + '_T1w.nii')]);
    },
  };
  const index = await datasetAvailability(source, root, signal);
  assert.equal(index.participants.length, total);
  assert.equal(index.partial, false);
  const filter = {
    participant: 'SUB-',
    raw: ['ses-01', 'ses-02'],
    requireOutput: true,
    pipeline: 'preproc',
    session: 'ses-01',
    modality: 'anat',
  };
  const matches = availabilityMatches(index, filter);
  assert.equal(matches.length, 101);
  assert.equal(availabilityPage(index, matches, 0).length, 50);
  assert.equal(availabilityPage(index, matches, 1)[0].participant.name, 'sub-49948');
  assert.deepEqual(
    availabilityPage(index, matches, 2).map((row) => row.participant.name),
    ['sub-49998'],
  );
  assert.equal(availabilityMatches(index, { ...filter, session: 'ses-02' }).length, 0);
  assert.equal(availabilityMatches(index, { ...filter, modality: 'dwi' }).length, 0);
  assert.equal(availabilityMatches(index, { ...filter, pipeline: 'other' }).length, 0);
  assert.equal(availabilityMatches(index, { ...filter, participant: 'unknown' }).length, 0);
  assert.equal(availabilityMatches(index, { ...filter, requireOutput: false }).length, total - 1);
  assert.equal(
    availabilityMatches(index, { ...filter, pipeline: '', session: '', modality: '' }).length,
    101,
  );
});

void test('an unavailable root fails the scan and broken page chains remain partial', async () => {
  await assert.rejects(datasetAvailability(fixture(new Map()), root, signal), /unavailable/);
  const page = { ...dir('page'), paging: { page: 1, failures: 0 } };
  const next = { ...page, paging: { ...page.paging, next: () => Promise.resolve([page]) } };
  const index = await datasetAvailability(fixture(new Map([['', [next]]])), root, signal);
  assert.equal(index.partial, true);
  assert.equal(index.participants.length, 0);
});

void test('availability combines raw sessions with output in an explicitly linked derivative dataset', async () => {
  const pipeline = {
    ...root,
    name: 'preproc',
    uri: 'file:///preproc',
    datasetUri: 'file:///preproc',
  };
  const [one, two] = [subject(root, '01'), subject(root, '02')];
  const derived = subject(pipeline, '01');
  const sessionRows = (id: string) => [dir('sub-' + id + '/ses-01'), dir('sub-' + id + '/ses-02')];
  const raw = fixture(
    new Map([
      ['', [one, two]],
      [one.relativePath, sessionRows('01')],
      [two.relativePath, sessionRows('02')],
      ...['01', '02'].flatMap((id) =>
        ['01', '02'].map((session): [string, DirectoryEntry[]] => {
          const path = `sub-${id}/ses-${session}`;
          return [path, [file(`${path}/sub-${id}_ses-${session}_T1w.nii`)]];
        }),
      ),
    ]),
  );
  const source: DirectorySource = {
    ...raw,
    children: (entry, signal) => {
      if (entry.datasetUri !== pipeline.datasetUri) return raw.children(entry, signal);
      if (entry.relativePath === '') return Promise.resolve([derived]);
      if (entry.relativePath === 'sub-01') return Promise.resolve([dir('sub-01/ses-02')]);
      return Promise.resolve([file('sub-01/ses-02/sub-01_ses-02_T1w.nii')]);
    },
  };
  const filter = {
    participant: '',
    raw: ['ses-01', 'ses-02'],
    requireOutput: true,
    pipeline: 'preproc (file:///preproc)',
    session: 'ses-02',
    modality: '',
  };
  const index = await datasetAvailability(source, root, signal, undefined, {
    roots: [pipeline],
    issues: [],
  });
  assert.deepEqual(availabilityModalities(index), ['Other']);
  assert.deepEqual(
    availabilityBrowseMatches(index, [0, 1], { mode: 'modality', value: 'Other' }),
    [0, 1],
  );
  assert.deepEqual(
    availabilityBrowseMatches(index, [0, 1], { mode: 'modality', value: 'dwi' }),
    [],
  );
  assert.deepEqual(
    availabilityBrowseMatches(index, [0, 1], { mode: 'pipeline', value: filter.pipeline }),
    [0],
  );
  assert.deepEqual(
    availabilityBrowseMatches(index, [1], { mode: 'pipeline', value: filter.pipeline }),
    [],
  );
  assert.deepEqual(
    availabilityBrowseMatches(index, [0, 1], { mode: 'pipeline', value: 'Raw' }),
    [],
  );
  assert.deepEqual(index.sources, ['Raw', filter.pipeline]);
  assert.deepEqual(availabilityMatches(index, filter), [0]);
  assert.deepEqual(
    availabilityMatches(await datasetAvailability(source, root, signal), filter),
    [],
  );

  const unavailable = await datasetAvailability(source, root, signal, undefined, {
    roots: [],
    issues: ['Linked derivative dataset is not registered: file:///preproc'],
  });
  assert.equal(unavailable.partial, true);
  assert.match(unavailable.issues?.[0] ?? '', /not registered/);
});
