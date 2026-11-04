import { setImmediate } from 'node:timers/promises';
import type { TextSnapshot } from './textSnapshot';
import type { TableRow, TableSnapshot } from './tableTypes';

export const MAX_TABLE_ROWS = 10000;
export const MAX_TABLE_COLUMNS = 128;

/** Deliberately bounded recognition vocabulary; not full dataset validation. */
export function summaryTableKind(
  name: string,
): 'participants' | 'sessions' | 'scans' | 'events' | undefined {
  if (name === 'participants.tsv') return 'participants';
  if (/^(?:[a-z][a-z0-9]*-[a-zA-Z0-9+]+_)*events\.tsv$/.test(name)) return 'events';
  if (/^sub-[a-zA-Z0-9+]+_sessions\.tsv$/.test(name)) return 'sessions';
  if (/^sub-[a-zA-Z0-9+]+(?:_ses-[a-zA-Z0-9+]+)?_scans\.tsv$/.test(name)) return 'scans';
  return undefined;
}

/** Quote-aware tab-delimited records. Numeric tokens and original cell tokens remain strings. */
export async function parseTable(
  input: TextSnapshot,
  signal: AbortSignal,
  identifierColumn = 'participant_id',
): Promise<TableSnapshot> {
  signal.throwIfAborted();
  const snapshot = Object.freeze({ ...input, revision: Object.freeze({ ...input.revision }) });
  if (Buffer.byteLength(snapshot.text) > 1024 * 1024)
    throw new Error('Table preview is limited to 1 MiB.');
  if (!snapshot.text) throw new Error('Table preview requires a header line.');
  const rows: TableRow[] = [];
  let columns: readonly string[] | undefined;
  let cells: string[] = [],
    tokens: string[] = [],
    value = '',
    start = 0,
    line = 1,
    recordLine = 1,
    quoted = false,
    closed = false,
    unevenRows = 0;
  const cell = (end: number): void => {
    cells.push(value);
    tokens.push(snapshot.text.slice(start, end));
    value = '';
    closed = false;
    if (cells.length > MAX_TABLE_COLUMNS)
      throw new Error('Table preview is limited to 128 columns, including extra cells.');
  };
  const record = (): void => {
    if (!columns) columns = Object.freeze(cells);
    else {
      if (rows.length === MAX_TABLE_ROWS)
        throw new Error('Table preview is limited to 10,000 rows. Open the original as text.');
      if (cells.length !== columns.length) unevenRows++;
      rows.push(
        Object.freeze({
          line: recordLine,
          cells: Object.freeze(cells),
          tokens: Object.freeze(tokens),
        }),
      );
    }
    cells = [];
    tokens = [];
  };
  for (let i = 0; i < snapshot.text.length; i++) {
    if (i % 4096 === 0) {
      await setImmediate();
      signal.throwIfAborted();
    }
    const ch = snapshot.text[i];
    if (quoted) {
      if (ch === '"') {
        if (snapshot.text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        value += ch;
        if (ch === '\n') line++;
      }
      continue;
    }
    const newline = ch === '\n' || (ch === '\r' && snapshot.text[i + 1] === '\n');
    if (closed && ch !== '\t' && !newline)
      throw new Error(
        `Unexpected text after a quoted cell near line ${line}. Open the original as text.`,
      );
    if (ch === '"' && i === start) {
      quoted = true;
      continue;
    }
    if (ch === '\t' || newline) {
      cell(i);
      if (newline) {
        record();
        line++;
        recordLine = line;
        if (ch === '\r') i++;
      }
      start = i + 1;
    } else value += ch;
  }
  if (quoted) throw new Error('Unterminated quoted cell. Open the original as text.');
  if (start < snapshot.text.length || cells.length) {
    cell(snapshot.text.length);
    record();
  }
  const repeated = (values: readonly string[]): readonly string[] => {
    const seen = new Set<string>(),
      duplicates = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) duplicates.add(value);
      seen.add(value);
    }
    return Object.freeze([...duplicates]);
  };
  const header = columns!;
  const idColumns = identifierColumn
    ? header.flatMap((name, i) => (name === identifierColumn ? [i] : []))
    : [];
  const duplicateIds =
    idColumns.length === 1
      ? repeated(
          rows
            .map((row) => row.cells[idColumns[0]])
            .filter((value) => value !== undefined && value !== '' && value !== 'n/a'),
        )
      : Object.freeze([]);
  signal.throwIfAborted();
  return Object.freeze({
    snapshot,
    identifierColumn,
    columns: header,
    rows: Object.freeze(rows),
    duplicateHeaders: repeated(header),
    duplicateIds,
    unevenRows,
  });
}
