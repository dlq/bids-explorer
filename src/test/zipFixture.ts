import { crc32 as nativeCrc32, deflateRawSync } from 'node:zlib';

// Independent bit-at-a-time writer fallback keeps fixtures usable in older VS Code Node hosts.
function fixtureCrc32(bytes: Buffer): number {
  if (typeof nativeCrc32 === 'function') return nativeCrc32(bytes);
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}

export interface ZipFixtureEntry {
  name: string;
  text?: string;
  bytes?: Buffer;
  type?: number;
  flags?: number;
  method?: number;
  comment?: string;
}
/** Tiny independent ZIP writer for fixtures; emits local headers, payloads and central records. */
export function zipFixture(entries: readonly ZipFixtureEntry[], comment = ''): Buffer {
  const locals: Buffer[] = [],
    records: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const raw = entry.bytes ?? Buffer.from(entry.text ?? '');
    const method = entry.method ?? 0;
    const compressed = method === 8 ? deflateRawSync(raw) : raw;
    const data =
      (entry.flags ?? 0) & 1 ? Buffer.concat([Buffer.alloc(12), compressed]) : compressed;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.flags ?? 0x800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(fixtureCrc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50);
    record.writeUInt16LE(0x314, 4);
    record.writeUInt16LE(20, 6);
    local.copy(record, 8, 6, 26);
    record.writeUInt16LE(name.length, 28);
    const note = Buffer.from(entry.comment ?? '');
    record.writeUInt16LE(note.length, 32);
    record.writeUInt32LE(((entry.type ?? 0x8000) * 65536) >>> 0, 38);
    record.writeUInt32LE(offset, 42);
    records.push(record, name, note);
    offset += local.length + name.length + data.length;
  }
  const central = Buffer.concat(records);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(Buffer.byteLength(comment), 20);
  return Buffer.concat([...locals, central, end, Buffer.from(comment)]);
}
