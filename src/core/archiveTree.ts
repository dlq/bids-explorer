import { setImmediate } from 'node:timers/promises';
import { mergeArchivePlacements, type ArchiveIndex } from './archive';
import { isRecognizedBidsEntry, orderEntries, type DirectoryEntry } from './directory';

/** Build a bounded physical archive tree; no filename-derived dataset joins or reparenting. */
export async function archiveTree(
  container: DirectoryEntry,
  index: ArchiveIndex,
  signal: AbortSignal,
): Promise<ReadonlyMap<string, readonly DirectoryEntry[]>> {
  const logical = await mergeArchivePlacements(
    [{ index, memberRoot: '', logicalRoot: '' }],
    signal,
  );
  const visible = new Set<string>();
  for (let i = 0; i < logical.length; i++) {
    if (i % 256 === 0) {
      await setImmediate();
      signal.throwIfAborted();
    }
    const entry = logical[i];
    const parts = entry.relativePath.split('/');
    if (parts.some((part) => part.startsWith('.'))) continue;
    const name = parts.at(-1)!;
    // Derivative processing folders are navigable only where indexed scientific files back them.
    const scientific = /\.(nii(?:\.gz)?|json|tsv(?:\.gz)?|bval|bvec|trk|tck|gii)$/.test(name);
    const recognized = isRecognizedBidsEntry({
      datasetUri: container.datasetUri,
      uri: container.uri,
      relativePath: entry.relativePath,
      name,
      kind: entry.kinds.includes('directory') ? 'directory' : 'file',
    });
    if (!scientific && !recognized) continue;
    for (let j = 1; j <= parts.length; j++) visible.add(parts.slice(0, j).join('/'));
  }
  const members = new Map(index.members.map((member) => [member.resource.memberIndex, member]));
  const branches = new Map<string, DirectoryEntry[]>();
  for (let i = 0; i < logical.length; i++) {
    if (i % 256 === 0) {
      await setImmediate();
      signal.throwIfAborted();
    }
    const entry = logical[i];
    const parts = entry.relativePath.split('/');
    const parent = parts.slice(0, -1).join('/');
    let siblings = branches.get(parent);
    if (!siblings) {
      siblings = [];
      branches.set(parent, siblings);
    }
    for (const kind of entry.kinds) {
      const choices = entry.sources.filter(
        (source) => members.get(source.memberIndex)!.kind === kind,
      );
      const variants = kind === 'directory' ? [undefined] : choices;
      for (const choice of variants)
        siblings.push(
          Object.freeze({
            datasetUri: container.datasetUri,
            uri: index.sourceUri,
            relativePath: container.relativePath + '/' + entry.relativePath,
            name: parts.at(-1)!,
            kind: kind === 'special' ? 'other' : kind,
            archive: Object.freeze({
              sourceUri: index.sourceUri,
              containerPath: container.relativePath,
              memberPath: choice?.memberPath ?? entry.relativePath,
              memberIndex: choice?.memberIndex,
              choices: Object.freeze(choice ? [choice] : choices),
              revision: index.revision,
              conflict: entry.conflict,
              visible: visible.has(entry.relativePath),
            }),
          }),
        );
    }
  }
  const ordered = new Map<string, readonly DirectoryEntry[]>();
  for (const [path, children] of branches) ordered.set(path, await orderEntries(children, signal));
  return ordered;
}
