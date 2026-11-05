/** URI strings preserve remote schemes; logical paths never identify a physical source. */
export interface PhysicalResource {
  readonly sourceUri: string;
  readonly memberPath?: string;
  /** Central-directory ordinal preserves distinct duplicate-name archive members. */
  readonly memberIndex?: number;
}

export interface LogicalEntry {
  readonly datasetId: string;
  readonly relativePath: string;
  readonly sources: readonly PhysicalResource[];
}

export type Coverage = 'unknown' | 'partial' | 'complete' | 'failed';

/** Revision belongs in cache keys, rather than stable physical selection identity. */
export function physicalResourceKey(resource: PhysicalResource): string {
  return JSON.stringify([
    resource.sourceUri,
    resource.memberPath ?? null,
    resource.memberIndex ?? null,
  ]);
}
