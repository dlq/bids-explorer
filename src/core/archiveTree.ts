import { setImmediate } from 'node:timers/promises';
import { mergeArchivePlacements, type ArchiveInventory, type ArchivePlacement } from './archive';
import { isRecognizedBidsEntry, orderEntries, type DirectoryEntry } from './directory';

/** Build a bounded physical archive tree; no filename-derived dataset joins or reparenting. */
export async function archiveTree(
  container: DirectoryEntry,
  index: ArchiveInventory,
  signal: AbortSignal,
  placement?: Omit<ArchivePlacement, 'index'>,
): Promise<ReadonlyMap<string, readonly DirectoryEntry[]>> {
  const logical = await mergeArchivePlacements(
    [{ index, memberRoot: '', logicalRoot: '', ...placement }],
    signal,
  );
  const visible = new Set<string>();
  let wrapper: string | undefined;
  if (!placement && container.archive?.format === 'tar') {
    const roots = logical.filter((entry) => !entry.relativePath.includes('/'));
    if (roots.length === 1 && roots[0].kinds.length === 1 && roots[0].kinds[0] === 'directory') {
      const prefix = roots[0].relativePath;
      if (
        logical.some(
          (entry) =>
            entry.relativePath === prefix + '/dataset_description.json' &&
            entry.kinds.length === 1 &&
            entry.kinds[0] === 'file' &&
            entry.sources.length === 1,
        )
      )
        wrapper = prefix;
    }
  }
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
    const relativePath = wrapper
      ? entry.relativePath.slice(wrapper.length + 1)
      : entry.relativePath;
    const recognized = isRecognizedBidsEntry({
      datasetUri: container.datasetUri,
      uri: container.uri,
      relativePath,
      name,
      kind: entry.kinds.includes('directory') ? 'directory' : 'file',
    });
    if (!recognized && (!scientific || container.archive?.format === 'tar')) continue;
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
    if (placement && !visible.has(entry.relativePath)) continue;
    const parts = entry.relativePath.split('/');
    const parent = parts.slice(0, -1).join('/');
    let siblings = branches.get(parent);
    if (!siblings) {
      siblings = [];
      branches.set(parent, siblings);
    }
    let physicalPath = entry.relativePath;
    if (placement) {
      const { memberRoot, logicalRoot } = placement;
      const withinMount =
        !logicalRoot ||
        entry.relativePath === logicalRoot ||
        entry.relativePath.startsWith(logicalRoot + '/');
      physicalPath = withinMount
        ? [memberRoot, entry.relativePath.slice(logicalRoot.length).replace(/^\//, '')]
            .filter(Boolean)
            .join('/')
        : '';
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
            relativePath: placement
              ? entry.relativePath
              : container.relativePath + '/' + entry.relativePath,
            name: parts.at(-1)!,
            kind: kind === 'special' ? 'other' : kind,
            archive:
              placement && !physicalPath
                ? undefined
                : Object.freeze({
                    ...(container.archive?.format && { format: container.archive.format }),
                    sourceUri: index.sourceUri,
                    containerPath: container.relativePath,
                    memberPath: choice?.memberPath ?? physicalPath,
                    memberIndex: choice?.memberIndex,
                    choices: Object.freeze(choice ? [choice] : choices),
                    revision: index.revision,
                    ...(entry.relativePath === wrapper ? { datasetWrapper: true } : {}),
                    conflict: entry.conflict,
                    visible: visible.has(entry.relativePath),
                  }),
          }),
        );
    }
  }
  const ordered = new Map<string, readonly DirectoryEntry[]>();
  for (const [path, children] of branches) ordered.set(path, await orderEntries(children, signal));
  if (placement) {
    for (const path of [...ordered.keys()].sort((a, b) => b.length - a.length)) {
      ordered.set(
        path,
        ordered.get(path)!.map((entry) => {
          const original = {
            ...entry,
            relativePath: entry.archive
              ? container.relativePath + '/' + entry.archive.memberPath.replace(/\/$/, '')
              : container.relativePath,
          };
          // Source Details serializes entries. Keep the navigation index out of that report.
          if (entry.kind === 'directory')
            Object.defineProperty(original, 'placedChildren', {
              value: ordered.get(entry.relativePath) ?? [],
            });
          return Object.freeze(original);
        }),
      );
    }
  }
  return ordered;
}
