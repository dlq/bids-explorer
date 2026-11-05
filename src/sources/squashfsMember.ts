import { inflateSync } from 'node:zlib';
import type { ArchiveRef } from '../core/archiveUri';
import { parseSquashfsHeader, withSquashfs } from './squashfsHeader';
import { squashfsMetadata } from './squashfsMetadata';

const noFragment = 0xffffffff;
const uncompressed = 1 << 24;

/** Read the selected regular inode and its data blocks without walking other members. */
export function streamSquashfsMember(
  ref: ArchiveRef,
  signal: AbortSignal,
  limit: number,
  write: (chunk: Buffer) => Promise<void>,
  start: (header: { bytes: number }) => Promise<void>,
): Promise<void> {
  return withSquashfs(ref.sourceUri, signal, async (header, read, stat) => {
    if (stat.size !== ref.revision.size || stat.mtimeMs !== ref.revision.modifiedAt)
      throw new Error('SquashFS image changed. Refresh the tree before opening the member.');
    const info = parseSquashfsHeader(header, stat.size);
    const inodeTable = Number(header.readBigUInt64LE(64));
    const directoryTable = Number(header.readBigUInt64LE(72));
    const pos = {
      block: inodeTable + Math.floor(ref.memberIndex / 65536),
      offset: ref.memberIndex % 65536,
    };
    if (inodeTable < 96 || pos.block >= directoryTable || directoryTable > info.bytesUsed)
      throw new Error('Invalid SquashFS member inode location.');
    const take = squashfsMetadata(read, info.compressionId, signal, 256);
    const type = (await take(pos, 16, directoryTable)).readUInt16LE(0);
    if (type !== 2 && type !== 9) throw new Error('SquashFS member is not an ordinary file.');
    const long = type === 9;
    const inode = await take(pos, long ? 40 : 16, directoryTable);
    let data = long ? Number(inode.readBigUInt64LE(0)) : inode.readUInt32LE(0);
    const bytes = long ? Number(inode.readBigUInt64LE(8)) : inode.readUInt32LE(12);
    const fragment = inode.readUInt32LE(long ? 28 : 4);
    const tailOffset = inode.readUInt32LE(long ? 32 : 8);
    if (!Number.isSafeInteger(bytes) || bytes > limit)
      throw new Error('SquashFS member exceeds the read size limit.');
    await start({ bytes });

    async function block(position: number, flags: number): Promise<Buffer> {
      const length = flags & (uncompressed - 1);
      if (
        !length ||
        flags >= 2 * uncompressed ||
        length > info.blockSize ||
        position < 96 ||
        position + length > inodeTable
      )
        throw new Error('Invalid SquashFS data block bounds.');
      const encoded = await read(position, length);
      if (flags & uncompressed) return encoded;
      if (info.compressionId !== 1)
        throw new Error('Compressed SquashFS file data currently requires gzip.');
      return inflateSync(encoded, { maxOutputLength: info.blockSize });
    }

    const tail = bytes % info.blockSize;
    const blocks =
      fragment === noFragment
        ? Math.ceil(bytes / info.blockSize)
        : Math.floor(bytes / info.blockSize);
    const sizes = await take(pos, blocks * 4, directoryTable);
    for (let i = 0; i < blocks; i++) {
      signal.throwIfAborted();
      const flags = sizes.readUInt32LE(i * 4);
      const expected = Math.min(info.blockSize, bytes - i * info.blockSize);
      const chunk = flags ? await block(data, flags) : Buffer.alloc(expected);
      if (chunk.length !== expected) throw new Error('Invalid SquashFS data block length.');
      await write(chunk);
      data += flags & (uncompressed - 1);
    }

    if (fragment !== noFragment && tail) {
      const table = Number(header.readBigUInt64LE(80));
      const pointer = table + Math.floor(fragment / 512) * 8;
      if (fragment >= info.fragmentCount || table < directoryTable || pointer + 8 > info.bytesUsed)
        throw new Error('Invalid SquashFS fragment table location.');
      const metadata = Number((await read(pointer, 8)).readBigUInt64LE(0));
      if (metadata < directoryTable || metadata >= table)
        throw new Error('Invalid SquashFS fragment metadata location.');
      const entry = await take({ block: metadata, offset: (fragment % 512) * 16 }, 16, table);
      const chunk = await block(Number(entry.readBigUInt64LE(0)), entry.readUInt32LE(8));
      if (tailOffset + tail > chunk.length) throw new Error('Invalid SquashFS fragment length.');
      await write(chunk.subarray(tailOffset, tailOffset + tail));
    }
  });
}
