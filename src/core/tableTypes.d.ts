import type { TextSnapshot } from './textSnapshot';
import type { SourceRevision } from './sourceRevision';
import type { RecordedMetadataField, JsonMetadata } from './metadataTypes';

export interface TableRow {
  readonly line: number;
  readonly cells: readonly string[];
  /** Exact source text, including quote escaping. */
  readonly tokens: readonly string[];
}
export interface TableSnapshot {
  readonly snapshot: TextSnapshot;
  readonly identifierColumn: string;
  readonly columns: readonly string[];
  readonly rows: readonly TableRow[];
  readonly duplicateHeaders: readonly string[];
  readonly duplicateIds: readonly string[];
  readonly unevenRows: number;
}
export interface SummaryTablePreview {
  readonly kind?: 'participants' | 'sessions' | 'scans';
  readonly table: TableSnapshot;
  readonly dictionary: Readonly<{
    sourceUri: string;
    status: 'loaded' | 'absent' | 'unavailable';
    metadata?: JsonMetadata;
    error?: string;
    fields?: readonly RecordedMetadataField[];
    sources?: readonly Readonly<{
      sourceUri: string;
      revision?: SourceRevision;
      capturedAt?: string;
      error?: string;
    }>[];
  }>;
}

/** Compatibility name for the original participant-only loader. */
export type ParticipantsPreview = SummaryTablePreview;
