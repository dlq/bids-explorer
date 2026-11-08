import { squashfsFiles } from '../squashfsFixture';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LogicalDirectorySource, savedArchivePlacements } from '../../sources/logicalDirectory';
import { loadLogicalInheritance } from '../../sources/logicalInheritance';
import { loadInheritedGradientPair } from '../../sources/gradientFiles';
import { ArchiveDirectorySource } from '../../sources/archiveDirectory';
import { LocalDirectorySource } from '../../sources/localDirectory';
import { indexZip } from '../../sources/zipIndex';
import { DatasetBrowser } from '../../core/browser';
import { entryKey, type DirectoryEntry } from '../../core/directory';
import { layoutHint, logicalFolder, logicalChildren } from '../../core/logicalLayout';
import { gzipSync } from 'node:zlib';
import { tarFixture, tarRecord } from '../tarFixture';
import { zipFixture } from '../zipFixture';
const signal = (): AbortSignal => new AbortController().signal;
async function fixture(run: (folder: string) => Promise<void>): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), 'bids-logical-'));
  try {
    await run(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
void test('ZIP sessions overlay under one subject without indexing the collection; matching member wrappers disappear from navigation only', async () => {
  await fixture(async (folder) => {
    for (const session of ['02', '03'])
      await writeFile(
        join(folder, `sub-001_ses-${session}.zip`),
        zipFixture([
          {
            name: `sub-001_ses-${session}/Bet_DWI/sub-001_ses-${session}__dwi.nii.gz`,
            text: 'image',
          },
        ]),
      );
    let indexes = 0;
    const physical = new ArchiveDirectorySource(new LocalDirectorySource(), async (...args) => {
      indexes++;
      return indexZip(...args);
    });
    const source = new LogicalDirectorySource(physical);
    const browser = new DatasetBrowser(source);
    const root = browser.register(await source.root(pathToFileURL(folder).toString()));
    const subjects = await browser.children(root);
    assert.deepEqual(
      subjects.map((e) => e.name),
      ['sub-001'],
    );
    assert.equal(indexes, 0);
    const sessions = await browser.children(subjects[0]);
    assert.deepEqual(
      sessions.map((e) => e.name),
      ['ses-02', 'ses-03'],
    );
    assert.equal(indexes, 0);
    const processing = await browser.children(sessions[0]);
    assert.deepEqual(
      processing.map((e) => e.name),
      ['Bet_DWI'],
    );
    assert.equal(indexes, 1);
    const images = await browser.children(processing[0]);
    assert.equal(images[0].relativePath, 'sub-001/ses-02/Bet_DWI/sub-001_ses-02__dwi.nii.gz');
    assert.equal(
      images[0].archive!.memberPath,
      'sub-001_ses-02/Bet_DWI/sub-001_ses-02__dwi.nii.gz',
    );
    assert.equal(
      images[0].logical!.sources[0].relativePath,
      'sub-001_ses-02.zip/sub-001_ses-02/Bet_DWI/sub-001_ses-02__dwi.nii.gz',
    );
    assert.equal(indexes, 1);
    assert.deepEqual(await source.children(images[0], signal()), []);
    assert.ok((await source.revision(images[0])).size > 0);
    assert.ok((await source.revision(root)).size >= 0);
    browser.refresh(sessions[0]);
    await browser.children(sessions[0]);
    assert.equal(indexes, 2);
    source.refresh(root);
    source.refresh();
    assert.ok(Object.isFrozen(images[0].logical!.sources));
    await assert.rejects(source.children(root, AbortSignal.abort()), { name: 'AbortError' });
  });
});
void test('loose and archive directories overlay file-wise, retaining duplicate files and file/directory conflicts', async () => {
  await fixture(async (folder) => {
    const loose = join(folder, 'sub-01', 'ses-2', 'anat');
    await mkdir(loose, { recursive: true });
    await writeFile(join(loose, 'a.nii'), 'loose');
    await mkdir(join(loose, 'b.nii'));
    await writeFile(join(loose, 'b.nii', 'c.nii'), 'nested');
    await writeFile(
      join(folder, 'sub-01_ses-2.zip'),
      zipFixture([
        { name: 'sub-01_ses-2/anat/a.nii', text: 'archived' },
        { name: 'sub-01_ses-2/anat/b.nii', text: 'conflict' },
      ]),
    );
    const source = new LogicalDirectorySource();
    const browser = new DatasetBrowser(source);
    const root = browser.register(await source.root(pathToFileURL(folder).toString()));
    const subject = (await browser.children(root))[0];
    assert.equal(subject.logical!.sources.length, 2);
    const sessions = await browser.children(subject);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].logical!.sources.length, 2);
    const anat = (await browser.children(sessions[0]))[0];
    assert.equal(anat.logical!.sources.length, 2);
    const files = await browser.children(anat);
    assert.equal(files.length, 4);
    assert.ok(files.every((e) => e.logical!.conflict));
    assert.equal(new Set(files.map(entryKey)).size, 4);
    assert.equal(await readFile(join(loose, 'a.nii'), 'utf8'), 'loose');
  });
});
void test('combined loose folders, canonical ZIP wrappers, bare shards and subject ZIPs support session grouping', async () => {
  await fixture(async (folder) => {
    await mkdir(join(folder, 'sub-01_ses-2', 'anat'), { recursive: true });
    await writeFile(join(folder, 'sub-01_ses-2', 'anat', 'T1w.nii'), 'loose');
    await writeFile(
      join(folder, 'sub-02_ses-3.zip'),
      zipFixture([{ name: 'sub-02/ses-3/anat/T1w.nii' }]),
    );
    await writeFile(join(folder, 'sub-03_ses-4.zip'), zipFixture([{ name: 'anat/T1w.nii' }]));
    await writeFile(
      join(folder, 'sub-04.zip'),
      zipFixture([{ name: 'sub-04/ses-5/anat/T1w.nii' }]),
    );
    await writeFile(
      join(folder, 'sub-05.zip'),
      zipFixture([{ name: 'sub-05_ses-6/anat/T1w.nii' }]),
    );
    const source = new LogicalDirectorySource();
    const browser = new DatasetBrowser(source);
    const root = browser.register(await source.root(pathToFileURL(folder).toString()));
    const subjects = await browser.children(root);
    assert.equal(subjects.length, 5);
    for (let i = 0; i < subjects.length; i++) {
      const sessions = await browser.children(subjects[i]);
      assert.equal(sessions.length, 1);
      assert.equal(sessions[0].name, `ses-${i + 2}`);
      const modalities = await browser.children(sessions[0]);
      assert.equal(modalities[0].name, 'anat');
      assert.equal((await browser.children(modalities[0]))[0].name, 'T1w.nii');
    }
  });
});
void test('filename candidates disagreeing with actual subject/session members fail explicitly; wrapper siblings are not dropped', async () => {
  await fixture(async (folder) => {
    const source = new LogicalDirectorySource();
    for (const [name, paths, pattern] of [
      ['sub-01_ses-2.zip', ['sub-99_ses-2/anat/a.nii'], /disagree/],
      ['sub-02_ses-3.zip', ['sub-02/ses-9/anat/a.nii'], /session/],
      ['sub-03_ses-4.zip', ['sub-03_ses-4/anat/a.nii', 'README'], /additional entries/],
    ] as const) {
      await writeFile(join(folder, name), zipFixture(paths.map((name) => ({ name }))));
      const physical = await new ArchiveDirectorySource().root(pathToFileURL(folder).toString());
      const archive = (await new ArchiveDirectorySource().children(physical, signal())).find(
        (e) => e.name === name,
      )!;
      const hint = layoutHint(archive)!;
      const subject = logicalFolder(
        physical,
        'sub-' + hint.subject!,
        'subject',
        [archive],
        hint.subject,
      );
      const session = (await source.children(subject, signal()))[0];
      await assert.rejects(source.children(session, signal()), pattern);
    }
  });
});
void test('unnamed dataset ZIPs overlay their member subjects without inventing filename membership; pipeline scope remains separate', async () => {
  await fixture(async (folder) => {
    await writeFile(
      join(folder, 'dataset.zip'),
      zipFixture([
        { name: 'sub-01/ses-2/anat/a.nii' },
        { name: 'derivatives/sub-pipeline/sub-01/anat/b.nii' },
      ]),
    );
    const source = new LogicalDirectorySource();
    const browser = new DatasetBrowser(source);
    const root = browser.register(await source.root(pathToFileURL(folder).toString()));
    const roots = await browser.children(root);
    assert.deepEqual(
      roots.map((e) => e.name),
      ['derivatives', 'sub-01'],
    );
    const pipelines = await browser.children(roots[0]);
    assert.equal(pipelines[0].logical!.kind, 'overlay');
    assert.equal(pipelines[0].logical!.subject, undefined);
    const derivativeSubjects = await browser.children(pipelines[0]);
    assert.equal(derivativeSubjects[0].name, 'sub-01');
    assert.notEqual(entryKey(derivativeSubjects[0]), entryKey(roots[1]));
  });
});
void test('logical layout helpers preserve literal IDs, candidate distinctions, duplicate resources and cancellation/bounds', async () => {
  const root: DirectoryEntry = {
    datasetUri: 'file:///root',
    uri: 'file:///root',
    relativePath: '',
    name: 'root',
    kind: 'directory',
  };
  const entry = (name: string, kind: DirectoryEntry['kind'] = 'directory'): DirectoryEntry => ({
    ...root,
    name,
    kind,
    relativePath: name,
    uri: 'file:///root/' + name,
  });
  assert.deepEqual(layoutHint(entry('ses-002')), { session: '002' });
  assert.equal(layoutHint(entry('a.nii', 'file')), undefined);
  assert.equal(layoutHint(entry('random')), undefined);
  const subject = logicalFolder(root, 'sub-01', 'subject', [entry('sub-01')], '01');
  const one = logicalFolder(subject, 'ses-2', 'session', [entry('one')], '01', '2');
  const two = logicalFolder(subject, 'ses-2', 'session', [entry('two')], '01', '2');
  const grouped = await logicalChildren(
    subject,
    [one, two, entry('sub-99_ses-2'), entry('a.nii', 'file')],
    signal(),
  );
  assert.equal(grouped.find((e) => e.name === 'ses-2')!.logical!.sources.length, 2);
  assert.equal(grouped.find((e) => e.name === 'sub-99_ses-2')!.logical!.kind, 'overlay');
  const resources = await logicalChildren(
    root,
    [entry('a.nii', 'file'), entry('b.nii', 'file')],
    signal(),
  );
  assert.equal(resources[0].logical!.conflict, false);
  const source = new LogicalDirectorySource();
  await assert.rejects(
    source.children(
      { ...subject, logical: { ...subject.logical!, sources: Array(10001).fill(entry('same')) } },
      signal(),
    ),
    /10,000/,
  );
  const fake: import('../../core/directory').DirectorySource = {
    root: () => Promise.resolve(root),
    revision: () => Promise.resolve({ size: 0, modifiedAt: 0 }),
    children: () => Promise.resolve(Array.from({ length: 100001 }, () => entry('a.nii', 'file'))),
  };
  await assert.rejects(new LogicalDirectorySource(fake).children(root, signal()), /100,000/);
  await assert.rejects(
    logicalChildren(root, Array(300).fill(entry('sub-01')), AbortSignal.abort()),
    { name: 'AbortError' },
  );
  const noRefresh = new LogicalDirectorySource(fake);
  noRefresh.refresh(root);
  noRefresh.refresh(subject);
  noRefresh.refresh();
});

