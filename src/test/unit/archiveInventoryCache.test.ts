import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs, {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { ArchiveInventoryCache, archiveFingerprint } from '../../sources/archiveInventoryCache';
import { ArchiveDirectorySource } from '../../sources/archiveDirectory';
import { indexZip } from '../../sources/zipIndex';
import { zipFixture } from '../zipFixture';
import { tarFixture, tarRecord } from '../tarFixture';

const signal = new AbortController().signal;
const uri = (path: string) => pathToFileURL(path).href;
const slot = (source: string) => createHash('sha256').update(source).digest()[0] % 64;

async function fixture(run: (folder: string, cache: ArchiveInventoryCache) => Promise<void>) {
  const folder = await mkdtemp(join(tmpdir(), 'bids-inventories-'));
  try {
    await run(folder, new ArchiveInventoryCache(join(folder, 'cache')));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

void test('a new directory source reuses inventories and only rescans a replaced ZIP', async () => {
  await fixture(async (folder, cache) => {
    const first = join(folder, 'first.zip');
    let other = join(folder, 'other.zip');
    while (slot(uri(first)) === slot(uri(other))) other += '.zip';
    const old = zipFixture([{ name: 'T1w.nii' }, { name: 'T1w.nii' }]);
    const replacement = zipFixture([{ name: 'T2w.nii' }, { name: 'T2w.nii' }]);
    assert.equal(old.length, replacement.length);
    await writeFile(first, old);
    await writeFile(other, old);
    const stamp = new Date('2026-01-01T00:00:00Z');
    await utimes(first, stamp, stamp);
    let scans = 0;
    const source = () =>
      new ArchiveDirectorySource(
        undefined,
        (...args) => {
          scans++;
          return indexZip(...args);
        },
        new ArchiveInventoryCache(cache.root),
      );
    const browse = async (reader: ArchiveDirectorySource) => {
      const root = await reader.root(uri(folder));
      const archives = (await reader.children(root, signal)).filter((entry) => entry.archive);
      return Promise.all(
        archives.map(async (entry) => [entry.name, await reader.children(entry, signal)] as const),
      );
    };
    await browse(source());
    assert.equal(scans, 2);
    const reloaded = source();
    const restored = await browse(reloaded);
    assert.equal(scans, 2);
    assert.deepEqual(
      restored[0][1].map((row) => row.archive?.memberIndex),
      [0, 1],
    );
    const temporary = first + '.replacement';
    await writeFile(temporary, replacement);
    await utimes(temporary, stamp, stamp);
    await rename(temporary, first);
    const root = await reloaded.root(uri(folder));
    const archive = (await reloaded.children(root, signal)).find(
      (entry) => entry.name === 'first.zip',
    )!;
    await assert.rejects(reloaded.children(archive, signal), /changed/);
    reloaded.refresh(archive);
    assert.equal((await reloaded.children(archive, signal))[0].name, 'T2w.nii');
    await browse(source());
    assert.equal(scans, 3);
  });
});

void test('tar browsing publishes a complete reusable inventory and cache failures fall back to scanning', async () => {
  await fixture(async (folder, cache) => {
    const tar = join(folder, 'fixture.tar');
    await writeFile(tar, tarFixture(tarRecord('T1w.nii', Buffer.from('data'))));
    const source = new ArchiveDirectorySource(undefined, undefined, cache);
    const root = await source.root(uri(folder));
    const [archive] = await source.children(root, signal);
    assert.equal((await source.children(archive, signal))[0].name, 'T1w.nii');
    const fingerprint = await archiveFingerprint(uri(tar));
    const stored = await cache.read(fingerprint, signal);
    assert.equal(stored?.members[0].resource.memberPath, 'T1w.nii');
    assert.equal(stored?.members[0].bytes, 4);
    const [file] = await readdir(cache.root);
    const entry = join(cache.root, file);
    const original = await readFile(entry, 'utf8');
    const header = [fingerprint.sourceUri, fingerprint.stamp, 'today', 100, 0];
    for (const bad of [
      '{',
      '{}',
      JSON.stringify([...header, [['../T1w.nii', 'file', 4]]]),
      JSON.stringify([...header, [['T1w.nii', 'invalid', 4]]]),
      JSON.stringify([...header, [null]]),
      JSON.stringify([...header, []]) + '!',
      ' '.repeat(4 * 1024 * 1024 + 1),
    ]) {
      await writeFile(entry, bad);
      assert.equal(await cache.read(fingerprint, signal), undefined);
    }
    await rm(entry);
    const outside = join(folder, 'outside');
    await writeFile(outside, original);
    await symlink(outside, entry);
    assert.equal(await cache.read(fingerprint, signal), undefined);
    source.refresh(archive);
    assert.equal((await source.children(archive, signal))[0].name, 'T1w.nii');
    assert.equal(await readFile(outside, 'utf8'), original);
    await chmod(cache.root, 0o755);
    assert.equal(await cache.read(fingerprint, signal), undefined);
    await cache.write(stored, fingerprint, signal);
    await assert.rejects(cache.read(fingerprint, AbortSignal.abort()), { name: 'AbortError' });
    await assert.rejects(cache.write(stored, fingerprint, AbortSignal.abort()), {
      name: 'AbortError',
    });
    await mkdir(join(folder, 'directory'));
    await assert.rejects(archiveFingerprint(uri(join(folder, 'directory'))), /ordinary archive/);
  });
});

void test('canceling a replacement write preserves the last complete inventory and removes the temporary file', async (t) => {
  await fixture(async (folder, cache) => {
    const zip = join(folder, 'fixture.zip');
    await writeFile(zip, zipFixture([{ name: 'T1w.nii' }]));
    const source = uri(zip);
    const fingerprint = await archiveFingerprint(source);
    const index = await indexZip(source, signal);
    await cache.write(index, fingerprint, signal);
    const names = await readdir(cache.root);
    const controller = new AbortController();
    const write = fs.writeFile;
    const mock = t.mock.method(fs, 'writeFile', async (...args: Parameters<typeof write>) => {
      await write(...args);
      controller.abort();
    });
    try {
      await assert.rejects(
        cache.write({ ...index, capturedAt: 'replacement' }, fingerprint, controller.signal),
        { name: 'AbortError' },
      );
    } finally {
      mock.mock.restore();
    }
    assert.deepEqual(await readdir(cache.root), names);
    assert.equal((await cache.read(fingerprint, signal))?.capturedAt, index.capturedAt);
  });
});
