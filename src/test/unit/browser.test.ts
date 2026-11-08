import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DatasetBrowser } from '../../core/browser';
import type { DirectoryEntry, DirectorySource } from '../../core/directory';

function entry(path = '', datasetUri = 'file:///data'): DirectoryEntry {
  return {
    datasetUri,
    uri: datasetUri + '/' + path,
    relativePath: path,
    name: path || 'data',
    kind: 'directory',
  };
}
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness() {
  const calls: string[] = [];
  let next: (
    node: DirectoryEntry,
    signal: AbortSignal,
  ) => Promise<readonly DirectoryEntry[]> = () => Promise.resolve([]);
  const source: DirectorySource = {
    root: (uri) => Promise.resolve(entry('', uri)),
    revision: () => Promise.resolve({ size: 0, modifiedAt: 0 }),
    children: (node, signal) => {
      calls.push(node.relativePath);
      return next(node, signal);
    },
  };
  return {
    browser: new DatasetBrowser(source),
    calls,
    respond: (fn: typeof next) => {
      next = fn;
    },
  };
}

void test('registration, expandability and coverage do not enumerate descendants', async () => {
  const h = harness(),
    root = entry();
  assert.deepEqual(h.browser.datasets(), []);
  assert.equal(h.browser.register(root), root);
  assert.equal(h.browser.register(entry()), root);
  assert.deepEqual(h.calls, []);
  assert.equal(h.browser.snapshot(root).coverage, 'unknown');
  h.respond(() => Promise.resolve([entry('sub-01')]));
  assert.equal((await h.browser.children(root))[0].name, 'sub-01');
  assert.equal(h.browser.snapshot(root).coverage, 'complete');
  assert.equal(h.browser.snapshot(entry('sub-01')).coverage, 'unknown');
  await h.browser.children(root);
  assert.deepEqual(h.calls, ['']);
  assert.deepEqual(await h.browser.children({ ...entry('file'), kind: 'file' }), []);
});

void test('concurrent expansion is shared and refresh only invalidates its own scope', async () => {
  const h = harness(),
    pending = deferred<readonly DirectoryEntry[]>();
  h.respond(() => pending.promise);
  const root = entry(),
    a = entry('sub-01'),
    nested = entry('sub-01/anat'),
    prefix = entry('sub-010'),
    other = entry('', 'file:///other');
  const first = h.browser.children(root);
  assert.equal(h.browser.children(root), first);
  pending.resolve([a]);
  await first;
  h.respond(() => Promise.resolve([]));
  for (const item of [a, nested, prefix, other]) await h.browser.children(item);
  h.browser.refresh(a);
  assert.equal(h.browser.snapshot(a).coverage, 'unknown');
  assert.equal(h.browser.snapshot(nested).coverage, 'unknown');
  for (const item of [root, prefix, other])
    assert.equal(h.browser.snapshot(item).coverage, 'complete');
  h.browser.refresh();
  assert.equal(h.browser.snapshot(root).stale, true);
  assert.equal(h.browser.snapshot(prefix).stale, true);
  assert.equal(h.browser.snapshot(other).coverage, 'unknown');
});

void test('filesystem failures are not absence and preserve an existing listing until a successful refresh', async () => {
  const h = harness(),
    root = entry(),
    a = entry('sub-01');
  h.respond(() => Promise.resolve([a]));
  await h.browser.children(root);
  h.browser.refresh(root);
  h.respond(() =>
    Promise.reject(Object.assign(new Error('permission denied'), { code: 'EACCES' })),
  );
  assert.deepEqual(await h.browser.children(root), [a]);
  assert.equal(h.browser.snapshot(root).coverage, 'failed');
  assert.equal(h.browser.snapshot(root).stale, true);
  assert.equal(h.browser.snapshot(root).error?.code, 'EACCES');
  assert.equal(h.browser.snapshot(root).error?.message, 'permission denied');
  await h.browser.children(root);
  assert.equal(h.calls.length, 2);
  h.browser.refresh(root);
  h.respond(() => Promise.resolve([]));
  assert.deepEqual(await h.browser.children(root), []);
  assert.equal(h.browser.snapshot(root).coverage, 'complete');
  assert.equal(h.browser.snapshot(root).error, undefined);
  const other = entry('', 'file:///missing');
  // Exercise a foreign adapter rejecting with an unexpected non-Error value.
  // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
  h.respond(() => Promise.reject('unavailable'));
  assert.deepEqual(await h.browser.children(other), []);
  assert.deepEqual(h.browser.snapshot(other).error, { code: 'UNKNOWN', message: 'unavailable' });
  assert.equal(h.browser.snapshot(other).stale, false);
});

