import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { setImmediate } from 'node:timers';
import {
  parseDatasetDescription,
  MAX_METADATA_FIELDS,
  MAX_METADATA_DEPTH,
} from '../../core/metadata';
import type { TextSnapshot } from '../../core/textSnapshot';

const snapshot = (text: string): TextSnapshot => ({
  sourceUri: 'file:///dataset/derivatives/demo/dataset_description.json',
  text,
  revision: { size: Buffer.byteLength(text), modifiedAt: 1234 },
  capturedAt: '2026-11-03T20:00:00.000Z',
});
const parse = (text: string) =>
  parseDatasetDescription(snapshot(text), new AbortController().signal);

void test('literal metadata retains all value types, original numeric tokens, order and field provenance', async () => {
  const text = String.raw` {
  "Name": "Example study",
  "BIDSVersion": "1.10.0",
  "DatasetType": "derivative",
  "Authors": ["Ada", "Lin"],
  "GeneratedBy": { "Name": "demo", "Version": "2.3" },
  "Unknown": null,
  "Positive": true,
  "Negative": false,
  "Large": 9007199254740993,
  "HugeExponent": 1e999,
  "a~/b": "quote: \"; slash: \\; braces: {}[]",
  "__proto__": {"safe": true}
} `;
  const doc = await parse(text);
  assert.equal(doc.coverage, 'selected-file-only');
  assert.equal(doc.kind, 'dataset-description');
  assert.equal(doc.snapshot.text, text);
  assert.deepEqual(doc.summary, {
    name: 'Example study',
    bidsVersion: '1.10.0',
    datasetType: 'derivative',
  });
  assert.deepEqual(
    doc.fields.map((f) => f.type),
    [
      'string',
      'string',
      'string',
      'array',
      'object',
      'null',
      'boolean',
      'boolean',
      'number',
      'number',
      'string',
      'object',
    ],
  );
  assert.deepEqual(
    doc.fields.map((f) => f.key),
    [
      'Name',
      'BIDSVersion',
      'DatasetType',
      'Authors',
      'GeneratedBy',
      'Unknown',
      'Positive',
      'Negative',
      'Large',
      'HugeExponent',
      'a~/b',
      '__proto__',
    ],
  );
  assert.equal(doc.fields[4].valueText, '{ "Name": "demo", "Version": "2.3" }');
  assert.equal(doc.fields[8].valueText, '9007199254740993');
  assert.equal(doc.fields[9].valueText, '1e999');
  assert.equal(doc.fields[10].pointer, '/a~0~1b');
  for (const field of doc.fields) {
    assert.equal(field.sourceUri, doc.snapshot.sourceUri);
    assert.equal(field.occurrence, 1);
    assert.equal(field.duplicated, false);
    assert.ok(Object.isFrozen(field));
  }
  assert.ok(Object.isFrozen(doc.fields));
  assert.deepEqual(doc.duplicateKeys, []);
});

void test('duplicate names, including escaped equivalents, remain separate and have no inferred winning summary', async () => {
  const doc = await parse(
    String.raw`{"Name":"first","\u004eame":"second","BIDSVersion":"1","BIDSVersion":2,"DatasetType":null,"x":-0,"x":1.0e-3}`,
  );
  assert.deepEqual(doc.duplicateKeys, ['Name', 'BIDSVersion', 'x']);
  assert.deepEqual(
    doc.fields.map((f) => f.occurrence),
    [1, 2, 1, 2, 1, 1, 2],
  );
  assert.deepEqual(
    doc.fields.map((f) => f.duplicated),
    [true, true, true, true, false, true, true],
  );
  assert.deepEqual(doc.summary, {});
  assert.equal(doc.fields[5].valueText, '-0');
  assert.equal(doc.fields[6].valueText, '1.0e-3');
});

void test('empty and imperfect dataset descriptions are browsable without conformance validation or defaults', async () => {
  assert.deepEqual((await parse('{}')).summary, {});
  assert.deepEqual((await parse(' { \n } ')).fields, []);
  const doc = await parse(
    '{"Name":7,"BIDSVersion":null,"DatasetType":["unknown"],"custom":{"x":[1,{"y":"braces } and , commas"}]}}',
  );
  assert.deepEqual(doc.summary, {});
  assert.equal(doc.fields.length, 4);
  for (const text of ['null', '[]', '"name"', 'true', '42'])
    await assert.rejects(parse(text), /requires a JSON object/);
  for (const text of ['', '{', '{"x":1,}', '{"x":NaN}'])
    await assert.rejects(parse(text), SyntaxError);
});

void test('metadata resource limits are explicit, independent of BIDS field requirements', async () => {
  const entries = Array.from({ length: MAX_METADATA_FIELDS }, (_, i) => `"f${i}":${i}`);
  assert.equal((await parse('{' + entries.join(',') + '}')).fields.length, MAX_METADATA_FIELDS);
  await assert.rejects(parse('{' + entries.join(',') + ',"extra":0}'), /1,000 fields/);
  const nested = (n: number) => '{"x":' + '['.repeat(n) + 'null' + ']'.repeat(n) + '}';
  assert.equal((await parse(nested(MAX_METADATA_DEPTH))).fields.length, 1);
  await assert.rejects(parse(nested(MAX_METADATA_DEPTH + 1)), /nesting exceeds/);
  await assert.rejects(parse(' '.repeat(1024 * 1024) + '{}'), /1 MiB/);
});

void test('long scans yield and cancellation can interrupt after parsing starts', async () => {
  const text = '{"long":"' + 'a'.repeat(20000) + '","numeric":' + '1'.repeat(5000) + '}';
  assert.equal((await parse(text)).fields.length, 2);
  const pre = new AbortController();
  pre.abort();
  await assert.rejects(parseDatasetDescription(snapshot('{}'), pre.signal), /abort/i);
  const started = new AbortController();
  const loading = parseDatasetDescription(snapshot(text), started.signal);
  setImmediate(() => setImmediate(() => started.abort()));
  await assert.rejects(loading, /abort/i);
});

void test('metadata publication captures an immutable revision even if the caller later changes its input', async () => {
  const input = { ...snapshot('{"Name":"Captured"}'), revision: { size: 19, modifiedAt: 123 } };
  const loading = parseDatasetDescription(input, new AbortController().signal);
  input.text = '{}';
  input.revision.modifiedAt = 456;
  const doc = await loading;
  assert.equal(doc.summary.name, 'Captured');
  assert.equal(doc.snapshot.text, '{"Name":"Captured"}');
  assert.equal(doc.snapshot.revision.modifiedAt, 123);
  assert.ok(Object.isFrozen(doc.snapshot));
  assert.ok(Object.isFrozen(doc.snapshot.revision));
});
