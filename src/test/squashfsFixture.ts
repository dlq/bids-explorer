import { deflateSync } from 'node:zlib';

export function squashfsSuperblock(): Buffer {
  const header = Buffer.alloc(96);
  header.write('hsqs', 0, 'ascii');
  header.writeUInt32LE(3, 4);
  header.writeUInt32LE(131072, 12);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(17, 22);
  header.writeUInt16LE(3, 24);
  header.writeUInt16LE(4, 28);
  header.writeBigUInt64LE(96n, 40);
  return header;
}

export function records(items: readonly [string, number][]) {
  const group = Buffer.alloc(12);
  group.writeUInt32LE(items.length - 1);
  return Buffer.concat([
    group,
    ...items.flatMap(([name, kind]) => {
      const text = Buffer.from(name);
      const item = Buffer.alloc(8);
      item.writeUInt16LE(40);
      item.writeUInt16LE(kind, 4);
      item.writeUInt16LE(text.length - 1, 6);
      return [item, text];
    }),
  ]);
}

export function image(
  directory = records([
    ['anat', 1],
    ['link', 3],
    ['scan.nii', 2],
    ['device', 4],
  ]),
  options: {
    child?: Buffer;
    gzip?: boolean;
    split?: number;
    header?: (header: Buffer) => void;
    inode?: (inode: Buffer) => void;
    directoryBlock?: (block: Buffer) => void;
  } = {},
) {
  function metadata(data: Buffer, compress = false) {
    const payload = compress ? deflateSync(data) : data;
    const size = Buffer.alloc(2);
    size.writeUInt16LE(payload.length | (compress ? 0 : 0x8000));
    return Buffer.concat([size, payload]);
  }
  const parts: Buffer[] = [];
  const stride = options.split ?? directory.length;
  for (let offset = 0; offset < directory.length; offset += stride)
    parts.push(metadata(directory.subarray(offset, offset + stride), options.gzip));
  const children = Buffer.concat(parts);
  options.directoryBlock?.(children);
  const inode = Buffer.alloc(72);
  inode.writeUInt16LE(8);
  inode.writeUInt32LE(directory.length + 3, 20);
  inode.writeUInt16LE(1, 40);
  inode.writeUInt32LE(children.length, 56);
  const child = options.child ?? records([['T1w.nii', 2]]);
  inode.writeUInt16LE(child.length + 3, 64);
  options.inode?.(inode);
  const inodes = metadata(inode);
  const payload = Buffer.concat([inodes, children, metadata(child)]);
  const header = squashfsSuperblock();
  header.writeBigUInt64LE(BigInt(96 + payload.length), 40);
  header.writeBigUInt64LE(96n, 64);
  header.writeBigUInt64LE(BigInt(96 + inodes.length), 72);
  options.header?.(header);
  return Buffer.concat([header, payload]);
}

