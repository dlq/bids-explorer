import * as vscode from 'vscode';

/** Owns the keyed panels and in-flight reads for one kind of preview. */
export class PreviewPanelManager implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly pending = new Map<string, Promise<vscode.WebviewPanel>>();
  private readonly work = new Set<AbortController>();
  private disposed = false;

  constructor(
    protected readonly extensionUri: vscode.Uri,
    private readonly closedMessage: string,
  ) {}

  protected showPanel<T>(
    key: string,
    load: (signal: AbortSignal) => Promise<T>,
    render: (data: T) => vscode.WebviewPanel,
  ): Promise<vscode.WebviewPanel> {
    if (this.disposed) return Promise.reject(new Error(this.closedMessage));
    const panel = this.panels.get(key);
    if (panel) {
      panel.reveal();
      return Promise.resolve(panel);
    }
    const pending = this.pending.get(key);
    if (pending) return pending;

    const opening = this.read(load, new AbortController())
      .then((data) => {
        if (this.disposed) throw new Error(this.closedMessage);
        const panel = render(data);
        this.panels.set(key, panel);
        panel.onDidDispose(() => this.panels.delete(key));
        return panel;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, opening);
    return opening;
  }

  protected async read<T>(
    load: (signal: AbortSignal) => Promise<T>,
    controller: AbortController,
  ): Promise<T> {
    if (this.disposed) throw new Error(this.closedMessage);
    this.work.add(controller);
    try {
      const result = await load(controller.signal);
      controller.signal.throwIfAborted();
      return result;
    } finally {
      this.work.delete(controller);
    }
  }

  protected createPanel(type: string, title: string): vscode.WebviewPanel {
    return vscode.window.createWebviewPanel(type, title, vscode.ViewColumn.Active, {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media'),
        vscode.Uri.joinPath(this.extensionUri, 'out', 'browser'),
      ],
    });
  }

  cancelPending(): void {
    for (const controller of this.work) controller.abort();
  }

  dispose(): void {
    this.disposed = true;
    this.cancelPending();
    for (const panel of this.panels.values()) panel.dispose();
    this.panels.clear();
  }
}
