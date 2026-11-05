import * as vscode from 'vscode';
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
  async inspect(
    format: 'ZIP' | 'tar',
    supplied?: vscode.Uri,
  ): Promise<vscode.TextDocument | undefined> {
    const zip = format === 'ZIP';
    const uri =
      supplied ??
      (
        await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { [format + ' archives']: zip ? ['zip'] : ['tar', 'gz', 'tgz'] },
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
      const index = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: zip
            ? 'BIDS Explorer: Indexing ZIP central directory'
            : 'BIDS Explorer: Scanning tar sequentially',
          cancellable: true,
        },
        async (_, token) => {
          const controller = new AbortController();
          this.pending.add(controller);
          const listener = token.onCancellationRequested(() => controller.abort());
          try {
            if (token.isCancellationRequested) controller.abort();
            return await (zip ? indexZip : indexTar)(uri.toString(), controller.signal);
          } finally {
            listener.dispose();
            this.pending.delete(controller);
          }
        },
      );
      const document = await vscode.workspace.openTextDocument({
        language: 'json',
        content: JSON.stringify(
          {
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
