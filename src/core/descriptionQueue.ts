import { entryKey, type DirectoryEntry } from './directory';
import type { TreeDescription } from './treeDescriptions';

export type DescriptionLoader = (
  entry: DirectoryEntry,
  signal: AbortSignal,
) => Promise<TreeDescription | undefined>;
export interface DescriptionSnapshot {
  readonly status: 'unloaded' | 'loading' | 'ready' | 'unavailable';
  readonly description?: TreeDescription;
  readonly error?: string;
}
interface Work {
  entry: DirectoryEntry;
  controller: AbortController;
  snapshot: DescriptionSnapshot;
}
const unloaded: DescriptionSnapshot = Object.freeze({ status: 'unloaded' });

/** Bounded background enrichment. Never waits on metadata while publishing tree rows. */
export class DescriptionQueue {
  private readonly work = new Map<string, Work>();
  private readonly queued: Work[] = [];
  private active = 0;
  constructor(
    private readonly load: DescriptionLoader,
    private readonly changed: (entry: DirectoryEntry) => void,
  ) {}
  snapshot(entry: DirectoryEntry): DescriptionSnapshot {
    return this.work.get(entryKey(entry))?.snapshot ?? unloaded;
  }
  request(entry: DirectoryEntry): DescriptionSnapshot {
    const existing = this.work.get(entryKey(entry));
    if (existing) return existing.snapshot;
    if (this.work.size >= 512 || this.queued.length >= 32) return unloaded;
    const work: Work = {
      entry: Object.freeze({ ...entry }),
      controller: new AbortController(),
      snapshot: Object.freeze({ status: 'loading' }),
    };
    this.work.set(entryKey(entry), work);
    this.queued.push(work);
    this.pump();
    return work.snapshot;
  }
  private pump(): void {
    while (this.active < 2 && this.queued.length) {
      const work = this.queued.shift()!;
      this.active++;
      void this.run(work);
    }
  }
  private async run(work: Work): Promise<void> {
    try {
      // Defer even synchronous loader setup until after getTreeItem returns.
      await Promise.resolve();
      work.controller.signal.throwIfAborted();
      const description = await this.load(work.entry, work.controller.signal);
      if (!work.controller.signal.aborted && this.work.get(entryKey(work.entry)) === work) {
        work.snapshot = Object.freeze({
          status: description ? 'ready' : 'unavailable',
          description,
        });
        this.changed(work.entry);
      }
    } catch (error) {
      if (!work.controller.signal.aborted && this.work.get(entryKey(work.entry)) === work) {
        work.snapshot = Object.freeze({ status: 'unavailable', error: String(error) });
        this.changed(work.entry);
      }
    } finally {
      this.active--;
      this.pump();
    }
  }
  clear(scope?: DirectoryEntry): void {
    for (const [key, work] of this.work) {
      if (
        !scope ||
        (work.entry.datasetUri === scope.datasetUri &&
          (!scope.relativePath ||
            work.entry.relativePath === scope.relativePath ||
            work.entry.relativePath.startsWith(scope.relativePath + '/')))
      ) {
        work.controller.abort();
        this.work.delete(key);
      }
    }
    for (let i = this.queued.length - 1; i >= 0; i--)
      if (this.queued[i].controller.signal.aborted) this.queued.splice(i, 1);
  }
  cancel(): void {
    for (const [key, work] of this.work)
      if (work.snapshot.status === 'loading') {
        work.controller.abort();
        this.work.delete(key);
      }
    for (let i = this.queued.length - 1; i >= 0; i--)
      if (this.queued[i].controller.signal.aborted) this.queued.splice(i, 1);
  }
}
