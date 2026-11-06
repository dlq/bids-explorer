import { isNiftiFileName, niftiIcon } from './niftiPreview';
import {
  isRootParticipant,
  linkedDerivativeDatasets,
  participantPipelines,
} from '../core/participantData';
import { entryArchiveUri } from '../core/archiveUri';
import * as vscode from 'vscode';
import type { TreeDescription } from '../core/treeDescriptions';
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
import { describeEntry, entryKey, type DirectoryEntry } from '../core/directory';

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
    { controller: AbortController; rows: Promise<TreeElement[]> }
  >();

  readonly descriptions?: DescriptionQueue;
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
  ) {
    this.overviewBrowser = new DatasetBrowser(browser.source);
    if (loadDescription)
      this.descriptions = new DescriptionQueue(loadDescription, (entry) => {
        const element = this.elements.get(entryKey(entry));
        if (element) this.changes.fire(element);
      });
  }
  descriptionSnapshot(entry: DirectoryEntry): DescriptionSnapshot | undefined {
    return this.descriptions?.snapshot(entry);
  }
  refreshDescriptions(): void {
    this.descriptions?.clear();
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
        'Participant Data',
        vscode.TreeItemCollapsibleState.Collapsed,
      );
      item.id = 'overview:' + entryKey(element.parent.entry);
      item.contextValue = 'participantOverview';
      item.iconPath = new vscode.ThemeIcon('person');
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
    const isDirectory = entry.kind === 'directory';
    const isNifti = entry.kind === 'file' && isNiftiFileName(entry.name);
    const item = new vscode.TreeItem(
      element.groupLabel ?? entry.name,
      isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    item.id = this.itemKey(entry, element.inOverview);
    if (entry.metadataVersions) {
      const description = entry.name === 'dataset_description.json';
      item.contextValue = description ? 'datasetDescriptionVersions' : 'metadataVersions';
      item.description = `${entry.metadataVersions.length} shard sources`;
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
    item.description = describeEntry(entry);
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
        item.description =
          entry.archive.conflict || entry.logical?.conflict
            ? 'Archived file · source conflict'
            : isNifti
              ? `MRI · ${label} source`
              : `Metadata · ${label} source`;
        if (squashfs && entry.logical?.conflict) item.description = entry.archive.containerPath;
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
      item.description = 'File · source conflict';
    if (element.groupLabel) {
      item.description = entry.name;
      item.iconPath = new vscode.ThemeIcon(
        element.groupLabel === 'Raw' ? 'folder' : 'settings-gear',
      );
    }
    if (!element.groupLabel && !entry.archive && this.acceptsDescription(entry)) {
      const metadata = this.descriptions?.request(entry);
      if (metadata?.description) {
        item.description =
          entry.relativePath === ''
            ? metadata.description.text
            : `${describeEntry(entry)} · ${metadata.description.text}`;
        item.tooltip = readableTooltip(entry, metadata.description);
      }
    }
    return item;
  }

  getParent(element: TreeElement): TreeElement | undefined {
    if (element.type !== 'entry' || element.inOverview || !isRootParticipant(element.entry)) return;
    const root = this.browser
      .datasets()
      .find((entry) => entry.datasetUri === element.entry.datasetUri);
    return root && this.element(root);
  }

  async getChildren(element?: TreeElement): Promise<TreeElement[]> {
    if (!element) return this.browser.datasets().map((entry) => this.element(entry));
    if (element.type === 'overview') return this.overview(element.parent);
    if (element.type !== 'entry' || element.entry.kind !== 'directory') return [];
    const entry = element.entry;
    const browser = element.inOverview ? this.overviewBrowser : this.browser;
    const children = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: `BIDS Explorer: ${entry.name}`,
        cancellable: false,
      },
      () => browser.children(entry),
    );
    const result: TreeElement[] = children.map((child) => this.element(child, element.inOverview));
    const snapshot = browser.snapshot(entry);
    if (
      !element.inOverview &&
      isRootParticipant(entry) &&
      this.browser.datasets().some((root) => root.datasetUri === entry.datasetUri)
    )
      result.push({ type: 'overview', parent: element });
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

  private overview(parent: EntryElement): Promise<TreeElement[]> {
    const entry = parent.entry;
    const root = this.browser.datasets().find((dataset) => dataset.datasetUri === entry.datasetUri);
    if (!root) return Promise.resolve([]);
    const key = entryKey(entry);
    const existing = this.overviews.get(key);
    if (existing) return existing.rows;
    const controller = new AbortController();
    const group = (source: DirectoryEntry, groupLabel: string): EntryElement => ({
      type: 'entry',
      entry: source,
      inOverview: true,
      groupLabel,
    });
    const notice = (
      message: string,
      action: MessageElement['action'] = 'coverage',
    ): MessageElement => ({ type: 'message', action, parent, message });
    const rows = vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: `BIDS Explorer: Finding pipelines for ${entry.name}`,
      },
      async (): Promise<TreeElement[]> => {
        const raw = group(entry, 'Raw');
        try {
          const links = linkedDerivativeDatasets(
            root,
            this.browser.datasets(),
            this.derivativeLinks(),
          );
          const result = await participantPipelines(
            this.browser.source,
            root,
            entry,
            controller.signal,
            links.roots,
          );
          const { pipelines } = result;
          const issues = [...links.issues, ...result.issues];
          return [
            raw,
            ...pipelines.map(({ name, participant }) => group(participant, `Pipeline: ${name}`)),
            ...issues.map((issue) => notice(issue)),
            ...(!pipelines.length && !issues.length
              ? [notice('No matching participant in the inspected pipelines.')]
              : []),
          ];
        } catch (error) {
          return [
            raw,
            notice(
              controller.signal.aborted
                ? 'Pipeline lookup canceled. Click to retry.'
                : String(error),
              'retry',
            ),
          ];
        }
      },
    );
    const result = Promise.resolve(rows);
    this.overviews.set(key, { controller, rows: result });
    return result;
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
    this.descriptions?.clear(target?.entry);
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
    for (const entry of removed.values()) {
      this.descriptions?.clear({ ...entry, relativePath: '' });
      this.overviewBrowser.remove(entry);
    }
    this.clearOverviews();
    this.changes.fire(undefined);
  }

  cancelPending(): void {
    for (const work of this.overviews.values()) work.controller.abort();
    this.overviewBrowser.cancel();
    this.browser.cancel();
    this.descriptions?.cancel();
  }

  dispose(): void {
    this.clearOverviews();
    this.overviewBrowser.cancel();
    this.browser.cancel();
    this.descriptions?.clear();
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