void test('cancellation discards late results without overwriting a newer listing', async () => {
  const h = harness(),
    root = entry(),
    pending = deferred<readonly DirectoryEntry[]>();
  let canceled: AbortSignal | undefined;
  h.respond((_entry, signal) => {
    canceled = signal;
    return pending.promise;
  });
  const old = h.browser.children(root);
  await Promise.resolve();
  h.browser.refresh(entry('', 'file:///different'));
  assert.equal(canceled!.aborted, false);
  h.browser.refresh(root);
  assert.equal(canceled!.aborted, true);
  assert.equal(h.browser.snapshot(root).coverage, 'unknown');
  h.respond(() => Promise.resolve([entry('sub-02')]));
  const current = await h.browser.children(root);
  pending.resolve([entry('old')]);
  assert.deepEqual(await old, []);
  assert.deepEqual(h.browser.snapshot(root).children, current);
  const failure = deferred<readonly DirectoryEntry[]>();
  h.browser.refresh(root);
  h.respond(() => failure.promise);
  const canceledFailure = h.browser.children(root);
  await Promise.resolve();
  h.browser.cancel();
  failure.reject(new Error('aborted IO'));
  assert.deepEqual(await canceledFailure, current);
  assert.equal(h.browser.snapshot(root).coverage, 'unknown');
});

void test('removing a dataset cancels work and clears its snapshots without touching another root', async () => {
  const h = harness(),
    root = entry(),
    other = entry('', 'file:///other');
  h.browser.register(root);
  h.browser.register(other);
  await h.browser.children(root);
  await h.browser.children(other);
  h.browser.refresh(root);
  const pending = deferred<readonly DirectoryEntry[]>();
  h.respond(() => pending.promise);
  const work = h.browser.children(root);
  h.browser.remove(root);
  pending.resolve([entry('late')]);
  await work;
  assert.deepEqual(h.browser.datasets(), [other]);
  assert.equal(h.browser.snapshot(root).coverage, 'unknown');
  assert.equal(h.browser.snapshot(other).coverage, 'complete');
});

void test('synchronous adapter failures are retryable and immediate cancellation avoids IO', async () => {
  const h = harness(),
    root = entry();
  h.respond(() => {
    throw new Error('EIO');
  });
  await h.browser.children(root);
  assert.equal(h.browser.snapshot(root).coverage, 'failed');
  h.browser.refresh(root);
  h.respond(() => Promise.resolve([]));
  await h.browser.children(root);
  assert.equal(h.browser.snapshot(root).coverage, 'complete');
  h.browser.refresh(root);
  const count = h.calls.length;
  const pending = h.browser.children(root);
  h.browser.cancel();
  await pending;
  assert.equal(h.calls.length, count);
});

void test('a failed page keeps the displayed page and both navigation directions available', async () => {
  const h = harness();
  const root = entry();
  let attempts = 0;
  const third = () => {
    if (++attempts === 1) return Promise.reject(new Error('Temporary page read failure'));
    return Promise.resolve([entry('sub-03')]);
  };
  const first = (): Promise<readonly DirectoryEntry[]> =>
    Promise.resolve([entry('sub-01'), { ...root, paging: { page: 1, failures: 0, next: second } }]);
  const second = (): Promise<readonly DirectoryEntry[]> =>
    Promise.resolve([
      entry('sub-02'),
      { ...root, paging: { page: 2, failures: 0, previous: first, next: third } },
    ]);
  h.respond(first);
  await h.browser.children(root);
  const displayed = await h.browser.nextPage(root);
  const navigation = h.browser.snapshot(root).paging;
  assert.equal(navigation?.page, 2);

  assert.deepEqual(await h.browser.nextPage(root), displayed);
  const failed = h.browser.snapshot(root);
  assert.equal(failed.coverage, 'failed');
  assert.equal(failed.stale, true);
  assert.equal(failed.paging, navigation);
  assert.match(failed.error!.message, /Temporary page read failure/);

  assert.equal((await h.browser.nextPage(root, 'previous'))[0].name, 'sub-01');
  assert.equal(h.browser.snapshot(root).paging?.page, 1);
  await h.browser.nextPage(root);
  assert.equal((await h.browser.nextPage(root))[0].name, 'sub-03');
  assert.equal(attempts, 2);
  assert.equal(h.browser.snapshot(root).coverage, 'complete');
  assert.equal(h.browser.snapshot(root).error, undefined);
  assert.deepEqual(h.calls, ['']);
});
