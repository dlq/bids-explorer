import { sameFileRevision } from './fileRevision';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createGunzip } from 'node:zlib';
import type { ArchiveRef } from '../core/archiveUri';
import { assertArchivePath, tarSuffix, type ArchiveMember } from '../core/archive';

const blockSize = 512;
const maxEntries = 100_000;
const maxScanBytes = 2 * 1024 ** 3;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

interface TarMember {
  readonly resource: ArchiveMember['resource'];
  readonly kind: ArchiveMember['kind'];
  readonly bytes: number;
}

function field(header: Buffer, start: number, length: number): Buffer {
  const bytes = header.subarray(start, start + length);
  const end = bytes.indexOf(0);
  return end < 0 ? bytes : bytes.subarray(0, end);
}

function octal(bytes: Buffer): number {
  const value = bytes
    .toString('latin1')
    .replace(/[\0 ]+$/g, '')
    .trimStart();
  if (!/^[0-7]+$/.test(value)) throw new Error('Invalid or unsupported tar numeric field.');
  return Number.parseInt(value, 8);
}

function parseHeader(header: Buffer, sourceUri: string, memberIndex: number): TarMember {
  const expected = octal(header.subarray(148, 156));
  let sum = 0;
  for (let i = 0; i < blockSize; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
  if (sum !== expected) throw new Error('Invalid tar header checksum.');
  if (!header.subarray(257, 265).equals(Buffer.from('ustar\0' + '00')))
    throw new Error('Only POSIX ustar headers are supported.');
  const type = header[156];
  let kind: TarMember['kind'];
  switch (type) {
    case 0:
    case 48:
      kind = 'file';
      break;
    case 53:
      kind = 'directory';
      break;
    case 50:
      kind = 'symlink';
      break;
    case 49: // Hard links and devices are inventoried, never followed.
    case 51:
    case 52:
    case 54:
      kind = 'special';
      break;
    default:
      throw new Error('Unsupported tar member type or extended header.');
  }
  const bytes = octal(header.subarray(124, 136));
  if (kind !== 'file' && bytes !== 0)
    throw new Error('Non-file tar members must have an empty payload.');
  const name = decoder.decode(field(header, 0, 100));
  const prefix = decoder.decode(field(header, 345, 155));
  const memberPath = prefix ? prefix + '/' + name : name;
  assertArchivePath(kind === 'directory' ? memberPath.replace(/\/$/, '') : memberPath);
  return { resource: { sourceUri, memberPath, memberIndex }, kind, bytes };
}

interface TarSelection {
  readonly ref: ArchiveRef;
  readonly maxBytes: number;
  readonly onChunk: (chunk: Buffer) => Promise<void>;
  readonly onStart: (info: { bytes: number }) => Promise<void>;
}

const defaults = { entries: maxEntries, scanBytes: maxScanBytes };

export function indexTar(uri: string, signal: AbortSignal, limits = defaults) {
  return scanTar(uri, signal, limits);
}

/** Revalidate the complete stream before callers publish the selected payload. */
export async function streamTarMember(
  ref: ArchiveRef,
  signal: AbortSignal,
  maxBytes: number,
  onChunk: TarSelection['onChunk'],
  onStart: TarSelection['onStart'] = () => Promise.resolve(),
): Promise<void> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 512 * 1024 ** 2)
    throw new Error('Invalid tar member read limit.');
  await scanTar(ref.sourceUri, signal, defaults, { ref, maxBytes, onChunk, onStart });
}

