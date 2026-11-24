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
