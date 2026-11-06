import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { availabilityMatches, type AvailabilityIndex } from '../../core/availability';
import { AvailabilityCache } from '../../sources/availabilityCache';
import { directoryRoot } from '../../sources/localDirectory';

void test('SquashFS availability survives a new cache instance and invalidates on shard changes', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'availability-cache-'));
  try {
    const dataset = join(folder, 'dataset');
    const storage = join(folder, 'cache');
    await mkdir(dataset);
    const shard = join(dataset, 'part.sqfs');
    await writeFile(shard, 'archive');
    await writeFile(join(dataset, 'dataset_description.json'), '{}');
    const root = directoryRoot(pathToFileURL(dataset).href);
    const participant = { ...root, name: 'sub-01', relativePath: 'sub-01' };
    const index: AvailabilityIndex = {
      participants: [participant],
      columns: ['ses-01'],
      partial: true,
      retryable: false,
      sources: ['Raw'],
      outputModalities: [],
      rows: [
        [
          {
            sourceIndex: 0,
            complete: false,
            cells: new Map([['ses-01', { modalities: ['anat'], complete: true }]]),
          },
        ],
      ],
    };
    const signal = new AbortController().signal;
    let scans = 0;
    const scan = () => {
      scans++;
      return Promise.resolve(index);
    };
    const load = () => new AvailabilityCache(storage).load(root, signal, scan);
    assert.deepEqual(await load(), index);
    assert.deepEqual(await load(), index);
    assert.equal(scans, 1);
    const warm = await load();
    assert.deepEqual(
      availabilityMatches(warm, {
        participant: '',
        raw: ['ses-01'],
        requireOutput: false,
        pipeline: '',
        session: '',
        modality: '',
      }),
      [0],
    );

    const extra = join(dataset, 'extra.squashfs');
    await writeFile(extra, 'additional archive');
    await load();
    await rm(extra);
    await load();
    const replacement = join(dataset, 'replacement');
    await writeFile(replacement, 'archive');
    await rename(replacement, shard);
    await load();
    assert.equal(scans, 4);

    const [name] = await readdir(storage);
    const slot = join(storage, name);
    await writeFile(slot, 'corrupt');
    await load();
    assert.equal(scans, 5);
    await rm(slot);
    await symlink(shard, slot);
    await load();
    assert.equal(scans, 6);
    await chmod(storage, 0o755);
    await load();
    await load();
    assert.equal(scans, 8);
    await assert.rejects(new AvailabilityCache(storage).load(root, AbortSignal.abort(), scan), {
      name: 'AbortError',
    });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

void test('availability avoids persisting changing or mixed inputs and retries incomplete scans on demand', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'availability-cache-misses-'));
  try {
    const dataset = join(folder, 'dataset');
    const storage = join(folder, 'cache');
    const signal = new AbortController().signal;
    const cache = new AvailabilityCache(storage);
    const root = directoryRoot(pathToFileURL(dataset).href);
    const index: AvailabilityIndex = {
      participants: [],
      columns: [],
      partial: false,
      retryable: false,
      rows: [],
      sources: ['Raw'],
      outputModalities: [],
    };
    const scan = () => Promise.resolve(index);
    await cache.load(root, signal, scan);
    await mkdir(dataset);
    await cache.load(root, signal, scan);
    const shard = join(dataset, 'part.sqfs');
    await writeFile(shard, 'original');
    await cache.load(root, signal, async () => {
      await writeFile(shard, 'changed during scan');
      return index;
    });
    await mkdir(join(dataset, 'sub-01'));
    await cache.load(root, signal, scan);
    await rm(join(dataset, 'sub-01'), { recursive: true });
    await writeFile(join(dataset, 'mixed.tar.gz'), '');
    await cache.load(root, signal, scan);
    await rm(join(dataset, 'mixed.tar.gz'));
    await writeFile(join(dataset, 'mixed.zip'), '');
    await cache.load(root, signal, scan);
    assert.deepEqual(await readdir(folder), ['dataset']);
    await rm(join(dataset, 'mixed.zip'));
    const incomplete = { ...index, partial: true, retryable: true };
    await cache.load(root, signal, () => Promise.resolve(incomplete));
    assert.deepEqual(await cache.load(root, signal, scan), incomplete);
    assert.deepEqual(await cache.load(root, signal, scan, true), index);
    assert.deepEqual(
      await cache.load(root, signal, () => Promise.resolve(incomplete), true),
      index,
    );
    const linkedPath = join(folder, 'linked');
    await mkdir(linkedPath);
    const linkedRoot = directoryRoot(pathToFileURL(linkedPath).href);
    const linkedShard = join(linkedPath, 'derivatives.sqfs');
    let scans = 0;
    const loadLinked = () =>
      new AvailabilityCache(storage).load(
        root,
        signal,
        () => {
          scans++;
          return scan();
        },
        false,
        [linkedRoot],
      );
    await loadLinked();
    await writeFile(linkedShard, 'initial revision');
    await loadLinked();
    await loadLinked();
    assert.equal(scans, 2);
    await writeFile(linkedShard, 'updated revision');
    await loadLinked();
    await loadLinked();
    assert.equal(scans, 3);
    const controller = new AbortController();
    await assert.rejects(
      cache.load(directoryRoot(pathToFileURL(shard).href), controller.signal, () => {
        controller.abort();
        return Promise.reject(controller.signal.reason as Error);
      }),
      { name: 'AbortError' },
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
