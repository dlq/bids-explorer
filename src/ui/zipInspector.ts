import * as vscode from 'vscode';
import { indexZip } from '../sources/zipIndex';

/** An explicit inventory command; does not yet register or merge a dataset. */
export class ZipInspector implements vscode.Disposable {
  private readonly pending = new Set<AbortController>();
  cancelPending(): void {
    for (const controller of this.pending) controller.abort();
  }
  dispose(): void {
    this.cancelPending();
  }
  async inspect(supplied?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
    const uri =
      supplied ??
      (
        await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { 'ZIP archives': ['zip'] },
          openLabel: 'Inspect ZIP index (read-only)',
        })
      )?.[0];
    if (!uri) return undefined;
    if (uri.scheme !== 'file') {
      void vscode.window.showErrorMessage(
        'Inspect ZIP on its workspace host using a local file URI.',
      );
      return undefined;
    }
    try {
      const index = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'BIDS Explorer: Indexing ZIP central directory',
          cancellable: true,
        },
        async (_, token) => {
          const controller = new AbortController();
          this.pending.add(controller);
          const listener = token.onCancellationRequested(() => controller.abort());
          try {
            if (token.isCancellationRequested) controller.abort();
            return await indexZip(uri.toString(), controller.signal);
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
            note: 'Central-directory inventory only. Member payloads have not been decompressed or verified. No extraction, dataset registration or logical placement has been performed.',
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
        void vscode.window.showErrorMessage(`BIDS Explorer could not index ZIP: ${String(error)}`);
      return undefined;
    }
  }
}
