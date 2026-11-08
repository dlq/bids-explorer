import { createHash, randomUUID } from 'node:crypto';
import { mkdir, lstat, opendir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

export const cacheHost = createHash('sha256').update(hostname()).digest('hex').slice(0, 16);
const ownerName = /^([0-9a-f]{16})-([1-9][0-9]{0,9})-[0-9a-f-]{36}$/;

export function cacheOwnerExited(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

/**
 * A filesystem bakery queue: publish a choosing marker, then an immutable ticket.
 * Requests order by (ticket, unique name). No shared lock is unlinked/replaced,
 * so simultaneous dead-owner cleanup cannot accidentally release a new owner.
 * Filesystem operations must provide ordinary coherent directory/rename semantics.
 */
export async function withImageCacheLock<T>(
  root: string,
  signal: AbortSignal,
  action: () => Promise<T>,
  waitMilliseconds = 30000,
): Promise<T> {
  signal.throwIfAborted();
  const queue = root + '-queue';
  await mkdir(queue, { recursive: true, mode: 0o700 });
  const stat = await lstat(queue);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Image cache queue must use an ordinary private directory.');
  const name = `${cacheHost}-${process.pid}-${randomUUID()}`;
  const request = join(queue, name);
  await mkdir(request, { mode: 0o700 });
  const deadline = Date.now() + waitMilliseconds;
  const requests = async () => {
    const found: { name: string; ticket: number }[] = [];
    let inspected = 0;
    for await (const entry of await opendir(queue)) {
      if (++inspected > 1024) throw new Error('Too many waiting image cache requests.');
      const owner = ownerName.exec(entry.name);
      if (!owner || !entry.isDirectory() || entry.isSymbolicLink())
        throw new Error('Unexpected entry in image cache queue.');
      if (entry.name === name) continue;
      const path = join(queue, entry.name);
      if (owner[1] === cacheHost && cacheOwnerExited(Number(owner[2]))) {
        await rm(path, { recursive: true, force: true });
        continue;
      }
      try {
        const ticketPath = join(path, 'ticket');
        const stat = await lstat(ticketPath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32)
          throw new Error('Invalid image cache queue ticket.');
        const ticket = Number(await readFile(ticketPath, 'utf8'));
        if (!Number.isSafeInteger(ticket) || ticket < 1 || ticket >= Number.MAX_SAFE_INTEGER)
          throw new Error('Invalid image cache queue ticket.');
        found.push({ name: entry.name, ticket });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        // An unpublished ticket means "choosing"; a removed request has finished.
        if (
          await lstat(path).catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            return undefined;
          })
        )
          found.push({ name: entry.name, ticket: 0 });
      }
    }
    return found;
  };
  try {
    const ticket = 1 + Math.max(0, ...(await requests()).map((request) => request.ticket));
    await writeFile(join(request, 'choosing'), String(ticket), { flag: 'wx', mode: 0o600 });
    await rename(join(request, 'choosing'), join(request, 'ticket'));
    for (;;) {
      signal.throwIfAborted();
      const blocked = (await requests()).some(
        (other) =>
          !other.ticket || other.ticket < ticket || (other.ticket === ticket && other.name < name),
      );
      if (!blocked) return await action();
      if (Date.now() >= deadline)
        throw new Error(
          'Image cache is busy in another window or host. Try opening the image again.',
        );
      await setTimeout(25, undefined, { signal });
    }
  } finally {
    await rm(request, { recursive: true, force: true });
  }
}
