import { lstat, opendir } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  inheritanceBoundary,
  resolveInheritance,
  type MetadataLevel,
  type InheritanceResult,
} from '../core/inheritance';
import { parseJsonMetadata } from '../core/metadata';
import type { DirectoryEntry } from '../core/directory';
import { readTextSnapshot } from './previewText';

const nativeIO = { lstat, opendir, readTextSnapshot };

/** Selected-file ancestor walk only. No image reads, recursive search or persistent cache. */
export async function loadInheritedMetadata(
  datasetUri: string,
  uri: string,
  signal: AbortSignal,
  io: typeof nativeIO = nativeIO,
): Promise<InheritanceResult> {
  signal.throwIfAborted();
  const root = fileURLToPath(datasetUri),
    path = fileURLToPath(uri);
  const rel = relative(root, path);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || rel.startsWith(sep))
    throw new Error('Choose a file inside the registered dataset.');
  const target: DirectoryEntry = Object.freeze({
    datasetUri,
    uri: pathToFileURL(path).href,
    relativePath: rel.split(sep).join('/'),
    name: basename(path),
    kind: 'file',
  });
  const boundary = inheritanceBoundary(target);
  const parts = target.relativePath.split('/').slice(0, -1);
  const directories = ['', ...parts.map((_, i) => parts.slice(0, i + 1).join('/'))];
  let start = directories.indexOf(boundary);
  const revisions = new Map<string, Awaited<ReturnType<typeof lstat>>>();
  // Check each lexical ancestor before opening it. Never resolve links out of this hierarchy.
  for (let i = 0; i < directories.length; i++) {
    signal.throwIfAborted();
    const directory = join(root, directories[i]);
    const stat = await io.lstat(directory);
    if (!stat.isDirectory())
      throw new Error('Metadata ancestors must be ordinary directories, not symbolic links.');
    if (i < start) continue;
    revisions.set(directory, stat);
    if (i > start) {
      try {
        const marker = await io.lstat(join(directory, 'dataset_description.json'));
        if (marker.isFile()) start = i;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
  const targetStat = await io.lstat(path);
  if (!targetStat.isFile()) throw new Error('Select an ordinary data file, not a symbolic link.');
  revisions.set(path, targetStat);
  const levels: MetadataLevel[] = [];
  for (const relativePath of directories.slice(start)) {
    signal.throwIfAborted();
    const entries: DirectoryEntry[] = [];
    let error: string | undefined;
    try {
      const directory = await io.opendir(join(root, relativePath));
      for await (const item of directory) {
        signal.throwIfAborted();
        if (entries.length === 50000)
          throw new Error('Directory inspection limited to 50,000 entries.');
        entries.push(
          Object.freeze({
            datasetUri,
            uri: pathToFileURL(join(root, relativePath, item.name)).href,
            relativePath: relativePath ? relativePath + '/' + item.name : item.name,
            name: item.name,
            kind: item.isFile()
              ? 'file'
              : item.isSymbolicLink()
                ? 'symlink'
                : item.isDirectory()
                  ? 'directory'
                  : 'other',
          }),
        );
      }
    } catch (cause) {
      signal.throwIfAborted();
      error = String(cause);
    }
    levels.push(
      Object.freeze({
        relativePath,
        coverage: error ? 'incomplete' : 'complete',
        error,
        entries: Object.freeze(entries),
      }),
    );
  }
  const result = await resolveInheritance(
    target,
    levels,
    async (entry, abort) => {
      const snapshot = await io.readTextSnapshot(entry.uri, abort);
      return parseJsonMetadata(snapshot, abort);
    },
    signal,
  );
  for (const [name, before] of revisions) {
    signal.throwIfAborted();
    const after = await io.lstat(name);
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.mtimeMs !== after.mtimeMs ||
      before.size !== after.size
    )
      throw new Error('Source changed during metadata inspection. Run Inspect again.');
  }
  for (const source of result.sources) {
    if (!source.metadata) continue;
    const stat = await io.lstat(fileURLToPath(source.entry.uri));
    if (
      !stat.isFile() ||
      stat.size !== source.metadata.snapshot.revision.size ||
      stat.mtimeMs !== source.metadata.snapshot.revision.modifiedAt
    )
      throw new Error('Metadata changed during inspection. Run Inspect again.');
  }
  signal.throwIfAborted();
  return result;
}
