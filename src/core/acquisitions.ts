import { setImmediate } from 'node:timers/promises';
import { entryKey, type DirectoryEntry } from './directory';
import { interpretEntry } from './entities';
import {
  displayEntryLabel,
  displayFileDetails,
  displayFileType,
  type TreeDescription,
} from './treeDescriptions';
import type { InheritanceResult } from './inheritance';

export interface Acquisition {
  readonly image: DirectoryEntry;
  readonly members: readonly DirectoryEntry[];
  readonly echoes?: readonly Acquisition[];
}
interface Candidate {
  entry: DirectoryEntry;
  entities: string;
  signature: string;
  extension: string;
  suffix: string;
}
function candidate(entry: DirectoryEntry): Candidate | undefined {
  if (entry.kind !== 'file' || entry.logical?.conflict || entry.archive?.conflict) return undefined;
  const model = interpretEntry(entry);
  if (
    !model.filename?.suffix ||
    model.filename.unparsedTokens.length ||
    model.entities.some((entity) => entity.status !== 'resolved')
  )
    return undefined;
  const entities = JSON.stringify([
    entry.datasetUri,
    entry.relativePath.split('/').slice(0, -1).join('/'),
    model.entities
      .map((entity) => [entity.key, entity.value])
      .sort(([a], [b]) => a!.localeCompare(b!)),
  ]);
  return {
    entry,
    entities,
    signature: JSON.stringify([entities, model.filename.suffix]),
    extension: model.filename.extension ?? '',
    suffix: model.filename.suffix,
  };
}

/** Sibling-only, exact-entity associations. Shared/inherited metadata stays at its original scope. */
export async function groupAcquisitions(
  entries: readonly DirectoryEntry[],
  signal: AbortSignal,
): Promise<readonly (DirectoryEntry | Acquisition)[]> {
  const candidates: Candidate[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (i % 256 === 0) {
      await setImmediate();
      signal.throwIfAborted();
    }
    const parsed = candidate(entries[i]);
    if (parsed) candidates.push(parsed);
  }
  const signatures = new Map<string, Candidate[]>();
  const entities = new Map<string, Candidate[]>();
  for (const item of candidates)
    if (['.nii', '.nii.gz'].includes(item.extension)) {
      for (const [map, key] of [
        [signatures, item.signature],
        [entities, item.entities],
      ] as const) {
        const rows = map.get(key) ?? [];
        rows.push(item);
        map.set(key, rows);
      }
    }
  const grouped = new Map<string, DirectoryEntry[]>();
  for (const images of signatures.values())
    if (images.length === 1) grouped.set(entryKey(images[0].entry), []);
  const attached = new Set<string>();
  for (const item of candidates) {
    let matches: readonly Candidate[] = [];
    if (
      item.extension === '.json' ||
      (item.suffix === 'dwi' && ['.bval', '.bvec'].includes(item.extension))
    )
      matches = signatures.get(item.signature) ?? [];
    if (item.suffix === 'events' && ['.tsv', '.json'].includes(item.extension))
      matches = (entities.get(item.entities) ?? []).filter((image) => image.suffix === 'bold');
    if (matches.length !== 1) continue;
    const members = grouped.get(entryKey(matches[0].entry));
    if (members) {
      members.push(item.entry);
      attached.add(entryKey(item.entry));
    }
  }
  return entries.flatMap((entry) => {
    if (attached.has(entryKey(entry))) return [];
    const members = grouped.get(entryKey(entry));
    return [members ? { image: entry, members } : entry] as (DirectoryEntry | Acquisition)[];
  });
}

const collator = new Intl.Collator('en', { numeric: true });

/** Compare content and entity values, preserving the spelling of all displayed identifiers. */
export function compareLogicalEntries(a: DirectoryEntry, b: DirectoryEntry): number {
  return (
    collator.compare(displayEntryLabel(a), displayEntryLabel(b)) ||
    collator.compare(displayFileDetails(a), displayFileDetails(b)) ||
    collator.compare(displayFileType(a) ?? '', displayFileType(b) ?? '') ||
    collator.compare(a.name, b.name) ||
    entryKey(a).localeCompare(entryKey(b))
  );
}

