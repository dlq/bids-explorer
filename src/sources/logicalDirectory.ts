import { logicalChildren, logicalFolder, layoutHint } from '../core/logicalLayout';
import { type DirectoryEntry, type DirectorySource, type SourceRevision } from '../core/directory';
import { ZipDirectorySource } from './zipDirectory';

/** Dataset-scoped logical overlay. Original entries remain the authoritative source choices. */
export class LogicalDirectorySource implements DirectorySource {
  constructor(private readonly physical: DirectorySource = new ZipDirectorySource()) {}
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

  async children(
    parent: DirectoryEntry,
    signal: AbortSignal,
    beforeUnnamedArchive?: (entry: DirectoryEntry) => Promise<void>,
  ): Promise<readonly DirectoryEntry[]> {
    signal.throwIfAborted();
    if (parent.kind !== 'directory') return [];
    const candidates: DirectoryEntry[] = [];
    const sources = parent.logical?.sources ?? [parent];
    if (sources.length > 10_000)
      throw new Error('Logical branch exceeds 10,000 physical source choices.');
    let expanded = 0;
    let expandedTar = false;
    for (const source of sources) {
      signal.throwIfAborted();
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
      for (const child of children) {
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
    return logicalChildren(parent, candidates, signal);
  }
}
