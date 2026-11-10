import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, open, writeFile, rename, symlink, rm, unlink, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readCacheTicket } from '../../sources/imageCacheLock';

async function fixture(run: (path: string) => Promise<void>) {
  const folder = await mkdtemp(join(tmpdir(), 'bids-cache-ticket-'));
  const path = join(folder, 'ticket');
  await writeFile(path, '1');
  try {
    await run(path);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

void test('ticket reads stay on the checked handle when its path is replaced by a symlink', async () => {
  await fixture(async (path) => {
    const outside = path + '-outside';
    await writeFile(outside, '9999');
    let closed = false;
    assert.equal(
      await readCacheTicket(path, new AbortController().signal, {
        open: async () => {
          const handle = await open(path, 'r');
          // Replace the path after opening so later reads must use the original handle.
          await rename(path, path + '-original');
          await symlink(outside, path);
          return {
            stat: () => handle.stat(),
            read: handle.read.bind(handle),
            close: async () => {
              await handle.close();
              closed = true;
            },
          };
        },
      }),
      1,
    );
    assert.equal(closed, true);
  });
});

void test('ticket growth between inspection and reading is bounded and rejected', async (t) => {
  await fixture(async (path) => {
    let closed = false;
    const handle = await open(path, 'r');
    const reads = t.mock.method(handle, 'read');
    let first = true;
    await assert.rejects(
      readCacheTicket(path, new AbortController().signal, {
        open: () =>
          Promise.resolve({
            stat: async () => {
              const stat = await handle.stat();
              if (first) {
                first = false;
                await writeFile(path, '1'.repeat(1024 * 1024));
              }
              return stat;
            },
            read: handle.read.bind(handle),
            close: async () => {
              await handle.close();
              closed = true;
            },
          }),
      }),
      /changed while reading/,
    );
    assert.equal(closed, true);
    assert.equal(reads.mock.callCount(), 1);
    const buffer = reads.mock.calls[0].arguments[0];
    assert.ok(Buffer.isBuffer(buffer));
    assert.equal(buffer.length, 33);
  });
});

void test('a ticket removed by a finished request is ignored during a concurrent read', async () => {
  await fixture(async (path) => {
    const handle = await open(path, 'r');
    let inspected = false;
    const ticket = await readCacheTicket(path, new AbortController().signal, {
      open: () =>
        Promise.resolve({
          stat: async () => {
            const stat = await handle.stat();
            if (!inspected) {
              inspected = true;
              await unlink(path);
            }
            return stat;
          },
          read: handle.read.bind(handle),
          close: () => handle.close(),
        }),
    });
    assert.equal(ticket, undefined);
  });
});

void test('same-size ticket mutation is rejected even when its replacement is a valid number', async () => {
  await fixture(async (path) => {
    let first = true;
    let closed = false;
    await assert.rejects(
      readCacheTicket(path, new AbortController().signal, {
        open: async () => {
          const handle = await open(path, 'r');
          return {
            stat: async () => {
              const stat = await handle.stat();
              if (first) {
                first = false;
                await writeFile(path, '2');
                // Make the revision change observable on filesystems with coarse timestamps.
                await utimes(path, stat.atime, new Date(stat.mtimeMs - 10000));
              }
              return stat;
            },
            read: handle.read.bind(handle),
            close: async () => {
              await handle.close();
              closed = true;
            },
          };
        },
      }),
      /changed while reading/,
    );
    assert.equal(closed, true);
  });
});

void test('ticket handles close on read failure and cancellation before or after reading', async (t) => {
  for (const mode of ['failure', 'early', 'late']) {
    await fixture(async (path) => {
      const controller = new AbortController();
      let closed = false;
      let stats = 0;
      await assert.rejects(
        readCacheTicket(path, controller.signal, {
          open: async () => {
            const handle = await open(path, 'r');
            if (mode === 'failure')
              t.mock.method(handle, 'read', () => Promise.reject(new Error('read failed')));
            return {
              stat: async () => {
                const stat = await handle.stat();
                stats++;
                if ((mode === 'early' && stats === 1) || (mode === 'late' && stats === 2))
                  controller.abort();
                return stat;
              },
              read: handle.read.bind(handle),
              close: async () => {
                await handle.close();
                closed = true;
              },
            };
          },
        }),
        mode === 'failure' ? /read failed/ : { name: 'AbortError' },
      );
      assert.equal(closed, true);
    });
  }
  await fixture(async (path) => {
    await assert.rejects(readCacheTicket(path, AbortSignal.abort()), { name: 'AbortError' });
    await writeFile(path, '');
    await assert.rejects(readCacheTicket(path, new AbortController().signal), /Invalid.*ticket/);
  });
});
