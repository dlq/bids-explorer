import { setImmediate } from 'node:timers/promises';
import { combinedFolder } from './entities';
import { isRecognizedBidsEntry, orderEntries, type DirectoryEntry } from './directory';

/** Archive names supply provisional placement within an explicitly registered dataset only. */
export function layoutHint(
  entry: DirectoryEntry,
): { subject?: string; session?: string } | undefined {
  if (entry.kind !== 'directory') return undefined;
  const name = entry.archive?.memberPath === '' ? entry.name.replace(/\.zip$/i, '') : entry.name;
  const combined = combinedFolder(name);
  if (combined) return combined;
  const match = /^(sub|ses)-([a-zA-Z0-9+]+)$/.exec(name);
  return match ? { [match[1] === 'sub' ? 'subject' : 'session']: match[2] } : undefined;
}

export function logicalFolder(
  parent: DirectoryEntry,
  name: string,
  kind: 'subject' | 'session' | 'overlay',
  sources: readonly DirectoryEntry[],
  subject = parent.logical?.subject,
  session = parent.logical?.session,
): DirectoryEntry {
  return Object.freeze({
    datasetUri: parent.datasetUri,
    uri: sources[0].uri,
    relativePath: parent.relativePath ? parent.relativePath + '/' + name : name,
    name,
    kind: 'directory',
    logical: Object.freeze({ kind, sources: Object.freeze([...sources]), subject, session }),
  });
}

/** Overlay directories; retain each physical file choice rather than selecting a winner. */
export async function logicalChildren(
  parent: DirectoryEntry,
  physical: readonly DirectoryEntry[],
  signal: AbortSignal,
): Promise<readonly DirectoryEntry[]> {
  const groups = new Map<
    string,
    {
      kind: 'subject' | 'session' | 'overlay';
      sources: DirectoryEntry[];
      subject?: string;
      session?: string;
    }
  >();
  const result: DirectoryEntry[] = [];
  for (let i = 0; i < physical.length; i++) {
    if (i % 256 === 0) {
      await setImmediate();
      signal.throwIfAborted();
    }
    const entry = physical[i];
    if (entry.logical && entry.logical.kind !== 'resource') {
      const key = JSON.stringify([entry.name, entry.logical.kind]);
      const group = groups.get(key);
      if (group) group.sources.push(...entry.logical.sources);
      else
        groups.set(key, {
          kind: entry.logical.kind,
          sources: [...entry.logical.sources],
          subject: entry.logical.subject,
          session: entry.logical.session,
        });
      continue;
    }
    const hint = parent.relativePath === 'derivatives' ? undefined : layoutHint(entry);
    let kind: 'subject' | 'session' | 'overlay' = 'overlay';
    let name = entry.name;
    let subject = parent.logical?.subject;
    let session = parent.logical?.session;
    if (hint?.subject && !subject) {
      subject = hint.subject;
      session = undefined;
      name = 'sub-' + subject;
      kind = 'subject';
    } else if (hint?.session && (!hint.subject || hint.subject === subject) && !session) {
      session = hint.session;
      name = 'ses-' + session;
      kind = 'session';
    }
    if (entry.kind === 'directory') {
      const key = JSON.stringify([name, kind]);
      let group = groups.get(key);
      if (!group) {
        group = { kind, sources: [], subject, session };
        groups.set(key, group);
      }
      group.sources.push(entry);
    } else {
      result.push(
        Object.freeze({
          ...entry,
          relativePath: parent.relativePath ? parent.relativePath + '/' + entry.name : entry.name,
          logical: Object.freeze({
            kind: 'resource',
            sources: Object.freeze([entry]),
            subject,
            session,
          }),
        }),
      );
    }
  }
  let published = 0;
  for (const [key, group] of groups) {
    if (published++ % 256 === 0) {
      await setImmediate();
      signal.throwIfAborted();
    }
    const [name] = JSON.parse(key) as [string, string];
    result.push(
      logicalFolder(parent, name, group.kind, group.sources, group.subject, group.session),
    );
  }
  const fileCounts = new Map<string, number>();
  const directories = new Set<string>();
  const recognizedNames = new Set<string>();
  for (let i = 0; i < result.length; i++) {
    if (i % 256 === 0) {
      await setImmediate();
      signal.throwIfAborted();
    }
    const entry = result[i];
    if (isRecognizedBidsEntry(entry)) recognizedNames.add(entry.name);
    if (entry.kind === 'directory') directories.add(entry.name);
    else fileCounts.set(entry.name, (fileCounts.get(entry.name) ?? 0) + 1);
  }
  const marked: DirectoryEntry[] = [];
  for (let i = 0; i < result.length; i++) {
    if (i % 256 === 0) {
      await setImmediate();
      signal.throwIfAborted();
    }
    const entry = result[i];
    const files = fileCounts.get(entry.name) ?? 0;
    const conflict = files > 1 || (files > 0 && directories.has(entry.name));
    marked.push(
      Object.freeze({
        ...entry,
        logical: Object.freeze({
          ...entry.logical!,
          conflict,
          visible: conflict && recognizedNames.has(entry.name),
        }),
      }),
    );
  }
  return orderEntries(marked, signal);
}
