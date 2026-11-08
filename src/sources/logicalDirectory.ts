import { assertArchivePath, type ArchivePlacement } from '../core/archive';
import { mergeSquashfsBranches, squashfsBranch, squashfsSuffix } from './squashfsCollection';
import { logicalChildren, logicalFolder, layoutHint } from '../core/logicalLayout';
import { type DirectoryEntry, type DirectorySource, type SourceRevision } from '../core/directory';
import { ArchiveDirectorySource } from './archiveDirectory';

type SavedPlacement = Omit<ArchivePlacement, 'index'> & { archivePath: string };

export function savedArchivePlacements(configured: unknown, datasetUri: string): SavedPlacement[] {
  if (!configured || typeof configured !== 'object' || !Object.hasOwn(configured, datasetUri))
    return [];
  const rows = (configured as Record<string, unknown>)[datasetUri];
  if (!Array.isArray(rows) || rows.length > 32)
    throw new Error('A dataset can have up to 32 saved archive placements.');
  const seen = new Set<string>();
  return rows.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid saved archive placement.');
    const { archivePath, memberRoot, logicalRoot } = row as Partial<SavedPlacement>;
    if (
      typeof archivePath !== 'string' ||
      typeof memberRoot !== 'string' ||
      typeof logicalRoot !== 'string'
    )
      throw new Error('Archive placements require archivePath, memberRoot and logicalRoot.');
    assertArchivePath(archivePath);
    assertArchivePath(memberRoot, true);
    assertArchivePath(logicalRoot, true);
    if (seen.has(archivePath)) throw new Error('Declare each archive path only once.');
    seen.add(archivePath);
    return { archivePath, memberRoot, logicalRoot };
  });
}

/** Dataset-scoped logical overlay. Original entries remain the authoritative source choices. */
export class LogicalDirectorySource implements DirectorySource {
  constructor(
    private readonly physical: DirectorySource &
      Partial<Pick<ArchiveDirectorySource, 'placeArchive'>> = new ArchiveDirectorySource(),
    private readonly configuredPlacements: () => unknown = () => undefined,
  ) {}
  root(uri: string): Promise<DirectoryEntry> {
    return this.physical.root(uri);
  }
  revision(entry: DirectoryEntry): Promise<SourceRevision> {
    return this.physical.revision(entry.logical ? entry.logical.sources[0] : entry);
  }
  refresh(scope?: DirectoryEntry): void {
    if (scope?.logical) for (const source of scope.logical.sources) this.physical.refresh?.(source);
    else this.physical.refresh?.(scope);
  }

  private async contents(
    source: DirectoryEntry,
    context: DirectoryEntry,
    signal: AbortSignal,
  ): Promise<readonly DirectoryEntry[]> {
    if (source.placedChildren) return source.placedChildren;
    const children = await this.physical.children(source, signal);
    if (!source.archive || source.archive.memberPath !== '') return children;
    const subject = context.logical?.subject;
    const session = context.logical?.session;
    if (!subject) {
      const wrapper = children.find((child) => child.archive?.datasetWrapper);
      return wrapper ? this.physical.children(wrapper, signal) : children;
    }
    const combined = session ? `sub-${subject}_ses-${session}` : undefined;
    const wrapper = children.find(
      (child) =>
        child.kind === 'directory' && (child.name === combined || child.name === `sub-${subject}`),
    );
    if (!wrapper) {
      if (
        children.some((child) => {
          const hint = layoutHint(child);
          return hint?.subject && (hint.subject !== subject || !!session);
        })
      )
        throw new Error(
          'Archive member subjects disagree with its provisional filename placement. Inspect the archive source; no subjects were silently reassigned.',
        );
      return children;
    }
    let result = await this.physical.children(wrapper, signal);
    if (session && wrapper.name === `sub-${subject}`) {
      const sessionFolder = result.find(
        (child) => child.kind === 'directory' && child.name === `ses-${session}`,
      );
      if (!sessionFolder)
        throw new Error(
          'Archive does not contain the session indicated by its filename. Inspect the archive source.',
        );
      result = await this.physical.children(sessionFolder, signal);
    }
    // Never silently discard additional top-level sources while removing an exact matching wrapper.
    if (children.some((child) => child !== wrapper && child.archive?.visible !== false))
      throw new Error(
        'Archive has additional entries outside its matching subject wrapper. Explicit placement is required.',
      );
    return result;
  }

