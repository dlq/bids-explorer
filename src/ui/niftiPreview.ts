import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

export const progressiveNiftiEditor = 'bidsExplorer.progressiveNifti';

export function openProgressiveNifti(
  extension: vscode.Uri,
  source: vscode.Uri,
): vscode.WebviewPanel {
  const renderer = vscode.Uri.joinPath(extension, 'node_modules', '@niivue', 'niivue', 'dist');
  const scripts = vscode.Uri.joinPath(extension, 'out', 'webview');
  const media = vscode.Uri.joinPath(extension, 'media');
  const panel = vscode.window.createWebviewPanel(
    progressiveNiftiEditor,
    source.path.split('/').pop() ?? 'NIfTI image',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [renderer, scripts, media, vscode.Uri.joinPath(source, '..')],
    },
  );
  const { webview } = panel;
  const resource = (uri: vscode.Uri) =>
    webview.asWebviewUri(uri).toString().replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  const imports = JSON.stringify({
    imports: {
      '@niivue/niivue': webview.asWebviewUri(vscode.Uri.joinPath(renderer, 'index.js')).toString(),
    },
  }).replaceAll('<', '\\u003c');
  const nonce = randomBytes(16).toString('hex');
  webview.html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'; img-src data:; style-src ${webview.cspSource}; connect-src ${webview.cspSource}; base-uri 'none'; form-action 'none';">
<link rel="stylesheet" href="${resource(vscode.Uri.joinPath(media, 'nifti.css'))}">
<script type="importmap" nonce="${nonce}">${imports}</script>
<title>NIfTI image</title></head><body>
<header><span role="status">Loading image…</span>
<label>Frame <input type="range" min="1" value="1" disabled> <output>1</output></label>
<button type="button">Cancel loading</button></header>
<main><canvas aria-label="NIfTI image" data-source="${resource(source)}" data-gzip="${source.path.endsWith('.gz')}"></canvas></main>
<script type="module" nonce="${nonce}" src="${resource(vscode.Uri.joinPath(scripts, 'ui', 'niftiClient.js'))}"></script>
</body></html>`;
  return panel;
}
