import {
  groupAcquisitions,
  groupEchoCollections,
  compareLogicalEntries,
  type Acquisition,
} from '../core/acquisitions';
import { isNiftiFileName, niftiIcon } from './niftiPreview';
import {
  isRootParticipant,
  linkedDerivativeDatasets,
  participantDerivativeLayout,
  type ParticipantDerivativeLayout,
} from '../core/participantData';
import { entryArchiveUri } from '../core/archiveUri';
import * as vscode from 'vscode';
import {
  displayEntryLabel,
  displayFileDetails,
  displayFileType,
  type TreeDescription,
} from '../core/treeDescriptions';
import { isHistoryFile } from './historyPreview';
import {
  DescriptionQueue,
  type DescriptionLoader,
  type DescriptionSnapshot,
} from '../core/descriptionQueue';
import { isParticipantsTable, isSummaryTable } from './tablePreview';
import { isJsonMetadata } from './metadataPreview';
import { isGradientFile } from './gradientPreview';
import { DatasetBrowser } from '../core/browser';
import { describeEntry, entryKey, orderEntries, type DirectoryEntry } from '../core/directory';

// Use the same semantic labels as the tree description, with theme-aware built-in icons.
const directoryIcons: Readonly<Record<string, string>> = {
  Dataset: 'database',
  'ZIP archive': 'file-zip',
  'Tar archive': 'file-zip',
  Participant: 'person',
  'Participant / session (combined)': 'person',
  Session: 'calendar',
  Derivatives: 'git-branch',
  Pipeline: 'settings-gear',
  Anatomical: 'layers',
  Functional: 'pulse',
  Diffusion: 'git-merge',
  'Field maps': 'symbol-color',
  Perfusion: 'graph',
  EEG: 'radio-tower',
  MEG: 'magnet',
  'Intracranial EEG': 'circuit-board',
  PET: 'beaker',
};

export interface EntryElement {
  readonly type: 'entry';
  entry: DirectoryEntry;
  readonly inOverview?: true;
  readonly groupLabel?: string;
  readonly overviewParent?: OverviewElement;
  participantParent?: EntryElement;
  derivativeOnly?: true;
  sessionless?: true;
  ambiguousLabel?: boolean;
  acquisition?: Acquisition & { parent: EntryElement; expanded: boolean };
  resourceLabel?: string;
  metadataAction?: true;
  acquisitionParent?: EntryElement;
}
export interface MessageElement {
  readonly type: 'message';
  readonly action: 'retry' | 'fileExplorer' | 'nextPage' | 'previousPage' | 'coverage';
  readonly parent: EntryElement;
  readonly message: string;
}
interface OverviewElement {
  readonly type: 'overview';
  readonly parent: EntryElement;
  readonly participant: EntryElement;
  readonly session?: string;
}
export type TreeElement = EntryElement | MessageElement | OverviewElement;

