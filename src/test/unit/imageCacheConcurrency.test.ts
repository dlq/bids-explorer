import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, readdir, lstat, rm, symlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { test } from 'node:test';
import { ArchiveImageCache } from '../../sources/archiveImageCache';
import { withImageCacheLock, cacheHost } from '../../sources/imageCacheLock';
import { archiveResourceUri, parseArchiveUri } from '../../core/archiveUri';
import { zipFixture } from '../zipFixture';

type Message = { type: string; result?: string; error?: string; name?: string };
async function waitFor<T>(
  read: () => T | Promise<T>,
  predicate: (value: T) => boolean,
): Promise<T> {
  const deadline = Date.now() + 10000;
  for (;;) {
    const value = await read();
    if (predicate(value)) return value;
    assert.ok(Date.now() < deadline, 'The cache worker must make progress');
    await setTimeout(10);
  }
}
async function fixture(run: (folder: string, root: string, uris: string[]) => Promise<void>) {
  const folder = await mkdtemp(join(tmpdir(), 'bids-cache-concurrency-'));
  const path = join(folder, 'images.zip');
  await writeFile(
    path,
    zipFixture([
      { name: 'a.nii', text: 'a'.repeat(1024) },
      { name: 'b.nii', text: 'b'.repeat(1024) },
    ]),
  );
  const stat = await lstat(path);
  const uris = ['a.nii', 'b.nii'].map((memberPath, memberIndex) =>
    archiveResourceUri({
      sourceUri: pathToFileURL(path).href,
      memberPath,
      memberIndex,
      revision: { size: stat.size, modifiedAt: stat.mtimeMs },
    }),
  );
  try {
    await run(folder, join(folder, 'cache'), uris);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
function worker(root: string, uri: string, entries: number, bytes: number) {
  const messages: Message[] = [];
  const child = fork(
    join(__dirname, '..', 'imageCacheWorker.js'),
    [root, uri, JSON.stringify({ entries, bytes, memberBytes: 2048 })],
    { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] },
  );
  child.on('message', (message: Message) => messages.push(message));
  const exited = once(child, 'exit');
  return {
    child,
    messages,
    ready: () =>
      waitFor(
        () => messages,
        (all) => all.some((m) => m.type === 'ready'),
      ),
    holding: () =>
      waitFor(
        () => messages,
        (all) => all.some((m) => m.type === 'holding'),
      ),
    result: async () => {
      await exited;
      return messages.find((m) => m.type === 'result')!;
    },
    stop: async () => {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await exited;
    },
  };
}
async function requestCount(root: string) {
  return (await readdir(root + '-queue').catch(() => [])).length;
}
void test('separate windows reserve both entry and byte budgets before streaming, retaining active images', async () => {
  for (const [entries, bytes, error] of [
    [1, 10000, /full/],
    [10, 2400, /byte budget/],
  ] as const) {
    await fixture(async (_folder, root, uris) => {
      const first = worker(root, uris[0], entries, bytes);
      const second = worker(root, uris[1], entries, bytes);
      try {
        await Promise.all([first.ready(), second.ready()]);
        first.child.send('go');
        await first.holding();
        second.child.send('go');
        await waitFor(
          () => requestCount(root),
          (count) => count === 2,
        );
        assert.equal(
          second.messages.some((m) => m.type === 'holding'),
          false,
        );
        assert.equal(await new ArchiveImageCache(root).clear(), false);
        first.child.send('release');
        const a = await first.result(),
          b = await second.result();
        assert.ok(a.result);
        assert.match(b.error!, error);
        assert.equal(await readFile(fileURLToPath(a.result), 'utf8'), 'a'.repeat(1024));
        const artifacts = await readdir(root);
        assert.equal(artifacts.length, 1);
        let total = 0;
        for (const file of await readdir(join(root, artifacts[0])))
          total += (await lstat(join(root, artifacts[0], file))).size;
        assert.ok(total <= bytes);
        assert.equal(await requestCount(root), 0);
        assert.equal(await new ArchiveImageCache(root).clear(), true);
        assert.ok(
          await new ArchiveImageCache(root, { entries, bytes, memberBytes: 2048 }).materialize(
            uris[1],
            new AbortController().signal,
          ),
        );
      } finally {
        await Promise.all([first.stop(), second.stop()]);
      }
    });
  }
});

void test('waiting and streaming cancellation release reservations and allow another window to retry', async () => {
  await fixture(async (_folder, root, uris) => {
    const first = worker(root, uris[0], 1, 10000);
    const second = worker(root, uris[1], 1, 10000);
    try {
      await Promise.all([first.ready(), second.ready()]);
      first.child.send('go');
      await first.holding();
      second.child.send('go');
      await waitFor(
        () => requestCount(root),
        (count) => count === 2,
      );
      second.child.send('abort');
      assert.equal((await second.result()).name, 'AbortError');
      assert.equal(await requestCount(root), 1);
      first.child.send('abort');
      assert.equal((await first.result()).name, 'AbortError');
      assert.equal(await requestCount(root), 0);
      assert.deepEqual(await readdir(root), []);
      assert.ok(
        await new ArchiveImageCache(root).materialize(uris[1], new AbortController().signal),
      );
    } finally {
      await Promise.all([first.stop(), second.stop()]);
    }
  });
});

void test('a killed local owner releases its queue and incomplete artifact without stealing another host reservation', async () => {
  await fixture(async (_folder, root, uris) => {
    const first = worker(root, uris[0], 1, 10000);
    try {
      await first.ready();
      first.child.send('go');
      await first.holding();
      first.child.kill('SIGKILL');
      await first.stop();
      const cache = new ArchiveImageCache(root, { entries: 1, bytes: 10000, memberBytes: 2048 });
      assert.ok(await cache.materialize(uris[1], new AbortController().signal));
      assert.equal((await readdir(root)).length, 1);
      assert.equal(await requestCount(root), 0);
      assert.equal(await cache.clear(), true);
    } finally {
      await first.stop();
    }
  });
});

void test('queue orders concurrent requests and keeps choosing/live/foreign owners until release or cancellation', async () => {
  await fixture(async (_folder, root) => {
    const signal = new AbortController().signal;
    const queue = root + '-queue';
    await mkdir(queue);
    const otherHost = cacheHost === '0000000000000000' ? '1111111111111111' : '0000000000000000';
    for (const host of [cacheHost, otherHost]) {
      const marker = join(queue, `${host}-${process.pid}-${randomUUID()}`);
      await mkdir(marker);
      await assert.rejects(
        withImageCacheLock(
          root,
          signal,
          () => Promise.reject(new Error('choosing owner must block')),
          0,
        ),
        /busy/,
      );
      await writeFile(join(marker, 'ticket'), '1');
      const controller = new AbortController();
      const waiting = withImageCacheLock(root, controller.signal, () =>
        Promise.reject(new Error('existing ticket must block')),
      );
      await waitFor(
        () => requestCount(root),
        (n) => n === 2,
      );
      controller.abort();
      await assert.rejects(waiting, { name: 'AbortError' });
      assert.deepEqual(await readdir(queue), [marker.split('/').pop()]);
      await rm(marker, { recursive: true });
    }
    const order: number[] = [];
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        withImageCacheLock(root, signal, async () => {
          const before = order.length;
          await setTimeout(5);
          assert.equal(order.length, before, 'Only one mutation may run at a time');
          order.push(i);
        }),
      ),
    );
    assert.equal(order.length, 8);
    assert.equal(await requestCount(root), 0);
  });
});