/** One regular file, optionally stored in a fragment or in a compressed data block. */
export function squashfsFile(
  name: string,
  bytes: Buffer,
  options: {
    long?: boolean;
    fragment?: boolean;
    gzip?: boolean;
    sparse?: boolean;
    corrupt?:
      'inode' | 'location' | 'size' | 'fragment-table' | 'fragment-metadata' | 'fragment-offset';
    compressionId?: number;
  } = {},
): Buffer {
  const stored = options.fragment ? Buffer.concat([Buffer.from('pad'), bytes]) : bytes;
  const data = options.gzip ? deflateSync(stored) : stored;
  const flag = data.length + (options.gzip ? 0 : 1 << 24);
  function metadata(content: Buffer) {
    const block = Buffer.alloc(2);
    block.writeUInt16LE(0x8000 | content.length);
    return Buffer.concat([block, content]);
  }
  const directory = records([[name, 2]]);
  const inode = Buffer.alloc(40 + (options.long ? 56 : 32) + 4);
  inode.writeUInt16LE(8);
  inode.writeUInt32LE(directory.length + 3, 20);
  inode.writeUInt16LE(options.corrupt === 'inode' ? 3 : options.long ? 9 : 2, 40);
  const base = inode.subarray(56);
  const location = options.corrupt === 'location' ? 0 : 96;
  if (options.long) {
    base.writeBigUInt64LE(BigInt(location), 0);
    base.writeBigUInt64LE(BigInt(bytes.length), 8);
  } else {
    base.writeUInt32LE(location, 0);
    base.writeUInt32LE(bytes.length, 12);
  }
  base.writeUInt32LE(options.fragment ? 0 : 0xffffffff, options.long ? 28 : 4);
  base.writeUInt32LE(options.corrupt === 'fragment-offset' ? 8192 : 3, options.long ? 32 : 8);
  base.writeUInt32LE(
    options.sparse ? 0 : options.corrupt === 'size' ? flag - 1 : flag,
    options.long ? 40 : 16,
  );
  const inodes = metadata(inode);
  const listing = metadata(directory);
  const inodeTable = 96 + data.length;
  const directoryTable = inodeTable + inodes.length;
  const fragmentBlock = Buffer.alloc(16);
  fragmentBlock.writeBigUInt64LE(96n);
  fragmentBlock.writeUInt32LE(flag, 8);
  const fragmentMetadata = metadata(fragmentBlock);
  const fragmentTable = Buffer.alloc(8);
  fragmentTable.writeBigUInt64LE(
    BigInt(options.corrupt === 'fragment-metadata' ? 0 : directoryTable + listing.length),
  );
  const fragments = options.fragment
    ? Buffer.concat([fragmentMetadata, fragmentTable])
    : Buffer.alloc(0);
  const header = squashfsSuperblock();
  header.writeUInt16LE(options.compressionId ?? 1, 20);
  header.writeUInt32LE(options.fragment ? 1 : 0, 16);
  header.writeBigUInt64LE(BigInt(directoryTable + listing.length + fragments.length), 40);
  header.writeBigUInt64LE(BigInt(inodeTable), 64);
  header.writeBigUInt64LE(BigInt(directoryTable), 72);
  header.writeBigUInt64LE(
    BigInt(
      options.corrupt === 'fragment-table'
        ? 0
        : directoryTable + listing.length + fragmentMetadata.length,
    ),
    80,
  );
  return Buffer.concat([header, data, inodes, listing, fragments]);
}

export function squashfsFiles(files: readonly { name: string; text: string }[]): Buffer {
  const listing = records(files.map(({ name }) => [name, 2]));
  const inodes = Buffer.alloc(40 + files.length * 36);
  inodes.writeUInt16LE(8);
  inodes.writeUInt32LE(listing.length + 3, 20);
  let dirOffset = 12;
  let dataOffset = 96;
  const payload = files.map(({ name, text }, i) => {
    const data = Buffer.from(text);
    const offset = 40 + i * 36;
    listing.writeUInt16LE(offset, dirOffset);
    dirOffset += 8 + Buffer.byteLength(name);
    inodes.writeUInt16LE(2, offset);
    inodes.writeUInt32LE(dataOffset, offset + 16);
    inodes.writeUInt32LE(0xffffffff, offset + 20);
    inodes.writeUInt32LE(data.length, offset + 28);
    inodes.writeUInt32LE((1 << 24) | data.length, offset + 32);
    dataOffset += data.length;
    return data;
  });
  function metadata(data: Buffer) {
    const header = Buffer.alloc(2);
    header.writeUInt16LE(0x8000 | data.length);
    return Buffer.concat([header, data]);
  }
  const inodeBlock = metadata(inodes);
  const directory = metadata(listing);
  const header = squashfsSuperblock();
  header.writeBigUInt64LE(BigInt(dataOffset), 64);
  header.writeBigUInt64LE(BigInt(dataOffset + inodeBlock.length), 72);
  header.writeBigUInt64LE(BigInt(dataOffset + inodeBlock.length + directory.length), 40);
  return Buffer.concat([header, ...payload, inodeBlock, directory]);
}
