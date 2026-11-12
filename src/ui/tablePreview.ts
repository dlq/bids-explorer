import { PreviewPanelManager } from './previewPanelManager';
import * as vscode from 'vscode';
import { basename, dirname } from 'node:path';
import { isArchiveUri, resourcePath } from '../core/archiveUri';
import { randomBytes } from 'node:crypto';
import { loadSummaryTable } from '../sources/summaryTables';
import { summaryTableKind } from '../core/tables';
import type { TextSnapshot } from '../core/textSnapshot';

type OpenScan = (
  datasetUri: string | undefined,
  tablePath: string | undefined,
  table: TextSnapshot,
  filename: string,
  signal: AbortSignal,
) => Promise<string>;

export function isParticipantsTable(uri: vscode.Uri): boolean {
  return (
    (uri.scheme === 'file' || isArchiveUri(uri.scheme + ':')) &&
    uri.path.split('/').at(-1) === 'participants.tsv'
  );
}

export function isSummaryTable(uri: vscode.Uri): boolean {
  return (
    (uri.scheme === 'file' && summaryTableKind(uri.path.split('/').at(-1)!) !== undefined) ||
    (isArchiveUri(uri.scheme + ':') && uri.path.endsWith('.tsv'))
  );
}

/** One read-only panel per physical table, independent of any image viewer. */
export class TablePreviewManager extends PreviewPanelManager {
  constructor(
    extensionUri: vscode.Uri,
    private readonly openScan?: OpenScan,
  ) {
    super(extensionUri, 'Table previews have been closed.');
  }

  open(uri: vscode.Uri, datasetUri?: string, tablePath?: string): Promise<vscode.WebviewPanel> {
    const key = uri.toString() + (isParticipantsTable(uri) ? '' : '\n' + (datasetUri ?? ''));
    const load = (signal: AbortSignal) => loadSummaryTable(uri.toString(), signal, datasetUri);
    return this.showPanel(key, load, (data) =>
      this.render(uri, load, data, this.openScan?.bind(undefined, datasetUri, tablePath)),
    );
  }

  private render(
    uri: vscode.Uri,
    load: (signal: AbortSignal) => ReturnType<typeof loadSummaryTable>,
    data: Awaited<ReturnType<typeof loadSummaryTable>>,
    openScan?: (table: TextSnapshot, filename: string, signal: AbortSignal) => Promise<string>,
  ): vscode.WebviewPanel {
    const panel = this.createPanel(
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
    );
    let closed = false;
    let reloadController: AbortController | undefined;
    let scanController: AbortController | undefined;
    let scanRevision = 0;
    const publish = () => {
      return panel.webview.postMessage({
        type: 'snapshot',
        kind: data.kind ?? 'participants',
        scanRevision,
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
      if (
        message.type === 'openScan' &&
        data.kind === 'scans' &&
        openScan &&
        !scanController &&
        !reloadController &&
        'revision' in message &&
        message.revision === scanRevision &&
        'line' in message &&
        Number.isSafeInteger(message.line)
      ) {
        const column = data.table.columns.indexOf('filename');
        if (column < 0 || column !== data.table.columns.lastIndexOf('filename')) return;
        const row = data.table.rows.find((row) => row.line === message.line);
        if (!row) return;
        const controller = (scanController = new AbortController());
        const revision = scanRevision;
        const current = () => !closed && !reloadController && revision === scanRevision;
        const reply = (text: string) => panel.webview.postMessage({ type: 'scanStatus', text });
        try {
          const text = await this.read(
            (signal) => openScan(data.table.snapshot, row.cells[column] ?? '', signal),
            controller,
          );
          if (current()) await reply(text);
        } catch {
          if (current())
            await reply(
              controller.signal.aborted
                ? 'Scan lookup cancelled.'
                : 'Could not read the scan source. Refresh the relevant branch and try again.',
            );
        } finally {
          scanController = undefined;
        }
      }
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
      if (message.type === 'reload' && !reloadController) {
        scanController?.abort();
        reloadController = new AbortController();
        try {
          const next = await this.read(load, reloadController);
          if (!closed) {
            data = next;
            scanRevision++;
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
      scanController?.abort();
      messages.dispose();
    });
    panel.webview.html = tableHtml(panel.webview, this.extensionUri);
    return panel;
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
<p id="table-note" class="note">Rows are shown in file order. n/a is the recorded marker for missing data.</p>
<div id="error" role="alert" hidden></div><p id="summary" role="status"></p><p id="issues" role="status"></p>
<p id="scan-status" role="status" hidden></p>
<label>Filter rows <input id="filter" type="search" placeholder="Text in any cell"></label>

<div class="paging" id="column-paging" hidden><button id="left">Previous columns</button><span id="columns"></span><button id="right">Next columns</button></div>
<div class="table-scroll" tabindex="0" role="region" aria-label="Table data. Use arrow keys to scroll."><table aria-label="Recorded table data"><thead id="head"></thead><tbody id="rows"></tbody></table></div>
<div class="paging" id="row-paging"><button id="previous">Previous page</button><span id="page" aria-live="polite"></span><button id="next">Next page</button></div>
<section><h2>Column dictionary</h2><p id="dictionary-status"></p><div id="dictionary"></div></section>
<footer><button id="raw">Open original TSV</button> <button id="reload">Reload snapshot</button><details><summary>Source details</summary><p id="source" class="source-path"></p><p id="revision" class="note"></p><label id="dictionary-source-label" hidden>Dictionary source <select id="dictionary-source"></select></label><button id="dictionary-raw" hidden>Open dictionary as JSON text</button></details></footer>
</main><script type="module" nonce="${nonce}" src="${resource('out', 'browser', 'webview', 'tableClient.js')}"></script></body></html>`;
}
