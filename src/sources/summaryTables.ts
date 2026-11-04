import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTable, summaryTableKind } from '../core/tables';
import type { SummaryTablePreview } from '../core/tableTypes';
import { loadParticipants } from './participants';
import { loadInheritedMetadata } from './inheritedMetadata';
import { readTextSnapshot } from './previewText';

/** Session/scan/event dictionaries use the same bounded, source-scoped inheritance resolver as images. */
export async function loadSummaryTable(
  uri: string,
  signal: AbortSignal,
  datasetUri?: string,
): Promise<SummaryTablePreview> {
  const kind = summaryTableKind(basename(fileURLToPath(uri)));
  if (!kind)
    throw new Error(
      'Choose participants.tsv, sub-…_sessions.tsv sub-…[_ses-…]_scans.tsv or *_events.tsv.',
    );
  if (kind === 'participants') return loadParticipants(uri, signal);
  if (!datasetUri)
    throw new Error(
      'Add the containing dataset to BIDS Explorer before previewing a session, scan or event table.',
    );
  const result = await loadInheritedMetadata(datasetUri, uri, signal);
  const table = await parseTable(
    await readTextSnapshot(uri, signal),
    signal,
    kind === 'sessions' ? 'session_id' : kind === 'scans' ? 'filename' : '',
  );
  const sources = Object.freeze(
    result.sources.map((source) =>
      Object.freeze({
        sourceUri: source.entry.uri,
        revision: source.metadata?.snapshot.revision,
        capturedAt: source.metadata?.snapshot.capturedAt,
        error: source.error,
      }),
    ),
  );
  return Object.freeze({
    kind,
    table,
    dictionary: Object.freeze({
      sourceUri: sources.at(-1)?.sourceUri ?? uri.replace(/\.tsv$/, '.json'),
      status: result.status === 'unresolved' ? 'unavailable' : sources.length ? 'loaded' : 'absent',
      error: result.issues.length ? result.issues.join('\n') : undefined,
      fields: Object.freeze(result.fields.map((field) => field.value)),
      sources,
    }),
  });
}
