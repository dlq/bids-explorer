import { setImmediate } from 'node:timers/promises';
import { interpretEntry } from './entities';
import type { DirectoryEntry } from './directory';
import type { JsonMetadata, RecordedMetadataField } from './metadataTypes';

const indexKeys = new Set(['run', 'echo', 'flip', 'inv', 'split', 'chunk']);
const supported = new Set(['.nii', '.nii.gz', '.tsv', '.tsv.gz']);

export interface MetadataLevel {
  /** Dataset-relative directory, ordered root to leaf. */
  readonly relativePath: string;
  readonly coverage: 'complete' | 'incomplete';
  readonly error?: string;
  readonly entries: readonly DirectoryEntry[];
}
export interface MetadataSource {
  readonly entry: DirectoryEntry;
  readonly level: string;
  readonly metadata?: JsonMetadata;
  readonly error?: string;
}
export interface InheritedField {
  readonly key: string;
  readonly value: RecordedMetadataField;
  readonly history: readonly RecordedMetadataField[];
}
export interface RelatedFile {
  readonly extension: '.bval' | '.bvec';
  readonly status: 'resolved' | 'absent' | 'ambiguous' | 'unknown';
  readonly selected?: DirectoryEntry;
  readonly candidates: readonly DirectoryEntry[];
}
export interface InheritanceResult {
  readonly target: DirectoryEntry;
  readonly coverage: 'complete' | 'incomplete';
  readonly status: 'resolved' | 'unresolved';
  readonly issues: readonly string[];
  readonly sources: readonly MetadataSource[];
  /** Withheld on incomplete coverage, unreadable JSON, duplicate keys or ambiguity. */
  readonly fields: readonly InheritedField[];
  readonly related: readonly RelatedFile[];
}

function filename(entry: DirectoryEntry):
  | {
      suffix: string;
      extension: string;
      entities: ReadonlyMap<string, string>;
    }
  | undefined {
  if (entry.kind !== 'file') return undefined;
  // participants is deliberately excluded from ordinary entity interpretation.
  if (entry.name === 'participants.tsv' || entry.name === 'participants.json')
    return { suffix: 'participants', extension: entry.name.slice(12), entities: new Map() };
  const model = interpretEntry(entry),
    name = model.filename;
  if (!name?.suffix || !name.extension || name.unparsedTokens.length) return undefined;
  const entities = new Map<string, string>();
  for (const entity of model.entities) {
    const tokens = entity.evidence.filter((item) => item.origin === 'filename');
    if (entity.status !== 'resolved') return undefined;
    if (tokens.length) {
      const raw = tokens[0].value;
      if (indexKeys.has(entity.key) && !/^\d+$/.test(raw)) return undefined;
      entities.set(entity.key, indexKeys.has(entity.key) ? raw.replace(/^0+(?=\d)/, '') : raw);
    }
  }
  return { suffix: name.suffix, extension: name.extension, entities };
}

/** Checks supported selection and returns its minimum derivative boundary. No filesystem IO. */
export function inheritanceBoundary(target: DirectoryEntry): string {
  const parsed = filename(target);
  const model = interpretEntry(target);
  if (
    !parsed ||
    !supported.has(parsed.extension) ||
    !model.scope ||
    model.scope.kind === 'derivatives-container'
  )
    throw new Error('Select an unambiguous NIfTI or TSV data file within a dataset.');
  return model.scope.relativePath;
}

