import * as vscode from 'vscode';
import { WorkspaceFolderHandoff } from './ui/workspaceFolders';
import { HistoryPreviewManager, isHistoryFile } from './ui/historyPreview';
import { descriptionPlan, type DescriptionOptions } from './core/treeDescriptions';
import { loadTreeDescription } from './sources/treeDescriptions';
import { TablePreviewManager, isSummaryTable } from './ui/tablePreview';
import { InheritanceInspector } from './ui/inheritanceInspector';
import { interpretEntry } from './core/entities';
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

import { MetadataPreviewManager, isDatasetDescription } from './ui/metadataPreview';

const registrationsKey = 'bidsExplorer.datasets.v1';

/** Read-only dataset browser. The exported instance also supports extension-host tests. */
export function activate(context: vscode.ExtensionContext): {
  provider: DatasetTreeProvider;
  ready: Promise<void>;
} {
  const handoff = new WorkspaceFolderHandoff();
  context.subscriptions.push(handoff);
  const history = new HistoryPreviewManager(context.extensionUri);
  context.subscriptions.push(history);
  const tables = new TablePreviewManager(context.extensionUri);
  context.subscriptions.push(tables);
  const metadata = new MetadataPreviewManager(context.extensionUri);
  context.subscriptions.push(metadata);
  const gradients = new GradientPreviewManager(context.extensionUri);
  context.subscriptions.push(gradients);
  const inheritance = new InheritanceInspector(context.extensionUri, gradients);
  context.subscriptions.push(inheritance);
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
  const descriptionOptions = (
    entry: import('./core/directory').DirectoryEntry,
  ): DescriptionOptions => {
    const settings = vscode.workspace.getConfiguration(
      'bidsExplorer',
      vscode.Uri.parse(entry.datasetUri),
    );
    const column = (key: string): string => {
      const value = settings.get<unknown>(key, '');
      return typeof value === 'string' && value.length <= 200 ? value : '';
    };
    return {
      participantColumn: column('participantLabelColumn'),
      sessionColumn: column('sessionLabelColumn'),
    };
  };
  const provider = new DatasetTreeProvider(
    browser,
    (entry, signal) => loadTreeDescription(entry, descriptionOptions(entry), signal),
    (entry) => descriptionPlan(entry, descriptionOptions(entry)) !== undefined,
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('bidsExplorer')) provider.refreshDescriptions();
    }),
  );
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
      metadata.cancelPending();
      history.cancelPending();
      tables.cancelPending();
      inheritance.cancelPending();
    }),
    command('bidsExplorer.showInFileExplorer', async (arg) => {
      const target = selected(arg);
      const element = target?.type === 'message' ? target.parent : target;
      if (element?.type !== 'entry') return;
      const uri = vscode.Uri.parse(element.entry.datasetUri);
      await handoff.add(uri);
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
    vscode.commands.registerCommand(
      'bidsExplorer.previewMetadata',
      async (arg?: vscode.Uri | TreeElement) => {
        const element = arg instanceof vscode.Uri ? undefined : selected(arg);
        const active = arg === undefined ? vscode.window.activeTextEditor?.document.uri : undefined;
        const uri =
          arg instanceof vscode.Uri
            ? arg
            : active && isDatasetDescription(active)
              ? active
              : element?.type === 'entry' && element.entry.kind === 'file'
                ? vscode.Uri.parse(element.entry.uri)
                : vscode.window.activeTextEditor?.document.uri;
        if (!uri || !isDatasetDescription(uri)) {
          void vscode.window.showInformationMessage(
            'Select a dataset_description.json file to preview.',
          );
          return undefined;
        }
        try {
          return await metadata.open(uri);
        } catch (error) {
          void vscode.window.showErrorMessage(
            `BIDS Explorer could not preview metadata: ${String(error)}`,
          );
          return undefined;
        }
      },
    ),
    ...['bidsExplorer.previewParticipants', 'bidsExplorer.previewTable'].map((name) =>
      vscode.commands.registerCommand(name, async (arg?: vscode.Uri | TreeElement) => {
        const element = arg instanceof vscode.Uri ? undefined : selected(arg);
        const active = arg === undefined ? vscode.window.activeTextEditor?.document.uri : undefined;
        const uri =
          arg instanceof vscode.Uri
            ? arg
            : active && isSummaryTable(active)
              ? active
              : element?.type === 'entry' && element.entry.kind === 'file'
                ? vscode.Uri.parse(element.entry.uri)
                : active;
        if (!uri || !isSummaryTable(uri)) {
          void vscode.window.showInformationMessage(
            'Select participants.tsv or a session/scan TSV table to preview.',
          );
          return undefined;
        }
        const root =
          element?.type === 'entry' && element.entry.uri === uri.toString()
            ? element.entry.datasetUri
            : browser
                .datasets()
                .map((entry) => entry.uri)
                .filter((root) => uri.toString().startsWith(root.replace(/\/$/, '') + '/'))
                .sort((a, b) => b.length - a.length)[0];
        try {
          return await tables.open(uri, root);
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return undefined;
          void vscode.window.showErrorMessage(
            `BIDS Explorer could not preview the table: ${String(error)}`,
          );
          return undefined;
        }
      }),
    ),
    vscode.commands.registerCommand(
      'bidsExplorer.previewHistory',
      async (arg?: vscode.Uri | TreeElement) => {
        const element = arg instanceof vscode.Uri ? undefined : selected(arg);
        const active = arg === undefined ? vscode.window.activeTextEditor?.document.uri : undefined;
        const uri =
          arg instanceof vscode.Uri
            ? arg
            : active && isHistoryFile(active)
              ? active
              : element?.type === 'entry'
                ? vscode.Uri.parse(element.entry.uri)
                : active;
        if (!uri || !isHistoryFile(uri)) {
          void vscode.window.showInformationMessage('Select a CHANGES file to preview.');
          return undefined;
        }
        try {
          return await history.open(uri);
        } catch (error) {
          if (!(error instanceof Error && error.name === 'AbortError'))
            void vscode.window.showErrorMessage(`Could not preview history: ${String(error)}`);
          return undefined;
        }
      },
    ),
    command('bidsExplorer.inspectMetadata', async (arg) => {
      const element = selected(arg);
      if (element?.type !== 'entry' || element.entry.kind !== 'file') {
        void vscode.window.showInformationMessage(
          'Select a NIfTI or TSV data file in BIDS Explorer to inspect its metadata.',
        );
        return undefined;
      }
      return inheritance.open(element.entry);
    }),
    command('bidsExplorer.openFile', async (arg) => {
      const element = selected(arg);
      if (element?.type !== 'entry' || element.entry.kind !== 'file') return;
      try {
        await source.revision(element.entry);
        const uri = vscode.Uri.parse(element.entry.uri);
        if (isGradientFile(uri)) return preview(uri);
        if (isHistoryFile(uri)) {
          try {
            return await history.open(uri);
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return undefined;
            void vscode.window.showWarningMessage(
              `Could not preview history; opening the original text. ${String(error)}`,
            );
            await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
            return undefined;
          }
        }
        if (isSummaryTable(uri)) {
          try {
            return await tables.open(uri, element.entry.datasetUri);
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return undefined;
            void vscode.window.showWarningMessage(
              `Could not preview the table; opening the original TSV instead. ${String(error)}`,
            );
            await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
            return undefined;
          }
        }
        if (isDatasetDescription(uri)) {
          try {
            return await metadata.open(uri);
          } catch (error) {
            void vscode.window.showWarningMessage(
              `Could not preview the dataset description; opening the original JSON instead. ${String(error)}`,
            );
            await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
            return undefined;
          }
        }
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
          entityInterpretation: interpretEntry(entry),
          treeDescription: {
            ...provider.descriptionSnapshot(entry),
            eligible: descriptionPlan(entry, descriptionOptions(entry)) !== undefined,
          },
          treeDescriptionNote:
            'Descriptions are bounded background snapshots, not a recursive metadata index. Up to 2 jobs run at once, 32 wait and 512 results/states are retained. Unloaded entries have no attached metadata description. Refresh the relevant branch to reread sources; global Refresh also retries unloaded descriptions.',
          interpretationNote:
            'Entity interpretation records lexical folder/filename evidence only. Conflicts and duplicate filename entities remain unresolved; index strings are not normalized. Inherited metadata descriptions are reported separately in treeDescription. No BIDS conformance validation or source changes.',
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
  const ready = discover();
  return { provider, ready };
}
