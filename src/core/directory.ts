import type { PhysicalResource } from './resources';
import { combinedFolder } from './entities';
import type { SourceRevision } from './sourceRevision';
export type { SourceRevision } from './sourceRevision';
import { setImmediate } from 'node:timers/promises';

export type EntryKind = 'directory' | 'file' | 'symlink' | 'other';
export interface DirectoryEntry {
  readonly datasetUri: string;
  readonly uri: string;
  readonly relativePath: string;
  readonly name: string;
  readonly kind: EntryKind;
  readonly logical?: {
    readonly kind: 'subject' | 'session' | 'overlay' | 'resource';
    readonly conflict?: boolean;
    readonly visible?: boolean;
    readonly sources: readonly DirectoryEntry[];
    readonly subject?: string;
    readonly session?: string;
  };
  readonly archive?: {
    readonly format?: 'tar';
    readonly datasetWrapper?: boolean;
    readonly sourceUri: string;
    readonly containerPath: string;
    readonly memberPath: string;
    readonly memberIndex?: number;
    readonly choices?: readonly PhysicalResource[];
    readonly revision?: SourceRevision;
    readonly conflict?: boolean;
    readonly visible?: boolean;
  };
}
export interface DirectorySource {
  root(uri: string): Promise<DirectoryEntry>;
  children(parent: DirectoryEntry, signal: AbortSignal): Promise<readonly DirectoryEntry[]>;
  revision(entry: DirectoryEntry): Promise<SourceRevision>;
  refresh?(scope?: DirectoryEntry): void;
}

export function entryKey(entry: DirectoryEntry): string {
  if (entry.logical && entry.logical.kind !== 'resource')
    return JSON.stringify([entry.datasetUri, entry.relativePath, 'logical', entry.logical.kind]);
  return entry.archive
    ? JSON.stringify([
        entry.datasetUri,
        entry.relativePath,
        entry.archive.sourceUri,
        entry.archive.memberPath,
        entry.archive.memberIndex ?? null,
      ])
    : entry.logical
      ? JSON.stringify([entry.datasetUri, entry.relativePath, entry.uri])
      : JSON.stringify([entry.datasetUri, entry.relativePath]);
}

/** Folder labels, including explicitly marked combined names. No path normalization or validation. */
export function describeEntry(entry: DirectoryEntry): string {
  if (entry.logical?.kind === 'subject') return 'Participant';
  if (entry.logical?.kind === 'session') return 'Session';
  if (entry.archive?.memberPath === '')
    return entry.archive.format === 'tar' ? 'Tar archive' : 'ZIP archive';
  if (entry.kind !== 'directory') return entry.kind;
  if (entry.relativePath === '') return 'Dataset';
  if (entry.relativePath.startsWith('derivatives/') && entry.relativePath.split('/').length === 2)
    return 'Pipeline';
  if (combinedFolder(entry.name)) return 'Participant / session (combined)';
  if (/^sub-[a-zA-Z0-9+]+$/.test(entry.name)) return 'Participant';
  if (/^ses-[a-zA-Z0-9+]+$/.test(entry.name)) return 'Session';
  if (entry.name === 'derivatives' && entry.relativePath === 'derivatives') return 'Derivatives';
  const modalities: Record<string, string> = {
    anat: 'Anatomical',
    func: 'Functional',
    dwi: 'Diffusion',
    fmap: 'Field maps',
    perf: 'Perfusion',
    eeg: 'EEG',
    meg: 'MEG',
    ieeg: 'Intracranial EEG',
    pet: 'PET',
  };
  return modalities[entry.name] ?? 'Folder';
}

/** Bound CPU work between yields even when a single directory has many children. */
export async function orderEntries(
  entries: readonly DirectoryEntry[],
  signal: AbortSignal,
  filesFirst = false,
): Promise<readonly DirectoryEntry[]> {
  const collator = new Intl.Collator('en', { numeric: true });
  const compare = (a: DirectoryEntry, b: DirectoryEntry): number =>
    (Number(b.kind === 'directory') - Number(a.kind === 'directory')) * (filesFirst ? -1 : 1) ||
    collator.compare(a.name, b.name);
  let runs: DirectoryEntry[][] = [];
  for (let i = 0; i < entries.length; i += 256) {
    signal.throwIfAborted();
    runs.push(entries.slice(i, i + 256).sort(compare));
    await setImmediate();
  }
  while (runs.length > 1) {
    const next: DirectoryEntry[][] = [];
    for (let r = 0; r < runs.length; r += 2) {
      const left = runs[r];
      const right = runs[r + 1] ?? [];
      const merged: DirectoryEntry[] = [];
      let a = 0,
        b = 0;
      while (a < left.length || b < right.length) {
        if (b === right.length || (a < left.length && compare(left[a], right[b]) <= 0)) {
          merged.push(left[a++]);
        } else {
          merged.push(right[b++]);
        }
        if (merged.length % 256 === 0) {
          await setImmediate();
          signal.throwIfAborted();
        }
      }
      next.push(merged);
    }
    runs = next;
  }
  signal.throwIfAborted();
  return Object.freeze(runs[0] ?? []);
}

