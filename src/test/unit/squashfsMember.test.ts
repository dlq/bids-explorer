import assert from 'node:assert/strict';
import fs, { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { archiveResourceUri, entryArchiveUri, parseArchiveUri } from '../../core/archiveUri';
import { entryKey, isRecognizedBidsEntry } from '../../core/directory';
import { archiveSiblings } from '../../sources/archiveMetadata';
import { ArchiveImageCache } from '../../sources/imageCache';
import { LogicalDirectorySource } from '../../sources/logicalDirectory';
import { readTextSnapshot } from '../../sources/previewText';
import { streamSquashfsMember } from '../../sources/squashfsMember';
import { squashfsFile } from '../squashfsFixture';

async function fixture(run: (file: string, folder: string, signal: AbortSignal) => Promise<void>) {
  const folder = await mkdtemp(join(tmpdir(), 'bids-squash-member-'));
  try {
    await run(join(folder, 'member.sqfs'), folder, new AbortController().signal);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function member(folder: string, signal: AbortSignal): Promise<string> {
  const source = new LogicalDirectorySource();
  const root = await source.root(pathToFileURL(folder).href);
  const [entry] = await source.children(root, signal);
  return entryArchiveUri(entry);
}

void test('SquashFS selected text uses the original inode, including gzip fragments and sparse blocks', async () => {
  await fixture(async (file, folder, signal) => {
    const name = 'dataset_description.json';
    const bytes = Buffer.from('{"Name":"SquashFS fixture"}');
    for (const options of [
      {},
      { gzip: true, fragment: true },
      { long: true, gzip: true },
      { sparse: true },
    ]) {
      await writeFile(file, squashfsFile(name, bytes, options));
      const uri = await member(folder, signal);
      const result = await readTextSnapshot(uri, signal);
      assert.equal(result.text, options.sparse ? '\0'.repeat(bytes.length) : bytes.toString());
      assert.equal(result.archiveSource?.memberPath, name);
      assert.deepEqual(await archiveSiblings(uri, [name], signal), [uri]);
      await assert.rejects(archiveSiblings(uri, ['absent.json'], signal), /companion is absent/);
      await assert.rejects(
        archiveSiblings(uri, ['elsewhere/file.json'], signal),
        /share the selected member directory/,
      );
      assert.throws(() => parseArchiveUri(uri.replace(name, 'other.json')), /invalid or expired/);
      assert.throws(() => parseArchiveUri(uri.split('.')[0]), /invalid|reference/);
    }
  });
});

void test('SquashFS MRI cache contains the exact selected bytes and verifies the image revision', async () => {
  await fixture(async (file, folder, signal) => {
    const bytes = Buffer.from('example MRI bytes');
    await writeFile(file, squashfsFile('sub-01_T1w.nii.gz', bytes));
    const uri = await member(folder, signal);
    const cache = new ArchiveImageCache(join(folder, 'cache'));
    const path = await cache.materialize(uri, signal);
    assert.match(path, /sub-01_T1w\.nii\.gz$/);
    assert.deepEqual(await readFile(fileURLToPath(path)), bytes);
    await writeFile(file, squashfsFile('sub-01_T1w.nii.gz', Buffer.concat([bytes, bytes])));
    await assert.rejects(readTextSnapshot(uri, signal), /image changed/);
    await assert.rejects(archiveSiblings(uri, ['sub-01_T1w.nii.gz'], signal), /Archive changed/);
    await assert.rejects(cache.materialize(uri, signal), /Archive changed/);
    const large = { ...parseArchiveUri(uri), memberIndex: 2 ** 47 };
    assert.equal(parseArchiveUri(archiveResourceUri(large)).memberIndex, large.memberIndex);
    assert.throws(
      () => parseArchiveUri(archiveResourceUri({ ...large, memberIndex: 2 ** 48 })),
      /ordinal/,
    );
  });
});

void test('SquashFS rejects oversized, non-regular and corrupt selected members', async () => {
  await fixture(async (file, folder, signal) => {
    const name = 'dataset_description.json';
    const bytes = Buffer.from('{"Name":"fixture"}');
    for (const [options, error] of [
      [{ corrupt: 'inode' }, /not an ordinary file/],
      [{ corrupt: 'location' }, /data block bounds/],
      [{ corrupt: 'size' }, /data block length/],
      [{ fragment: true, corrupt: 'fragment-table' }, /fragment table/],
      [{ fragment: true, corrupt: 'fragment-metadata' }, /fragment metadata/],
      [{ fragment: true, corrupt: 'fragment-offset' }, /fragment length/],
      [{ gzip: true, compressionId: 4 }, /requires gzip/],
    ] as const) {
      await writeFile(file, squashfsFile(name, bytes, options));
      await assert.rejects(readTextSnapshot(await member(folder, signal), signal), error);
    }
    const ref = parseArchiveUri(await member(folder, signal));
    const unexpected = () => assert.fail('must reject before publishing bytes');
    await assert.rejects(
      streamSquashfsMember(ref, signal, 1, unexpected, unexpected),
      /read size limit/,
    );
    await assert.rejects(
      streamSquashfsMember({ ...ref, memberIndex: 2 ** 47 }, signal, 1024, unexpected, unexpected),
      /inode location/,
    );
  });
});

void test('repeated metadata has one logical row while retaining every shard version', async () => {
  await fixture(async (file, folder, signal) => {
    const name = 'dataset_description.json';
    const bytes = Buffer.from('{"Name":"common"}');
    await writeFile(file, squashfsFile(name, bytes));
    await writeFile(
      join(folder, 'a.sqfs'),
      squashfsFile(name, Buffer.from('{"Name":"different"}')),
    );
    await writeFile(join(folder, 'b.sqfs'), squashfsFile(name, bytes, { corrupt: 'inode' }));
    const source = new LogicalDirectorySource();
    const root = await source.root(pathToFileURL(folder).href);
    const rows = await source.children(root, signal);
    const descriptions = rows.filter((row) => row.name === name);
    assert.equal(descriptions.length, 1);
    const versions = await source.children(descriptions[0], signal);
    assert.equal(versions.length, 3);
    assert(isRecognizedBidsEntry(descriptions[0]));
    assert(!versions.some((version) => entryKey(version) === entryKey(descriptions[0])));
    assert.equal(
      (await readTextSnapshot(entryArchiveUri(versions[0]), signal)).text,
      '{"Name":"different"}',
    );
    await assert.rejects(
      readTextSnapshot(entryArchiveUri(versions[1]), signal),
      /not an ordinary file/,
    );
    assert.equal(
      (await readTextSnapshot(entryArchiveUri(versions[2]), signal)).text,
      bytes.toString(),
    );
  });
});

void test('canceling a SquashFS MRI extraction after a payload write removes its partial cache and allows retry', async (t) => {
  await fixture(async (file, folder, signal) => {
    const bytes = Buffer.from('selected image payload');
    await writeFile(file, squashfsFile('sub-01_T1w.nii.gz', bytes));
    const uri = await member(folder, signal);
    const cache = new ArchiveImageCache(join(folder, 'cache'));
    const controller = new AbortController();
    const open = fs.open;
    let written: Buffer | undefined;
    const mock = t.mock.method(fs, 'open', async (...args: Parameters<typeof open>) => {
      const handle = await open(...args);
      if (args[1] === 'wx') {
        const write = handle.writeFile.bind(handle);
        handle.writeFile = async (...writeArgs) => {
          await write(...writeArgs);
          written = await readFile(args[0]);
          controller.abort();
        };
      }
      return handle;
    });
    try {
      await assert.rejects(cache.materialize(uri, controller.signal), { name: 'AbortError' });
    } finally {
      mock.mock.restore();
    }
    assert.deepEqual(written, bytes);
    assert.deepEqual(await readdir(cache.root), []);
    const retried = await cache.materialize(uri, signal);
    assert.deepEqual(await readFile(fileURLToPath(retried)), bytes);
  });
});
