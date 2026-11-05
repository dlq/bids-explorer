import { setImmediate } from 'node:timers/promises';
import type { PhysicalResource } from './resources';
import type { SourceRevision } from './sourceRevision';

export interface ArchiveMember {
  readonly resource: PhysicalResource & {
    readonly memberPath: string;
    readonly memberIndex: number;
  };
  readonly kind: 'file' | 'directory' | 'symlink' | 'special';
  readonly compressedBytes: number;
  readonly bytes: number;
  readonly compressionMethod: number;
  readonly encrypted: boolean;
}
export interface ArchiveIndex {
  readonly sourceUri: string;
  readonly revision: SourceRevision;
  readonly capturedAt: string;
  /** Complete central-directory inventory, not payload integrity or BIDS validation. */
  readonly coverage: 'complete';
  readonly members: readonly ArchiveMember[];
}
export interface ArchivePlacement {
  readonly index: ArchiveIndex;
  /** Explicit member-directory prefix to remove; empty preserves the member root. */
  readonly memberRoot: string;
  /** Explicit dataset-relative directory under which members are mounted. */
  readonly logicalRoot: string;
}
export interface ArchiveLogicalEntry {
  readonly relativePath: string;
  readonly kinds: readonly ArchiveMember['kind'][];
  readonly sources: readonly ArchiveMember['resource'][];
  readonly conflict: boolean;
}

/** Reject unsafe/ambiguous spellings; never repair member identity by normalization. */
export function assertArchivePath(path: string, allowRoot = false): void {
  if (allowRoot && path === '') return;
  if (
    path.length > 4096 ||
    /[\\\u0000-\u001f\u007f:]/.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..') ||
    path.split('/').length > 128
  )
    throw new Error('Unsafe or oversized archive path.');
}

/** File-wise overlay from declared placements only; no filename or wrapper guessing. */
export async function mergeArchivePlacements(
  placements: readonly ArchivePlacement[],
  signal: AbortSignal,
): Promise<readonly ArchiveLogicalEntry[]> {
  const entries = new Map<
    string,
    { kinds: Set<ArchiveMember['kind']>; sources: ArchiveMember['resource'][] }
  >();
  let seen = 0;
  const add = (
    path: string,
    kind: ArchiveMember['kind'],
    source?: ArchiveMember['resource'],
  ): void => {
    let entry = entries.get(path);
    if (!entry) {
      if (entries.size >= 100_000) throw new Error('Collection exceeds 100,000 logical entries.');
      entry = { kinds: new Set(), sources: [] };
      entries.set(path, entry);
    }
    entry.kinds.add(kind);
    if (source) entry.sources.push(source);
  };
  signal.throwIfAborted();
  if (placements.length > 1000) throw new Error('Collection exceeds 1,000 declared sources.');
  const sources = new Set<string>();
  for (const { index, memberRoot, logicalRoot } of placements) {
    assertArchivePath(memberRoot, true);
    assertArchivePath(logicalRoot, true);
    if (sources.has(index.sourceUri))
      throw new Error('Declare each physical ZIP source only once.');
    sources.add(index.sourceUri);
    let matched = !memberRoot;
    for (const member of index.members) {
      if (++seen > 100_000) throw new Error('Collection exceeds 100,000 member records.');
      if (seen % 256 === 0) {
        await setImmediate();
        signal.throwIfAborted();
      }
      const original = member.resource.memberPath.replace(/\/$/, '');
      assertArchivePath(original);
      if (memberRoot && original !== memberRoot && !original.startsWith(memberRoot + '/')) continue;
      if (original === memberRoot && member.kind !== 'directory')
        throw new Error('Member root must identify a directory.');
      matched = true;
      const tail = memberRoot ? original.slice(memberRoot.length).replace(/^\//, '') : original;
      const path = [logicalRoot, tail].filter(Boolean).join('/');
      if (!path) continue;
      assertArchivePath(path);
      add(path, member.kind, member.resource);
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) add(parts.slice(0, i).join('/'), 'directory');
    }
    if (!matched) throw new Error('Declared member root is absent from the ZIP index.');
  }
  signal.throwIfAborted();
  const result: ArchiveLogicalEntry[] = [];
  for (const [relativePath, entry] of entries) {
    if (result.length % 256 === 0) {
      await setImmediate();
      signal.throwIfAborted();
    }
    result.push(
      Object.freeze({
        relativePath,
        kinds: Object.freeze([...entry.kinds]),
        sources: Object.freeze(entry.sources),
        conflict:
          entry.kinds.size > 1 || (entry.sources.length > 1 && !entry.kinds.has('directory')),
      }),
    );
  }
  return Object.freeze(result);
}
