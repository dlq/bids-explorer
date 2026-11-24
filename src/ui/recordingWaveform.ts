import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import { interpretEntry } from '../core/entities';
import { displayEntryLabel, displayFileDetails } from '../core/treeDescriptions';
import { resourcePath } from '../core/archiveUri';
import { loadRecordingHeader } from '../sources/recordingHeader';
import { loadRecordingWindow } from '../sources/recordingWindow';
import type { DirectoryEntry } from '../core/directory';
import type { RecordingMetadataAccess } from '../sources/recordingMetadata';
import type { RecordingMetadata, RecordingTableChoices } from '../core/recordingMetadataTypes';
import { PreviewPanelManager } from './previewPanelManager';

export class RecordingWaveformManager extends PreviewPanelManager {
  constructor(
    extensionUri: vscode.Uri,
    private readonly loadWindow = loadRecordingWindow,
  ) {
    super(extensionUri, 'Recording waveforms have been closed.');
  }

  open(
    uri: vscode.Uri,
    key: string,
    inspect?: () => Promise<unknown>,
    metadataAccess?: RecordingMetadataAccess,
  ): Promise<vscode.WebviewPanel> {
    const entry = {
      name: basename(resourcePath(uri.toString())),
      kind: 'file' as const,
      uri: uri.toString(),
      datasetUri: '',
      relativePath: basename(resourcePath(uri.toString())),
    };
    const title = displayEntryLabel(entry);
    const entities = interpretEntry(entry).entities;
    const context = [
      ...entities
        .filter((e) => (e.key === 'sub' || e.key === 'ses') && e.status === 'resolved')
        .map((e) => `${e.key === 'sub' ? 'Participant' : 'Session'} ${e.value}`),
      displayFileDetails(entry, ['sub', 'ses']),
    ]
      .filter(Boolean)
      .join(' · ');
    return this.showPanel(
      key,
      (signal) => loadRecordingHeader(uri.toString(), signal),
      (snapshot) => {
        const panel = this.createPanel(
          'bidsExplorer.recordingWaveform',
          `${title} · ${context || basename(resourcePath(uri.toString()))}`,
        );
        let closed = false,
          controller: AbortController | undefined,
          token = randomBytes(16).toString('hex');
        const publish = () =>
          panel.webview.postMessage({
            type: 'snapshot',
            snapshot: {
              token,
              filename: basename(resourcePath(uri.toString())),
              source: uri.toString(),
              title,
              context,
              canInspect: !!inspect,
              header: snapshot.header,
            },
          });
        let metadata: RecordingMetadata<DirectoryEntry> | undefined;
        let tablesToken = '';
        let metadataController: AbortController | undefined;
        let metadataStarted = false;
        const choices: RecordingTableChoices = {};
        const refreshMetadata = async () => {
          if (!metadataAccess || metadataController || closed) return;
          metadataStarted = true;
          const current = new AbortController(),
            generation = token;
          metadataController = current;
          await panel.webview.postMessage({ type: 'tablesLoading', token: generation });
          try {
            const next = await this.read((signal) => metadataAccess.load(signal, choices), current);
            if (!closed && generation === token) {
              metadata = next;
              tablesToken = randomBytes(16).toString('hex');
              await panel.webview.postMessage({ type: 'tables', token, tablesToken, metadata });
            }
          } catch (error) {
            if (!closed && generation === token)
              await panel.webview.postMessage({
                type: 'tablesError',
                token,
                message: current.signal.aborted
                  ? 'Table loading cancelled. Previous metadata remains a snapshot.'
                  : `Could not refresh tables; previous metadata remains a snapshot. ${String(error)}`,
              });
          } finally {
            if (metadataController === current) metadataController = undefined;
          }
        };
        const messages = panel.webview.onDidReceiveMessage(async (message: unknown) => {
          if (!message || typeof message !== 'object' || !('type' in message)) return;
          if (message.type === 'ready') {
            await publish();
            if (metadata && !metadataController)
              await panel.webview.postMessage({ type: 'tables', token, tablesToken, metadata });
            else if (!metadataStarted) void refreshMetadata();
            return;
          }
          if (!('token' in message) || message.token !== token) return;
          if (message.type === 'reloadTables') {
            void refreshMetadata();
            return;
          }
          if (message.type === 'cancelTables') {
            metadataController?.abort();
            return;
          }
          if (message.type === 'chooseTable' || message.type === 'openTable') {
            if (
              !('tablesToken' in message) ||
              message.tablesToken !== tablesToken ||
              !('kind' in message) ||
              (message.kind !== 'channels' && message.kind !== 'events') ||
              !('index' in message) ||
              !Number.isSafeInteger(message.index) ||
              !metadata ||
              metadataController
            )
              return;
            const candidate = metadata[message.kind].candidates[message.index as number];
            if (!candidate || candidate.kind !== 'file') return;
            if (message.type === 'chooseTable') {
              choices[message.kind] = candidate.uri;
              void refreshMetadata();
            } else {
              try {
                await metadataAccess?.open(candidate);
              } catch (error) {
                await panel.webview.postMessage({
                  type: 'tablesError',
                  token,
                  message: String(error),
                });
              }
            }
            return;
          }
          if (message.type === 'metadata') {
            await inspect?.();
            return;
          }
          if (message.type === 'cancel') {
            controller?.abort();
            return;
          }
          if ((message.type !== 'loadWindow' && message.type !== 'reload') || controller) return;
          const current = new AbortController();
          controller = current;
          try {
            if (message.type === 'reload') {
              const next = await this.read(
                (signal) => loadRecordingHeader(uri.toString(), signal),
                current,
              );
              if (!closed) {
                metadataController?.abort();
                metadataController = undefined;
                snapshot = next;
                token = randomBytes(16).toString('hex');
                controller = undefined;
                await publish();
                void refreshMetadata();
              }
            } else {
              const result = await this.read(
                (signal) =>
                  this.loadWindow(
                    snapshot,
                    'request' in message ? message.request : undefined,
                    signal,
                  ),
                current,
              );
              if (!closed) {
                controller = undefined;
                await panel.webview.postMessage({ type: 'window', token, window: result });
              }
            }
          } catch (error) {
            if (!closed) {
              controller = undefined;
              await panel.webview.postMessage({
                type: 'windowError',
                token,
                cancelled: current.signal.aborted,
                message: current.signal.aborted
                  ? 'Loading cancelled. The previous completed window remains visible.'
                  : `Could not load; the previous completed window remains visible. ${String(error)}`,
              });
            }
          } finally {
            if (controller === current) controller = undefined;
          }
        });
        panel.onDidDispose(() => {
          closed = true;
          metadataController?.abort();
          controller?.abort();
          messages.dispose();
        });
        const nonce = randomBytes(16).toString('hex');
        const resource = (...parts: string[]) =>
          panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, ...parts)).toString();
        panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${panel.webview.cspSource} 'nonce-${nonce}'; style-src ${panel.webview.cspSource}; connect-src 'none'; base-uri 'none'; form-action 'none';"><link rel="stylesheet" href="${resource('media', 'gradients.css')}"><link rel="stylesheet" href="${resource('media', 'recording.css')}"><title>Recording waveform</title></head><body><main>
<header><h1 id="recording-title">EEG recording</h1><p id="context"></p><p id="summary" class="note"></p></header>
<section aria-label="Signal controls" class="signal-controls"><div class="window-controls"><label>Start (s)<input id="start" type="number" min="0" step="0.1" value="0"></label><label>Duration (s)<input id="duration" type="number" min="0.001" max="30" step="0.1" value="10"></label><button id="previous">Previous window</button><button id="next">Next window</button></div>
<details id="channel-selection"><summary>Choose channels <span id="selection"></span></summary><label>Filter channels <input id="filter" type="search"></label><div id="channels"></div><div class="window-navigation"><button id="channels-previous">Previous channel page</button><span id="channel-page" aria-live="polite"></span><button id="channels-next">Next channel page</button></div></details>
<div class="window-navigation"><button id="load" class="primary">Apply channels and time window</button><button id="cancel" disabled>Cancel loading</button></div><p id="status" role="status" aria-live="polite">No samples loaded.</p><p id="error" role="alert" hidden></p></section>
<section aria-label="Recorded signal plots"><p class="note">Recorded units · Auto scale per channel · No filtering or rereferencing · BIDS event markers when available · EDF+ annotations not decoded</p><div id="event-timeline" aria-label="BIDS event timeline"></div><div id="plots"></div></section>
<section aria-label="BIDS recording tables"><h2>Events and channels</h2><p id="tables-status" role="status" aria-live="polite">Companion tables have not been checked.</p><div class="window-navigation"><button id="reload-tables">Reload tables</button><button id="cancel-tables" disabled>Cancel table loading</button></div><div id="table-sources"></div><details id="events-details"><summary>Events <span id="event-count"></span></summary><label>Filter events <input id="event-filter" type="search"></label><p id="events-coverage" role="status"></p><div id="events-table" class="table-scroll" tabindex="0" aria-label="Recording events"></div><div class="window-navigation"><button id="events-previous">Previous events</button><span id="events-page" aria-live="polite"></span><button id="events-next">Next events</button></div></details></section>
<details><summary>Recording and source details</summary><p id="filename"></p><p id="source"></p><div id="header-details"></div><button id="metadata" hidden>Inspect recording JSON metadata</button><button id="reload">Reload recording header</button><p class="note">Only the selected time window is checked. Unread payloads and complete archive CRCs/trailers are not verified. Reads and decoding run on the workspace host; no recording cache is created. Archive windows currently require a prefix scan within 16 MiB, so later windows may be unavailable. Patient/recording identification fields and dates are omitted.</p></details>
</main><script type="module" nonce="${nonce}" src="${resource('out', 'browser', 'webview', 'recordingClient.js')}"></script></body></html>`;
        return panel;
      },
    );
  }
}
