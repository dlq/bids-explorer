import * as vscode from 'vscode';
import { DatasetBrowser } from '../core/browser';
import { describeEntry, entryKey, type DirectoryEntry } from '../core/directory';

export interface EntryElement {
  readonly type: 'entry';
  entry: DirectoryEntry;
}
export interface MessageElement {
  readonly type: 'message';
  readonly action: 'retry' | 'fileExplorer';
  readonly parent: EntryElement;
  readonly message: string;
}
export type TreeElement = EntryElement | MessageElement;

export class DatasetTreeProvider
  implements vscode.TreeDataProvider<TreeElement>, vscode.Disposable
{
  private readonly changes = new vscode.EventEmitter<TreeElement | undefined>();
  readonly onDidChangeTreeData = this.changes.event;
  private readonly elements = new Map<string, EntryElement>();

  constructor(readonly browser: DatasetBrowser) {}

  element(entry: DirectoryEntry): EntryElement {
    const key = entryKey(entry);
    let element = this.elements.get(key);
    if (!element) {
      element = { type: 'entry', entry };
      this.elements.set(key, element);
    }
    element.entry = entry;
    return element;
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    if (element.type === 'message') {
      const item = new vscode.TreeItem(element.message);
      item.contextValue = 'message';
      item.iconPath = new vscode.ThemeIcon('warning');
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
    const item = new vscode.TreeItem(
      entry.name,
      isDirectory
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    item.id = entryKey(entry);
    item.resourceUri = vscode.Uri.parse(entry.uri);
    item.contextValue =
      entry.relativePath === '' ? 'dataset' : isDirectory ? 'directory' : entry.kind;
    item.description = describeEntry(entry);
    item.tooltip = `${entry.uri}\n${isDirectory ? 'Lazy browsing: only expanded folders are read. Descendants are not indexed. Use Show Source Details for current listing coverage.' : entry.kind}`;
    if (isDirectory)
      item.iconPath = new vscode.ThemeIcon(entry.relativePath === '' ? 'database' : 'folder');
    else if (entry.kind !== 'file') {
      item.iconPath = new vscode.ThemeIcon('link');
      item.description = `${entry.kind} · not followed`;
    } else
      item.command = { command: 'bidsExplorer.openFile', title: 'Open file', arguments: [element] };
    return item;
  }

  async getChildren(element?: TreeElement): Promise<TreeElement[]> {
    if (!element) return this.browser.datasets().map((entry) => this.element(entry));
    if (element.type !== 'entry' || element.entry.kind !== 'directory') return [];
    const entry = element.entry;
    const children = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: `BIDS Explorer: ${entry.name}`,
        cancellable: false,
      },
      () => this.browser.children(entry),
    );
    const result: TreeElement[] = children.map((child) => this.element(child));
    const snapshot = this.browser.snapshot(entry);
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

  refresh(element?: TreeElement): void {
    const target = element?.type === 'message' ? element.parent : element;
    this.browser.refresh(target?.entry);
    this.changes.fire(target);
  }

  registrationChanged(): void {
    const datasets = new Set(this.browser.datasets().map((entry) => entry.datasetUri));
    for (const [key, element] of this.elements)
      if (!datasets.has(element.entry.datasetUri)) this.elements.delete(key);
    this.changes.fire(undefined);
  }

  cancelPending(): void {
    this.browser.cancel();
  }

  dispose(): void {
    this.browser.cancel();
    this.elements.clear();
    this.changes.dispose();
  }
}
