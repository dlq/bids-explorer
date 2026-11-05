import assert from 'node:assert/strict';
import { lstat, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { inspectSquashfs, parseSquashfsHeader } from '../../sources/squashfsHeader';
import { squashfsSuperblock } from '../squashfsFixture';

void test('SquashFS reports 64-bit image size and rejects malformed or unsupported headers', () => {
  const header = squashfsSuperblock();
  const size = 11_888_257_392_640;
  header.writeBigUInt64LE(BigInt(size), 40);
  assert.equal(parseSquashfsHeader(header, size).bytesUsed, size);
  assert.throws(() => parseSquashfsHeader(header, size - 1), /inconsistent/);
  assert.throws(() => parseSquashfsHeader(header.subarray(0, 95), size), /superblock/);
  for (const [offset, value, error] of [
    [0, 0, /superblock/],
    [28, 3, /4.0/],
    [30, 1, /4.0/],
    [22, 11, /inconsistent/],
    [22, 21, /inconsistent/],
    [12, 1, /inconsistent/],
    [4, 0, /inconsistent/],
    [40, 0, /inconsistent/],
  ] as const) {
    const invalid = Buffer.from(squashfsSuperblock());
    invalid.writeUInt16LE(value, offset);
    assert.throws(() => parseSquashfsHeader(invalid, 96), error);
  }
  header.writeUInt16LE(42, 20);
  header.writeUInt16LE(0, 24);
  const unknown = parseSquashfsHeader(header, size);
  assert.equal(unknown.compression, 'unknown');
  assert.equal(unknown.uncompressedData, false);
});

void test('SquashFS inspection is positional, cancellable and revision checked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bids-squashfs-'));
  const file = join(root, 'sample.sqfs');
  const uri = pathToFileURL(file).href;
  const header = squashfsSuperblock();
  const signal = new AbortController().signal;
  try {
    await writeFile(file, Buffer.concat([header, Buffer.alloc(4096, 0xff)]));
    const report = await inspectSquashfs(uri, signal);
    assert.equal(report.coverage, 'superblock-only');
    assert.equal(report.superblock.inodeCount, 3);
    assert.equal(report.superblock.compression, 'gzip');
    assert.equal(report.superblock.uncompressedMetadata, true);
    assert.equal(report.revision.size, 4192);
    await symlink(file, join(root, 'link.sqfs'));
    await assert.rejects(
      inspectSquashfs(pathToFileURL(join(root, 'link.sqfs')).href, signal),
      /ordinary/,
    );
    await assert.rejects(inspectSquashfs(uri, AbortSignal.abort()), { name: 'AbortError' });

    const revision = await lstat(file);
    const controller = new AbortController();
    let closed = 0;
    const io = {
      stat: () => Promise.resolve(revision),
      open: () =>
        Promise.resolve({
          stat: () => Promise.resolve(revision),
          read: (buffer: Buffer, offset: number, length: number, position: number) => {
            assert.equal(position, offset);
            assert.equal(offset + length, 96);
            const bytesRead = header.copy(
              buffer,
              offset,
              position,
              position + Math.min(length, 48),
            );
            return Promise.resolve({ bytesRead, buffer });
          },
          close: () => {
            closed++;
            return Promise.resolve();
          },
        }),
    };
    await inspectSquashfs(uri, signal, io);
    for (const [changes, error] of [
      [{ ino: revision.ino + 1 }, /while opening/],
      [{ dev: revision.dev + 1 }, /while opening/],
      [{ size: revision.size + 1 }, /while opening/],
      [{ mtimeMs: revision.mtimeMs + 1 }, /while opening/],
      [{ ctimeMs: revision.ctimeMs + 1 }, /while opening/],
    ] as const) {
      await assert.rejects(
        inspectSquashfs(uri, signal, {
          ...io,
          open: async () => ({
            ...(await io.open()),
            stat: () => Promise.resolve({ ...revision, isFile: () => true, ...changes }),
          }),
        }),
        error,
      );
    }
    let calls = 0;
    await assert.rejects(
      inspectSquashfs(uri, signal, {
        ...io,
        stat: () =>
          Promise.resolve(++calls === 1 ? revision : { ...revision, isFile: () => true, size: 1 }),
      }),
      /while reading/,
    );
    await assert.rejects(
      inspectSquashfs(uri, signal, {
        ...io,
        open: async () => ({
          ...(await io.open()),
          read: (buffer) => Promise.resolve({ bytesRead: 0, buffer }),
        }),
      }),
      /Truncated/,
    );
    await assert.rejects(
      inspectSquashfs(uri, controller.signal, {
        ...io,
        open: async () => ({
          ...(await io.open()),
          read: (...args: Parameters<Awaited<ReturnType<typeof io.open>>['read']>) => {
            controller.abort();
            return io.open().then((handle) => handle.read(...args));
          },
        }),
      }),
      { name: 'AbortError' },
    );
    assert.equal(closed, 9);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
