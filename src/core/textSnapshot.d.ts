import type { SourceRevision } from './sourceRevision';

/** One explicit read, not an index or an inheritance result. */
export interface TextSnapshot {
  readonly sourceUri: string;
  readonly text: string;
  readonly revision: SourceRevision;
  readonly capturedAt: string;
}
