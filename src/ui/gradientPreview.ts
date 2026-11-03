import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradientPair, loadGradientPair, type GradientPreviewData } from '../sources/gradientFiles';

export function isGradientFile(uri: vscode.Uri): boolean {
  return uri.scheme === 'file' && /\.(bval|bvec)$/.test(uri.path);
}

export class GradientPreviewManager implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly pending = new Map<string, Promise<vscode.WebviewPanel>>();
  private readonly work = new Set<AbortController>();
  private disposed = false;

  constructor(private readonly extensionUri: vscode.Uri) {}

  open(uri: vscode.Uri): Promise<vscode.WebviewPanel> {
    const pair = gradientPair(uri.toString());
    const key = pair.bvalUri;
    const existing = this.panels.get(key);
    if (existing) {
      existing.reveal();
      return Promise.resolve(existing);
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const promise = this.create(uri, key).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  private async load(
    uri: vscode.Uri,
    controller = new AbortController(),
  ): Promise<GradientPreviewData> {
    if (this.disposed) throw new Error('Gradient preview has been closed.');
    this.work.add(controller);
    try {
      return await loadGradientPair(uri.toString(), controller.signal);
    } finally {
      this.work.delete(controller);
    }
  }

  private async create(uri: vscode.Uri, key: string): Promise<vscode.WebviewPanel> {
    let data = await this.load(uri);
    if (this.disposed) throw new Error('Gradient preview has been closed.');
    const panel = vscode.window.createWebviewPanel(
      'bidsExplorer.gradients',
      `Gradients · ${basename(fileURLToPath(data.bvalUri)).replace(/\.bval$/, '')}`,
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
      reloading = false;
    let reloadController: AbortController | undefined;
    let capturedAt = new Date().toISOString();
    const publish = (): Thenable<boolean> =>
      panel.webview.postMessage({
        type: 'data',
        bvalText: data.bvalText,
        bvecText: data.bvecText,
        bvalUri: data.bvalUri,
        bvecUri: data.bvecUri,
        capturedAt,
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
      if (message.type === 'reload' && !reloading) {
        reloading = true;
        try {
          reloadController = new AbortController();
          const next = await this.load(uri, reloadController);
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
          reloading = false;
          reloadController = undefined;
        }
      }
    });
    panel.onDidDispose(() => {
      closed = true;
      reloadController?.abort();
      this.panels.delete(key);
      messages.dispose();
    });
    panel.webview.html = gradientHtml(panel.webview, this.extensionUri);
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

export function gradientHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString('hex');
  const script = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'ui', 'gradientClient.js'),
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
<details id="numeric-table"><summary>Numeric table</summary><p>Original numeric tokens are preserved. Select a row to link the plots.</p><div class="table-scroll"><table><thead><tr><th>Volume</th><th>b (s/mm²)</th><th>x</th><th>y</th><th>z</th></tr></thead><tbody id="rows"></tbody></table></div><div class="paging"><button id="page-back">Previous page</button><span id="page-label"></span><button id="page-next">Next page</button></div></details>
<footer><h2>Source files</h2><p class="note">Same-directory, same-basename pair. Image association and inherited applicability are not resolved by this preview.</p><div id="sources"></div><div class="source-actions"><button id="raw-bval">Open .bval as text</button><button id="raw-bvec">Open .bvec as text</button><button id="reload">Reload snapshot</button></div><p id="captured" class="note"></p></footer></main>
<script type="module" nonce="${nonce}" src="${script.toString()}"></script></body></html>`;
}