  private async mount(
    placement: SavedPlacement,
    rootChildren: readonly DirectoryEntry[],
    budget: { remaining: number },
    signal: AbortSignal,
  ): Promise<readonly DirectoryEntry[]> {
    const segments = placement.archivePath.split('/');
    let children = rootChildren;
    for (const segment of segments.slice(0, -1)) {
      const folder = children.find(
        (child) => child.name === segment && child.kind === 'directory' && !child.archive,
      );
      if (!folder)
        throw new Error(`Archive placement path was not found: ${placement.archivePath}`);
      children = await this.physical.children(folder, signal);
    }
    const container = children.find(
      (child) => child.name === segments.at(-1) && child.archive?.memberPath === '',
    );
    if (!container || !this.physical.placeArchive)
      throw new Error(`Saved placement needs a ZIP or tar archive: ${placement.archivePath}`);
    return this.physical.placeArchive(container, placement, budget, signal);
  }

  async children(
    parent: DirectoryEntry,
    signal: AbortSignal,
    beforeUnnamedArchive?: (entry: DirectoryEntry) => Promise<void>,
  ): Promise<readonly DirectoryEntry[]> {
    signal.throwIfAborted();
    if (parent.kind !== 'directory') return [];
    if (parent.metadataVersions) return parent.metadataVersions;
    const placements = savedArchivePlacements(this.configuredPlacements(), parent.datasetUri);
    const placedPaths = new Set(placements.map(({ archivePath }) => archivePath));
    const candidates: DirectoryEntry[] = [];
    const shards: ReturnType<typeof squashfsBranch>[] = [];
    const sources = parent.logical?.sources ?? [parent];
    if (sources.length > 10_000)
      throw new Error('Logical branch exceeds 10,000 physical source choices.');
    const placementBudget = { remaining: 100_000 };
    let expanded = 0;
    let expandedTar = false;
    for (const source of sources) {
      signal.throwIfAborted();
      if (
        source.squashfsRead &&
        !(parent.logical?.kind === 'subject' && layoutHint(source)?.session)
      ) {
        shards.push(squashfsBranch(parent, source));
        continue;
      }
      const hint = layoutHint(source);
      if (parent.logical?.kind === 'subject' && hint?.session) {
        // Do not open thousands of archives to discover sessions already recorded in their names.
        candidates.push(
          logicalFolder(
            parent,
            `ses-${hint.session}`,
            'session',
            [source],
            parent.logical.subject,
            hint.session,
          ),
        );
        continue;
      }
      const children = await this.contents(source, parent, signal);
      if (!parent.relativePath) {
        for (const placement of placements)
          candidates.push(...(await this.mount(placement, children, placementBudget, signal)));
      }
      for (const child of children) {
        if (
          child.archive?.memberPath === '' &&
          !child.placedChildren &&
          placedPaths.has(child.archive.containerPath)
        )
          continue;
        if (child.kind === 'file' && !child.archive && squashfsSuffix.test(child.name)) {
          shards.push(squashfsBranch(parent, child));
          continue;
        }
        const tar = child.archive?.format === 'tar';
        if (
          child.archive?.memberPath === '' &&
          !layoutHint(child) &&
          (tar ? !expandedTar : expanded < 32)
        ) {
          if (tar) expandedTar = true;
          else expanded++;
          await beforeUnnamedArchive?.(child);
          try {
            candidates.push(...(await this.contents(child, parent, signal)));
          } catch (error) {
            signal.throwIfAborted();
            if (!tar) throw error;
            // Keep an unreadable tar expandable so its error can be inspected independently.
            candidates.push(child);
          }
        } else candidates.push(child);
      }
      if (candidates.length > 100_000)
        throw new Error('Logical branch exceeds 100,000 navigation entries.');
    }
    return shards.length
      ? mergeSquashfsBranches(parent, candidates, shards, signal)
      : logicalChildren(parent, candidates, signal);
  }
}
