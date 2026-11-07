import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  groupAcquisitions,
  groupEchoCollections,
  compareLogicalEntries,
  acquisitionSummary,
} from '../../core/acquisitions';
import { orderEntries, type DirectoryEntry } from '../../core/directory';
import type { InheritanceResult } from '../../core/inheritance';
import { parseJsonMetadata } from '../../core/metadata';
const file = (name: string): DirectoryEntry => ({
  datasetUri: 'file:///study',
  uri: 'file:///study/sub-01/func/' + name,
  relativePath: 'sub-01/func/' + name,
  name,
  kind: 'file',
});
const signal = () => new AbortController().signal;
void test('acquisitions group exact sibling resources, preserve all source identities and sort by content and numeric run', async () => {
  const names = [
    'sub-01_task-rest_run-10_bold.nii',
    'sub-01_task-rest_run-10_bold.json',
    'sub-01_task-rest_run-10_events.tsv',
    'sub-01_task-rest_run-2_bold.nii',
    'sub-01_task-rest_bold.json',
    'sub-01_dwi.nii.gz',
    'sub-01_dwi.bval',
    'sub-01_dwi.bvec',
  ];
  const entries = names.map(file);
  const projected = await groupAcquisitions(entries, signal());
  assert.equal(projected.length, 4);
  const groups = projected.filter((row) => 'image' in row);
  assert.deepEqual(
    groups.map((group) => group.members.map((entry) => entry.name)),
    [names.slice(1, 3), [], names.slice(6)],
  );
  assert.deepEqual(
    new Set(projected.flatMap((row) => ('image' in row ? [row.image, ...row.members] : [row]))),
    new Set(entries),
  );
  const ordered = await orderEntries(
    groups.map((group) => group.image),
    signal(),
    false,
    compareLogicalEntries,
  );
  assert.deepEqual(
    ordered.map((row) => row.name),
    [names[3], names[0], names[5]],
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(groupAcquisitions(entries, controller.signal), /abort/i);
  assert.deepEqual(await groupAcquisitions([], signal()), []);
});
void test('ambiguous, shared, malformed and conflicting resources stay individually accessible', async () => {
  const image = file('sub-01_task-rest_bold.nii');
  const duplicate = file('sub-01_task-rest_bold.nii.gz');
  const json = file('sub-01_task-rest_bold.json');
  const events = file('sub-01_task-rest_events.tsv');
  assert.deepEqual(await groupAcquisitions([image, duplicate, json, events], signal()), [
    image,
    duplicate,
    json,
    events,
  ]);
  const standalone = [
    file('sub-02_bold.json'),
    file('sub-01_unknown_bold.json'),
    file('sub-01_sub-01_bold.json'),
    file('sub-01_bold'),
    file('README'),
    file('sub-01_T1w.json'),
  ];
  for (const entry of [
    { ...image, kind: 'directory' as const },
    { ...image, logical: { kind: 'resource' as const, conflict: true, sources: [] } },
    {
      ...image,
      archive: {
        sourceUri: 'file:///a.zip',
        containerPath: 'a.zip',
        memberPath: image.name,
        conflict: true,
      },
    },
  ])
    standalone.push(entry);
  assert.deepEqual(await groupAcquisitions(standalone, signal()), standalone);
  // A same-entity anatomical image does not acquire the functional events table.
  const anatomy = file('sub-01_task-rest_T1w.nii');
  const rows = await groupAcquisitions([anatomy, events, json], signal());
  assert.ok('image' in rows[0]);
  assert.deepEqual(rows.slice(1), [events, json]);
  const multiEcho = [
    file('sub-01_task-rest_echo-1_bold.nii'),
    file('sub-01_task-rest_echo-2_bold.nii'),
    events,
  ];
  assert.equal((await groupAcquisitions(multiEcho, signal())).at(-1), events);
});
void test('logical comparison resolves content/type/source ties without normalizing displayed values', () => {
  const base = file('sub-01_T1w.nii');
  const json = file('sub-01_T1w.json');
  assert.notEqual(compareLogicalEntries(base, json), 0);
  assert.notEqual(compareLogicalEntries(base, file('sub-01_T1w.nii.gz')), 0);
  assert.notEqual(compareLogicalEntries({ ...base, datasetUri: 'file:///A' }, base), 0);
  assert.equal(compareLogicalEntries(base, base), 0);
  assert.notEqual(compareLogicalEntries({ ...base, kind: 'directory' }, json), 0);
});
void test('acquisition summaries use only resolved recorded timing fields, with exact source evidence', async () => {
  const source = file('sub-01_task-rest_bold.json');
  const metadata = await parseJsonMetadata(
    {
      sourceUri: source.uri,
      text: '{"RepetitionTime":2,"EchoTime":0.03,"AcquisitionDuration":300}',
      revision: { size: 99, modifiedAt: 1 },
      capturedAt: 'now',
    },
    signal(),
  );
  const result: InheritanceResult = {
    target: file('sub-01_task-rest_bold.nii'),
    status: 'resolved',
    coverage: 'complete',
    issues: [],
    related: [],
    sources: [{ entry: source, level: 'sub-01/func', metadata }],
    fields: metadata.fields.map((value) => ({ key: value.key, value, history: [value] })),
  };
  const summary = acquisitionSummary(result)!;
  assert.equal(summary.text, 'TR 2 s · TE 30 ms · duration 300 s');
  assert.equal(summary.evidence[1].value, '0.03');
  assert.equal(summary.evidence[1].sourceUri, source.uri);
  assert.equal(summary.evidence[1].pointer, '/EchoTime');
  assert.equal(acquisitionSummary({ ...result, status: 'unresolved' }), undefined);
  assert.equal(acquisitionSummary({ ...result, coverage: 'incomplete' }), undefined);
  assert.equal(acquisitionSummary({ ...result, fields: [] }), undefined);
  assert.equal(acquisitionSummary({ ...result, sources: [] }), undefined);
  for (const value of ['0', '-1', '1e999', 'null', '"2"'])
    assert.equal(
      acquisitionSummary({
        ...result,
        fields: [
          {
            ...result.fields[0],
            value: {
              ...result.fields[0].value,
              valueText: value,
              type: value === 'null' ? 'null' : value === '"2"' ? 'string' : 'number',
            },
          },
        ],
      }),
      undefined,
    );
  assert.equal(
    acquisitionSummary({
      ...result,
      fields: [{ ...result.fields[0], value: { ...result.fields[0].value, duplicated: true } }],
    }),
    undefined,
  );
});

void test('multi-echo collections group only otherwise identical siblings with shared resources before echo-specific acquisitions', async () => {
  const entries = [
    file('sub-01_task-rest_run-01_echo-10_bold.nii'),
    file('sub-01_task-rest_run-01_echo-2_bold.nii'),
    file('sub-01_task-rest_run-01_echo-2_bold.json'),
    file('sub-01_task-rest_run-01_events.tsv'),
    file('sub-01_task-rest_run-01_events.json'),
    file('sub-01_task-rest_run-01_bold.json'),
    file('README'),
  ];
  const grouped = await groupAcquisitions(entries, signal());
  const rows = await groupEchoCollections(grouped, signal());
  assert.equal(rows.length, 2);
  const collection = rows.find((row) => 'image' in row && row.echoes)!;
  assert.ok('image' in collection);
  assert.deepEqual(
    collection.echoes!.map((echo) => echo.image),
    [entries[1], entries[0]],
  );
  assert.deepEqual(collection.echoes![0].members, [entries[2]]);
  assert.deepEqual(collection.members, entries.slice(3, 6));
  assert.deepEqual(
    new Set([
      collection.image,
      ...collection.echoes!.flatMap((echo) => [echo.image, ...echo.members]),
      ...collection.members,
      entries[6],
    ]),
    new Set(entries),
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(groupEchoCollections(grouped, controller.signal), /abort/i);
  assert.deepEqual(await groupEchoCollections([], signal()), []);
});
void test('echo collection boundaries preserve runs, parts, ambiguity, malformed indices and physical conflicts', async () => {
  const echo = (value: string, extra = '') =>
    file(`sub-01_task-rest${extra}_echo-${value}_bold.nii`);
  for (const entries of [
    [echo('1')],
    [echo('1'), echo('2', '_run-2')],
    [echo('1', '_part-mag'), echo('2', '_part-phase')],
    [echo('1'), echo('01')],
    [
      echo('1'),
      echo('2'),
      {
        ...echo('1'),
        name: echo('1').name + '.gz',
        uri: echo('1').uri + '.gz',
        relativePath: echo('1').relativePath + '.gz',
      },
    ],
    [echo('1'), echo('2'), echo('custom')],
    [echo('1'), echo('2'), file('sub-01_task-rest_bold.nii')],
    [echo('1'), echo('2'), file('sub-01_unknown_bold.nii')],
    [
      echo('1'),
      echo('2'),
      { ...echo('3'), logical: { kind: 'resource' as const, conflict: true, sources: [] } },
    ],
  ]) {
    const rows = await groupAcquisitions(entries, signal());
    assert.deepEqual(await groupEchoCollections(rows, signal()), rows);
  }
  const a = echo('1');
  const b = echo('2');
  const events = file('sub-01_task-rest_events.tsv');
  const differentDataset = { ...b, datasetUri: 'file:///other' };
  const differentFolder = { ...b, relativePath: 'sub-01/other/' + b.name };
  for (const row of [differentDataset, differentFolder]) {
    const rows = await groupAcquisitions([a, row, events], signal());
    assert.deepEqual(await groupEchoCollections(rows, signal()), rows);
  }
  const extra = file('sub-01_task-rest_echo-1_events.tsv');
  const groups = await groupAcquisitions([a, b, extra], signal());
  const rows = await groupEchoCollections(groups, signal());
  assert.equal(rows.length, 1);
  assert.ok('image' in rows[0]);
  assert.deepEqual(rows[0].members, []);
  assert.deepEqual(rows[0].echoes![0].members, [extra]);
});
