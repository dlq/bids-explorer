import * as vscode from 'vscode';

/** Serialize our edits and wait for confirmed workspace events, including another extension's edit. */
export class WorkspaceFolderHandoff implements vscode.Disposable {
  private pending = Promise.resolve();
  private readonly cancellations = new Set<() => void>();
  private disposed = false;
  add(uri: vscode.Uri): Promise<void> {
    const next = this.pending.then(() => this.ensure(uri));
    this.pending = next.catch(() => {});
    return next;
  }
  private ensure(uri: vscode.Uri): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Workspace handoff has been closed.'));
    return new Promise<void>((resolve, reject) => {
      let submitted = false,
        done = false;
      const cancel = () => finish(new Error('Workspace handoff cancelled.'));
      const finish = (error?: Error): void => {
        if (done) return;
        done = true;
        listener.dispose();
        clearTimeout(timer);
        this.cancellations.delete(cancel);
        if (error) reject(error);
        else resolve();
      };
      const submit = (): void => {
        const folders = vscode.workspace.workspaceFolders ?? [];
        if (folders.some((folder) => folder.uri.toString() === uri.toString())) {
          finish();
          return;
        }
        submitted = vscode.workspace.updateWorkspaceFolders(folders.length, 0, { uri });
        // False may mean an earlier edit is still awaiting acknowledgement. Wait for its event.
      };
      const listener = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        if (event.added.some((folder) => folder.uri.toString() === uri.toString())) finish();
        else if (!submitted) submit();
      });
      this.cancellations.add(cancel);
      const timer = setTimeout(
        () =>
          finish(
            new Error(
              'VS Code did not confirm the workspace folder update. Retry Show Dataset in File Explorer.',
            ),
          ),
        5000,
      );
      submit();
    });
  }
  dispose(): void {
    this.disposed = true;
    for (const cancel of [...this.cancellations]) cancel();
  }
}
