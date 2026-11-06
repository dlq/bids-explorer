import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deserialize, serialize } from 'node:v8';
import { tarSuffix } from '../core/archive';
import type { AvailabilityIndex } from '../core/availability';
import type { DirectoryEntry } from '../core/directory';
import { archiveFingerprint } from './archiveInventoryCache';
import { squashfsSuffix } from './squashfsCollection';

const maxBytes = 64 * 1024 * 1024;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

async function fingerprint(root: DirectoryEntry, signal: AbortSignal) {
  try {
    const path = fileURLToPath(root.uri);
    if (!(await lstat(path)).isDirectory()) return;
    const entries = await readdir(path, { withFileTypes: true });
    // Loose and mixed datasets need a recursive revision check. Keep those scans live.
    if (
      entries.some(
        (entry) => !entry.isFile() || /\.zip$/i.test(entry.name) || tarSuffix.test(entry.name),
      )
    )
      return;
    const shards = entries
      .filter((entry) => squashfsSuffix.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    if (!shards.length) return;
    const sources = [];
    for (const name of shards) {
      signal.throwIfAborted();
      sources.push(await archiveFingerprint(pathToFileURL(join(path, name)).href));
    }
    return hash(JSON.stringify([root.datasetUri, sources]));
  } catch {
    signal.throwIfAborted();
  }
}

/** A disposable host-local cache for immutable SquashFS collections. */
export class AvailabilityCache {
  constructor(private readonly directory: string) {}

  async load(
    root: DirectoryEntry,
    signal: AbortSignal,
    scan: () => Promise<AvailabilityIndex>,
    retryIncomplete = false,
    linked: readonly DirectoryEntry[] = [],
  ): Promise<AvailabilityIndex> {
    signal.throwIfAborted();
    const currentStamp = async () => {
      const raw = await fingerprint(root, signal);
      if (!raw || !linked.length) return raw;
      const stamps = [raw];
      for (const derivative of linked) {
        const stamp = await fingerprint(derivative, signal);
        if (!stamp) return undefined;
        stamps.push(stamp);
      }
      return hash(JSON.stringify(stamps));
    };
    const stamp = await currentStamp();
    if (!stamp) return scan();
    const identity = linked.length
      ? JSON.stringify([root.datasetUri, ...linked.map((entry) => entry.datasetUri)])
      : root.datasetUri;
    const slot = join(this.directory, hash(identity).slice(0, 1) + '.bin');
    const cached = await this.read(slot, stamp, signal);
    if (cached && !(retryIncomplete && cached.retryable)) return cached;

    const index = await scan();
    signal.throwIfAborted();
    // Never publish an index under a revision that changed during the scan.
    if (stamp === (await currentStamp())) await this.write(slot, stamp, index, signal);
    return index;
  }

  private async privateDirectory() {
    const stat = await lstat(this.directory);
    if (!stat.isDirectory() || (stat.mode & 0o077) !== 0)
      throw new Error('Availability cache requires a private ordinary directory.');
  }

  private async read(slot: string, stamp: string, signal: AbortSignal) {
    try {
      await this.privateDirectory();
      const handle = await open(
        slot,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > maxBytes) return;
        const bytes = await handle.readFile({ signal });
        const body = bytes.subarray(128);
        if (bytes.subarray(0, 128).toString('ascii') !== stamp + hash(body)) return;
        // Only the extension's own versioned, private cache writes this format.
        return deserialize(body) as AvailabilityIndex;
      } finally {
        await handle.close();
      }
    } catch {
      signal.throwIfAborted();
    }
  }

  private async write(slot: string, stamp: string, index: AvailabilityIndex, signal: AbortSignal) {
    let temporary: string | undefined;
    try {
      const body = serialize({
        ...index,
        // Cached rows only need display identity. Reveal resolves them in the live tree.
        participants: index.participants.map(({ datasetUri, uri, relativePath, name, kind }) => ({
          datasetUri,
          uri,
          relativePath,
          name,
          kind,
        })),
      });
      if (body.length + 128 > maxBytes) return;
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      await this.privateDirectory();
      temporary = join(this.directory, 'partial-' + randomUUID());
      await writeFile(temporary, Buffer.concat([Buffer.from(stamp + hash(body)), body]), {
        flag: 'wx',
        mode: 0o600,
        signal,
      });
      signal.throwIfAborted();
      await rename(temporary, slot);
      temporary = undefined;
    } catch {
      signal.throwIfAborted();
    } finally {
      if (temporary) await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}
