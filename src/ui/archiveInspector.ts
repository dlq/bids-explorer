import { withCancellation } from './cancellation';
import { assertArchivePath } from '../core/archive';
import * as vscode from 'vscode';
import { readSquashfsRoot, type SquashfsPageRead } from '../sources/squashfsDirectory';
import { inspectSquashfs } from '../sources/squashfsHeader';
import { indexTar } from '../sources/tarIndex';
import { indexZip } from '../sources/zipIndex';

/** An explicit inventory command; does not yet register or merge a dataset. */
export class ArchiveInspector implements vscode.Disposable {
  private readonly pending = new Set<AbortController>();
  cancelPending(): void {
    for (const controller of this.pending) controller.abort();
  }
  dispose(): void {
    this.cancelPending();
  }
  private read<T>(title: string, action: (signal: AbortSignal) => Promise<T>): Thenable<T> {
    return vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title, cancellable: true },
      async (_, token) => {
        const controller = new AbortController();
        this.pending.add(controller);
        try {
          return await withCancellation(token, controller, action);
        } finally {
          this.pending.delete(controller);
        }
      },
    );
  }

  async browseSquashfs(supplied?: vscode.Uri): Promise<void> {
    const uri =
      supplied ??
      (
        await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { 'SquashFS images': ['squashfs', 'sqfs', 'sqsh'] },
          openLabel: 'Browse SquashFS (read-only)',
        })
      )?.[0];
    if (!uri) return;
    if (uri.scheme !== 'file') {
      void vscode.window.showErrorMessage(
        'Browse SquashFS on the workspace host using a local file URI.',
      );
      return;
    }
    type Location = { path: string; read: SquashfsPageRead; parent?: Location };
    let directory: Location = {
      path: '/',
      read: (signal) => readSquashfsRoot(uri.toString(), signal),
    };
    let read = directory.read;
    try {
      for (;;) {
        const page = await this.read('BIDS Explorer: Reading SquashFS directory page', read);
        const items: (vscode.QuickPickItem & { action: () => void })[] = [];
        if (directory.parent)
          items.push({
            label: '$(arrow-up) Parent directory',
            action: () => {
              directory = directory.parent!;
              read = directory.read;
            },
          });
        if (read !== directory.read)
          items.push({
            label: '$(arrow-left) First page',
            action: () => {
              read = directory.read;
            },
          });
        if (page.next)
          items.push({
            label: '$(arrow-right) Next page',
            action: () => {
              read = page.next!;
            },
          });
        for (const entry of page.entries) {
          const open = entry.open;
          items.push({
            label: entry.name,
            description: entry.kind,
            action: () => {
              if (!open) return;
              assertArchivePath((directory.path + entry.name).slice(1));
              directory = {
                path: directory.path + entry.name + '/',
                read: open,
                parent: directory,
              };
              read = open;
            },
          });
        }
        if (!items.length) {
          void vscode.window.showInformationMessage('SquashFS directory is empty.');
          return;
        }
        const selected = await vscode.window.showQuickPick(items, {
          title: `SquashFS · ${directory.path}`,
          placeHolder: page.next
            ? 'This page is partial. Choose Next page to continue.'
            : 'Choose a directory to expand or press Escape to close.',
        });
        if (!selected) return;
        selected.action();
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        void vscode.window.showErrorMessage(
          `BIDS Explorer could not browse SquashFS: ${String(error)}`,
        );
    }
  }

  async inspect(
    format: 'ZIP' | 'tar' | 'SquashFS',
    supplied?: vscode.Uri,
  ): Promise<vscode.TextDocument | undefined> {
    const zip = format === 'ZIP';
    const squashfs = format === 'SquashFS';
    const uri =
      supplied ??
      (
        await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {
            [format + ' archives']: zip
              ? ['zip']
              : squashfs
                ? ['squashfs', 'sqfs', 'sqsh']
                : ['tar', 'gz', 'tgz'],
          },
          openLabel: `Inspect ${format} index (read-only)`,
        })
      )?.[0];
    if (!uri) return undefined;
    if (uri.scheme !== 'file') {
      void vscode.window.showErrorMessage(
        `Inspect ${format} on its workspace host using a local file URI.`,
      );
      return undefined;
    }
    try {
      const index = await this.read(
        zip
          ? 'BIDS Explorer: Indexing ZIP central directory'
          : squashfs
            ? 'BIDS Explorer: Reading SquashFS superblock'
            : 'BIDS Explorer: Scanning tar sequentially',
        async (signal) =>
          (zip ? indexZip : squashfs ? inspectSquashfs : indexTar)(uri.toString(), signal),
      );
      const document = await vscode.workspace.openTextDocument({
        language: 'json',
        content: JSON.stringify(
          'superblock' in index
            ? {
                ...index,
                note: 'Fixed-size header only. Inode count includes files and directories. Member and participant coverage is unknown.',
              }
            : {
                note: zip
                  ? 'Central-directory inventory only. Member payloads have not been decompressed or verified. No extraction, dataset registration or logical placement has been performed.'
                  : 'Sequential tar inventory. A gzip tarball must be decompressed through the end to list every member. No member files were extracted or registered.',
                format: 'format' in index ? index.format : undefined,
                sourceUri: index.sourceUri,
                revision: index.revision,
                capturedAt: index.capturedAt,
                coverage: index.coverage,
                totalMembers: index.members.length,
                displayedMembers: Math.min(200, index.members.length),
                displayLimit:
                  'First 200 members in source order; this report does not display the full index when larger.',
                members: index.members.slice(0, 200),
              },
          null,
          2,
        ),
      });
      await vscode.window.showTextDocument(document, { preview: true });
      return document;
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        void vscode.window.showErrorMessage(
          `BIDS Explorer could not index ${format}: ${String(error)}`,
        );
      return undefined;
    }
  }
}
