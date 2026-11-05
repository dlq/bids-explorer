import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { crc32 as nativeCrc32 } from 'node:zlib';
import type { ZipIndexIO } from './zipIndex';
import { fromFdPromise, type Entry } from 'yauzl';
import { assertArchivePath } from '../core/archive';
import { parseArchiveUri } from '../core/archiveUri';
import type { SourceRevision } from '../core/sourceRevision';

const nativeIO: ZipIndexIO = {
  stat: lstat,
  open: (path) => open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK),
};
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
/** Native CRC on recent hosts; cooperative chunk-sized fallback for supported older Node hosts. */
export function memberCrc32(
  bytes: Uint8Array,
  previous = 0,
  native: ((bytes: Uint8Array, seed: number) => number) | null = typeof nativeCrc32 === 'function'
    ? nativeCrc32
    : null,
): number {
  if (native) return native(bytes, previous);
  let crc = previous ^ 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export interface MemberReadInfo {
  readonly bytes: number;
  readonly crc32: number;
  readonly revision: SourceRevision;
}

/** Select by ordinal AND exact member name; never extract a path supplied by archive content. */
export async function streamZipMember(
  uri: string,
  signal: AbortSignal,
  maxBytes: number,
  onChunk: (chunk: Buffer) => Promise<void>,
  onStart: (info: MemberReadInfo) => Promise<void> = () => Promise.resolve(),
  io: ZipIndexIO = nativeIO,
): Promise<MemberReadInfo> {
  signal.throwIfAborted();
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 512 * 1024 * 1024)
    throw new Error('Invalid ZIP member read limit.');
  const ref = parseArchiveUri(uri);
  const path = fileURLToPath(ref.sourceUri);
  const before = await io.stat(path);
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error('Archive source must be an ordinary file.');
  if (before.size !== ref.revision.size || before.mtimeMs !== ref.revision.modifiedAt)
    throw new Error('Archive changed since listing. Refresh the BIDS tree.');
  const handle = await io.open(path);
  let result: MemberReadInfo;
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev)
      throw new Error('Archive changed while opening.');
    const zip = await fromFdPromise(handle.fd, {
      autoClose: false,
      lazyEntries: true,
      strictFileNames: true,
      validateEntrySizes: true,
    });
    const iterator = zip.eachEntry();
    let selected: Entry | undefined;
    let ordinal = 0,
      metadataBytes = Buffer.byteLength(zip.comment);
    try {
      if (zip.entryCount > 100000) throw new Error('ZIP exceeds 100,000 entries.');
      for await (const entry of iterator) {
        signal.throwIfAborted();
        metadataBytes +=
          46 + entry.fileNameLength + entry.fileCommentLength + entry.extraFieldLength;
        if (metadataBytes > 16 * 1024 * 1024) throw new Error('ZIP exceeds the metadata budget.');
        assertArchivePath(entry.fileName.replace(/\/$/, ''));
        if (ordinal++ === ref.memberIndex) {
          selected = entry;
          break;
        }
      }
    } finally {
      await iterator.return?.();
    }
    if (!selected || selected.fileName !== ref.memberPath)
      throw new Error('Archive member identity no longer matches its ordinal. Refresh the tree.');
    const type = (selected.externalFileAttributes >>> 16) & 0xf000;
    if (selected.fileName.endsWith('/') || (type !== 0 && type !== 0x8000))
      throw new Error(
        'Only ordinary file members can be read; links and special members are not followed.',
      );
    if (selected.isEncrypted() || ![0, 8].includes(selected.compressionMethod))
      throw new Error('Encrypted or unsupported ZIP member compression.');
    if (
      selected.uncompressedSize > maxBytes ||
      selected.uncompressedSize > Math.max(1, selected.compressedSize) * 1000
    )
      throw new Error('ZIP member exceeds the size or compression-ratio limit.');
    const info = Object.freeze({
      bytes: selected.uncompressedSize,
      crc32: selected.crc32,
      revision: ref.revision,
    });
    await onStart(info);
    signal.throwIfAborted();
    const stream = await zip.openReadStreamPromise(selected);
    const cancel = (): void => {
      stream.destroy(new Error('Archive member read canceled.'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    let bytes = 0,
      crc = 0;
    try {
      signal.throwIfAborted();
      for await (const chunk of stream) {
        signal.throwIfAborted();
        if (!Buffer.isBuffer(chunk)) throw new Error('Invalid ZIP member stream.');
        bytes += chunk.length;
        if (bytes > maxBytes || bytes > info.bytes)
          throw new Error('ZIP member output exceeds its declared size.');
        crc = memberCrc32(chunk, crc);
        await onChunk(chunk);
      }
      if (bytes !== info.bytes || crc !== info.crc32)
        throw new Error('ZIP member size or CRC verification failed.');
    } catch (error) {
      signal.throwIfAborted();
      throw error;
    } finally {
      signal.removeEventListener('abort', cancel);
      stream.destroy();
    }
    const after = await handle.stat(),
      current = await io.stat(path);
    if (
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      after.ctimeMs !== before.ctimeMs ||
      current.ino !== before.ino ||
      current.dev !== before.dev ||
      current.size !== before.size ||
      current.mtimeMs !== before.mtimeMs
    )
      throw new Error('Archive changed during member reading.');
    signal.throwIfAborted();
    result = info;
  } finally {
    await handle.close();
  }
  signal.throwIfAborted();
  return result;
}

export async function readZipMember(
  uri: string,
  signal: AbortSignal,
  maxBytes = 1024 * 1024,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await streamZipMember(uri, signal, maxBytes, (chunk) => {
    chunks.push(chunk);
    return Promise.resolve();
  });
  return Buffer.concat(chunks);
}
