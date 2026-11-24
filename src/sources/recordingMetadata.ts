import type { DirectoryEntry } from '../core/directory';
import {
  recordingTableCandidates,
  channelMetadata,
  recordingEvents,
} from '../core/recordingMetadata';
import type {
  RecordingMetadata,
  RecordingTable,
  RecordingTableChoices,
  RecordingTableKind,
} from '../core/recordingMetadataTypes';
import { parseTable } from '../core/tables';
import { loadLogicalInventory } from './logicalInheritance';
import type { LogicalDirectorySource } from './logicalDirectory';
import { readTextSnapshot } from './textSnapshotReader';

/** Read-only selected tables from the browser's logical scope, never an adjacent physical guess. */
export async function loadRecordingMetadata(
  source: LogicalDirectorySource,
  target: DirectoryEntry,
  signal: AbortSignal,
  choices: RecordingTableChoices = {},
): Promise<RecordingMetadata<DirectoryEntry>> {
  const inventory = await loadLogicalInventory(source, target, signal);
  const read = async (kind: RecordingTableKind): Promise<RecordingTable<DirectoryEntry>> => {
    const candidates = recordingTableCandidates(inventory.target, inventory.levels, kind);
    if (inventory.levels.some((level) => level.coverage !== 'complete'))
      return {
        status: 'unknown',
        candidates,
        message: 'Logical ancestor coverage is incomplete; companion matching is not resolved.',
      };
    if (!candidates.length)
      return {
        status: 'absent',
        candidates,
        message: `No applicable ${kind}.tsv found in the checked logical ancestors.`,
      };
    const selected =
      choices[kind] === undefined
        ? candidates.length === 1
          ? 0
          : -1
        : candidates.findIndex((entry) => entry.uri === choices[kind]);
    if (selected < 0)
      return {
        status: 'ambiguous',
        candidates,
        message: `Choose one of ${candidates.length} applicable ${kind} sources. No tables have been merged.`,
      };
    try {
      const entry = candidates[selected];
      if (entry.kind !== 'file')
        throw new Error('Symbolic links and special files are not followed.');
      await inventory.track(entry);
      const table = await parseTable(
        await readTextSnapshot(entry.uri, signal),
        signal,
        kind === 'channels' ? 'name' : '',
      );
      const channelRows = kind === 'channels' ? [...channelMetadata(table).values()] : undefined;
      const events = kind === 'events' ? recordingEvents(table) : undefined;
      return {
        status: 'resolved',
        candidates,
        selected,
        table,
        channelRows,
        events,
        message: `${table.rows.length.toLocaleString()} rows checked · Complete table within 1 MiB / 10,000-row limits`,
      };
    } catch (error) {
      signal.throwIfAborted();
      return { status: 'unreadable', candidates, selected, message: String(error) };
    }
  };
  // Sequential reads keep aggregate table work bounded to two small snapshots.
  const channels = await read('channels'),
    events = await read('events');
  await inventory.verify();
  return { channels, events };
}

export interface RecordingMetadataAccess {
  readonly load: (
    signal: AbortSignal,
    choices: RecordingTableChoices,
  ) => Promise<RecordingMetadata<DirectoryEntry>>;
  readonly open: (entry: DirectoryEntry) => Promise<unknown>;
}
