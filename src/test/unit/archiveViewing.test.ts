import { loadParticipantPreview, scanParticipantTable } from '../../sources/participantTablePaging';
import { parseJsonMetadata, parseDatasetDescription } from '../../core/metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  mkdtemp,
  writeFile,
  readFile,
  lstat,
  rm,
  symlink,
  mkdir,
  appendFile,
  readdir,
  chmod,
  open,
  rename,
} from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { hostname, tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';
import {
  archiveResourceUri,
  parseArchiveUri,
  resourcePath,
  resourceLabel,
  entryArchiveUri,
  type ArchiveRef,
} from '../../core/archiveUri';
import { memberCrc32, readZipMember, streamZipMember } from '../../sources/zipMember';
import { ArchiveImageCache } from '../../sources/archiveImageCache';
import { archiveSiblings } from '../../sources/archiveMetadata';
import { loadSummaryTable } from '../../sources/summaryTables';
import { loadJsonMetadata } from '../../sources/datasetDescription';
import { loadGradientPair } from '../../sources/gradientFiles';
import { readTextSnapshot } from '../../sources/textSnapshotReader';
import { zipFixture, type ZipFixtureEntry } from '../zipFixture';

const signal = (): AbortSignal => new AbortController().signal;
async function fixture(
  run: (
    folder: string,
    path: string,
    ref: (memberPath: string, index?: number) => Promise<string>,
    write: (entries: readonly ZipFixtureEntry[]) => Promise<void>,
  ) => Promise<void>,
): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), 'bids-archive-view-'));
  const path = join(folder, 'data.zip');
  const ref = async (memberPath: string, index = 0): Promise<string> => {
    const stat = await lstat(path);
    return archiveResourceUri({
      sourceUri: pathToFileURL(path).href,
      memberPath,
      memberIndex: index,
      revision: { size: stat.size, modifiedAt: stat.mtimeMs },
    });
  };
  try {
    await run(folder, path, ref, (entries) => writeFile(path, zipFixture(entries)));
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
void test('archive URI identity round-trips literal paths and duplicate ordinals, rejecting malformed references', () => {
  const ref: ArchiveRef = {
    sourceUri: 'file:///archive%20name.zip',
    memberPath: 'sub-01/a +%#?.json',
    memberIndex: 2,
    revision: { size: 123, modifiedAt: 1.25 },
  };
  const uri = archiveResourceUri(ref);
  assert.deepEqual(parseArchiveUri(uri), ref);
  assert.equal(resourcePath(uri), ref.memberPath);
  assert.equal(resourcePath('file:///a%20b.json'), '/a b.json');
  assert.match(resourceLabel(uri), /member 2/);
  assert.equal(resourceLabel('file:///a.json'), 'file:///a.json');
  assert.notEqual(uri, archiveResourceUri({ ...ref, memberIndex: 3 }));
  assert.throws(
    () =>
      entryArchiveUri({
        datasetUri: 'file:///d',
        uri: 'file:///d/a.zip',
        relativePath: 'a.zip',
        name: 'a.zip',
        kind: 'directory',
      }),
    /indexed/,
  );
  assert.equal(
    entryArchiveUri({
      datasetUri: 'file:///d',
      uri: ref.sourceUri,
      relativePath: ref.memberPath,
      name: 'a.json',
      kind: 'file',
      archive: { ...ref, containerPath: 'a.zip' },
    }),
    uri,
  );
  const token = (fields: unknown): string => {
    const value = new URL(uri);
    value.search = Buffer.from(JSON.stringify(fields)).toString('base64url');
    return value.href;
  };
  const invalidRef = (values: Partial<ArchiveRef>): string =>
    archiveResourceUri({ ...ref, ...values });
  for (const value of [
    uri + '#fragment',
    uri.replace('member/', 'other/'),
    uri.replace('bids-zip:', 'https:'),
    uri + '&duplicate=1',
    invalidRef({ memberIndex: -1 }),
    invalidRef({ memberIndex: 100000 }),
    invalidRef({ revision: { size: -1, modifiedAt: 1 } }),
    invalidRef({ revision: { size: 1, modifiedAt: NaN } }),
    invalidRef({ sourceUri: 'https://example.com/a.zip' }),
    uri.replace('bids-zip://', 'bids-zip://user:pass@'),
    token({ source: 'invalid' }),
    token(['file:///a.zip', 0]),
    token([false, 0, 1, 1]),
    'x'.repeat(32769),
  ])
    assert.throws(() => parseArchiveUri(value));
  assert.throws(() => archiveResourceUri({ ...ref, memberPath: '../escape' }));
});
void test('selected ZIP streams verify sizes and CRC, distinguish duplicate members, and support native/fallback checksums', async () => {
  assert.equal(memberCrc32(Buffer.from('123456789'), 0, null), 0xcbf43926);
  const first = memberCrc32(Buffer.from('1234'), 0, null);
  assert.equal(memberCrc32(Buffer.from('56789'), first, null), crc32(Buffer.from('123456789')));
  assert.equal(memberCrc32(Buffer.from('native')), crc32(Buffer.from('native')));
  await fixture(async (_folder, _path, ref, write) => {
    await write([
      { name: 'sub-01/a.json', text: '{"TaskName":"Test"}', method: 8 },
      { name: 'sub-01/a.json', text: 'duplicate' },
    ]);
    const uri = await ref('sub-01/a.json');
    assert.equal((await readZipMember(uri, signal())).toString(), '{"TaskName":"Test"}');
    assert.equal(
      (await readZipMember(await ref('sub-01/a.json', 1), signal())).toString(),
      'duplicate',
    );
    const snapshot = await readTextSnapshot(uri, signal());
    assert.equal(snapshot.sourceUri, uri);
    assert.deepEqual(snapshot.archiveSource, parseArchiveUri(uri));
    await assert.rejects(readZipMember(await ref('wrong.json'), signal()), /identity/);
    await assert.rejects(readZipMember(await ref('absent', 2), signal()), /identity/);
    await assert.rejects(readZipMember(uri, signal(), 1), /size/);
    await assert.rejects(readZipMember(uri, signal(), 0), /limit/);
    await assert.rejects(readZipMember(uri, AbortSignal.abort()), { name: 'AbortError' });
  });
});
void test('member reader rejects unsafe names, links, special/encrypted/unsupported files, output lies and corruption', async () => {
  await fixture(async (_folder, path, ref, write) => {
    for (const entry of [
      { name: 'link.nii', type: 0xa000 },
      { name: 'special.nii', type: 0x1000 },
      { name: 'dir/', type: 0x4000 },
      { name: 'secret.nii', flags: 0x801, text: 'ciphertext' },
      { name: 'unsupported.nii', method: 99 },
      { name: 'bomb.nii', method: 8, text: 'x'.repeat(2 * 1024 * 1024) },
    ]) {
      await write([entry]);
      const uri = await ref(entry.name.endsWith('/') ? entry.name.slice(0, -1) : entry.name);
      await assert.rejects(readZipMember(uri, signal(), 4 * 1024 * 1024));
    }
    await write([{ name: 'bad\\path.nii' }]);
    await assert.rejects(readZipMember(await ref('safe.nii'), signal()), /invalid|backslash/i);
    await write([{ name: 'a.nii', text: 'ordinary' }]);
    let bytes = await readFile(path);
    bytes[30 + Buffer.byteLength('a.nii')] ^= 1;
    await writeFile(path, bytes);
    await assert.rejects(readZipMember(await ref('a.nii'), signal()), /CRC/);
    await write([{ name: 'a.nii', text: 'inflate me inflate me', method: 8 }]);
    bytes = await readFile(path);
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bytes.writeUInt32LE(1, central + 24);
    await writeFile(path, bytes);
    await assert.rejects(readZipMember(await ref('a.nii'), signal()), /size|output|bytes/);
    await write([{ name: 'a.json', bytes: Buffer.from([0xff, 0xfe]) }]);
    await assert.rejects(readTextSnapshot(await ref('a.json'), signal()), /encoding|encoded/i);
  });
});
void test('member reads close handles on cancellation, sink failures, source changes and open races', async () => {
  await fixture(async (folder, path, ref, write) => {
    await write([{ name: 'a.nii', text: 'source bytes' }]);
    const uri = await ref('a.nii');
    await assert.rejects(
      streamZipMember(uri, signal(), 1024, () => Promise.reject(new Error('sink failed'))),
      /sink failed/,
    );
    const early = new AbortController();
    await assert.rejects(
      streamZipMember(
        uri,
        early.signal,
        1024,
        () => Promise.resolve(),
        () => {
          early.abort();
          return Promise.resolve();
        },
      ),
      { name: 'AbortError' },
    );
    const mid = new AbortController();
    await assert.rejects(
      streamZipMember(uri, mid.signal, 1024, () => {
        mid.abort();
        return Promise.resolve();
      }),
      { name: 'AbortError' },
    );
    await assert.rejects(
      streamZipMember(uri, signal(), 1024, async () => {
        await appendFile(path, 'changed');
      }),
      /changed/,
    );
    await assert.rejects(readZipMember(uri, signal()), /changed/);
    await write([{ name: 'a.nii', text: 'source bytes' }]);
    const current = await ref('a.nii');
    let closed = false;
    await assert.rejects(
      streamZipMember(
        current,
        signal(),
        1024,
        () => Promise.resolve(),
        () => Promise.resolve(),
        {
          stat: lstat,
          open: async (p) => {
            await rename(p, p + '.old');
            await writeFile(p, zipFixture([{ name: 'a.nii', text: 'replacement' }]));
            const handle = await open(p, 'r');
            return {
              fd: handle.fd,
              stat: handle.stat.bind(handle),
              close: async () => {
                closed = true;
                await handle.close();
              },
            };
          },
        },
      ),
      /opening/,
    );
    assert.equal(closed, true);
    const late = new AbortController();
    await assert.rejects(
      streamZipMember(
        await ref('a.nii'),
        late.signal,
        1024,
        () => Promise.resolve(),
        () => Promise.resolve(),
        {
          stat: lstat,
          open: async (p) => {
            const handle = await open(p, 'r');
            return {
              fd: handle.fd,
              stat: handle.stat.bind(handle),
              close: async () => {
                await handle.close();
                late.abort();
              },
            };
          },
        },
      ),
      { name: 'AbortError' },
    );

    const original = parseArchiveUri(await ref('a.nii'));
    await symlink(path, join(folder, 'link.zip'));
    await assert.rejects(
      readZipMember(
        archiveResourceUri({
          ...original,
          sourceUri: pathToFileURL(join(folder, 'link.zip')).href,
        }),
        signal(),
      ),
      /ordinary/,
    );
    await assert.rejects(
      readZipMember(
        archiveResourceUri({ ...original, sourceUri: pathToFileURL(folder).href }),
        signal(),
      ),
      /ordinary/,
    );
  });
});
void test('archive metadata previews retain provenance, numeric tokens, dictionaries and companion ambiguity', async () => {
  await fixture(async (_folder, _path, ref, write) => {
    await write([
      { name: 'task-rest_bold.json', text: '{"TaskName":"Rest","N":9007199254740993}' },
      { name: 'events.tsv', text: 'onset\tduration\n0\t1\n0\t2' },
      { name: 'events.json', text: '{"duration":{"Units":"s"}}' },
      { name: 'dwi.bval', text: '0 1000' },
      { name: 'dwi.bvec', text: '0 1\n0 0\n0 0' },
      { name: 'dataset_description.json', text: '{"Name":"Archive sample"}' },
      { name: 'generic.tsv', text: 'a\tb\n001\t2' },
      { name: 'bad.tsv', text: 'a\n1' },
      { name: 'bad.json', text: 'invalid json' },
    ]);
    const metadata = await loadJsonMetadata(await ref('task-rest_bold.json'), signal());
    assert.equal(metadata.kind, 'json-sidecar');
    assert.match(JSON.stringify(metadata), /9007199254740993/);
    assert.equal(
      (await loadJsonMetadata(await ref('dataset_description.json', 5), signal())).summary.name,
      'Archive sample',
    );
    const table = await loadSummaryTable(await ref('events.tsv', 1), signal());
    assert.equal(table.kind, 'events');
    assert.equal(table.table.rows.length, 2);
    assert.equal(table.dictionary.status, 'loaded');
    assert.equal((await loadSummaryTable(await ref('generic.tsv', 6), signal())).kind, 'table');
    assert.equal(
      (await loadSummaryTable(await ref('generic.tsv', 6), signal())).dictionary.status,
      'absent',
    );
    assert.equal(
      (await loadSummaryTable(await ref('bad.tsv', 7), signal())).dictionary.status,
      'unavailable',
    );
    const gradients = await loadGradientPair(await ref('dwi.bval', 3), signal());
    assert.equal(gradients.table.volumes.length, 2);
    await assert.rejects(archiveSiblings(await ref('events.tsv', 1), ['../outside'], signal()));
    await assert.rejects(
      archiveSiblings(await ref('events.tsv', 1), Array(129).fill('a'), signal()),
      /Too many/,
    );
    const stale = await ref('events.tsv', 1);
    await write([{ name: 'changed.json', text: 'new archive revision' }]);
    await assert.rejects(archiveSiblings(stale, ['events.json'], signal()), /changed/);
    await write([
      { name: 'dwi.bval', text: '0' },
      { name: 'dwi.bvec', text: '0\n0\n0' },
      { name: 'dwi.bvec', text: '1\n0\n0' },
    ]);
    await assert.rejects(loadGradientPair(await ref('dwi.bval'), signal()), /Ambiguous/);
    await write([
      { name: 'participants.tsv', text: 'participant_id\tage\nsub-01\t001' },
      { name: 'sub-01_sessions.tsv', text: 'session_id\tnote\nses-02\tTest' },
      { name: 'sub-01_ses-02_scans.tsv', text: 'filename\tnote\nanat/a.nii\tTest' },
    ]);
    for (const [index, path] of [
      'participants.tsv',
      'sub-01_sessions.tsv',
      'sub-01_ses-02_scans.tsv',
    ].entries()) {
      const table = await loadSummaryTable(await ref(path, index), signal());
      assert.equal(table.dictionary.status, 'absent');
      assert.equal(table.table.rows.length, 1);
    }
    const current = parseArchiveUri(await ref('participants.tsv'));
    await assert.rejects(
      archiveSiblings(
        archiveResourceUri({ ...current, revision: { ...current.revision, modifiedAt: -1 } }),
        ['participants.json'],
        signal(),
      ),
      /changed/,
    );
  });
});
void test('large archived participant tables keep the physical member and its column dictionary', async () => {
  await fixture(async (_folder, _path, ref, write) => {
    await write([
      {
        name: 'participants.tsv',
        text: 'participant_id\tgroup\n' + 'sub-01\tgroup\n'.repeat(10001),
      },
      { name: 'participants.json', text: '{"group":{"Description":"Recorded cohort"}}' },
    ]);
    const uri = await ref('participants.tsv');
    assert.equal((await loadParticipantPreview(uri, signal())).dictionary?.status, 'loaded');
    const result = await scanParticipantTable(uri, 200, 'group', signal(), () => {});
    assert.equal(result.data.table.snapshot.archiveSource?.memberPath, 'participants.tsv');
    assert.equal(result.progress.checked, 10001);
    assert.equal(result.data.table.rows.length, 1);
    assert.equal(result.data.table.rows[0].line, 10002);
  });
});
void test('MRI cache extracts only one verified member, publishes privately, reuses it and retains provenance until explicit clearing', async () => {
  await fixture(async (folder, path, ref, write) => {
    const payload = Buffer.from('selected MRI bytes');
    await write([
      { name: 'sub-01/anat/sub-01_T1w.nii.gz', bytes: payload },
      { name: 'other.nii', text: 'not selected' },
    ]);
    const uri = await ref('sub-01/anat/sub-01_T1w.nii.gz');
    const cache = new ArchiveImageCache(join(folder, 'cache'));
    const result = await cache.materialize(uri, signal());
    assert.deepEqual(await readFile(fileURLToPath(result)), payload);
    assert.equal((await lstat(fileURLToPath(result))).mode & 0o777, 0o400);
    assert.equal((await lstat(cache.root)).mode & 0o777, 0o700);
    const cachedFolder = join(fileURLToPath(result), '..');
    const provenance = JSON.parse(await readFile(join(cachedFolder, 'source.json'), 'utf8')) as {
      source: ArchiveRef;
      crc32: number;
    };
    assert.equal(provenance.source.memberPath, 'sub-01/anat/sub-01_T1w.nii.gz');
    assert.equal(provenance.crc32, crc32(payload));
    assert.equal(await cache.materialize(uri, signal()), result);
    assert.equal((await readdir(cache.root)).length, 1);
    const reopened = new ArchiveImageCache(cache.root);
    const release = await cache.retain();
    assert.equal(await reopened.clear(), false);
    assert.deepEqual(await readFile(fileURLToPath(result)), payload);
    await release();
    assert.equal(await reopened.clear(), true);
    assert.equal((await readdir(cache.root)).length, 0);
    const next = await cache.materialize(uri, signal());
    assert.notEqual(next, result);
    assert.deepEqual(await readFile(fileURLToPath(next)), payload);
    await chmod(fileURLToPath(next), 0o600);
    await appendFile(fileURLToPath(next), 'edited');
    await assert.rejects(cache.materialize(uri, signal()), /changed/);
    await cache.clear();
    await appendFile(path, 'changed');
    await assert.rejects(cache.materialize(uri, signal()), /changed/);
  });
});
void test('MRI cache budgets, unsafe storage, failures and cancellation leave no partial artifact', async () => {
  await fixture(async (folder, _path, ref, write) => {
    await write([
      { name: 'a.nii', text: 'MRI' },
      { name: 'b.nii', text: 'next' },
      { name: 'weird space.nii.gz', text: 'image' },
      { name: 'not.json', text: '{}' },
    ]);
    const a = await ref('a.nii'),
      b = await ref('b.nii', 1);
    assert.throws(
      () => new ArchiveImageCache(join(folder, 'x'), { bytes: 0, entries: 1, memberBytes: 1 }),
      /limits/,
    );
    const cache = new ArchiveImageCache(join(folder, 'cache'), {
      bytes: 10000,
      entries: 1,
      memberBytes: 100,
    });
    await cache.materialize(a, signal());
    await assert.rejects(cache.materialize(b, signal()), /full/);
    const larger = new ArchiveImageCache(cache.root, {
      bytes: 10000,
      entries: 2,
      memberBytes: 100,
    });
    await larger.materialize(b, signal());
    await assert.rejects(cache.materialize(b, signal()), /entry budget exceeded/);
    assert.equal(await cache.clear(), true);
    assert.deepEqual(await readdir(cache.root), []);
    const small = new ArchiveImageCache(cache.root, { bytes: 1, entries: 1, memberBytes: 100 });
    await assert.rejects(small.materialize(a, signal()), /budget/);
    assert.deepEqual(await readdir(cache.root), []);
    const memberLimit = new ArchiveImageCache(cache.root, {
      bytes: 10000,
      entries: 1,
      memberBytes: 1,
    });
    await assert.rejects(memberLimit.materialize(a, signal()), /size/);
    assert.deepEqual(await readdir(cache.root), []);
    await assert.rejects(cache.materialize(await ref('not.json', 3), signal()), /supports/);
    await assert.rejects(cache.materialize(a, AbortSignal.abort()), { name: 'AbortError' });
    const weird = await cache.materialize(await ref('weird space.nii.gz', 2), signal());
    assert.ok(weird.endsWith('/image.nii.gz'));
    await cache.clear();
    await writeFile(join(cache.root, 'foreign'), 'unexpected');
    await assert.rejects(cache.materialize(a, signal()), /Unexpected entry/);
    await rm(join(cache.root, 'foreign'));
    const id = 'image-00000000-0000-0000-0000-000000000000';
    await mkdir(join(cache.root, id));
    await symlink('/tmp', join(cache.root, id, 'link'));
    await assert.rejects(cache.materialize(a, signal()), /Unexpected file/);
    await rm(join(cache.root, id), { recursive: true, force: true });
    const target = join(folder, 'ordinary');
    await mkdir(target);
    const linkRoot = join(folder, 'linked-cache');
    await symlink(target, linkRoot);
    await assert.rejects(
      new ArchiveImageCache(linkRoot).materialize(a, signal()),
      /ordinary private/,
    );
  });
});

void test('literal JSON array previews preserve items, pointers and numeric tokens without relaxing metadata/dictionary objects', async () => {
  const snapshot = {
    sourceUri: 'file:///structure.json',
    text: '[ {"N":9007199254740993}, null, true, "<img>", [1,2] ]',
    revision: { size: 66, modifiedAt: 1 },
    capturedAt: 'test',
  };
  const data = await parseJsonMetadata(snapshot, signal(), true);
  assert.deepEqual(
    data.fields.map((field) => field.pointer),
    ['/0', '/1', '/2', '/3', '/4'],
  );
  assert.deepEqual(
    data.fields.map((field) => field.type),
    ['object', 'null', 'boolean', 'string', 'array'],
  );
  assert.match(data.fields[0].valueText, /9007199254740993/);
  assert.deepEqual(data.duplicateKeys, []);
  await assert.rejects(parseJsonMetadata(snapshot, signal()), /JSON object/);
  await assert.rejects(parseDatasetDescription(snapshot, signal()), /JSON object/);
  assert.equal(
    (await parseJsonMetadata({ ...snapshot, text: '[]' }, signal(), true)).fields.length,
    0,
  );
  await assert.rejects(
    parseJsonMetadata(
      { ...snapshot, text: '[' + Array(1001).fill('0').join(',') + ']' },
      signal(),
      true,
    ),
    /1,000/,
  );
  await fixture(async (_folder, _path, ref, write) => {
    await write([
      { name: 'structure.json', text: snapshot.text },
      { name: 'events.tsv', text: 'onset\tduration\n0\t1' },
      { name: 'events.json', text: '[]' },
    ]);
    assert.equal(
      (await loadJsonMetadata(await ref('structure.json'), signal())).kind,
      'json-array',
    );
    assert.equal(
      (await loadSummaryTable(await ref('events.tsv', 1), signal())).dictionary.status,
      'unavailable',
    );
  });
});

void test('MRI retry reclaims a dead local extraction and retains live, foreign and legacy directories', async (t) => {
  await fixture(async (folder, _path, ref, write) => {
    await write([{ name: 'T1w.nii', text: 'payload' }]);
    const cache = new ArchiveImageCache(join(folder, 'cache'));
    await mkdir(cache.root);
    const host = createHash('sha256').update(hostname()).digest('hex').slice(0, 16);
    const otherHost = host === '0000000000000000' ? '1111111111111111' : '0000000000000000';
    const dead = `partial-${host}-12345-${randomUUID()}`;
    const live = `partial-${host}-${process.pid}-${randomUUID()}`;
    const unknown = `partial-${host}-12346-${randomUUID()}`;
    const foreign = `partial-${otherHost}-12345-${randomUUID()}`;
    const legacy = `partial-${randomUUID()}`;
    for (const name of [dead, live, unknown, foreign, legacy]) await mkdir(join(cache.root, name));
    await writeFile(join(cache.root, dead, 'T1w.nii'), 'interrupted');
    const mock = t.mock.method(process, 'kill', (pid: number, value: number) => {
      assert.equal(value, 0);
      if (pid === process.pid) return true;
      if (pid === 12346) throw Object.assign(new Error('unknown owner'), { code: 'EPERM' });
      assert.equal(pid, 12345);
      throw Object.assign(new Error('owner exited'), { code: 'ESRCH' });
    });
    try {
      const result = await cache.materialize(await ref('T1w.nii'), signal());
      assert.equal(await readFile(fileURLToPath(result), 'utf8'), 'payload');
    } finally {
      mock.mock.restore();
    }
    const names = await readdir(cache.root);
    assert(!names.includes(dead));
    for (const name of [live, unknown, foreign, legacy]) assert(names.includes(name));
  });
});

void test('image cache excludes overlapping clears and refuses unsafe activity storage', async (t) => {
  await fixture(async (folder) => {
    const cache = new ArchiveImageCache(join(folder, 'cache'));
    const directory = cache.root + '-activity';
    await mkdir(directory);
    const host = createHash('sha256').update(hostname()).digest('hex').slice(0, 16);
    const active = join(directory, `clear-${host}-${process.pid}-${randomUUID()}`);
    await mkdir(active);
    await assert.rejects(cache.retain(), /being cleared/);
    assert.equal(await cache.clear(), false);
    assert.deepEqual(await readdir(directory), [active.split('/').pop()]);
    await rm(active, { recursive: true });
    const stale = join(directory, `use-${host}-12345-${randomUUID()}`);
    await mkdir(stale);
    const mock = t.mock.method(process, 'kill', () => {
      throw Object.assign(new Error('owner exited'), { code: 'ESRCH' });
    });
    try {
      assert.equal(await cache.clear(), true);
      assert.deepEqual(await readdir(directory), []);
    } finally {
      mock.mock.restore();
    }
    await writeFile(join(directory, 'unexpected'), '');
    await assert.rejects(cache.retain(), /Unexpected entry/);
    await rm(directory, { recursive: true });
    await symlink(folder, directory);
    await assert.rejects(cache.clear(), /ordinary private directory/);
  });
});
