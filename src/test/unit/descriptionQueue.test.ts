import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { DescriptionQueue } from '../../core/descriptionQueue';
import type { DirectoryEntry } from '../../core/directory';
const entry = (path: string, datasetUri = 'file:///data'): DirectoryEntry => ({
  datasetUri,
  uri: datasetUri + '/' + path,
  relativePath: path,
  name: path,
  kind: 'directory',
});
const label = Object.freeze({ text: 'Name', evidence: Object.freeze([]) });
void test('description queue is nonblocking, coalesces work, caches success/absence/errors and clears only a scope', async () => {
  let calls = 0;
  const changed: string[] = [];
  const queue = new DescriptionQueue(
    (item) => {
      calls++;
      return item.name === 'bad'
        ? Promise.reject(new Error('denied'))
        : Promise.resolve(item.name === 'absent' ? undefined : label);
    },
    (item) => changed.push(item.name),
  );
  assert.equal(queue.snapshot(entry('new')).status, 'unloaded');
  assert.equal(queue.request(entry('sub-01')).status, 'loading');
  queue.request(entry('sub-01'));
  assert.equal(calls, 0);
  for (const path of ['sub-01/ses-01', 'sub-010', 'bad', 'absent']) queue.request(entry(path));
  queue.request(entry('sub-01', 'file:///other'));
  await setImmediate();
  assert.equal(calls, 6);
  assert.equal(changed.length, 6);
  assert.equal(queue.request(entry('sub-01')).description, label);
  assert.equal(queue.snapshot(entry('absent')).status, 'unavailable');
  assert.match(queue.snapshot(entry('bad')).error!, /denied/);
  queue.clear(entry('sub-01'));
  assert.equal(queue.snapshot(entry('sub-01/ses-01')).status, 'unloaded');
  assert.equal(queue.snapshot(entry('sub-010')).status, 'ready');
  assert.equal(queue.snapshot(entry('sub-01', 'file:///other')).status, 'ready');
  queue.clear(entry('', 'file:///other'));
  assert.equal(queue.snapshot(entry('sub-01', 'file:///other')).status, 'unloaded');
  queue.clear();
  assert.equal(queue.snapshot(entry('sub-010')).status, 'unloaded');
});
void test('cancellation drops queued work, retains completed descriptions and prevents stale publication after refresh', async () => {
  const releases: (() => void)[] = [];
  const changed: string[] = [];
  const queue = new DescriptionQueue(
    (item) =>
      item.name === 'done'
        ? Promise.resolve(label)
        : new Promise((resolve) => releases.push(() => resolve(label))),
    (item) => changed.push(item.name),
  );
  queue.request(entry('done'));
  await setImmediate();
  queue.request(entry('parent'));
  queue.request(entry('parent/child'));
  queue.request(entry('queued'));
  await setImmediate();
  assert.equal(releases.length, 2);
  queue.cancel();
  assert.equal(queue.snapshot(entry('done')).status, 'ready');
  assert.equal(queue.snapshot(entry('queued')).status, 'unloaded');
  queue.request(entry('parent'));
  releases.splice(0).forEach((release) => release());
  await setImmediate();
  assert.equal(releases.length, 1);
  assert.deepEqual(changed, ['done']);
  releases[0]();
  await setImmediate();
  assert.equal(queue.snapshot(entry('parent')).status, 'ready');
  queue.request(entry('cancel-before-start'));
  queue.cancel();
  await setImmediate();
  assert.deepEqual(changed, ['done', 'parent']);
});
void test('automatic enrichment caps queued work and cache size', async () => {
  const queue = new DescriptionQueue(
    () => Promise.resolve(label),
    () => {},
  );
  for (let i = 0; i < 35; i++) queue.request(entry(String(i)));
  assert.equal(queue.snapshot(entry('34')).status, 'unloaded');
  await setImmediate();
  for (let i = 34; i < 512; i++) {
    queue.request(entry(String(i)));
    if (i % 20 === 0) await setImmediate();
  }
  await setImmediate();
  assert.equal(queue.snapshot(entry('511')).status, 'ready');
  assert.equal(queue.request(entry('overflow')).status, 'unloaded');
});
