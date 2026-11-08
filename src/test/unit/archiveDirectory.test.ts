import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ArchiveDirectorySource } from '../../sources/archiveDirectory';
import { LocalDirectorySource } from '../../sources/localDirectory';
import { indexZip } from '../../sources/zipIndex';
import { DatasetBrowser } from '../../core/browser';
import { archiveTree } from '../../core/archiveTree';
import { entryKey, describeEntry, type DirectoryEntry } from '../../core/directory';
import { zipFixture } from '../zipFixture';
const signal = (): AbortSignal => new AbortController().signal;

async function fixture(
  run: (folder: string, source: ArchiveDirectorySource) => Promise<void>,
): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), 'bids-zip-tree-'));
  try {
    await run(folder, new ArchiveDirectorySource());
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
void test('registered ZIP collection lists archives without indexing and browses subject/session processing folders lazily', async () => {
  await fixture(async (folder) => {
    const bytes = zipFixture([
      { name: 'sub-01_ses-2/' },
      { name: 'sub-01_ses-2/Resample_B0/a__b0.nii.gz', text: 'image', method: 8 },
      { name: 'sub-01_ses-2/Read_BIDS/info.json', text: '{}' },
      { name: 'sub-01_ses-2/.datalad/config' },
      { name: 'sub-01_ses-2/irrelevant/program.exe' },
      { name: 'sub-01_ses-2/Resample_B0/a__b0.nii.gz', text: 'alternate' },
      { name: 'sub-01_ses-2/Resample_B0/link.nii.gz', type: 0xa000 },
      { name: 'sub-01_ses-2/Resample_B0/special.nii', type: 0x1000 },
      { name: 'README', text: 'fixture' },
    ]);
    const zip = join(folder, 'sub-01_ses-2.zip');
    await writeFile(zip, bytes);
    await writeFile(join(folder, 'notes.zip.link'), 'not a ZIP');
    let reads = 0;
    const source = new ArchiveDirectorySource(new LocalDirectorySource(), async (...args) => {
      reads++;
      return indexZip(...args);
    });
    const browser = new DatasetBrowser(source);
    const root = browser.register(await source.root(pathToFileURL(folder).toString()));
    const roots = await browser.children(root);
    assert.equal(reads, 0);
    assert.equal(roots.length, 1);
    const container = roots[0];
    assert.equal(describeEntry(container), 'ZIP archive');
    const children = await browser.children(container);
    assert.equal(reads, 1);
    assert.deepEqual(
      children.map((e) => e.name),
      ['sub-01_ses-2', 'README'],
    );
    const subject = children[0];
    assert.match(describeEntry(subject), /Participant \/ session/);
    const processing = await browser.children(subject);
    assert.deepEqual(
      processing.map((e) => e.name),
      ['Read_BIDS', 'Resample_B0'],
    );
    const images = await browser.children(processing[1]);
    assert.equal(images.length, 4);
    const duplicates = images.filter((e) => e.kind === 'file');
    assert.equal(duplicates.length, 2);
    assert.notEqual(entryKey(duplicates[0]), entryKey(duplicates[1]));
    assert.equal(duplicates[0].archive!.conflict, true);
    assert.equal(duplicates[0].archive!.sourceUri, pathToFileURL(zip).toString());
    assert.equal(duplicates[0].archive!.memberPath, 'sub-01_ses-2/Resample_B0/a__b0.nii.gz');
    assert.equal(images.find((e) => e.kind === 'symlink')!.name, 'link.nii.gz');
    assert.equal(images.find((e) => e.kind === 'other')!.name, 'special.nii');
    assert.deepEqual(await source.children(duplicates[0], signal()), []);
    assert.deepEqual(
      await source.children(
        { ...subject, archive: { ...subject.archive!, memberPath: 'absent' } },
        signal(),
      ),
      [],
    );
    assert.equal(reads, 1);
    assert.ok((await source.revision(duplicates[0])).size > 0);
    browser.refresh(container);
    await browser.children(container);
    assert.equal(reads, 2);
    assert.deepEqual(await readFile(zip), bytes);
    assert.equal((await source.revision(root)).size >= 0, true);
    await assert.rejects(source.children(root, AbortSignal.abort()), { name: 'AbortError' });
  });
});
void test('ZIPs inside canonical folders coexist with loose data; changed archives require explicit refresh', async () => {
  await fixture(async (folder, source) => {
    const nested = join(folder, 'sub-01', 'ses-02', 'anat');
    await mkdir(nested, { recursive: true });
    const zip = join(nested, 'extra.zip');
    await writeFile(zip, zipFixture([{ name: 'sub-01_T1w.nii' }]));
    await writeFile(join(nested, 'sub-01_T2w.nii'), 'loose');
    const root = await source.root(pathToFileURL(folder).toString());
    let parent = root;
    for (const segment of ['sub-01', 'ses-02', 'anat'])
      parent = (await source.children(parent, signal())).find((e) => e.name === segment)!;
    const children = await source.children(parent, signal());
    assert.equal(children.length, 2);
    const archive = children.find((e) => e.archive)!;
    assert.equal((await source.children(archive, signal()))[0].name, 'sub-01_T1w.nii');
    await writeFile(zip, zipFixture([{ name: 'sub-01_T2w.nii', text: 'changed revision' }]));
    await assert.rejects(source.children(archive, signal()), /changed/);
    source.refresh(parent);
    assert.equal((await source.children(archive, signal()))[0].name, 'sub-01_T2w.nii');
    source.refresh(root);
    await source.children(archive, signal());
    source.refresh();
    await source.children(archive, signal());
  });
});
void test('archive index cache has bounded retention, isolates registrations and propagates cancellation', async () => {
  await fixture(async (folder) => {
    for (let i = 0; i < 5; i++)
      await writeFile(join(folder, `part-${i}.zip`), zipFixture([{ name: 'sub-01/anat/a.nii' }]));
    let reads = 0;
    const source = new ArchiveDirectorySource(new LocalDirectorySource(), async (...args) => {
      reads++;
      return indexZip(...args);
    });
    const root = await source.root(pathToFileURL(folder).toString());
    const archives = await source.children(root, signal());
    for (const archive of archives) await source.children(archive, signal());
    assert.equal(reads, 5);
    await source.children(archives[0], signal());
    assert.equal(reads, 6);
    const otherRoot = { ...archives[0], datasetUri: root.uri + '/other-registration' };
    assert.equal((await source.children(otherRoot, signal()))[0].datasetUri, otherRoot.datasetUri);
    source.refresh({ ...root, datasetUri: 'file:///unrelated' });
    await source.children(otherRoot, signal());
    assert.equal(reads, 7);
    const controller = new AbortController();
    const canceling = new ArchiveDirectorySource(new LocalDirectorySource(), async (...args) => {
      const result = await indexZip(...args);
      controller.abort();
      return result;
    });
    await assert.rejects(canceling.children(archives[0], controller.signal), {
      name: 'AbortError',
    });
  });
});
void test('physical archive tree preserves directory/file conflicts, implicit directories and explicit directory choices', async () => {
  await fixture(async (folder) => {
    const path = join(folder, 'dataset.zip');
    await writeFile(
      path,
      zipFixture([
        { name: 'sub-01/' },
        { name: 'sub-01/' },
        { name: 'sub-01/anat' },
        { name: 'sub-01/anat/a.nii' },
        { name: '.hidden.nii' },
        { name: 'other.exe' },
      ]),
    );
    const index = await indexZip(pathToFileURL(path).toString(), signal());
    const container: DirectoryEntry = {
      datasetUri: 'file:///dataset',
      uri: index.sourceUri,
      relativePath: 'dataset.zip',
      name: 'dataset.zip',
      kind: 'directory',
    };
    const tree = await archiveTree(container, index, signal());
    assert.equal(tree.get('')![0].archive!.choices!.length, 2);
    const conflict = tree.get('sub-01')!;
    assert.equal(conflict.length, 2);
    assert.equal(conflict[0].archive!.conflict, true);
    assert.deepEqual(new Set(conflict.map((e) => e.kind)), new Set(['directory', 'file']));
    assert.deepEqual(await archiveTree(container, { ...index, members: [] }, signal()), new Map());
    const canceled = new AbortController();
    canceled.abort();
    await assert.rejects(archiveTree(container, index, canceled.signal), { name: 'AbortError' });
  });
});
