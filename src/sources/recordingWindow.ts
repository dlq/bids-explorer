import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { decodeEdfWindow, planEdfWindow } from '../core/edfWindow';
import { readArchiveRange } from './archiveMember';
import { sameFileRevision } from './fileRevision';
import type { loadRecordingHeader, RecordingHeaderIO } from './recordingHeader';

const nativeIO: RecordingHeaderIO = {
  stat: lstat,
  open: (path) => open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK),
};

/** Only source-bound, bounded calibrated traces are returned to the client; no recording cache. */
export async function loadRecordingWindow(
  snapshot: Awaited<ReturnType<typeof loadRecordingHeader>>,
  request: unknown,
  signal: AbortSignal,
  io: RecordingHeaderIO = nativeIO,
) {
  signal.throwIfAborted();
  const plan = planEdfWindow(snapshot.header, request);
  if (plan.offset + plan.bytes > snapshot.memberBytes)
    throw new Error('Truncated recording window: the declared records exceed the source size.');
  const path = fileURLToPath(snapshot.archiveSource?.sourceUri ?? snapshot.sourceUri);
  const before = await io.stat(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.size !== snapshot.revision.size ||
    before.mtimeMs !== snapshot.revision.modifiedAt ||
    before.dev !== snapshot.identity.dev ||
    before.ino !== snapshot.identity.ino ||
    before.ctimeMs !== snapshot.identity.ctimeMs
  )
    throw new Error('Recording changed since the summary. Reload it before loading samples.');
  const handle = snapshot.archiveSource ? undefined : await io.open(path);
  try {
    if (handle && !sameFileRevision(before, await handle.stat()))
      throw new Error('Recording changed while opening the signal window.');
    let data: Buffer;
    if (snapshot.archiveSource)
      data = await readArchiveRange(snapshot.sourceUri, signal, plan.offset, plan.bytes);
    else {
      data = Buffer.alloc(plan.bytes);
      let offset = 0;
      while (offset < data.length) {
        signal.throwIfAborted();
        const { bytesRead } = await handle!.read(
          data,
          offset,
          Math.min(65536, data.length - offset),
          plan.offset + offset,
        );
        if (!bytesRead) throw new Error('Truncated recording window.');
        offset += bytesRead;
      }
    }
    if (
      (handle && !sameFileRevision(before, await handle.stat())) ||
      !sameFileRevision(before, await io.stat(path))
    )
      throw new Error('Recording changed while reading the signal window.');
    return await decodeEdfWindow(snapshot.header, plan, data, signal);
  } finally {
    await handle?.close();
  }
}