void test('logical inheritance combines loose and archived ancestors with physical provenance and detects duplicate sidecars', async () => {
  await fixture(async (folder) => {
    await mkdir(join(folder, 'sub-01/ses-2/dwi'), { recursive: true });
    await writeFile(join(folder, 'dwi.json'), '{"Root":1,"Override":1}');
    await writeFile(join(folder, 'dwi.bval'), '0 1000');
    const zip = join(folder, 'sub-01_ses-2.zip');
    await writeFile(
      zip,
      zipFixture([
        { name: 'sub-01_ses-2/sub-01_ses-2_dwi.json', text: '{"Override":2}' },
        { name: 'sub-01_ses-2/dwi/sub-01_ses-2_dwi.nii', text: 'not opened' },
        { name: 'sub-01_ses-2/dwi/sub-01_ses-2_dwi.bvec', text: '0 1\n0 0\n0 0' },
      ]),
    );
    const looseImage = join(folder, 'sub-01/ses-2/dwi/sub-01_ses-2_run-2_dwi.nii');
    await writeFile(looseImage, 'not opened');
    const source = new LogicalDirectorySource();
    const root = await source.root(pathToFileURL(folder).href);
    const find = async (parent: DirectoryEntry, name: string) =>
      (await source.children(parent, signal())).find((entry) => entry.name === name)!;
    const dwi = await find(await find(await find(root, 'sub-01'), 'ses-2'), 'dwi');
    const archived = await find(dwi, 'sub-01_ses-2_dwi.nii');
    const loose = await find(dwi, 'sub-01_ses-2_run-2_dwi.nii');
    for (const image of [archived, loose]) {
      const result = await loadLogicalInheritance(source, image, signal());
      assert.equal(result.status, 'resolved');
      const field = result.fields.find(({ key }) => key === 'Override')!;
      assert.equal(field.value.valueText, '2');
      assert.deepEqual(
        field.history.map(({ sourceUri }) => new URL(sourceUri).protocol),
        ['file:', 'bids-zip:'],
      );
      assert.equal(
        result.sources[1].entry.archive?.memberPath,
        'sub-01_ses-2/sub-01_ses-2_dwi.json',
      );
      const pair = await loadInheritedGradientPair(image, signal(), (entry, abort) =>
        loadLogicalInheritance(source, entry, abort),
      );
      assert.equal(new URL(pair.bvalUri).protocol, 'file:');
      assert.equal(new URL(pair.bvecUri).protocol, 'bids-zip:');
    }
    await writeFile(join(folder, 'sub-01/ses-2/sub-01_ses-2_dwi.json'), '{"Override":3}');
    const ambiguous = await loadLogicalInheritance(source, archived, signal());
    assert.equal(ambiguous.status, 'unresolved');
    assert.equal(ambiguous.fields.length, 0);
    assert.equal(ambiguous.sources.length, 3);
    assert.match(ambiguous.issues.join(), /Ambiguous JSON/);
    await rm(zip);
    const unavailable = await loadLogicalInheritance(source, archived, signal());
    assert.equal(unavailable.coverage, 'incomplete');
    assert.equal(unavailable.related[0].status, 'unknown');
    await assert.rejects(loadLogicalInheritance(source, loose, AbortSignal.abort()), {
      name: 'AbortError',
    });
  });
});

