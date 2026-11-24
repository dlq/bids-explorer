import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { edfHeaderBytes, parseEdfHeader } from '../core/edf';
import { isArchiveUri, parseArchiveUri } from '../core/archiveUri';
import { readArchivePrefix } from './archiveMember';
import { sameFileRevision, type RevisionStat } from './fileRevision';

export interface RecordingHeaderIO {
  stat(path: string): Promise<RevisionStat & { isSymbolicLink(): boolean }>;
  open(path: string): Promise<{
    stat(): Promise<RevisionStat>;
    read(
      buffer: Buffer,
      offset: number,
      length: number,
      position: number,
    ): Promise<{ bytesRead: number }>;
    close(): Promise<void>;
  }>;
}

const nativeIO: RecordingHeaderIO = {
  stat: lstat,
  open: (path) => open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK),
};

/** No cache, text decode of the payload, or whole-recording extraction. Runs on the workspace host. */
export async function loadRecordingHeader(
  uri: string,
  signal: AbortSignal,
  io: RecordingHeaderIO = nativeIO,
) {
  signal.throwIfAborted();
  const archive = isArchiveUri(uri) ? parseArchiveUri(uri) : undefined;
  const path = fileURLToPath(archive?.sourceUri ?? uri);
  const before = await io.stat(path);
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error('Recording summaries require an ordinary file, not a link or special file.');
  let memberBytes = before.size;
  const handle = archive ? undefined : await io.open(path);
  try {
    if (handle && !sameFileRevision(before, await handle.stat()))
      throw new Error('Recording changed while opening. Reload the summary.');
    const prefix = async (length: number): Promise<Buffer> => {
      signal.throwIfAborted();
      if (archive) {
        const result = await readArchivePrefix(uri, signal, length);
        memberBytes = result.memberBytes;
        return result.data;
      }
      const bytes = Buffer.alloc(Math.min(length, before.size));
      let offset = 0;
      while (offset < bytes.length) {
        signal.throwIfAborted();
        const { bytesRead } = await handle!.read(bytes, offset, bytes.length - offset, offset);
        if (!bytesRead) throw new Error('Recording ended during the header read.');
        offset += bytesRead;
      }
      return bytes;
    };
    const fixed = await prefix(256);
    const bytes = await prefix(edfHeaderBytes(fixed));
    if (!bytes.subarray(0, 256).equals(fixed))
      throw new Error('Recording header changed during the read. Reload the summary.');
    const header = parseEdfHeader(bytes, signal);
    if (
      (handle && !sameFileRevision(before, await handle.stat())) ||
      !sameFileRevision(before, await io.stat(path))
    )
      throw new Error('Recording source changed during the read. Reload the summary.');
    signal.throwIfAborted();
    return {
      sourceUri: uri,
      archiveSource: archive,
      revision: { size: before.size, modifiedAt: before.mtimeMs },
      identity: { dev: before.dev, ino: before.ino, ctimeMs: before.ctimeMs },
      capturedAt: new Date().toISOString(),
      memberBytes,
      header,
      coverage: 'technical-header-only' as const,
      payloadIntegrity: 'not-checked' as const,
    };
  } finally {
    await handle?.close();
  }
}
