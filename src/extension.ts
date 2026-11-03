import * as vscode from 'vscode';
import { DatasetBrowser } from './core/browser';
import { DatasetRegistrations } from './core/registrations';
import { WorkspaceDiscovery } from './core/workspaceDiscovery';
import { describeEntry, folderEntities } from './core/directory';
import {
  LocalDirectorySource,
  directoryRoot,
  recognizeLocalDataset,
} from './sources/localDirectory';
import { DatasetTreeProvider, type TreeElement } from './ui/datasetTree';

import { GradientPreviewManager, isGradientFile } from './ui/gradientPreview';

const registrationsKey = 'bidsExplorer.datasets.v1';

/** Read-only dataset browser. The exported instance also supports extension-host tests. */
export function activate(context: vscode.ExtensionContext): {
  provider: DatasetTreeProvider;
  ready: Promise<void>;
} {
  const gradients = new GradientPreviewManager(context.extensionUri);
  context.subscriptions.push(gradients);
  const preview = async (uri: vscode.Uri): Promise<vscode.WebviewPanel | undefined> => {
    try {
      return await gradients.open(uri);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `BIDS Explorer could not preview gradients: ${String(error)}`,
      );
      return undefined;
    }
  };
  const source = new LocalDirectorySource();
  const browser = new DatasetBrowser(source);
  const provider = new DatasetTreeProvider(browser);
  const tree = vscode.window.createTreeView('bidsExplorer.datasets', {
    treeDataProvider: provider,
  });
  const registrations = new DatasetRegistrations(
    browser,
    {
      read: () => context.workspaceState.get<unknown>(registrationsKey, []),
      write: async (uris) => {
        await context.workspaceState.update(registrationsKey, uris);
      },
    },
    directoryRoot,
  );
  const output = vscode.window.createOutputChannel('BIDS Explorer');
  const discovery = new WorkspaceDiscovery(
    browser,
    registrations,
    recognizeLocalDataset,
    () => provider.registrationChanged(),
    (uri, error) =>
      output.appendLine(`Workspace recognition could not inspect ${uri}: ${String(error)}`),
  );
  const discover = (): Promise<void> =>
    discovery.update(
      (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.toString()),
    );
  context.subscriptions.push(
    output,
    discovery,
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void discover();
    }),
  );
  const selected = (element?: TreeElement): TreeElement | undefined => element ?? tree.selection[0];
  const command = (name: string, action: (arg?: TreeElement) => unknown): vscode.Disposable =>
    vscode.commands.registerCommand(name, action);

  context.subscriptions.push(
    provider,
    tree,
    vscode.commands.registerCommand('bidsExplorer.addDataset', async (supplied?: vscode.Uri) => {
      const uri =
        supplied ??
        (
          await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Add read-only dataset',
          })
        )?.[0];
      if (!uri) return;
      try {
        const root = await registrations.add(uri.toString());
        discovery.allow(root.uri);
        provider.registrationChanged();
        return root;
      } catch (error) {
        await vscode.window.showErrorMessage(
          `BIDS Explorer could not add the directory: ${String(error)}`,
        );
        return undefined;
      }
    }),
    command('bidsExplorer.removeDataset', async (arg) => {
      const element = selected(arg);
      if (element?.type !== 'entry' || element.entry.relativePath !== '') return;
      await registrations.remove(element.entry);
      discovery.dismiss(element.entry.uri);
      provider.registrationChanged();
    }),
    command('bidsExplorer.refresh', async (arg) => {
      if (!arg) await discover();
      provider.refresh(arg);
    }),
    command('bidsExplorer.cancel', () => {
      provider.cancelPending();
      gradients.cancelPending();
    }),
    command('bidsExplorer.showInFileExplorer', async (arg) => {
      const target = selected(arg);
      const element = target?.type === 'message' ? target.parent : target;
      if (element?.type !== 'entry') return;
      const uri = vscode.Uri.parse(element.entry.datasetUri);
      const folders = vscode.workspace.workspaceFolders ?? [];
      const alreadyOpen = folders.some((folder) => folder.uri.toString() === uri.toString());
      if (!alreadyOpen) {
        await new Promise<void>((resolve, reject) => {
          const listener = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            if (event.added.some((folder) => folder.uri.toString() === uri.toString())) {
              listener.dispose();
              resolve();
            }
          });
          context.subscriptions.push(listener);
          if (!vscode.workspace.updateWorkspaceFolders(folders.length, 0, { uri })) {
            listener.dispose();
            reject(new Error('Could not add the dataset to the workspace.'));
          }
        });
      }
      await vscode.commands.executeCommand('revealInExplorer', uri);
    }),
    vscode.commands.registerCommand(
      'bidsExplorer.previewGradients',
      async (arg?: vscode.Uri | TreeElement) => {
        const target = arg instanceof vscode.Uri ? arg : undefined;
        const element = target ? undefined : selected(arg as TreeElement | undefined);
        const uri =
          target ??
          (element?.type === 'entry' && element.entry.kind === 'file'
            ? vscode.Uri.parse(element.entry.uri)
            : vscode.window.activeTextEditor?.document.uri);
        if (!uri || !isGradientFile(uri)) {
          void vscode.window.showInformationMessage('Select a .bval or .bvec file to preview.');
          return undefined;
        }
        return preview(uri);
      },
    ),
    command('bidsExplorer.openFile', async (arg) => {
      const element = selected(arg);
      if (element?.type !== 'entry' || element.entry.kind !== 'file') return;
      try {
        await source.revision(element.entry);
        const uri = vscode.Uri.parse(element.entry.uri);
        if (isGradientFile(uri)) return preview(uri);
        await vscode.commands.executeCommand('vscode.open', uri);
      } catch (error) {
        await vscode.window.showErrorMessage(
          `BIDS Explorer could not open the file: ${String(error)}`,
        );
      }
    }),
    command('bidsExplorer.showDetails', async (arg) => {
      const element = selected(arg);
      if (element?.type !== 'entry') return;
      const entry = element.entry;
      let revision: unknown;
      try {
        revision = await source.revision(entry);
      } catch (error) {
        revision = { error: String(error) };
      }
      const snapshot = browser.snapshot(entry);
      const content = JSON.stringify(
        {
          sourceUri: entry.uri,
          datasetUri: entry.datasetUri,
          originalRelativePath: entry.relativePath,
          interpretation: describeEntry(entry),
          canonicalFolderEntities: folderEntities(entry),
          interpretationNote:
            'Canonical folder labels only; no normalization, validation or inherited metadata.',
          kind: entry.kind,
          revision,
          coverage:
            entry.kind === 'directory'
              ? {
                  immediateChildren: snapshot.coverage,
                  cachedListingIsStale: snapshot.stale,
                  physicalChildCount: snapshot.physicalChildCount,
                  recognizedChildCount:
                    snapshot.physicalChildCount === undefined
                      ? undefined
                      : snapshot.children.length,
                  descendants: 'unknown',
                  error: snapshot.error,
                }
              : undefined,
        },
        null,
        2,
      );
      const document = await vscode.workspace.openTextDocument({ content, language: 'json' });
      await vscode.window.showTextDocument(document, { preview: true });
    }),
  );
  tree.message = 'BIDS elements · read-only';
  const ready = discover();
  return { provider, ready };
}
