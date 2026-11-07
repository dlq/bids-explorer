import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  descriptionPlan,
  displayEntryLabel,
  displayFileType,
  displayFileDetails,
  displayDescription,
  jsonDescription,
  tableDescription,
} from '../../core/treeDescriptions';
import { parseJsonMetadata } from '../../core/metadata';
import { parseTable } from '../../core/tables';
import type { DirectoryEntry } from '../../core/directory';
const options = { participantColumn: 'label', sessionColumn: 'label' };
const entry = (path: string, kind: DirectoryEntry['kind'] = 'directory'): DirectoryEntry => ({
  datasetUri: 'file:///data',
  uri: 'file:///data/' + path,
  name: path.split('/').at(-1)!,
  relativePath: path,
  kind,
});
const snapshot = (text: string) => ({
  sourceUri: 'file:///data/source',
  text,
  revision: { size: text.length, modifiedAt: 1 },
  capturedAt: 'now',
});
const signal = () => new AbortController().signal;
void test('tree-description plans recognize dataset/pipeline, task images and explicitly mapped folder labels', () => {
  assert.equal(descriptionPlan(entry(''), options)?.kind, 'dataset');
  assert.equal(descriptionPlan(entry('derivatives/sub-01'), options)?.kind, 'dataset');
  assert.equal(descriptionPlan(entry('sub-01'), options)?.kind, 'participant');
  assert.equal(descriptionPlan(entry('sub-01/ses-002'), options)?.kind, 'session');
  assert.equal(descriptionPlan(entry('sub-01_ses-002'), options)?.kind, 'combined');
  assert.equal(
    descriptionPlan(entry('sub-01_ses-002'), { ...options, participantColumn: '' })?.kind,
    'combined',
  );
  assert.equal(
    descriptionPlan(entry('sub-01/func/sub-01_task-rest_bold.nii.gz', 'file'), options)?.kind,
    'task',
  );
  assert.equal(descriptionPlan(entry('task-rest_bold.nii', 'file'), options)?.kind, 'task');
  for (const path of ['sub-01', 'sub-01/ses-002', 'sub-01_ses-002'])
    assert.equal(
      descriptionPlan(entry(path), { participantColumn: '', sessionColumn: '' }),
      undefined,
    );
  for (const [path, kind] of [
    ['../sub-01', 'directory'],
    ['sub-01/sub-99/ses-002', 'directory'],
    ['sub-01/anat', 'directory'],
    ['task-rest_bold.json', 'file'],
    ['T1w.nii', 'file'],
    ['task-rest_bold.nii', 'symlink'],
  ] as const)
    assert.equal(descriptionPlan(entry(path, kind), options), undefined);
});
void test('display descriptions are bounded plaintext while exact metadata values and provenance survive', async () => {
  assert.equal(displayDescription('  A\nB\tC\x00D  '), 'A B C D');
  assert.equal(displayDescription('x'.repeat(121)), 'x'.repeat(120) + '…');
  for (const value of ['', '\n\t ', 'n/a', 'x'.repeat(4097)])
    assert.equal(displayDescription(value), undefined);
  const doc = await parseJsonMetadata(snapshot('{"Name":"<img>\\nStudy"}'), signal());
  const label = jsonDescription(doc, 'Name')!;
  assert.equal(label.text, '<img> Study');
  assert.equal(label.evidence[0].value, '<img>\nStudy');
  assert.equal(label.evidence[0].pointer, '/Name');
  assert.equal(label.evidence[0].revision.modifiedAt, 1);
  for (const text of ['{}', '{"Name":2}', '{"Name":"n/a"}', '{"Name":"one","Name":"two"}'])
    assert.equal(
      jsonDescription(await parseJsonMetadata(snapshot(text), signal()), 'Name'),
      undefined,
    );
  assert.equal(
    jsonDescription({ ...doc, fields: [{ ...doc.fields[0], duplicated: true }] }, 'Name'),
    undefined,
  );
});
void test('mapped table descriptions require exact unique IDs, headers and rectangular rows; duplicate dictionary entries never win', async () => {
  const table = await parseTable(
    snapshot('participant_id\tlabel\nsub-001\t"Alice\\nLiteral"\nsub-01\tOther'),
    signal(),
  );
  const label = tableDescription(table, 'participant_id', 'sub-001', 'label', [])!;
  assert.equal(label.text, 'Alice\\nLiteral');
  assert.equal(label.evidence[0].rawToken, '"Alice\\nLiteral"');
  assert.equal(label.evidence[0].line, 2);
  assert.equal(tableDescription(table, 'participant_id', 'sub-1', 'label', []), undefined);
  for (const text of [
    'participant_id\tlabel\nsub-001\tA\nsub-001\tB',
    'participant_id\tlabel\tlabel\nsub-001\tA\tB',
    'participant_id\tparticipant_id\tlabel\nsub-001\tsub-001\tA',
    'participant_id\tlabel\nsub-001',
    'participant_id\tlabel\nsub-001\tn/a',
  ])
    assert.equal(
      tableDescription(
        await parseTable(snapshot(text), signal()),
        'participant_id',
        'sub-001',
        'label',
        [],
      ),
      undefined,
    );
  assert.equal(tableDescription(table, 'missing', 'sub-001', 'label', []), undefined);
  assert.equal(tableDescription(table, 'participant_id', 'sub-001', 'missing', []), undefined);
  const definitions = (await parseJsonMetadata(snapshot('{"label":{},"label":{}}'), signal()))
    .fields;
  assert.equal(
    tableDescription(table, 'participant_id', 'sub-001', 'label', definitions),
    undefined,
  );
  assert.equal(
    tableDescription(table, 'participant_id', 'sub-001', 'label', [definitions[0]]),
    undefined,
  );
  assert.ok(
    tableDescription(
      table,
      'participant_id',
      'sub-001',
      'label',
      (await parseJsonMetadata(snapshot('{"label":{}}'), signal())).fields,
    ),
  );
});

