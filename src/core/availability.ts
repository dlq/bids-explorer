import { setImmediate } from 'node:timers/promises';
import {
  isBidsModality,
  isRecognizedBidsEntry,
  type DirectoryEntry,
  type DirectorySource,
} from './directory';
import { logicalFolder } from './logicalLayout';
import { isRootParticipant, pipelineLabel } from './participantData';

type Availability = { modalities: readonly string[]; complete: boolean };
const sessionName = /^ses-[a-zA-Z0-9+]+$/;
const dataFile = /\.(?:nii(?:\.gz)?|edf|bdf|vhdr|set|fif|snirf|gii|h5)$/;
const sessionless = 'No session';

export async function datasetAvailability(
  source: DirectorySource,
  root: DirectoryEntry,
  signal: AbortSignal,
  progress?: (completed: number, total: number) => void,
  links?: { roots: readonly DirectoryEntry[]; issues: readonly string[] },
) {
  signal.throwIfAborted();
  const issues = links?.issues ?? [];
  let partial = issues.length > 0;
  let retryable = false;

  async function list(entry: DirectoryEntry, budget?: { remaining: number }) {
    const rows: DirectoryEntry[] = [];
    let complete = true;
    let read = (signal: AbortSignal) => source.children(entry, signal);
    let lastPage = 0;
    for (;;) {
      signal.throwIfAborted();
      if (budget && budget.remaining-- <= 0) {
        complete = false;
        break;
      }
      try {
        const page = await read(signal);
        signal.throwIfAborted();
        const paging = page.find((row) => row.paging)?.paging;
        for (const row of page) {
          if (
            row.kind === 'symlink' ||
            row.archive?.memberPath === '' ||
            row.logical?.sources.some((choice) => choice.archive?.memberPath === '')
          )
            complete = false;
          if (!row.paging && isRecognizedBidsEntry(row)) rows.push(row);
        }
        if (!paging) break;
        if (paging.failures || paging.page <= lastPage) {
          complete = false;
          retryable = true;
        }
        if (!paging.next || paging.page <= lastPage) break;
        lastPage = paging.page;
        read = paging.next;
        await setImmediate();
      } catch (error) {
        signal.throwIfAborted();
        if (entry === root && !rows.length) throw error;
        retryable = true;
        complete = false;
        break;
      }
    }
    partial ||= !complete;
    return { rows, complete };
  }

  async function inspect(
    rows: readonly DirectoryEntry[],
    complete: boolean,
    budget: { remaining: number },
  ): Promise<Availability> {
    const present = (items: readonly DirectoryEntry[]) =>
      items.some((row) => row.kind === 'file' && dataFile.test(row.name));
    const modalities = new Set<string>();
    if (present(rows)) modalities.add('Other');
    for (const folder of rows.filter((row) => row.kind === 'directory')) {
      if (budget.remaining <= 0) {
        complete = false;
        break;
      }
      const branch = await list(folder, budget);
      if (present(branch.rows)) modalities.add(isBidsModality(folder.name) ? folder.name : 'Other');
      complete &&= branch.complete && !branch.rows.some((row) => row.kind === 'directory');
    }
    partial ||= !complete;
    return { modalities: [...modalities].sort(), complete };
  }

  const dataset = await list(root);
  const participants = [
    ...new Map(
      dataset.rows.filter(isRootParticipant).map((row) => [row.relativePath, row]),
    ).values(),
  ];
  const derivatives = dataset.rows.find(
    (row) => row.relativePath === 'derivatives' && row.kind === 'directory',
  );
  const pipelines = derivatives
    ? await list(derivatives)
    : { rows: [], complete: dataset.complete };
  const scoped: {
    pipeline: DirectoryEntry;
    complete: boolean;
    subjects: Map<string, DirectoryEntry>;
  }[] = [];
  for (const pipeline of [
    ...pipelines.rows.filter((row) => row.kind === 'directory'),
    ...(links?.roots ?? []),
  ]) {
    const branch = await list(pipeline);
    scoped.push({
      pipeline,
      complete: branch.complete,
      subjects: new Map(
        branch.rows.filter((row) => row.logical?.kind === 'subject').map((row) => [row.name, row]),
      ),
    });
  }

  const sessions = new Set<string>();
  const outputModalities = new Set<string>();

  async function inspectParticipant(participant: DirectoryEntry) {
    const rows = [];
    const budget = { remaining: 256 };
    for (const [sourceIndex, scope] of [
      { entry: participant, complete: true },
      ...scoped.map(({ pipeline, subjects, complete }) => {
        const match = subjects.get(participant.name);
        const verified = match?.logical?.sources.filter(
          (choice) => choice.archive?.memberPath !== '',
        );
        return {
          entry: verified?.length
            ? logicalFolder(
                pipeline,
                match!.name,
                'subject',
                verified,
                participant.logical?.subject,
              )
            : undefined,
          complete: complete && (!match || verified?.length === match.logical?.sources.length),
        };
      }),
    ].entries()) {
      const cells = new Map<string, Availability>();
      let complete = scope.complete;
      if (scope.entry) {
        const branch = await list(scope.entry, budget);
        complete &&= branch.complete;
        const named = branch.rows.filter(
          (row) => row.kind === 'directory' && sessionName.test(row.name),
        );
        const namedSet = new Set(named);
        const direct = branch.rows.filter((row) => !namedSet.has(row));
        if (
          (!named.length && complete) ||
          direct.some((row) => row.kind === 'directory' || dataFile.test(row.name))
        ) {
          sessions.add(sessionless);
          cells.set(sessionless, await inspect(direct, complete, budget));
        }
        partial ||= named.length > 32;
        for (const session of named.slice(0, 32)) {
          sessions.add(session.name);
          const data = await list(session, budget);
          cells.set(session.name, await inspect(data.rows, complete && data.complete, budget));
        }
        complete &&= named.length <= 32;
      }
      partial ||= !complete;
      if (sourceIndex)
        for (const cell of cells.values())
          for (const modality of cell.modalities) outputModalities.add(modality);
      rows.push({ sourceIndex, cells, complete });
    }
    return rows;
  }

  const rows = [];
  for (let offset = 0; offset < participants.length; offset += 8) {
    if (offset % 64 === 0) {
      progress?.(offset, participants.length);
      await setImmediate();
    }
    signal.throwIfAborted();
    rows.push(
      ...(await Promise.all(participants.slice(offset, offset + 8).map(inspectParticipant))),
    );
  }
  signal.throwIfAborted();
  const columns = [...sessions].sort();
  return {
    participants,
    columns,
    partial,
    retryable,
    ...(issues.length ? { issues } : {}),
    sources: ['Raw', ...scoped.map(({ pipeline }) => pipelineLabel(pipeline))],
    outputModalities: [...outputModalities].sort(),
    rows,
  };
}

