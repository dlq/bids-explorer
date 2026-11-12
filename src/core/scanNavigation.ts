import { fileURLToPath } from 'node:url';
import { assertArchivePath } from './archive';
import { entryKey, type DirectoryEntry, type DirectorySource } from './directory';
import { layoutHint } from './logicalLayout';
import type { TextSnapshot } from './textSnapshot';

type ScanResult =
  | { status: 'invalid' | 'missing' | 'unchecked' | 'unreadable' | 'stale' }
  | {
      status: 'found';
      entries: readonly DirectoryEntry[];
      ancestors: readonly DirectoryEntry[];
      directories: readonly DirectoryEntry[];
      unchecked: boolean;
      unreadable: boolean;
    };

/** Follow exact names in the logical tree. Only the recorded branch is walked. */
export async function findRecordedScan(
  source: Pick<DirectorySource, 'children' | 'revision'>,
  root: DirectoryEntry,
  tablePath: string,
  table: TextSnapshot,
  filename: string,
  signal: AbortSignal,
): Promise<ScanResult> {
  try {
    assertArchivePath(filename);
  } catch {
    return { status: 'invalid' };
  }
  if (filename === 'n/a') return { status: 'invalid' };
  const tableParts = tablePath.split('/');
  const tableName = tableParts.pop()!;
  const targetParts = filename.split('/');
  // Each listing can already inspect multiple physical branches. Do not chase pages.
  if (tableParts.length + targetParts.length > 24) return { status: 'unchecked' };
  let unchecked = false;
  let unreadable = false;
  let directory = root;
  const ancestors = [root];
  async function list() {
    signal.throwIfAborted();
    try {
      const entries = await source.children(directory, signal);
      for (const entry of entries) {
        const page = entry.paging;
        if (page?.next || (page && page.page > 1)) unchecked = true;
        if (page?.failures) unreadable = true;
        for (const physical of entry.logical?.sources ?? [entry]) {
          if (physical.archive?.unreadable) unreadable = true;
          else if (physical.archive?.memberPath === '' && !layoutHint(physical)) unchecked = true;
        }
      }
      return entries;
    } catch {
      signal.throwIfAborted();
      unreadable = true;
      return [];
    }
  }
  function enter(entries: readonly DirectoryEntry[], name: string) {
    const matches = entries.filter((entry) => entry.name === name && !entry.paging);
    const folders = matches.filter((entry) => entry.kind === 'directory');
    if (matches.some((entry) => entry.kind === 'symlink')) unreadable = true;
    if (folders.length > 1) unchecked = true;
    if (folders.length !== 1) return false;
    directory = folders[0];
    ancestors.push(directory);
    return true;
  }
  const noMatch = (): ScanResult => ({
    status: unreadable ? 'unreadable' : unchecked ? 'unchecked' : 'missing',
  });
  for (const part of tableParts) {
    if (!enter(await list(), part)) return unreadable ? noMatch() : { status: 'unchecked' };
  }
  let children = await list();
  const current = children.find((entry) => {
    if (entry.kind !== 'file' || entry.name !== tableName) return false;
    const archive = table.archiveSource;
    return archive
      ? entry.archive?.sourceUri === archive.sourceUri &&
          entry.archive.memberPath === archive.memberPath &&
          entry.archive.memberIndex === archive.memberIndex
      : !entry.archive && fileURLToPath(entry.uri) === fileURLToPath(table.sourceUri);
  });
  if (!current) return unreadable || unchecked ? noMatch() : { status: 'stale' };
  try {
    const revision = await source.revision(current);
    const recorded = table.archiveSource?.revision ?? table.revision;
    if (revision.size !== recorded.size || revision.modifiedAt !== recorded.modifiedAt)
      return { status: 'stale' };
  } catch {
    signal.throwIfAborted();
    return { status: 'unreadable' };
  }

  const boundaryMarker = (entry: DirectoryEntry) =>
    entry.name === 'dataset_description.json' &&
    (entry.kind === 'file' || entry.kind === 'symlink');
  for (const part of targetParts.slice(0, -1)) {
    if (!enter(children, part)) return noMatch();
    children = await list();
    if (children.some(boundaryMarker)) return { status: 'invalid' };
  }
  const targets = children.filter((entry) => entry.name === targetParts.at(-1) && !entry.paging);
  const directories = targets.filter((entry) => entry.kind === 'directory');
  const choices = new Map<string, DirectoryEntry>();
  for (const entry of targets) {
    if (entry.kind === 'file') choices.set(entryKey(entry), entry);
    else if (entry.kind === 'directory' && !entry.archive) {
      // A directory recording can be a logical overlay. Keep each physical choice.
      const physicalSources = entry.logical?.sources ?? [entry];
      if (physicalSources.length > 32) unchecked = true;
      for (const physical of physicalSources.slice(0, 32)) {
        if (physical.archive?.memberPath === '') {
          unchecked = true;
          continue;
        }
        try {
          if ((await source.children(physical, signal)).some(boundaryMarker))
            return { status: 'invalid' };
          choices.set(entryKey(physical), {
            ...physical,
            relativePath: entry.relativePath,
          });
        } catch {
          signal.throwIfAborted();
          unreadable = true;
        }
      }
    } else unreadable = true;
  }
  signal.throwIfAborted();
  return choices.size
    ? {
        status: 'found',
        entries: [...choices.values()],
        ancestors,
        directories,
        unchecked,
        unreadable,
      }
    : noMatch();
}
