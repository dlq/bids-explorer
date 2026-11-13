import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isArchiveUri, parseArchiveUri } from '../core/archiveUri';
import { repeated, TableRecords, TableSizeError } from '../core/tables';
import type {
  ParticipantTablePage,
  SummaryTablePreview,
  TableRow,
  TableSnapshot,
} from '../core/tableTypes';
import { streamArchiveMember } from './archiveMember';
import { loadArchiveTableDictionary } from './archiveMetadata';
import { sameFileRevision } from './fileRevision';
import { loadParticipantsDictionary } from './participants';
import { loadSummaryTable } from './summaryTables';

const limit = 512 * 1024 ** 2;
const PARTICIPANT_PAGE_SIZE = 50;
const shortCell = (text: string) => text.slice(0, 2001);

export async function loadParticipantPreview(uri: string, signal: AbortSignal) {
  try {
    return { data: await loadSummaryTable(uri, signal) };
  } catch (error) {
    signal.throwIfAborted();
    // Archive readers check the member size before passing bytes to the text reader.
    if (
      !(error instanceof TableSizeError) &&
      !(
        error instanceof Error &&
        /limited to 1 MiB per file|member exceeds the (?:read (?:size )?limit|size or compression-ratio limit)/.test(
          error.message,
        )
      )
    )
      throw error;
  }
  const dictionary = await (isArchiveUri(uri)
    ? loadArchiveTableDictionary(uri, signal)
    : loadParticipantsDictionary(uri, signal));
  return { dictionary };
}

export async function scanParticipantTable(
  uri: string,
  page: number,
  filter: string,
  signal: AbortSignal,
  onProgress: (progress: ParticipantTablePage) => void,
  previous?: TableSnapshot['snapshot'],
): Promise<{ data: Omit<SummaryTablePreview, 'dictionary'>; progress: ParticipantTablePage }> {
  const archiveSource = isArchiveUri(uri) ? parseArchiveUri(uri) : undefined;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const rows: TableRow[] = [];
  let columns: readonly string[] | undefined;
  let unevenRows = 0;
  let checked = 0;
  let matched = 0;
  let bytes = 0;
  let totalBytes = 0;
  let modifiedAt = 0;
  let lastUpdate = 0;
  const query = filter.toLowerCase();
  const progress = (state: ParticipantTablePage['state']): ParticipantTablePage => ({
    page,
    filter,
    checked,
    matched,
    bytes,
    totalBytes,
    state,
  });
  const start = ({ bytes }: { bytes: number }) => {
    totalBytes = bytes;
    if (bytes > limit) throw new Error('Participants table exceeds the 512 MiB preview limit.');
    if (
      previous &&
      (previous.revision.size !== bytes || previous.revision.modifiedAt !== modifiedAt)
    )
      throw new Error('Participants table changed. Reload the snapshot to continue.');
    onProgress(progress('scanning'));
    return Promise.resolve();
  };
  const records = new TableRecords((row) => {
    if (!columns) {
      columns = row.cells;
      return;
    }
    checked++;
    if (row.cells.length !== columns.length) unevenRows++;
    if (query && !row.cells.some((cell) => cell.toLowerCase().includes(query))) return;
    if (Math.floor(matched++ / PARTICIPANT_PAGE_SIZE) === page)
      rows.push({
        line: row.line,
        cells: row.cells.map(shortCell),
        tokens: row.tokens.map(shortCell),
      });
  });
  const consume = async (chunk: Buffer) => {
    await records.push(decoder.decode(chunk, { stream: true }), signal);
    bytes += chunk.length;
    const now = Date.now();
    if (now - lastUpdate >= 250) {
      onProgress(progress('scanning'));
      lastUpdate = now;
    }
  };
  try {
    if (archiveSource) {
      modifiedAt = archiveSource.revision.modifiedAt;
      await streamArchiveMember(uri, archiveSource, signal, limit, consume, start);
    } else {
      const path = fileURLToPath(uri);
      const before = await lstat(path);
      if (!before.isFile()) throw new Error('Participants preview requires an ordinary file.');
      modifiedAt = before.mtimeMs;
      const handle = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        if (!sameFileRevision(before, await handle.stat()))
          throw new Error('Participants table changed while opening.');
        await start({ bytes: before.size });
        const buffer = Buffer.alloc(64 * 1024);
        while (bytes < totalBytes) {
          signal.throwIfAborted();
          const result = await handle.read(
            buffer,
            0,
            Math.min(buffer.length, totalBytes - bytes),
            bytes,
          );
          if (!result.bytesRead) throw new Error('Participants table ended during the read.');
          await consume(buffer.subarray(0, result.bytesRead));
        }
        if (
          !sameFileRevision(before, await handle.stat()) ||
          !sameFileRevision(before, await lstat(path))
        )
          throw new Error('Participants table changed while reading.');
      } finally {
        await handle.close();
      }
    }
    await records.push(decoder.decode(), signal, true);
    if (!columns) throw new Error('Table preview requires a header line.');
    return {
      progress: progress('complete'),
      data: {
        kind: 'participants',
        table: {
          snapshot: {
            sourceUri: uri,
            archiveSource,
            text: '',
            revision: { size: bytes, modifiedAt },
            capturedAt: new Date().toISOString(),
          },
          identifierColumn: 'participant_id',
          columns,
          rows,
          duplicateHeaders: repeated(columns),
          duplicateIds: [],
          unevenRows,
        },
      },
    };
  } catch (error) {
    onProgress(progress(signal.aborted ? 'cancelled' : 'failed'));
    throw error;
  }
}
