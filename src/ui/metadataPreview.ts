import { PreviewPanelManager } from './previewPanelManager';
import * as vscode from 'vscode';
import { basename, dirname } from 'node:path';
import { isArchiveUri, resourcePath } from '../core/archiveUri';
import { randomBytes } from 'node:crypto';
import { loadJsonMetadata } from '../sources/datasetDescription';

export function isDatasetDescription(uri: vscode.Uri): boolean {
  return (
    (uri.scheme === 'file' || isArchiveUri(uri.scheme + ':')) &&
    uri.path.split('/').at(-1) === 'dataset_description.json'
  );
}

export function isJsonMetadata(uri: vscode.Uri): boolean {
  return (uri.scheme === 'file' || isArchiveUri(uri.scheme + ':')) && uri.path.endsWith('.json');
}

/** One read-only panel per physical JSON source, independent of any image viewer. */
export class MetadataPreviewManager extends PreviewPanelManager {
  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'Metadata previews have been closed.');
  }

  open(uri: vscode.Uri): Promise<vscode.WebviewPanel> {
    const load = (signal: AbortSignal) => loadJsonMetadata(uri.toString(), signal);
    return this.showPanel(uri.toString(), load, (data) => this.render(uri, load, data));
  }

  private render(
    uri: vscode.Uri,
    load: (signal: AbortSignal) => ReturnType<typeof loadJsonMetadata>,
    data: Awaited<ReturnType<typeof loadJsonMetadata>>,
  ): vscode.WebviewPanel {
    const panel = this.createPanel(
      'bidsExplorer.metadata',
      isDatasetDescription(uri)
        ? 'Metadata · ' + (basename(dirname(resourcePath(uri.toString()))) || 'Dataset')
        : 'JSON · ' + basename(resourcePath(uri.toString())),
    );
    let closed = false,
      reloadController: AbortController | undefined;
    const publish = () => {
      const source = {
        sourceUri: data.snapshot.sourceUri,
        archiveSource: data.snapshot.archiveSource,
        revision: data.snapshot.revision,
        capturedAt: data.snapshot.capturedAt,
      };
      return panel.webview.postMessage({
        type: 'snapshot',
        documentKind: data.kind,
        fileName: basename(resourcePath(uri.toString())),
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
      if (message.type === 'reload' && !reloadController) {
        reloadController = new AbortController();
        try {
          const next = await this.read(load, reloadController);
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
          reloadController = undefined;
        }
      }
    });
    panel.onDidDispose(() => {
      closed = true;
      reloadController?.abort();
      messages.dispose();
    });
    panel.webview.html = metadataHtml(panel.webview, this.extensionUri);
    return panel;
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
<p class="note">Values recorded in this file. To see what applies to a scan, inspect metadata from the scan’s row in BIDS Explorer.</p>
<div id="error" role="alert" hidden></div><div id="summary" class="summary" aria-live="polite"></div><p id="duplicates" role="status" hidden></p>
<section aria-label="Recorded fields"><div class="field-heading"><h2>In this file</h2><label>Filter fields <input id="filter" type="search" placeholder="Field name"></label></div>

<div id="fields"></div><div class="paging" id="field-paging" hidden><button id="previous">Previous page</button><span id="page" aria-live="polite"></span><button id="next">Next page</button></div></section>
<footer><div class="source-actions"><button id="raw">Open original JSON</button><button id="reload">Reload snapshot</button></div><details><summary>Source details</summary><p id="source" class="source-path"></p><p id="revision" class="note"></p></details></footer>
</main><script type="module" nonce="${nonce}" src="${resource('out', 'browser', 'webview', 'metadataClient.js')}"></script></body></html>`;
}
