import type { ArchiveIndex } from '../core/archive';
import { archiveTree } from '../core/archiveTree';
import {
  orderEntries,
  type DirectoryEntry,
  type DirectorySource,
  type SourceRevision,
} from '../core/directory';
import { LocalDirectorySource } from './localDirectory';
import { indexZip } from './zipIndex';

interface CachedArchive {
  readonly container: DirectoryEntry;
  readonly index: ArchiveIndex;
  readonly branches: ReadonlyMap<string, readonly DirectoryEntry[]>;
}
/** ZIPs remain separate physical branches. Only expanded archives are indexed, on the data host. */
export class ZipDirectorySource implements DirectorySource {
  private readonly cache = new Map<string, CachedArchive>();
  constructor(
    private readonly directories: DirectorySource = new LocalDirectorySource(),
    private readonly readIndex: typeof indexZip = indexZip,
  ) {}
  root(uri: string): Promise<DirectoryEntry> {
    return this.directories.root(uri);
  }
  revision(entry: DirectoryEntry): Promise<SourceRevision> {
    return this.directories.revision(
      entry.archive ? { ...entry, uri: entry.archive.sourceUri } : entry,
    );
  }
  refresh(scope?: DirectoryEntry): void {
    for (const [key, cached] of this.cache) {
      const first = cached.container;
      if (
        !scope ||
        (first.datasetUri === scope.datasetUri &&
          (scope.relativePath === '' ||
            first.archive!.containerPath === scope.relativePath ||
            first.archive!.containerPath.startsWith(scope.relativePath + '/') ||
            scope.relativePath.startsWith(first.archive!.containerPath + '/')))
      )
        this.cache.delete(key);
    }
  }
  async children(parent: DirectoryEntry, signal: AbortSignal): Promise<readonly DirectoryEntry[]> {
    signal.throwIfAborted();
    if (!parent.archive) {
      const physical = await this.directories.children(parent, signal);
      return orderEntries(
        physical.map((entry) =>
          entry.kind === 'file' && /\.zip$/i.test(entry.name)
            ? Object.freeze({
                ...entry,
                kind: 'directory' as const,
                archive: Object.freeze({
                  sourceUri: entry.uri,
                  containerPath: entry.relativePath,
                  memberPath: '',
                }),
              })
            : entry,
        ),
        signal,
      );
    }
    if (parent.kind !== 'directory') return [];
    const { sourceUri, memberPath } = parent.archive;
    const key = JSON.stringify([parent.datasetUri, sourceUri, parent.archive.containerPath]);
    let cached = this.cache.get(key);
    if (cached) {
      const revision = await this.revision(parent);
      if (
        revision.size !== cached.index.revision.size ||
        revision.modifiedAt !== cached.index.revision.modifiedAt
      ) {
        this.cache.delete(key);
        throw new Error('ZIP changed since indexing. Refresh the archive branch.');
      }
      this.cache.delete(key);
      this.cache.set(key, cached);
    } else {
      const index = await this.readIndex(sourceUri, signal);
      const container: DirectoryEntry = { ...parent, relativePath: parent.archive.containerPath };
      const branches = await archiveTree(container, index, signal);
      signal.throwIfAborted();
      cached = { container, index, branches };
      // Bound retained inventories independently of the browser's completed branch snapshots.
      while (
        this.cache.size >= 4 ||
        [...this.cache.values()].reduce((sum, value) => sum + value.index.members.length, 0) +
          index.members.length >
          100_000
      ) {
        this.cache.delete(this.cache.keys().next().value!);
      }
      this.cache.set(key, cached);
    }
    signal.throwIfAborted();
    return cached.branches.get(memberPath.replace(/\/$/, '')) ?? [];
  }
}