async function scanTar(
  uri: string,
  signal: AbortSignal,
  limits: typeof defaults,
  selection?: TarSelection,
) {
  signal.throwIfAborted();
  if (
    !Number.isSafeInteger(limits.entries) ||
    limits.entries < 1 ||
    limits.entries > maxEntries ||
    !Number.isSafeInteger(limits.scanBytes) ||
    limits.scanBytes < 2 * blockSize ||
    limits.scanBytes > maxScanBytes
  )
    throw new Error('Invalid tar inventory limits.');

  const path = fileURLToPath(uri);
  const gzip = /\.(?:tar\.gz|tgz)$/i.test(path);
  if (!tarSuffix.test(path)) throw new Error('Choose a .tar, .tar.gz or .tgz file.');
  const sourceUri = pathToFileURL(path).href;
  const before = await lstat(path);
  if (
    selection &&
    (before.size !== selection.ref.revision.size ||
      before.mtimeMs !== selection.ref.revision.modifiedAt)
  )
    throw new Error('Tar changed since listing. Refresh the BIDS tree.');
  if (!before.isFile()) throw new Error('Tar indexing requires an ordinary file.');
  if (!before.size || before.size > limits.scanBytes)
    throw new Error('Tar source is empty or exceeds the scan limit.');
  // lstat is only a candidate snapshot: reject symlinks at open, then compare the
  // opened descriptor (including inode/device/ctime) before reading any bytes.
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    if (!sameFileRevision(before, await handle.stat()))
      throw new Error('Tar source changed while opening.');
    signal.throwIfAborted();
    const input = handle.createReadStream({ autoClose: false, end: before.size - 1 });
    const members: TarMember[] = [];
    let scanFailure: unknown;
    const scan = async (chunks: AsyncIterable<Buffer>): Promise<void> => {
      const header = Buffer.alloc(blockSize);
      let offset = 0;
      let memberIndex = 0;
      let skip = 0;
      let scanned = 0;
      let remaining = 0;
      let found = false;
      let terminators = 0;
      const consume = async (chunk: Buffer) => {
        signal.throwIfAborted();
        scanned += chunk.length;
        if (scanned > limits.scanBytes) throw new Error('Tar exceeds the decoded scan limit.');
        let cursor = 0;
        while (cursor < chunk.length) {
          if (skip) {
            const take = Math.min(skip, chunk.length - cursor);
            if (remaining) {
              const payload = Math.min(take, remaining);
              await selection!.onChunk(chunk.subarray(cursor, cursor + payload));
              remaining -= payload;
            }
            skip -= take;
            cursor += take;
            continue;
          }
          if (terminators === 2) {
            if (chunk.subarray(cursor).some((byte) => byte !== 0))
              throw new Error('Unexpected data after the tar terminator.');
            break;
          }
          const take = Math.min(blockSize - offset, chunk.length - cursor);
          chunk.copy(header, offset, cursor, cursor + take);
          offset += take;
          cursor += take;
          if (offset !== blockSize) continue;
          offset = 0;
          if (header.every((byte) => byte === 0)) {
            terminators++;
            continue;
          }
          if (terminators) throw new Error('Invalid tar terminator.');
          if (memberIndex === limits.entries) throw new Error('Tar exceeds the entry limit.');
          const member = parseHeader(header, sourceUri, memberIndex++);
          skip = Math.ceil(member.bytes / blockSize) * blockSize;
          if (skip > limits.scanBytes) throw new Error('Tar member exceeds the scan limit.');
          if (selection?.ref.memberIndex === member.resource.memberIndex) {
            if (member.kind !== 'file' || member.resource.memberPath !== selection.ref.memberPath)
              throw new Error('Tar member does not match the selected ordinary file.');
            if (member.bytes > selection.maxBytes)
              throw new Error('Tar member exceeds the read limit.');
            await selection.onStart({ bytes: member.bytes });
            remaining = member.bytes;
            found = true;
          }
          if (!selection) members.push(member);
        }
      };
      for await (const chunk of chunks) {
        try {
          await consume(chunk);
        } catch (error) {
          // Closing a pipeline iterator can emit AbortError before the parser error reaches it.
          scanFailure = error;
          throw error;
        }
      }
      if (selection && !found) throw new Error('Selected tar member is absent.');
      if (terminators !== 2) throw new Error('Truncated tar archive or missing terminator.');
    };
    try {
      if (gzip) await pipeline(input, createGunzip(), scan, { signal });
      else await pipeline(input, scan, { signal });
    } catch (error) {
      signal.throwIfAborted();
      throw scanFailure ?? error;
    }
    if (
      !sameFileRevision(before, await handle.stat()) ||
      !sameFileRevision(before, await lstat(path))
    )
      throw new Error('Tar source changed while indexing.');
    signal.throwIfAborted();
    return {
      sourceUri,
      revision: { size: before.size, modifiedAt: before.mtimeMs },
      capturedAt: new Date().toISOString(),
      coverage: 'complete' as const,
      format: gzip ? 'tar.gz' : 'tar',
      members,
    };
  } finally {
    await handle.close();
  }
}