void test('logical tree labels preserve entity values and leave source identities untouched', () => {
  for (const [path, expected] of [
    ['sub-001', '001'],
    ['sub-001/ses-baseline', 'baseline'],
    ['sub-001/ses-002', '002'],
    ['sub-001_ses-002', '001 / 002'],
    ['derivatives/sub-001', 'sub-001'],
    ['sub-001/anat', 'Anatomical'],
    ['', ''],
  ]) {
    const source = entry(path);
    const before = { ...source };
    assert.equal(displayEntryLabel(source), expected);
    assert.deepEqual(source, before);
  }
  assert.equal(displayEntryLabel(entry('sub-001_T1w.nii.gz', 'file')), 'T1-weighted');
});

void test('file labels remove only resolved containing entities and retain acquisition distinctions', () => {
  for (const [path, label, type] of [
    ['sub-001/ses-02/func/sub-001_ses-02_task-rest_run-01_bold.nii.gz', 'BOLD', 'NIfTI image'],
    ['sub-001/ses-02/func/sub-001_ses-02_task-rest_run-02_bold.nii', 'BOLD', 'NIfTI image'],
    ['sub-001/ses-02/func/sub-001_ses-02_task-rest_bold.json', 'BOLD', 'JSON metadata'],
    ['sub-001/ses-02/func/sub-001_ses-02_task-rest_events.tsv', 'Events', 'Events table'],
    ['sub-001/ses-02/dwi/sub-001_ses-02_dwi.bval', 'Diffusion', 'B-values'],
    ['sub-001/ses-02/dwi/sub-001_ses-02_dwi.bvec', 'Diffusion', 'B-vectors'],
    ['sub-001/sub-001_sessions.tsv', 'Sessions', 'Sessions table'],
    ['sub-001/ses-02/sub-001_ses-02_scans.tsv', 'Scans', 'Scans table'],
    ['participants.tsv', 'Participants', 'Participants table'],
    ['participants.json', 'Participants', 'JSON metadata'],
    ['dataset_description.json', 'Dataset description', 'JSON metadata'],
    ['task-rest_bold.json', 'BOLD', 'JSON metadata'],
    ['phenotype/scores.tsv', 'scores', 'TSV table'],
    ['sub-001/ses-02/func/sub-999_ses-03_bold.json', 'BOLD', 'JSON metadata'],
    ['sub-001/func/sub-001_ses-03_bold.json', 'BOLD', 'JSON metadata'],
    ['sub-001/func/sub-001_sub-001_bold.json', 'BOLD', 'JSON metadata'],
    ['derivatives/sub-001/sub-001_bold.json', 'BOLD', 'JSON metadata'],
    ['sub-001/sub-001.json', 'sub-001', 'JSON metadata'],
    ['README', 'README', undefined],
    ['sub-001/sub-001_photo.png', 'sub-001_photo.png', undefined],
  ]) {
    const source = entry(path!, 'file');
    const before = { ...source };
    assert.equal(displayEntryLabel(source), label, path);
    assert.equal(displayFileType(source), type, path);
    assert.deepEqual(source, before);
  }
  assert.equal(displayFileType(entry('sub-001')), undefined);
  const grouped = { ...entry('dataset_description.json'), metadataVersions: [] };
  assert.equal(displayEntryLabel(grouped), 'Dataset description');
  assert.equal(displayFileType(grouped), 'JSON metadata');
});

