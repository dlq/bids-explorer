import type { DatasetBrowser } from './browser';
import type { DirectoryEntry } from './directory';
import type { DatasetRegistrations } from './registrations';

/** Workspace ownership is separate from explicit, persisted registration. */
export class WorkspaceDiscovery {
  private generation = 0;
  private disposed = false;
  private readonly detected = new Map<string, DirectoryEntry>();
  private readonly dismissed = new Set<string>();

  constructor(
    private readonly browser: DatasetBrowser,
    private readonly registrations: DatasetRegistrations,
    private readonly probe: (uri: string) => Promise<DirectoryEntry | undefined>,
    private readonly changed: () => void,
    private readonly report: (uri: string, error: unknown) => void,
  ) {}

  dismiss(uri: string): void {
    this.dismissed.add(uri);
  }
  allow(uri: string): void {
    this.dismissed.delete(uri);
  }

  async update(uris: readonly string[]): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.generation;
    const requested = new Set(uris);
    for (const [uri, root] of this.detected) {
      if (!requested.has(uri)) {
        this.detected.delete(uri);
        if (!this.registrations.isManual(root.uri)) {
          this.browser.remove(root);
          this.changed();
        }
      }
    }
    const queue = [...requested];
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < queue.length && generation === this.generation) {
        const uri = queue[next++];
        let root: DirectoryEntry | undefined;
        try {
          root = await this.probe(uri);
        } catch (error) {
          // An unavailable source is not proof that a previously recognized dataset vanished.
          if (generation === this.generation) this.report(uri, error);
          continue;
        }
        if (generation !== this.generation) return;
        if (!root) {
          const previous = this.detected.get(uri);
          this.detected.delete(uri);
          if (previous && !this.registrations.isManual(previous.uri)) {
            this.browser.remove(previous);
            this.changed();
          }
          continue;
        }
        this.detected.set(uri, root);
        if (this.dismissed.has(root.uri)) continue;
        const existing = this.browser.datasets().some((entry) => entry.uri === root.uri);
        this.browser.register(root);
        if (!existing) this.changed();
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
  }
}

/** Explicit workspace declarations are distinct from heuristic recognition and manual registrations. */
export function isDeclaredCollection(uri: string, configured: unknown): boolean {
  return (
    Array.isArray(configured) &&
    configured.length <= 1000 &&
    configured.some((root: unknown) => typeof root === 'string' && root === uri)
  );
}