export type AvailabilityIndex = Awaited<ReturnType<typeof datasetAvailability>>;

export interface AvailabilityFilter {
  participant: string;
  raw: readonly string[];
  requireOutput: boolean;
  pipeline: string;
  session: string;
  modality: string;
}

export const availabilityPageSize = 50;

export function availabilityMatches(
  index: AvailabilityIndex,
  filter: AvailabilityFilter,
): number[] {
  const participant = filter.participant.trim().toLowerCase();
  const matches: number[] = [];
  for (const [position, entry] of index.participants.entries()) {
    if (!entry.name.toLowerCase().includes(participant)) continue;
    const [raw, ...outputs] = index.rows[position];
    if (!filter.raw.every((session) => raw.cells.get(session)?.modalities.length)) continue;
    if (
      filter.requireOutput &&
      !outputs.some(
        ({ sourceIndex, cells }) =>
          (!filter.pipeline || index.sources[sourceIndex] === filter.pipeline) &&
          [...cells].some(
            ([session, cell]) =>
              (!filter.session || session === filter.session) &&
              cell.modalities.some((modality) => !filter.modality || modality === filter.modality),
          ),
      )
    )
      continue;
    matches.push(position);
  }
  return matches;
}

export function availabilityPage(
  index: AvailabilityIndex,
  matches: readonly number[],
  page: number,
) {
  const positions = matches.slice(page * availabilityPageSize, (page + 1) * availabilityPageSize);
  return positions.map((position) => ({
    position,
    participant: index.participants[position],
    sources: index.rows[position].map(({ sourceIndex, cells, complete }) => ({
      sourceIndex,
      cells: index.columns.map(
        (session): Availability => cells.get(session) ?? { modalities: [], complete },
      ),
    })),
  }));
}

export function availabilityModalities(index: AvailabilityIndex): string[] {
  const modalities = new Set<string>();
  for (const sources of index.rows)
    for (const { cells } of sources)
      for (const cell of cells.values())
        for (const modality of cell.modalities) modalities.add(modality);
  return [...modalities].sort();
}

export function availabilityBrowseMatches(
  index: AvailabilityIndex,
  matches: readonly number[],
  browse: { mode: 'modality' | 'pipeline'; value: string },
): number[] {
  return matches.filter((position) =>
    index.rows[position].some(({ sourceIndex, cells }) => {
      if (
        browse.mode === 'pipeline' &&
        (sourceIndex === 0 || index.sources[sourceIndex] !== browse.value)
      )
        return false;
      for (const cell of cells.values()) {
        if (
          browse.mode === 'modality'
            ? cell.modalities.includes(browse.value)
            : cell.modalities.length
        )
          return true;
      }
      return false;
    }),
  );
}
