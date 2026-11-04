import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { setImmediate } from 'node:timers';
import { parseTable, summaryTableKind, MAX_TABLE_ROWS, MAX_TABLE_COLUMNS } from '../../core/tables';
import type { TextSnapshot } from '../../core/textSnapshot';
const snapshot = (text: string): TextSnapshot => ({
  sourceUri: 'file:///dataset/participants.tsv',
  text,
  revision: { size: Buffer.byteLength(text), modifiedAt: 1 },
  capturedAt: 'now',
});
const parse = (text: string) => parseTable(snapshot(text), new AbortController().signal);

void test('summary table families and identifier columns stay explicit; scan paths remain uninterpreted strings', async () => {
  assert.equal(summaryTableKind('participants.tsv'), 'participants');
  assert.equal(summaryTableKind('task-rest_events.tsv'), 'events');
  assert.equal(summaryTableKind('sub-01_ses-002_task-rest_events.tsv'), 'events');
  assert.equal(summaryTableKind('events.tsv'), 'events');
  assert.equal(summaryTableKind('sub-001_sessions.tsv'), 'sessions');
  assert.equal(summaryTableKind('sub-A+B_ses-02_scans.tsv'), 'scans');
  assert.equal(summaryTableKind('sub-001_scans.tsv'), 'scans');
  for (const name of [
    'sessions.tsv',
    'scans.tsv',
    'sub-01_ses-02_sessions.tsv',
    'sub-01_sessions.tsv.gz',
    'sub-01_scans.json',
    'sub-01_bad_scans.tsv',
  ])
    assert.equal(summaryTableKind(name), undefined);
  const sessions = await parseTable(
    snapshot('session_id\tparticipant_id\nses-001\tsub-01\nses-001\tsub-02'),
    new AbortController().signal,
    'session_id',
  );
  assert.deepEqual(sessions.duplicateIds, ['ses-001']);
  assert.equal(sessions.identifierColumn, 'session_id');
  const scans = await parseTable(
    snapshot(
      'filename\nfunc/sub-001_bold.nii.gz\n../outside.nii\nfile:///outside.nii\nfunc/sub-001_bold.nii.gz',
    ),
    new AbortController().signal,
    'filename',
  );
  assert.deepEqual(scans.duplicateIds, ['func/sub-001_bold.nii.gz']);
  assert.equal(scans.rows[1].cells[0], '../outside.nii');
  assert.equal(scans.rows[2].cells[0], 'file:///outside.nii');
});

void test('participant table retains identifiers, literal numbers, missing/empty cells and source line order', async () => {
  const text =
    'participant_id\tage\tnote\r\nsub-001\t00034\tn/a\r\nsub-02\t1e999\t\r\nsub-003\t9007199254740993\tNA';
  const table = await parse(text);
  assert.deepEqual(table.columns, ['participant_id', 'age', 'note']);
  assert.deepEqual(
    table.rows.map((row) => row.cells),
    [
      ['sub-001', '00034', 'n/a'],
      ['sub-02', '1e999', ''],
      ['sub-003', '9007199254740993', 'NA'],
    ],
  );
  assert.deepEqual(
    table.rows.map((row) => row.line),
    [2, 3, 4],
  );
  assert.equal(table.snapshot.text, text);
  assert.equal(table.unevenRows, 0);
  assert.deepEqual(table.duplicateHeaders, []);
  assert.deepEqual(table.duplicateIds, []);
  assert.ok(Object.isFrozen(table.rows[0].cells));
  assert.ok(Object.isFrozen(table.snapshot.revision));
  assert.deepEqual((await parse('participant_id\n')).rows, []);
  assert.deepEqual((await parse('participant_id')).rows, []);
});

void test('quoted tabs, newlines and escaped quotes are decoded with exact original tokens retained', async () => {
  const table = await parse(
    'participant_id\tnote\nsub-01\t"A\tB\nC ""quoted"""\nsub-02\tunquoted"text\nsub-03\t"last"',
  );
  assert.equal(table.rows[0].cells[1], 'A\tB\nC "quoted"');
  assert.equal(table.rows[0].tokens[1], '"A\tB\nC ""quoted"""');
  assert.equal(table.rows[1].line, 4);
  assert.equal(table.rows[1].cells[1], 'unquoted"text');
  assert.equal(table.rows[2].cells[1], 'last');
  await assert.rejects(parse('id\n"unterminated'), /Unterminated/);
  await assert.rejects(parse('id\n"closed"extra'), /Unexpected text/);
});

void test('imperfect tables preserve duplicate headers and IDs, extra cells, absent cells and blank records', async () => {
  const table = await parse(
    'participant_id\tvalue\tvalue\t\nsub-001\ta\nsub-001\tb\tc\td\textra\n\nsub-02\tn/a\n\tn/a\nn/a\tn/a',
  );
  assert.deepEqual(table.duplicateHeaders, ['value']);
  assert.deepEqual(table.duplicateIds, ['sub-001']);
  assert.equal(table.rows[1].cells[4], 'extra');
  assert.equal(table.rows[0].cells[2], undefined);
  assert.equal(table.rows[2].cells[0], '');
  assert.equal(table.unevenRows, 6);
  assert.deepEqual((await parse('participant_id\tparticipant_id\na\ta\na\ta')).duplicateIds, []);
  assert.deepEqual((await parse('other\na\na')).duplicateIds, []);
  assert.deepEqual((await parse('\n')).columns, ['']);
  assert.deepEqual((await parse('a\nb\t')).rows[0].cells, ['b', '']);
});

void test('table parsing enforces byte, row and column limits and supports cancellation during long cells', async () => {
  await assert.rejects(parse(''), /header line/);
  await assert.rejects(parse('é'.repeat(524289)), /1 MiB/);
  const rows = 'id\n' + 'a\n'.repeat(MAX_TABLE_ROWS);
  assert.equal((await parse(rows)).rows.length, MAX_TABLE_ROWS);
  await assert.rejects(parse(rows + 'extra'), /10,000/);
  assert.equal(
    (await parse(Array.from({ length: MAX_TABLE_COLUMNS }, (_, i) => String(i)).join('\t'))).columns
      .length,
    MAX_TABLE_COLUMNS,
  );
  await assert.rejects(parse('a\t'.repeat(MAX_TABLE_COLUMNS)), /128 columns/);
  await assert.rejects(parse('a\n' + 'b\t'.repeat(MAX_TABLE_COLUMNS)), /128 columns/);
  const before = new AbortController();
  before.abort();
  await assert.rejects(parseTable(snapshot('id'), before.signal), /abort/i);
  const during = new AbortController();
  const loading = parseTable(snapshot('id\n' + 'x'.repeat(20000)), during.signal);
  setImmediate(() => setImmediate(() => during.abort()));
  await assert.rejects(loading, /abort/i);
  const input = { ...snapshot('id\n001'), revision: { size: 6, modifiedAt: 1 } };
  const captured = parseTable(input, new AbortController().signal);
  input.text = 'changed';
  input.revision.modifiedAt = 2;
  assert.equal((await captured).rows[0].cells[0], '001');
});
