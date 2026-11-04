import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseDatasetDescription,
  parseJsonMetadata,
  type DatasetDescription,
} from '../core/metadata';
import type { MetadataDocument } from '../core/metadataTypes';
import { readTextSnapshot } from './previewText';

export async function loadDatasetDescription(
  uri: string,
  signal: AbortSignal,
): Promise<DatasetDescription> {
  if (basename(fileURLToPath(uri)) !== 'dataset_description.json')
    throw new Error('Choose a dataset_description.json file.');
  return parseDatasetDescription(await readTextSnapshot(uri, signal), signal);
}

/** Recorded JSON fields only: viewing a sidecar does not imply effective inherited values. */
export async function loadJsonMetadata(
  uri: string,
  signal: AbortSignal,
): Promise<MetadataDocument> {
  const name = basename(fileURLToPath(uri));
  if (name === 'dataset_description.json') return loadDatasetDescription(uri, signal);
  if (!name.endsWith('.json')) throw new Error('Choose a JSON metadata file.');
  const data = await parseJsonMetadata(await readTextSnapshot(uri, signal), signal);
  return Object.freeze({
    ...data,
    kind: 'json-sidecar',
    summary: Object.freeze({}),
    coverage: 'selected-file-only',
  });
}
