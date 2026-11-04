import type { TextSnapshot } from './textSnapshot';

export type MetadataValueType = 'string' | 'object' | 'array' | 'null' | 'boolean' | 'number';
export interface RecordedMetadataField {
  readonly key: string;
  /** Exact JSON value text: no numeric coercion or loss of duplicate entries. */
  readonly valueText: string;
  readonly type: MetadataValueType;
  readonly sourceUri: string;
  readonly pointer: string;
  readonly occurrence: number;
  readonly duplicated: boolean;
}
export interface JsonMetadata {
  readonly snapshot: TextSnapshot;
  readonly fields: readonly RecordedMetadataField[];
  readonly duplicateKeys: readonly string[];
}
export interface MetadataDocument extends JsonMetadata {
  readonly kind: 'dataset-description' | 'json-sidecar';
  readonly summary: Readonly<{ name?: string; bidsVersion?: string; datasetType?: string }>;
  readonly coverage: 'selected-file-only';
}

export interface DatasetDescription extends MetadataDocument {
  readonly kind: 'dataset-description';
}
