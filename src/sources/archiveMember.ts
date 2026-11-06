import type { ArchiveRef } from '../core/archiveUri';
import { streamSquashfsMember } from './squashfsMember';
import { streamTarMember } from './tarIndex';
import { streamZipMember } from './zipMember';

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
