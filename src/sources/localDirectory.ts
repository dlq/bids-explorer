import { lstat, readdir } from 'node:fs/promises';
import { basename, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setImmediate } from 'node:timers/promises';
import {
  orderEntries,
  type DirectoryEntry,
  type DirectorySource,
  type SourceRevision,
} from '../core/directory';

/** Restores registration without traversing or statting an unavailable dataset. */
export function directoryRoot(uri: string): DirectoryEntry {
  const path = resolve(fileURLToPath(uri));
  const canonicalUri = pathToFileURL(path).toString();
  return Object.freeze({
    datasetUri: canonicalUri,
    uri: canonicalUri,
    relativePath: '',
    name: basename(path) || path,
    kind: 'directory',
  });
}

/** Runs on the workspace host. Never interprets a logical path as a source path. */
export class LocalDirectorySource implements DirectorySource {
  async root(uri: string): Promise<DirectoryEntry> {
    const path = fileURLToPath(uri);
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('Choose an ordinary directory; symbolic-link roots are not followed.');
    }
    return directoryRoot(uri);
  }

  async children(parent: DirectoryEntry, signal: AbortSignal): Promise<readonly DirectoryEntry[]> {
    signal.throwIfAborted();
    const path = fileURLToPath(parent.uri);
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('The directory is no longer an ordinary directory. Refresh its parent.');
    const children = await readdir(path, { withFileTypes: true });
    const entries: DirectoryEntry[] = [];
    for (let i = 0; i < children.length; i++) {
      if (i % 256 === 0) {
        await setImmediate();
        signal.throwIfAborted();
      }
      const child = children[i];
      const uri = new URL(parent.uri);
      uri.pathname = uri.pathname.replace(/\/$/, '') + '/' + encodeURIComponent(child.name);
      entries.push(
        Object.freeze({
          datasetUri: parent.datasetUri,
          uri: uri.toString(),
          relativePath: parent.relativePath ? `${parent.relativePath}/${child.name}` : child.name,
          name: child.name,
          kind: child.isSymbolicLink()
            ? 'symlink'
            : child.isDirectory()
              ? 'directory'
              : child.isFile()
                ? 'file'
                : 'other',
        }),
      );
    }
    return orderEntries(entries, signal);
  }

  async revision(entry: DirectoryEntry): Promise<SourceRevision> {
    const stat = await lstat(fileURLToPath(entry.uri));
    if (stat.isSymbolicLink())
      throw new Error('Symbolic links are not followed. Refresh the parent directory.');
    return { size: stat.size, modifiedAt: stat.mtimeMs };
  }
}

/** Two shallow stats at most; the descriptor contents are neither read nor validated. */
export async function recognizeLocalDataset(
  uri: string,
  stat: (
    path: string,
  ) => Promise<Pick<import('node:fs').Stats, 'isDirectory' | 'isFile' | 'isSymbolicLink'>> = lstat,
): Promise<DirectoryEntry | undefined> {
  if (new URL(uri).protocol !== 'file:') return undefined;
  const path = fileURLToPath(uri);
  const root = await stat(path);
  if (!root.isDirectory() || root.isSymbolicLink()) return undefined;
  try {
    const marker = await stat(join(path, 'dataset_description.json'));
    if (!marker.isFile() || marker.isSymbolicLink()) return undefined;
    return directoryRoot(uri);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
      return undefined;
    throw error;
  }
}