void test('logical inheritance respects dataset boundaries and reports deferred ZIP coverage', async () => {
  await fixture(async (folder) => {
    const pipeline = join(folder, 'derivatives/pipe');
    const nested = join(pipeline, 'sub-01');
    await mkdir(nested, { recursive: true });
    await writeFile(join(folder, 'T1w.json'), '{"Raw":1}');
    await writeFile(join(pipeline, 'T1w.json'), '{"Pipeline":1}');
    await writeFile(join(nested, 'T1w.json'), '{"Nested":1}');
    await writeFile(join(nested, 'dataset_description.json'), '{}');
    await writeFile(join(nested, 'sub-01_T1w.nii'), '');
    const source = new LogicalDirectorySource();
    const root = await source.root(pathToFileURL(folder).href);
    const find = async (parent: DirectoryEntry, name: string) =>
      (await source.children(parent, signal())).find((entry) => entry.name === name)!;
    const image = await find(
      await find(await find(await find(root, 'derivatives'), 'pipe'), 'sub-01'),
      'sub-01_T1w.nii',
    );
    assert.deepEqual(
      (await loadLogicalInheritance(source, image, signal())).fields.map(({ key }) => key),
      ['Nested'],
    );
    for (let i = 0; i < 33; i++)
      await writeFile(
        join(folder, 'part-' + i + '.zip'),
        zipFixture([{ name: 'README', text: '' }]),
      );
    const partial = await loadLogicalInheritance(source, image, signal());
    assert.equal(partial.coverage, 'incomplete');
    assert.match(partial.issues.join(), /deferred/);
    assert.deepEqual(partial.fields, []);
  });
});