/** Resolve only supplied ancestor inventories. Never chooses between same-level JSON sources. */
export async function resolveInheritance(
  target: DirectoryEntry,
  levels: readonly MetadataLevel[],
  load: (entry: DirectoryEntry, signal: AbortSignal) => Promise<JsonMetadata>,
  signal: AbortSignal,
): Promise<InheritanceResult> {
  signal.throwIfAborted();
  const boundary = inheritanceBoundary(target),
    data = filename(target)!;
  if (!levels.length || levels.length > 128) throw new Error('Supply 1–128 ancestor levels.');
  const parent = target.relativePath.split('/').slice(0, -1).join('/');
  // A nested dataset may supply a tighter boundary than the derivative minimum.
  let expected = levels[0].relativePath;
  if (!(expected === boundary || expected.startsWith(boundary ? boundary + '/' : '')))
    throw new Error('Metadata inventory crosses the dataset boundary.');
  for (const level of levels) {
    if (
      level.relativePath !== expected ||
      !(parent === expected || parent.startsWith(expected ? expected + '/' : ''))
    )
      throw new Error('Metadata inventory must contain consecutive ancestors, root to leaf.');
    const rest = parent.slice(expected ? expected.length + 1 : 0).split('/')[0];
    expected = expected ? expected + '/' + rest : rest;
  }
  if (levels.at(-1)!.relativePath !== parent)
    throw new Error('Metadata inventory must reach the selected file.');
  const issues: string[] = [],
    sources: MetadataSource[] = [];
  const candidates = new Map<string, { entry: DirectoryEntry; level: string }[]>();
  let complete = levels.every((level) => level.coverage === 'complete');
  let count = 0;
  for (const level of levels) {
    if (level.coverage !== 'complete')
      issues.push(
        `Incomplete directory ${level.relativePath || '.'}: ${level.error ?? 'unknown coverage'}`,
      );
    if (level.entries.length > 50000)
      throw new Error('Metadata inventory exceeds 50,000 entries per level.');
    for (const entry of level.entries) {
      if (++count % 256 === 0) {
        await setImmediate();
        signal.throwIfAborted();
      }
      if (
        entry.datasetUri !== target.datasetUri ||
        entry.relativePath !== (level.relativePath ? level.relativePath + '/' : '') + entry.name
      )
        throw new Error('Metadata candidate has inconsistent source identity.');
      const item = filename(entry.kind === 'symlink' ? { ...entry, kind: 'file' } : entry);
      if (
        !item ||
        item.suffix !== data.suffix ||
        !['.json', '.bval', '.bvec'].includes(item.extension)
      )
        continue;
      if ([...item.entities].some(([key, value]) => data.entities.get(key) !== value)) continue;
      if (item.extension !== '.json' && data.suffix !== 'dwi') continue;
      if (entry.kind === 'symlink') {
        complete = false;
        issues.push(`Applicable symbolic link not followed: ${entry.relativePath}`);
        continue;
      }
      const group = candidates.get(item.extension) ?? [];
      group.push({ entry, level: level.relativePath });
      candidates.set(item.extension, group);
      if ([...candidates.values()].reduce((sum, rows) => sum + rows.length, 0) > 64)
        throw new Error('Metadata resolution is limited to 64 applicable sources.');
    }
  }
  let bytes = 0;
  for (const candidate of candidates.get('.json') ?? []) {
    signal.throwIfAborted();
    try {
      if (bytes >= 8 * 1024 * 1024) throw new Error('Metadata resolution exceeds 8 MiB of JSON.');
      const metadata = await load(candidate.entry, signal);
      if (metadata.snapshot.sourceUri !== candidate.entry.uri)
        throw new Error('Metadata snapshot source does not match candidate.');
      bytes += Buffer.byteLength(metadata.snapshot.text);
      if (bytes > 8 * 1024 * 1024) throw new Error('Metadata resolution exceeds 8 MiB of JSON.');
      if (metadata.duplicateKeys.length)
        issues.push(`Duplicate JSON keys: ${candidate.entry.relativePath}`);
      sources.push(Object.freeze({ ...candidate, metadata }));
    } catch (error) {
      signal.throwIfAborted();
      issues.push(`Unreadable metadata: ${candidate.entry.relativePath}`);
      sources.push(Object.freeze({ ...candidate, error: String(error) }));
    }
  }
  for (const level of levels)
    if (sources.filter((source) => source.level === level.relativePath).length > 1)
      issues.push(`Ambiguous JSON metadata at ${level.relativePath || '.'}`);
  const histories = new Map<string, RecordedMetadataField[]>();
  if (!issues.length)
    for (const source of sources)
      for (const field of source.metadata!.fields) {
        const history = histories.get(field.key) ?? [];
        history.push(field);
        histories.set(field.key, history);
      }
  const related: RelatedFile[] = [];
  if (data.suffix === 'dwi')
    for (const extension of ['.bval', '.bvec'] as const) {
      const all = candidates.get(extension) ?? [],
        nearest = all.at(-1)?.level;
      const matches = all.filter((item) => item.level === nearest);
      related.push(
        Object.freeze({
          extension,
          status: !complete
            ? 'unknown'
            : matches.length > 1
              ? 'ambiguous'
              : matches.length
                ? 'resolved'
                : 'absent',
          selected: complete && matches.length === 1 ? matches[0].entry : undefined,
          candidates: Object.freeze(all.map((item) => item.entry)),
        }),
      );
    }
  signal.throwIfAborted();
  return Object.freeze({
    target: Object.freeze({ ...target }),
    coverage: complete ? 'complete' : 'incomplete',
    status: issues.length ? 'unresolved' : 'resolved',
    issues: Object.freeze(issues),
    sources: Object.freeze(sources),
    fields: Object.freeze(
      [...histories].map(([key, history]) =>
        Object.freeze({ key, value: history.at(-1)!, history: Object.freeze(history) }),
      ),
    ),
    related: Object.freeze(related),
  });
}
