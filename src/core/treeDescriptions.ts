import { combinedFolder, interpretEntry } from './entities';
import { describeEntry, isBidsModality, type DirectoryEntry } from './directory';
import type { JsonMetadata, RecordedMetadataField } from './metadataTypes';
import type { TableSnapshot } from './tableTypes';
import type { SourceRevision } from './sourceRevision';

/** Readable content types keep extension-free logical labels distinguishable. */
export function displayFileType(entry: DirectoryEntry): string | undefined {
  if (entry.kind !== 'file' && !entry.metadataVersions) return undefined;
  if (/\.nii(?:\.gz)?$/.test(entry.name)) return 'NIfTI image';
  if (/\.json$/.test(entry.name)) return 'JSON metadata';
  if (/\.tsv$/.test(entry.name)) {
    if (entry.name === 'participants.tsv') return 'Participants table';
    if (/_events\.tsv$/.test(entry.name)) return 'Events table';
    if (/_sessions\.tsv$/.test(entry.name)) return 'Sessions table';
    if (/_scans\.tsv$/.test(entry.name)) return 'Scans table';
    return 'TSV table';
  }
  if (/\.bval$/.test(entry.name)) return 'B-values';
  if (/\.bvec$/.test(entry.name)) return 'B-vectors';
  return undefined;
}

// Concise display vocabulary based on BIDS 1.11.2 schema/objects/suffixes.yaml:
// https://github.com/bids-standard/bids-specification/blob/v1.11.2/src/schema/objects/suffixes.yaml
// This is a presentation mapping, not a validator or content inference.
const suffixLabels = new Map([
  ['bold', 'BOLD'],
  ['T1w', 'T1-weighted'],
  ['T2w', 'T2-weighted'],
  ['T2starw', 'T2*-weighted'],
  ['PDw', 'Proton density-weighted'],
  ['FLAIR', 'FLAIR'],
  ['dwi', 'Diffusion'],
  ['events', 'Events'],
  ['sessions', 'Sessions'],
  ['scans', 'Scans'],
  ['channels', 'Channels'],
  ['electrodes', 'Electrodes'],
  ['coordsystem', 'Coordinate system'],
  ['eeg', 'EEG'],
  ['ieeg', 'Intracranial EEG'],
  ['meg', 'MEG'],
  ['pet', 'PET'],
  ['beh', 'Behavior'],
  ['physio', 'Physiology'],
  ['asl', 'Arterial spin labeling'],
  ['aslcontext', 'ASL volume context'],
  ['m0scan', 'M0 calibration'],
  ['sbref', 'Single-band reference'],
  ['epi', 'EPI'],
  ['fieldmap', 'Field map'],
  ['phasediff', 'Phase difference'],
  ['magnitude1', 'Magnitude 1'],
  ['magnitude2', 'Magnitude 2'],
  ['phase1', 'Phase 1'],
  ['phase2', 'Phase 2'],
  ['mask', 'Mask'],
  ['dseg', 'Discrete segmentation'],
  ['probseg', 'Probabilistic segmentation'],
]);
// Filename entities describe distinctions, not physical measurements. For example,
// echo-2 is an index; its echo time must come from applicable JSON metadata.
const entityLabels = new Map([
  ['task', 'Task'],
  ['acq', 'Acquisition'],
  ['run', 'Run'],
  ['dir', 'Phase encoding'],
  ['echo', 'Echo'],
  ['space', 'Space'],
  ['desc', 'Description'],
  ['rec', 'Reconstruction'],
  ['part', 'Part'],
  ['res', 'Resolution'],
  ['den', 'Density'],
  ['hemi', 'Hemisphere'],
  ['ce', 'Contrast agent'],
  ['mod', 'Corresponding modality'],
  ['flip', 'Flip angle index'],
  ['inv', 'Inversion index'],
  ['mt', 'Magnetization transfer'],
  ['recording', 'Recording'],
  ['split', 'Split'],
  ['chunk', 'Chunk'],
  ['sample', 'Sample'],
  ['stain', 'Staining'],
  ['trc', 'Tracer'],
  ['nuc', 'Nucleus'],
  ['voi', 'Volume of interest'],
  ['proc', 'Processing'],
  ['tracksys', 'Tracking system'],
  ['atlas', 'Atlas'],
  ['cohort', 'Cohort'],
  ['label', 'Label'],
  ['seg', 'Segmentation'],
  ['scale', 'Scale'],
  ['tpl', 'Template'],
]);
const entityValues = new Map([
  ['part-mag', 'magnitude'],
  ['part-phase', 'phase'],
  ['part-real', 'real'],
  ['part-imag', 'imaginary'],
  ['hemi-L', 'left'],
  ['hemi-R', 'right'],
]);

function fileDisplay(
  entry: DirectoryEntry,
  omitEntities: readonly string[] = [],
): { label: string; details: string } {
  if (entry.name === 'dataset_description.json')
    return { label: 'Dataset description', details: '' };
  if (/^participants\.(json|tsv)$/.test(entry.name)) return { label: 'Participants', details: '' };
  const model = interpretEntry(entry.metadataVersions ? { ...entry, kind: 'file' } : entry);
  const redundant = new Set(
    model.entities
      .filter(
        (entity) =>
          (entity.key === 'sub' || entity.key === 'ses') &&
          entity.status === 'resolved' &&
          entity.evidence.some((item) => item.origin !== 'filename'),
      )
      .map((entity) => `${entity.key}-${entity.value}`),
  );
  const stem = entry.name.replace(/\.(?:nii(?:\.gz)?|json|tsv|bval|bvec)$/, '');
  const tokens = stem
    .split('_')
    .filter((token) => !redundant.has(token) && !omitEntities.includes(token.split('-')[0]));
  const suffix = model.filename?.suffix;
  const readable = suffixLabels.get(suffix ?? '');
  if (!suffix || model.filename.unparsedTokens.length)
    return { label: tokens.join('_') || stem, details: '' };
  return {
    label: readable ?? suffix,
    details: tokens
      .slice(0, -1)
      .map((token) => {
        const [key, value] = token.split('-');
        const name = entityLabels.get(key);
        return name ? `${name} ${entityValues.get(token) ?? value}` : token;
      })
      .join(' · '),
  };
}

/** Acquisition distinctions remain beside the content label, in filename order. */
export function displayFileDetails(
  entry: DirectoryEntry,
  omitEntities: readonly string[] = [],
): string {
  return displayFileType(entry) ? fileDisplay(entry, omitEntities).details : '';
}

/** Display entity values while retaining exact identifiers in the source model. */
export function displayEntryLabel(entry: DirectoryEntry): string {
  const role = describeEntry(entry);
  if (entry.kind === 'directory' && (isBidsModality(entry.name) || role === 'Derivatives'))
    return role;
  if (role === 'Participant') return entry.name.replace(/^sub-/, '');
  if (role === 'Session') return entry.name.replace(/^ses-/, '');
  if (role === 'Participant / session (combined)') {
    const combined = combinedFolder(entry.name)!;
    return `${combined.subject} / ${combined.session}`;
  }
  return displayFileType(entry) ? fileDisplay(entry).label : entry.name;
}

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
