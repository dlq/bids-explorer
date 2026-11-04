import { interpretEntry } from './entities';
import { describeEntry, type DirectoryEntry } from './directory';
import type { JsonMetadata, RecordedMetadataField } from './metadataTypes';
import type { TableSnapshot } from './tableTypes';
import type { SourceRevision } from './sourceRevision';

export interface DescriptionOptions {
  readonly participantColumn: string;
  readonly sessionColumn: string;
}
export interface DescriptionEvidence {
  readonly sourceUri: string;
  readonly value: string;
  readonly field?: string;
  readonly pointer?: string;
  readonly line?: number;
  readonly column?: string;
  readonly rawToken?: string;
  readonly revision: SourceRevision;
  readonly capturedAt: string;
}
export interface TreeDescription {
  readonly text: string;
  readonly evidence: readonly DescriptionEvidence[];
  readonly relatedSources?: readonly Readonly<{
    sourceUri: string;
    pointer?: string;
    revision?: SourceRevision;
    capturedAt?: string;
  }>[];
}
export type DescriptionPlan = Readonly<{
  kind: 'dataset' | 'task' | 'participant' | 'session' | 'combined';
  boundary: string;
  subject?: string;
  session?: string;
}>;

export function descriptionPlan(
  entry: DirectoryEntry,
  options: DescriptionOptions,
): DescriptionPlan | undefined {
  const model = interpretEntry(entry);
  if (!model.scope) return undefined;
  const boundary = model.scope.relativePath;
  const role = describeEntry(entry);
  if (entry.kind === 'directory' && (role === 'Dataset' || role === 'Pipeline'))
    return Object.freeze({ kind: 'dataset', boundary: entry.relativePath });
  if (
    entry.kind === 'file' &&
    ['.nii', '.nii.gz'].includes(model.filename?.extension ?? '') &&
    model.entities.some((item) => item.key === 'task' && item.status === 'resolved')
  )
    return Object.freeze({ kind: 'task', boundary });
  const context = model.suggestedContext;
  if (entry.kind !== 'directory' || !context) return undefined;
  if (role === 'Participant' && options.participantColumn)
    return Object.freeze({ kind: 'participant', boundary, subject: context.subject });
  if (
    (role === 'Session' && options.sessionColumn) ||
    (role === 'Participant / session (combined)' &&
      (options.participantColumn || options.sessionColumn))
  )
    return Object.freeze({
      kind: role === 'Session' ? 'session' : 'combined',
      boundary,
      subject: context.subject,
      session: context.session,
    });
  return undefined;
}

/** A bounded, single-line display only; exact source values remain in provenance. */
export function displayDescription(value: string): string | undefined {
  if (value.length > 4096 || value === 'n/a') return undefined;
  const text = value.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim();
  return text ? text.slice(0, 120) + (text.length > 120 ? '…' : '') : undefined;
}

export function jsonDescription(doc: JsonMetadata, key: string): TreeDescription | undefined {
  const matches = doc.fields.filter((field) => field.key === key);
  if (matches.length !== 1 || matches[0].duplicated || matches[0].type !== 'string')
    return undefined;
  const field = matches[0],
    value = JSON.parse(field.valueText) as string;
  const text = displayDescription(value);
  if (!text) return undefined;
  return Object.freeze({
    text,
    evidence: Object.freeze([
      Object.freeze({
        sourceUri: field.sourceUri,
        value,
        field: key,
        pointer: field.pointer,
        revision: doc.snapshot.revision,
        capturedAt: doc.snapshot.capturedAt,
      }),
    ]),
  });
}

/** An explicit column mapping, exact identifier match, and one rectangular source row. */
export function tableDescription(
  table: TableSnapshot,
  identifier: string,
  value: string,
  column: string,
  definitions: readonly RecordedMetadataField[],
): TreeDescription | undefined {
  const identifiers = table.columns.flatMap((key, i) => (key === identifier ? [i] : []));
  const columns = table.columns.flatMap((key, i) => (key === column ? [i] : []));
  const fields = definitions.filter((field) => field.key === column);
  if (
    identifiers.length !== 1 ||
    columns.length !== 1 ||
    fields.length > 1 ||
    fields.some((field) => field.duplicated)
  )
    return undefined;
  const rows = table.rows.filter((row) => row.cells[identifiers[0]] === value);
  if (rows.length !== 1 || rows[0].cells.length !== table.columns.length) return undefined;
  const label = rows[0].cells[columns[0]],
    text = displayDescription(label);
  if (!text) return undefined;
  return Object.freeze({
    text,
    evidence: Object.freeze([
      Object.freeze({
        sourceUri: table.snapshot.sourceUri,
        value: label,
        column,
        line: rows[0].line,
        rawToken: rows[0].tokens[columns[0]],
        revision: table.snapshot.revision,
        capturedAt: table.snapshot.capturedAt,
      }),
    ]),
  });
}
