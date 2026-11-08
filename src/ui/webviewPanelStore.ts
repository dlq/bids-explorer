import type * as vscode from 'vscode';

/** Own standalone panels without retaining closed panels until extension shutdown. */
export class WebviewPanelStore implements vscode.Disposable {
  private readonly panels = new Set<vscode.WebviewPanel>();
  private disposed = false;

  add(panel: vscode.WebviewPanel): vscode.WebviewPanel {
    if (this.disposed) {
      panel.dispose();
      return panel;
    }
    this.panels.add(panel);
    const closed = panel.onDidDispose(() => {
      this.panels.delete(panel);
      closed.dispose();
    });
    return panel;
  }

  dispose(): void {
    this.disposed = true;
    for (const panel of this.panels) panel.dispose();
    this.panels.clear();
  }
}
