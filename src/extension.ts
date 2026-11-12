import { acquisitionSummary } from './core/acquisitions';
import * as vscode from 'vscode';
import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { entryArchiveUri, resourcePath } from './core/archiveUri';
import { datasetAvailability } from './core/availability';
import { DatasetBrowser } from './core/browser';
import {
  describeEntry,
  folderEntities,
  isRecognizedBidsEntry,
  type DirectoryEntry,
} from './core/directory';
import { interpretEntry } from './core/entities';
import { linkedDerivativeDatasets } from './core/participantData';
import { DatasetRegistrations } from './core/registrations';
import { findRecordedScan } from './core/scanNavigation';
import type { TextSnapshot } from './core/textSnapshot';
import { descriptionPlan, type DescriptionOptions } from './core/treeDescriptions';
import { WorkspaceDiscovery, isDeclaredCollection } from './core/workspaceDiscovery';
import { ArchiveImageCache } from './sources/archiveImageCache';
import { ArchiveInventoryCache } from './sources/archiveInventoryCache';
import { AvailabilityCache } from './sources/availabilityCache';
import { directoryRoot, recognizeLocalDataset } from './sources/localDirectory';
import { LogicalDirectorySource, savedArchivePlacements } from './sources/logicalDirectory';
import { loadLogicalInheritance } from './sources/logicalInheritance';
import { readTextSnapshot } from './sources/textSnapshotReader';
import { loadTreeDescription } from './sources/treeDescriptionLoader';
import { ArchiveDirectorySource } from './sources/archiveDirectory';
import { ArchiveInspector } from './ui/archiveInspector';
import { openAvailabilityView } from './ui/availabilityView';
import { withCancellation } from './ui/cancellation';
import { openDatasetDescriptionComparison } from './ui/datasetDescriptionComparison';
import { DatasetTreeProvider, type EntryElement, type TreeElement } from './ui/datasetTreeProvider';
import { GradientPreviewManager, isGradientFile } from './ui/gradientPreview';
import { HistoryPreviewManager, isHistoryFile } from './ui/historyPreview';
import { ImageView } from './ui/imageView';
import { InheritanceInspector } from './ui/inheritanceInspector';
import { MetadataPreviewManager, isJsonMetadata } from './ui/metadataPreview';
import { isNiftiFileName, NiftiPreviewManager, progressiveNiftiViewType } from './ui/niftiPreview';
import { TablePreviewManager, isSummaryTable } from './ui/tablePreview';
import { WebviewPanelStore } from './ui/webviewPanelStore';
import { WorkspaceFolderHandoff } from './ui/workspaceFolderHandoff';

const registrationsKey = 'bidsExplorer.datasets.v1';

