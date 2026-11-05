import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DatasetBrowser } from '../../core/browser';
import { DatasetRegistrations } from '../../core/registrations';
import { WorkspaceDiscovery, isDeclaredCollection } from '../../core/workspaceDiscovery';
import type { DirectoryEntry } from '../../core/directory';

const root = (uri: string): DirectoryEntry => ({
  uri,
  datasetUri: uri,
  relativePath: '',
  name: uri,
  kind: 'directory',
});
function harness() {
  let saved: readonly string[] = [];
  const browser = new DatasetBrowser({
    root: (uri) => Promise.resolve(root(uri)),
    children: () => Promise.resolve([]),
    revision: () => Promise.resolve({ size: 0, modifiedAt: 0 }),
  });
  const registrations = new DatasetRegistrations(
    browser,
    {
      read: () => saved,
      write: (uris) => {
        saved = uris;
        return Promise.resolve();
      },
    },
    root,
  );
  let probe: (uri: string) => Promise<DirectoryEntry | undefined> = (uri) =>
    Promise.resolve(root(uri));
  let changes = 0;
  const errors: unknown[] = [];
  const discovery = new WorkspaceDiscovery(
    browser,
    registrations,
    (uri) => probe(uri),
    () => {
      changes++;
    },
    (_uri, error) => errors.push(error),
  );
  return {
    browser,
    registrations,
    discovery,
    errors,
    saved: () => saved,
    changes: () => changes,
    respond: (fn: typeof probe) => {
      probe = fn;
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

void test('workspace roots populate automatically without persisting or recursively expanding them', async () => {
  const h = harness();
  await h.discovery.update(['file:///one', 'file:///two', 'file:///one']);
  assert.deepEqual(
    h.browser.datasets().map((e) => e.uri),
    ['file:///one', 'file:///two'],
  );
  assert.deepEqual(h.saved(), []);
  assert.equal(h.browser.snapshot(root('file:///one')).coverage, 'unknown');
  assert.equal(h.changes(), 2);
  await h.discovery.update(['file:///one', 'file:///two']);
  assert.equal(h.changes(), 2);
  await h.registrations.add('file:///manual');
  assert.deepEqual(h.saved(), ['file:///manual']);
  await h.discovery.update([]);
  assert.deepEqual(
    h.browser.datasets().map((e) => e.uri),
    ['file:///manual'],
  );
});

void test('manual ownership survives workspace removal and automatic ownership never leaks into saved registration', async () => {
  const h = harness();
  await h.discovery.update(['file:///one']);
  const one = await h.registrations.add('file:///one');
  assert.equal(h.registrations.isManual(one.uri), true);
  await h.discovery.update([]);
  assert.deepEqual(h.browser.datasets(), [one]);
  await h.discovery.update([one.uri]);
  h.respond(() => Promise.resolve(undefined));
  await h.discovery.update([one.uri]);
  assert.deepEqual(h.browser.datasets(), [one]);
  await h.registrations.remove(one);
  assert.deepEqual(h.saved(), []);
});

void test('removing an automatic entry suppresses rediscovery for the session; explicit Add allows it again', async () => {
  const h = harness();
  const uri = 'file:///one';
  await h.discovery.update([uri]);
  await h.registrations.remove(root(uri));
  h.discovery.dismiss(uri);
  await h.discovery.update([uri]);
  assert.deepEqual(h.browser.datasets(), []);
  await h.registrations.add(uri);
  h.discovery.allow(uri);
  await h.discovery.update([uri]);
  assert.equal(h.browser.datasets().length, 1);
  assert.deepEqual(h.saved(), [uri]);
});

void test('ordinary non-BIDS roots are ignored and disappearing markers remove automatic entries only', async () => {
  const h = harness();
  h.respond((uri) => Promise.resolve(uri === 'file:///bids' ? root(uri) : undefined));
  await h.discovery.update(['file:///bids', 'file:///ordinary']);
  assert.equal(h.browser.datasets().length, 1);
  h.respond(() => Promise.resolve(undefined));
  await h.discovery.update(['file:///bids', 'file:///ordinary']);
  assert.deepEqual(h.browser.datasets(), []);
});

void test('errors preserve previously discovered roots and do not block other workspace folders', async () => {
  const h = harness();
  await h.discovery.update(['file:///one']);
  h.respond((uri) =>
    uri === 'file:///one' ? Promise.reject(new Error('EACCES')) : Promise.resolve(root(uri)),
  );
  await h.discovery.update(['file:///one', 'file:///two']);
  assert.equal(h.errors.length, 1);
  assert.equal(h.browser.datasets().length, 2);
});

void test('late discovery cannot restore a removed workspace root or override a newer update', async () => {
  const h = harness(),
    pending = deferred<DirectoryEntry | undefined>();
  h.respond(() => pending.promise);
  const old = h.discovery.update(['file:///old']);
  h.respond((uri) => Promise.resolve(root(uri)));
  await h.discovery.update(['file:///new']);
  pending.resolve(root('file:///old'));
  await old;
  assert.deepEqual(
    h.browser.datasets().map((e) => e.uri),
    ['file:///new'],
  );
  const failed = deferred<DirectoryEntry | undefined>();
  h.respond(() => failed.promise);
  const outdated = h.discovery.update(['file:///bad']);
  await h.discovery.update([]);
  failed.reject(new Error('late error'));
  await outdated;
  assert.deepEqual(h.errors, []);
});

void test('dismissal and disposal during a probe prevent late publication', async () => {
  const h = harness(),
    pending = deferred<DirectoryEntry | undefined>();
  h.respond(() => pending.promise);
  const update = h.discovery.update(['file:///one']);
  h.discovery.dismiss('file:///one');
  pending.resolve(root('file:///one'));
  await update;
  assert.deepEqual(h.browser.datasets(), []);
  const second = deferred<DirectoryEntry | undefined>();
  h.respond(() => second.promise);
  const stopped = h.discovery.update(['file:///two']);
  h.discovery.dispose();
  second.resolve(root('file:///two'));
  await stopped;
  await h.discovery.update(['file:///never']);
  assert.deepEqual(h.browser.datasets(), []);
});

void test('workspace detection has bounded concurrency and publishes fast roots without waiting for a slow one', async () => {
  const h = harness();
  let active = 0,
    max = 0;
  const pending = new Map<string, ReturnType<typeof deferred<DirectoryEntry | undefined>>>();
  h.respond((uri) => {
    active++;
    max = Math.max(max, active);
    const work = deferred<DirectoryEntry | undefined>();
    pending.set(uri, work);
    return work.promise.finally(() => {
      active--;
    });
  });
  const uris = Array.from({ length: 6 }, (_, i) => 'file:///' + i);
  const work = h.discovery.update(uris);
  assert.equal(max, 4);
  pending.get(uris[1])!.resolve(root(uris[1]));
  // Drain completion/worker microtasks without relying on elapsed time.
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(h.browser.datasets().length, 1);
  assert.ok(pending.has(uris[4]));
  pending.get(uris[0])!.resolve(root(uris[0]));
  pending.get(uris[2])!.resolve(root(uris[2]));
  pending.get(uris[3])!.resolve(root(uris[3]));
  pending.get(uris[4])!.resolve(root(uris[4]));
  await new Promise<void>((resolve) => setImmediate(resolve));
  pending.get(uris[5])!.resolve(root(uris[5]));
  await work;
  assert.equal(max, 4);
  assert.equal(h.browser.datasets().length, 6);
});

void test('superseded workers do not continue queued metadata work after a failed in-flight probe', async () => {
  const h = harness();
  const pending = Array.from({ length: 4 }, () => deferred<DirectoryEntry | undefined>());
  let calls = 0;
  h.respond(() => pending[calls++].promise);
  const old = h.discovery.update(['file:///0', 'file:///1', 'file:///2', 'file:///3', 'file:///4']);
  await h.discovery.update([]);
  pending[0].reject(new Error('old failure'));
  for (const work of pending.slice(1)) work.resolve(undefined);
  await old;
  assert.equal(calls, 4);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.browser.datasets(), []);
});

void test('explicit collection declarations use exact URI membership and bounded typed lists', () => {
  assert.equal(isDeclaredCollection('file:///collection', ['file:///collection']), true);
  for (const configured of [
    undefined,
    'file:///collection',
    {},
    [null, 42],
    Array(1001).fill('file:///collection'),
    ['file:///other'],
    ['file:///collection-extra'],
  ])
    assert.equal(isDeclaredCollection('file:///collection', configured), false);
});
