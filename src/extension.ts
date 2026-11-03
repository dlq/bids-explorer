import * as vscode from 'vscode';
import { DatasetTreeProvider } from './ui/datasetTree';

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DatasetTreeProvider();
  context.subscriptions.push(
    provider,
    vscode.window.createTreeView('bidsExplorer.datasets', { treeDataProvider: provider }),
    vscode.commands.registerCommand('bidsExplorer.refresh', () => provider.refresh()),
  );
}
