import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { setImmediate } from 'node:timers';
import { parseHistory } from '../../core/history';
const snapshot = (text: string) => ({
  sourceUri: 'file:///data/CHANGES',
  text,
  revision: { size: Buffer.byteLength(text), modifiedAt: 1 },
  capturedAt: 'now',
});
const parse = (text: string) => parseHistory(snapshot(text), new AbortController().signal);
void test('dataset history preserves source order, invalid dates/versions and unparsed text losslessly', async () => {
  const text =
    'Project history\r\n\r\n1.0.0 2014-99-42\r\n  - <img> recorded text\r\n0.0.2 2025-01-01\n  [Fixes]\n  - Older version after newer date\nUnreleased\n  Future\nv1.0_rc1 date unknown';
  const doc = await parse(text);
  assert.equal(doc.entries.map((entry) => entry.text).join(''), text);
  assert.deepEqual(
    doc.entries.map((entry) => entry.version),
    [undefined, '1.0.0', '0.0.2', 'Unreleased', 'v1.0_rc1'],
  );
  assert.equal(doc.entries[1].dateText, '2014-99-42');
  assert.equal(doc.entries[1].line, 3);
  assert.equal(doc.entries[1].heading, '1.0.0 2014-99-42');
  assert.ok(Object.isFrozen(doc.entries[0]));
  assert.deepEqual((await parse('')).entries, []);
  assert.equal((await parse('Not a changelog\n  2.0 not a header\n')).entries.length, 1);
  assert.equal((await parse('1.0\n2.0')).entries.length, 2);
});
void test('history bounds, cooperative cancellation and input snapshots are independent of conformance', async () => {
  await assert.rejects(parse('x'.repeat(1024 * 1024 + 1)), /1 MiB/);
  assert.equal(
    (await parse(Array.from({ length: 1000 }, (_, i) => `${i}.0\n`).join(''))).entries.length,
    1000,
  );
  await assert.rejects(parse(Array.from({ length: 1001 }, (_, i) => `${i}.0\n`).join('')), /1,000/);
  const pre = new AbortController();
  pre.abort();
  await assert.rejects(parseHistory(snapshot('text'), pre.signal), /abort/i);
  const during = new AbortController();
  const pending = parseHistory(snapshot('line\n'.repeat(10000)), during.signal);
  setImmediate(() => setImmediate(() => during.abort()));
  await assert.rejects(pending, /abort/i);
  const input = snapshot('1.0 date\n  change');
  const captured = parseHistory(input, new AbortController().signal);
  input.text = 'changed';
  input.revision.modifiedAt = 2;
  const doc = await captured;
  assert.equal(doc.entries[0].version, '1.0');
  assert.equal(doc.snapshot.revision.modifiedAt, 1);
});
