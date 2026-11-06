import type { Stats } from 'node:fs';

export type RevisionStat = Pick<Stats, 'isFile' | 'dev' | 'ino' | 'size' | 'mtimeMs' | 'ctimeMs'>;

export function sameFileRevision(before: RevisionStat, current: RevisionStat): boolean {
  return (
    current.isFile() &&
    current.dev === before.dev &&
    current.ino === before.ino &&
    current.size === before.size &&
    current.mtimeMs === before.mtimeMs &&
    current.ctimeMs === before.ctimeMs
  );
}
