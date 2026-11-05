import { basename, posix } from 'node:path';
import { archiveResourceUri, parseArchiveUri, resourcePath } from '../core/archiveUri';
import { indexTar } from './tarIndex';
import { indexZip } from './zipIndex';
import { readTextSnapshot } from './previewText';
import { parseJsonMetadata } from '../core/metadata';
import { parseTable, summaryTableKind } from '../core/tables';
import type { SummaryTablePreview } from '../core/tableTypes';
import { assertArchivePath } from '../core/archive';

/** Exact paths in one physical archive only. Duplicate member names remain ambiguous. */
export async function archiveSiblings(
  uri: string,
  paths: readonly string[],
  signal: AbortSignal,
): Promise<readonly string[]> {
  const ref = parseArchiveUri(uri);
  if (paths.length > 128) throw new Error('Too many archive companion paths.');
  const index = await (ref.format === 'tar' ? indexTar : indexZip)(ref.sourceUri, signal);
  if (
    index.revision.size !== ref.revision.size ||
    index.revision.modifiedAt !== ref.revision.modifiedAt
  )
    throw new Error('Archive changed since listing. Refresh the tree.');
  return paths.map((path) => {
    assertArchivePath(path);
    const matches = index.members.filter((member) => member.resource.memberPath === path);
    if (matches.length !== 1)
      throw Object.assign(
        new Error(
          matches.length
            ? 'Ambiguous duplicate archive companion.'
            : 'Archive companion is absent.',
        ),
        { code: matches.length ? 'AMBIGUOUS' : 'ENOENT' },
      );
    return archiveResourceUri({
      ...ref,
      memberPath: path,
      memberIndex: matches[0].resource.memberIndex,
      revision: index.revision,
    });
  });
}
export async function loadArchiveTable(
  uri: string,
  signal: AbortSignal,
): Promise<SummaryTablePreview> {
  const path = resourcePath(uri);
  const kind = summaryTableKind(basename(path)) ?? 'table';
  const table = await parseTable(
    await readTextSnapshot(uri, signal),
    signal,
    kind === 'participants'
      ? 'participant_id'
      : kind === 'sessions'
        ? 'session_id'
        : kind === 'scans'
          ? 'filename'
          : '',
  );
  let dictionary: SummaryTablePreview['dictionary'];
  let sourceUri = parseArchiveUri(uri).sourceUri;
  try {
    [sourceUri] = await archiveSiblings(
      uri,
      [posix.join(posix.dirname(path), basename(path).replace(/\.tsv$/, '.json'))],
      signal,
    );
    const metadata = await parseJsonMetadata(await readTextSnapshot(sourceUri, signal), signal);
    dictionary = Object.freeze({
      sourceUri,
      status: 'loaded',
      metadata,
      sources: Object.freeze([
        {
          sourceUri,
          revision: metadata.snapshot.revision,
          capturedAt: metadata.snapshot.capturedAt,
        },
      ]),
    });
  } catch (error) {
    signal.throwIfAborted();
    dictionary = Object.freeze({
      sourceUri,
      status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : 'unavailable',
      error: String(error),
    });
  }
  return Object.freeze({ kind, table, dictionary });
}
