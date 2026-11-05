import { entryArchiveUri } from '../core/archiveUri';
import { type DirectoryEntry, type SourceRevision } from '../core/directory';
import { inheritanceBoundary, resolveInheritance, type MetadataLevel } from '../core/inheritance';
import { layoutHint } from '../core/logicalLayout';
import { parseJsonMetadata } from '../core/metadata';
import type { LogicalDirectorySource } from './logicalDirectory';
import { readTextSnapshot } from './previewText';

function resource(entry: DirectoryEntry): DirectoryEntry {
  return entry.archive && entry.kind === 'file' ? { ...entry, uri: entryArchiveUri(entry) } : entry;
}

/** Inspect the same logical ancestors that the browser exposes, retaining physical choices. */
export async function loadLogicalInheritance(
  source: LogicalDirectorySource,
  selection: DirectoryEntry,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const parts = selection.relativePath.split('/').slice(0, -1);
  if (parts.length >= 128) throw new Error('Metadata inspection exceeds 128 ancestor levels.');
  const boundary = inheritanceBoundary(selection);
  let directory: DirectoryEntry | undefined = await source.root(selection.datasetUri);
  let path = '';
  let incomplete: string | undefined;
  const levels: MetadataLevel[] = [];
  const revisions = new Map<string, { entry: DirectoryEntry; revision: SourceRevision }>();
  const track = async (entry: DirectoryEntry): Promise<void> => {
    signal.throwIfAborted();
    const key = entry.archive?.sourceUri ?? entry.uri;
    if (!revisions.has(key)) revisions.set(key, { entry, revision: await source.revision(entry) });
  };
  const target = resource(selection);
  for (const part of [...parts, undefined]) {
    signal.throwIfAborted();
    let entries: readonly DirectoryEntry[] = [];
    if (directory) {
      try {
        for (const physical of directory.logical?.sources ?? [directory]) await track(physical);
        entries = await source.children(directory, signal, track);
      } catch (error) {
        signal.throwIfAborted();
        incomplete ??= String(error);
      }
    }
    // Unnamed roots still present after projection were deferred by the browse budget.
    if (
      entries.some((entry) =>
        entry.logical?.sources.some(
          (physical) => physical.archive?.memberPath === '' && !layoutHint(physical),
        ),
      )
    )
      incomplete ??= 'Some ZIP sources were deferred by the branch limit.';
    if (part !== undefined) {
      const next: readonly DirectoryEntry[] = entries.filter((entry) => entry.name === part);
      directory = next.find((entry) => entry.kind === 'directory');
      if (!directory || next.length > 1)
        incomplete ??= 'A logical ancestor is missing or has conflicting source types.';
    } else {
      const current = entries.find(
        (entry) =>
          entry.kind === 'file' && entry.name === target.name && resource(entry).uri === target.uri,
      );
      if (!current)
        incomplete ??= 'The selected physical source changed or is unavailable. Refresh the tree.';
      else await track(current);
    }
    if (path === boundary || path.startsWith(boundary ? boundary + '/' : '')) {
      const markers = entries.filter(
        (entry) => entry.name === 'dataset_description.json' && entry.kind === 'file',
      );
      if (markers.length) levels.length = 0;
      if (markers.length > 1)
        incomplete ??= 'Multiple dataset descriptions at the same logical level.';
      levels.push({
        relativePath: path,
        coverage: incomplete ? 'incomplete' : 'complete',
        error: incomplete,
        entries: entries.filter((entry) => /\.(json|bval|bvec)$/.test(entry.name)).map(resource),
      });
    }
    if (part !== undefined) path = path ? path + '/' + part : part;
  }
  const result = await resolveInheritance(
    target,
    levels,
    async (entry, abort) => {
      await track(entry);
      return parseJsonMetadata(await readTextSnapshot(entry.uri, abort), abort);
    },
    signal,
  );
  for (const { entry, revision } of revisions.values()) {
    signal.throwIfAborted();
    const current = await source.revision(entry);
    if (current.size !== revision.size || current.modifiedAt !== revision.modifiedAt)
      throw new Error('Source changed during metadata inspection. Run Inspect again.');
  }
  signal.throwIfAborted();
  return result;
}
