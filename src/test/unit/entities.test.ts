import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { combinedFolder, interpretEntry } from '../../core/entities';
import { folderEntities, type DirectoryEntry } from '../../core/directory';

const entry = (
  relativePath: string,
  kind: DirectoryEntry['kind'] = 'file',
  datasetUri = 'file:///dataset',
): DirectoryEntry => ({
  datasetUri,
  uri: datasetUri + '/' + relativePath,
  relativePath,
  name: relativePath.split('/').at(-1)!,
  kind,
});
const entity = (path: string, key: string) =>
  interpretEntry(entry(path)).entities.find((item) => item.key === key)!;

void test('canonical folder/filename agreements retain literal labels, indices, case and evidence locations', () => {
  const path =
    'sub-001/ses-02/func/sub-001_ses-02_task-rest_acq-HiRes_dir-AP_run-01_echo-0_bold.nii.gz';
  const result = interpretEntry(entry(path));
  assert.deepEqual(result.source, {
    datasetUri: 'file:///dataset',
    uri: 'file:///dataset/' + path,
    relativePath: path,
  });
  assert.equal(result.coverage, 'entry-path-only');
  assert.deepEqual(result.scope, { kind: 'registered-root', relativePath: '' });
  assert.deepEqual(result.filename, { suffix: 'bold', extension: '.nii.gz', unparsedTokens: [] });
  assert.deepEqual(
    result.entities.map((e) => [e.key, e.value, e.status]),
    [
      ['sub', '001', 'resolved'],
      ['ses', '02', 'resolved'],
      ['task', 'rest', 'resolved'],
      ['acq', 'HiRes', 'resolved'],
      ['dir', 'AP', 'resolved'],
      ['run', '01', 'resolved'],
      ['echo', '0', 'resolved'],
    ],
  );
  assert.deepEqual(
    result.entities[0].evidence.map((e) => [e.origin, e.relativePath, e.tokenIndex]),
    [
      ['folder', 'sub-001', 0],
      ['filename', path, 0],
    ],
  );
  assert.deepEqual(result.suggestedContext, {
    subject: '001',
    session: '02',
    key: JSON.stringify(['file:///dataset', '', '001', '02']),
    filenameOnly: [],
  });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.entities));
  assert.ok(Object.isFrozen(result.entities[0].evidence[0]));
});

void test('sessionless, filename-only session and combined-folder contexts are explicit without changing paths', () => {
  assert.equal(
    interpretEntry(entry('sub-01/anat/sub-01_T1w.nii.gz')).suggestedContext?.session,
    undefined,
  );
  const direct = interpretEntry(entry('sub-01/sub-01_ses-retest_T1w.nii.gz'));
  assert.deepEqual(direct.suggestedContext?.filenameOnly, ['ses']);
  assert.equal(direct.suggestedContext?.session, 'retest');
  const filename = interpretEntry(entry('sub-01_ses-02_T1w.nii.gz'));
  assert.deepEqual(filename.suggestedContext?.filenameOnly, ['sub', 'ses']);
  const combined = interpretEntry(entry('sub-001_ses-02/anat/sub-001_ses-02_T1w.nii.gz'));
  assert.deepEqual(
    combined.entities[0].evidence.map((e) => e.origin),
    ['combined-folder', 'filename'],
  );
  assert.equal(combined.entities[1].evidence[0].tokenIndex, 1);
  assert.equal(combined.entities[1].evidence[0].relativePath, 'sub-001_ses-02');
  assert.equal(combined.source.relativePath, 'sub-001_ses-02/anat/sub-001_ses-02_T1w.nii.gz');
  assert.deepEqual(combined.suggestedContext?.filenameOnly, []);
  assert.deepEqual(combinedFolder('sub-A+B_ses-test+retest'), {
    subject: 'A+B',
    session: 'test+retest',
  });
  assert.equal(entity('sub-A+B/anat/sub-A+B_acq-pre+post_T1w.nii', 'acq').value, 'pre+post');
  for (const name of ['sub-01', 'ses-02_sub-01', 'sub-01_ses-02_task-rest', 'subject-01_ses-02'])
    assert.equal(combinedFolder(name), undefined);
});

void test('conflicting values and repeated filename tokens never receive a silent winner', () => {
  const mismatch = interpretEntry(entry('sub-01/ses-02/anat/sub-99_ses-03_T1w.nii.gz'));
  assert.deepEqual(
    mismatch.entities.map((e) => [e.key, e.status, e.value]),
    [
      ['sub', 'conflict', undefined],
      ['ses', 'conflict', undefined],
    ],
  );
  assert.equal(mismatch.suggestedContext, undefined);
  const repeated = interpretEntry(entry('sub-01/anat/sub-01_sub-01_T1w.nii.gz'));
  assert.equal(repeated.entities[0].status, 'duplicate');
  assert.equal(repeated.entities[0].evidence.length, 3);
  assert.equal(repeated.suggestedContext, undefined);
  assert.equal(entity('sub-01/sub-01_run-01_run-1_bold.nii.gz', 'run').status, 'conflict');
  assert.equal(entity('sub-A/anat/sub-a_T1w.nii.gz', 'sub').status, 'conflict');
  assert.equal(entity('sub-01_ses-02/ses-03/sub-01_T1w.nii.gz', 'ses').status, 'conflict');
});