/** Only effective, unambiguous recorded values; no duration or image geometry inference. */
export function acquisitionSummary(result: InheritanceResult): TreeDescription | undefined {
  if (result.status !== 'resolved' || result.coverage !== 'complete') return undefined;
  const text: string[] = [];
  const evidence: TreeDescription['evidence'][number][] = [];
  for (const [key, label, multiplier, unit] of [
    ['RepetitionTime', 'TR', 1, 's'],
    ['EchoTime', 'TE', 1000, 'ms'],
    ['AcquisitionDuration', 'duration', 1, 's'],
  ] as const) {
    const field = result.fields.find((field) => field.key === key)?.value;
    if (!field || field.type !== 'number' || field.duplicated) continue;
    const value = Number(field.valueText);
    if (!Number.isFinite(value) || value <= 0) continue;
    const source = result.sources.find((source) => source.entry.uri === field.sourceUri)?.metadata
      ?.snapshot;
    if (!source) continue;
    text.push(`${label} ${Number((value * multiplier).toPrecision(6))} ${unit}`);
    evidence.push({
      sourceUri: field.sourceUri,
      value: field.valueText,
      field: key,
      pointer: field.pointer,
      revision: source.revision,
      capturedAt: source.capturedAt,
    });
  }
  return text.length ? { text: text.join(' · '), evidence } : undefined;
}

/** Group only sibling images differing solely in a resolved echo index.
 * Shared events/JSON remain attached to the collection, never to an arbitrary echo.
 */
export async function groupEchoCollections(
  rows: readonly (DirectoryEntry | Acquisition)[],
  signal: AbortSignal,
): Promise<readonly (DirectoryEntry | Acquisition)[]> {
  const groups = new Map<string, Acquisition[]>();
  const shared = new Map<string, DirectoryEntry[]>();
  const blocked = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    if (i % 256 === 0) {
      await setImmediate();
      signal.throwIfAborted();
    }
    const row = rows[i];
    const entry = 'image' in row ? row.image : row;
    const parsed = candidate(entry);
    if (!parsed) {
      if (/\.nii(?:\.gz)?$/.test(entry.name)) return rows;
      continue;
    }
    const model = interpretEntry(entry);
    const echo = model.entities.find((entity) => entity.key === 'echo')?.value;
    const key = JSON.stringify([
      entry.datasetUri,
      entry.relativePath.split('/').slice(0, -1).join('/'),
      parsed.suffix === 'events' ? 'bold' : parsed.suffix,
      model.entities
        .filter((entity) => entity.key !== 'echo')
        .map((entity) => [entity.key, entity.value])
        .sort(([a], [b]) => a!.localeCompare(b!)),
    ]);
    if ('image' in row && echo && /^[0-9]+$/.test(echo)) {
      const items = groups.get(key) ?? [];
      items.push(row);
      groups.set(key, items);
    } else if (['.nii', '.nii.gz'].includes(parsed.extension)) {
      blocked.add(key);
    } else if (
      !('image' in row) &&
      !echo &&
      (parsed.extension === '.json' || (parsed.suffix === 'events' && parsed.extension === '.tsv'))
    ) {
      const items = shared.get(key) ?? [];
      items.push(entry);
      shared.set(key, items);
    }
  }
  const replacements = new Map<Acquisition, Acquisition>();
  const removed = new Set<DirectoryEntry | Acquisition>();
  for (const [key, echoes] of groups) {
    const indices = echoes.map((row) =>
      BigInt(
        interpretEntry(row.image).entities.find((entity) => entity.key === 'echo')!.value!,
      ).toString(),
    );
    if (blocked.has(key) || echoes.length < 2 || new Set(indices).size !== echoes.length) continue;
    echoes.sort((a, b) => compareLogicalEntries(a.image, b.image));
    const members = shared.get(key) ?? [];
    replacements.set(echoes[0], { image: echoes[0].image, echoes, members });
    for (const row of [...echoes.slice(1), ...members]) removed.add(row);
  }
  return rows
    .filter((row) => !removed.has(row))
    .map((row) => ('image' in row ? (replacements.get(row) ?? row) : row));
}
