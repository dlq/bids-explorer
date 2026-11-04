import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDatasetDescription, type DatasetDescription } from '../core/metadata';
import { readTextSnapshot } from './previewText';

export async function loadDatasetDescription(
  uri: string,
  signal: AbortSignal,
): Promise<DatasetDescription> {
  if (basename(fileURLToPath(uri)) !== 'dataset_description.json')
    throw new Error('Choose a dataset_description.json file.');
  return parseDatasetDescription(await readTextSnapshot(uri, signal), signal);
}
