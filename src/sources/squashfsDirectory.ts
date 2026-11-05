import type { Stats } from 'node:fs';
import { squashfsMetadata } from './squashfsMetadata';
import { assertArchivePath } from '../core/archive';
import { parseSquashfsHeader, withSquashfs } from './squashfsHeader';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export type SquashfsPageRead = (signal: AbortSignal) => Promise<SquashfsPage>;
export interface SquashfsPage {
  readonly entries: readonly {
    readonly name: string;
    readonly kind: 'directory' | 'file' | 'symlink' | 'special';
    readonly open?: SquashfsPageRead;
    readonly memberIndex?: number;
    readonly revision?: { readonly size: number; readonly modifiedAt: number };
  }[];
  readonly directoryIndex: number;
  readonly revision: { readonly size: number; readonly modifiedAt: number };
  readonly next?: SquashfsPageRead;
  readonly verify: (signal: AbortSignal) => Promise<void>;
}

interface Position {
  block: number;
  offset: number;
}
interface Cursor extends Position {
  remaining: number;
  groupRemaining: number;
  inodeBlock: number;
}

function revisionStamp(stat: Pick<Stats, 'dev' | 'ino' | 'size' | 'mtimeMs' | 'ctimeMs'>): string {
  return [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
}

function requireRevision(actual: string, expected: string): void {
  if (actual !== expected)
    throw new Error('SquashFS image changed. Refresh the branch to browse the new revision.');
}

/** Read one directory page in disk order, with continuations tied to the open image revision. */
export function readSquashfsRoot(
  uri: string,
  signal: AbortSignal,
  pageSize = 200,
  directoryIndex?: number,
) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 256)
    throw new Error('SquashFS pages must contain 1 to 256 entries.');

  function page(
    abort: AbortSignal,
    revision?: string,
    inode?: Position,
    resume?: Cursor,
  ): Promise<SquashfsPage> {
    return withSquashfs<SquashfsPage>(uri, abort, async (header, read, stat) => {
      const stamp = revisionStamp(stat);
      if (revision !== undefined) requireRevision(stamp, revision);
      const info = parseSquashfsHeader(header, stat.size);
      const inodeTable = Number(header.readBigUInt64LE(64));
      const directoryTable = Number(header.readBigUInt64LE(72));
      if (inodeTable < 96 || inodeTable >= directoryTable || directoryTable > info.bytesUsed)
        throw new Error('Invalid SquashFS metadata table offsets.');

      const take = squashfsMetadata(read, info.compressionId, abort, 96);

      const root = header.readBigUInt64LE(32);
      const ref = inode ?? { block: Number(root >> 16n), offset: Number(root & 0xffffn) };
      let cursor = resume && { ...resume };
      if (!cursor) {
        const pos = { block: inodeTable + ref.block, offset: ref.offset };
        const base = await take(pos, 16, directoryTable);
        const type = base.readUInt16LE(0);
        let block: number, size: number, offset: number;
        if (type === 1) {
          const body = await take(pos, 16, directoryTable);
          block = body.readUInt32LE(0);
          size = body.readUInt16LE(8);
          offset = body.readUInt16LE(10);
        } else if (type === 8) {
          const body = await take(pos, 24, directoryTable);
          block = body.readUInt32LE(8);
          size = body.readUInt32LE(4);
          offset = body.readUInt16LE(18);
        } else throw new Error('SquashFS entry does not reference a directory inode.');
        if (size < 3) throw new Error('Invalid SquashFS directory size.');
        cursor = {
          block: directoryTable + block,
          offset,
          remaining: size - 3,
          groupRemaining: 0,
          inodeBlock: 0,
        };
      }

      const state = cursor;
      async function directoryBytes(count: number) {
        if (count > state.remaining) throw new Error('Truncated SquashFS directory record.');
        state.remaining -= count;
        return take(state, count, info.bytesUsed);
      }
      const entries: SquashfsPage['entries'][number][] = [];
      while (state.remaining && entries.length < pageSize) {
        if (!state.groupRemaining) {
          const group = await directoryBytes(12);
          state.groupRemaining = group.readUInt32LE(0) + 1;
          if (state.groupRemaining > 256)
            throw new Error('Invalid SquashFS directory group count.');
          state.inodeBlock = group.readUInt32LE(4);
        }
        const item = await directoryBytes(8);
        const length = item.readUInt16LE(6) + 1;
        if (length > 256) throw new Error('Oversized SquashFS directory name.');
        const name = decoder.decode(await directoryBytes(length));
        if (name.includes('/')) throw new Error('Invalid SquashFS directory name.');
        assertArchivePath(name);
        const type = item.readUInt16LE(4);
        if (type < 1 || type > 7) throw new Error('Invalid SquashFS directory entry type.');
        const child = { block: state.inodeBlock, offset: item.readUInt16LE(0) };
        state.groupRemaining--;
        entries.push({
          name,
          kind: type === 1 ? 'directory' : type === 2 ? 'file' : type === 3 ? 'symlink' : 'special',
          ...(type === 2
            ? {
                memberIndex: child.block * 65536 + child.offset,
                revision: { size: stat.size, modifiedAt: stat.mtimeMs },
              }
            : {}),
          open: type === 1 ? (childSignal) => page(childSignal, stamp, child) : undefined,
        });
      }
      if (!state.remaining && state.groupRemaining)
        throw new Error('Truncated SquashFS directory group.');
      return {
        entries,
        directoryIndex: ref.block * 65536 + ref.offset,
        revision: { size: stat.size, modifiedAt: stat.mtimeMs },
        verify: (verifySignal) =>
          withSquashfs(uri, verifySignal, (_header, _read, current) => {
            requireRevision(revisionStamp(current), stamp);
            return Promise.resolve();
          }),
        next: state.remaining ? (nextSignal) => page(nextSignal, stamp, ref, state) : undefined,
      };
    });
  }

  return page(
    signal,
    undefined,
    directoryIndex === undefined
      ? undefined
      : {
          block: Math.floor(directoryIndex / 65536),
          offset: directoryIndex % 65536,
        },
  );
}
