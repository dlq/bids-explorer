import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { DatasetBrowser } from '../../core/browser';
import { LogicalDirectorySource } from '../../sources/logicalDirectory';
import { readSquashfsRoot } from '../../sources/squashfsDirectory';
import { image, records } from '../squashfsFixture';

async function fixture(run: (file: string, uri: string) => Promise<void>) {
  const temp = await mkdtemp(join(tmpdir(), 'bids-squashfs-page-'));
  try {
    const file = join(temp, 'sample.sqfs');
    await run(file, pathToFileURL(file).href);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

void test('SquashFS continuations cross metadata blocks and expand only the selected directory', async () => {
  await fixture(async (file, uri) => {
    await writeFile(file, image(undefined, { gzip: true, split: 16 }));
    const signal = new AbortController().signal;
    const first = await readSquashfsRoot(uri, signal, 2);
    assert.deepEqual(
      first.entries.map(({ name, kind }) => [name, kind]),
      [
        ['anat', 'directory'],
        ['link', 'symlink'],
      ],
    );
    assert.equal(first.entries[1].open, undefined);
    const second = await first.next!(signal);
    assert.deepEqual(
      second.entries.map(({ name, kind }) => [name, kind]),
      [
        ['scan.nii', 'file'],
        ['device', 'special'],
      ],
    );
    assert.equal(second.next, undefined);
    assert.deepEqual((await first.next!(signal)).entries, second.entries);
    assert.equal((await first.entries[0].open!(signal)).entries[0].name, 'T1w.nii');
    await assert.rejects(first.next!(AbortSignal.abort()), { name: 'AbortError' });
    await writeFile(file, Buffer.concat([image(), Buffer.alloc(1)]));
    await assert.rejects(first.next!(signal), /image changed/);
    for (const size of [0, 257, 1.5])
      assert.throws(() => readSquashfsRoot(uri, signal, size), /pages/);
  });
});

void test('SquashFS pages reject corrupt metadata, names and traversal', async () => {
  await fixture(async (file, uri) => {
    const signal = new AbortController().signal;
    const group = records([['test', 2]]);
    const damaged = (offset: number, value: number) => {
      const data = Buffer.from(group);
      data.writeUInt16LE(value, offset);
      return data;
    };
    const cases: [Buffer, RegExp][] = [
      [image(group, { header: (b) => b.writeBigUInt64LE(95n, 64) }), /table offsets/],
      [image(group, { header: (b) => b.writeBigUInt64LE(96n, 72) }), /table offsets/],
      [image(group, { header: (b) => b.writeBigUInt64LE(99999n, 72) }), /table offsets/],
      [image(group, { header: (b) => b.writeBigUInt64LE(1000n, 32) }), /metadata offset/],
      [
        image(group, { header: (b) => b.writeBigUInt64LE(9999999n << 16n, 32) }),
        /page or table bounds/,
      ],
      [image(group, { inode: (b) => b.writeUInt16LE(2) }), /directory inode/],
      [image(group, { inode: (b) => b.writeUInt32LE(2, 20) }), /directory size/],
      [image(group, { directoryBlock: (b) => b.writeUInt16LE(0) }), /block length/],
      [image(group, { directoryBlock: (b) => b.writeUInt16LE(8193) }), /block length/],
      [image(group, { directoryBlock: (b) => b.writeUInt16LE(8192) }), /block length/],
      [image(group, { gzip: true, header: (b) => b.writeUInt16LE(4, 20) }), /requires gzip/],
      [image(group.subarray(0, 16)), /Truncated.*record/],
      [image(damaged(0, 256)), /group count/],
      [image(damaged(0, 1)), /Truncated.*group/],
      [image(damaged(18, 256)), /Oversized/],
      [image(damaged(16, 8)), /entry type/],
      [image(damaged(16, 0)), /entry type/],
      [image(records([['x/y', 2]])), /Invalid.*name/],
      [image(records([['..', 2]])), /Unsafe/],
      [image(records([['x'.repeat(100), 2]]), { split: 1 }), /page or table bounds/],
    ];
    for (const [bytes, error] of cases) {
      await writeFile(file, bytes);
      await assert.rejects(readSquashfsRoot(uri, signal), error);
    }
  });
});

void test('logical SquashFS pages merge duplicate paths and preserve source choices across page boundaries', async () => {
  await fixture(async (file) => {
    const directory = dirname(file);
    const sub = (i: number): [string, number] => [`sub-${String(i).padStart(4, '0')}`, 1];
    await writeFile(
      file,
      image(records(Array.from({ length: 204 }, (_, i) => sub(i))), { split: 1024 }),
    );
    await writeFile(
      join(directory, 'other.squashfs'),
      image(records([sub(10), sub(199), sub(203), sub(204)])),
    );
    await writeFile(join(directory, 'broken.sqsh'), 'invalid image');
    const source = new LogicalDirectorySource();
    const browser = new DatasetBrowser(source);
    const root = browser.register(await source.root(pathToFileURL(directory).href));
    const first = await browser.children(root);
    assert.equal(first.length, 200);
    assert.equal(browser.snapshot(root).paging?.failures, 1);
    const shared = first[199];
    assert.equal(shared.name, 'sub-0199');
    assert.deepEqual(
      shared.logical?.sources.map((choice) => [
        choice.archive?.containerPath,
        choice.archive?.memberPath,
      ]),
      [
        ['other.squashfs', 'sub-0199'],
        ['sample.sqfs', 'sub-0199'],
      ],
    );
    const children = await browser.children(shared);
    assert.equal(children[0].name, 'T1w.nii');
    assert.equal(children.length, 2);
    assert(children.every((choice) => choice.logical?.conflict));
    assert.equal(new Set(children.map((choice) => choice.archive?.sourceUri)).size, 2);
    const pending = browser.nextPage(root);
    assert.equal(browser.nextPage(root), pending);
    const second = await pending;
    assert.deepEqual(
      second.map(({ name }) => name),
      ['sub-0200', 'sub-0201', 'sub-0202', 'sub-0203', 'sub-0204'],
    );
    assert.equal(second[3].logical?.sources.length, 2);
    assert.equal(browser.snapshot(root).paging?.next, undefined);
    assert.equal(browser.snapshot(root).paging?.page, 2);
    assert.equal(await browser.nextPage(root), second);
    const previous = await browser.nextPage(root, 'previous');
    assert.deepEqual(
      previous.map(({ name }) => name),
      first.map(({ name }) => name),
    );
    assert.equal(browser.snapshot(root).paging?.page, 1);
    browser.refresh(root);
    await browser.children(root);
    await writeFile(file, image(records([sub(0)])));
    assert.equal((await browser.nextPage(root)).length, 200);
    assert.match(browser.snapshot(root).error?.message ?? '', /image changed/);
    assert.equal(browser.snapshot(root).stale, true);
  });
});

void test('recognizes a BIDS dataset inside a single SquashFS wrapper without exposing it in the logical path', async () => {
  await fixture(async (file) => {
    await writeFile(
      file,
      image(records([['wrapper', 1]]), {
        child: records([
          ['dataset_description.json', 2],
          ['sub-01', 1],
        ]),
      }),
    );
    const source = new LogicalDirectorySource();
    const root = await source.root(pathToFileURL(dirname(file)).href);
    const rows = await source.children(root, new AbortController().signal);
    assert.equal(rows[0].name, 'dataset_description.json');
    assert.equal(rows[0].relativePath, 'dataset_description.json');
    assert.equal(rows[0].archive?.memberPath, 'wrapper/dataset_description.json');
    assert.equal(rows[1].name, 'sub-01');
  });
});

void test('SquashFS combined directories project into sessions and can merge with a loose subject', async () => {
  await fixture(async (file) => {
    await writeFile(
      file,
      image(
        records([
          ['sub-01_ses-02', 1],
          ['sub-02', 1],
        ]),
      ),
    );
    await mkdir(join(dirname(file), 'sub-01'));
    const source = new LogicalDirectorySource();
    const browser = new DatasetBrowser(source);
    const root = await source.root(pathToFileURL(dirname(file)).href);
    const [subject] = await browser.children(root);
    assert.equal(subject.name, 'sub-01');
    assert.equal(subject.logical?.sources.length, 2);
    const [session] = await browser.children(subject);
    assert.equal(session.name, 'ses-02');
    assert.equal((await browser.children(session))[0].archive?.memberPath, 'sub-01_ses-02/T1w.nii');
  });
});

void test('SquashFS keeps unrecognized wrapper contents out of the BIDS tree and rejects unordered pages', async () => {
  await fixture(async (file) => {
    await writeFile(file, image(records([['wrapper', 1]])));
    const source = new LogicalDirectorySource();
    const browser = new DatasetBrowser(source);
    const root = await source.root(pathToFileURL(dirname(file)).href);
    assert.deepEqual(await browser.children(root), []);
    browser.refresh(root);
    await writeFile(
      file,
      image(
        records([
          ['sub-10', 1],
          ['sub-1_ses-1', 1],
        ]),
      ),
    );
    assert.deepEqual(await browser.children(root), []);
    assert.match(browser.snapshot(root).error?.message ?? '', /logical name order/);
  });
});

void test('SquashFS merge rejects oversized fan-in and handles special directory entries safely', async () => {
  await fixture(async (file) => {
    await writeFile(
      file,
      image(
        records([
          ['device', 4],
          ['link', 3],
          ['sub-01', 1],
        ]),
      ),
    );
    const source = new LogicalDirectorySource();
    const browser = new DatasetBrowser(source);
    const root = await source.root(pathToFileURL(dirname(file)).href);
    assert.deepEqual(
      (await browser.children(root)).map((row) => row.name),
      ['sub-01'],
    );
    await Promise.all(
      Array.from({ length: 64 }, (_, i) => writeFile(join(dirname(file), `shard-${i}.sqfs`), '')),
    );
    browser.refresh(root);
    await browser.children(root);
    assert.match(browser.snapshot(root).error?.message ?? '', /64 sources/);
  });
});

void test('SquashFS can navigate back through pages older than the checkpoint cache', async () => {
  await fixture(async (file) => {
    const groups = Array.from({ length: 10 }, (_, group) =>
      records(
        Array.from({ length: 200 }, (_, i) => [
          `sub-${String(group * 200 + i).padStart(4, '0')}`,
          1,
        ]),
      ),
    );
    await writeFile(file, image(Buffer.concat(groups), { split: 4096 }));
    const source = new LogicalDirectorySource();
    const root = await source.root(pathToFileURL(dirname(file)).href);
    const browser = new DatasetBrowser(source);
    await browser.children(root);
    for (let i = 1; i < 10; i++) await browser.nextPage(root);
    for (let i = 8; i >= 0; i--) {
      const rows = await browser.nextPage(root, 'previous');
      assert.equal(rows[0].name, `sub-${String(i * 200).padStart(4, '0')}`);
      assert.equal(browser.snapshot(root).paging?.page, i + 1);
    }
  });
});
