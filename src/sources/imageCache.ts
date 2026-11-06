import { streamSquashfsMember } from './squashfsMember';
import { mkdir, lstat, opendir, open, writeFile, rename, rm, chmod } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArchiveUri } from '../core/archiveUri';
import { streamTarMember } from './tarIndex';
import { streamZipMember } from './zipMember';

export interface ImageCacheLimits {
  readonly bytes: number;
  readonly entries: number;
  readonly memberBytes: number;
}
const defaults: ImageCacheLimits = {
  bytes: 2 * 1024 ** 3,
  entries: 128,
  memberBytes: 512 * 1024 ** 2,
};

// Workspace storage may be shared across cluster nodes. Only inspect local owner PIDs.
const host = createHash('sha256').update(hostname()).digest('hex').slice(0, 16);
const ownedPartial = /^partial-([0-9a-f]{16})-([1-9][0-9]{0,9})-[0-9a-f-]{36}$/;

const activityOwner = /^(use|clear)-([0-9a-f]{16})-([1-9][0-9]{0,9})-[0-9a-f-]{36}$/;

function ownerExited(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

/** Completed files survive extension reload and are never evicted while a viewer may use them. */
export class ArchiveImageCache {
  private tail = Promise.resolve();
  private readonly completed = new Map<string, { uri: string; size: number; modifiedAt: number }>();
  constructor(
    readonly root: string,
    private readonly limits: ImageCacheLimits = defaults,
  ) {
    for (const key of ['bytes', 'entries', 'memberBytes'] as const)
      if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > defaults[key])
        throw new Error('Invalid image cache limits.');
  }
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const next = this.tail.then(action);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  private async markActivity(kind: 'use' | 'clear') {
    const directory = this.root + '-activity';
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('Image cache activity must use an ordinary private directory.');
    const marker = `${kind}-${host}-${process.pid}-${randomUUID()}`;
    const path = join(directory, marker);
    await mkdir(path, { mode: 0o700 });
    return {
      release: () => rm(path, { recursive: true, force: true }),
      blocked: async () => {
        // Publish before checking. An overlapping open or clear must see the other
        // operation's marker before proceeding, even in a different extension host.
        for await (const entry of await opendir(directory)) {
          if (entry.name === marker) continue;
          const owner = activityOwner.exec(entry.name);
          if (!owner || !entry.isDirectory())
            throw new Error('Unexpected entry in image cache activity directory.');
          if (owner[2] === host && ownerExited(Number(owner[3]))) {
            await rm(join(directory, entry.name), { recursive: true, force: true });
          } else if (kind === 'clear' || owner[1] === 'clear') {
            return true;
          }
        }
        return false;
      },
    };
  }
  /** Hold from before extraction until the window closes its viewer tabs. */
  async retain(): Promise<() => Promise<void>> {
    const activity = await this.markActivity('use');
    try {
      if (await activity.blocked())
        throw new Error('The extracted image cache is being cleared. Try opening the image again.');
      return activity.release;
    } catch (error) {
      await activity.release();
      throw error;
    }
  }
  private async inventory(): Promise<{ bytes: number; entries: number }> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const rootStat = await lstat(this.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
      throw new Error('Image cache root must be an ordinary private directory.');
    await chmod(this.root, 0o700);
    let bytes = 0,
      entries = 0;
    for await (const dir of await opendir(this.root)) {
      const owner = ownedPartial.exec(dir.name);
      if (
        (!owner && !/^(partial|image)-[0-9a-f-]{36}$/.test(dir.name)) ||
        !dir.isDirectory() ||
        dir.isSymbolicLink()
      )
        throw new Error('Unexpected entry in private image cache.');
      if (owner?.[1] === host && ownerExited(Number(owner[2]))) {
        await rm(join(this.root, dir.name), { recursive: true, force: true });
        continue;
      }
      if (++entries > this.limits.entries)
        throw new Error(
          'Image cache entry budget exceeded. Close editor tabs and clear the extracted image cache.',
        );
      let files = 0;
      for await (const file of await opendir(join(this.root, dir.name))) {
        if (++files > 2 || !file.isFile() || file.isSymbolicLink())
          throw new Error('Unexpected file in private image cache.');
        bytes += (await lstat(join(this.root, dir.name, file.name))).size;
      }
    }
    return { bytes, entries };
  }
  materialize(uri: string, signal: AbortSignal): Promise<string> {
    return this.serialize(async () => {
      signal.throwIfAborted();
      const ref = parseArchiveUri(uri);
      if (!/\.nii(\.gz)?$/.test(ref.memberPath))
        throw new Error('Image extraction supports .nii and .nii.gz members.');
      const archive = await lstat(fileURLToPath(ref.sourceUri));
      if (
        !archive.isFile() ||
        archive.isSymbolicLink() ||
        archive.size !== ref.revision.size ||
        archive.mtimeMs !== ref.revision.modifiedAt
      )
        throw new Error('Archive changed. Refresh the tree before opening the image.');
      const existing = this.completed.get(uri);
      if (existing) {
        const stat = await lstat(fileURLToPath(existing.uri)).catch((error: unknown) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          return undefined;
        });
        if (stat) {
          if (
            !stat.isFile() ||
            stat.isSymbolicLink() ||
            stat.size !== existing.size ||
            stat.mtimeMs !== existing.modifiedAt
          )
            throw new Error('Extracted image changed. Close editor tabs and clear its cache.');
          return existing.uri;
        }
        this.completed.delete(uri);
      }
      const inventory = await this.inventory();
      if (inventory.entries >= this.limits.entries)
        throw new Error(
          'Image cache is full. Close editor tabs and clear the extracted image cache.',
        );
      const id = randomUUID();
      const partial = join(this.root, `partial-${host}-${process.pid}-${id}`),
        complete = join(this.root, 'image-' + id);
      const original = basename(ref.memberPath);
      const name = /^[a-zA-Z0-9+_.-]{1,200}$/.test(original)
        ? original
        : 'image' + (original.endsWith('.gz') ? '.nii.gz' : '.nii');
      await mkdir(partial, { mode: 0o700 });
      let published = false;
      try {
        const target = join(partial, name);
        const handle = await open(target, 'wx', 0o600);
        let provenance = '';
        try {
          const write = (chunk: Buffer) => handle.writeFile(chunk);
          const start = (header: { bytes: number; crc32?: number }) => {
            provenance = JSON.stringify(
              {
                source: ref,
                memberBytes: header.bytes,
                crc32: header.crc32,
                capturedAt: new Date().toISOString(),
              },
              null,
              2,
            );
            if (inventory.bytes + header.bytes + Buffer.byteLength(provenance) > this.limits.bytes)
              throw new Error(
                'Image cache byte budget reached. Close editor tabs and clear the extracted image cache.',
              );
            return Promise.resolve();
          };
          if (ref.format === 'tar')
            await streamTarMember(ref, signal, this.limits.memberBytes, write, start);
          else if (ref.format === 'squashfs')
            await streamSquashfsMember(ref, signal, this.limits.memberBytes, write, start);
          else await streamZipMember(uri, signal, this.limits.memberBytes, write, start);
        } finally {
          await handle.close();
        }
        await chmod(target, 0o400);
        await writeFile(join(partial, 'source.json'), provenance, { mode: 0o400, flag: 'wx' });
        signal.throwIfAborted();
        await rename(partial, complete);
        published = true;
        const file = join(complete, name),
          stat = await lstat(file);
        const result = pathToFileURL(file).toString();
        signal.throwIfAborted();
        this.completed.set(uri, { uri: result, size: stat.size, modifiedAt: stat.mtimeMs });
        return result;
      } finally {
        if (!published) await rm(partial, { recursive: true, force: true });
      }
    });
  }
  clear(): Promise<boolean> {
    return this.serialize(async () => {
      const activity = await this.markActivity('clear');
      try {
        if (await activity.blocked()) return false;
        await this.inventory();
        for await (const entry of await opendir(this.root))
          await rm(join(this.root, entry.name), { recursive: true, force: true });
        this.completed.clear();
        return true;
      } finally {
        await activity.release();
      }
    });
  }
}
