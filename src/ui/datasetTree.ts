import * as vscode from 'vscode';

/** Empty until dataset registration and lazy indexing are implemented. */
export class DatasetTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changes.event;

  getTreeItem(item: vscode.TreeItem): vscode.TreeItem { return item; }
  getChildren(): vscode.TreeItem[] { return []; }
  refresh(): void { this.changes.fire(); }
  dispose(): void { this.changes.dispose(); }
}
