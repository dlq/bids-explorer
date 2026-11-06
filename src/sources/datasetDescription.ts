import { basename } from 'node:path';
import { resourcePath } from '../core/archiveUri';
import {
  parseDatasetDescription,
  parseJsonMetadata,
  type DatasetDescription,
} from '../core/metadata';
import type { MetadataDocument } from '../core/metadataTypes';
import { readTextSnapshot } from './textSnapshotReader';

export async function loadDatasetDescription(
  uri: string,
  signal: AbortSignal,
): Promise<DatasetDescription> {
  if (basename(resourcePath(uri)) !== 'dataset_description.json')
    throw new Error('Choose a dataset_description.json file.');
  return parseDatasetDescription(await readTextSnapshot(uri, signal), signal);
}

/** Recorded JSON fields only: viewing a sidecar does not imply effective inherited values. */
export async function loadJsonMetadata(
  uri: string,
  signal: AbortSignal,
): Promise<MetadataDocument> {
  const name = basename(resourcePath(uri));
  if (name === 'dataset_description.json') return loadDatasetDescription(uri, signal);
  if (!name.endsWith('.json')) throw new Error('Choose a JSON metadata file.');
  const snapshot = await readTextSnapshot(uri, signal);
  const data = await parseJsonMetadata(snapshot, signal, true);
  return Object.freeze({
    ...data,
    kind: snapshot.text.trimStart().startsWith('[') ? 'json-array' : 'json-sidecar',
    summary: Object.freeze({}),
    coverage: 'selected-file-only',
  });
}
