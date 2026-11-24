import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lstat, mkdtemp, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { loadRecordingWindow } from '../../sources/recordingWindow';
import { loadRecordingHeader, type RecordingHeaderIO } from '../../sources/recordingHeader';
import { readArchiveRange } from '../../sources/archiveMember';
import { archiveResourceUri, entryArchiveUri } from '../../core/archiveUri';
import { LogicalDirectorySource } from '../../sources/logicalDirectory';
import { edfRecordingFixture } from '../edfFixture';
import { zipFixture } from '../zipFixture';
import { tarFixture, tarRecord } from '../tarFixture';
import { squashfsFile } from '../squashfsFixture';

const signal = () => new AbortController().signal;
const request = { startSeconds: 2.1, durationSeconds: 5, channels: [0, 1] };
async function temporary(run: (folder: string) => Promise<void>) {
  const folder = await mkdtemp(join(tmpdir(), 'bids-waveform-'));
  try {
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

void test('the same calibrated window is read from loose, ZIP, tar, gzip tar and SquashFS sources', async () => {
  await temporary(async (folder) => {
    const data = edfRecordingFixture(),
      name = 'task-rest_eeg.edf';
    const loose = join(folder, name);
    await writeFile(loose, data);
    const snapshot = await loadRecordingHeader(pathToFileURL(loose).href, signal());
    const expected = await loadRecordingWindow(snapshot, request, signal());
    assert.equal(expected.channels[0].sampleCount, 1000);
    assert.equal(expected.channels[1].sampleCount, 500);
    const tar = tarFixture(tarRecord('preceding.txt', Buffer.from('skip')), tarRecord(name, data));
    for (const [filename, bytes, format, index] of [
      ['stored.zip', zipFixture([{ name, bytes: data }]), undefined, 0],
      ['deflated.zip', zipFixture([{ name, bytes: data, method: 8 }]), undefined, 0],
      ['study.tar', tar, 'tar', 1],
      ['study.tgz', gzipSync(tar), 'tar', 1],
    ] as const) {
      const path = join(folder, filename);
      await writeFile(path, bytes);
      const stat = await lstat(path);
      const uri = archiveResourceUri({
        sourceUri: pathToFileURL(path).href,
        memberPath: name,
        memberIndex: index,
        format,
        revision: { size: stat.size, modifiedAt: stat.mtimeMs },
      });
      const header = await loadRecordingHeader(uri, signal());
      assert.deepEqual(await loadRecordingWindow(header, request, signal()), expected, filename);
      assert.deepEqual(await readFile(path), bytes);
      await assert.rejects(readArchiveRange(uri, signal(), data.length - 1, 10), /Truncated/);
    }
    const dir = join(folder, 'squash');
    await mkdir(dir);
    for (const options of [{}, { gzip: true }, { fragment: true, gzip: true }, { long: true }]) {
      const path = join(dir, 'recording.sqfs');
      await writeFile(path, squashfsFile(name, data, options));
      const source = new LogicalDirectorySource();
      const [entry] = await source.children(await source.root(pathToFileURL(dir).href), signal());
      const header = await loadRecordingHeader(entryArchiveUri(entry), signal());
      assert.deepEqual(await loadRecordingWindow(header, request, signal()), expected);
    }
    assert.deepEqual(await readFile(loose), data);
  });
});

void test('range budgets reject unsafe requests before archive IO', async () => {
  for (const [offset, length] of [
    [-1, 1],
    [0, 0],
    [0, NaN],
    [0.5, 1],
    [16 * 1024 ** 2, 1],
    [Number.MAX_SAFE_INTEGER, 2],
  ])
    await assert.rejects(readArchiveRange('invalid', signal(), offset, length), /budget/);
});

void test('window reads are source-bound, bounded and cancelled without publishing stale data', async () => {
  await temporary(async (folder) => {
    const file = join(folder, 'recording.edf'),
      uri = pathToFileURL(file).href;
    const original = edfRecordingFixture();
    await writeFile(file, original);
    const snapshot = await loadRecordingHeader(uri, signal());
    for (const scenario of [
      'snapshot-change',
      'link',
      'open-change',
      'end-change',
      'path-change',
      'eof',
      'cancel',
      'short',
    ]) {
      let closed = false,
        stats = 0,
        paths = 0,
        readBytes = 0;
      const abort = new AbortController();
      const io: RecordingHeaderIO = {
        stat: async (path) => {
          const result = await lstat(path);
          paths++;
          if (scenario === 'snapshot-change' || (scenario === 'path-change' && paths > 1))
            result.ino++;
          if (scenario === 'link') result.isSymbolicLink = () => true;
          return result;
        },
        open: async (path) => {
          const handle = await open(path, 'r');
          return {
            close: async () => {
              closed = true;
              await handle.close();
            },
            stat: async () => {
              const value = await handle.stat();
              stats++;
              if (scenario === 'open-change' || (scenario === 'end-change' && stats > 1))
                value.ino++;
              return value;
            },
            read: async (buffer, offset, length, position) => {
              assert.ok(position >= 1024 + 1240, 'Skip record zero for this requested window');
              assert.ok(length <= 65536);
              if (scenario === 'eof') return { bytesRead: 0 };
              const result = await handle.read(buffer, offset, Math.min(length, 128), position);
              readBytes += result.bytesRead;
              if (scenario === 'cancel') abort.abort();
              return result;
            },
          };
        },
      };
      if (scenario === 'short') {
        const result = await loadRecordingWindow(snapshot, request, abort.signal, io);
        assert.equal(result.channels[0].sampleCount, 1000);
        assert.equal(readBytes, result.bytes);
      } else
        await assert.rejects(
          loadRecordingWindow(snapshot, request, abort.signal, io),
          /changed|Truncated|abort/i,
          scenario,
        );
      assert.equal(closed, !['snapshot-change', 'link'].includes(scenario), scenario);
    }
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(loadRecordingWindow(snapshot, request, abort.signal), /abort/i);
    await writeFile(file, original.subarray(0, 1024));
    const truncated = await loadRecordingHeader(uri, signal());
    await assert.rejects(loadRecordingWindow(truncated, request, signal()), /Truncated/);
  });
});