export class DatasetTreeProvider
  implements vscode.TreeDataProvider<TreeElement>, vscode.Disposable
{
  private readonly changes = new vscode.EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this.changes.event;
  private readonly elements = new Map<string, EntryElement>();
  // Filtered source choices must not reuse snapshots from the canonical derivatives tree.
  private readonly overviewBrowser: DatasetBrowser;
  private readonly overviews = new Map<
    string,
    { controller: AbortController; layout: Promise<ParticipantDerivativeLayout> }
  >();

  readonly descriptions?: DescriptionQueue;
  readonly summaries?: DescriptionQueue;
  private readonly acquisitions = new Map<string, EntryElement>();
  private readonly projections = new Map<string, AbortController>();
  constructor(
    readonly browser: DatasetBrowser,
    loadDescription?: DescriptionLoader,
    private readonly acceptsDescription: (entry: DirectoryEntry) => boolean = () => true,
    private readonly extensionUri: vscode.Uri = vscode.Uri.joinPath(
      vscode.Uri.file(__dirname),
      '..',
      '..',
    ),
    private readonly derivativeLinks: () => unknown = () => undefined,
    loadSummary?: DescriptionLoader,
  ) {
    this.overviewBrowser = new DatasetBrowser(browser.source);
    if (loadSummary)
      this.summaries = new DescriptionQueue(loadSummary, (entry) => {
        for (const key of [entryKey(entry), 'participant:' + entryKey(entry)]) {
          const row = this.acquisitions.get(key);
          if (row) this.changes.fire(row);
        }
      });
    if (loadDescription)
      this.descriptions = new DescriptionQueue(loadDescription, (entry) => {
        const element = this.elements.get(entryKey(entry));
        if (element) this.changes.fire(element);
        const acquisition = this.acquisitions.get(entryKey(entry));
        if (acquisition) this.changes.fire(acquisition);
      });
  }
  descriptionSnapshot(entry: DirectoryEntry): DescriptionSnapshot | undefined {
    return this.descriptions?.snapshot(entry);
  }
  refreshDescriptions(): void {
    this.descriptions?.clear();
    this.summaries?.clear();
    this.changes.fire(undefined);
  }

  element(entry: DirectoryEntry, inOverview?: true): EntryElement {
    const key = this.itemKey(entry, inOverview);
    let element = this.elements.get(key);
    if (!element) {
      element = { type: 'entry', entry, inOverview };
      this.elements.set(key, element);
    }
    element.entry = entry;
    return element;
  }

  private itemKey(entry: DirectoryEntry, inOverview?: true): string {
    return (inOverview ? 'participant:' : '') + entryKey(entry);
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    if (element.type === 'overview') {
      const item = new vscode.TreeItem(
        element.session === undefined ? 'Derivatives without a session' : 'Derivatives',
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.id =
        'overview:' +
        entryKey(element.participant.entry) +
        ':' +
        JSON.stringify(element.session ?? null);
      item.contextValue = 'participantOverview';
      item.accessibilityInformation = {
        label:
          element.session === undefined
            ? 'Derivatives without a session'
            : `Derivatives for session ${element.session}`,
      };
      item.iconPath = new vscode.ThemeIcon('git-branch');
      item.tooltip =
        element.session === undefined
          ? 'Processing outputs without a recorded session identifier, including explicitly linked derivative datasets.'
          : 'Processing outputs with this exact session identifier, including explicitly linked derivative datasets.';
      return item;
    }
    if (element.type === 'message') {
      const item = new vscode.TreeItem(element.message);
      item.contextValue = 'message';
      item.iconPath = new vscode.ThemeIcon('warning');
      if (element.action === 'coverage') return item;
      if (element.action === 'nextPage' || element.action === 'previousPage') {
        const previous = element.action === 'previousPage';
        item.iconPath = new vscode.ThemeIcon(previous ? 'arrow-left' : 'arrow-right');
        item.command = {
          command: previous ? 'bidsExplorer.previousPage' : 'bidsExplorer.nextPage',
          title: previous ? 'Previous page' : 'Next page',
          arguments: [element.parent],
        };
        return item;
      }
      item.command = {
        command:
          element.action === 'retry' ? 'bidsExplorer.refresh' : 'bidsExplorer.showInFileExplorer',
        title: element.action === 'retry' ? 'Retry listing' : 'Show Dataset in File Explorer',
        arguments: [element.parent],
      };
      return item;
    }
    const { entry } = element;
    if (element.metadataAction) {
      const item = new vscode.TreeItem('Acquisition metadata');
      item.id = 'effective:' + this.itemKey(entry, element.inOverview);
      item.iconPath = new vscode.ThemeIcon('info');
      item.description = 'Including inherited values';
      item.command = {
        command: 'bidsExplorer.inspectMetadata',
        title: 'Inspect Acquisition Metadata',
        arguments: [element],
      };
      return item;
    }
    const isDirectory = entry.kind === 'directory';
    const isNifti = entry.kind === 'file' && isNiftiFileName(entry.name);
    const fileDetails = displayFileDetails(entry);
    const item = new vscode.TreeItem(
      element.resourceLabel ??
        element.groupLabel ??
        (element.ambiguousLabel ? entry.name : displayEntryLabel(entry)),
      isDirectory || element.acquisition
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    item.id =
      (element.derivativeOnly
        ? 'derivative-session:' + entryKey(element.participantParent!.entry) + ':'
        : '') +
      (element.acquisition?.echoes
        ? 'echo-collection:'
        : element.acquisition
          ? 'acquisition:'
          : element.acquisitionParent
            ? 'resource:'
            : '') +
      this.itemKey(entry, element.inOverview);
    if (entry.metadataVersions) {
      const description = entry.name === 'dataset_description.json';
      item.contextValue = description ? 'datasetDescriptionVersions' : 'metadataVersions';
      item.description = [
        fileDetails,
        displayFileType(entry) ?? 'Metadata',
        `${entry.metadataVersions.length} shard sources`,
      ]
        .filter(Boolean)
        .join(' · ');
      item.iconPath = new vscode.ThemeIcon('files');
      item.tooltip = description
        ? 'Open the combined dataset description or expand to inspect each shard.'
        : 'Expand to inspect the original from each shard.';
      if (description)
        item.command = {
          command: 'bidsExplorer.openFile',
          title: 'Compare Dataset Descriptions',
          arguments: [element],
        };
      return item;
    }
    const squashfs = entry.archive?.format === 'squashfs';
    item.resourceUri = vscode.Uri.parse(
      entry.archive && entry.kind === 'file' ? entryArchiveUri(entry) : entry.uri,
    );
    item.contextValue =
      entry.relativePath === '' ? 'dataset' : isDirectory ? 'directory' : entry.kind;
    if (entry.kind === 'file' && isGradientFile(item.resourceUri)) item.contextValue = 'gradient';
    if (entry.kind === 'file' && isJsonMetadata(item.resourceUri)) item.contextValue = 'metadata';
    if (entry.kind === 'file' && isSummaryTable(item.resourceUri))
      item.contextValue = 'summaryTable';
    if (entry.kind === 'file' && isParticipantsTable(item.resourceUri))
      item.contextValue = 'participants';
    if (entry.kind === 'file' && isHistoryFile(item.resourceUri)) item.contextValue = 'history';
    if (entry.archive && isNifti) item.contextValue = 'archiveImage';
    item.description = displayFileType(entry) ?? describeEntry(entry);
    item.tooltip = readableTooltip(entry);
    if (isDirectory)
      item.iconPath = new vscode.ThemeIcon(directoryIcons[describeEntry(entry)] ?? 'folder');
    else if (entry.kind !== 'file') {
      item.iconPath = new vscode.ThemeIcon('link');
      item.description = `${entry.kind} · not followed`;
    } else
      item.command = { command: 'bidsExplorer.openFile', title: 'Open file', arguments: [element] };
    if (entry.archive) {
      const tar = entry.archive.format === 'tar';
      const label = squashfs ? 'SquashFS' : tar ? 'Tar' : 'ZIP';
      if (entry.kind === 'file') {
        const type = displayFileType(entry) ?? 'File';
        item.description =
          type + (entry.archive.conflict || entry.logical?.conflict ? ' · source conflict' : '');
        if (squashfs && entry.logical?.conflict)
          item.description = `${type} · ${entry.archive.containerPath}`;
        item.iconPath = new vscode.ThemeIcon('file');
      } else if (entry.archive.memberPath === '')
        item.description = `${label} · expand to index contents`;
      item.tooltip = new vscode.MarkdownString('', false);
      item.tooltip.appendText(
        entry.name +
          `\n\n${label} member: ` +
          (entry.archive.memberPath || '(index not expanded)') +
          '\n\nSource: ' +
          entry.archive.sourceUri +
          '\n\nRead-only archive source. Selected MRI images use a checked private cache; text previews read bounded members.',
      );
    }
    if (isNifti) item.iconPath = niftiIcon(this.extensionUri);
    else if (displayFileType(entry))
      item.iconPath = new vscode.ThemeIcon(entry.name.endsWith('.json') ? 'json' : 'list-flat');
    if (entry.logical && entry.logical.kind !== 'resource') {
      item.description =
        describeEntry(entry) + (entry.logical.conflict ? ' · source conflict' : '');
      item.tooltip = new vscode.MarkdownString('', false);
      item.tooltip.appendText(
        entry.name +
          '\n\nLogical navigation over ' +
          entry.logical.sources.length +
          ' physical source choice(s). Archive names provide provisional placement; contents are indexed on expansion. Show Source Details for original paths and coverage.',
      );
    }
    if (!entry.archive && entry.logical?.conflict && entry.kind !== 'directory')
      item.description = `${displayFileType(entry) ?? 'File'} · source conflict`;
    if (element.groupLabel) {
      item.description = 'Pipeline';
      item.iconPath = new vscode.ThemeIcon('settings-gear');
    }
    if (
      !element.groupLabel &&
      !element.acquisitionParent &&
      !entry.archive &&
      this.acceptsDescription(entry)
    ) {
      const metadata = this.descriptions?.request(entry);
      if (metadata?.description) {
        item.description =
          entry.relativePath === ''
            ? metadata.description.text
            : `${displayFileType(entry) ?? describeEntry(entry)} · ${metadata.description.text}`;
        item.tooltip = readableTooltip(entry, metadata.description);
      }
    }
    if (
      fileDetails &&
      !element.resourceLabel &&
      !element.groupLabel &&
      !element.ambiguousLabel &&
      !element.acquisitionParent
    )
      item.description = `${fileDetails} · ${item.description}`;
    const tableType = displayFileType(entry);
    if (
      typeof item.label === 'string' &&
      tableType === item.label + ' table' &&
      typeof item.description === 'string'
    )
      item.description = item.description.replace(tableType, 'Table');
    if (isDirectory && item.label === item.description) item.description = undefined;
    if (element.derivativeOnly) item.description = 'Session · derivative sources';
    if (element.acquisition?.echoes) {
      item.command = undefined;
      item.resourceUri = undefined;
      item.contextValue = 'echoCollection';
      item.description = [
        displayFileDetails(entry, ['echo']),
        `${element.acquisition.echoes.length} echoes`,
      ]
        .filter(Boolean)
        .join(' · ');
      item.iconPath = new vscode.ThemeIcon('folder');
      item.tooltip = new vscode.MarkdownString('', false);
      item.tooltip.appendText(
        'Multi-echo acquisition. Shared resources apply to the collection; expand each echo for its own image and metadata.',
      );
      for (const echo of element.acquisition.echoes)
        item.tooltip.appendText('\n\n' + echo.image.name + '\n' + echo.image.uri);
    } else if (element.acquisition) {
      item.contextValue = isNifti && entry.archive ? 'archiveImage' : 'file';
      const summary = element.acquisition.expanded ? this.summaries?.request(entry) : undefined;
      if (summary?.description) {
        item.description = `${item.description} · ${summary.description.text}`;
        const tooltip = item.tooltip;
        tooltip.appendText('\n\nAcquisition summary: ' + summary.description.text);
        for (const source of summary.description.evidence)
          tooltip.appendText('\n' + source.field + ' from ' + source.sourceUri);
      }
    }
    return item;
  }

  getParent(element: TreeElement): TreeElement | undefined {
    if (element.type === 'overview') return element.parent;
    if (element.type !== 'entry') return;
    if (element.overviewParent) return element.overviewParent;
    if (element.participantParent) return element.participantParent;
    if (element.acquisitionParent) return element.acquisitionParent;
    if (element.acquisition) return element.acquisition.parent;
    if (element.inOverview || !isRootParticipant(element.entry)) return;
    const root = this.browser
      .datasets()
      .find((entry) => entry.datasetUri === element.entry.datasetUri);
    return root && this.element(root);
  }

  async getChildren(element?: TreeElement): Promise<TreeElement[]> {
    if (!element) return this.browser.datasets().map((entry) => this.element(entry));
    if (element.type === 'overview') return this.overview(element);
    if (element.type === 'entry' && element.derivativeOnly)
      return [
        {
          type: 'overview',
          parent: element,
          participant: element.participantParent!,
          session: element.entry.logical!.session,
        },
      ];
    if (element.type === 'entry' && element.acquisition?.echoes) {
      const shared: EntryElement[] = element.acquisition.members.map((entry) => ({
        type: 'entry',
        entry,
        inOverview: element.inOverview,
        acquisitionParent: element,
      }));
      const echoes: EntryElement[] = element.acquisition.echoes.map((acquisition) => {
        const key = this.itemKey(acquisition.image, element.inOverview);
        let row = this.acquisitions.get(key);
        if (!row) {
          row = { type: 'entry', entry: acquisition.image, inOverview: element.inOverview };
          this.acquisitions.set(key, row);
        }
        row.entry = acquisition.image;
        row.ambiguousLabel = false;
        row.acquisition = {
          ...acquisition,
          parent: element,
          expanded: row.acquisition?.expanded ?? false,
        };
        row.resourceLabel = displayFileDetails(acquisition.image)
          .split(' · ')
          .find((value) => value.startsWith('Echo '));
        return row;
      });
      return [...shared, ...echoes];
    }
    if (element.type === 'entry' && element.acquisition) {
      element.acquisition.expanded = true;
      this.summaries?.request(element.entry);
      const child = (entry: DirectoryEntry, label: string): EntryElement => ({
        type: 'entry',
        entry,
        inOverview: element.inOverview,
        resourceLabel: label,
        acquisitionParent: element,
      });
      return [
        child(element.entry, 'Image'),
        { ...child(element.entry, 'Acquisition metadata'), metadataAction: true },
        ...element.acquisition.members.map((entry) =>
          child(
            entry,
            entry.name.endsWith('_events.json')
              ? 'Event definitions'
              : entry.name.endsWith('.json')
                ? 'Original JSON'
                : entry.name.endsWith('.bval')
                  ? 'B-values'
                  : entry.name.endsWith('.bvec')
                    ? 'B-vectors'
                    : 'Events',
          ),
        ),
      ];
    }
    if (element.type !== 'entry' || element.entry.kind !== 'directory') return [];
    const entry = element.entry;
    const browser = element.inOverview ? this.overviewBrowser : this.browser;
    const listed = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: `BIDS Explorer: ${entry.name}`,
        cancellable: false,
      },
      () => browser.children(entry),
    );
    const children = element.sessionless
      ? listed.filter((child) => child.logical?.kind !== 'session')
      : listed;
    const labels = new Map<string, number>();
    const labelKey = (child: DirectoryEntry) =>
      JSON.stringify([
        displayEntryLabel(child),
        displayFileDetails(child),
        displayFileType(child) ?? describeEntry(child),
      ]);
    for (const child of children) {
      const key = labelKey(child);
      labels.set(key, (labels.get(key) ?? 0) + 1);
    }
    const snapshot = browser.snapshot(entry);
    const controller = new AbortController();
    const projectionKey = this.itemKey(entry, element.inOverview);
    this.projections.get(projectionKey)?.abort();
    this.projections.set(projectionKey, controller);
    let ordered: readonly (DirectoryEntry | Acquisition)[];
    try {
      const projected =
        snapshot.coverage === 'complete'
          ? await groupEchoCollections(
              await groupAcquisitions(children, controller.signal),
              controller.signal,
            )
          : children;
      const byKey = new Map(
        projected.map((row) => [entryKey('image' in row ? row.image : row), row]),
      );
      const anchors = projected.map((row) =>
        'image' in row
          ? { ...row.image, kind: 'directory' as const }
          : row.metadataVersions
            ? { ...row, kind: 'file' as const }
            : row,
      );
      const original = (anchor: DirectoryEntry): DirectoryEntry => {
        const row = byKey.get(entryKey(anchor))!;
        return 'image' in row ? row.image : row;
      };
      ordered = (
        await orderEntries(anchors, controller.signal, true, (a, b) =>
          compareLogicalEntries(original(a), original(b)),
        )
      ).map((row) => byKey.get(entryKey(row))!);
    } catch (error) {
      if (!controller.signal.aborted) throw error;
      ordered = children;
    } finally {
      if (this.projections.get(projectionKey) === controller)
        this.projections.delete(projectionKey);
    }
    const result: TreeElement[] = ordered.map((child) => {
      if ('image' in child) {
        const key =
          (child.echoes ? 'echo-collection:' : '') + this.itemKey(child.image, element.inOverview);
        let row = this.acquisitions.get(key);
        if (!row) {
          row = { type: 'entry', entry: child.image, inOverview: element.inOverview };
          this.acquisitions.set(key, row);
        }
        row.entry = child.image;
        delete row.resourceLabel;
        row.ambiguousLabel = labels.get(labelKey(child.image))! > 1;
        row.acquisition = {
          ...child,
          parent: element,
          expanded: row.acquisition?.expanded ?? false,
        };
        return row;
      }
      const row = this.element(child, element.inOverview);
      row.ambiguousLabel = labels.get(labelKey(child))! > 1;
      return row;
    });
    if (
      !element.inOverview &&
      isRootParticipant(entry) &&
      this.browser.datasets().some((root) => root.datasetUri === entry.datasetUri)
    ) {
      try {
        const layout = await this.derivativeLayout(element);
        const rawSessions = new Set<string>();
        for (const row of result)
          if (
            row.type === 'entry' &&
            row.entry.logical?.kind === 'session' &&
            row.entry.logical.session
          ) {
            row.participantParent = element;
            rawSessions.add(row.entry.logical.session);
          }
        for (const [session, pipelines] of layout.sessions)
          if (!rawSessions.has(session)) {
            result.push({
              type: 'entry',
              entry: pipelines[0].branch,
              participantParent: element,
              derivativeOnly: true,
            });
          }
        const leaves = result.filter(
          (row) =>
            row.type !== 'entry' ||
            !!row.entry.metadataVersions ||
            (row.entry.kind !== 'directory' && !row.acquisition),
        );
        const branches = result.filter(
          (row): row is EntryElement =>
            row.type === 'entry' &&
            !row.entry.metadataVersions &&
            (row.entry.kind === 'directory' || !!row.acquisition),
        );
        const byKey = new Map(branches.map((row) => [entryKey(row.entry), row]));
        const sorted = await orderEntries(
          branches.map((row) =>
            row.acquisition ? { ...row.entry, kind: 'directory' as const } : row.entry,
          ),
          controller.signal,
          true,
          (a, b) =>
            compareLogicalEntries(byKey.get(entryKey(a))!.entry, byKey.get(entryKey(b))!.entry),
        );
        result.splice(
          0,
          result.length,
          ...leaves,
          ...sorted.map((entry) => byKey.get(entryKey(entry))!),
        );
        if (layout.sessionless.length)
          result.push({ type: 'overview', parent: element, participant: element });
        for (const issue of layout.issues)
          result.push({ type: 'message', action: 'coverage', parent: element, message: issue });
      } catch (error) {
        result.push({
          type: 'message',
          action: 'retry',
          parent: element,
          message:
            'Derivative session lookup interrupted or unavailable. Click to retry. ' +
            String(error),
        });
      }
    } else if (element.participantParent && entry.logical?.session) {
      try {
        const layout = await this.derivativeLayout(element.participantParent);
        if (layout.sessions.has(entry.logical.session))
          result.push({
            type: 'overview',
            parent: element,
            participant: element.participantParent,
            session: entry.logical.session,
          });
      } catch (error) {
        result.push({
          type: 'message',
          action: 'retry',
          parent: element,
          message:
            'Derivative session lookup interrupted or unavailable. Click to retry. ' +
            String(error),
        });
      }
    }
    if (snapshot.error)
      result.push({
        type: 'message',
        action: 'retry',
        parent: element,
        message: `Could not list folder: ${snapshot.error.code}: ${snapshot.error.message}. Click to retry.`,
      });
    else if (snapshot.coverage === 'unknown')
      result.push({
        type: 'message',
        action: 'retry',
        parent: element,
        message: 'Listing canceled. Click to retry.',
      });
    if (snapshot.paging?.previous)
      result.push({
        type: 'message',
        action: 'previousPage',
        parent: element,
        message: `Previous page · currently page ${snapshot.paging.page}`,
      });
    if (snapshot.paging?.next)
      result.push({
        type: 'message',
        action: 'nextPage',
        parent: element,
        message: `Next page · currently page ${snapshot.paging.page}`,
      });
    else if (snapshot.paging && snapshot.paging.page > 1)
      result.push({
        type: 'message',
        action: 'coverage',
        parent: element,
        message: `Page ${snapshot.paging.page} · end of listing`,
      });
    if (snapshot.paging?.failures)
      result.push({
        type: 'message',
        action: 'coverage',
        parent: element,
        message: `Partial coverage · ${snapshot.paging.failures} SquashFS source(s) unavailable`,
      });
    if (snapshot.coverage === 'complete' && snapshot.physicalChildCount && result.length === 0) {
      result.push({
        type: 'message',
        action: 'fileExplorer',
        parent: element,
        message: 'No recognized BIDS entries here. Click to show all files in File Explorer.',
      });
    }
    return result;
  }

  private derivativeLayout(participant: EntryElement): Promise<ParticipantDerivativeLayout> {
    const entry = participant.entry;
    const root = this.browser.datasets().find((dataset) => dataset.datasetUri === entry.datasetUri);
    if (!root) return Promise.resolve({ sessions: new Map(), sessionless: [], issues: [] });
    const key = entryKey(entry);
    const existing = this.overviews.get(key);
    if (existing) return existing.layout;
    const controller = new AbortController();
    const layout = vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: `BIDS Explorer: Finding derivative sessions for ${entry.name}`,
      },
      async () => {
        const links = linkedDerivativeDatasets(
          root,
          this.browser.datasets(),
          this.derivativeLinks(),
        );
        const result = await participantDerivativeLayout(
          this.browser.source,
          root,
          entry,
          controller.signal,
          links.roots,
        );
        return { ...result, issues: [...links.issues, ...result.issues] };
      },
    );
    this.overviews.set(key, { controller, layout: Promise.resolve(layout) });
    return Promise.resolve(layout);
  }

  private async overview(element: OverviewElement): Promise<TreeElement[]> {
    try {
      const layout = await this.derivativeLayout(element.participant);
      const pipelines =
        element.session === undefined
          ? layout.sessionless
          : (layout.sessions.get(element.session) ?? []);
      return pipelines.map(({ name, branch }) => ({
        type: 'entry',
        entry: branch,
        inOverview: true,
        groupLabel: name,
        overviewParent: element,
        sessionless: element.session === undefined ? true : undefined,
      }));
    } catch (error) {
      return [
        {
          type: 'message',
          action: 'retry',
          parent: element.participant,
          message: 'Could not inspect derivative sessions. Click to retry. ' + String(error),
        },
      ];
    }
  }

  private clearOverviews(): boolean {
    const changed = this.overviews.size > 0;
    for (const work of this.overviews.values()) work.controller.abort();
    this.overviews.clear();
    return changed;
  }

  snapshot(element: EntryElement) {
    return (element.inOverview ? this.overviewBrowser : this.browser).snapshot(element.entry);
  }

  async nextPage(element: EntryElement, direction: 'next' | 'previous' = 'next'): Promise<void> {
    const browser = element.inOverview ? this.overviewBrowser : this.browser;
    const previous = browser.snapshot(element.entry).children;
    await browser.nextPage(element.entry, direction);
    const current = browser.snapshot(element.entry).children;
    if (current !== previous) {
      for (const row of previous) this.elements.delete(this.itemKey(row, element.inOverview));
    }
    this.changes.fire(element);
  }

  refresh(element?: TreeElement): void {
    const target =
      element?.type === 'message' || element?.type === 'overview' ? element.parent : element;
    if (target?.acquisition) {
      this.refresh(target.acquisition.parent);
      return;
    }
    if (target?.acquisitionParent) {
      this.refresh(target.acquisitionParent.acquisition!.parent);
      return;
    }
    for (const controller of this.projections.values()) controller.abort();
    this.descriptions?.clear(target?.entry);
    this.summaries?.clear(target?.entry);
    if (target?.inOverview) {
      this.overviewBrowser.refresh(target.entry);
      this.changes.fire(target);
      return;
    }
    this.browser.refresh(target?.entry);
    this.overviewBrowser.refresh(target?.entry, false);
    const overviewChanged = this.clearOverviews();
    this.changes.fire(overviewChanged ? undefined : target);
  }

  registrationChanged(): void {
    const datasets = new Set(this.browser.datasets().map((entry) => entry.datasetUri));
    const removed = new Map<string, DirectoryEntry>();
    for (const [key, element] of this.elements)
      if (!datasets.has(element.entry.datasetUri)) {
        removed.set(element.entry.datasetUri, element.entry);
        this.elements.delete(key);
      }
    for (const [key, row] of this.acquisitions)
      if (!datasets.has(row.entry.datasetUri)) this.acquisitions.delete(key);
    for (const entry of removed.values()) {
      this.summaries?.clear({ ...entry, relativePath: '' });
      this.descriptions?.clear({ ...entry, relativePath: '' });
      this.overviewBrowser.remove(entry);
    }
    this.clearOverviews();
    this.changes.fire(undefined);
  }

  cancelPending(): void {
    for (const controller of this.projections.values()) controller.abort();
    for (const work of this.overviews.values()) work.controller.abort();
    this.overviewBrowser.cancel();
    this.browser.cancel();
    this.descriptions?.cancel();
    this.summaries?.cancel();
  }

  dispose(): void {
    for (const controller of this.projections.values()) controller.abort();
    this.projections.clear();
    this.clearOverviews();
    this.overviewBrowser.cancel();
    this.browser.cancel();
    this.descriptions?.clear();
    this.summaries?.clear();
    this.acquisitions.clear();
    this.elements.clear();
    this.changes.dispose();
  }
}

