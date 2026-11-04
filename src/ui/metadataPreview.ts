import * as vscode from 'vscode';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { loadJsonMetadata } from '../sources/datasetDescription';

export function isDatasetDescription(uri: vscode.Uri): boolean {
  return uri.scheme === 'file' && uri.path.split('/').at(-1) === 'dataset_description.json';
}

export function isJsonMetadata(uri: vscode.Uri): boolean {
  return uri.scheme === 'file' && uri.path.endsWith('.json');
}

/** One read-only panel per physical JSON source, independent of any image viewer. */
export class MetadataPreviewManager implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly pending = new Map<string, Promise<vscode.WebviewPanel>>();
  private readonly work = new Set<AbortController>();
  private disposed = false;
  constructor(private readonly extensionUri: vscode.Uri) {}

  open(uri: vscode.Uri): Promise<vscode.WebviewPanel> {
    if (this.disposed) return Promise.reject(new Error('Metadata previews have been closed.'));
    const key = uri.toString();
    const existing = this.panels.get(key);
    if (existing) {
      existing.reveal();
      return Promise.resolve(existing);
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const opening = this.create(uri).finally(() => this.pending.delete(key));
    this.pending.set(key, opening);
    return opening;
  }

  private async load(uri: vscode.Uri, controller: AbortController) {
    this.work.add(controller);
    try {
      return await loadJsonMetadata(uri.toString(), controller.signal);
    } finally {
      this.work.delete(controller);
    }
  }

  private async create(uri: vscode.Uri): Promise<vscode.WebviewPanel> {
    let data = await this.load(uri, new AbortController());
    if (this.disposed) throw new Error('Metadata previews have been closed.');
    const panel = vscode.window.createWebviewPanel(
      'bidsExplorer.metadata',
      isDatasetDescription(uri)
        ? 'Metadata · ' + (basename(dirname(fileURLToPath(uri.toString()))) || 'Dataset')
        : 'JSON · ' + basename(fileURLToPath(uri.toString())),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'media'),
          vscode.Uri.joinPath(this.extensionUri, 'out', 'webview'),
        ],
      },
    );
    this.panels.set(uri.toString(), panel);
    let closed = false,
      reloading = false,
      reloadController: AbortController | undefined;
    const publish = () => {
      const source = {
        sourceUri: data.snapshot.sourceUri,
        revision: data.snapshot.revision,
        capturedAt: data.snapshot.capturedAt,
      };
      return panel.webview.postMessage({
        type: 'snapshot',
        documentKind: data.kind,
        fileName: basename(fileURLToPath(uri.toString())),
        source,
        fields: data.fields,
        summary: data.summary,
        duplicateKeys: data.duplicateKeys,
      });
    };
    const messages = panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message)) return;
      if (message.type === 'ready') await publish();
      if (message.type === 'openRaw') {
        try {
          await vscode.commands.executeCommand('vscode.openWith', uri, 'default');
        } catch (error) {
          if (!closed)
            await panel.webview.postMessage({
              type: 'error',
              message: `Could not open the source as text. ${String(error)}`,
            });
        }
      }
      if (message.type === 'reload' && !reloading) {
        reloading = true;
        reloadController = new AbortController();
        try {
          const next = await this.load(uri, reloadController);
          if (!closed) {
            data = next;
            await publish();
          }
        } catch (error) {
          if (!closed)
            await panel.webview.postMessage({
              type: 'error',
              message: `Could not reload; the previous snapshot remains visible. ${String(error)}`,
            });
        } finally {
          reloading = false;
          reloadController = undefined;
        }
      }
    });
    panel.onDidDispose(() => {
      closed = true;
      reloadController?.abort();
      this.panels.delete(uri.toString());
      messages.dispose();
    });
    panel.webview.html = metadataHtml(panel.webview, this.extensionUri);
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

function metadataHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString('hex');
  const resource = (...parts: string[]) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...parts)).toString();
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource} 'nonce-${nonce}'; style-src ${webview.cspSource}; connect-src 'none'; base-uri 'none'; form-action 'none';">
<link rel="stylesheet" href="${resource('media', 'gradients.css')}"><link rel="stylesheet" href="${resource('media', 'metadata.css')}"><title>Dataset description</title></head><body><main>
<header><div class="eyebrow">BIDS EXPLORER · READ-ONLY</div><h1 id="name">Dataset description</h1><p id="file-name">dataset_description.json</p></header>
<p class="note">Recorded fields from this file only. No inherited values, defaults, dataset links or BIDS conformance checks are applied.</p>
<div id="error" role="alert" hidden></div><div id="summary" class="summary" aria-live="polite"></div><p id="duplicates" role="status" hidden></p>
<section aria-label="Recorded fields"><div class="field-heading"><h2>Recorded fields</h2><label>Filter fields <input id="filter" type="search" placeholder="Field name"></label></div>
<p class="note">Original keys and JSON values are preserved, including unknown fields and duplicate names. Long values are visibly shortened here; open the original for complete text.</p>
<div id="fields"></div><div class="paging"><button id="previous">Previous page</button><span id="page" aria-live="polite"></span><button id="next">Next page</button></div></section>
<footer><h2>Source snapshot</h2><p id="source" class="source-path"></p><p id="revision" class="note"></p><div class="source-actions"><button id="raw">Open as JSON text</button><button id="reload">Reload snapshot</button></div></footer>
</main><script type="module" nonce="${nonce}" src="${resource('out', 'webview', 'ui', 'metadataClient.js')}"></script></body></html>`;
}
