import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { lstat, opendir, mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadInheritedMetadata } from '../../sources/inheritedMetadata';
import { readTextSnapshot } from '../../sources/textSnapshotReader';

const native = { lstat, opendir, readTextSnapshot };
void test('ancestor inspection isolates derivative and nested datasets without reading images or altering files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bids-inherited-'));
  const uri = (p = '') => pathToFileURL(join(root, p)).href;
  const put = async (path: string, text: string) => {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), text);
  };
  const inspect = (path: string) =>
    loadInheritedMetadata(uri(), uri(path), new AbortController().signal);
  try {
    await put('dataset_description.json', '{}');
    await put('dwi.json', '{"root":true}');
    await put('dwi.bval', '0 1000');
    await put('dwi.bvec', '0 1\n0 0\n0 0');
    await put('sub-01/dwi/sub-01_dwi.nii.gz', 'not an image; must not be read');
    await put('sub-01/dwi/sub-01_dwi.json', '{"local":1}');
    await symlink(join(root, 'dwi.json'), join(root, 'sub-01', 'dwi', 'other.json'));
    const result = await inspect('sub-01/dwi/sub-01_dwi.nii.gz');
    assert.deepEqual(
      result.fields.map((f) => f.key),
      ['root', 'local'],
    );
    assert.equal(result.related[0].selected?.relativePath, 'dwi.bval');
    assert.equal(
      await readFile(join(root, 'sub-01/dwi/sub-01_dwi.nii.gz'), 'utf8'),
      'not an image; must not be read',
    );
    await put('derivatives/demo/sub-01/dwi/sub-01_dwi.nii', '');
    await put('derivatives/demo/dwi.json', '{"pipeline":true}');
    assert.deepEqual(
      (await inspect('derivatives/demo/sub-01/dwi/sub-01_dwi.nii')).fields.map((f) => f.key),
      ['pipeline'],
    );
    await put('nested/dataset_description.json', '{}');
    await put('nested/sub-01/dwi/sub-01_dwi.nii', '');
    assert.equal((await inspect('nested/sub-01/dwi/sub-01_dwi.nii')).sources.length, 0);
    await put('sub-01/dwi/sub-01_dwi.json', 'broken');
    assert.equal((await inspect('sub-01/dwi/sub-01_dwi.nii.gz')).status, 'unresolved');
    await assert.rejects(
      loadInheritedMetadata(uri(), uri('../outside.nii'), new AbortController().signal),
      /inside/,
    );
    await assert.rejects(
      loadInheritedMetadata(uri(), uri(), new AbortController().signal),
      /inside/,
    );
    await symlink(join(root, 'sub-01'), join(root, 'sub-02'));
    await assert.rejects(inspect('sub-02/dwi/sub-02_dwi.nii'), /ordinary directories/);
    await symlink(
      join(root, 'sub-01/dwi/sub-01_dwi.nii.gz'),
      join(root, 'sub-01/dwi/sub-01_dwi.nii'),
    );
    await assert.rejects(inspect('sub-01/dwi/sub-01_dwi.nii'), /ordinary data/);
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(
      loadInheritedMetadata(uri(), uri('sub-01/dwi/sub-01_dwi.nii.gz'), cancelled.signal),
      /abort/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('inspection exposes failed/incomplete listings, changes, permission failures and cancellation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bids-inherited-fail-'));
  const rootUri = pathToFileURL(root).href;
  const path = join(root, 'bold.nii'),
    uri = pathToFileURL(path).href;
  const run = (io: typeof native) =>
    loadInheritedMetadata(rootUri, uri, new AbortController().signal, io);
  try {
    await writeFile(path, '');
    await writeFile(join(root, 'bold.json'), '{"x":1}');
    const fail = {
      ...native,
      opendir: (() => Promise.reject(new Error('denied'))) as typeof opendir,
    };
    assert.equal((await run(fail)).coverage, 'incomplete');
    const readChanged = {
      ...native,
      readTextSnapshot: async (...args: Parameters<typeof readTextSnapshot>) => {
        const snapshot = await readTextSnapshot(...args);
        await writeFile(join(root, 'bold.json'), '{"x":123456789}');
        return snapshot;
      },
    };
    await assert.rejects(run(readChanged), /Metadata changed/);
    const targetChanged = {
      ...native,
      readTextSnapshot: async (...args: Parameters<typeof readTextSnapshot>) => {
        const snapshot = await readTextSnapshot(...args);
        await writeFile(path, 'changed');
        return snapshot;
      },
    };
    await assert.rejects(run(targetChanged), /Source changed/);
    // A directory marker can be unreadable independently of its containing directory.
    await mkdir(join(root, 'sub-01'));
    await writeFile(join(root, 'sub-01', 'sub-01_bold.nii'), '');
    const denied = {
      ...native,
      lstat: (async (name: Parameters<typeof lstat>[0]) => {
        if (String(name).endsWith('dataset_description.json')) throw new Error('marker denied');
        return lstat(name);
      }) as typeof lstat,
    };
    await assert.rejects(
      loadInheritedMetadata(
        rootUri,
        pathToFileURL(join(root, 'sub-01/sub-01_bold.nii')).href,
        new AbortController().signal,
        denied,
      ),
      /marker denied/,
    );
    const abort = new AbortController();
    const aborting = {
      ...native,
      opendir: (async (...args: Parameters<typeof opendir>) => {
        abort.abort();
        return opendir(...args);
      }) as typeof opendir,
    };
    await assert.rejects(loadInheritedMetadata(rootUri, uri, abort.signal, aborting), /abort/i);
    // Inject a streaming wide directory without creating 50,001 physical fixture files.
    const wide = {
      ...native,
      opendir: (() =>
        Promise.resolve({
          async *[Symbol.asyncIterator]() {
            await Promise.resolve();
            for (let i = 0; i < 50001; i++)
              yield {
                name: `entry-${i}`,
                isFile: () => false,
                isDirectory: () => false,
                isSymbolicLink: () => false,
              };
          },
        })) as unknown as typeof opendir,
    };
    const capped = await run(wide);
    assert.equal(capped.coverage, 'incomplete');
    assert.match(capped.issues[0], /50,000/);
    const fakeKinds = {
      ...native,
      opendir: (() =>
        Promise.resolve({
          async *[Symbol.asyncIterator]() {
            await Promise.resolve();
            yield {
              name: 'folder',
              isFile: () => false,
              isSymbolicLink: () => false,
              isDirectory: () => true,
            };
          },
        })) as unknown as typeof opendir,
    };
    assert.equal((await run(fakeKinds)).status, 'resolved');
    // Change directory attributes after enumeration but before publication.
    const changed = {
      ...native,
      readTextSnapshot: async (...args: Parameters<typeof readTextSnapshot>) => {
        const snapshot = await readTextSnapshot(...args);
        await writeFile(join(root, 'new-file'), '');
        return snapshot;
      },
    };
    await assert.rejects(run(changed), /Source changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
