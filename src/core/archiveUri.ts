import { createHmac, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertArchivePath } from './archive';
import type { DirectoryEntry } from './directory';
import type { SourceRevision } from './sourceRevision';

// Inode addresses come from a directory listing on this host. Do not accept
// a caller-supplied inode address as evidence for an arbitrary member path.
const squashfsKey = randomBytes(32);
function squashfsSignature(path: string, token: string): string {
  return createHmac('sha256', squashfsKey)
    .update(JSON.stringify([path, token]))
    .digest('base64url');
}

export function isArchiveUri(uri: string): boolean {
  return /^bids-(zip|tar|squashfs):/.test(uri);
}

export interface ArchiveRef {
  readonly format?: 'tar' | 'squashfs';
  readonly sourceUri: string;
  readonly memberPath: string;
  readonly memberIndex: number;
  readonly parentIndex?: number;
  readonly revision: SourceRevision;
}
export function archiveResourceUri(ref: ArchiveRef): string {
  assertArchivePath(ref.memberPath);
  const uri = new URL(`bids-${ref.format ?? 'zip'}://member/`);
  uri.pathname = '/' + ref.memberPath.split('/').map(encodeURIComponent).join('/');
  // One URL-safe token survives VS Code's escaping of query separators.
  const token = Buffer.from(
    JSON.stringify([
      ref.sourceUri,
      ref.memberIndex,
      ref.revision.size,
      ref.revision.modifiedAt,
      ...(ref.parentIndex === undefined ? [] : [ref.parentIndex]),
    ]),
  ).toString('base64url');
  uri.search =
    ref.format === 'squashfs' ? token + '.' + squashfsSignature(ref.memberPath, token) : token;
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
  const memberPath = decodeURIComponent(uri.pathname.slice(1));
  assertArchivePath(memberPath);
  let token = uri.search.slice(1);
  if (uri.protocol === 'bids-squashfs:') {
    const dot = token.indexOf('.');
    if (dot < 0 || token.slice(dot + 1) !== squashfsSignature(memberPath, token.slice(0, dot)))
      throw new Error('SquashFS member reference is invalid or expired. Reopen it from the tree.');
    token = token.slice(0, dot);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(token)) throw new Error('Invalid archive reference token.');
  const encoded = Buffer.from(token, 'base64url');
  if (encoded.toString('base64url') !== token)
    throw new Error('Noncanonical archive reference token.');
  const fields: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(encoded));
  if (
    !Array.isArray(fields) ||
    (fields.length !== 4 && !(uri.protocol === 'bids-squashfs:' && fields.length === 5)) ||
    typeof fields[0] !== 'string' ||
    fields.slice(1).some((value: unknown) => typeof value !== 'number')
  )
    throw new Error('Archive resource requires source, ordinal and revision fields.');
  const [sourceUri, memberIndex, size, modifiedAt, parentIndex] = fields as [
    string,
    number,
    number,
    number,
    number?,
  ];
  fileURLToPath(sourceUri);
  if (
    !Number.isSafeInteger(memberIndex) ||
    memberIndex < 0 ||
    memberIndex >= (uri.protocol === 'bids-squashfs:' ? 2 ** 48 : 100000) ||
    (parentIndex !== undefined &&
      (!Number.isSafeInteger(parentIndex) || parentIndex < 0 || parentIndex >= 2 ** 48)) ||
    !Number.isSafeInteger(size) ||
    size < 0 ||
    !Number.isFinite(modifiedAt)
  )
    throw new Error('Invalid archive ordinal or source revision.');
  return Object.freeze({
    ...(uri.protocol === 'bids-tar:' ? { format: 'tar' as const } : {}),
    ...(uri.protocol === 'bids-squashfs:' ? { format: 'squashfs' as const } : {}),
    sourceUri,
    memberPath,
    memberIndex,
    ...(parentIndex === undefined ? {} : { parentIndex }),
    revision: Object.freeze({ size, modifiedAt }),
  });
}
export function entryArchiveUri(entry: DirectoryEntry): string {
  const ref = entry.archive;
  if (!ref || ref.memberIndex === undefined || !ref.revision || entry.kind !== 'file')
    throw new Error('Choose an indexed ordinary archive member.');
  return archiveResourceUri({
    ...ref,
    memberIndex: ref.memberIndex,
    revision: ref.revision,
  });
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
