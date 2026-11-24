import { parseArchiveUri, type ArchiveRef } from '../core/archiveUri';
import { streamSquashfsMember, streamSquashfsMemberPrefix } from './squashfsMember';
import { streamTarMember, streamTarMemberPrefix } from './tarIndex';
import { streamZipMember, streamZipMemberPrefix } from './zipMember';

/** Route a parsed member reference to the format reader that verifies its payload. */
export async function streamArchiveMember(
  uri: string,
  ref: ArchiveRef,
  signal: AbortSignal,
  limit: number,
  write: (chunk: Buffer) => Promise<void>,
  start: (member: { bytes: number; crc32?: number }) => Promise<void> = () => Promise.resolve(),
): Promise<void> {
  if (ref.format === 'tar') return streamTarMember(ref, signal, limit, write, start);
  if (ref.format === 'squashfs') return streamSquashfsMember(ref, signal, limit, write, start);
  await streamZipMember(uri, signal, limit, write, start);
}

/** Header-only read: source/member identity is checked; unread payload/CRC is NOT verified. */
export async function readArchivePrefix(
  uri: string,
  signal: AbortSignal,
  length: number,
): Promise<{ data: Buffer; memberBytes: number }> {
  if (!Number.isSafeInteger(length) || length < 1 || length > 262400)
    throw new Error('Invalid recording header prefix length.');
  const ref = parseArchiveUri(uri);
  const chunks: Buffer[] = [];
  let memberBytes = 0;
  const write = (chunk: Buffer) => {
    chunks.push(chunk);
    return Promise.resolve();
  };
  const start = ({ bytes }: { bytes: number }) => {
    memberBytes = bytes;
    return Promise.resolve();
  };
  if (ref.format === 'tar') await streamTarMemberPrefix(ref, signal, length, write, start);
  else if (ref.format === 'squashfs')
    await streamSquashfsMemberPrefix(ref, signal, length, write, start);
  else await streamZipMemberPrefix(uri, signal, length, write, start);
  return { data: Buffer.concat(chunks), memberBytes };
}

/** Bounded sequential window; no whole-payload integrity claim or extraction cache. */
export async function readArchiveRange(
  uri: string,
  signal: AbortSignal,
  offset: number,
  length: number,
): Promise<Buffer> {
  const end = offset + length;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(length) ||
    length < 1 ||
    !Number.isSafeInteger(end) ||
    end > 16 * 1024 ** 2
  )
    throw new Error('Archive signal window exceeds the 16 MiB prefix-scan budget.');
  const ref = parseArchiveUri(uri);
  const chunks: Buffer[] = [];
  let seen = 0;
  const write = (chunk: Buffer) => {
    const from = Math.min(chunk.length, Math.max(0, offset - seen));
    seen += chunk.length;
    if (from < chunk.length) chunks.push(chunk.subarray(from));
    return Promise.resolve();
  };
  const start = () => Promise.resolve();
  if (ref.format === 'tar') await streamTarMemberPrefix(ref, signal, end, write, start);
  else if (ref.format === 'squashfs')
    await streamSquashfsMemberPrefix(ref, signal, end, write, start);
  else await streamZipMemberPrefix(uri, signal, end, write, start);
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== length) throw new Error('Truncated archive signal window.');
  return bytes;
}
