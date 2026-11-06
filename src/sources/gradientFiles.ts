import { isArchiveUri, resourcePath } from '../core/archiveUri';
import { archiveSiblings } from './archiveMetadata';
import type { InheritanceResult } from '../core/inheritance';
import type { DirectoryEntry } from '../core/directory';
import { loadInheritedMetadata } from './inheritedMetadata';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import {
  readTextSnapshot,
  MAX_TEXT_SNAPSHOT_BYTES,
  type TextSnapshotReadIO,
} from './textSnapshotReader';
import { parseGradients, type GradientTable } from '../core/gradients';

export const MAX_GRADIENT_BYTES = MAX_TEXT_SNAPSHOT_BYTES;
export interface GradientPreviewData {
  readonly imageUri?: string;
  readonly bvalUri: string;
  readonly bvecUri: string;
  readonly table: GradientTable;
  readonly bvalText: string;
  readonly bvecText: string;
}

export function gradientPair(uri: string): { bvalUri: string; bvecUri: string } {
  const path = resolve(fileURLToPath(uri));
  if (!/\.(bval|bvec)$/.test(path)) throw new Error('Choose a .bval or .bvec file.');
  const stem = path.slice(0, -5);
  return {
    bvalUri: pathToFileURL(stem + '.bval').toString(),
    bvecUri: pathToFileURL(stem + '.bvec').toString(),
  };
}

export type { TextSnapshotReadIO as GradientReadIO } from './textSnapshotReader';

export async function readGradientText(
  uri: string,
  signal: AbortSignal,
  io?: TextSnapshotReadIO,
): Promise<string> {
  return (await readTextSnapshot(uri, signal, io)).text;
}

export async function loadGradientPair(
  uri: string,
  signal: AbortSignal,
): Promise<GradientPreviewData> {
  if (isArchiveUri(uri)) {
    const stem = resourcePath(uri).replace(/\.(bval|bvec)$/, '');
    const pair = await archiveSiblings(uri, [stem + '.bval', stem + '.bvec'], signal);
    return loadExplicitGradientPair(pair[0], pair[1], signal);
  }
  const pair = gradientPair(uri);
  return loadExplicitGradientPair(pair.bvalUri, pair.bvecUri, signal);
}

export async function loadExplicitGradientPair(
  bvalUri: string,
  bvecUri: string,
  signal: AbortSignal,
): Promise<GradientPreviewData> {
  if (!resourcePath(bvalUri).endsWith('.bval') || !resourcePath(bvecUri).endsWith('.bvec'))
    throw new Error('Choose bval and bvec sources.');
  // Independent revision-checked reads, not an atomic pair or image-volume check.
  const [bval, bvec] = await Promise.all([
    readGradientText(bvalUri, signal),
    readGradientText(bvecUri, signal),
  ]);
  await setImmediate();
  signal.throwIfAborted();
  return { bvalUri, bvecUri, table: parseGradients(bval, bvec), bvalText: bval, bvecText: bvec };
}

export async function loadInheritedGradientPair(
  entry: DirectoryEntry,
  signal: AbortSignal,
  load: (entry: DirectoryEntry, signal: AbortSignal) => Promise<InheritanceResult> = (
    target,
    abort,
  ) => loadInheritedMetadata(target.datasetUri, target.uri, abort),
): Promise<GradientPreviewData> {
  const result = await load(entry, signal);
  const bval = result.related.find((item) => item.extension === '.bval'),
    bvec = result.related.find((item) => item.extension === '.bvec');
  if (bval?.status !== 'resolved' || bvec?.status !== 'resolved')
    throw new Error(
      'Both inherited gradient sources must resolve unambiguously. Inspect metadata for coverage and source choices.',
    );
  const data = await loadExplicitGradientPair(bval.selected!.uri, bvec.selected!.uri, signal);
  return { ...data, imageUri: result.target.uri };
}