/** Static formatting with escaped data; full paths and provenance stay in Source Details. */
function readableTooltip(
  entry: DirectoryEntry,
  description?: TreeDescription,
): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString('', false);
  tooltip.isTrusted = false;
  tooltip.supportHtml = false;
  const shorten = (value: string, limit: number): string => {
    const text = value.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim();
    return text.slice(0, limit) + (text.length > limit ? '…' : '');
  };
  tooltip.appendMarkdown('**');
  tooltip.appendText(shorten(entry.name, 120));
  tooltip.appendMarkdown('**\n\n');
  if (description) {
    tooltip.appendText(
      shorten(
        description.evidence.map((source) => source.value).join(' · ') || description.text,
        400,
      ),
    );
    tooltip.appendMarkdown('\n\n');
  }
  const role =
    entry.kind === 'directory'
      ? describeEntry(entry)
      : entry.kind === 'symlink'
        ? 'Symbolic link · not followed'
        : isNiftiFileName(entry.name)
          ? 'NIfTI image'
          : entry.name.endsWith('.json')
            ? 'JSON metadata'
            : entry.name.endsWith('.tsv')
              ? 'BIDS table'
              : 'File';
  tooltip.appendText(role);
  tooltip.appendMarkdown('\n\n');
  const location =
    entry.kind === 'directory'
      ? entry.relativePath
      : entry.relativePath.split('/').slice(0, -1).join('/');
  tooltip.appendText('Location: ' + shorten(location || 'Dataset root', 180));
  if (description) {
    const sources = [
      ...new Set(
        description.evidence.map((source) => {
          const name = vscode.Uri.parse(source.sourceUri).path.split('/').at(-1)!;
          return name + (source.line ? ', line ' + source.line : '');
        }),
      ),
    ];
    for (const source of sources) {
      tooltip.appendMarkdown('\n\n');
      tooltip.appendText('Source: ' + shorten(source, 180));
    }
  }
  tooltip.appendMarkdown('\n\n');
  tooltip.appendText('Show Source Details for full paths and provenance.');
  // appendText uses nonbreaking spaces; ordinary spaces keep descriptions naturally wrappable.
  tooltip.value = tooltip.value.replace(/&nbsp;/g, ' ');
  return tooltip;
}
