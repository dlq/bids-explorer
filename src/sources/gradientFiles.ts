import { lstat, open, type FileHandle } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { parseGradients, type GradientTable } from '../core/gradients';

export const MAX_GRADIENT_BYTES = 1024 * 1024;
export interface GradientPreviewData {
  readonly bvalUri: string;
  readonly bvecUri: string;
  readonly table: GradientTable;
  readonly bvalText: string;
  readonly bvecText: string;
}

export function gradientPair(uri: string): { bvalUri: string; bvecUri: string } {
  const path = resolve(fileURLToPath(uri));
  if (!/\.(bval|bvec)$/.test(path)) throw new Error('Choose a .bval or .bvec file.');
  const stem = path.slice(0, -5);
  return {
    bvalUri: pathToFileURL(stem + '.bval').toString(),
    bvecUri: pathToFileURL(stem + '.bvec').toString(),
  };
}

/** Bounded handle reads, no symlink leaves, and revision checks before/after reading. */
export interface GradientReadIO {
  stat: typeof lstat;
  open: (path: string) => Promise<Pick<FileHandle, 'stat' | 'read' | 'close'>>;
}
const nativeIO: GradientReadIO = { stat: lstat, open: (path) => open(path, 'r') };

export async function readGradientText(
  uri: string,
  signal: AbortSignal,
  io: GradientReadIO = nativeIO,
): Promise<string> {
  signal.throwIfAborted();
  const path = fileURLToPath(uri);
  const before = await io.stat(path);
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error(
      'Gradient preview reads ordinary files only, not symbolic links or special files.',
    );
  if (before.size > MAX_GRADIENT_BYTES)
    throw new Error('Gradient preview is limited to 1 MiB per file.');
  let handle: Pick<FileHandle, 'stat' | 'read' | 'close'> | undefined;
  try {
    handle = await io.open(path);
    const opened = await handle.stat();
    if (opened.ino !== before.ino || opened.dev !== before.dev)
      throw new Error('Gradient source changed while opening; retry the preview.');
    const bytes = Buffer.alloc(Math.min(before.size + 1, MAX_GRADIENT_BYTES + 1));
    let offset = 0;
    while (offset < bytes.length) {
      signal.throwIfAborted();
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    const after = await handle.stat();
    const current = await io.stat(path);
    if (
      offset !== before.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs ||
      current.ino !== opened.ino ||
      current.dev !== opened.dev ||
      current.size !== before.size ||
      current.mtimeMs !== before.mtimeMs
    )
      throw new Error('Gradient source changed while reading; retry the preview.');
    signal.throwIfAborted();
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, offset));
  } finally {
    await handle?.close();
  }
}

export async function loadGradientPair(
  uri: string,
  signal: AbortSignal,
): Promise<GradientPreviewData> {
  const pair = gradientPair(uri);
  // Each selected file has its own revision check; this is a snapshot, not an atomic pair transaction.
  const [bval, bvec] = await Promise.all([
    readGradientText(pair.bvalUri, signal),
    readGradientText(pair.bvecUri, signal),
  ]);
  await setImmediate();
  signal.throwIfAborted();
  return { ...pair, table: parseGradients(bval, bvec), bvalText: bval, bvecText: bvec };
}
