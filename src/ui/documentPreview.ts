import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { PreviewDocument } from '../core/documentTypes';
type Loader = (signal: AbortSignal) => Promise<PreviewDocument>;

/** Shared read-only document UI. All source URIs and actions are held by the host. */
export class DocumentPreviewManager implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly pending = new Map<string, Promise<vscode.WebviewPanel>>();
  private readonly work = new Set<AbortController>();
  private disposed = false;
  constructor(private readonly extensionUri: vscode.Uri) {}
  open(
    key: string,
    load: Loader,
    action: (id: string) => Promise<unknown> = () => Promise.resolve(),
  ): Promise<vscode.WebviewPanel> {
    if (this.disposed) return Promise.reject(new Error('Document previews have been closed.'));
    const panel = this.panels.get(key);
    if (panel) {
      panel.reveal();
      return Promise.resolve(panel);
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const opening = this.create(key, load, action).finally(() => this.pending.delete(key));
    this.pending.set(key, opening);
    return opening;
  }
  private async read(load: Loader, controller: AbortController): Promise<PreviewDocument> {
    this.work.add(controller);
    try {
      const data = await load(controller.signal);
      controller.signal.throwIfAborted();
      return data;
    } finally {
      this.work.delete(controller);
    }
  }
  private async create(
    key: string,
    load: Loader,
    action: (id: string) => Promise<unknown>,
  ): Promise<vscode.WebviewPanel> {
    let data = await this.read(load, new AbortController());
    if (this.disposed) throw new Error('Document previews have been closed.');
    const panel = vscode.window.createWebviewPanel(
      'bidsExplorer.document',
      data.title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'media'),
          vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
        ],
      },
    );
    this.panels.set(key, panel);
    let closed = false,
      reloading = false,
      controller: AbortController | undefined;
    const publish = () => panel.webview.postMessage({ type: 'snapshot', document: data });
    const messages = panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message)) return;
      try {
        if (message.type === 'ready') await publish();
        if (
          message.type === 'source' &&
          'index' in message &&
          typeof message.index === 'number' &&
          Number.isInteger(message.index) &&
          message.index >= 0 &&
          message.index < data.sources.length
        )
          await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.parse(data.sources[message.index].uri),
            'default',
          );
        if (
          message.type === 'action' &&
          'id' in message &&
          typeof message.id === 'string' &&
          data.actions.some((item) => item.id === message.id)
        )
          await action(message.id);
        if (message.type === 'reload' && !reloading) {
          reloading = true;
          controller = new AbortController();
          try {
            const next = await this.read(load, controller);
            if (!closed) {
              data = next;
              await publish();
            }
          } finally {
            reloading = false;
            controller = undefined;
          }
        }
      } catch (error) {
        if (!closed)
          await panel.webview.postMessage({
            type: 'error',
            message: `Could not complete the action; the previous snapshot remains visible. ${String(error)}`,
          });
      }
    });
    panel.onDidDispose(() => {
      closed = true;
      controller?.abort();
      messages.dispose();
      this.panels.delete(key);
    });
    const nonce = randomBytes(16).toString('hex');
    const resource = (...parts: string[]) =>
      panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...parts)).toString();
    panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${panel.webview.cspSource} 'nonce-${nonce}'; style-src ${panel.webview.cspSource}; connect-src 'none'; base-uri 'none'; form-action 'none';"><link rel="stylesheet" href="${resource('media', 'gradients.css')}"><link rel="stylesheet" href="${resource('media', 'metadata.css')}"><title>BIDS document</title></head><body><main><header><div class="eyebrow">BIDS EXPLORER · READ-ONLY</div><h1 id="title"></h1><p id="subtitle" class="source-path"></p></header><p id="notice" class="note"></p><div id="error" role="alert" hidden></div><div id="actions"></div><label>Filter <input id="filter" type="search"></label><div id="records"></div><div class="paging"><button id="previous">Previous page</button><span id="page" aria-live="polite"></span><button id="next">Next page</button></div><footer><h2>Original sources</h2><div id="sources"></div><button id="reload">Reload snapshot</button></footer></main><script type="module" nonce="${nonce}" src="${resource('out', 'webview', 'ui', 'documentClient.js')}"></script></body></html>`;
    return panel;
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
