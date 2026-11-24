import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, lstat, open, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { archiveResourceUri, entryArchiveUri } from '../../core/archiveUri';
import { readArchivePrefix } from '../../sources/archiveMember';
import { streamArchiveMember } from '../../sources/archiveMember';
import { loadRecordingHeader, type RecordingHeaderIO } from '../../sources/recordingHeader';
import { LogicalDirectorySource } from '../../sources/logicalDirectory';
import { loadLogicalInheritance } from '../../sources/logicalInheritance';
import { edfFixture } from '../edfFixture';
import { zipFixture } from '../zipFixture';
import { tarFixture, tarRecord } from '../tarFixture';
import { squashfsFile } from '../squashfsFixture';

const signal = () => new AbortController().signal;

void test('EDF recordings resolve inherited JSON without reading samples or borrowing another task', async () => {
  await temporary(async (folder) => {
    await mkdir(join(folder, 'sub-01/eeg'), { recursive: true });
    const uri = pathToFileURL(folder).href;
    await writeFile(
      join(folder, 'task-rest_eeg.json'),
      '{"SamplingFrequency":200,"EEGReference":"Cz"}',
    );
    await writeFile(join(folder, 'task-other_eeg.json'), '{"SamplingFrequency":999}');
    const path = 'sub-01/eeg/sub-01_task-rest_eeg.edf';
    await writeFile(join(folder, path), edfFixture());
    const source = new LogicalDirectorySource();
    const result = await loadLogicalInheritance(
      source,
      {
        datasetUri: uri,
        uri: pathToFileURL(join(folder, path)).href,
        relativePath: path,
        name: 'sub-01_task-rest_eeg.edf',
        kind: 'file',
      },
      signal(),
    );
    assert.equal(result.status, 'resolved');
    assert.equal(
      result.fields.find((field) => field.key === 'SamplingFrequency')?.value.valueText,
      '200',
    );
    assert.equal(result.sources.length, 1);
  });
});
async function temporary(run: (folder: string) => Promise<void>) {
  const folder = await mkdtemp(join(tmpdir(), 'bids-recording-'));
  try {
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

void test('loose recording summary reads only the technical header, without changing/caching data', async () => {
  await temporary(async (folder) => {
    const file = join(folder, 'task-rest_eeg.edf');
    const bytes = Buffer.concat([edfFixture('EDF+C'), Buffer.alloc(2 * 1024 * 1024, 241)]);
    await writeFile(file, bytes);
    const reads: [number, number][] = [];
    let closed = false;
    const io: RecordingHeaderIO = {
      stat: lstat,
      open: async (path) => {
        const handle = await open(path, 'r');
        return {
          stat: () => handle.stat(),
          close: async () => {
            closed = true;
            await handle.close();
          },
          read: async (buffer, offset, length, position) => {
            reads.push([position, length]);
            // Deliberately short reads exercise repeated positional reads.
            return handle.read(buffer, offset, Math.min(length, 128), position);
          },
        };
      },
    };
    const result = await loadRecordingHeader(pathToFileURL(file).href, signal(), io);
    assert.equal(result.coverage, 'technical-header-only');
    assert.equal(result.payloadIntegrity, 'not-checked');
    assert.equal(result.memberBytes, bytes.length);
    assert.equal(result.header.signals.length, 3);
    assert.equal(result.header.signals[2].annotations, true);
    assert.equal(
      reads.reduce((n, [, length]) => n + Math.min(length, 128), 0),
      1280,
    );
    assert.ok(reads.every(([position, length]) => position + Math.min(length, 128) <= 1024));
    assert.ok(closed);
    assert.deepEqual(await readFile(file), bytes);
  });
});

void test('ZIP, ustar, gzip tar and SquashFS return the same header with explicit unchecked payload', async () => {
  await temporary(async (folder) => {
    const name = 'task-rest_eeg.edf';
    const data = Buffer.concat([edfFixture('EDF+C'), Buffer.alloc(65536, 81)]);
    const rawTar = tarFixture(tarRecord(name, data));
    for (const [filename, bytes, format] of [
      ['plain.zip', zipFixture([{ name, bytes: data }]), undefined],
      ['deflated.zip', zipFixture([{ name, bytes: data, method: 8 }]), undefined],
      ['plain.tar', rawTar, 'tar'],
      ['compressed.tgz', gzipSync(rawTar), 'tar'],
    ] as const) {
      const path = join(folder, filename);
      await writeFile(path, bytes);
      const stat = await lstat(path);
      const uri = archiveResourceUri({
        format,
        sourceUri: pathToFileURL(path).href,
        memberIndex: 0,
        memberPath: name,
        revision: { size: stat.size, modifiedAt: stat.mtimeMs },
      });
      const result = await loadRecordingHeader(uri, signal());
      assert.equal(result.header.format, 'EDF+C', filename);
      assert.equal(result.memberBytes, data.length);
      assert.equal(result.header.signals[0].samplingFrequency, 200);
      assert.equal(result.archiveSource?.memberPath, name);
      assert.equal(result.payloadIntegrity, 'not-checked');
      assert.deepEqual(await readFile(path), bytes);
      const prefix = await readArchivePrefix(uri, signal(), data.length + 1);
      assert.deepEqual(prefix.data, data, 'A short member returns its actual prefix length');
      await writeFile(path, Buffer.concat([bytes, Buffer.from('changed')]));
      await assert.rejects(loadRecordingHeader(uri, signal()), /changed/i);
    }
    const squashFolder = join(folder, 'squash');
    await mkdir(squashFolder);
    for (const options of [{}, { gzip: true }, { fragment: true, gzip: true }, { long: true }]) {
      const path = join(squashFolder, 'recording.sqfs');
      const bytes = squashfsFile(name, data, options);
      await writeFile(path, bytes);
      const source = new LogicalDirectorySource();
      const root = await source.root(pathToFileURL(squashFolder).href);
      const [entry] = await source.children(root, signal());
      const uri = entryArchiveUri(entry);
      const result = await loadRecordingHeader(uri, signal());
      assert.equal(result.header.format, 'EDF+C');
      assert.equal(result.memberBytes, data.length);
      assert.deepEqual(await readFile(path), bytes);
    }
  });
});

void test('rejects unsupported/truncated sources, unsafe prefixes, links and cancellation', async () => {
  await temporary(async (folder) => {
    const path = join(folder, 'recording.edf');
    const uri = pathToFileURL(path).href;
    for (const bytes of [Buffer.alloc(0), edfFixture().subarray(0, 512), Buffer.alloc(256, 32)]) {
      await writeFile(path, bytes);
      await assert.rejects(loadRecordingHeader(uri, signal()), /Truncated|Unsupported/);
    }
    const link = join(folder, 'link.edf');
    await symlink(path, link);
    await assert.rejects(loadRecordingHeader(pathToFileURL(link).href, signal()), /ordinary/);
    await assert.rejects(loadRecordingHeader(pathToFileURL(folder).href, signal()), /ordinary/);
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(loadRecordingHeader(uri, aborted.signal), /abort/i);
    for (const length of [0, -1, 0.5, Infinity, 262401])
      await assert.rejects(readArchivePrefix('irrelevant', signal(), length), /prefix length/);
  });
});

void test('source replacement, early EOF, cancellation and changed rereads close the handle without publication', async () => {
  await temporary(async (folder) => {
    const path = join(folder, 'recording.edf');
    const uri = pathToFileURL(path).href;
    await writeFile(path, edfFixture());
    for (const scenario of [
      'open-change',
      'end-change',
      'path-change',
      'eof',
      'header-change',
      'cancel',
    ]) {
      let closed = false,
        reads = 0,
        stats = 0,
        paths = 0;
      const controller = new AbortController();
      const io: RecordingHeaderIO = {
        stat: async (file) => {
          const stat = await lstat(file);
          paths++;
          if (scenario === 'path-change' && paths > 1) stat.ino++;
          return stat;
        },
        open: async (file) => {
          const handle = await open(file, 'r');
          return {
            close: async () => {
              closed = true;
              await handle.close();
            },
            stat: async () => {
              const stat = await handle.stat();
              stats++;
              if (scenario === 'open-change' || (scenario === 'end-change' && stats > 1))
                stat.ino++;
              return stat;
            },
            read: async (buffer, offset, length, position) => {
              reads++;
              if (scenario === 'eof') return { bytesRead: 0, buffer };
              const result = await handle.read(buffer, offset, length, position);
              if (scenario === 'header-change' && reads === 2) buffer[8] ^= 1;
              if (scenario === 'cancel') controller.abort();
              return result;
            },
          };
        },
      };
      await assert.rejects(
        loadRecordingHeader(uri, controller.signal, io),
        /changed|ended|abort/i,
        scenario,
      );
      assert.ok(closed, scenario);
    }
  });
});

void test('header-only archive reads do not claim CRC/terminator verification or weaken full reads', async () => {
  await temporary(async (folder) => {
    const name = 'task-rest_eeg.edf';
    const data = Buffer.concat([edfFixture(), Buffer.alloc(65536, 71)]);
    const zip = zipFixture([{ name, bytes: data }]);
    zip.writeUInt32LE(0, zip.indexOf(Buffer.from('504b0102', 'hex')) + 16);
    const incompleteTar = tarFixture(tarRecord(name, data)).subarray(0, -512);
    for (const [filename, bytes, format, error] of [
      ['bad-crc.zip', zip, undefined, /CRC/],
      ['bad-terminator.tar', incompleteTar, 'tar', /terminator/],
    ] as const) {
      const path = join(folder, filename);
      await writeFile(path, bytes);
      const stat = await lstat(path);
      const ref = {
        sourceUri: pathToFileURL(path).href,
        memberPath: name,
        memberIndex: 0,
        format,
        revision: { size: stat.size, modifiedAt: stat.mtimeMs },
      };
      const uri = archiveResourceUri(ref);
      assert.equal((await loadRecordingHeader(uri, signal())).payloadIntegrity, 'not-checked');
      await assert.rejects(
        streamArchiveMember(uri, ref, signal(), 1024 * 1024, () => Promise.resolve()),
        error,
      );
    }
  });
});

void test('tar prefixes stop at bounded scan work instead of scanning a large preceding payload', async () => {
  await temporary(async (folder) => {
    const path = join(folder, 'large.tar');
    const name = 'task-rest_eeg.edf';
    const data = tarFixture(
      tarRecord('earlier', Buffer.alloc(16 * 1024 * 1024 - 512)),
      tarRecord(name, edfFixture()),
    );
    await writeFile(path, data);
    const stat = await lstat(path);
    const uri = archiveResourceUri({
      sourceUri: pathToFileURL(path).href,
      memberPath: name,
      memberIndex: 1,
      format: 'tar',
      revision: { size: stat.size, modifiedAt: stat.mtimeMs },
    });
    await assert.rejects(loadRecordingHeader(uri, signal()), /scan limit/);
  });
});
