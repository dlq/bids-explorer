import { lstat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { DirectoryEntry } from '../core/directory';
import {
  descriptionPlan,
  jsonDescription,
  tableDescription,
  type DescriptionOptions,
  type TreeDescription,
} from '../core/treeDescriptions';
import { parseJsonMetadata } from '../core/metadata';
import { loadInheritedMetadata } from './inheritedMetadata';
import { readTextSnapshot } from './textSnapshotReader';
import { loadSummaryTable } from './summaryTables';

/** Explicit, bounded metadata reads only; no image bytes or descendant discovery. */
export async function loadTreeDescription(
  entry: DirectoryEntry,
  options: DescriptionOptions,
  signal: AbortSignal,
): Promise<TreeDescription | undefined> {
  signal.throwIfAborted();
  const plan = descriptionPlan(entry, options);
  if (!plan) return undefined;
  const root = fileURLToPath(entry.datasetUri),
    path = fileURLToPath(entry.uri);
  if (relative(root, path).split(sep).join('/') !== entry.relativePath)
    throw new Error('Description source identity is inconsistent.');
  if (plan.kind === 'task') {
    const result = await loadInheritedMetadata(entry.datasetUri, entry.uri, signal);
    if (result.status !== 'resolved') return undefined;
    const field = result.fields.find((item) => item.key === 'TaskName');
    if (!field) return undefined;
    const source = result.sources.find((source) => source.entry.uri === field.value.sourceUri)!;
    const description = jsonDescription({ ...source.metadata!, fields: [field.value] }, 'TaskName');
    return (
      description &&
      Object.freeze({
        ...description,
        relatedSources: Object.freeze(
          field.history.map((item) => {
            const snapshot = result.sources.find((source) => source.entry.uri === item.sourceUri)!
              .metadata!.snapshot;
            return Object.freeze({
              sourceUri: item.sourceUri,
              pointer: item.pointer,
              revision: snapshot.revision,
              capturedAt: snapshot.capturedAt,
            });
          }),
        ),
      })
    );
  }
  const parts = entry.relativePath ? entry.relativePath.split('/') : [];
  let scope = plan.boundary;
  // Verify every lexical ancestor. Ordinary nested markers tighten the table boundary.
  for (let i = 0; i <= parts.length; i++) {
    signal.throwIfAborted();
    const directory = join(root, ...parts.slice(0, i));
    if (!(await lstat(directory)).isDirectory())
      throw new Error('Description ancestors must be ordinary directories.');
    if (i < (plan.boundary ? plan.boundary.split('/').length : 0)) continue;
    try {
      if ((await lstat(join(directory, 'dataset_description.json'))).isFile())
        scope = parts.slice(0, i).join('/');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const readName = async (): Promise<TreeDescription | undefined> =>
    jsonDescription(
      await parseJsonMetadata(
        await readTextSnapshot(pathToFileURL(join(path, 'dataset_description.json')).href, signal),
        signal,
      ),
      'Name',
    );
  try {
    if (plan.kind === 'dataset') return await readName();
    if (scope === entry.relativePath) return undefined;
    const labels: TreeDescription[] = [];
    const add = async (
      tablePath: string,
      identifier: string,
      value: string,
      column: string,
    ): Promise<void> => {
      if (!column) return;
      try {
        const data = await loadSummaryTable(
          pathToFileURL(tablePath).href,
          signal,
          pathToFileURL(join(root, scope)).href,
        );
        if (data.dictionary.status === 'unavailable') return;
        const description = tableDescription(
          data.table,
          identifier,
          value,
          column,
          data.dictionary.fields ?? data.dictionary.metadata?.fields ?? [],
        );
        if (description)
          labels.push(
            Object.freeze({
              ...description,
              relatedSources: Object.freeze(
                data.dictionary.sources ??
                  (data.dictionary.metadata
                    ? [
                        {
                          sourceUri: data.dictionary.sourceUri,
                          revision: data.dictionary.metadata.snapshot.revision,
                          capturedAt: data.dictionary.metadata.snapshot.capturedAt,
                        },
                      ]
                    : []),
              ),
            }),
          );
      } catch (error) {
        signal.throwIfAborted();
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    };
    if (plan.kind !== 'session')
      await add(
        join(root, scope, 'participants.tsv'),
        'participant_id',
        'sub-' + plan.subject!,
        options.participantColumn,
      );
    if (plan.session && options.sessionColumn) {
      const minimum = scope ? scope.split('/').length : 0;
      let index = -1;
      for (let i = minimum; i < parts.length; i++)
        if (
          parts[i] === 'sub-' + plan.subject! ||
          parts[i] === 'sub-' + plan.subject! + '_ses-' + plan.session
        )
          index = i;
      if (index >= 0)
        await add(
          join(root, ...parts.slice(0, index + 1), 'sub-' + plan.subject! + '_sessions.tsv'),
          'session_id',
          'ses-' + plan.session,
          options.sessionColumn,
        );
    }
    return labels.length
      ? Object.freeze({
          text: labels.map((label) => label.text).join(' · '),
          evidence: Object.freeze(labels.flatMap((label) => label.evidence)),
          relatedSources: Object.freeze(labels.flatMap((label) => label.relatedSources!)),
        })
      : undefined;
  } catch (error) {
    signal.throwIfAborted();
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
