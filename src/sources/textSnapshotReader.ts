import { constants } from 'node:fs';
import { sameFileRevision } from './fileRevision';
import { streamArchiveMember } from './archiveMember';
import { isArchiveUri, parseArchiveUri } from '../core/archiveUri';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { TextSnapshot } from '../core/textSnapshot';

export const MAX_TEXT_SNAPSHOT_BYTES = 1024 * 1024;

/** Bounded handle reads, no symlink leaves, and revision checks before/after reading. */
export interface TextSnapshotReadIO {
  stat: typeof lstat;
  open: (path: string) => Promise<Pick<FileHandle, 'stat' | 'read' | 'close'>>;
}
const nativeIO: TextSnapshotReadIO = {
  stat: lstat,
  open: (path) => open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK),
};

export async function readTextSnapshot(
  uri: string,
  signal: AbortSignal,
  io: TextSnapshotReadIO = nativeIO,
): Promise<TextSnapshot> {
  signal.throwIfAborted();
  if (isArchiveUri(uri)) {
    const ref = parseArchiveUri(uri);
    const chunks: Buffer[] = [];
    await streamArchiveMember(uri, ref, signal, MAX_TEXT_SNAPSHOT_BYTES, (chunk) => {
      chunks.push(chunk);
      return Promise.resolve();
    });
    const bytes = Buffer.concat(chunks);
    return Object.freeze({
      sourceUri: uri,
      archiveSource: ref,
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      revision: Object.freeze({ size: bytes.length, modifiedAt: ref.revision.modifiedAt }),
      capturedAt: new Date().toISOString(),
    });
  }
  const path = fileURLToPath(uri);
  const before = await io.stat(path);
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error('Text preview reads ordinary files only, not symbolic links or special files.');
  if (before.size > MAX_TEXT_SNAPSHOT_BYTES)
    throw new Error('Text preview is limited to 1 MiB per file.');
  let handle: Pick<FileHandle, 'stat' | 'read' | 'close'> | undefined;
  try {
    handle = await io.open(path);
    if (!sameFileRevision(before, await handle.stat()))
      throw new Error('Source changed while opening; retry the preview.');
    const bytes = Buffer.alloc(Math.min(before.size + 1, MAX_TEXT_SNAPSHOT_BYTES + 1));
    let offset = 0;
    while (offset < bytes.length) {
      signal.throwIfAborted();
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    const after = await handle.stat();
    const current = await io.stat(path);
    if (
      offset !== before.size ||
      !sameFileRevision(before, after) ||
      !sameFileRevision(before, current)
    )
      throw new Error('Source changed while reading; retry the preview.');
    signal.throwIfAborted();
    return Object.freeze({
      sourceUri: pathToFileURL(path).toString(),
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset)),
      revision: Object.freeze({ size: before.size, modifiedAt: before.mtimeMs }),
      capturedAt: new Date().toISOString(),
    });
  } finally {
    await handle?.close();
  }
}