/** Canonical folder evidence below the root/pipeline boundary; filename conflicts are separate. */
export function folderEntities(entry: DirectoryEntry): readonly {
  entity: 'subject' | 'session';
  value: string;
  originalFolderPath: string;
}[] {
  const segments = entry.relativePath ? entry.relativePath.split('/') : [];
  if (entry.kind !== 'directory') segments.pop();
  const result: { entity: 'subject' | 'session'; value: string; originalFolderPath: string }[] = [];
  for (let i = segments[0] === 'derivatives' ? 2 : 0; i < segments.length; i++) {
    const match = /^(sub|ses)-([a-zA-Z0-9+]+)$/.exec(segments[i]);
    if (match)
      result.push({
        entity: match[1] === 'sub' ? 'subject' : 'session',
        value: match[2],
        originalFolderPath: segments.slice(0, i + 1).join('/'),
      });
  }
  return result;
}

/** A deliberately small navigation vocabulary, not a conformance validator. */
function bidsDirectoryRole(relativePath: string): string | undefined {
  if (!relativePath) return 'Dataset';
  let parts = relativePath.split('/');
  if (parts.some((part) => part.startsWith('.'))) return undefined;
  if (parts[0] === 'derivatives') {
    if (parts.length === 1) return 'Derivatives';
    if (parts.length === 2) return 'Pipeline';
    parts = parts.slice(2);
  }
  if (!/^sub-[a-zA-Z0-9+]+$/.test(parts[0]) && !combinedFolder(parts[0])) return undefined;
  if (parts.length === 1) return 'Participant';
  if (/^ses-[a-zA-Z0-9+]+$/.test(parts[1])) {
    if (parts.length === 2) return 'Session';
    parts = [parts[0], ...parts.slice(2)];
  }
  const modalities = new Set(['anat', 'func', 'dwi', 'fmap', 'perf', 'eeg', 'meg', 'ieeg', 'pet']);
  return parts.length === 2 && modalities.has(parts[1]) ? 'Modality' : undefined;
}

export function isRecognizedBidsEntry(entry: DirectoryEntry): boolean {
  const parts = entry.relativePath.split('/');
  if (entry.logical?.visible && !parts.some((part) => part.startsWith('.'))) return true;
  if (entry.logical?.kind !== undefined && entry.logical.kind !== 'resource')
    return entry.logical.sources.some((source) => isRecognizedBidsEntry(source));
  if (entry.archive)
    return entry.archive.visible !== false && !parts.some((part) => part.startsWith('.'));
  if (parts.some((part) => part.startsWith('.'))) return false;
  if (entry.kind === 'directory') return bidsDirectoryRole(entry.relativePath) !== undefined;
  if (entry.kind === 'symlink')
    return bidsDirectoryRole(entry.relativePath) !== undefined || bidsFileName(entry.name);
  if (entry.kind !== 'file') return false;
  const atDatasetRoot = parts.length === 1 || (parts[0] === 'derivatives' && parts.length === 3);
  if (
    atDatasetRoot &&
    /^(dataset_description\.json|participants\.(tsv|json)|README(?:\.(md|txt|rst))?|CHANGES|LICENSE(?:\.txt)?|CITATION\.cff)$/.test(
      entry.name,
    )
  )
    return true;
  return bidsFileName(entry.name);
}

function bidsFileName(name: string): boolean {
  return /^(?:[a-z][a-z0-9]*-[a-zA-Z0-9+]+_)*(?:T1w|T2w|T2starw|FLAIR|FLASH|PDw|PDT2|inplaneT1|inplaneT2|angio|dwi|bold|sbref|epi|phasediff|phase[12]|magnitude[12]?|fieldmap|mask|dseg|probseg|asl|m0scan|aslcontext|events|channels|electrodes|coordsystem|sessions|scans|physio|stim|eeg|meg|ieeg|pet)\.(?:nii(?:\.gz)?|json|tsv(?:\.gz)?|bval|bvec|edf|bdf|vhdr|vmrk|eeg|set|fdt|fif|snirf|gii|h5)$/.test(
    name,
  );
}

export async function recognizableEntries(
  entries: readonly DirectoryEntry[],
  signal: AbortSignal,
): Promise<readonly DirectoryEntry[]> {
  const visible: DirectoryEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (i % 256 === 0) {
      await setImmediate();
      signal.throwIfAborted();
    }
    if (isRecognizedBidsEntry(entries[i])) visible.push(entries[i]);
  }
  signal.throwIfAborted();
  return Object.freeze(visible);
}
