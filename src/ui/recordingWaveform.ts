import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';
import { interpretEntry } from '../core/entities';
import { displayEntryLabel, displayFileDetails } from '../core/treeDescriptions';
import { resourcePath } from '../core/archiveUri';
import { loadRecordingHeader } from '../sources/recordingHeader';
import { loadRecordingWindow } from '../sources/recordingWindow';
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
        const messages = panel.webview.onDidReceiveMessage(async (message: unknown) => {
          if (!message || typeof message !== 'object' || !('type' in message)) return;
          if (message.type === 'ready') {
            await publish();
            return;
          }
          if (!('token' in message) || message.token !== token) return;
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
                snapshot = next;
                token = randomBytes(16).toString('hex');
                controller = undefined;
                await publish();
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
<section aria-label="Recorded signal plots"><p class="note">Recorded units · Auto scale per channel · No filtering or rereferencing · Events and annotations not shown</p><div id="plots"></div></section>
<details><summary>Recording and source details</summary><p id="filename"></p><p id="source"></p><div id="header-details"></div><button id="metadata" hidden>Inspect recording JSON metadata</button><button id="reload">Reload recording header</button><p class="note">Only the selected time window is checked. Unread payloads and complete archive CRCs/trailers are not verified. Reads and decoding run on the workspace host; no recording cache is created. Archive windows currently require a prefix scan within 16 MiB, so later windows may be unavailable. Patient/recording identification fields and dates are omitted.</p></details>
</main><script type="module" nonce="${nonce}" src="${resource('out', 'browser', 'webview', 'recordingClient.js')}"></script></body></html>`;
        return panel;
      },
    );
  }
}
