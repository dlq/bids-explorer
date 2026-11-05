import { fileURLToPath } from 'node:url';
import { assertArchivePath } from './archive';
import type { DirectoryEntry } from './directory';
import type { SourceRevision } from './sourceRevision';

export function isArchiveUri(uri: string): boolean {
  return /^bids-(zip|tar):/.test(uri);
}

export interface ArchiveRef {
  readonly format?: 'tar';
  readonly sourceUri: string;
  readonly memberPath: string;
  readonly memberIndex: number;
  readonly revision: SourceRevision;
}
export function archiveResourceUri(ref: ArchiveRef): string {
  assertArchivePath(ref.memberPath);
  const uri = new URL(ref.format === 'tar' ? 'bids-tar://member/' : 'bids-zip://member/');
  uri.pathname = '/' + ref.memberPath.split('/').map(encodeURIComponent).join('/');
  // One URL-safe token survives VS Code's escaping of query separators.
  uri.search = Buffer.from(
    JSON.stringify([ref.sourceUri, ref.memberIndex, ref.revision.size, ref.revision.modifiedAt]),
  ).toString('base64url');
  return uri.href;
}
export function parseArchiveUri(value: string): ArchiveRef {
  if (value.length > 32768) throw new Error('Archive resource URI is too long.');
  const uri = new URL(value);
  if (
    !isArchiveUri(uri.protocol) ||
    uri.host !== 'member' ||
    uri.username ||
    uri.password ||
    uri.hash
  )
    throw new Error('Invalid archive resource URI.');
  const token = uri.search.slice(1);
  if (!/^[a-zA-Z0-9_-]+$/.test(token)) throw new Error('Invalid archive reference token.');
  const encoded = Buffer.from(token, 'base64url');
  if (encoded.toString('base64url') !== token)
    throw new Error('Noncanonical archive reference token.');
  const fields: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(encoded));
  if (
    !Array.isArray(fields) ||
    fields.length !== 4 ||
    typeof fields[0] !== 'string' ||
    fields.slice(1).some((value: unknown) => typeof value !== 'number')
  )
    throw new Error('Archive resource requires source, ordinal and revision fields.');
  const [sourceUri, memberIndex, size, modifiedAt] = fields as [string, number, number, number];
  fileURLToPath(sourceUri);
  const memberPath = decodeURIComponent(uri.pathname.slice(1));
  assertArchivePath(memberPath);
  if (
    !Number.isSafeInteger(memberIndex) ||
    memberIndex < 0 ||
    memberIndex >= 100000 ||
    !Number.isSafeInteger(size) ||
    size < 0 ||
    !Number.isFinite(modifiedAt)
  )
    throw new Error('Invalid archive ordinal or source revision.');
  return Object.freeze({
    ...(uri.protocol === 'bids-tar:' ? { format: 'tar' as const } : {}),
    sourceUri,
    memberPath,
    memberIndex,
    revision: Object.freeze({ size, modifiedAt }),
  });
}
export function entryArchiveUri(entry: DirectoryEntry): string {
  const ref = entry.archive;
  if (!ref || ref.memberIndex === undefined || !ref.revision || entry.kind !== 'file')
    throw new Error('Choose an indexed ordinary archive member.');
  return archiveResourceUri({ ...ref, memberIndex: ref.memberIndex, revision: ref.revision });
}
export function resourcePath(uri: string): string {
  return isArchiveUri(uri) ? parseArchiveUri(uri).memberPath : fileURLToPath(uri);
}

/** Human-readable provenance only; resource identity remains the structured URI. */
export function resourceLabel(uri: string): string {
  if (!isArchiveUri(uri)) return uri;
  const ref = parseArchiveUri(uri);
  return `${ref.sourceUri} :: ${ref.memberPath} (member ${ref.memberIndex})`;
}
