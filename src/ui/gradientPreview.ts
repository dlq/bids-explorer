import { PreviewPanelManager } from './previewPanelManager';
import * as vscode from 'vscode';
import { entryKey } from '../core/directory';
import type { DirectoryEntry } from '../core/directory';
import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import { isArchiveUri, resourcePath, resourceLabel } from '../core/archiveUri';
import {
  gradientPair,
  loadGradientPair,
  loadInheritedGradientPair,
  type GradientPreviewData,
} from '../sources/gradientFiles';

export function isGradientFile(uri: vscode.Uri): boolean {
  return (
    (uri.scheme === 'file' || isArchiveUri(uri.scheme + ':')) && /\.(bval|bvec)$/.test(uri.path)
  );
}

export class GradientPreviewManager extends PreviewPanelManager {
  constructor(extensionUri: vscode.Uri) {
    super(extensionUri, 'Gradient preview has been closed.');
  }

  open(uri: vscode.Uri): Promise<vscode.WebviewPanel> {
    if (isArchiveUri(uri.scheme + ':'))
      return this.openWith(uri.toString(), (signal) => loadGradientPair(uri.toString(), signal));
    const pair = gradientPair(uri.toString());
    const key = pair.bvalUri;
    return this.openWith(key, (signal) => loadGradientPair(uri.toString(), signal));
  }
  openResolved(
    entry: DirectoryEntry,
    load?: Parameters<typeof loadInheritedGradientPair>[2],
  ): Promise<vscode.WebviewPanel> {
    return this.openWith(entryKey(entry), (signal) =>
      loadInheritedGradientPair(entry, signal, load),
    );
  }
  private openWith(
    key: string,
    load: (signal: AbortSignal) => Promise<GradientPreviewData>,
  ): Promise<vscode.WebviewPanel> {
    return this.showPanel(key, load, (data) => this.render(load, data));
  }

  private render(
    load: (signal: AbortSignal) => Promise<GradientPreviewData>,
    data: GradientPreviewData,
  ): vscode.WebviewPanel {
    const panel = this.createPanel(
      'bidsExplorer.gradients',
      `Gradients · ${basename(resourcePath(data.bvalUri)).replace(/\.bval$/, '')}`,
    );
    let closed = false;
    let reloadController: AbortController | undefined;
    let capturedAt = new Date().toISOString();
    const publish = (): Thenable<boolean> =>
      panel.webview.postMessage({
        type: 'data',
        bvalText: data.bvalText,
        bvecText: data.bvecText,
        bvalUri: data.bvalUri,
        bvecUri: data.bvecUri,
        sourceLabels: [resourceLabel(data.bvalUri), resourceLabel(data.bvecUri)],
        capturedAt,
        imageUri: data.imageUri && resourceLabel(data.imageUri),
      });
    const messages = panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message)) return;
      if (message.type === 'ready') {
        await publish();
      }
      if (
        message.type === 'openRaw' &&
        'which' in message &&
        (message.which === 'bval' || message.which === 'bvec')
      ) {
        const rawUri = message.which === 'bval' ? data.bvalUri : data.bvecUri;
        await vscode.commands.executeCommand(
          'vscode.openWith',
          vscode.Uri.parse(rawUri),
          'default',
        );
      }
      if (message.type === 'reload' && !reloadController) {
        try {
          reloadController = new AbortController();
          const next = await this.read(load, reloadController);
          if (!closed) {
            data = next;
            capturedAt = new Date().toISOString();
            await publish();
          }
        } catch (error) {
          if (!closed)
            await panel.webview.postMessage({
              type: 'error',
              message: `Could not reload; the displayed snapshot is unchanged. ${String(error)}`,
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
    panel.webview.html = gradientHtml(panel.webview, this.extensionUri);
    return panel;
  }
}

export function gradientHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString('hex');
  const script = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'browser', 'webview', 'gradientClient.js'),
  );
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'gradients.css'));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource} 'nonce-${nonce}'; style-src ${webview.cspSource}; connect-src 'none'; base-uri 'none'; form-action 'none';">
<link rel="stylesheet" href="${style.toString()}"><title>Diffusion gradient overview</title></head><body>
<main><header><div class="eyebrow">BIDS EXPLORER · READ-ONLY</div><h1>Diffusion gradients</h1><p id="source-name">Loading paired gradient files…</p></header>
<div id="error" role="alert" hidden></div><div id="summary" class="summary" aria-live="polite"></div>
<section class="controls" aria-label="Display grouping"><label>Low-b cutoff <input id="low-b" type="number" min="0" max="1000000" value="50" step="10"> s/mm²</label><label>Group tolerance <input id="tolerance" type="number" min="0" max="1000000" value="50" step="10"> s/mm²</label><span>Display choices, not validation or edits</span></section>
<div class="plots"><section class="plot-card"><h2>Gradient directions</h2><p>Drag to rotate · click a point to select</p><canvas id="sphere" tabindex="0" role="img" aria-label="Gradient direction sphere in raw b-vector axes. Arrow keys rotate; use the volume selector or numeric table to select a volume."></canvas><div class="rotation"><button id="rotate-left" aria-label="Rotate left">←</button><button id="rotate-right" aria-label="Rotate right">→</button><button id="rotate-up" aria-label="Rotate up">↑</button><button id="rotate-down" aria-label="Rotate down">↓</button><button id="reset">Reset view</button></div><p class="note">Unit-length directions for display only. Axes use stored b-vector components; no anatomical orientation transform.</p></section>
<section class="plot-card"><h2>B-value by volume</h2><p>Click a volume to link both views</p><canvas id="strip" tabindex="0" role="img" aria-label="B-value plotted against one-based volume number. Left and right arrow keys select volumes."></canvas><div id="legend" class="legend"></div><p class="note">Low-b volumes are shown here and counted separately, not projected onto the sphere. Zero-length high-b vectors have no plotted direction.</p></section></div>
<section class="selection" aria-label="Selected volume"><div><h2>Selected volume</h2><div class="volume-controls"><button id="previous" aria-label="Previous volume">←</button><label>Volume <input id="volume" type="number" min="1" value="1"></label><span id="volume-total"></span><button id="next" aria-label="Next volume">→</button></div></div><dl id="selected-values" aria-live="polite"></dl></section>
<details id="numeric-table"><summary>Numeric table</summary><p>Original numeric tokens are preserved. Select a row to link the plots.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Numeric gradient table. Use arrow keys to scroll."><table aria-label="Recorded diffusion gradients"><thead><tr><th>Volume</th><th>b (s/mm²)</th><th>x</th><th>y</th><th>z</th></tr></thead><tbody id="rows"></tbody></table></div><div class="paging"><button id="page-back">Previous page</button><span id="page-label"></span><button id="page-next">Next page</button></div></details>
<footer><h2>Source files</h2><p id="association" class="note"></p><div id="sources"></div><div class="source-actions"><button id="raw-bval">Open .bval as text</button><button id="raw-bvec">Open .bvec as text</button><button id="reload">Reload snapshot</button></div><p id="captured" class="note"></p></footer></main>
<script type="module" nonce="${nonce}" src="${script.toString()}"></script></body></html>`;
}