void test('readable suffixes keep exact task, acquisition, run and other distinctions beside the label', () => {
  const source = entry(
    'sub-001/ses-02/func/sub-001_ses-02_task-rest_acq-fast_run-001_dir-AP_echo-02_space-MNI_desc-preproc_bold.nii.gz',
    'file',
  );
  assert.equal(displayEntryLabel(source), 'BOLD');
  assert.equal(
    displayFileDetails(source),
    'Task rest · Acquisition fast · Run 001 · Phase encoding AP · Echo 02 · Space MNI · Description preproc',
  );
  assert.equal(
    displayFileDetails(entry('sub-001/ses-02/func/sub-999_ses-03_bold.json', 'file')),
    'sub-999 · ses-03',
  );
  assert.equal(
    displayFileDetails(entry('sub-001/func/sub-001_sub-001_bold.json', 'file')),
    'sub-001 · sub-001',
  );
  assert.equal(
    displayEntryLabel(entry('sub-001/anat/sub-001_acq-highres_T2w.nii', 'file')),
    'T2-weighted',
  );
  assert.equal(
    displayFileDetails(entry('sub-001/anat/sub-001_acq-highres_T2w.nii', 'file')),
    'Acquisition highres',
  );
  assert.equal(displayFileDetails(entry('sub-001/anat/sub-001_T1w.json', 'file')), '');
  assert.equal(displayFileDetails(entry('participants.tsv', 'file')), '');
  assert.equal(displayFileDetails(entry('dataset_description.json', 'file')), '');
  assert.equal(displayFileDetails(entry('sub-001')), '');
  // New suffixes, unparsed tokens, unknown keys and entity values stay verbatim.
  for (const [name, label, details] of [
    ['task-rest_newSuffix.json', 'newSuffix', 'Task rest'],
    ['task-rest_unknown_T1w.json', 'task-rest_unknown_T1w', ''],
    ['task-rest_foo-special_T1w.json', 'T1-weighted', 'Task rest · foo-special'],
    ['task-rest_acq-rest_T1w.json', 'T1-weighted', 'Task rest · Acquisition rest'],
    ['task-rest_task-other_bold.json', 'BOLD', 'Task rest · Task other'],
    ['task-rest_T1W.json', 'T1W', 'Task rest'],
    ['constructor.json', 'constructor', ''],
  ]) {
    const file = entry(name, 'file');
    assert.equal(displayEntryLabel(file), label);
    assert.equal(displayFileDetails(file), details);
  }
  const grouped = { ...source, kind: 'directory' as const, metadataVersions: [source] };
  assert.equal(displayEntryLabel(grouped), 'BOLD');
  assert.equal(displayFileDetails(grouped), displayFileDetails(source));
});

void test('logical entity vocabulary preserves indices and custom labels without inventing measurements', () => {
  const labels = [
    ['run-001', 'Run 001'],
    ['echo-02', 'Echo 02'],
    ['flip-03', 'Flip angle index 03'],
    ['inv-04', 'Inversion index 04'],
    ['dir-custom', 'Phase encoding custom'],
    ['part-mag', 'Part magnitude'],
    ['part-imag', 'Part imaginary'],
    ['part-real', 'Part real'],
    ['part-phase', 'Part phase'],
    ['part-custom', 'Part custom'],
    ['hemi-L', 'Hemisphere left'],
    ['hemi-R', 'Hemisphere right'],
    ['mt-off', 'Magnetization transfer off'],
    ['ce-Gd', 'Contrast agent Gd'],
    ['mod-T1w', 'Corresponding modality T1w'],
    ['recording-cardiac', 'Recording cardiac'],
    ['split-01', 'Split 01'],
    ['chunk-01', 'Chunk 01'],
    ['sample-01', 'Sample 01'],
    ['stain-Nissl', 'Staining Nissl'],
    ['trc-FDG', 'Tracer FDG'],
    ['nuc-1H', 'Nucleus 1H'],
    ['voi-PCC', 'Volume of interest PCC'],
    ['proc-clean', 'Processing clean'],
    ['tracksys-camera', 'Tracking system camera'],
    ['atlas-custom', 'Atlas custom'],
    ['cohort-01', 'Cohort 01'],
    ['label-GM', 'Label GM'],
    ['seg-custom', 'Segmentation custom'],
    ['scale-01', 'Scale 01'],
    ['tpl-custom', 'Template custom'],
    ['rec-MoCo', 'Reconstruction MoCo'],
    ['res-high', 'Resolution high'],
    ['den-32k', 'Density 32k'],
  ];
  for (const [token, expected] of labels) {
    const source = entry(`sub-001/anat/sub-001_${token}_FLASH.nii.gz`, 'file');
    const before = JSON.stringify(source);
    assert.equal(displayEntryLabel(source), 'FLASH');
    assert.equal(displayFileDetails(source), expected);
    assert.equal(JSON.stringify(source), before);
  }
});