void test('logical inspection refuses changed inventories and reports unreadable branches', async () => {
  await fixture(async (folder) => {
    await mkdir(join(folder, 'sub-01'));
    await writeFile(join(folder, 'sub-01/sub-01_T1w.nii'), '');
    await writeFile(join(folder, 'T1w.json'), '{"Root":1}');
    const source = new LogicalDirectorySource();
    const root = await source.root(pathToFileURL(folder).href);
    const subject = (await source.children(root, signal())).find(
      (entry) => entry.name === 'sub-01',
    )!;
    const [image] = await source.children(subject, signal());
    const revision = source.revision.bind(source);
    let seen = false;
    source.revision = async (entry) => {
      const current = await revision(entry);
      if (entry.relativePath !== '') return current;
      if (seen) return { ...current, modifiedAt: current.modifiedAt + 1 };
      seen = true;
      return current;
    };
    await assert.rejects(loadLogicalInheritance(source, image, signal()), /Source changed/);
    source.revision = revision;
    const children = source.children.bind(source);
    source.children = async (entry, abort) => {
      if (entry.name === 'sub-01') throw new Error('Branch unavailable');
      return children(entry, abort);
    };
    const partial = await loadLogicalInheritance(source, image, signal());
    assert.match(partial.issues.join(), /Branch unavailable/);
    assert.equal(partial.sources.length, 1);
    assert.equal(partial.fields.length, 0);
    source.children = children;
    await writeFile(join(folder, 'dataset_description.json'), '{}');
    await writeFile(
      join(folder, 'whole.zip'),
      zipFixture([{ name: 'dataset_description.json', text: '{}' }]),
    );
    const duplicateBoundary = await loadLogicalInheritance(source, image, signal());
    assert.match(duplicateBoundary.issues.join(), /Multiple dataset descriptions/);
    await assert.rejects(
      loadLogicalInheritance(
        source,
        { ...image, relativePath: 'sub-01/' + 'deep/'.repeat(128) + image.name },
        signal(),
      ),
      /128 ancestor levels/,
    );
  });
});

