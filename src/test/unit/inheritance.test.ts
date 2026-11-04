import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  resolveInheritance,
  inheritanceBoundary,
  type MetadataLevel,
} from '../../core/inheritance';
import { parseJsonMetadata } from '../../core/metadata';
import type { DirectoryEntry } from '../../core/directory';
const signal = () => new AbortController().signal;
const entry = (path: string, kind: DirectoryEntry['kind'] = 'file'): DirectoryEntry => ({
  datasetUri: 'file:///data',
  uri: 'file:///data/' + path,
  relativePath: path,
  name: path.split('/').at(-1)!,
  kind,
});
const target = entry('sub-01/func/sub-01_task-rest_run-01_bold.nii.gz');
const level = (relativePath: string, paths: string[], complete = true): MetadataLevel => ({
  relativePath,
  coverage: complete ? 'complete' : 'incomplete',
  entries: paths.map((path) => entry(path)),
});
const json = (e: DirectoryEntry, text = '{}') =>
  parseJsonMetadata(
    { sourceUri: e.uri, text, revision: { size: text.length, modifiedAt: 1 }, capturedAt: 'now' },
    signal(),
  );
const levels = (root: string[] = [], leaf: string[] = []) => [
  level('', root),
  level('sub-01', []),
  level('sub-01/func', leaf),
];

void test('JSON inheritance replaces top-level values, retains exact tokens, null and full provenance', async () => {
  const result = await resolveInheritance(
    target,
    levels(['task-rest_bold.json'], ['sub-01/func/sub-01_task-rest_run-1_bold.json']),
    (e) =>
      json(
        e,
        e.name.startsWith('task')
          ? '{"RepetitionTime":2,"Object":{"x":1},"Keep":9007199254740993,"Null":1,"__proto__":false}'
          : '{"RepetitionTime":3,"Object":{"y":2},"Null":null}',
      ),
    signal(),
  );
  assert.equal(result.status, 'resolved');
  assert.equal(result.coverage, 'complete');
  assert.deepEqual(result.related, []);
  assert.deepEqual(
    result.fields.map((f) => f.value.valueText),
    ['3', '{"y":2}', '9007199254740993', 'null', 'false'],
  );
  assert.equal(result.fields[0].history.length, 2);
  assert.equal(result.fields[0].history[0].sourceUri, 'file:///data/task-rest_bold.json');
  assert.equal(result.fields[0].value.pointer, '/RepetitionTime');
  assert.ok(Object.isFrozen(result.fields[0].history));
  assert.deepEqual(
    (await resolveInheritance(target, levels(), (e) => json(e), signal())).fields,
    [],
  );
});

void test('matching uses filename entities, suffix and literal labels, ignoring siblings and extra entities', async () => {
  const result = await resolveInheritance(
    target,
    levels([
      'task-rest_bold.json',
      'task-REST_bold.json',
      'sub-001_bold.json',
      'task-rest_acq-extra_bold.json',
      'task-rest_T1w.json',
      'README',
      'bad_token_bold.json',
      'custom-x_bold.json',
      'task-rest_run-x_bold.json',
      'task-rest_bold.tsv',
      'task-rest_bold.bval',
    ]),
    (e) => json(e),
    signal(),
  );
  assert.equal(result.sources.length, 1);
  const noSub = entry('sub-01/func/task-rest_bold.nii');
  assert.equal(
    (await resolveInheritance(noSub, levels(['sub-01_bold.json']), (e) => json(e), signal()))
      .sources.length,
    0,
  );
  const symlinks = levels();
  symlinks[0] = {
    ...symlinks[0],
    entries: [
      entry('bold.json', 'symlink'),
      entry('bold.json', 'directory'),
      entry('bold.json', 'other'),
    ],
  };
  const skipped = await resolveInheritance(target, symlinks, (e) => json(e), signal());
  assert.equal(skipped.sources.length, 0);
  assert.equal(skipped.coverage, 'incomplete');
  assert.match(skipped.issues[0], /symbolic link/);
  for (const name of ['participants.tsv', 'sub-01_scans.tsv.gz']) {
    const t = entry(name);
    assert.equal(inheritanceBoundary(t), '');
    assert.equal(
      (
        await resolveInheritance(
          t,
          [level('', [name.replace(/\.tsv(?:\.gz)?$/, '.json')])],
          (e) => json(e),
          signal(),
        )
      ).sources.length,
      1,
    );
  }
});

void test('ambiguity, unreadable JSON, duplicate keys and partial coverage withhold authoritative fields', async () => {
  const ambiguous = await resolveInheritance(
    target,
    levels(['bold.json', 'task-rest_bold.json']),
    (e) => json(e, '{"x":1}'),
    signal(),
  );
  assert.equal(ambiguous.status, 'unresolved');
  assert.deepEqual(ambiguous.fields, []);
  assert.match(ambiguous.issues[0], /Ambiguous/);
  const duplicate = await resolveInheritance(
    target,
    levels([], ['sub-01/func/bold.json']),
    (e) => json(e, '{"x":1,"x":2}'),
    signal(),
  );
  assert.match(duplicate.issues[0], /Duplicate/);
  const failed = await resolveInheritance(
    target,
    levels(['bold.json']),
    () => Promise.reject(new Error('denied')),
    signal(),
  );
  assert.match(failed.sources[0].error!, /denied/);
  const mismatch = await resolveInheritance(
    target,
    levels(['bold.json']),
    () => json(entry('other.json')),
    signal(),
  );
  assert.match(mismatch.sources[0].error!, /source does not match/);
  const incomplete = levels(['bold.json']);
  incomplete[1] = { ...incomplete[1], coverage: 'incomplete', error: 'denied' };
  const partial = await resolveInheritance(target, incomplete, (e) => json(e), signal());
  assert.equal(partial.coverage, 'incomplete');
  assert.match(partial.issues[0], /denied/);
  incomplete[1] = { ...incomplete[1], error: undefined };
  assert.match(
    (await resolveInheritance(target, incomplete, (e) => json(e), signal())).issues[0],
    /unknown coverage/,
  );
});

