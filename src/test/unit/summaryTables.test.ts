import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadSummaryTable } from '../../sources/summaryTables';

void test('session and scan previews resolve dictionary inheritance with provenance and literal identifiers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bids-summary-tables-'));
  const uri = (path = '') => pathToFileURL(join(root, path)).href;
  const put = async (path: string, text: string) => {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), text);
  };
  const load = (path: string) => loadSummaryTable(uri(path), new AbortController().signal, uri());
  try {
    await put('participants.tsv', 'participant_id\nsub-001');
    assert.equal((await load('participants.tsv')).table.identifierColumn, 'participant_id');
    await put('sessions.json', '{"visit":{"Description":"Inherited visit"}}');
    await put('sub-001/sub-001_sessions.tsv', 'session_id\tvisit\nses-002\t0002\nses-001\t0001');
    await put('sub-001/sub-001_sessions.json', '{"visit":{"Description":"Local visit"}}');
    const sessions = await load('sub-001/sub-001_sessions.tsv');
    assert.equal(sessions.kind, 'sessions');
    assert.equal(sessions.table.rows[0].cells[0], 'ses-002');
    assert.equal(sessions.dictionary.status, 'loaded');
    assert.equal(sessions.dictionary.sources?.length, 2);
    assert.equal(sessions.dictionary.fields?.[0].sourceUri, uri('sub-001/sub-001_sessions.json'));
    assert.equal(sessions.dictionary.fields?.[0].valueText, '{"Description":"Local visit"}');
    await put(
      'sub-001/ses-002/sub-001_ses-002_scans.tsv',
      'filename\tacq_time\nfunc/sub-001_ses-002_bold.nii.gz\t1877-06-15T13:45:30',
    );
    const scans = await load('sub-001/ses-002/sub-001_ses-002_scans.tsv');
    assert.equal(scans.kind, 'scans');
    assert.equal(scans.table.identifierColumn, 'filename');
    assert.equal(scans.dictionary.status, 'absent');
    assert.equal(scans.dictionary.sourceUri, uri('sub-001/ses-002/sub-001_ses-002_scans.json'));
    await put('scans.json', '{"acq_time":{"Description":"Time"}}');
    assert.equal(
      (await load('sub-001/ses-002/sub-001_ses-002_scans.tsv')).dictionary.status,
      'loaded',
    );
    await put('sub-001/ses-002/sub-001_ses-002_scans.json', 'broken');
    const failed = await load('sub-001/ses-002/sub-001_ses-002_scans.tsv');
    assert.equal(failed.dictionary.status, 'unavailable');
    assert.ok(failed.dictionary.sources?.[1].error);
    assert.deepEqual(failed.dictionary.fields, []);
    assert.equal(failed.table.rows.length, 1);
    await put('sub-001/ses-002/sub-001_ses-002_scans.json', '{}');
    await put('sub-001/ses-002/scans.json', '{}');
    assert.match(
      (await load('sub-001/ses-002/sub-001_ses-002_scans.tsv')).dictionary.error!,
      /Ambiguous/,
    );
    await put('derivatives/demo/sub-001/sub-001_sessions.tsv', 'session_id\nses-001');
    assert.equal(
      (await load('derivatives/demo/sub-001/sub-001_sessions.tsv')).dictionary.status,
      'absent',
    );
    await put('nested/dataset_description.json', '{}');
    await put('nested/sub-001/sub-001_sessions.tsv', 'session_id\nses-001');
    assert.equal((await load('nested/sub-001/sub-001_sessions.tsv')).dictionary.status, 'absent');
    assert.equal(
      await readFile(join(root, 'sub-001/sub-001_sessions.tsv'), 'utf8'),
      'session_id\tvisit\nses-002\t0002\nses-001\t0001',
    );
    await assert.rejects(
      loadSummaryTable(uri('sub-001/sub-001_sessions.tsv'), new AbortController().signal),
      /Add the containing dataset/,
    );
    await assert.rejects(load('other.tsv'), /Choose/);
    const abort = new AbortController();
    abort.abort();
    await assert.rejects(
      loadSummaryTable(uri('sub-001/sub-001_sessions.tsv'), abort.signal, uri()),
      /abort/i,
    );
    await assert.rejects(
      loadSummaryTable(uri('../sub-001_sessions.tsv'), new AbortController().signal, uri()),
      /inside/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
