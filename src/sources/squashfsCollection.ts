import { setImmediate } from 'node:timers/promises';
import { isRecognizedBidsEntry, type DirectoryEntry } from '../core/directory';
import { layoutHint, logicalChildren } from '../core/logicalLayout';
import { readSquashfsRoot, type SquashfsPage, type SquashfsPageRead } from './squashfsDirectory';

export const squashfsSuffix = /\.(squashfs|sqfs|sqsh)$/i;
const pageSize = 200;
const shardLimit = 64;

interface Shard {
  readonly container: string;
  readonly uri: string;
  readonly path: string;
}
interface Stream {
  rows: readonly DirectoryEntry[];
  offset: number;
  next?: DirectoryPageRead;
  last?: string;
  verify?: SquashfsPage['verify'];
}
type DirectoryPageRead = (signal: AbortSignal) => Promise<Pick<Stream, 'rows' | 'next' | 'verify'>>;

function physicalPage(
  parent: DirectoryEntry,
  shard: Shard,
  read: SquashfsPageRead,
): DirectoryPageRead {
  return async (signal) => {
    const page = await read(signal);
    return {
      rows: page.entries.map((row): DirectoryEntry => {
        const memberPath = shard.path ? shard.path + '/' + row.name : row.name;
        return {
          datasetUri: parent.datasetUri,
          uri: shard.uri,
          relativePath: shard.container + '/' + memberPath,
          name: row.name,
          kind: row.kind === 'special' ? 'other' : row.kind,
          archive: {
            format: 'squashfs',
            sourceUri: shard.uri,
            containerPath: shard.container,
            memberPath,
            memberIndex: row.memberIndex,
            parentIndex: page.directoryIndex,
            revision: row.revision,
          },
          squashfsRead: row.open,
        };
      }),
      verify: page.verify,
      next: page.next && physicalPage(parent, shard, page.next),
    };
  };
}

export function squashfsBranch(parent: DirectoryEntry, source: DirectoryEntry): DirectoryPageRead {
  if (source.archive?.format === 'squashfs') {
    const { containerPath, sourceUri, memberPath } = source.archive;
    return physicalPage(
      parent,
      { container: containerPath, uri: sourceUri, path: memberPath },
      source.squashfsRead!,
    );
  }

  return async (signal) => {
    const root = await readSquashfsRoot(source.uri, signal);
    const only = root.entries[0];
    let directory: SquashfsPage = root;
    let path = '';
    if (
      root.entries.length === 1 &&
      !root.next &&
      only.open &&
      !isRecognizedBidsEntry({
        ...source,
        kind: 'directory',
        name: only.name,
        relativePath: only.name,
      })
    ) {
      const child = await only.open(signal);
      if (
        child.entries.some(
          (row) =>
            row.name === 'dataset_description.json' ||
            (row.kind === 'directory' &&
              /^sub-[a-zA-Z0-9+]+(?:_ses-[a-zA-Z0-9+]+)?$/.test(row.name)),
        )
      ) {
        directory = child;
        path = only.name;
      }
    }
    return physicalPage(parent, { container: source.relativePath, uri: source.uri, path }, () =>
      Promise.resolve(directory),
    )(signal);
  };
}

