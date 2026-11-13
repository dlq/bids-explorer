import { PreviewPanelManager } from './previewPanelManager';
import * as vscode from 'vscode';
import { basename, dirname } from 'node:path';
import { isArchiveUri, resourcePath } from '../core/archiveUri';
import { randomBytes } from 'node:crypto';
import { loadSummaryTable } from '../sources/summaryTables';
import { summaryTableKind } from '../core/tables';
import { loadParticipantPreview, scanParticipantTable } from '../sources/participantTablePaging';
import type { ParticipantTablePage } from '../core/tableTypes';
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
    const load = async (signal: AbortSignal) =>
      isParticipantsTable(uri)
        ? loadParticipantPreview(uri.toString(), signal)
        : { data: await loadSummaryTable(uri.toString(), signal, datasetUri) };
    return this.showPanel(key, load, (initial) =>
      this.render(uri, load, initial, this.openScan?.bind(undefined, datasetUri, tablePath)),
    );
  }

  private render(
    uri: vscode.Uri,
    load: (signal: AbortSignal) => ReturnType<typeof loadParticipantPreview>,
    initial: Awaited<ReturnType<typeof loadParticipantPreview>>,
    openScan?: (table: TextSnapshot, filename: string, signal: AbortSignal) => Promise<string>,
  ): vscode.WebviewPanel {
    let { data, dictionary } = initial;
    const panel = this.createPanel(
      'bidsExplorer.table',
      (data?.kind === 'sessions'
        ? 'Sessions'
        : data?.kind === 'scans'
          ? 'Scans'
          : data?.kind === 'events'
            ? 'Events'
            : data?.kind === 'table'
              ? 'Table'
              : 'Participants') +
        ' · ' +
        (basename(dirname(resourcePath(uri.toString()))) || 'Dataset'),
    );
    let closed = false;
    let reloadController: AbortController | undefined;
    let scanController: AbortController | undefined;
    let scanRevision = 0;
    let tableController: AbortController | undefined;
    let tablePage: ParticipantTablePage | undefined;
    let latestProgress: ParticipantTablePage | undefined;
    const publish = () => {
      if (!data) return;

      return panel.webview.postMessage({
        type: 'snapshot',
        kind: data.kind ?? 'participants',
        scanRevision,
        tablePage,
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
    const scanPage = async (page: number, filter: string, reload = false) => {
      const companion = dictionary;
      if (!companion) return;
      tableController?.abort();
      const controller = (tableController = new AbortController());
      const current = () => !closed && tableController === controller;
      try {
        const result = await this.read(
          (signal) =>
            scanParticipantTable(
              uri.toString(),
              page,
              filter,
              signal,
              (progress) => {
                if (current()) {
                  latestProgress = progress;
                  void panel.webview.postMessage({ type: 'tableProgress', progress });
                }
              },
              reload ? undefined : data?.table.snapshot,
            ),
          controller,
        );
        if (current()) {
          data = { ...result.data, dictionary: companion };
          tablePage = result.progress;
          latestProgress = undefined;
          await publish();
        }
      } catch (error) {
        if (current() && !controller.signal.aborted)
          await panel.webview.postMessage({
            type: 'error',
            message: `Could not read the Participants table. ${String(error)}`,
          });
      } finally {
        if (current()) tableController = undefined;
      }
    };
    const messages = panel.webview.onDidReceiveMessage(async (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message)) return;
      if (message.type === 'ready') {
        if (data) await publish();
        if (latestProgress)
          await panel.webview.postMessage({ type: 'tableProgress', progress: latestProgress });
        else if (!data && !tableController) await scanPage(0, '');
      }
      if (message.type === 'cancelTable') tableController?.abort();
      if (
        message.type === 'participantPage' &&
        dictionary &&
        !reloadController &&
        'page' in message &&
        typeof message.page === 'number' &&
        Number.isSafeInteger(message.page) &&
        message.page >= 0 &&
        'filter' in message &&
        typeof message.filter === 'string' &&
        message.filter.length <= 256 &&
        (message.page === 0 ||
          (message.filter === tablePage?.filter && message.page * 50 < tablePage.matched))
      )
        await scanPage(message.page, message.filter);
      if (
        message.type === 'openScan' &&
        data?.kind === 'scans' &&
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
        const snapshot = data.table.snapshot;
        if (!row) return;
        const controller = (scanController = new AbortController());
        const revision = scanRevision;
        const current = () => !closed && !reloadController && revision === scanRevision;
        const reply = (text: string) => panel.webview.postMessage({ type: 'scanStatus', text });
        try {
          const text = await this.read(
            (signal) => openScan(snapshot, row.cells[column] ?? '', signal),
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
      const currentDictionary = data?.dictionary;
      const dictionaryUris =
        currentDictionary?.sources?.map((source) => source.sourceUri) ??
        (currentDictionary?.status === 'loaded' ? [currentDictionary.sourceUri] : []);
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
        tableController?.abort();
        reloadController = new AbortController();
        try {
          const next = await this.read(load, reloadController);
          if (!closed) {
            if (next.dictionary) {
              dictionary = next.dictionary;
              await scanPage(0, tablePage?.filter ?? '', true);
            } else {
              ({ data, dictionary } = next);
              tablePage = undefined;
              latestProgress = undefined;
              scanRevision++;
              await publish();
            }
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
      tableController?.abort();
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
<label>Filter rows <input id="filter" type="search" placeholder="Text in any cell"></label> <button id="apply-filter" hidden>Apply filter</button> <button id="cancel-table" hidden>Cancel scan</button>
<p id="table-progress" role="status"></p>

<div class="paging" id="column-paging" hidden><button id="left">Previous columns</button><span id="columns"></span><button id="right">Next columns</button></div>
<div class="table-scroll" tabindex="0" role="region" aria-label="Table data. Use arrow keys to scroll."><table aria-label="Recorded table data"><thead id="head"></thead><tbody id="rows"></tbody></table></div>
<div class="paging" id="row-paging"><button id="previous">Previous page</button><span id="page" aria-live="polite"></span><button id="next">Next page</button></div>
<section><h2>Column dictionary</h2><p id="dictionary-status"></p><div id="dictionary"></div></section>
<footer><button id="raw">Open original TSV</button> <button id="reload">Reload snapshot</button><details><summary>Source details</summary><p id="source" class="source-path"></p><p id="revision" class="note"></p><label id="dictionary-source-label" hidden>Dictionary source <select id="dictionary-source"></select></label><button id="dictionary-raw" hidden>Open dictionary as JSON text</button></details></footer>
</main><script type="module" nonce="${nonce}" src="${resource('out', 'browser', 'webview', 'tableClient.js')}"></script></body></html>`;
}
