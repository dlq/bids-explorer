import { archiveFingerprint, type ArchiveInventoryCache } from './archiveInventoryCache';
import { tarSuffix, type ArchiveInventory, type ArchivePlacement } from '../core/archive';
import { archiveTree } from '../core/archiveTree';
import {
  orderEntries,
  type DirectoryEntry,
  type DirectorySource,
  type SourceRevision,
} from '../core/directory';
import { LocalDirectorySource } from './localDirectory';
import { indexTar } from './tarIndex';
import { indexZip } from './zipIndex';

interface CachedArchive {
  readonly container: DirectoryEntry;
  readonly index: ArchiveInventory;
  readonly stamp?: string;
  readonly branches: ReadonlyMap<string, readonly DirectoryEntry[]>;
}
/** Archives remain separate physical branches. Only expanded archives are indexed, on the data host. */
export class ArchiveDirectorySource implements DirectorySource {
  private readonly cache = new Map<string, CachedArchive>();
  constructor(
    private readonly directories: DirectorySource = new LocalDirectorySource(),
    private readonly readZip: typeof indexZip = indexZip,
    private readonly persistent?: ArchiveInventoryCache,
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
          entry.kind === 'file' && (/\.zip$/i.test(entry.name) || tarSuffix.test(entry.name))
            ? Object.freeze({
                ...entry,
                kind: 'directory' as const,
                archive: Object.freeze({
                  ...(tarSuffix.test(entry.name) ? { format: 'tar' as const } : {}),
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
    const cached = await this.inventory(parent, signal);
    return cached.branches.get(parent.archive.memberPath.replace(/\/$/, '')) ?? [];
  }

  async placeArchive(
    container: DirectoryEntry,
    placement: Omit<ArchivePlacement, 'index'>,
    budget: { remaining: number },
    signal: AbortSignal,
  ): Promise<readonly DirectoryEntry[]> {
    const cached = await this.inventory(container, signal);
    budget.remaining -= cached.index.members.length;
    if (budget.remaining < 0)
      throw new Error('Saved placements exceed 100,000 archive member records.');
    return (await archiveTree(container, cached.index, signal, placement)).get('') ?? [];
  }

  private async inventory(parent: DirectoryEntry, signal: AbortSignal): Promise<CachedArchive> {
    const { sourceUri, containerPath } = parent.archive!;
    const key = JSON.stringify([parent.datasetUri, sourceUri, containerPath]);
    const fingerprint = this.persistent && (await archiveFingerprint(sourceUri));
    let cached = this.cache.get(key);
    if (cached) {
      const revision = await this.revision(parent);
      if (
        fingerprint?.stamp !== cached.stamp ||
        revision.size !== cached.index.revision.size ||
        revision.modifiedAt !== cached.index.revision.modifiedAt
      ) {
        this.cache.delete(key);
        throw new Error('Archive changed since indexing. Refresh the archive branch.');
      }
      this.cache.delete(key);
      this.cache.set(key, cached);
    } else {
      const saved = fingerprint && (await this.persistent?.read(fingerprint, signal));
      const index =
        saved ??
        (await (parent.archive!.format === 'tar' ? indexTar : this.readZip)(sourceUri, signal));
      const container: DirectoryEntry = { ...parent, relativePath: containerPath };
      const branches = await archiveTree(container, index, signal);
      if (fingerprint && (await archiveFingerprint(sourceUri)).stamp !== fingerprint.stamp)
        throw new Error('Archive changed since indexing. Refresh the archive branch.');
      if (fingerprint && !saved) await this.persistent?.write(index, fingerprint, signal);
      signal.throwIfAborted();
      cached = { container, index, branches, stamp: fingerprint?.stamp };
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
    return cached;
  }
}
