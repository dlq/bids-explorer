import { setImmediate } from 'node:timers/promises';
import type { TextSnapshot } from './textSnapshot';

export const MAX_METADATA_FIELDS = 1000;
export const MAX_METADATA_DEPTH = 32;
import type {
  DatasetDescription,
  JsonMetadata,
  RecordedMetadataField,
  MetadataValueType,
} from './metadataTypes';
export type { DatasetDescription, RecordedMetadataField } from './metadataTypes';

async function yieldScan(signal: AbortSignal): Promise<void> {
  await setImmediate();
  signal.throwIfAborted();
}
async function stringEnd(text: string, start: number, signal: AbortSignal): Promise<number> {
  let i = start + 1;
  for (; i < text.length; i++) {
    if (i % 4096 === 0) await yieldScan(signal);
    if (text[i] === '\\') i++;
    else if (text[i] === '"') break;
  }
  return i + 1;
}
async function valueEnd(text: string, start: number, signal: AbortSignal): Promise<number> {
  let depth = 0,
    i = start;
  for (; i < text.length; i++) {
    if (i % 4096 === 0) await yieldScan(signal);
    const ch = text[i];
    if (ch === '"') i = (await stringEnd(text, i, signal)) - 1;
    else if (ch === '{' || ch === '[') {
      if (++depth > MAX_METADATA_DEPTH)
        throw new Error('Metadata preview nesting exceeds 32 levels. Open the original as text.');
    } else if (ch === '}' || ch === ']') {
      if (depth === 0) break;
      depth--;
    } else if (ch === ',' && depth === 0) break;
  }
  return i;
}
function valueType(text: string): MetadataValueType {
  if (text[0] === '"') return 'string';
  if (text[0] === '{') return 'object';
  if (text[0] === '[') return 'array';
  if (text[0] === 'n') return 'null';
  if (text[0] === 't' || text[0] === 'f') return 'boolean';
  return 'number';
}

/** A literal snapshot, not BIDS validation, inheritance, or source-dataset linking. */
export async function parseJsonMetadata(
  input: TextSnapshot,
  signal: AbortSignal,
): Promise<JsonMetadata> {
  signal.throwIfAborted();
  const snapshot = Object.freeze({ ...input, revision: Object.freeze({ ...input.revision }) });
  if (snapshot.text.length > 1024 * 1024)
    throw new Error('Metadata preview is limited to 1 MiB of text.');
  await setImmediate();
  signal.throwIfAborted();
  // Validate syntax only. Fields are then scanned losslessly instead of using the coerced object.
  const parsed: unknown = JSON.parse(snapshot.text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Metadata preview requires a JSON object. Open the original as text.');
  const text = snapshot.text;
  let i = text.indexOf('{') + 1;
  const fields: RecordedMetadataField[] = [],
    counts = new Map<string, number>();
  const whitespace = (): void => {
    while (/\s/.test(text[i] ?? '') && i < text.length) i++;
  };
  while (true) {
    whitespace();
    if (text[i] === '}') break;
    if (fields.length === MAX_METADATA_FIELDS)
      throw new Error('Metadata preview is limited to 1,000 fields. Open the original as text.');
    const endKey = await stringEnd(text, i, signal);
    const key = JSON.parse(text.slice(i, endKey)) as string;
    i = endKey;
    whitespace();
    i++;
    whitespace();
    const end = await valueEnd(text, i, signal);
    const valueText = text.slice(i, end).trimEnd();
    const occurrence = (counts.get(key) ?? 0) + 1;
    counts.set(key, occurrence);
    fields.push({
      key,
      valueText,
      type: valueType(valueText),
      sourceUri: snapshot.sourceUri,
      pointer: '/' + key.replace(/~/g, '~0').replace(/\//g, '~1'),
      occurrence,
      duplicated: false,
    });
    i = end;
    if (text[i] === ',') i++;
  }
  signal.throwIfAborted();
  const records = Object.freeze(
    fields.map((field) => Object.freeze({ ...field, duplicated: counts.get(field.key)! > 1 })),
  );
  return Object.freeze({
    snapshot,
    fields: records,
    duplicateKeys: Object.freeze([...counts].filter(([, count]) => count > 1).map(([key]) => key)),
  });
}

/** Literal dataset fields, with a small display summary and no inferred defaults. */
export async function parseDatasetDescription(
  input: TextSnapshot,
  signal: AbortSignal,
): Promise<DatasetDescription> {
  const metadata = await parseJsonMetadata(input, signal);
  const records = metadata.fields;
  const summary: { name?: string; bidsVersion?: string; datasetType?: string } = {};
  for (const [key, label] of [
    ['Name', 'name'],
    ['BIDSVersion', 'bidsVersion'],
    ['DatasetType', 'datasetType'],
  ] as const) {
    const field = records.find((f) => f.key === key);
    if (field?.type === 'string' && !field.duplicated)
      summary[label] = JSON.parse(field.valueText) as string;
  }
  return Object.freeze({
    kind: 'dataset-description',
    ...metadata,
    summary: Object.freeze(summary),
    coverage: 'selected-file-only',
  });
}
