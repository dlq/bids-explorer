import { inflateSync } from 'node:zlib';

const metadataSize = 8192;

export function squashfsMetadata(
  read: (position: number, length: number) => Promise<Buffer>,
  compressionId: number,
  abort: AbortSignal,
  limit: number,
) {
  let blocks = 0;
  const cache = new Map<number, { data: Buffer; next: number }>();
  return async function take(
    position: { block: number; offset: number },
    length: number,
    end: number,
  ): Promise<Buffer> {
    const result = Buffer.alloc(length);
    let written = 0;
    while (written < length) {
      abort.throwIfAborted();
      let block = cache.get(position.block);
      if (!block) {
        if (++blocks > limit || position.block + 2 > end)
          throw new Error('SquashFS metadata block exceeds page or table bounds.');
        const flags = (await read(position.block, 2)).readUInt16LE(0);
        const size = flags & 0x7fff;
        const next = position.block + 2 + size;
        if (size < 1 || size > metadataSize || next > end)
          throw new Error('Invalid SquashFS metadata block length.');
        const encoded = await read(position.block + 2, size);
        if (!(flags & 0x8000) && compressionId !== 1)
          throw new Error('Compressed SquashFS directory metadata currently requires gzip.');
        const data =
          flags & 0x8000 ? encoded : inflateSync(encoded, { maxOutputLength: metadataSize });
        if (!data.length) throw new Error('Empty SquashFS metadata block.');
        block = { data, next };
        cache.set(position.block, block);
      }
      if (position.offset > block.data.length) throw new Error('Invalid SquashFS metadata offset.');
      const count = Math.min(length - written, block.data.length - position.offset);
      block.data.copy(result, written, position.offset, position.offset + count);
      position.offset += count;
      written += count;
      if (position.offset === block.data.length) {
        position.block = block.next;
        position.offset = 0;
      }
    }
    return result;
  };
}
