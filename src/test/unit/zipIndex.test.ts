import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm, lstat, open, symlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { indexZip, type ZipIndexIO } from '../../sources/zipIndex';
import { physicalResourceKey } from '../../core/resources';
import { zipFixture } from '../zipFixture';

const signal = (): AbortSignal => new AbortController().signal;
async function fixture(run: (path: string, uri: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'bids-zip-index-'));
  const path = join(dir, 'subjects.zip');
  try {
    await run(path, pathToFileURL(path).toString());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
void test('ZIP inventory preserves source order, duplicate choices, flags, types and revisions without changing bytes', async () => {
  await fixture(async (path, uri) => {
    const bytes = zipFixture([
      { name: 'wrapper/sub-01/', type: 0x4000 },
      { name: 'wrapper/sub-01/anat/sub-01_T1w.nii.gz', text: 'fake image', method: 8 },
      { name: 'wrapper/sub-01/anat/sub-01_T1w.nii.gz', text: 'alternative' },
      { name: 'link', type: 0xa000, text: '../../outside' },
      { name: 'fifo', type: 0x1000 },
      { name: 'encrypted', flags: 0x801, text: 'ciphertext' },
      { name: 'unsupported', method: 99 },
      { name: 'dos-dir/', type: 0 },
    ]);
    await writeFile(path, bytes);
    const before = await lstat(path);
    const index = await indexZip(uri, signal());
    assert.equal(index.coverage, 'complete');
    assert.equal(index.sourceUri, uri);
    assert.deepEqual(index.revision, { size: before.size, modifiedAt: before.mtimeMs });
    assert.ok(Date.parse(index.capturedAt));
    assert.deepEqual(
      index.members.map((m) => m.kind),
      ['directory', 'file', 'file', 'symlink', 'special', 'file', 'file', 'directory'],
    );
    assert.equal(index.members[1].bytes, 10);
    assert.equal(index.members[1].compressionMethod, 8);
    assert.equal(index.members[5].encrypted, true);
    assert.equal(index.members[6].compressionMethod, 99);
    assert.notEqual(
      physicalResourceKey(index.members[1].resource),
      physicalResourceKey(index.members[2].resource),
    );
    assert.ok(Object.isFrozen(index.members[0].resource));
    assert.deepEqual(await readFile(path), bytes);
    assert.equal((await lstat(path)).mtimeMs, before.mtimeMs);
  });
});
void test('ZIP inventory rejects malformed and unsafe containers, supports empty archives and enforces budgets', async () => {
  await fixture(async (path, uri) => {
    await writeFile(path, zipFixture([]));
    assert.equal((await indexZip(uri, signal())).members.length, 0);
    for (const limits of [
      { entries: 0, metadataBytes: 1 },
      { entries: 100001, metadataBytes: 1 },
      { entries: 1, metadataBytes: NaN },
      { entries: 1, metadataBytes: 16777217 },
    ])
      await assert.rejects(indexZip(uri, signal(), limits), /limits/);
    await writeFile(path, zipFixture([], 'long comment'));
    await assert.rejects(
      indexZip(uri, signal(), { entries: 1, metadataBytes: 1 }),
      /metadata limit/,
    );
    await writeFile(path, zipFixture([{ name: 'a' }, { name: 'b' }]));
    await assert.rejects(
      indexZip(uri, signal(), { entries: 1, metadataBytes: 1000 }),
      /entry limit/,
    );
    await assert.rejects(
      indexZip(uri, signal(), { entries: 2, metadataBytes: 1 }),
      /metadata limit/,
    );
    for (const name of [
      '../outside',
      '/absolute',
      'C:/absolute',
      'a\\b',
      'a/./b',
      'a//b',
      'nul\0name',
    ]) {
      await writeFile(path, zipFixture([{ name }]));
      await assert.rejects(indexZip(uri, signal()));
    }
    await writeFile(path, 'not a zip');
    await assert.rejects(indexZip(uri, signal()), /signature|directory/);
    const broken = zipFixture([{ name: 'ok' }]);
    broken[32] = 0;
    await writeFile(path, broken);
    await assert.rejects(indexZip(uri, signal()), /signature/);
    await assert.rejects(indexZip(pathToFileURL(join(path, 'missing')).toString(), signal()));
  });
});
void test('ZIP64 end records are indexed without reading payloads', async () => {
  await fixture(async (path, uri) => {
    const ordinary = zipFixture([{ name: 'sub-01/anat/a.nii', text: 'fake', method: 8 }]);
    const end = Buffer.from(ordinary.subarray(-22));
    const offset = ordinary.length - 22;
    const zip64 = Buffer.alloc(56);
    zip64.writeUInt32LE(0x06064b50);
    zip64.writeBigUInt64LE(44n, 4);
    zip64.writeUInt16LE(45, 12);
    zip64.writeUInt16LE(45, 14);
    zip64.writeBigUInt64LE(1n, 24);
    zip64.writeBigUInt64LE(1n, 32);
    zip64.writeBigUInt64LE(BigInt(end.readUInt32LE(12)), 40);
    zip64.writeBigUInt64LE(BigInt(end.readUInt32LE(16)), 48);
    const locator = Buffer.alloc(20);
    locator.writeUInt32LE(0x07064b50);
    locator.writeBigUInt64LE(BigInt(offset), 8);
    locator.writeUInt32LE(1, 16);
    end.writeUInt16LE(0xffff, 8);
    end.writeUInt16LE(0xffff, 10);
    end.writeUInt32LE(0xffffffff, 12);
    end.writeUInt32LE(0xffffffff, 16);
    await writeFile(path, Buffer.concat([ordinary.subarray(0, offset), zip64, locator, end]));
    const result = await indexZip(uri, signal());
    assert.equal(result.members.length, 1);
    assert.equal(result.members[0].resource.memberPath, 'sub-01/anat/a.nii');
    assert.equal(result.members[0].bytes, 4);
  });
});
void test('ZIP inventory rejects symlink and directory sources', async () => {
  await fixture(async (path, uri) => {
    await writeFile(path, zipFixture([]));
    await symlink(path, path + '.link');
    await assert.rejects(indexZip(uri + '.link', signal()), /ordinary file/);
    await assert.rejects(
      indexZip(pathToFileURL(join(path, '..')).toString(), signal()),
      /ordinary file/,
    );
  });
});
void test('ZIP indexing cancels before IO and between entries, closes handles and detects source replacement', async () => {
  await fixture(async (path, uri) => {
    const canceled = new AbortController();
    canceled.abort();
    await assert.rejects(indexZip(uri, canceled.signal), { name: 'AbortError' });
    const bytes = zipFixture(
      Array.from({ length: 1000 }, (_, i) => ({ name: `sub-${i}/anat/a.nii` })),
    );
    await writeFile(path, bytes);
    const controller = new AbortController();
    let closed = false;
    const io: ZipIndexIO = {
      stat: lstat,
      open: async (p) => {
        const handle = await open(p, 'r');
        setTimeout(() => controller.abort(), 5);
        return {
          fd: handle.fd,
          stat: handle.stat.bind(handle),
          close: async () => {
            closed = true;
            await handle.close();
          },
        };
      },
    };
    await assert.rejects(indexZip(uri, controller.signal, undefined, io), { name: 'AbortError' });
    assert.equal(closed, true);
    // Deterministic replacement between lstat and open, without relying on timing races.
    const replacing: ZipIndexIO = {
      stat: lstat,
      open: async (p) => {
        await rename(p, p + '.old');
        await writeFile(p, bytes);
        return open(p, 'r');
      },
    };
    await assert.rejects(indexZip(uri, signal(), undefined, replacing), /changed while opening/);
    let stats = 0;
    const changed: ZipIndexIO = {
      open: (p) => open(p, 'r'),
      stat: async (p) => {
        if (++stats === 2) await writeFile(path, Buffer.concat([bytes, Buffer.from('changed')]));
        return lstat(p);
      },
    };
    await assert.rejects(indexZip(uri, signal(), undefined, changed), /changed while indexing/);
    // Abortion immediately after opening is checked before parsing and still closes the handle.
    const early = new AbortController();
    await assert.rejects(
      indexZip(uri, early.signal, undefined, {
        stat: lstat,
        open: async (p) => {
          const handle = await open(p, 'r');
          early.abort();
          return handle;
        },
      }),
      { name: 'AbortError' },
    );
  });
});