/** Merge matching keys before publishing a page, including matches on different physical pages. */
export async function mergeSquashfsBranches(
  parent: DirectoryEntry,
  ordinary: readonly DirectoryEntry[],
  reads: readonly DirectoryPageRead[],
  signal: AbortSignal,
): Promise<readonly DirectoryEntry[]> {
  if (reads.length > shardLimit)
    throw new Error('SquashFS browsing supports up to 64 sources per branch.');
  const key = (entry: DirectoryEntry) => {
    const hint = parent.relativePath === 'derivatives' ? undefined : layoutHint(entry);
    if (hint?.subject && !parent.logical?.subject) return 'sub-' + hint.subject;
    if (
      hint?.session &&
      !parent.logical?.session &&
      (!hint.subject || hint.subject === parent.logical?.subject)
    )
      return 'ses-' + hint.session;
    return entry.name;
  };
  // SquashFS stores directory names in byte order. BIDS identifiers are ASCII.
  const compare = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
  const ordered = [...ordinary].sort((a, b) => compare(key(a), key(b)));
  const initial: Stream[] = [
    { rows: ordered, offset: 0 },
    ...reads.map((next) => ({ rows: [], offset: 0, next })),
  ];

  // Retain only a few checkpoints. Older pages can be replayed with cancellation.
  const checkpoints = new Map<number, NonNullable<DirectoryEntry['paging']>['next']>();
  async function previousPage(target: number, abort: AbortSignal) {
    const nearest = Math.max(1, ...[...checkpoints.keys()].filter((number) => number <= target));
    const start = checkpoints.get(nearest);
    let rows = await (start ? start(abort) : load(initial, 1, 0, abort));
    for (let number = nearest; number < target; number++) {
      const next = rows.at(-1)?.paging?.next;
      if (!next) throw new Error('The requested SquashFS page is no longer available.');
      rows = await next(abort);
    }
    return rows;
  }

  async function load(
    previous: readonly Stream[],
    number: number,
    previousFailures: number,
    abort: AbortSignal,
  ): Promise<readonly DirectoryEntry[]> {
    abort.throwIfAborted();
    const streams = previous.map((stream) => ({ ...stream }));
    const candidates: DirectoryEntry[] = [];
    let failures = previousFailures;
    const fill = async (stream: Stream) => {
      if (stream.offset < stream.rows.length || !stream.next) return;
      try {
        const result = await stream.next(abort);
        stream.rows = result.rows;
        stream.offset = 0;
        stream.next = result.next;
        stream.verify = result.verify;
      } catch {
        abort.throwIfAborted();
        failures++;
        stream.next = undefined;
      }
    };
    for (let i = 0; i < streams.length; i += 4)
      await Promise.all(
        streams.slice(i, i + 4).map(async (stream) => {
          if (number > 1) await stream.verify?.(abort);
          await fill(stream);
        }),
      );
    for (let i = 0; i < pageSize; i++) {
      abort.throwIfAborted();
      let smallest: string | undefined;
      for (const stream of streams) {
        const row = stream.rows[stream.offset];
        if (!row) continue;
        const name = key(row);
        if (stream.last !== undefined && compare(name, stream.last) < 0)
          throw new Error('SquashFS entries are not in logical name order for this branch.');
        if (smallest === undefined || compare(name, smallest) < 0) smallest = name;
      }
      if (smallest === undefined) break;
      for (const stream of streams) {
        while (stream.offset < stream.rows.length && key(stream.rows[stream.offset]) === smallest) {
          candidates.push(stream.rows[stream.offset++]);
          stream.last = smallest;
          await fill(stream);
        }
      }
      if (i % 32 === 0) await setImmediate();
    }
    const rows = groupMetadataVersions(await logicalChildren(parent, candidates, abort));
    const more = streams.some((stream) => stream.offset < stream.rows.length || stream.next);
    checkpoints.delete(number);
    checkpoints.set(number, (nextSignal) => load(previous, number, previousFailures, nextSignal));
    if (checkpoints.size > 8) checkpoints.delete(checkpoints.keys().next().value!);
    return [
      ...rows,
      {
        datasetUri: parent.datasetUri,
        uri: parent.uri,
        relativePath: parent.relativePath,
        name: 'SquashFS page coverage',
        kind: 'other',
        paging: {
          failures,
          previous:
            number > 1
              ? async (nextSignal) => {
                  for (let i = 0; i < streams.length; i += 4)
                    await Promise.all(
                      streams.slice(i, i + 4).map(async (stream) => stream.verify?.(nextSignal)),
                    );
                  return previousPage(number - 1, nextSignal);
                }
              : undefined,
          next: more ? (nextSignal) => load(streams, number + 1, failures, nextSignal) : undefined,
          page: number,
        },
      },
    ];
  }
  return load(initial, 1, 0, signal);
}

/** One navigation row per repeated SquashFS metadata path, without opening its payload. */
function groupMetadataVersions(rows: readonly DirectoryEntry[]): readonly DirectoryEntry[] {
  const groups = new Map<string, DirectoryEntry[]>();
  for (const row of rows) {
    if (
      row.archive?.format !== 'squashfs' ||
      row.kind !== 'file' ||
      !row.logical?.conflict ||
      !/^(README(?:\.(?:md|txt|rst))?|.*\.(?:json|tsv))$/i.test(row.name) ||
      !isRecognizedBidsEntry(row)
    )
      continue;
    const group = groups.get(row.relativePath);
    if (group) group.push(row);
    else groups.set(row.relativePath, [row]);
  }
  return rows.flatMap((row) => {
    const versions = groups.get(row.relativePath);
    if (
      !versions ||
      versions.length < 2 ||
      row.archive?.format !== 'squashfs' ||
      row.kind !== 'file'
    )
      return row;
    if (row !== versions[0]) return [];
    return {
      datasetUri: row.datasetUri,
      uri: row.datasetUri,
      relativePath: row.relativePath,
      name: row.name,
      kind: 'directory',
      metadataVersions: versions,
      logical: {
        kind: 'overlay',
        sources: versions.flatMap((version) => version.logical!.sources),
      },
    };
  });
}
