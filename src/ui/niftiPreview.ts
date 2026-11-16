import { randomBytes } from 'node:crypto';
import { constants, type ReadStream } from 'node:fs';
import { homedir } from 'node:os';
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
        const panel = openProgressiveNifti(this.extensionUri, source, empty, entry.name);
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
  imageName = source.path.split('/').pop() ?? 'NIfTI image',
): vscode.WebviewPanel {
  const renderer = vscode.Uri.joinPath(extension, 'node_modules', '@niivue', 'niivue', 'dist');
  const scripts = vscode.Uri.joinPath(extension, 'out', 'browser');
  const media = vscode.Uri.joinPath(extension, 'media');
  const panel = vscode.window.createWebviewPanel(
    progressiveNiftiViewType,
    imageName,
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
  registerScreenshotExport(panel);
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
<header>
<div class="image-status"><span id="load-status" role="status">Loading image…</span><span id="screenshot-status" role="status"></span></div>
<div class="image-actions" role="group" aria-label="Image actions">
<button id="cancel" type="button">Cancel loading</button>
<button id="image-controls" type="button">Image controls</button>
<button id="save-screenshot" class="primary-action" type="button" disabled>Save screenshot</button>
</div>
</header>
<main class="image-stage"><div class="image-canvas"><div class="image-renderer"><canvas aria-label="NIfTI image" data-gzip="${source.path.endsWith('.gz')}"></canvas></div></div></main>
<script type="module" nonce="${nonce}" src="${resource(vscode.Uri.joinPath(scripts, 'webview', 'niftiClient.js'))}"></script>
</body></html>`;
  return panel;
}

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const maxScreenshotBytes = 20 * 1024 ** 2;

/** Only a native save dialog supplies the export destination. */
function registerScreenshotExport(panel: vscode.WebviewPanel): void {
  const webview = panel.webview;
  let request: string | undefined;
  let saving = false;
  let closed = false;
  const reply = (text: string) => webview.postMessage({ type: 'screenshotStatus', text });
  const listener = webview.onDidReceiveMessage(async (message: unknown) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return;
    if (message.type === 'saveScreenshot' && !request && !saving) {
      request = randomBytes(16).toString('hex');
      if (
        !(await webview.postMessage({ type: 'captureScreenshot', request, imageName: panel.title }))
      ) {
        request = undefined;
        await reply('Could not start screenshot capture.');
      }
      return;
    }
    if (
      message.type !== 'screenshotCaptured' ||
      !request ||
      !('request' in message) ||
      message.request !== request
    )
      return;
    request = undefined;
    if (
      !('bytes' in message) ||
      !(message.bytes instanceof ArrayBuffer) ||
      message.bytes.byteLength < 33 ||
      message.bytes.byteLength > maxScreenshotBytes ||
      !Buffer.from(message.bytes, 0, 8).equals(pngSignature)
    ) {
      await reply('Could not capture the image as PNG.');
      return;
    }
    saving = true;
    let temporary: vscode.Uri | undefined;
    try {
      const destination = await vscode.window.showSaveDialog({
        title: 'Save BIDS Explorer screenshot',
        defaultUri: vscode.Uri.joinPath(vscode.Uri.file(homedir()), 'bids-view.png'),
        filters: { PNG: ['png'] },
      });
      if (closed) return;
      if (!destination) {
        await reply('Screenshot save cancelled.');
        return;
      }
      if (!/\.png$/i.test(destination.path)) {
        throw new Error('Choose a filename ending in .png.');
      }
      const directory = destination.with({
        path: destination.path.slice(0, destination.path.lastIndexOf('/') + 1),
      });
      temporary = vscode.Uri.joinPath(
        directory,
        `.bids-screenshot-${randomBytes(16).toString('hex')}.png`,
      );
      await vscode.workspace.fs.writeFile(temporary, new Uint8Array(message.bytes));
      await vscode.workspace.fs.rename(temporary, destination, { overwrite: false });
      temporary = undefined;
      await reply('Screenshot saved.');
    } catch (error) {
      if (!closed) {
        const text =
          error instanceof vscode.FileSystemError && error.code === 'FileExists'
            ? 'That file already exists. Choose a new filename.'
            : 'Could not save screenshot. Check the filename and folder permissions.';
        await reply(text);
      }
    } finally {
      if (temporary) await vscode.workspace.fs.delete(temporary).then(undefined, () => undefined);
      saving = false;
    }
  });
  panel.onDidDispose(() => {
    closed = true;
    listener.dispose();
  });
}
