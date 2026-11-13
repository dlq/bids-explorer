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

export class TableSizeError extends Error {}

/** Incremental quote-aware TSV parsing, including quotes and CRLF split across reads. */
export class TableRecords {
  private cells: string[] = [];
  private tokens: string[] = [];
  private value = '';
  private token = '';
  private line = 1;
  private recordLine = 1;
  private quoted = false;
  private closed = false;
  private pending = '';
  private length = 0;

  constructor(private readonly record: (row: TableRow) => void) {}

  async push(text: string, signal: AbortSignal, final = false): Promise<void> {
    signal.throwIfAborted();
    const input = this.pending + text;
    const end = final ? input.length : Math.max(0, input.length - 1);
    let i = 0;
    for (; i < end; i++) {
      if (i % 4096 === 0) {
        await setImmediate();
        signal.throwIfAborted();
      }
      const ch = input[i];
      const next = input[i + 1];
      if (++this.length > 1024 * 1024) throw new Error('A TSV record exceeds 1 MiB.');
      if (this.quoted) {
        this.token += ch;
        if (ch === '"' && next === '"') {
          this.token += next;
          this.value += ch;
          this.length++;
          i++;
        } else if (ch === '"') {
          this.quoted = false;
          this.closed = true;
        } else {
          this.value += ch;
          if (ch === '\n') this.line++;
        }
        continue;
      }
      const newline = ch === '\n' || (ch === '\r' && next === '\n');
      if (this.closed && ch !== '\t' && !newline)
        throw new Error(
          `Unexpected text after a quoted cell near line ${this.line}. Open the original as text.`,
        );
      if (ch === '\t' || newline) {
        this.cell();
        if (newline) {
          this.emit();
          this.recordLine = ++this.line;
          if (ch === '\r') i++;
        }
      } else {
        if (ch === '"' && !this.token) this.quoted = true;
        else this.value += ch;
        this.token += ch;
      }
    }
    this.pending = input.slice(i);
    if (final) {
      if (this.quoted) throw new Error('Unterminated quoted cell. Open the original as text.');
      if (this.token || this.cells.length) {
        this.cell();
        this.emit();
      }
    }
  }

  private cell(): void {
    this.cells.push(this.value);
    this.tokens.push(this.token);
    if (this.cells.length > MAX_TABLE_COLUMNS)
      throw new Error('Table preview is limited to 128 columns, including extra cells.');
    this.value = '';
    this.token = '';
    this.closed = false;
  }

  private emit(): void {
    this.record({ line: this.recordLine, cells: this.cells, tokens: this.tokens });
    this.cells = [];
    this.tokens = [];
    this.length = 0;
  }
}

export function repeated(values: readonly string[]): readonly string[] {
  const seen = new Set<string>(),
    duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Object.freeze([...duplicates]);
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
    throw new TableSizeError('Table preview is limited to 1 MiB.');
  const rows: TableRow[] = [];
  let columns: readonly string[] | undefined;
  let unevenRows = 0;
  const records = new TableRecords((row) => {
    if (!columns) {
      columns = Object.freeze(row.cells);
      return;
    }
    if (rows.length === MAX_TABLE_ROWS)
      throw new TableSizeError(
        'Table preview is limited to 10,000 rows. Open the original as text.',
      );
    if (row.cells.length !== columns.length) unevenRows++;
    rows.push(
      Object.freeze({
        ...row,
        cells: Object.freeze(row.cells),
        tokens: Object.freeze(row.tokens),
      }),
    );
  });
  await records.push(snapshot.text, signal, true);
  if (!columns) throw new Error('Table preview requires a header line.');
  const header: readonly string[] = columns;
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
