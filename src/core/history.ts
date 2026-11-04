import { setImmediate } from 'node:timers/promises';
import type { TextSnapshot } from './textSnapshot';

export interface HistoryEntry {
  readonly heading?: string;
  readonly version?: string;
  readonly dateText?: string;
  readonly line: number;
  readonly text: string;
}
export interface DatasetHistory {
  readonly snapshot: TextSnapshot;
  readonly entries: readonly HistoryEntry[];
}

/** Tolerant CPAN-style release boundaries, never date/version correction or sorting. */
export async function parseHistory(
  input: TextSnapshot,
  signal: AbortSignal,
): Promise<DatasetHistory> {
  signal.throwIfAborted();
  const snapshot = Object.freeze({ ...input, revision: Object.freeze({ ...input.revision }) });
  if (Buffer.byteLength(snapshot.text) > 1024 * 1024)
    throw new Error('History preview is limited to 1 MiB.');
  const entries: HistoryEntry[] = [];
  let start = 0,
    startLine = 1,
    line = 1,
    heading: string | undefined,
    version: string | undefined,
    dateText: string | undefined;
  const flush = (end: number): void => {
    if (end > start)
      entries.push(
        Object.freeze({
          heading,
          version,
          dateText,
          line: startLine,
          text: snapshot.text.slice(start, end),
        }),
      );
    if (entries.length > 1000)
      throw new Error('History preview is limited to 1,000 sections. Open the source as text.');
  };
  let offset = 0;
  while (offset < snapshot.text.length) {
    if (line % 100 === 1) {
      await setImmediate();
      signal.throwIfAborted();
    }
    let end = snapshot.text.indexOf('\n', offset);
    if (end < 0) end = snapshot.text.length;
    const raw = snapshot.text.slice(offset, end).replace(/\r$/, '');
    // An unindented numeric release token, with optional recorded date/text, or Unreleased.
    const match = /^(v?\d[\w.+-]*|Unreleased)(?:[ \t]+(.+))?$/i.exec(raw);
    if (match) {
      flush(offset);
      start = offset;
      startLine = line;
      heading = raw;
      version = match[1];
      dateText = match[2];
    }
    offset = end + 1;
    line++;
  }
  flush(snapshot.text.length);
  signal.throwIfAborted();
  return Object.freeze({ snapshot, entries: Object.freeze(entries) });
}
