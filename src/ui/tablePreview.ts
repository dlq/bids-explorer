import * as vscode from 'vscode';
import { basename, dirname } from 'node:path';
import { resourcePath } from '../core/archiveUri';
import { randomBytes } from 'node:crypto';
import { loadSummaryTable } from '../sources/summaryTables';
import { summaryTableKind } from '../core/tables';

export function isParticipantsTable(uri: vscode.Uri): boolean {
  return (
    (uri.scheme === 'file' || uri.scheme === 'bids-zip') &&
    uri.path.split('/').at(-1) === 'participants.tsv'
  );
}

export function isSummaryTable(uri: vscode.Uri): boolean {
  return (
    (uri.scheme === 'file' && summaryTableKind(uri.path.split('/').at(-1)!) !== undefined) ||
    (uri.scheme === 'bids-zip' && uri.path.endsWith('.tsv'))
  );
}

/** One read-only panel per physical table, independent of any image viewer. */
export class TablePreviewManager implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();
  private readonly pending = new Map<string, Promise<vscode.WebviewPanel>>();
  private readonly work = new Set<AbortController>();
  private disposed = false;
  constructor(private readonly extensionUri: vscode.Uri) {}

  open(uri: vscode.Uri, datasetUri?: string): Promise<vscode.WebviewPanel> {
    if (this.disposed) return Promise.reject(new Error('Table previews have been closed.'));
    const key = uri.toString() + (isParticipantsTable(uri) ? '' : '\n' + (datasetUri ?? ''));
    const existing = this.panels.get(key);
    if (existing) {
      existing.reveal();
      return Promise.resolve(existing);
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const opening = this.create(uri, datasetUri, key).finally(() => this.pending.delete(key));
    this.pending.set(key, opening);
    return opening;
  }

  private async load(uri: vscode.Uri, controller: AbortController, datasetUri?: string) {
    this.work.add(controller);
    try {
      return await loadSummaryTable(uri.toString(), controller.signal, datasetUri);
    } finally {
      this.work.delete(controller);
    }
  }

  private async create(
    uri: vscode.Uri,
    datasetUri: string | undefined,
    key: string,
  ): Promise<vscode.WebviewPanel> {
    let data = await this.load(uri, new AbortController(), datasetUri);
    if (this.disposed) throw new Error('Table previews have been closed.');
    const panel = vscode.window.createWebviewPanel(
      'bidsExplorer.table',
      (data.kind === 'sessions'
        ? 'Sessions'
        : data.kind === 'scans'
          ? 'Scans'
          : data.kind === 'events'
            ? 'Events'
            : data.kind === 'table'
              ? 'Table'
              : 'Participants') +
        ' · ' +
        (basename(dirname(resourcePath(uri.toString()))) || 'Dataset'),
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
      reloadController: AbortController | undefined;
    const publish = () => {
      return panel.webview.postMessage({
        type: 'snapshot',
        kind: data.kind ?? 'participants',
        table: {
          ...data.table,
          snapshot: { ...data.table.snapshot, text: undefined },
        },
        dictionary: data.dictionary.metadata
          ? {
              ...data.dictionary,
              metadata: {
                ...data.dictionary.metadata,
                snapshot: { ...data.dictionary.metadata.snapshot, text: undefined },
              },
            }
          : data.dictionary,
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
      const dictionaryUris =
        data.dictionary.sources?.map((source) => source.sourceUri) ??
        (data.dictionary.status === 'loaded' ? [data.dictionary.sourceUri] : []);
      if (message.type === 'openDictionary' && dictionaryUris.length) {
        const index = 'index' in message ? message.index : 0;
        if (
          typeof index !== 'number' ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= dictionaryUris.length
        )
          return;
        try {
          await vscode.commands.executeCommand(
            'vscode.openWith',
            vscode.Uri.parse(dictionaryUris[index]),
            'default',
          );
        } catch (error) {
          if (!closed)
            await panel.webview.postMessage({
              type: 'error',
              message: `Could not open dictionary as text. ${String(error)}`,
            });
        }
      }
      if (message.type === 'reload' && !reloading) {
        reloading = true;
        reloadController = new AbortController();
        try {
          const next = await this.load(uri, reloadController, datasetUri);
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
      this.panels.delete(key);
      messages.dispose();
    });
    panel.webview.html = tableHtml(panel.webview, this.extensionUri);
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

function tableHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = randomBytes(16).toString('hex');
  const resource = (...parts: string[]) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...parts)).toString();
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource} 'nonce-${nonce}'; style-src ${webview.cspSource}; connect-src 'none'; base-uri 'none'; form-action 'none';">
<link rel="stylesheet" href="${resource('media', 'gradients.css')}"><link rel="stylesheet" href="${resource('media', 'tables.css')}"><title>BIDS table</title></head><body><main>
<header><div class="eyebrow">BIDS EXPLORER · READ-ONLY</div><h1 id="title">BIDS table</h1><p id="filename"></p></header>
<p id="table-note" class="note">Recorded cells in source order. No inferred values, table joins or BIDS conformance checks. The exact token n/a marks missing data; empty and absent cells remain distinct.</p>
<div id="error" role="alert" hidden></div><p id="summary" role="status"></p><p id="issues" role="status"></p>
<label>Filter rows <input id="filter" type="search" placeholder="Text in any cell"></label>
<p class="note">Showing 50 rows per page and 12 columns at a time. Long cells and headings are shortened to 2,000 characters; open the original for complete text.</p>
<div class="paging"><button id="left">Previous columns</button><span id="columns"></span><button id="right">Next columns</button></div>
<div class="table-scroll"><table aria-label="Recorded table data"><thead id="head"></thead><tbody id="rows"></tbody></table></div>
<div class="paging"><button id="previous">Previous page</button><span id="page" aria-live="polite"></span><button id="next">Next page</button></div>
<section><h2>Column dictionary</h2><p id="dictionary-status"></p><div id="dictionary"></div><label id="dictionary-source-label" hidden>Dictionary source <select id="dictionary-source"></select></label><button id="dictionary-raw" hidden>Open dictionary as JSON text</button></section>
<footer><h2>Source snapshots</h2><p id="source" class="source-path"></p><p id="revision" class="note"></p><button id="raw">Open as TSV text</button> <button id="reload">Reload snapshot</button></footer>
</main><script type="module" nonce="${nonce}" src="${resource('out', 'webview', 'ui', 'tableClient.js')}"></script></body></html>`;
}
