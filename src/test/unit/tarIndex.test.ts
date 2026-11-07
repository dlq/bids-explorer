import assert from 'node:assert/strict';
import fs, { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { indexTar, streamTarMember } from '../../sources/tarIndex';
import { tarFixture, tarRecord } from '../tarFixture';

async function fixture(run: (folder: string) => Promise<void>): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), 'bids-tar-'));
  try {
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

void test('plain and gzip ustar preserve exact names, ordinals, type and duplicate choices', async () => {
  await fixture(async (folder) => {
    const raw = tarFixture(
      tarRecord('wrapper/', undefined, { type: 53 }),
      tarRecord('dwi.nii.gz', Buffer.alloc(64_001, 5), { prefix: 'wrapper/sub-01' }),
      tarRecord('dwi.nii.gz', Buffer.from('duplicate'), { prefix: 'wrapper/sub-01', type: 0 }),
      tarRecord('wrapper/link', undefined, { type: 50 }),
      tarRecord('wrapper/hardlink', undefined, { type: 49 }),
    );
    for (const name of ['sample.tar', 'sample.tar.gz', 'sample.TGZ']) {
      const file = join(folder, name);
      await writeFile(file, name.endsWith('.tar') ? raw : gzipSync(raw));
      const result = await indexTar(pathToFileURL(file).href, new AbortController().signal);
      assert.equal(result.coverage, 'complete');
      assert.equal(result.format, name.endsWith('.tar') ? 'tar' : 'tar.gz');
      assert.deepEqual(
        result.members.map(({ resource, kind, bytes }) => [
          resource.memberPath,
          resource.memberIndex,
          kind,
          bytes,
        ]),
        [
          ['wrapper/', 0, 'directory', 0],
          ['wrapper/sub-01/dwi.nii.gz', 1, 'file', 64001],
          ['wrapper/sub-01/dwi.nii.gz', 2, 'file', 9],
          ['wrapper/link', 3, 'symlink', 0],
          ['wrapper/hardlink', 4, 'special', 0],
        ],
      );
    }
  });
});

void test('tar inventory rejects unsupported, malformed and excessive inputs without publishing a partial index', async () => {
  await fixture(async (folder) => {
    const signal = new AbortController().signal;
    const file = join(folder, 'bad.tar');
    const uri = pathToFileURL(file).href;
    const clean = tarFixture(tarRecord('safe'));
    const corrupt = Buffer.from(clean);
    corrupt[1] ^= 1;
    const cases: [Buffer, RegExp][] = [
      [Buffer.alloc(0), /empty/],
      [corrupt, /checksum/],
      [tarFixture(tarRecord('safe', undefined, { magic: 'oldtar' })), /ustar/],
      [tarFixture(tarRecord('safe', undefined, { type: 120 })), /extended header/],
      [tarFixture(tarRecord('safe', undefined, { size: '00000000008' })), /numeric field/],
      [tarFixture(tarRecord('safe', Buffer.from('x'), { type: 53 })), /empty payload/],
      [tarFixture(tarRecord('../escape')), /Unsafe/],
      [clean.subarray(0, -512), /Truncated/],
      [Buffer.concat([Buffer.alloc(512), clean]), /Invalid tar terminator/],
      [Buffer.concat([clean, Buffer.from('tail')]), /after the tar terminator/],
      [tarFixture(tarRecord('safe', undefined, { size: '77777777777' })), /member exceeds/],
    ];
    for (const [bytes, error] of cases) {
      await writeFile(file, bytes);
      await assert.rejects(indexTar(uri, signal), error);
    }
    const gz = join(folder, 'bad.tgz');
    const gzUri = pathToFileURL(gz).href;
    await writeFile(gz, gzipSync(tarFixture(tarRecord('big', Buffer.alloc(4096)))));
    await assert.rejects(indexTar(gzUri, signal, { entries: 10, scanBytes: 2048 }), /decoded scan/);
    const invalidGzip = gzipSync(clean);
    invalidGzip[invalidGzip.length - 8] ^= 1;
    await writeFile(gz, invalidGzip);
    await assert.rejects(indexTar(gzUri, signal), /incorrect data check/);
    await writeFile(file, tarFixture(tarRecord('one'), tarRecord('two')));
    await assert.rejects(indexTar(uri, signal, { entries: 1, scanBytes: 4096 }), /entry limit/);
    await assert.rejects(
      indexTar(uri, signal, { entries: 1, scanBytes: 1024 }),
      /source.*scan limit/,
    );
    for (const limits of [
      { entries: NaN, scanBytes: 1024 },
      { entries: 0, scanBytes: 1024 },
      { entries: 100001, scanBytes: 1024 },
      { entries: 1, scanBytes: NaN },
      { entries: 1, scanBytes: 1023 },
      { entries: 1, scanBytes: 2 ** 31 + 1 },
    ])
      await assert.rejects(indexTar(uri, signal, limits), /Invalid tar inventory limits/);
    await assert.rejects(indexTar(pathToFileURL(join(folder, 'bad.zip')).href, signal), /Choose a/);
    const link = join(folder, 'link.tar');
    await symlink(file, link);
    await assert.rejects(indexTar(pathToFileURL(link).href, signal), /ordinary file/);
    await assert.rejects(indexTar(uri, AbortSignal.abort()), { name: 'AbortError' });
  });
});

void test('cancelling a running tar scan closes its stream', async (t) => {
  await fixture(async (folder) => {
    const open = fs.open;
    const file = join(folder, 'cancel.tgz');
    await writeFile(file, gzipSync(tarFixture(tarRecord('data', Buffer.alloc(128_000)))));
    const controller = new AbortController();
    let started = false;
    let closed = false;
    const mock = t.mock.method(fs, 'open', async (...args: Parameters<typeof open>) => {
      const handle = await open(...args);
      const createReadStream = handle.createReadStream.bind(handle);
      handle.createReadStream = (options) => {
        const stream = createReadStream(options);
        stream.once('data', () => {
          started = true;
          controller.abort();
        });
        stream.once('close', () => {
          closed = true;
        });
        return stream;
      };
      return handle;
    });
    try {
      await assert.rejects(indexTar(pathToFileURL(file).href, controller.signal), {
        name: 'AbortError',
      });
      assert.equal(started, true);
      assert.equal(closed, true);
    } finally {
      mock.mock.restore();
    }
  });
});

void test('selected tar payloads match the exact ordinal, revision and path', async () => {
  await fixture(async (folder) => {
    const file = join(folder, 'selected.tgz');
    const uri = pathToFileURL(file).href;
    const signal = new AbortController().signal;
    const raw = tarFixture(
      tarRecord('duplicate.json', Buffer.from('first')),
      tarRecord('duplicate.json', Buffer.alloc(70_000, 97)),
      tarRecord('link', undefined, { type: 50 }),
    );
    await writeFile(file, gzipSync(raw));
    const index = await indexTar(uri, signal);
    const ref = { ...index.members[1].resource, revision: index.revision };
    const chunks: Buffer[] = [];
    const collect = (chunk: Buffer) => {
      chunks.push(chunk);
      return Promise.resolve();
    };
    await streamTarMember(ref, signal, 70_000, collect);
    assert.deepEqual(Buffer.concat(chunks), Buffer.alloc(70_000, 97));
    await assert.rejects(streamTarMember(ref, signal, 0, collect), /Invalid tar member read limit/);
    await assert.rejects(streamTarMember(ref, signal, 69_999, collect), /exceeds the read limit/);
    await assert.rejects(
      streamTarMember({ ...ref, memberPath: 'elsewhere' }, signal, 70_000, collect),
      /does not match/,
    );
    await assert.rejects(
      streamTarMember({ ...ref, ...index.members[2].resource }, signal, 70_000, collect),
      /ordinary file/,
    );
    await assert.rejects(
      streamTarMember({ ...ref, memberIndex: 3 }, signal, 70_000, collect),
      /absent/,
    );
    await assert.rejects(
      streamTarMember(ref, signal, 70_000, () => Promise.reject(new Error('sink failed'))),
      /sink failed/,
    );
    const corrupt = gzipSync(raw);
    corrupt[corrupt.length - 8] ^= 1;
    await writeFile(file, corrupt);
    await assert.rejects(
      streamTarMember(
        { ...ref, revision: { ...ref.revision, modifiedAt: -1 } },
        signal,
        70_000,
        collect,
      ),
      /changed since listing/,
    );
    const { mtimeMs, size } = await fs.stat(file);
    await assert.rejects(
      streamTarMember({ ...ref, revision: { size, modifiedAt: mtimeMs } }, signal, 70_000, collect),
      /incorrect data check/,
    );
  });
});

void test('plain and gzip selected reads return exact bytes and cancel during payload delivery', async () => {
  await fixture(async (folder) => {
    const payload = Buffer.alloc(140_123, 0x5a);
    const raw = tarFixture(tarRecord('first', Buffer.from('skip')), tarRecord('scan.nii', payload));
    for (const [name, bytes] of [
      ['sample.tar', raw],
      ['sample.tar.gz', gzipSync(raw)],
    ] as const) {
      const file = join(folder, name);
      await writeFile(file, bytes);
      const signal = new AbortController().signal;
      const index = await indexTar(pathToFileURL(file).href, signal);
      const ref = { ...index.members[1].resource, revision: index.revision };
      const chunks: Buffer[] = [];
      await streamTarMember(ref, signal, payload.length, (chunk) => {
        chunks.push(Buffer.from(chunk));
        return Promise.resolve();
      });
      assert.deepEqual(Buffer.concat(chunks), payload);
      const controller = new AbortController();
      let delivered = 0;
      await assert.rejects(
        streamTarMember(ref, controller.signal, payload.length, (chunk) => {
          delivered += chunk.length;
          controller.abort();
          return Promise.resolve();
        }),
        { name: 'AbortError' },
      );
      assert.ok(delivered > 0 && delivered < payload.length);
      assert.deepEqual(await fs.readFile(file), bytes);
    }
  });
});

void test('tar rejects path replacement between lstat and open before reading selected or indexed bytes', async (t) => {
  for (const selected of [false, true]) {
    for (const replacement of ['file', 'directory', 'symlink']) {
      await fixture(async (folder) => {
        const file = join(folder, 'source.tar');
        const uri = pathToFileURL(file).href;
        const bytes = tarFixture(tarRecord('data.json', Buffer.from('{}')));
        await writeFile(file, bytes);
        const index = await indexTar(uri, new AbortController().signal);
        const ref = { ...index.members[0].resource, revision: index.revision };
        const originalOpen = fs.open;
        let opened = false;
        let closed = false;
        let read = false;
        let emitted = false;
        const mock = t.mock.method(fs, 'open', async (...args: Parameters<typeof originalOpen>) => {
          // Keep the original inode alive so replacement cannot reuse it.
          await fs.rename(file, join(folder, 'original.tar'));
          if (replacement === 'file') await writeFile(file, bytes);
          else if (replacement === 'directory') await fs.mkdir(file);
          else await symlink(join(folder, 'original.tar'), file);
          const handle = await originalOpen(...args);
          opened = true;
          const close = handle.close.bind(handle);
          handle.close = async () => {
            closed = true;
            await close();
          };
          const createReadStream = handle.createReadStream.bind(handle);
          handle.createReadStream = (options) => {
            read = true;
            return createReadStream(options);
          };
          return handle;
        });
        try {
          const operation = selected
            ? streamTarMember(ref, new AbortController().signal, 1024, () => {
                emitted = true;
                return Promise.resolve();
              })
            : indexTar(uri, new AbortController().signal);
          await assert.rejects(
            operation,
            replacement === 'symlink' ? /ELOOP/ : /changed while opening/,
          );
          assert.equal(read, false, 'No archive bytes may be read through the replaced path');
          assert.equal(emitted, false, 'No selected payload may escape the revision check');
          assert.equal(closed, opened, 'Every successfully opened descriptor must close');
        } finally {
          mock.mock.restore();
        }
      });
    }
  }
});