void test('queue fails closed for unsafe storage, invalid tickets and excessive waiters, cleaning only its own request', async () => {
  await fixture(async (folder, root) => {
    const signal = new AbortController().signal;
    const queue = root + '-queue';
    await assert.rejects(
      withImageCacheLock(root, AbortSignal.abort(), async () => {}),
      { name: 'AbortError' },
    );
    await mkdir(folder + '/target');
    await symlink(folder + '/target', queue);
    await assert.rejects(
      withImageCacheLock(root, signal, async () => {}),
      /ordinary private/,
    );
    await rm(queue);
    await writeFile(queue, 'file');
    await assert.rejects(withImageCacheLock(root, signal, async () => {}));
    await rm(queue);
    await mkdir(queue);
    await writeFile(join(queue, 'unexpected'), '');
    await assert.rejects(
      withImageCacheLock(root, signal, async () => {}),
      /Unexpected entry/,
    );
    assert.deepEqual(await readdir(queue), ['unexpected']);
    await rm(join(queue, 'unexpected'));
    const marker = join(queue, `${cacheHost}-${process.pid}-${randomUUID()}`);
    await mkdir(marker);
    const ticket = join(marker, 'ticket');
    for (const value of [
      '0',
      '-1',
      'NaN',
      '1.5',
      String(Number.MAX_SAFE_INTEGER),
      '1'.repeat(33),
    ]) {
      await writeFile(ticket, value);
      await assert.rejects(
        withImageCacheLock(root, signal, async () => {}),
        /Invalid.*ticket/,
      );
    }
    await rm(ticket);
    await mkdir(ticket);
    await assert.rejects(
      withImageCacheLock(root, signal, async () => {}),
      /Invalid.*ticket/,
    );
    await rm(ticket, { recursive: true });
    await symlink(join(folder, 'images.zip'), ticket);
    await assert.rejects(
      withImageCacheLock(root, signal, async () => {}),
      /Invalid.*ticket/,
    );
    await rm(marker, { recursive: true });
    await assert.rejects(
      withImageCacheLock(root, signal, () => Promise.reject(new Error('mutation failed'))),
      /mutation failed/,
    );
    assert.equal(await requestCount(root), 0);
    const names = Array.from({ length: 1024 }, () => `${cacheHost}-${process.pid}-${randomUUID()}`);
    await Promise.all(names.map((name) => mkdir(join(queue, name))));
    await assert.rejects(
      withImageCacheLock(root, signal, async () => {}),
      /Too many/,
    );
    assert.equal(await requestCount(root), 1024);
  });
});

