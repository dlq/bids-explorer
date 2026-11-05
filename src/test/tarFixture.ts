/** Small independent ustar writer for tests. */
export function tarRecord(
  name: string,
  payload: Buffer = Buffer.alloc(0),
  options: { type?: number; prefix?: string; size?: string; magic?: string } = {},
): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644', 100);
  header.write(options.size ?? payload.length.toString(8).padStart(11, '0'), 124, 12);
  header.fill(32, 148, 156);
  header[156] = options.type ?? 48;
  header.write(options.magic ?? 'ustar\x0000', 257, 8);
  if (options.prefix) header.write(options.prefix, 345, 155);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
  return Buffer.concat([header, payload, Buffer.alloc((512 - (payload.length % 512)) % 512)]);
}

export function tarFixture(...records: Buffer[]): Buffer {
  return Buffer.concat([...records, Buffer.alloc(1024)]);
}
