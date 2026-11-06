import { PreviewPanelManager } from './previewPanelManager';
import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { PreviewDocument } from '../core/documentTypes';
type Loader = (signal: AbortSignal) => Promise<PreviewDocument>;

/** Shared read-only document UI. All source URIs and actions are held by the host. */
export class DocumentPreviewManager extends PreviewPanelManager {
  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'Document previews have been closed.');
  }

  open(
    key: string,
    load: Loader,
    action: (id: string) => Promise<unknown> = () => Promise.resolve(),
  ): Promise<vscode.WebviewPanel> {
    return this.showPanel(key, load, (data) => this.render(load, action, data));
  }

  private render(
    load: Loader,
    action: (id: string) => Promise<unknown>,
    data: PreviewDocument,
  ): vscode.WebviewPanel {
    const panel = this.createPanel('bidsExplorer.document', data.title);
    let closed = false,
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
        if (message.type === 'reload' && !controller) {
          controller = new AbortController();
          try {
            const next = await this.read(load, controller);
            if (!closed) {
              data = next;
              await publish();
            }
          } finally {
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
    });
    const nonce = randomBytes(16).toString('hex');
    const resource = (...parts: string[]) =>
      panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...parts)).toString();
    panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${panel.webview.cspSource} 'nonce-${nonce}'; style-src ${panel.webview.cspSource}; connect-src 'none'; base-uri 'none'; form-action 'none';"><link rel="stylesheet" href="${resource('media', 'gradients.css')}"><link rel="stylesheet" href="${resource('media', 'metadata.css')}"><title>BIDS document</title></head><body><main><header><div class="eyebrow">BIDS EXPLORER · READ-ONLY</div><h1 id="title"></h1><p id="subtitle" class="source-path"></p></header><p id="notice" class="note"></p><div id="error" role="alert" hidden></div><div id="actions"></div><label>Filter <input id="filter" type="search"></label><div id="records"></div><div class="paging"><button id="previous">Previous page</button><span id="page" aria-live="polite"></span><button id="next">Next page</button></div><footer><h2>Original sources</h2><div id="sources"></div><button id="reload">Reload snapshot</button></footer></main><script type="module" nonce="${nonce}" src="${resource('out', 'browser', 'webview', 'documentClient.js')}"></script></body></html>`;
    return panel;
  }
}
