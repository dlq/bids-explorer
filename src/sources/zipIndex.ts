import { sameFileRevision } from './fileRevision';
import { constants } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fromFdPromise } from 'yauzl';
import { assertArchivePath, type ArchiveIndex, type ArchiveMember } from '../core/archive';

export interface ZipIndexLimits {
  readonly entries: number;
  readonly metadataBytes: number;
}
const defaults: ZipIndexLimits = { entries: 100_000, metadataBytes: 16 * 1024 * 1024 };

export interface ZipIndexIO {
  readonly stat: (path: string) => Promise<import('node:fs').Stats>;
  readonly open: (path: string) => Promise<Pick<FileHandle, 'fd' | 'stat' | 'close'>>;
}
const nativeIO: ZipIndexIO = {
  stat: lstat,
  open: (path) => open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK),
};

/** Indexes only central-directory records on the workspace host. No member streams, decompression or extraction. */
export async function indexZip(
  uri: string,
  signal: AbortSignal,
  limits: ZipIndexLimits = defaults,
  io: ZipIndexIO = nativeIO,
): Promise<ArchiveIndex> {
  signal.throwIfAborted();
  if (
    !Number.isSafeInteger(limits.entries) ||
    limits.entries < 1 ||
    limits.entries > defaults.entries ||
    !Number.isSafeInteger(limits.metadataBytes) ||
    limits.metadataBytes < 1 ||
    limits.metadataBytes > defaults.metadataBytes
  )
    throw new Error('ZIP limits must be positive integers within the supported maximums.');
  const path = fileURLToPath(uri);
  const before = await io.stat(path);
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error('ZIP indexing requires an ordinary file; symbolic links are not followed.');
  const handle = await io.open(path);
  try {
    if (!sameFileRevision(before, await handle.stat()))
      throw new Error('ZIP source changed while opening.');
    signal.throwIfAborted();
    // autoClose false leaves sole fd ownership with FileHandle, including failure/cancellation.
    const zip = await fromFdPromise(handle.fd, {
      autoClose: false,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
    const members: ArchiveMember[] = [];
    let metadataBytes = Buffer.byteLength(zip.comment);
    const iterator = zip.eachEntry();
    try {
      if (metadataBytes > limits.metadataBytes) throw new Error('ZIP exceeds the metadata limit.');
      if (zip.entryCount > limits.entries) throw new Error('ZIP exceeds the entry limit.');
      for await (const entry of iterator) {
        signal.throwIfAborted();
        metadataBytes +=
          46 + entry.fileNameLength + entry.fileCommentLength + entry.extraFieldLength;
        if (metadataBytes > limits.metadataBytes)
          throw new Error('ZIP exceeds the metadata limit.');
        assertArchivePath(entry.fileName.replace(/\/$/, ''));
        const unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
        const kind =
          unixType === 0xa000
            ? 'symlink'
            : unixType !== 0 && unixType !== 0x8000 && unixType !== 0x4000
              ? 'special'
              : entry.fileName.endsWith('/') || unixType === 0x4000
                ? 'directory'
                : 'file';
        members.push(
          Object.freeze({
            resource: Object.freeze({
              sourceUri: pathToFileURL(path).toString(),
              memberPath: entry.fileName,
              memberIndex: members.length,
            }),
            kind,
            bytes: entry.uncompressedSize,
            compressedBytes: entry.compressedSize,
            compressionMethod: entry.compressionMethod,
            encrypted: entry.isEncrypted(),
          }),
        );
      }
      signal.throwIfAborted();
      const after = await handle.stat();
      const current = await io.stat(path);
      if (!sameFileRevision(before, after) || !sameFileRevision(before, current))
        throw new Error('ZIP source changed while indexing.');
      return Object.freeze({
        sourceUri: pathToFileURL(path).toString(),
        revision: Object.freeze({ size: before.size, modifiedAt: before.mtimeMs }),
        capturedAt: new Date().toISOString(),
        coverage: 'complete',
        members: Object.freeze(members),
      });
    } finally {
      await iterator.return?.();
    }
  } finally {
    await handle.close();
  }
}
