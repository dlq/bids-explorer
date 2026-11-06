import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertArchivePath, type ArchiveInventory, type ArchiveMember } from '../core/archive';

const slotCount = 64;
const maxBytes = 4 * 1024 * 1024;

export async function archiveFingerprint(uri: string) {
  const path = fileURLToPath(uri);
  // A warm index still requires read access to the original archive.
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile()) throw new Error('Choose an ordinary archive file.');
    return {
      stamp: [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':'),
      sourceUri: pathToFileURL(path).href,
    };
  } finally {
    await handle.close();
  }
}

type Fingerprint = Awaited<ReturnType<typeof archiveFingerprint>>;
type Member = ArchiveInventory['members'][number];
const kinds: ReadonlySet<unknown> = new Set(['file', 'directory', 'symlink', 'special']);

/** Host-local disposable cache. Direct-mapped slots bound disk use across extension sessions. */
export class ArchiveInventoryCache {
  constructor(readonly root: string) {}

  private slot(sourceUri: string): string {
    const hash = createHash('sha256').update(sourceUri).digest();
    return join(this.root, String(hash[0] % slotCount) + '.json');
  }

  private async privateRoot(): Promise<void> {
    const stat = await lstat(this.root);
    if (!stat.isDirectory() || (stat.mode & 0o077) !== 0)
      throw new Error('Archive index cache requires a private ordinary directory.');
  }

  async read(fingerprint: Fingerprint, signal: AbortSignal): Promise<ArchiveInventory | undefined> {
    try {
      signal.throwIfAborted();
      await this.privateRoot();
      const handle = await open(
        this.slot(fingerprint.sourceUri),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > maxBytes) return;
        const bytes = Buffer.alloc(stat.size + 1);
        let offset = 0;
        while (offset < bytes.length) {
          const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
          if (!bytesRead) break;
          offset += bytesRead;
        }
        signal.throwIfAborted();
        if (offset !== stat.size) return;
        return decode(JSON.parse(bytes.subarray(0, offset).toString('utf8')), fingerprint);
      } finally {
        await handle.close();
      }
    } catch {
      signal.throwIfAborted();
      // Unavailable, incompatible, or corrupt caches are ordinary misses.
    }
  }

  async write(
    index: ArchiveInventory,
    fingerprint: Fingerprint,
    signal: AbortSignal,
  ): Promise<void> {
    let partial: string | undefined;
    try {
      signal.throwIfAborted();
      const data = JSON.stringify([
        fingerprint.sourceUri,
        fingerprint.stamp,
        index.capturedAt,
        index.revision.size,
        index.revision.modifiedAt,
        index.members.map(({ resource, kind, bytes }) => [resource.memberPath, kind, bytes]),
      ]);
      if (Buffer.byteLength(data) > maxBytes) return;
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      await this.privateRoot();
      partial = join(this.root, 'partial-' + randomUUID());
      await writeFile(partial, data, { flag: 'wx', mode: 0o600, signal });
      signal.throwIfAborted();
      await rename(partial, this.slot(fingerprint.sourceUri));
      partial = undefined;
    } catch {
      signal.throwIfAborted();
      // A cache write failure must not prevent browsing.
    } finally {
      if (partial) await rm(partial, { force: true }).catch(() => undefined);
    }
  }
}

function decode(data: unknown, { sourceUri, stamp }: Fingerprint): ArchiveInventory | undefined {
  if (!Array.isArray(data)) return;
  const [uri, revision, capturedAt, size, modifiedAt, records] = data as unknown[];
  if (
    uri !== sourceUri ||
    revision !== stamp ||
    typeof capturedAt !== 'string' ||
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size < 0 ||
    typeof modifiedAt !== 'number' ||
    !Number.isFinite(modifiedAt) ||
    !Array.isArray(records) ||
    records.length > 100_000
  )
    return;
  const members = (records as unknown[]).map((record, memberIndex): Member => {
    if (!Array.isArray(record)) throw new Error('Invalid cached archive member.');
    const [memberPath, kind, bytes] = record as unknown[];
    if (
      typeof memberPath !== 'string' ||
      !kinds.has(kind) ||
      typeof bytes !== 'number' ||
      !Number.isSafeInteger(bytes) ||
      bytes < 0
    )
      throw new Error('Invalid cached archive member.');
    assertArchivePath(memberPath.replace(/\/$/, ''));
    return {
      resource: { sourceUri, memberPath, memberIndex },
      kind: kind as ArchiveMember['kind'],
      bytes,
    };
  });
  return { sourceUri, revision: { size, modifiedAt }, capturedAt, coverage: 'complete', members };
}
