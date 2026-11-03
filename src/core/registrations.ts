import { DatasetBrowser } from './browser';
import type { DirectoryEntry } from './directory';

export interface RegistrationStorage {
  read(): unknown;
  write(uris: readonly string[]): Promise<void>;
}

/** Only registration URIs are persisted; this service never writes to a dataset. */
export class DatasetRegistrations {
  private pending = Promise.resolve();
  private readonly manual = new Set<string>();

  constructor(
    private readonly browser: DatasetBrowser,
    private readonly storage: RegistrationStorage,
    restoreRoot: (uri: string) => DirectoryEntry,
  ) {
    const saved = storage.read();
    if (!Array.isArray(saved)) return;
    for (const uri of saved) {
      if (typeof uri !== 'string') continue;
      try {
        const root = browser.register(restoreRoot(uri));
        this.manual.add(root.uri);
      } catch {
        /* Preserve unavailable valid roots, but ignore malformed/unsupported URIs. */
      }
    }
  }

  isManual(uri: string): boolean {
    return this.manual.has(uri);
  }

  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const next = this.pending.then(action);
    this.pending = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  add(uri: string): Promise<DirectoryEntry> {
    return this.serialize(async () => {
      const root = await this.browser.source.root(uri);
      const uris = [...new Set([...this.manual, root.uri])];
      await this.storage.write(uris);
      this.manual.add(root.uri);
      return this.browser.register(root);
    });
  }

  remove(root: DirectoryEntry): Promise<void> {
    return this.serialize(async () => {
      await this.storage.write([...this.manual].filter((uri) => uri !== root.uri));
      this.manual.delete(root.uri);
      this.browser.remove(root);
    });
  }
}
