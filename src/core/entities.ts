import type { DirectoryEntry } from './directory';

// Lexical vocabulary from the BIDS 1.11.2 entity schema; this is not a validator.
const knownKeys = new Set(
  'acq atlas ce cohort chunk den desc dir echo flip hemi inv label mod mt nuc part proc rec recording res run sample seg scale ses space split stain sub task tpl trc voi tracksys'.split(
    ' ',
  ),
);
const metadataName =
  /^(dataset_description\.json|participants\.(tsv|json)|README(?:\.(md|txt|rst))?|CHANGES|LICENSE(?:\.(md|txt|rst))?|CITATION\.cff)$/;

export interface EntityEvidence {
  readonly key: string;
  readonly value: string;
  readonly knownKey: boolean;
  readonly origin: 'folder' | 'combined-folder' | 'filename';
  readonly relativePath: string;
  readonly token: string;
  readonly tokenIndex: number;
}
export interface EntityResolution {
  readonly key: string;
  readonly status: 'resolved' | 'conflict' | 'duplicate' | 'unrecognized-key';
  readonly value?: string;
  readonly evidence: readonly EntityEvidence[];
}
export interface EntryInterpretation {
  readonly source: Readonly<{ datasetUri: string; uri: string; relativePath: string }>;
  readonly coverage: 'entry-path-only' | 'uninterpreted';
  readonly reason?: 'path-limit' | 'unsupported-relative-path';
  readonly scope?: Readonly<{
    kind: 'registered-root' | 'derivatives-container' | 'pipeline';
    relativePath: string;
    pipelineName?: string;
  }>;
  readonly filename?: Readonly<{
    suffix?: string;
    extension?: string;
    unparsedTokens: readonly string[];
  }>;
  readonly entities: readonly EntityResolution[];
  /** A source-scoped grouping suggestion only; no tree reparenting or dataset joins. */
  readonly suggestedContext?: Readonly<{
    subject: string;
    session?: string;
    key: string;
    filenameOnly: readonly string[];
  }>;
}

export function combinedFolder(
  name: string,
): Readonly<{ subject: string; session: string }> | undefined {
  const match = /^sub-([a-zA-Z0-9+]+)_ses-([a-zA-Z0-9+]+)$/.exec(name);
  return match ? Object.freeze({ subject: match[1], session: match[2] }) : undefined;
}

/** No filesystem IO, source rewriting, entity-order checks or index normalization. */
export function interpretEntry(entry: DirectoryEntry): EntryInterpretation {
  const source = Object.freeze({
    datasetUri: entry.datasetUri,
    uri: entry.uri,
    relativePath: entry.relativePath,
  });
  const empty = (reason: 'path-limit' | 'unsupported-relative-path'): EntryInterpretation =>
    Object.freeze({ source, coverage: 'uninterpreted', reason, entities: Object.freeze([]) });
  if (entry.relativePath.length > 32768) return empty('path-limit');
  const parts = entry.relativePath ? entry.relativePath.split('/') : [];
  if (parts.length > 128) return empty('path-limit');
  if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\')))
    return empty('unsupported-relative-path');
  const folders = entry.kind === 'directory' ? parts : parts.slice(0, -1);
  const scope: {
    kind: 'registered-root' | 'derivatives-container' | 'pipeline';
    relativePath: string;
    pipelineName?: string;
  } =
    folders[0] === 'derivatives'
      ? folders.length > 1
        ? {
            kind: 'pipeline',
            relativePath: folders.slice(0, 2).join('/'),
            pipelineName: folders[1],
          }
        : { kind: 'derivatives-container', relativePath: 'derivatives' }
      : { kind: 'registered-root', relativePath: '' };
  const start = scope.kind === 'pipeline' ? 2 : scope.kind === 'derivatives-container' ? 1 : 0;
  const observations: EntityEvidence[] = [];
  const observe = (
    key: string,
    value: string,
    origin: EntityEvidence['origin'],
    relativePath: string,
    token: string,
    tokenIndex: number,
  ): void => {
    observations.push(
      Object.freeze({
        key,
        value,
        knownKey: knownKeys.has(key),
        origin,
        relativePath,
        token,
        tokenIndex,
      }),
    );
  };
  for (let i = start; i < folders.length; i++) {
    const part = folders[i],
      relativePath = folders.slice(0, i + 1).join('/'),
      combined = combinedFolder(part);
    if (combined) {
      observe(
        'sub',
        combined.subject,
        'combined-folder',
        relativePath,
        'sub-' + combined.subject,
        0,
      );
      observe(
        'ses',
        combined.session,
        'combined-folder',
        relativePath,
        'ses-' + combined.session,
        1,
      );
    } else {
      const match = /^(sub|ses)-([a-zA-Z0-9+]+)$/.exec(part);
      if (match) observe(match[1], match[2], 'folder', relativePath, part, 0);
    }
  }
  let filename: EntryInterpretation['filename'];
  const name = parts.at(-1);
  if (entry.kind === 'file' && name && !metadataName.test(name)) {
    const dot = name.search(/[a-zA-Z0-9]\./);
    const extension = dot < 0 ? undefined : name.slice(dot + 1);
    const stem = extension ? name.slice(0, -extension.length) : name;
    const tokens = stem.split('_'),
      last = tokens.pop()!;
    const suffix = /^[a-zA-Z0-9]+$/.test(last) ? last : undefined;
    const unparsedTokens: string[] = [];
    tokens.forEach((token, index) => {
      const match = /^([a-z][a-z0-9]*)-([a-zA-Z0-9+]+)$/.exec(token);
      if (match) observe(match[1], match[2], 'filename', entry.relativePath, token, index);
      else unparsedTokens.push(token);
    });
    if (!suffix) unparsedTokens.push(last);
    filename = Object.freeze({ suffix, extension, unparsedTokens: Object.freeze(unparsedTokens) });
  }
  const groups = new Map<string, EntityEvidence[]>();
  for (const observation of observations) {
    const group = groups.get(observation.key);
    if (group) group.push(observation);
    else groups.set(observation.key, [observation]);
  }
  const entities = Object.freeze(
    [...groups].map(([key, evidence]): EntityResolution => {
      const values = new Set(evidence.map((item) => item.value));
      const status =
        values.size > 1
          ? 'conflict'
          : evidence.filter((item) => item.origin === 'filename').length > 1
            ? 'duplicate'
            : !evidence[0].knownKey
              ? 'unrecognized-key'
              : 'resolved';
      return Object.freeze({
        key,
        status,
        value: status === 'resolved' ? evidence[0].value : undefined,
        evidence: Object.freeze(evidence),
      });
    }),
  );
  const subject = entities.find((entity) => entity.key === 'sub'),
    session = entities.find((entity) => entity.key === 'ses');
  let suggestedContext: EntryInterpretation['suggestedContext'];
  if (subject?.status === 'resolved' && (!session || session.status === 'resolved')) {
    const filenameOnly = Object.freeze(
      [subject, ...(session ? [session] : [])]
        .filter((entity) => entity.evidence.every((item) => item.origin === 'filename'))
        .map((entity) => entity.key),
    );
    suggestedContext = Object.freeze({
      subject: subject.value!,
      session: session?.value,
      key: JSON.stringify([
        entry.datasetUri,
        scope.relativePath,
        subject.value,
        session?.value ?? null,
      ]),
      filenameOnly,
    });
  }
  return Object.freeze({
    source,
    coverage: 'entry-path-only',
    scope: Object.freeze(scope),
    filename,
    entities,
    suggestedContext,
  });
}