void test('pipeline namespaces and registered roots prevent accidental context joins or invented outer entities', () => {
  const raw = interpretEntry(entry('sub-01/anat/sub-01_T1w.nii.gz'));
  const derivative = interpretEntry(
    entry('derivatives/demo/sub-01/anat/sub-01_desc-preproc_T1w.nii.gz'),
  );
  assert.deepEqual(derivative.scope, {
    kind: 'pipeline',
    relativePath: 'derivatives/demo',
    pipelineName: 'demo',
  });
  assert.notEqual(raw.suggestedContext?.key, derivative.suggestedContext?.key);
  assert.notEqual(
    raw.suggestedContext?.key,
    interpretEntry(entry('sub-01/anat/sub-01_T1w.nii.gz', 'file', 'file:///other')).suggestedContext
      ?.key,
  );
  const namedPipeline = interpretEntry(
    entry('derivatives/sub-99_ses-88/sub-01/anat/sub-01_T1w.nii.gz'),
  );
  assert.equal(namedPipeline.entities[0].value, '01');
  assert.deepEqual(folderEntities(entry('derivatives/sub-99/sub-01/anat/sub-01_T1w.nii.gz')), [
    { entity: 'subject', value: '01', originalFolderPath: 'derivatives/sub-99/sub-01' },
  ]);
  assert.ok(!namedPipeline.entities.some((e) => e.key === 'ses'));
  assert.deepEqual(
    interpretEntry({ ...entry('', 'directory'), name: 'sub-OUTSIDE_ses-OUTSIDE' }).entities,
    [],
  );
  assert.deepEqual(interpretEntry(entry('derivatives', 'directory')).scope, {
    kind: 'derivatives-container',
    relativePath: 'derivatives',
  });
  assert.equal(interpretEntry(entry('derivatives/demo', 'directory')).entities.length, 0);
  assert.equal(
    interpretEntry(entry('derivatives/sub-01_T1w.nii.gz')).scope?.kind,
    'derivatives-container',
  );
});

void test('unsupported or unfamiliar filename pieces stay visible as evidence rather than invented BIDS semantics', () => {
  const unknown = interpretEntry(entry('sub-01/anat/sub-01_custom-xyz_bad-token!_T1w.nii.gz'));
  const custom = unknown.entities.find((e) => e.key === 'custom')!;
  assert.equal(custom.status, 'unrecognized-key');
  assert.equal(custom.value, undefined);
  assert.equal(custom.evidence[0].value, 'xyz');
  assert.equal(custom.evidence[0].knownKey, false);
  assert.deepEqual(unknown.filename?.unparsedTokens, ['bad-token!']);
  assert.deepEqual(interpretEntry(entry('sub-01__T1w.nii.gz')).filename?.unparsedTokens, ['']);
  assert.deepEqual(interpretEntry(entry('sub-01_ses-_T1w.nii.gz')).filename?.unparsedTokens, [
    'ses-',
  ]);
  assert.deepEqual(interpretEntry(entry('sub-01_T1-w.nii.gz')).filename?.unparsedTokens, ['T1-w']);
  assert.equal(interpretEntry(entry('sub-01_T1w')).filename?.extension, undefined);
  assert.equal(
    interpretEntry(entry('sub-01_hemi-L_white.surf.gii')).filename?.extension,
    '.surf.gii',
  );
  assert.equal(interpretEntry(entry('sub-01/anat/.hidden')).filename?.suffix, undefined);
  for (const name of [
    'dataset_description.json',
    'participants.tsv',
    'README.md',
    'CHANGES',
    'CITATION.cff',
  ])
    assert.equal(interpretEntry(entry(name)).filename, undefined);
  const link = interpretEntry(entry('sub-01/anat/sub-99_T1w.nii.gz', 'symlink'));
  assert.equal(link.filename, undefined);
  assert.equal(link.entities[0].value, '01');
});

void test('interpretation is bounded and does not normalize unsupported relative paths', () => {
  for (const path of [
    '/sub-01/file.nii',
    'sub-01//file.nii',
    '../sub-01/file.nii',
    'sub-01/./file.nii',
    'sub-01\\file.nii',
  ]) {
    const result = interpretEntry(entry(path));
    assert.equal(result.coverage, 'uninterpreted');
    assert.equal(result.reason, 'unsupported-relative-path');
    assert.equal(result.source.relativePath, path);
  }
  for (const path of ['x'.repeat(32769), Array(129).fill('x').join('/')])
    assert.equal(interpretEntry(entry(path)).reason, 'path-limit');
  const input = { ...entry('sub-01', 'directory') },
    result = interpretEntry(input);
  input.relativePath = 'sub-99';
  assert.equal(result.source.relativePath, 'sub-01');
  assert.equal(result.entities[0].value, '01');
});