void test('wrapped tar dataset merges with loose and ZIP sources, preserving physical member paths', async () => {
  await fixture(async (folder) => {
    const image = 'sub-01/ses-01/anat/sub-01_ses-01_T1w.nii.gz';
    const sidecar = image.replace('.nii.gz', '.json');
    const archive = (prefix: string) =>
      tarFixture(
        tarRecord(prefix + 'dataset_description.json', Buffer.from('{}')),
        tarRecord(prefix + 'README'),
        tarRecord(prefix + 'code/config.json'),
        tarRecord(prefix + image),
        tarRecord(prefix + sidecar, Buffer.from('{"EchoTime":0.1}')),
      );
    await writeFile(join(folder, 'a-broken.tgz'), 'invalid gzip');
    await writeFile(join(folder, 'b-wrapped.tar.gz'), gzipSync(archive('wrapper/')));
    await writeFile(join(folder, 'c-unwrapped.tar'), archive(''));
    await writeFile(join(folder, 'z.zip'), zipFixture([{ name: image }]));
    await mkdir(join(folder, 'sub-01/ses-01/anat'), { recursive: true });
    const loose = image.replace('T1w', 'T2w');
    await writeFile(join(folder, loose), '');
    const source = new LogicalDirectorySource();
    const browser = new DatasetBrowser(source);
    const root = browser.register(await source.root(pathToFileURL(folder).href));
    const first = await browser.children(root);
    const broken = first.find((entry) => entry.name === 'a-broken.tgz')!;
    assert.ok(broken, 'unreadable tar should remain expandable');
    await assert.rejects(source.children(broken, signal()), /header check/);
    await rm(join(folder, 'a-broken.tgz'));
    browser.refresh(root);
    const entries = await browser.children(root);
    assert.deepEqual(
      entries.map((entry) => entry.name),
      ['dataset_description.json', 'README', 'c-unwrapped.tar', 'sub-01'],
    );
    const deferred = entries.find((entry) => entry.name === 'c-unwrapped.tar')!;
    assert.ok((await browser.children(deferred)).some((entry) => entry.name === 'sub-01'));
    const [session] = await browser.children(entries.find((entry) => entry.name === 'sub-01')!);
    const [anat] = await browser.children(session);
    const files = await browser.children(anat);
    const tar = files.find(
      (entry) => entry.archive?.format === 'tar' && entry.name.endsWith('.nii.gz'),
    )!;
    assert.equal(tar.relativePath, image);
    assert.equal(tar.archive!.memberPath, 'wrapper/' + image);
    assert.ok(tar.logical?.conflict);
    assert.equal(files.filter((entry) => entry.relativePath === image).length, 2);
    await rm(join(folder, 'c-unwrapped.tar'));
    const result = await loadLogicalInheritance(source, tar, signal());
    assert.equal(result.coverage, 'complete');
    assert.equal(result.fields.find((field) => field.key === 'EchoTime')?.value.valueText, '0.1');
    assert.match(result.sources[0].entry.uri, /^bids-tar:/);
  });
});

