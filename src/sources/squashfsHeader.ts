import { sameFileRevision, type RevisionStat } from './fileRevision';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const headerBytes = 96;
const compressors = ['unknown', 'gzip', 'lzma', 'lzo', 'xz', 'lz4', 'zstd'];

export function parseSquashfsHeader(header: Buffer, sourceBytes: number) {
  if (header.length !== headerBytes || header.readUInt32LE(0) !== 0x73717368)
    throw new Error('Expected a complete little-endian SquashFS superblock.');
  if (header.readUInt16LE(28) !== 4 || header.readUInt16LE(30) !== 0)
    throw new Error('Only SquashFS 4.0 superblocks are supported.');
  const blockSize = header.readUInt32LE(12);
  const blockLog = header.readUInt16LE(22);
  const inodeCount = header.readUInt32LE(4);
  const bytesUsed = header.readBigUInt64LE(40);
  if (
    blockLog < 12 ||
    blockLog > 20 ||
    blockSize !== 2 ** blockLog ||
    inodeCount === 0 ||
    bytesUsed < BigInt(headerBytes) ||
    bytesUsed > BigInt(sourceBytes)
  )
    throw new Error('SquashFS superblock declares inconsistent size or inode information.');
  const compressionId = header.readUInt16LE(20);
  const flags = header.readUInt16LE(24);
  return {
    version: '4.0',
    inodeCount,
    fragmentCount: header.readUInt32LE(16),
    blockSize,
    compressionId,
    compression: compressors[compressionId] ?? 'unknown',
    bytesUsed: Number(bytesUsed),
    uncompressedMetadata: (flags & 1) !== 0,
    uncompressedData: (flags & 2) !== 0,
  };
}

const nativeIO = {
  stat: lstat,
  open: (path: string) =>
    open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK),
};
type HeaderIO = {
  stat: (path: string) => Promise<RevisionStat>;
  open: (path: string) => Promise<{
    stat: () => Promise<RevisionStat>;
    read: (
      buffer: Buffer,
      offset: number,
      length: number,
      position: number,
    ) => Promise<{ bytesRead: number }>;
    close: () => Promise<void>;
  }>;
};

export async function withSquashfs<T>(
  uri: string,
  signal: AbortSignal,
  action: (
    header: Buffer,
    read: (position: number, length: number) => Promise<Buffer>,
    stat: RevisionStat,
  ) => Promise<T> | T,
  io: HeaderIO = nativeIO,
): Promise<T> {
  signal.throwIfAborted();
  const path = fileURLToPath(uri);
  const before = await io.stat(path);
  if (!before.isFile() || !Number.isSafeInteger(before.size) || before.size < headerBytes)
    throw new Error('Choose an ordinary SquashFS image with a complete superblock.');
  const handle = await io.open(path);
  try {
    if (!sameFileRevision(before, await handle.stat()))
      throw new Error('SquashFS source changed while opening.');
    const read = async (position: number, length: number) => {
      const buffer = Buffer.alloc(length);
      let offset = 0;
      while (offset < length) {
        signal.throwIfAborted();
        const { bytesRead } = await handle.read(buffer, offset, length - offset, position + offset);
        if (!bytesRead) throw new Error('Truncated SquashFS read.');
        offset += bytesRead;
      }
      return buffer;
    };
    const result = await action(await read(0, headerBytes), read, before);
    if (
      !sameFileRevision(before, await handle.stat()) ||
      !sameFileRevision(before, await io.stat(path))
    )
      throw new Error('SquashFS source changed while reading.');
    signal.throwIfAborted();
    return result;
  } finally {
    await handle.close();
  }
}

/** A fixed-size positional read. Never loads an inode table or calls an external tool. */
export function inspectSquashfs(uri: string, signal: AbortSignal, io: HeaderIO = nativeIO) {
  return withSquashfs(
    uri,
    signal,
    (header, _, stat) => ({
      sourceUri: pathToFileURL(fileURLToPath(uri)).href,
      revision: { size: stat.size, modifiedAt: stat.mtimeMs },
      coverage: 'superblock-only',
      superblock: parseSquashfsHeader(header, stat.size),
    }),
    io,
  );
}
