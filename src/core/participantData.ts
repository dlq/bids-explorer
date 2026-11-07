import { isRecognizedBidsEntry, type DirectoryEntry, type DirectorySource } from './directory';
import { logicalFolder } from './logicalLayout';

const maxPipelines = 32;

export function isRootParticipant(entry: DirectoryEntry): boolean {
  return entry.logical?.kind === 'subject' && entry.relativePath === 'sub-' + entry.logical.subject;
}

/** Match explicit workspace links by registered dataset identity. */
export function linkedDerivativeDatasets(
  raw: DirectoryEntry,
  registered: readonly DirectoryEntry[],
  configured: unknown,
): { roots: readonly DirectoryEntry[]; issues: readonly string[] } {
  const roots: DirectoryEntry[] = [];
  const issues: string[] = [];
  if (
    configured === null ||
    typeof configured !== 'object' ||
    !Object.hasOwn(configured, raw.datasetUri)
  )
    return { roots, issues };
  const links: unknown = (configured as Record<string, unknown>)[raw.datasetUri];
  if (!Array.isArray(links)) return { roots, issues };
  for (const uri of new Set<unknown>(links)) {
    if (typeof uri !== 'string' || !uri.startsWith('file:') || uri === raw.datasetUri) continue;
    const derivative = registered.find((entry) => entry.datasetUri === uri);
    if (derivative) roots.push(derivative);
    else issues.push(`Linked derivative dataset is not registered: ${uri}`);
  }
  return { roots, issues };
}

export function pipelineLabel(root: DirectoryEntry): string {
  return root.relativePath ? root.name : `${root.name} (${root.datasetUri})`;
}

/** Inspect only the dataset, derivatives and pipeline roots. Leave participant contents lazy. */
export async function participantPipelines(
  source: DirectorySource,
  root: DirectoryEntry,
  participant: DirectoryEntry,
  signal: AbortSignal,
  linked: readonly DirectoryEntry[] = [],
): Promise<{
  pipelines: readonly { name: string; participant: DirectoryEntry }[];
  issues: readonly string[];
}> {
  signal.throwIfAborted();
  if (root.datasetUri !== participant.datasetUri || !isRootParticipant(participant))
    throw new Error('Choose a participant directly under a registered dataset.');
  const issues: string[] = [];
  const pipelines: { name: string; participant: DirectoryEntry }[] = [];

  async function list(entry: DirectoryEntry): Promise<readonly DirectoryEntry[]> {
    try {
      const children = await source.children(entry, signal);
      const page = children.find((child) => child.paging)?.paging;
      if (
        page?.next ||
        page?.failures ||
        children.some(
          (child) =>
            child.archive?.memberPath === '' ||
            child.logical?.sources.some((member) => member.archive?.memberPath === ''),
        )
      )
        issues.push(
          `Some sources under ${entry.relativePath || entry.datasetUri + ' (dataset root)'} were not inspected.`,
        );
      return children.filter((child) => child.kind === 'directory' && isRecognizedBidsEntry(child));
    } catch {
      signal.throwIfAborted();
      issues.push(`Could not read ${entry.relativePath || entry.datasetUri + ' (dataset root)'}.`);
      return [];
    }
  }

  const derivatives = (await list(root)).find((entry) => entry.relativePath === 'derivatives');
  const branches = derivatives ? await list(derivatives) : [];
  const candidates = [...branches, ...linked];
  if (candidates.length > maxPipelines)
    issues.push(`Only the first ${maxPipelines} derivative pipelines were inspected.`);
  for (const pipeline of candidates.slice(0, maxPipelines)) {
    signal.throwIfAborted();
    const match = (await list(pipeline)).find(
      (entry) =>
        entry.logical?.kind === 'subject' && entry.logical.subject === participant.logical?.subject,
    );
    if (!match?.logical) continue;
    const verified = match.logical.sources.filter((entry) => entry.archive?.memberPath !== '');
    if (verified.length !== match.logical.sources.length)
      issues.push(
        `Some archives in ${pipeline.name} need inspection before their participant can be matched.`,
      );
    if (verified.length)
      pipelines.push({
        name: pipelineLabel(pipeline),
        participant: logicalFolder(
          pipeline,
          match.name,
          'subject',
          verified,
          match.logical.subject,
        ),
      });
  }
  signal.throwIfAborted();
  return { pipelines, issues };
}

export interface ParticipantDerivativeLayout {
  readonly sessions: ReadonlyMap<string, readonly { name: string; branch: DirectoryEntry }[]>;
  readonly sessionless: readonly { name: string; branch: DirectoryEntry }[];
  readonly issues: readonly string[];
}

/** One shallow listing per matched participant. Session identifiers match exactly, without normalization. */
export async function participantDerivativeLayout(
  source: DirectorySource,
  root: DirectoryEntry,
  participant: DirectoryEntry,
  signal: AbortSignal,
  linked: readonly DirectoryEntry[] = [],
): Promise<ParticipantDerivativeLayout> {
  const found = await participantPipelines(source, root, participant, signal, linked);
  const sessions = new Map<string, { name: string; branch: DirectoryEntry }[]>();
  const sessionless: { name: string; branch: DirectoryEntry }[] = [];
  const issues = [...found.issues];
  for (const pipeline of found.pipelines) {
    signal.throwIfAborted();
    try {
      const children = await source.children(pipeline.participant, signal);
      if (
        children.some(
          (entry) =>
            entry.paging && (entry.paging.next || entry.paging.page > 1 || entry.paging.failures),
        )
      )
        issues.push(
          `Some sessions in ${pipeline.name} were not inspected. Browse the dataset-level derivative tree for complete source navigation.`,
        );
      for (const child of children) {
        if (child.logical?.kind !== 'session' || !child.logical.session) continue;
        const rows = sessions.get(child.logical.session) ?? [];
        rows.push({ name: pipeline.name, branch: child });
        sessions.set(child.logical.session, rows);
      }
      if (
        children.some(
          (entry) =>
            !entry.paging && entry.logical?.kind !== 'session' && isRecognizedBidsEntry(entry),
        )
      )
        sessionless.push({ name: pipeline.name, branch: pipeline.participant });
    } catch {
      signal.throwIfAborted();
      issues.push(`Could not inspect sessions in ${pipeline.name}.`);
    }
  }
  signal.throwIfAborted();
  return { sessions, sessionless, issues };
}
