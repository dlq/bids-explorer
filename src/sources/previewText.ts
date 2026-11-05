import { parseArchiveUri } from '../core/archiveUri';
import { readZipMember } from './zipMember';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { TextSnapshot } from '../core/textSnapshot';

export const MAX_PREVIEW_BYTES = 1024 * 1024;

/** Bounded handle reads, no symlink leaves, and revision checks before/after reading. */
export interface PreviewReadIO {
  stat: typeof lstat;
  open: (path: string) => Promise<Pick<FileHandle, 'stat' | 'read' | 'close'>>;
}
const nativeIO: PreviewReadIO = { stat: lstat, open: (path) => open(path, 'r') };

export async function readTextSnapshot(
  uri: string,
  signal: AbortSignal,
  io: PreviewReadIO = nativeIO,
): Promise<TextSnapshot> {
  signal.throwIfAborted();
  if (uri.startsWith('bids-zip:')) {
    const ref = parseArchiveUri(uri);
    const bytes = await readZipMember(uri, signal, MAX_PREVIEW_BYTES);
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
  if (before.size > MAX_PREVIEW_BYTES)
    throw new Error('Text preview is limited to 1 MiB per file.');
  let handle: Pick<FileHandle, 'stat' | 'read' | 'close'> | undefined;
  try {
    handle = await io.open(path);
    const opened = await handle.stat();
    if (opened.ino !== before.ino || opened.dev !== before.dev)
      throw new Error('Source changed while opening; retry the preview.');
    const bytes = Buffer.alloc(Math.min(before.size + 1, MAX_PREVIEW_BYTES + 1));
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
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      current.ino !== opened.ino ||
      current.dev !== opened.dev ||
      current.size !== before.size ||
      current.mtimeMs !== before.mtimeMs
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
