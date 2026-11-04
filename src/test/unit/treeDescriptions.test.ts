import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  descriptionPlan,
  displayDescription,
  jsonDescription,
  tableDescription,
} from '../../core/treeDescriptions';
import { parseJsonMetadata } from '../../core/metadata';
import { parseTable } from '../../core/tables';
import type { DirectoryEntry } from '../../core/directory';
const options = { participantColumn: 'label', sessionColumn: 'label' };
const entry = (path: string, kind: DirectoryEntry['kind'] = 'directory'): DirectoryEntry => ({
  datasetUri: 'file:///data',
  uri: 'file:///data/' + path,
  name: path.split('/').at(-1)!,
  relativePath: path,
  kind,
});
const snapshot = (text: string) => ({
  sourceUri: 'file:///data/source',
  text,
  revision: { size: text.length, modifiedAt: 1 },
  capturedAt: 'now',
});
const signal = () => new AbortController().signal;
void test('tree-description plans recognize dataset/pipeline, task images and explicitly mapped folder labels', () => {
  assert.equal(descriptionPlan(entry(''), options)?.kind, 'dataset');
  assert.equal(descriptionPlan(entry('derivatives/sub-01'), options)?.kind, 'dataset');
  assert.equal(descriptionPlan(entry('sub-01'), options)?.kind, 'participant');
  assert.equal(descriptionPlan(entry('sub-01/ses-002'), options)?.kind, 'session');
  assert.equal(descriptionPlan(entry('sub-01_ses-002'), options)?.kind, 'combined');
  assert.equal(
    descriptionPlan(entry('sub-01_ses-002'), { ...options, participantColumn: '' })?.kind,
    'combined',
  );
  assert.equal(
    descriptionPlan(entry('sub-01/func/sub-01_task-rest_bold.nii.gz', 'file'), options)?.kind,
    'task',
  );
  assert.equal(descriptionPlan(entry('task-rest_bold.nii', 'file'), options)?.kind, 'task');
  for (const path of ['sub-01', 'sub-01/ses-002', 'sub-01_ses-002'])
    assert.equal(
      descriptionPlan(entry(path), { participantColumn: '', sessionColumn: '' }),
      undefined,
    );
  for (const [path, kind] of [
    ['../sub-01', 'directory'],
    ['sub-01/sub-99/ses-002', 'directory'],
    ['sub-01/anat', 'directory'],
    ['task-rest_bold.json', 'file'],
    ['T1w.nii', 'file'],
    ['task-rest_bold.nii', 'symlink'],
  ] as const)
    assert.equal(descriptionPlan(entry(path, kind), options), undefined);
});
void test('display descriptions are bounded plaintext while exact metadata values and provenance survive', async () => {
  assert.equal(displayDescription('  A\nB\tC\x00D  '), 'A B C D');
  assert.equal(displayDescription('x'.repeat(121)), 'x'.repeat(120) + '…');
  for (const value of ['', '\n\t ', 'n/a', 'x'.repeat(4097)])
    assert.equal(displayDescription(value), undefined);
  const doc = await parseJsonMetadata(snapshot('{"Name":"<img>\\nStudy"}'), signal());
  const label = jsonDescription(doc, 'Name')!;
  assert.equal(label.text, '<img> Study');
  assert.equal(label.evidence[0].value, '<img>\nStudy');
  assert.equal(label.evidence[0].pointer, '/Name');
  assert.equal(label.evidence[0].revision.modifiedAt, 1);
  for (const text of ['{}', '{"Name":2}', '{"Name":"n/a"}', '{"Name":"one","Name":"two"}'])
    assert.equal(
      jsonDescription(await parseJsonMetadata(snapshot(text), signal()), 'Name'),
      undefined,
    );
  assert.equal(
    jsonDescription({ ...doc, fields: [{ ...doc.fields[0], duplicated: true }] }, 'Name'),
    undefined,
  );
});
void test('mapped table descriptions require exact unique IDs, headers and rectangular rows; duplicate dictionary entries never win', async () => {
  const table = await parseTable(
    snapshot('participant_id\tlabel\nsub-001\t"Alice\\nLiteral"\nsub-01\tOther'),
    signal(),
  );
  const label = tableDescription(table, 'participant_id', 'sub-001', 'label', [])!;
  assert.equal(label.text, 'Alice\\nLiteral');
  assert.equal(label.evidence[0].rawToken, '"Alice\\nLiteral"');
  assert.equal(label.evidence[0].line, 2);
  assert.equal(tableDescription(table, 'participant_id', 'sub-1', 'label', []), undefined);
  for (const text of [
    'participant_id\tlabel\nsub-001\tA\nsub-001\tB',
    'participant_id\tlabel\tlabel\nsub-001\tA\tB',
    'participant_id\tparticipant_id\tlabel\nsub-001\tsub-001\tA',
    'participant_id\tlabel\nsub-001',
    'participant_id\tlabel\nsub-001\tn/a',
  ])
    assert.equal(
      tableDescription(
        await parseTable(snapshot(text), signal()),
        'participant_id',
        'sub-001',
        'label',
        [],
      ),
      undefined,
    );
  assert.equal(tableDescription(table, 'missing', 'sub-001', 'label', []), undefined);
  assert.equal(tableDescription(table, 'participant_id', 'sub-001', 'missing', []), undefined);
  const definitions = (await parseJsonMetadata(snapshot('{"label":{},"label":{}}'), signal()))
    .fields;
  assert.equal(
    tableDescription(table, 'participant_id', 'sub-001', 'label', definitions),
    undefined,
  );
  assert.equal(
    tableDescription(table, 'participant_id', 'sub-001', 'label', [definitions[0]]),
    undefined,
  );
  assert.ok(
    tableDescription(
      table,
      'participant_id',
      'sub-001',
      'label',
      (await parseJsonMetadata(snapshot('{"label":{}}'), signal())).fields,
    ),
  );
});
