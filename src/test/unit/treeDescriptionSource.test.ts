import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTreeDescription } from '../../sources/treeDescriptions';
import type { DirectoryEntry } from '../../core/directory';
const options = { participantColumn: 'label', sessionColumn: 'label' };

void test('tree descriptions retain JSON/TSV source evidence and inherited task provenance without changing data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bids-tree-labels-'));
  const uri = (path = '') => pathToFileURL(join(root, path)).href;
  const entry = (path: string, kind: DirectoryEntry['kind'] = 'directory'): DirectoryEntry => ({
    datasetUri: uri(),
    uri: uri(path),
    relativePath: path,
    name: path.split('/').at(-1)!,
    kind,
  });
  const put = async (path: string, text: string) => {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), text);
  };
  const load = (path: string, kind: DirectoryEntry['kind'] = 'directory', settings = options) =>
    loadTreeDescription(entry(path, kind), settings, new AbortController().signal);
  try {
    await put('dataset_description.json', '{"Name":"Example study"}');
    assert.equal((await load(''))?.text, 'Example study');
    await put('participants.tsv', 'participant_id\tlabel\nsub-001\tAlice\nsub-01\tOther');
    await put('participants.json', '{"label":{"Description":"Explicit display label"}}');
    await mkdir(join(root, 'sub-001/ses-002'), { recursive: true });
    const subject = await load('sub-001');
    assert.equal(subject?.text, 'Alice');
    assert.equal(subject?.evidence[0].line, 2);
    assert.equal(subject?.evidence[0].sourceUri, uri('participants.tsv'));
    assert.equal(subject?.relatedSources?.[0].sourceUri, uri('participants.json'));
    await put('sub-001/sub-001_sessions.tsv', 'session_id\tlabel\nses-002\tFollow-up');
    await put('sessions.json', '{"label":{"Description":"Visit label"}}');
    const session = await load('sub-001/ses-002');
    assert.equal(session?.text, 'Follow-up');
    assert.equal(session?.evidence[0].column, 'label');
    assert.equal(session?.relatedSources?.[0].sourceUri, uri('sessions.json'));
    await put('task-rest_bold.json', '{"TaskName":"Rest"}');
    const image = 'sub-001/func/sub-001_task-rest_bold.nii.gz';
    await put(image, 'not image bytes: do not read');
    await put('sub-001/func/sub-001_task-rest_bold.json', '{"TaskName":"Local rest"}');
    const task = await load(image, 'file');
    assert.equal(task?.text, 'Local rest');
    assert.equal(task?.relatedSources?.length, 2);
    assert.equal(task?.evidence[0].field, 'TaskName');
    assert.equal(await readFile(join(root, image), 'utf8'), 'not image bytes: do not read');
    await put('sub-001/func/sub-001_task-rest_bold.json', '{"TaskName":"n/a"}');
    assert.equal(await load(image, 'file'), undefined);
    await put('sub-001/func/sub-001_task-rest_bold.json', '{}');
    await put('task-rest_bold.json', '{}');
    assert.equal(await load(image, 'file'), undefined);
    await put('task-rest_bold.json', '{"TaskName":"One","TaskName":"Two"}');
    assert.equal(await load(image, 'file'), undefined);
    await put('derivatives/demo/dataset_description.json', '{"Name":"Pipeline dataset"}');
    assert.equal((await load('derivatives/demo'))?.text, 'Pipeline dataset');
    await mkdir(join(root, 'derivatives/demo/sub-001'), { recursive: true });
    assert.equal(await load('derivatives/demo/sub-001'), undefined);
    await mkdir(join(root, 'sub-001_ses-002'), { recursive: true });
    await put('sub-001_ses-002/sub-001_sessions.tsv', 'session_id\tlabel\nses-002\tCombined visit');
    const combined = await load('sub-001_ses-002');
    assert.equal(combined?.text, 'Alice · Combined visit');
    assert.equal(combined?.evidence.length, 2);
    assert.equal(
      (await load('sub-001_ses-002', 'directory', { ...options, participantColumn: '' }))?.text,
      'Combined visit',
    );
    assert.equal(
      (await load('sub-001_ses-002', 'directory', { ...options, sessionColumn: '' }))?.text,
      'Alice',
    );
    await rm(join(root, 'participants.json'));
    assert.equal((await load('sub-001'))?.text, 'Alice');
    await put('participants.json', 'broken');
    assert.equal(await load('sub-001'), undefined);
    await put('participants.json', '{"label":{},"label":{}}');
    assert.equal(await load('sub-001'), undefined);
    await put('participants.json', '{}');
    await put('participants.tsv', 'participant_id\tlabel\nsub-001\tA\nsub-001\tB');
    assert.equal(await load('sub-001'), undefined);
    await put('sub-001/dataset_description.json', '{}');
    assert.equal(await load('sub-001'), undefined);
    assert.equal(await load('sub-001/ses-002'), undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('description reading rejects path/source inconsistencies and linked ancestors; failures/cancellation never supply labels', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bids-tree-errors-'));
  const uri = (path = '') => pathToFileURL(join(root, path)).href;
  const entry = (path: string): DirectoryEntry => ({
    datasetUri: uri(),
    uri: uri(path),
    relativePath: path,
    name: path.split('/').at(-1)!,
    kind: 'directory',
  });
  const load = (path: string) =>
    loadTreeDescription(entry(path), options, new AbortController().signal);
  try {
    assert.equal(await load(''), undefined);
    assert.equal(await load('unknown'), undefined);
    await mkdir(join(root, 'sub-001'));
    await assert.rejects(
      loadTreeDescription(
        { ...entry('sub-001'), uri: uri('different') },
        options,
        new AbortController().signal,
      ),
      /identity/,
    );
    await symlink(join(root, 'sub-001'), join(root, 'sub-link'));
    await assert.rejects(load('sub-link'), /ordinary directories/);
    await mkdir(join(root, 'dataset_description.json'));
    await assert.rejects(load(''), /ordinary files/);
    await rm(join(root, 'dataset_description.json'), { recursive: true });
    await writeFile(join(root, 'participants.tsv'), '');
    await assert.rejects(load('sub-001'), /header line/);
    await symlink(join(root, 'sub-001'), join(root, 'sub-001/dataset_description.json'));
    await rm(join(root, 'participants.tsv'));
    assert.equal(await load('sub-001'), undefined);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(loadTreeDescription(entry(''), options, abort.signal), /abort/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
