import { randomBytes } from 'node:crypto';
import { constants, type ReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import * as vscode from 'vscode';
import { PreviewPanelManager } from './previewPanelManager';
import type { DirectoryEntry } from '../core/directory';
import type { ImageView } from './imageView';

export const progressiveNiftiViewType = 'bidsExplorer.progressiveNifti';

export function isNiftiFileName(name: string): boolean {
  return /\.nii(?:\.gz)?$/.test(name);
}

export function niftiIcon(extension: vscode.Uri): { light: vscode.Uri; dark: vscode.Uri } {
  return {
    light: vscode.Uri.joinPath(extension, 'media', 'icons', 'imaging-light.svg'),
    dark: vscode.Uri.joinPath(extension, 'media', 'icons', 'imaging-dark.svg'),
  };
}

/** One viewer per physical URI, including coalesced opens while the source is checked. */
export class NiftiPreviewManager extends PreviewPanelManager {
  constructor(
    extension: vscode.Uri,
    private readonly imageView: ImageView,
  ) {
    super(extension, 'Image previews have been closed.');
  }
  async open(source: vscode.Uri, entry: DirectoryEntry): Promise<vscode.WebviewPanel> {
    const panel = await this.showPanel(
      source.toString(),
      async (signal) => {
        const stat = await vscode.workspace.fs.stat(source);
        signal.throwIfAborted();
        return stat.size === 0;
      },
      (empty) => {
        const panel = openProgressiveNifti(this.extensionUri, source, empty);
        this.imageView.attach(panel, entry, empty);
        return panel;
      },
    );
    this.imageView.select(panel, entry);
    return panel;
  }
}

export function openProgressiveNifti(
  extension: vscode.Uri,
  source: vscode.Uri,
  empty = false,
): vscode.WebviewPanel {
  const renderer = vscode.Uri.joinPath(extension, 'node_modules', '@niivue', 'niivue', 'dist');
  const scripts = vscode.Uri.joinPath(extension, 'out', 'browser');
  const media = vscode.Uri.joinPath(extension, 'media');
  const panel = vscode.window.createWebviewPanel(
    progressiveNiftiViewType,
    source.path.split('/').pop() ?? 'NIfTI image',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [renderer, scripts, media],
    },
  );
  panel.iconPath = niftiIcon(extension);
  const { webview } = panel;
  const resource = (uri: vscode.Uri) =>
    webview.asWebviewUri(uri).toString().replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  if (empty) {
    webview.html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; base-uri 'none'; form-action 'none';">
<link rel="stylesheet" href="${resource(vscode.Uri.joinPath(media, 'nifti.css'))}"><title>No image data</title></head>
<body><main class="empty-image"><h1>No image data</h1><p role="alert">This file is empty (0 bytes) and contains no image data.</p>
<p>Some BIDS example datasets use empty image placeholders for testing dataset structure. Choose a dataset with real images to use the viewer.</p></main></body></html>`;
    return panel;
  }
  // Send image bytes over the webview message channel. Resource URLs can write the
  // full response to VS Code's client-side webview cache, including over Remote SSH.
  let stream: ReadStream | undefined;
  let reader: AsyncIterator<Buffer> | undefined;
  let reading = false;
  let stopped = false;
  const stop = () => {
    stopped = true;
    stream?.destroy();
    listener.dispose();
  };
  const listener = webview.onDidReceiveMessage(async (message: unknown) => {
    if (message === 'cancelNiftiRead') return stop();
    if (message !== 'readNiftiChunk' || reading || stopped) return;
    reading = true;
    try {
      if (!reader) {
        const file = await open(
          source.fsPath,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        try {
          if (!(await file.stat()).isFile()) throw new Error('Expected an ordinary image file.');
          if (stopped) return;
          stream = file.createReadStream({ highWaterMark: 256 * 1024 });
        } finally {
          if (!stream) await file.close();
        }
        reader = stream[Symbol.asyncIterator]();
      }
      const next = await reader.next();
      if (stopped) return;
      reading = false;
      if (next.done) {
        stop();
        await webview.postMessage({ type: 'niftiEnd' });
      } else if (
        !(await webview.postMessage({
          type: 'niftiChunk',
          bytes: new Uint8Array(next.value).buffer,
        }))
      ) {
        stop();
      }
    } catch {
      if (!stopped) {
        stop();
        await webview.postMessage({ type: 'niftiReadError' });
      }
    }
  });
  panel.onDidDispose(stop);
  const imports = JSON.stringify({
    imports: {
      '@niivue/niivue': webview.asWebviewUri(vscode.Uri.joinPath(renderer, 'index.js')).toString(),
    },
  }).replaceAll('<', '\\u003c');
  const nonce = randomBytes(16).toString('hex');
  webview.html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'; img-src data:; style-src ${webview.cspSource}; base-uri 'none'; form-action 'none';">
<link rel="stylesheet" href="${resource(vscode.Uri.joinPath(media, 'nifti.css'))}">
<script type="importmap" nonce="${nonce}">${imports}</script>
<title>NIfTI image</title></head><body>
<header><span role="status">Loading image…</span>
<button id="cancel" type="button">Cancel loading</button>
<button id="image-controls" type="button">Image controls</button>
</header>
<main class="image-stage"><div class="image-canvas"><div class="image-renderer"><canvas aria-label="NIfTI image" data-gzip="${source.path.endsWith('.gz')}"></canvas></div></div></main>
<script type="module" nonce="${nonce}" src="${resource(vscode.Uri.joinPath(scripts, 'webview', 'niftiClient.js'))}"></script>
</body></html>`;
  return panel;
}
