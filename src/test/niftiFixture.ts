import { gzipSync } from 'node:zlib';
/** NIfTI-1 single-file 2×2×2 uint8 volume with a millimetre identity sform. */
export function niftiFixture(): Buffer {
  const data = Buffer.alloc(360);
  data.writeInt32LE(348, 0);
  data.writeInt16LE(3, 40);
  for (const offset of [42, 44, 46]) data.writeInt16LE(2, offset);
  data.writeInt16LE(2, 70);
  data.writeInt16LE(8, 72);
  for (const offset of [76, 80, 84, 88]) data.writeFloatLE(1, offset);
  data.writeFloatLE(352, 108);
  data.writeFloatLE(1, 112);
  data[123] = 2;
  data.writeInt16LE(1, 254);
  for (const offset of [280, 300, 320]) data.writeFloatLE(1, offset);
  data.write('n+1\0', 344, 'ascii');
  for (let i = 0; i < 8; i++) data[352 + i] = i * 20;
  return gzipSync(data);
}
