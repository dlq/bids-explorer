import { eventNumber } from './recordingEvents';
import { interpretEntry } from './entities.js';
import type { DirectoryEntry } from './directory';
import type { MetadataLevel } from './inheritance';
import type { TableSnapshot } from './tableTypes';
import type { ChannelMetadata, RecordingEvent, RecordingTableKind } from './recordingMetadataTypes';

function entities(entry: DirectoryEntry): ReadonlyMap<string, string> | undefined {
  const parsed = interpretEntry(entry);
  if (
    !parsed.filename ||
    parsed.filename.unparsedTokens.length ||
    parsed.entities.some((e) => e.status !== 'resolved')
  )
    return;
  return new Map(
    parsed.entities.map((e) => [
      e.key,
      ['run', 'split', 'chunk'].includes(e.key) ? e.value!.replace(/^0+(?=\d)/, '') : e.value!,
    ]),
  );
}

/** Nearest applicable TSV; same-level alternatives require an explicit physical source choice. */
export function recordingTableCandidates(
  target: DirectoryEntry,
  levels: readonly MetadataLevel[],
  kind: RecordingTableKind,
) {
  const data = entities(target);
  if (!data)
    throw new Error('Recording entities are ambiguous; companion tables were not matched.');
  let candidates: DirectoryEntry[] = [];
  for (const level of levels) {
    if (level.entries.length > 50000)
      throw new Error('Recording metadata inventory exceeds 50,000 entries per level.');
    const matches = level.entries.filter((entry) => {
      if (
        entry.datasetUri !== target.datasetUri ||
        entry.relativePath !== (level.relativePath ? level.relativePath + '/' : '') + entry.name
      )
        throw new Error('Recording table has inconsistent source identity.');
      const model = interpretEntry(entry.kind === 'symlink' ? { ...entry, kind: 'file' } : entry);
      if (model.filename?.suffix !== kind || model.filename.extension !== '.tsv') return false;
      const candidate = entities(entry.kind === 'symlink' ? { ...entry, kind: 'file' } : entry);
      return !!candidate && [...candidate].every(([key, value]) => data.get(key) === value);
    });
    if (matches.length) candidates = matches;
  }
  if (candidates.length > 64)
    throw new Error('Recording metadata has more than 64 applicable sources.');
  return candidates;
}

function usable(table: TableSnapshot, required: readonly string[]): void {
  if (
    table.duplicateHeaders.length ||
    table.unevenRows ||
    required.some((column) => !table.columns.includes(column))
  )
    throw new Error(
      'Table columns are missing, repeated or uneven; no automatic interpretation was applied. Open the source table.',
    );
}

/** Join by exact recorded channel name, never row position or electrode name. */
export function channelMetadata(table: TableSnapshot): ReadonlyMap<string, ChannelMetadata> {
  usable(table, ['name']);
  const result = new Map<string, ChannelMetadata>();
  const duplicated = new Set<string>();
  for (const row of table.rows) {
    const values = Object.fromEntries(
      table.columns.map((column, index) => [column, row.cells[index]]),
    );
    if (!values.name || values.name === 'n/a') continue;
    if (result.has(values.name)) duplicated.add(values.name);
    result.set(values.name, { line: row.line, values });
  }
  for (const name of duplicated) result.delete(name);
  return result;
}

/** Negative/overlapping onsets remain meaningful; missing duration is never treated as zero. */
export function recordingEvents(table: TableSnapshot): readonly RecordingEvent[] {
  usable(table, ['onset', 'duration']);
  const onset = table.columns.indexOf('onset'),
    duration = table.columns.indexOf('duration'),
    type = table.columns.indexOf('trial_type');
  return table.rows.map((row) => ({
    line: row.line,
    values: row.cells,
    onset: eventNumber(row.cells[onset]),
    duration: eventNumber(row.cells[duration]),
    label: type < 0 || !row.cells[type] ? `Event at line ${row.line}` : row.cells[type],
  }));
}