/** Read-only dataset browser. The exported instance also supports extension-host tests. */
export function activate(context: vscode.ExtensionContext): {
  provider: DatasetTreeProvider;
  ready: Promise<void>;
  imageView: ImageView;
} {
  const imageCache = new ArchiveImageCache(
    vscode.Uri.joinPath(context.storageUri ?? context.globalStorageUri, 'extracted-images-v1')
      .fsPath,
  );
  const panels = new WebviewPanelStore();
  context.subscriptions.push(panels);
  const archiveWork = new Set<AbortController>();
  const trackArchiveWork = async <T>(controller: AbortController, read: () => PromiseLike<T>) => {
    archiveWork.add(controller);
    try {
      return await read();
    } finally {
      archiveWork.delete(controller);
    }
  };
  context.subscriptions.push({
    dispose: () => {
      for (const controller of archiveWork) controller.abort();
    },
  });
  context.subscriptions.push(
    ...['bids-zip', 'bids-tar', 'bids-squashfs'].map((scheme) =>
      vscode.workspace.registerTextDocumentContentProvider(scheme, {
        provideTextDocumentContent: (uri, token) => {
          const controller = new AbortController();
          return trackArchiveWork(controller, () =>
            withCancellation(
              token,
              controller,
              async (signal) => (await readTextSnapshot(uri.toString(), signal)).text,
            ),
          );
        },
      }),
    ),
  );
  const entryUri = (entry: DirectoryEntry): vscode.Uri =>
    vscode.Uri.parse(entry.archive ? entryArchiveUri(entry) : entry.uri);
  const archiveInspector = new ArchiveInspector();
  context.subscriptions.push(archiveInspector);
  const handoff = new WorkspaceFolderHandoff();
  context.subscriptions.push(handoff);
  const history = new HistoryPreviewManager(context.extensionUri);
  context.subscriptions.push(history);
  const tables = new TablePreviewManager(context.extensionUri, openRecordedScan);
  context.subscriptions.push(tables);
  const metadata = new MetadataPreviewManager(context.extensionUri);
  context.subscriptions.push(metadata);
  const gradients = new GradientPreviewManager(context.extensionUri);
  context.subscriptions.push(gradients);
  const inventoryCache = new ArchiveInventoryCache(
    vscode.Uri.joinPath(context.storageUri ?? context.globalStorageUri, 'archive-inventories-v1')
      .fsPath,
  );
  const availabilityCache = new AvailabilityCache(
    vscode.Uri.joinPath(context.globalStorageUri, 'availability-index-v1').fsPath,
  );
  const derivativeLinks = () =>
    vscode.workspace.getConfiguration('bidsExplorer').get<unknown>('derivativeDatasets');
  const configuredPlacements = () =>
    vscode.workspace.getConfiguration('bidsExplorer').get<unknown>('archivePlacements');
  const source = new LogicalDirectorySource(
    new ArchiveDirectorySource(undefined, undefined, inventoryCache),
    configuredPlacements,
  );
  const imageView = new ImageView(context.extensionUri, (entry, signal) =>
    loadLogicalInheritance(source, entry, signal),
  );
  const niftiPreviews = new NiftiPreviewManager(context.extensionUri, imageView);
  context.subscriptions.push(
    imageView,
    niftiPreviews,
    vscode.window.registerWebviewViewProvider('bidsExplorer.imageControls', imageView),
  );
  const inheritance = new InheritanceInspector(context.extensionUri, gradients, (entry, signal) =>
    loadLogicalInheritance(source, entry, signal),
  );
  context.subscriptions.push(inheritance);
  const previewGradients = async (uri: vscode.Uri): Promise<vscode.WebviewPanel | undefined> => {
    try {
      return await gradients.open(uri);
    } catch (error) {
      void vscode.window.showErrorMessage(
        `BIDS Explorer could not preview gradients: ${String(error)}`,
      );
      return undefined;
    }
  };
  const browser = new DatasetBrowser(source);
  const descriptionOptions = (entry: DirectoryEntry): DescriptionOptions => {
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
  const descriptionEligible = (entry: DirectoryEntry): boolean =>
    !entry.archive &&
    (!entry.logical ||
      (entry.logical.sources.length === 1 &&
        entry.logical.sources[0].relativePath === entry.relativePath &&
        !entry.logical.sources[0].archive)) &&
    descriptionPlan(entry, descriptionOptions(entry)) !== undefined;
  const provider = new DatasetTreeProvider(
    browser,
    (entry, signal) => loadTreeDescription(entry, descriptionOptions(entry), signal),
    descriptionEligible,
    context.extensionUri,
    derivativeLinks,
    async (entry, signal) =>
      acquisitionSummary(await loadLogicalInheritance(source, entry, signal)),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('bidsExplorer')) provider.refreshDescriptions();
      if (event.affectsConfiguration('bidsExplorer.collectionRoots')) void discover();
      if (event.affectsConfiguration('bidsExplorer.archivePlacements')) provider.refresh();
      if (event.affectsConfiguration('bidsExplorer.derivativeDatasets'))
        provider.registrationChanged();
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
    (uri) =>
      isDeclaredCollection(
        uri,
        vscode.workspace.getConfiguration('bidsExplorer').get<unknown>('collectionRoots', []),
      )
        ? source.root(uri)
        : recognizeLocalDataset(uri),
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

  let pendingArchiveImageOpens = 0;
  const openArchiveImagePanels = new Set<vscode.WebviewPanel>();
  let imageCacheLease: Promise<() => Promise<void>> | undefined;
  const hasTabs = () => vscode.window.tabGroups.all.some((group) => group.tabs.length);
  const releaseUnusedImages = async () => {
    if (pendingArchiveImageOpens || openArchiveImagePanels.size || hasTabs() || !imageCacheLease)
      return;
    const lease = imageCacheLease;
    imageCacheLease = undefined;
    try {
      await (
        await lease
      )();
    } catch (error) {
      output.appendLine(`Could not release extracted image cache use: ${String(error)}`);
    }
  };
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(() => void releaseUnusedImages()),
  );

  const openImage = async (entry: DirectoryEntry, editor = progressiveNiftiViewType) => {
    const uri = entryUri(entry);
    const open = async (target: vscode.Uri) => {
      if (editor === progressiveNiftiViewType) return niftiPreviews.open(target, entry);
      if (editor) await vscode.commands.executeCommand('vscode.openWith', target, editor);
      else await vscode.commands.executeCommand('vscode.open', target);
    };
    if (entry.archive) {
      const controller = new AbortController();
      archiveWork.add(controller);
      pendingArchiveImageOpens++;
      try {
        imageCacheLease ??= imageCache.retain().catch((error: unknown) => {
          imageCacheLease = undefined;
          throw error;
        });
        await imageCacheLease;
        const extracted = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title:
              entry.archive.format === 'tar'
                ? 'BIDS Explorer: Opening tar MRI (first open scans sequentially)'
                : 'BIDS Explorer: Preparing selected MRI image',
            cancellable: true,
          },
          (_, token) =>
            withCancellation(token, controller, (signal) =>
              imageCache.materialize(uri.toString(), signal),
            ),
        );
        controller.signal.throwIfAborted();
        const panel = await open(vscode.Uri.parse(extracted));
        if (panel && !openArchiveImagePanels.has(panel)) {
          openArchiveImagePanels.add(panel);
          panel.onDidDispose(() => {
            openArchiveImagePanels.delete(panel);
            void releaseUnusedImages();
          });
        }
        return extracted;
      } finally {
        archiveWork.delete(controller);
        pendingArchiveImageOpens--;
        await releaseUnusedImages();
      }
    }
    return await open(uri);
  };
  const previewOrOpenText = async (
    uri: vscode.Uri,
    load: () => Promise<vscode.WebviewPanel>,
    warning: string,
  ) => {
    try {
      return await load();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      void vscode.window.showWarningMessage(warning + ' ' + String(error));
      await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
    }
  };
  const reportOpenError = (error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError') return;
    output.appendLine(`Could not open selected source: ${String(error)}`);
    void vscode.window.showErrorMessage(`BIDS Explorer could not open the file: ${String(error)}`);
  };

  function openTable(uri: vscode.Uri, entry?: DirectoryEntry) {
    if (entry && entryUri(entry).toString() === uri.toString())
      return tables.open(uri, entry.datasetUri, entry.relativePath);
    const root = browser
      .datasets()
      .map((entry) => entry.uri)
      .filter((root) => uri.toString().startsWith(root.replace(/\/$/, '') + '/'))
      .sort((a, b) => b.length - a.length)[0];
    const path =
      root && uri.scheme === 'file'
        ? relative(fileURLToPath(root), uri.fsPath).split(sep).join('/')
        : undefined;
    return tables.open(uri, root, path);
  }

  async function openEntry(entry: DirectoryEntry) {
    const { metadataVersions, name } = entry;
    if (metadataVersions && name === 'dataset_description.json') {
      const controller = new AbortController();
      return await trackArchiveWork(controller, () =>
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'BIDS Explorer: Comparing dataset descriptions',
            cancellable: true,
          },
          (_, token) =>
            withCancellation(token, controller, async (signal) =>
              panels.add(
                await openDatasetDescriptionComparison(
                  metadataVersions,
                  context.extensionUri,
                  signal,
                ),
              ),
            ),
        ),
      );
    }
    if (entry.kind !== 'file') return;
    await source.revision(entry);
    const uri = entryUri(entry);
    if (isNiftiFileName(resourcePath(uri.toString()))) return await openImage(entry);
    if (isGradientFile(uri)) return previewGradients(uri);
    if (isHistoryFile(uri))
      return await previewOrOpenText(
        uri,
        () => history.open(uri),
        'Could not preview history; opening the original text.',
      );
    if (isSummaryTable(uri))
      return await previewOrOpenText(
        uri,
        () => openTable(uri, entry),
        'Could not preview the table; opening the original TSV instead.',
      );
    if (isJsonMetadata(uri))
      return await previewOrOpenText(
        uri,
        () => metadata.open(uri),
        'Could not preview JSON metadata; opening the original JSON instead.',
      );
    await vscode.commands.executeCommand('vscode.open', uri);
  }

  async function openRecordedScan(
    datasetUri: string | undefined,
    tablePath: string | undefined,
    table: TextSnapshot,
    filename: string,
    signal: AbortSignal,
  ): Promise<string> {
    const recorded = `“${filename || '(empty)'}”`;
    const root = browser.datasets().find((entry) => entry.datasetUri === datasetUri);
    if (!root || !tablePath)
      return `Scan not checked ${recorded}. Reopen the table from its registered dataset in the BIDS tree.`;
    const scanSource = {
      children: (entry: DirectoryEntry, abort: AbortSignal) => {
        const current = browser.snapshot(entry);
        const prefix = entry.relativePath ? entry.relativePath + '/' : '';
        // A table opened on a later SquashFS page can use its visible ancestors.
        // Below the table directory, always read the physical branches again.
        if (
          !current.stale &&
          current.paging &&
          current.paging.page > 1 &&
          tablePath.startsWith(prefix) &&
          current.children.some(
            (child) =>
              child.kind === 'directory' &&
              child.name === tablePath.slice(prefix.length).split('/')[0],
          )
        )
          return Promise.resolve([...current.children, { ...entry, paging: current.paging }]);
        return source.children(entry, abort);
      },
      revision: (entry: DirectoryEntry) => source.revision(entry),
    };
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Finding recorded scan',
        cancellable: true,
      },
      (_, token) => {
        const controller = new AbortController();
        return withCancellation(token, controller, (progressSignal) =>
          findRecordedScan(
            scanSource,
            root,
            tablePath,
            table,
            filename,
            AbortSignal.any([signal, progressSignal]),
          ),
        ).catch((error: unknown) => {
          if (!controller.signal.aborted) throw error;
        });
      },
    );
    if (!result) return 'Scan lookup cancelled.';
    switch (result.status) {
      case 'invalid':
        return `Invalid scan reference ${recorded}. Use a relative path within the table’s dataset or pipeline, without URLs or parent-directory segments.`;
      case 'stale':
        return `The table source changed. Reload its snapshot before opening ${recorded}.`;
      case 'missing':
        return `Scan missing ${recorded}. No exact match was found in the checked scope.`;
      case 'unchecked':
        return `Scan not fully checked ${recorded}. Browse the relevant pages or archive branch to inspect additional sources.`;
      case 'unreadable':
        return `Could not read the scan scope for ${recorded}. Refresh the relevant branch and try again.`;
    }
    const coverage = [
      result.unchecked ? 'Some sources were not checked.' : '',
      result.unreadable ? 'Some sources could not be read.' : '',
    ]
      .filter(Boolean)
      .join(' ');
    let entry = result.entries[0];
    if (result.entries.length > 1 || coverage) {
      const cancellation = new vscode.CancellationTokenSource();
      const cancel = () => cancellation.cancel();
      signal.throwIfAborted();
      signal.addEventListener('abort', cancel, { once: true });
      const selected = await Promise.resolve(
        vscode.window.showQuickPick(
          result.entries.map((entry) => ({
            label: entry.name,
            description: entry.archive?.sourceUri ?? entry.uri,
            detail: entry.archive
              ? `${entry.archive.memberPath} (member ${entry.archive.memberIndex ?? 'directory'})`
              : undefined,
            entry,
          })),
          {
            title: 'Choose scan source',
            placeHolder: coverage || filename,
            matchOnDescription: true,
            matchOnDetail: true,
          },
          cancellation.token,
        ),
      ).finally(() => {
        signal.removeEventListener('abort', cancel);
        cancellation.dispose();
      });
      if (!selected) return `Scan selection cancelled. ${coverage}`.trim();
      entry = selected.entry;
    }
    signal.throwIfAborted();
    if (!browser.datasets().includes(root))
      return 'The dataset is no longer registered. Reopen the table.';
    if (entry.kind === 'directory') {
      if (entry.archive) {
        const folder = result.directories.find((folder) =>
          folder.logical?.sources.some(
            (physical) =>
              physical.archive?.sourceUri === entry.archive?.sourceUri &&
              physical.archive?.memberPath === entry.archive?.memberPath,
          ),
        );
        if (!folder || !isRecognizedBidsEntry(folder))
          return `Found ${recorded} in the archive. Browse the selected archive to inspect this directory.`;
        let parent: EntryElement | undefined;
        for (const branch of [...result.ancestors, folder]) {
          const row = provider.element(branch);
          row.treeParent = parent;
          parent = row;
        }
        await tree.reveal(parent!, { select: true, focus: true });
      } else {
        await handoff.add(vscode.Uri.parse(root.uri));
        await vscode.commands.executeCommand('revealInExplorer', entryUri(entry));
      }
      return `Located ${recorded}. ${coverage}`.trim();
    }
    await openEntry(entry);
    return `Opened ${recorded}. ${coverage}`.trim();
  }

  context.subscriptions.push(
    provider,
    tree,
    vscode.commands.registerCommand('bidsExplorer.clearImageCache', async () => {
      await releaseUnusedImages();
      if (archiveWork.size || hasTabs() || !(await imageCache.clear())) {
        void vscode.window.showInformationMessage(
          'Close editor and viewer tabs in all windows using this workspace and finish pending archive work before clearing extracted images.',
        );
        return false;
      }
      return true;
    }),
    vscode.commands.registerCommand('bidsExplorer.inspectZip', (uri?: vscode.Uri) =>
      archiveInspector.inspect('ZIP', uri),
    ),
    vscode.commands.registerCommand('bidsExplorer.inspectTar', (uri?: vscode.Uri) =>
      archiveInspector.inspect('tar', uri),
    ),
    vscode.commands.registerCommand('bidsExplorer.inspectSquashfs', (uri?: vscode.Uri) =>
      archiveInspector.inspect('SquashFS', uri),
    ),
    vscode.commands.registerCommand('bidsExplorer.browseSquashfs', (uri?: vscode.Uri) =>
      archiveInspector.browseSquashfs(uri),
    ),
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
    command('bidsExplorer.showAvailability', (arg) => {
      const element = selected(arg);
      if (element?.type !== 'entry' || element.entry.relativePath !== '') return;
      const root = browser
        .datasets()
        .find((dataset) => dataset.datasetUri === element.entry.datasetUri);
      if (!root) return;
      return panels.add(
        openAvailabilityView(
          context.extensionUri,
          (controller, progress, retryIncomplete) =>
            trackArchiveWork(controller, async () => {
              if (!browser.datasets().includes(root)) throw new Error('Dataset was removed');
              const links = linkedDerivativeDatasets(root, browser.datasets(), derivativeLinks());
              const scan = () =>
                datasetAvailability(source, root, controller.signal, progress, links);
              const placements = configuredPlacements();
              if (
                links.issues.length ||
                [root, ...links.roots].some(
                  (entry) => savedArchivePlacements(placements, entry.datasetUri).length,
                )
              )
                return await scan();
              return await availabilityCache.load(
                root,
                controller.signal,
                scan,
                retryIncomplete,
                links.roots,
              );
            }),
          async (participant) => {
            const current = browser
              .snapshot(root)
              .children.find((row) => row.relativePath === participant.relativePath);
            if (
              current &&
              browser.datasets().some((dataset) => dataset.datasetUri === root.datasetUri)
            ) {
              try {
                await tree.reveal(provider.element(current), { select: true, focus: true });
                return;
              } catch {
                // The page can change while VS Code resolves the tree item.
              }
            }
            void vscode.window.showInformationMessage(
              'Return to the participant’s page in BIDS Explorer, then try again.',
            );
          },
        ),
      );
    }),
    command('bidsExplorer.refresh', async (arg) => {
      if (!arg) await discover();
      provider.refresh(arg);
    }),
    command('bidsExplorer.cancel', () => {
      provider.cancelPending();
      archiveInspector.cancelPending();
      for (const controller of archiveWork) controller.abort();
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
            ? entryUri(element.entry)
            : vscode.window.activeTextEditor?.document.uri);
        if (!uri || !isGradientFile(uri)) {
          void vscode.window.showInformationMessage('Select a .bval or .bvec file to preview.');
          return undefined;
        }
        return previewGradients(uri);
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
            : active && isJsonMetadata(active)
              ? active
              : element?.type === 'entry' && element.entry.kind === 'file'
                ? entryUri(element.entry)
                : vscode.window.activeTextEditor?.document.uri;
        if (!uri || !isJsonMetadata(uri)) {
          void vscode.window.showInformationMessage('Select a JSON metadata file to preview.');
          return undefined;
        }
        try {
          return await metadata.open(uri);
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return undefined;
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
                ? entryUri(element.entry)
                : active;
        if (!uri || !isSummaryTable(uri)) {
          void vscode.window.showInformationMessage(
            'Select participants.tsv or a session/scan/event TSV table to preview.',
          );
          return undefined;
        }
        try {
          return await openTable(
            uri,
            element?.type === 'entry' && element.entry.kind === 'file' ? element.entry : undefined,
          );
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
                ? entryUri(element.entry)
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
    command('bidsExplorer.nextPage', async (arg) => {
      const element = selected(arg);
      if (element?.type === 'entry') await provider.nextPage(element);
    }),
    command('bidsExplorer.previousPage', async (arg) => {
      const element = selected(arg);
      if (element?.type === 'entry') await provider.nextPage(element, 'previous');
    }),
    command('bidsExplorer.openFile', async (arg) => {
      const element = selected(arg);
      if (element?.type !== 'entry') return;
      try {
        return await openEntry(element.entry);
      } catch (error) {
        reportOpenError(error);
      }
    }),
    vscode.commands.registerCommand(
      'bidsExplorer.openImageWith',
      async (arg?: TreeElement, viewId?: string) => {
        const element = selected(arg);
        if (
          element?.type !== 'entry' ||
          element.entry.kind !== 'file' ||
          !isNiftiFileName(element.entry.name)
        )
          return;
        try {
          if (viewId !== undefined && typeof viewId !== 'string') return;
          let editor = viewId;
          if (editor === undefined) {
            const choices: { label: string; editor?: string }[] = [
              { label: 'BIDS Explorer · Progressive NIfTI', editor: progressiveNiftiViewType },
              { label: 'Configured editor', editor: '' },
              { label: 'VS Code text editor', editor: 'default' },
            ];
            if (vscode.extensions.getExtension('korbinianeckstein.niivue'))
              choices.push({ label: 'NiiVue', editor: 'niiVue.default' });
            choices.push({ label: 'Other custom editor…' });
            const choice = await vscode.window.showQuickPick(choices, {
              placeHolder: 'Open NIfTI image with',
            });
            if (!choice) return;
            editor =
              choice.editor ??
              (
                await vscode.window.showInputBox({
                  prompt: 'Enter the custom editor view ID from the viewer extension’s manifest',
                  validateInput: (value) =>
                    value.trim() ? undefined : 'Enter a custom editor view ID.',
                })
              )?.trim();
            if (editor === undefined) return;
          }
          await source.revision(element.entry);
          return await openImage(element.entry, editor);
        } catch (error) {
          reportOpenError(error);
        }
      },
    ),
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
      const snapshot = provider.snapshot(element);
      const content = JSON.stringify(
        {
          sourceUri: entry.uri,
          archive: entry.archive,
          logical: entry.logical,
          physicalSourceNote: entry.logical
            ? 'Logical display paths are navigation only. logical.sources retains every original physical entry; archive names are provisional placement evidence until member inspection.'
            : undefined,
          datasetUri: entry.datasetUri,
          originalRelativePath: entry.logical
            ? entry.logical.sources.length === 1
              ? entry.logical.sources[0].relativePath
              : undefined
            : entry.relativePath,
          logicalRelativePath: entry.logical ? entry.relativePath : undefined,
          interpretation: describeEntry(entry),
          canonicalFolderEntities: folderEntities(entry),
          entityInterpretation: interpretEntry(entry),
          treeDescription: {
            ...provider.descriptionSnapshot(entry),
            eligible: descriptionEligible(entry),
          },
          acquisitionSummary: provider.summaries?.snapshot(entry),
          treeDescriptionNote:
            'Descriptions and acquisition summaries are bounded background snapshots, not a recursive metadata index. Each queue runs up to 2 jobs at once, with 32 waiting jobs and 512 retained results/states. Acquisition summaries start on expansion and use resolved, recorded timing fields. Unloaded entries have no attached metadata description. Refresh the relevant branch to reread sources; global Refresh also retries unloaded descriptions.',
          interpretationNote:
            'Entity interpretation records lexical folder/filename evidence only. Conflicts and duplicate filename entities remain unresolved; index strings are not normalized. Inherited metadata descriptions are reported separately in treeDescription. No BIDS conformance validation or source changes.',
          kind: entry.kind,
          revision,
          revisionScope: entry.archive
            ? entry.archive.format === 'squashfs'
              ? 'SquashFS image'
              : entry.archive.format === 'tar'
                ? 'Tar container'
                : 'ZIP container'
            : entry.logical
              ? 'first physical source choice'
              : 'filesystem entry',
          coverage:
            entry.kind === 'directory'
              ? {
                  immediateChildren: snapshot.coverage,
                  cachedListingIsStale: snapshot.stale,
                  physicalChildCount:
                    entry.archive || entry.logical || snapshot.paging
                      ? undefined
                      : snapshot.physicalChildCount,
                  logicalNavigationChildCount: entry.logical
                    ? snapshot.physicalChildCount
                    : undefined,
                  archiveNavigationChildCount: entry.archive
                    ? snapshot.physicalChildCount
                    : undefined,
                  recognizedChildCount:
                    snapshot.physicalChildCount === undefined
                      ? undefined
                      : snapshot.children.length,
                  page: snapshot.paging && {
                    number: snapshot.paging.page,
                    hasNext: Boolean(snapshot.paging.next),
                    unavailableSources: snapshot.paging.failures,
                  },
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
  return { provider, ready, imageView };
}