void test('DWI companions select the nearest level, exposing ties, absence and unknown coverage independently of JSON', async () => {
  const t = entry('sub-01/dwi/sub-01_dwi.nii');
  const dirs = [
    level('', ['dwi.bval', 'dwi.bvec', 'dwi.json']),
    level('sub-01', []),
    level('sub-01/dwi', ['sub-01/dwi/sub-01_dwi.bval']),
  ];
  const result = await resolveInheritance(
    t,
    dirs,
    () => Promise.reject(new Error('invalid JSON')),
    signal(),
  );
  assert.equal(result.related[0].selected?.name, 'sub-01_dwi.bval');
  assert.equal(result.related[0].candidates.length, 2);
  assert.equal(result.related[1].status, 'resolved');
  dirs[2] = level('sub-01/dwi', ['sub-01/dwi/dwi.bval', 'sub-01/dwi/sub-01_dwi.bval']);
  assert.equal(
    (await resolveInheritance(t, dirs, (e) => json(e), signal())).related[0].status,
    'ambiguous',
  );
  dirs[0] = level('', []);
  assert.equal(
    (await resolveInheritance(t, dirs, (e) => json(e), signal())).related[1].status,
    'absent',
  );
  dirs[0] = level('', [], false);
  assert.equal(
    (await resolveInheritance(t, dirs, (e) => json(e), signal())).related[0].status,
    'unknown',
  );
});

void test('scope and selection constraints reject invalid inventories, unsupported or conflicting targets', async () => {
  for (const path of [
    'sub-01/func/sub-99_bold.nii',
    'sub-01/func/sub-01_sub-01_bold.nii',
    'custom-x_bold.nii',
    'bold.json',
    'derivatives/bold.nii',
    '../bold.nii',
    'task-rest_run-x_bold.nii',
  ])
    assert.throws(() => inheritanceBoundary(entry(path)), /Select/);
  assert.throws(() => inheritanceBoundary(entry('bold.nii', 'symlink')), /Select/);
  const derived = entry('derivatives/demo/sub-01/func/sub-01_bold.nii');
  assert.equal(inheritanceBoundary(derived), 'derivatives/demo');
  const load = (e: DirectoryEntry) => json(e);
  for (const inventory of [
    [],
    Array.from({ length: 129 }, () => level('', [])),
    [level('other', [])],
    [level('', []), level('sub-01/func', [])],
    [level('', [])],
  ])
    await assert.rejects(resolveInheritance(target, inventory, load, signal()));
  await assert.rejects(resolveInheritance(derived, [level('', [])], load, signal()), /boundary/);
  await assert.rejects(
    resolveInheritance(
      target,
      [level('', ['other/bold.json']), ...levels().slice(1)],
      load,
      signal(),
    ),
    /identity/,
  );
  const wrong = levels();
  wrong[0] = { ...wrong[0], entries: [{ ...entry('bold.json'), datasetUri: 'file:///other' }] };
  await assert.rejects(resolveInheritance(target, wrong, load, signal()), /identity/);
  assert.equal(
    (await resolveInheritance(target, levels().slice(1), load, signal())).status,
    'resolved',
  );
});

void test('inspection is bounded and cancellable, including while inventories and loaders are running', async () => {
  const wide = levels();
  wide[0] = { ...wide[0], entries: Array.from({ length: 50001 }, () => entry('README')) };
  await assert.rejects(
    resolveInheritance(target, wide, (e) => json(e), signal()),
    /50,000/,
  );
  const many = levels();
  many[0] = { ...many[0], entries: Array.from({ length: 65 }, () => entry('bold.json')) };
  await assert.rejects(
    resolveInheritance(target, many, (e) => json(e), signal()),
    /64 applicable/,
  );
  const large = await json(entry('bold.json'), '{"x":"' + 'a'.repeat(1024 * 1024 - 16) + '"}');
  const budget = levels();
  budget[0] = { ...budget[0], entries: Array.from({ length: 10 }, () => entry('bold.json')) };
  const capped = await resolveInheritance(target, budget, () => Promise.resolve(large), signal());
  assert.ok(capped.sources.some((s) => s.error?.includes('8 MiB')));
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    resolveInheritance(target, levels(), (e) => json(e), cancelled.signal),
    /abort/i,
  );
  const during = new AbortController();
  await assert.rejects(
    resolveInheritance(
      target,
      levels(['bold.json']),
      () => {
        during.abort();
        return Promise.reject(new Error('aborted'));
      },
      during.signal,
    ),
    /abort/i,
  );
  const scanning = new AbortController();
  const rows = levels();
  rows[0] = { ...rows[0], entries: Array.from({ length: 300 }, () => entry('README')) };
  const pending = resolveInheritance(target, rows, (e) => json(e), scanning.signal);
  scanning.abort();
  await assert.rejects(pending, /abort/i);
  assert.equal(
    (await resolveInheritance(target, rows, (e) => json(e), signal())).status,
    'resolved',
  );
});
