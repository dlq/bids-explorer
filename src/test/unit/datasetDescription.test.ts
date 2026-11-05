import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadDatasetDescription, loadJsonMetadata } from '../../sources/datasetDescription';

void test('selected descriptor loading records its revision and original text without source writes', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bids-metadata-source-'));
  try {
    const path = join(folder, 'dataset_description.json'),
      uri = pathToFileURL(path).toString();
    const text =
      '{"Name":"A study","BIDSVersion":"1.8.0","SourceDatasets":[{"Version":"release-X"}]}\n';
    await writeFile(path, text);
    const before = await readFile(path);
    const doc = await loadDatasetDescription(uri, new AbortController().signal);
    assert.equal(doc.snapshot.sourceUri, uri);
    assert.equal(doc.snapshot.text, text);
    assert.equal(doc.snapshot.revision.size, before.length);
    assert.ok(doc.snapshot.revision.modifiedAt > 0);
    assert.ok(Number.isFinite(Date.parse(doc.snapshot.capturedAt)));
    assert.ok(Object.isFrozen(doc.snapshot));
    assert.equal(doc.fields[2].valueText, '[{"Version":"release-X"}]');
    assert.deepEqual(await readFile(path), before);
    await assert.rejects(
      loadDatasetDescription(
        pathToFileURL(join(folder, 'other.json')).toString(),
        new AbortController().signal,
      ),
      /Choose a dataset_description/,
    );
    await writeFile(path, 'not JSON');
    await assert.rejects(loadDatasetDescription(uri, new AbortController().signal), SyntaxError);
    await rm(path);
    await assert.rejects(loadDatasetDescription(uri, new AbortController().signal), /ENOENT/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

void test('task/dictionary JSON previews are literal, preserve duplicates and numeric tokens, and never imply dataset summaries or inheritance', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bids-json-source-'));
  try {
    const path = join(folder, 'task-rest_bold.json'),
      uri = pathToFileURL(path).href;
    const text =
      '{"TaskName":"Rest","RepetitionTime":2,"RepetitionTime":3,"Large":9007199254740993}';
    await writeFile(path, text);
    const data = await loadJsonMetadata(uri, new AbortController().signal);
    assert.equal(data.kind, 'json-sidecar');
    assert.deepEqual(data.summary, {});
    assert.deepEqual(data.duplicateKeys, ['RepetitionTime']);
    assert.equal(data.fields[3].valueText, '9007199254740993');
    assert.equal(data.snapshot.text, text);
    assert.equal(await readFile(path, 'utf8'), text);
    await writeFile(join(folder, 'dataset_description.json'), '{"Name":"Study"}');
    assert.equal(
      (
        await loadJsonMetadata(
          pathToFileURL(join(folder, 'dataset_description.json')).href,
          new AbortController().signal,
        )
      ).kind,
      'dataset-description',
    );
    await assert.rejects(
      loadJsonMetadata(pathToFileURL(join(folder, 'README')).href, new AbortController().signal),
      /JSON metadata/,
    );
    await writeFile(path, '[]');
    const array = await loadJsonMetadata(uri, new AbortController().signal);
    assert.equal(array.kind, 'json-array');
    assert.deepEqual(array.fields, []);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
