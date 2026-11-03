import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DatasetBrowser } from '../../core/browser';
import { DatasetRegistrations, type RegistrationStorage } from '../../core/registrations';
import { directoryRoot } from '../../sources/localDirectory';
import type { DirectorySource } from '../../core/directory';

void test('restoration tolerates corrupt state without statting unavailable datasets', () => {
  const source: DirectorySource = {
    root: () => Promise.reject(new Error('should not run')),
    children: () => Promise.resolve([]),
    revision: () => Promise.resolve({ size: 0, modifiedAt: 0 }),
  };
  for (const state of [
    null,
    42,
    {},
    ['file:///missing', 'https://invalid.example', null, 12, 'file:///missing'],
  ]) {
    const browser = new DatasetBrowser(source);
    new DatasetRegistrations(
      browser,
      { read: () => state, write: () => Promise.resolve() },
      directoryRoot,
    );
    assert.equal(browser.datasets().length, Array.isArray(state) ? 1 : 0);
  }
});

void test('serialized add/remove writes retain every dataset and restored registrations', async () => {
  let saved: unknown = [];
  const writes: unknown[] = [];
  const store: RegistrationStorage = {
    read: () => saved,
    write: (uris) => {
      saved = uris;
      writes.push(uris);
      return Promise.resolve();
    },
  };
  const source: DirectorySource = {
    root: (uri) => Promise.resolve(directoryRoot(uri)),
    children: () => Promise.resolve([]),
    revision: () => Promise.resolve({ size: 0, modifiedAt: 0 }),
  };
  const browser = new DatasetBrowser(source),
    registrations = new DatasetRegistrations(browser, store, directoryRoot);
  const [a, b] = await Promise.all([
    registrations.add('file:///one'),
    registrations.add('file:///two'),
  ]);
  assert.deepEqual(saved, [a.uri, b.uri]);
  assert.equal(await registrations.add(a.uri), a);
  assert.deepEqual(saved, [a.uri, b.uri]);
  await registrations.remove(a);
  assert.deepEqual(saved, [b.uri]);
  assert.deepEqual(browser.datasets(), [b]);
  const restored = new DatasetBrowser(source);
  new DatasetRegistrations(restored, store, directoryRoot);
  assert.deepEqual(restored.datasets(), [b]);
  assert.equal(writes.length, 4);
});

void test('failed persistence and source errors do not change browsing state or poison later mutations', async () => {
  let fail = true;
  const source: DirectorySource = {
    root: (uri) =>
      uri === 'bad' ? Promise.reject(new Error('missing')) : Promise.resolve(directoryRoot(uri)),
    children: () => Promise.resolve([]),
    revision: () => Promise.resolve({ size: 0, modifiedAt: 0 }),
  };
  const browser = new DatasetBrowser(source);
  const registrations = new DatasetRegistrations(
    browser,
    {
      read: () => [],
      write: () => (fail ? Promise.reject(new Error('storage full')) : Promise.resolve()),
    },
    directoryRoot,
  );
  await assert.rejects(registrations.add('file:///one'), /storage full/);
  assert.deepEqual(browser.datasets(), []);
  await assert.rejects(registrations.add('bad'), /missing/);
  fail = false;
  const root = await registrations.add('file:///one');
  fail = true;
  await assert.rejects(registrations.remove(root), /storage full/);
  assert.deepEqual(browser.datasets(), [root]);
  fail = false;
  await registrations.remove(root);
  assert.deepEqual(browser.datasets(), []);
});