void test('session tar shards use the same logical placement as named ZIPs', async () => {
  await fixture(async (folder) => {
    const path = 'sub-02_ses-3/anat/sub-02_ses-3_T1w.nii';
    await writeFile(join(folder, 'sub-02_ses-3.tgz'), gzipSync(tarFixture(tarRecord(path))));
    const source = new LogicalDirectorySource();
    const browser = new DatasetBrowser(source);
    const root = browser.register(await source.root(pathToFileURL(folder).href));
    const [subject] = await browser.children(root);
    assert.equal(subject.name, 'sub-02');
    const [session] = await browser.children(subject);
    assert.equal(session.name, 'ses-3');
    const [anat] = await browser.children(session);
    const [image] = await browser.children(anat);
    assert.equal(image.archive?.memberPath, path);
    assert.equal(image.relativePath, 'sub-02/ses-3/anat/sub-02_ses-3_T1w.nii');
  });
});

void test('saved ZIP and tar placements overlay selected subtrees while keeping physical member identity', async () => {
  await fixture(async (folder) => {
    await mkdir(join(folder, 'storage'));
    await mkdir(join(folder, 'sub-01', 'anat'), { recursive: true });
    await writeFile(join(folder, 'sub-01/anat/sub-01_T1w.nii'), 'loose');
    const archivePath = 'storage/sub-99.zip';
    await writeFile(
      join(folder, archivePath),
      zipFixture([
        { name: 'wrapper/anat/sub-01_T1w.nii', text: 'zip' },
        { name: 'ignored/sub-02/anat/sub-02_T1w.nii', text: 'excluded' },
      ]),
    );
    await writeFile(
      join(folder, 'other.tar.gz'),
      gzipSync(tarFixture(tarRecord('anat/sub-01_T2w.nii', Buffer.from('tar')))),
    );
    const uri = pathToFileURL(folder).href;
    const placements = [
      { archivePath, memberRoot: 'wrapper', logicalRoot: 'sub-01' },
      { archivePath: 'other.tar.gz', memberRoot: '', logicalRoot: 'sub-01/ses-02' },
    ];
    const createSource = () => new LogicalDirectorySource(undefined, () => ({ [uri]: placements }));
    for (const source of [createSource(), createSource()]) {
      const root = await source.root(uri);
      const browser = new DatasetBrowser(source);
      const roots = await browser.children(root);
      assert.deepEqual(
        roots.map((entry) => entry.name),
        ['sub-01'],
      );
      const children = await browser.children(roots[0]);
      const anatomy = children.find((entry) => entry.name === 'anat')!;
      const files = await browser.children(anatomy);
      assert.equal(files.length, 2);
      assert(files.every((entry) => entry.logical?.conflict));
      const zip = files.find((entry) => entry.archive)!;
      assert.equal(zip.archive!.containerPath, archivePath);
      assert.equal(zip.archive!.memberPath, 'wrapper/anat/sub-01_T1w.nii');
      assert.equal(zip.relativePath, 'sub-01/anat/sub-01_T1w.nii');
      assert.equal(
        zip.logical?.sources[0].relativePath,
        archivePath + '/wrapper/anat/sub-01_T1w.nii',
      );
      assert(!JSON.stringify(roots[0]).includes('placedChildren'));
      const session = children.find((entry) => entry.name === 'ses-02')!;
      const [tarAnatomy] = await browser.children(session);
      const [tar] = await browser.children(tarAnatomy);
      assert.equal(tar.archive?.format, 'tar');
      assert.equal(tar.archive?.memberPath, 'anat/sub-01_T2w.nii');
      assert.equal(tar.relativePath, 'sub-01/ses-02/anat/sub-01_T2w.nii');
    }
    const source = createSource();
    const root = await source.root(uri);
    placements[0] = { ...placements[0], memberRoot: 'absent' };
    await assert.rejects(source.children(root, signal()), /absent from the archive index/);
    placements[0] = { ...placements[0], archivePath: 'absent/archive.zip' };
    await assert.rejects(source.children(root, signal()), /path was not found/);
    placements[0] = { ...placements[0], archivePath: 'storage/absent.zip' };
    await assert.rejects(source.children(root, signal()), /needs a ZIP or tar/);
  });
});