void test('source revisions are rechecked after waiting for another window', async () => {
  await fixture(async (folder, root, uris) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let entered!: () => void;
    const held = new Promise<void>((resolve) => (entered = resolve));
    const first = withImageCacheLock(root, new AbortController().signal, async () => {
      entered();
      await gate;
    });
    await held;
    const next = new ArchiveImageCache(root).materialize(uris[0], new AbortController().signal);
    const rejected = assert.rejects(next, /Archive changed/);
    await waitFor(
      () => requestCount(root),
      (n) => n === 2,
    );
    await writeFile(join(folder, 'images.zip'), 'changed');
    release();
    await first;
    await rejected;
    assert.equal(await requestCount(root), 0);
  });
});

void test('an integrity failure releases the shared reservation for a waiting process', async () => {
  await fixture(async (folder, root, originalUris) => {
    const source = join(folder, 'images.zip');
    const bytes = await readFile(source);
    bytes[35] ^= 1; // Stored a.nii payload changes; the recorded CRC remains intact.
    await writeFile(source, bytes);
    const stat = await lstat(source);
    const uris = originalUris.map((uri) =>
      archiveResourceUri({
        ...parseArchiveUri(uri),
        revision: { size: stat.size, modifiedAt: stat.mtimeMs },
      }),
    );
    const first = worker(root, uris[0], 1, 10000);
    const second = worker(root, uris[1], 1, 10000);
    try {
      await Promise.all([first.ready(), second.ready()]);
      first.child.send('go');
      await first.holding();
      second.child.send('go');
      await waitFor(
        () => requestCount(root),
        (n) => n === 2,
      );
      first.child.send('release');
      assert.match((await first.result()).error!, /CRC/);
      await second.holding();
      second.child.send('release');
      const next = await second.result();
      assert.ok(next.result);
      assert.equal(await readFile(fileURLToPath(next.result), 'utf8'), 'b'.repeat(1024));
      assert.equal((await readdir(root)).length, 1);
      assert.equal(await requestCount(root), 0);
    } finally {
      await Promise.all([first.stop(), second.stop()]);
    }
  });
});
