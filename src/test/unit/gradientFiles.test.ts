import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  lstat,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  gradientPair,
  loadGradientPair,
  readGradientText,
  MAX_GRADIENT_BYTES,
  type GradientReadIO,
} from '../../sources/gradientFiles';

const signal = (): AbortSignal => new AbortController().signal;
async function fixture(run: (folder: string, uri: string) => Promise<void>): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), 'bids-gradient-'));
  try {
    await writeFile(join(folder, 'dwi.bval'), '0 1000 2000');
    await writeFile(join(folder, 'dwi.bvec'), '0 1 0\n0 0 1\n0 0 0');
    await run(folder, pathToFileURL(join(folder, 'dwi.bval')).toString());
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

void test('same-basename pair resolves either source without scanning or changing data', async () => {
  await fixture(async (folder, uri) => {
    const pair = gradientPair(uri);
    assert.deepEqual(gradientPair(pair.bvecUri), pair);
    const encoded = pathToFileURL(join(folder, 'with space #.bvec')).toString();
    assert.match(gradientPair(encoded).bvalUri, /with%20space%20%23.bval$/);
    assert.throws(() => gradientPair(pathToFileURL(join(folder, 'dwi.json')).toString()), /Choose/);
    assert.throws(() => gradientPair('https://example.com/dwi.bval'));
    const before = await Promise.all(
      ['dwi.bval', 'dwi.bvec'].map((name) => readFile(join(folder, name))),
    );
    const data = await loadGradientPair(pair.bvecUri, signal());
    assert.equal(data.table.volumes.length, 3);
    assert.deepEqual(data.table.volumes[1].vector, [1, 0, 0]);
    assert.equal(data.bvalText, before[0].toString());
    assert.equal(data.bvecText, before[1].toString());
    assert.deepEqual(
      await Promise.all(['dwi.bval', 'dwi.bvec'].map((name) => readFile(join(folder, name)))),
      before,
    );
    await rm(join(folder, 'dwi.bvec'));
    await assert.rejects(loadGradientPair(uri, signal()), /ENOENT/);
  });
});

void test('reader bounds input, rejects symlinks/special files and malformed UTF-8', async () => {
  await fixture(async (folder, uri) => {
    await assert.rejects(
      readGradientText(pathToFileURL(folder).toString(), signal()),
      /ordinary files/,
    );
    if (process.platform !== 'win32') {
      const link = join(folder, 'linked.bval');
      await symlink(join(folder, 'dwi.bval'), link);
      await assert.rejects(
        readGradientText(pathToFileURL(link).toString(), signal()),
        /ordinary files/,
      );
    }
    await writeFile(join(folder, 'dwi.bval'), Buffer.alloc(MAX_GRADIENT_BYTES, 32));
    assert.equal((await readGradientText(uri, signal())).length, MAX_GRADIENT_BYTES);
    await writeFile(join(folder, 'dwi.bval'), Buffer.alloc(MAX_GRADIENT_BYTES + 1));
    await assert.rejects(readGradientText(uri, signal()), /1 MiB/);
    await writeFile(join(folder, 'dwi.bval'), Buffer.from([0xff]));
    await assert.rejects(readGradientText(uri, signal()), /encoded data/);
    await writeFile(join(folder, 'dwi.bval'), '');
    assert.equal(await readGradientText(uri, signal()), '');
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(readGradientText(uri, controller.signal), /abort/i);
  });
});

void test('reader detects replacement between stat and open and closes the handle', async () => {
  await fixture(async (folder, uri) => {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    const io: GradientReadIO = {
      stat: lstat,
      open: async (path) => {
        await rename(path, join(folder, 'old'));
        await writeFile(path, '0 1000 2000');
        handle = await open(path, 'r');
        return handle;
      },
    };
    await assert.rejects(readGradientText(uri, signal(), io), /changed while opening/);
    await assert.rejects(handle!.stat(), /closed/);
  });
});

void test('reader detects source revisions during reading, including same-size path replacement', async () => {
  for (const mutation of ['grow', 'truncate', 'replace', 'mtime'] as const)
    await fixture(async (folder, uri) => {
      let calls = 0;
      const io: GradientReadIO = {
        stat: lstat,
        open: async (path) => {
          const handle = await open(path, 'r');
          const original = handle.read.bind(handle);
          handle.read = async (...args: Parameters<FileHandle['read']>) => {
            const result = await original(...args);
            if (++calls === 1) {
              if (mutation === 'grow') await writeFile(path, '0 1000 2000 3000');
              if (mutation === 'truncate') await truncate(path, 1);
              if (mutation === 'replace') {
                await rename(path, join(folder, 'old'));
                await writeFile(path, '0 1000 2000');
              }
              if (mutation === 'mtime') {
                const { utimes } = await import('node:fs/promises');
                await utimes(path, new Date(0), new Date(0));
              }
            }
            return result;
          };
          return handle;
        },
      };
      await assert.rejects(readGradientText(uri, signal(), io), /changed while reading/);
    });
});

void test('reader cancels an active read and closes the handle', async () => {
  await fixture(async (_folder, uri) => {
    const controller = new AbortController();
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    const io: GradientReadIO = {
      stat: lstat,
      open: async (path) => {
        handle = await open(path, 'r');
        const original = handle.read.bind(handle);
        handle.read = async (...args: Parameters<FileHandle['read']>) => {
          const result = await original(...args);
          controller.abort();
          return result;
        };
        return handle;
      },
    };
    await assert.rejects(readGradientText(uri, controller.signal, io), /abort/i);
    await assert.rejects(handle!.stat(), /closed/);
  });
});