void test('saved placement declarations reject unsafe, duplicate and incomplete paths', () => {
  const uri = 'file:///dataset';
  const valid = { archivePath: 'a.zip', memberRoot: '', logicalRoot: '' };
  for (const configured of [null, false, {}])
    assert.deepEqual(savedArchivePlacements(configured, uri), []);
  assert.throws(() => savedArchivePlacements({ [uri]: {} }, uri), /up to 32/);
  assert.throws(() => savedArchivePlacements({ [uri]: Array(33).fill(valid) }, uri), /up to 32/);
  assert.throws(() => savedArchivePlacements({ [uri]: [null] }, uri), /Invalid/);
  assert.throws(() => savedArchivePlacements({ [uri]: [{}] }, uri), /require/);
  for (const key of ['archivePath', 'memberRoot', 'logicalRoot'])
    assert.throws(
      () => savedArchivePlacements({ [uri]: [{ ...valid, [key]: '../escape' }] }, uri),
      /Unsafe/,
    );
  assert.throws(() => savedArchivePlacements({ [uri]: [valid, valid] }, uri), /only once/);
});

void test('complete SquashFS ancestors support inherited metadata; partial inventories withhold effective fields', async () => {
  await fixture(async (folder) => {
    await mkdir(join(folder, 'sub-01/func'), { recursive: true });
    await writeFile(join(folder, 'task-rest_bold.json'), '{"RepetitionTime":2}');
    await writeFile(
      join(folder, 'sub-01/func/scans.sqfs'),
      squashfsFiles([
        { name: 'sub-01_task-rest_bold.json', text: '{"TaskName":"Resting state"}' },
        { name: 'sub-01_task-rest_bold.nii', text: 'fixture' },
      ]),
    );
    const source = new LogicalDirectorySource();
    const root = await source.root(pathToFileURL(folder).href);
    const subject = (await source.children(root, signal())).find(
      (entry) => entry.name === 'sub-01',
    )!;
    const [modality] = await source.children(subject, signal());
    const image = (await source.children(modality, signal())).find((entry) =>
      entry.name.endsWith('.nii'),
    )!;
    const result = await loadLogicalInheritance(source, image, signal());
    assert.equal(result.status, 'resolved', result.issues.join());
    assert.equal(result.coverage, 'complete');
    assert.deepEqual(
      result.fields.map((field) => field.key),
      ['RepetitionTime', 'TaskName'],
    );
    assert.ok(result.sources.some((source) => source.entry.uri.startsWith('bids-squashfs:')));
    const children = source.children.bind(source);
    source.children = async (entry, abort) => {
      const rows = await children(entry, abort);
      return entry.relativePath === ''
        ? [...rows, { ...root, name: 'page marker', paging: { page: 2, failures: 0 } }]
        : rows;
    };
    const partial = await loadLogicalInheritance(source, image, signal());
    assert.equal(partial.coverage, 'incomplete');
    assert.equal(partial.status, 'unresolved');
    assert.deepEqual(partial.fields, []);
    assert.match(partial.issues.join(), /Paged metadata coverage/);
    source.children = children;
    await writeFile(
      join(folder, 'sub-01/func/other.sqfs'),
      squashfsFiles([
        { name: 'sub-01_task-rest_bold.json', text: '{"TaskName":"Conflicting name"}' },
      ]),
    );
    source.refresh(root);
    const ambiguous = await loadLogicalInheritance(source, image, signal());
    assert.equal(ambiguous.status, 'unresolved');
    assert.deepEqual(ambiguous.fields, []);
    assert.equal(ambiguous.sources.length, 3);
    assert.match(ambiguous.issues.join(), /Ambiguous JSON/);
  });
});
