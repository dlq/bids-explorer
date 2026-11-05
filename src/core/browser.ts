import {
  entryKey,
  recognizableEntries,
  type DirectoryEntry,
  type DirectorySource,
} from './directory';
import type { Coverage } from './resources';

export interface BranchSnapshot {
  readonly coverage: Coverage;
  readonly children: readonly DirectoryEntry[];
  readonly stale: boolean;
  readonly physicalChildCount?: number;
  readonly error?: { readonly code: string; readonly message: string };
}
interface Loading {
  readonly controller: AbortController;
  readonly entry: DirectoryEntry;
  readonly promise: Promise<readonly DirectoryEntry[]>;
}
const unknown: BranchSnapshot = Object.freeze({ coverage: 'unknown', children: [], stale: false });

/** All coverage is for immediate children only; no claim about unexpanded descendants. */
export class DatasetBrowser {
  private readonly roots = new Map<string, DirectoryEntry>();
  private readonly snapshots = new Map<string, BranchSnapshot>();
  private readonly loading = new Map<string, Loading>();

  constructor(readonly source: DirectorySource) {}

  datasets(): readonly DirectoryEntry[] {
    return [...this.roots.values()];
  }

  register(entry: DirectoryEntry): DirectoryEntry {
    const existing = this.roots.get(entry.datasetUri);
    if (existing) return existing;
    this.roots.set(entry.datasetUri, entry);
    return entry;
  }

  remove(root: DirectoryEntry): void {
    this.refresh(root);
    this.roots.delete(root.datasetUri);
    for (const [key] of this.snapshots) {
      const [datasetUri] = JSON.parse(key) as [string, string];
      if (datasetUri === root.datasetUri) this.snapshots.delete(key);
    }
  }

  snapshot(entry: DirectoryEntry): BranchSnapshot {
    return this.snapshots.get(entryKey(entry)) ?? unknown;
  }

  children(entry: DirectoryEntry): Promise<readonly DirectoryEntry[]> {
    if (entry.kind !== 'directory') return Promise.resolve([]);
    const key = entryKey(entry);
    const active = this.loading.get(key);
    if (active) return active.promise;
    const previous = this.snapshot(entry);
    if (previous.coverage === 'complete' || previous.coverage === 'failed')
      return Promise.resolve(previous.children);
    const controller = new AbortController();
    const promise = this.load(entry, key, controller, previous);
    this.loading.set(key, { controller, entry, promise });
    return promise;
  }

  private async load(
    entry: DirectoryEntry,
    key: string,
    controller: AbortController,
    previous: BranchSnapshot,
  ): Promise<readonly DirectoryEntry[]> {
    try {
      await Promise.resolve();
      controller.signal.throwIfAborted();
      const physical = await this.source.children(entry, controller.signal);
      const children = await recognizableEntries(physical, controller.signal);
      if (controller.signal.aborted) return previous.children;
      this.snapshots.set(
        key,
        Object.freeze({
          coverage: 'complete',
          children,
          stale: false,
          physicalChildCount: physical.length,
        }),
      );
      return children;
    } catch (error) {
      if (controller.signal.aborted) return previous.children;
      const message = error instanceof Error ? error.message : String(error);
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'UNKNOWN';
      this.snapshots.set(
        key,
        Object.freeze({
          coverage: 'failed',
          children: previous.children,
          physicalChildCount: previous.physicalChildCount,
          stale: previous.physicalChildCount !== undefined,
          error: Object.freeze({ code, message }),
        }),
      );
      return previous.children;
    } finally {
      if (this.loading.get(key)?.controller === controller) this.loading.delete(key);
    }
  }

  refresh(scope?: DirectoryEntry): void {
    this.source.refresh?.(scope);
    const within = (datasetUri: string, relativePath: string): boolean =>
      !scope ||
      (datasetUri === scope.datasetUri &&
        (relativePath === scope.relativePath ||
          scope.relativePath === '' ||
          relativePath.startsWith(scope.relativePath + '/')));
    for (const [key, work] of this.loading) {
      if (within(work.entry.datasetUri, work.entry.relativePath)) {
        work.controller.abort();
        this.loading.delete(key);
      }
    }
    for (const [key, snapshot] of this.snapshots) {
      const [datasetUri, relativePath] = JSON.parse(key) as [string, string];
      if (within(datasetUri, relativePath))
        this.snapshots.set(
          key,
          Object.freeze({
            coverage: 'unknown',
            children: snapshot.children,
            physicalChildCount: snapshot.physicalChildCount,
            stale: snapshot.physicalChildCount !== undefined,
          }),
        );
    }
  }

  cancel(): void {
    for (const work of this.loading.values()) work.controller.abort();
    this.loading.clear();
  }
}
