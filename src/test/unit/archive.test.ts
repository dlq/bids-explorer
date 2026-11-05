import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  assertArchivePath,
  mergeArchivePlacements,
  type ArchiveIndex,
  type ArchiveMember,
} from '../../core/archive';

const signal = (): AbortSignal => new AbortController().signal;
function index(sourceUri: string, paths: readonly string[]): ArchiveIndex {
  return {
    sourceUri,
    revision: { size: 1, modifiedAt: 1 },
    capturedAt: 'test snapshot',
    coverage: 'complete',
    members: paths.map((memberPath, memberIndex): ArchiveMember => ({
      resource: { sourceUri, memberPath, memberIndex },
      kind: memberPath.endsWith('/') ? 'directory' : 'file',
      bytes: 1,
      compressedBytes: 1,
      compressionMethod: 0,
      encrypted: false,
    })),
  };
}
void test('declared placements cover whole datasets, subject/session ZIPs and deeper subtrees without guessing from ZIP names', async () => {
  const whole = index('file:///whole.zip', [
    'dataset_description.json',
    'sub-01/anat/sub-01_T1w.nii',
  ]);
  const subject = index('file:///arbitrary-name.zip', [
    'wrapper/',
    'wrapper/func/a.nii',
    'outside.json',
  ]);
  const session = index('file:///sub-02/session.zip', ['dwi/b.nii']);
  const modality = index('file:///sub-03/ses-2/anat.zip', ['c.nii']);
  const entries = await mergeArchivePlacements(
    [
      { index: whole, memberRoot: '', logicalRoot: '' },
      { index: subject, memberRoot: 'wrapper', logicalRoot: 'sub-01' },
      { index: session, memberRoot: '', logicalRoot: 'sub-02/ses-1' },
      { index: modality, memberRoot: '', logicalRoot: 'sub-03/ses-2/anat' },
    ],
    signal(),
  );
  const byPath = new Map(entries.map((e) => [e.relativePath, e]));
  assert.ok(byPath.has('sub-01/anat/sub-01_T1w.nii'));
  assert.ok(byPath.has('sub-01/func/a.nii'));
  assert.ok(byPath.has('sub-02/ses-1/dwi/b.nii'));
  assert.ok(byPath.has('sub-03/ses-2/anat/c.nii'));
  assert.equal(byPath.has('outside.json'), false);
  assert.deepEqual(byPath.get('sub-01/func/a.nii')!.sources[0], subject.members[1].resource);
  assert.equal(
    byPath.get('sub-02/ses-1')!.sources.length,
    0,
    'implicit parent does not invent a physical member',
  );
  assert.ok(Object.isFrozen(entries));
  assert.ok(Object.isFrozen(byPath.get('sub-01/func/a.nii')!.sources));
});
void test('overlays preserve duplicate members and expose file/directory conflicts, while merging ordinary directory records', async () => {
  const first = index('file:///a.zip', ['sub-01/', 'sub-01/a.nii', 'sub-01/a.nii', 'sub-02']);
  const second = index('file:///b.zip', ['sub-01/', 'sub-01/a.nii', 'sub-02/a.nii']);
  const entries = await mergeArchivePlacements(
    [first, second].map((index) => ({ index, memberRoot: '', logicalRoot: '' })),
    signal(),
  );
  const leaf = entries.find((e) => e.relativePath === 'sub-01/a.nii')!;
  assert.equal(leaf.sources.length, 3);
  assert.equal(leaf.conflict, true);
  assert.equal(entries.find((e) => e.relativePath === 'sub-01')!.conflict, false);
  assert.deepEqual(entries.find((e) => e.relativePath === 'sub-02')!.kinds, ['file', 'directory']);
  assert.equal(entries.find((e) => e.relativePath === 'sub-02')!.conflict, true);
});
void test('placement roots require safe paths and existing member directories; no wrapper inference', async () => {
  const zip = index('file:///a.zip', ['wrapper/a.nii', 'wrapper2/b.nii']);
  const base = { index: zip, memberRoot: '', logicalRoot: '' };
  const full = await mergeArchivePlacements([base], signal());
  assert.ok(full.some((e) => e.relativePath === 'wrapper/a.nii'));
  const mounted = await mergeArchivePlacements([{ ...base, memberRoot: 'wrapper' }], signal());
  assert.deepEqual(
    mounted.map((e) => e.relativePath),
    ['a.nii'],
  );
  const explicitDir = await mergeArchivePlacements(
    [{ index: index('dir', ['wrapper/']), memberRoot: 'wrapper', logicalRoot: '' }],
    signal(),
  );
  assert.deepEqual(explicitDir, []);
  await assert.rejects(
    mergeArchivePlacements([{ ...base, memberRoot: 'absent' }], signal()),
    /absent/,
  );
  await assert.rejects(
    mergeArchivePlacements([{ ...base, memberRoot: 'wrapper/a.nii' }], signal()),
    /directory/,
  );
  await assert.rejects(mergeArchivePlacements([base, base], signal()), /only once/);
  for (const path of [
    '',
    '../x',
    '/abs',
    'a/./b',
    'a//b',
    'a\\b',
    'C:disk',
    'control\n',
    'a'.repeat(4097),
    Array(129).fill('a').join('/'),
  ])
    assert.throws(() => assertArchivePath(path));
  assertArchivePath('', true);
  assertArchivePath('sub-01/space and Ω/--file');
  await assert.rejects(
    mergeArchivePlacements([{ ...base, logicalRoot: '../bad' }], signal()),
    /Unsafe/,
  );
});
void test('collection work is bounded and cancellation interrupts larger overlays', async () => {
  const empty = index('empty', []);
  await assert.rejects(
    mergeArchivePlacements(
      Array(1001).fill({ index: empty, memberRoot: '', logicalRoot: '' }),
      signal(),
    ),
    /1,000 declared/,
  );
  const canceled = new AbortController();
  canceled.abort();
  await assert.rejects(mergeArchivePlacements([], canceled.signal), { name: 'AbortError' });
  const many = index(
    'many',
    Array.from({ length: 100001 }, (_, i) => `sub-${i}/a.nii`),
  );
  // Parent directories count toward the logical-entry budget as well as explicit records.
  await assert.rejects(
    mergeArchivePlacements([{ index: many, memberRoot: '', logicalRoot: '' }], signal()),
    /logical entries/,
  );
  const duplicates = index('duplicates', Array(100001).fill('same.nii'));
  await assert.rejects(
    mergeArchivePlacements([{ index: duplicates, memberRoot: '', logicalRoot: '' }], signal()),
    /member records/,
  );
  const controller = new AbortController();
  const pending = mergeArchivePlacements(
    [{ index: many, memberRoot: '', logicalRoot: '' }],
    controller.signal,
  );
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
