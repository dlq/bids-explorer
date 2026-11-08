import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { DirectoryEntry } from '../core/directory';
import type { InheritanceResult } from '../core/inheritance';
import { interpretEntry } from '../core/entities';
import { displayEntryLabel, displayFileDetails } from '../core/treeDescriptions';
import { entryArchiveUri } from '../core/archiveUri';
import type { ImageState } from '../webview/imageViewTypes';

interface ImageSession {
  panel: vscode.WebviewPanel;
  entry: DirectoryEntry;
  token: string;
  state?: ImageState;
  metadata: {
    label: string;
    value: string;
    sourceUri: string;
    pointer: string;
    rawValue: string;
  }[];
  metadataStatus: string;
  sources: DirectoryEntry[];
  controller: AbortController;
}

/** A native, movable workbench view; the last selected image remains selected during sidebar focus. */
export class ImageView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view?: vscode.WebviewView;
  private readonly sessions = new Map<vscode.WebviewPanel, ImageSession>();
  private selected?: ImageSession;
  constructor(
    private readonly extension: vscode.Uri,
    private readonly load: (
      entry: DirectoryEntry,
      signal: AbortSignal,
    ) => Promise<InheritanceResult>,
  ) {}
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extension, 'media'),
        vscode.Uri.joinPath(this.extension, 'out', 'browser'),
      ],
    };
    const resource = (path: string[]) =>
      view.webview.asWebviewUri(vscode.Uri.joinPath(this.extension, ...path)).toString();
    const nonce = randomBytes(16).toString('hex');
    view.webview.html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${view.webview.cspSource}; base-uri 'none'; form-action 'none';"><link rel="stylesheet" href="${resource(['media', 'imageView.css'])}"><title>Image</title></head><body>
<p id="empty">Open an image from BIDS to see its information and controls.</p>
<main hidden><section aria-labelledby="acquisition-title"><h2 id="acquisition-title">Acquisition</h2><p id="acquisition"></p><p id="context"></p><p id="status" role="status"></p></section>
<section aria-labelledby="parameters-title"><h2 id="parameters-title">Scan parameters</h2><p class="hint">From the NIfTI header</p><dl id="scan-information" class="scan-summary"></dl><p id="metadata-status" class="hint" role="status"></p><dl id="metadata" class="scan-summary"></dl><button id="inspect" type="button">Inspect all metadata</button></section>
<section aria-labelledby="view-title"><h2 id="view-title">Viewing controls</h2>
<fieldset id="controls" disabled><legend class="sr-only">Image display</legend>
<label>Layout<select id="layout"><option value="quad">Three planes + 3D</option><option value="multiplanar">Three planes</option><option value="volume">3D volume</option><option value="axial">Axial</option><option value="coronal">Coronal</option><option value="sagittal">Sagittal</option></select></label>
<label id="volume-control" hidden>Volume <output id="frame-value">1</output><input id="frame" type="range" min="1" value="1" max="1" disabled></label>
<label>Colour map<select id="colormap"><option value="gray">Grayscale</option><option value="viridis">Viridis</option><option value="hot">Hot</option></select></label>
<div class="pair"><label>Intensity minimum<input id="minimum" type="number" step="any"></label><label>Intensity maximum<input id="maximum" type="number" step="any"></label></div><button id="window" type="button">Apply intensity window</button><p id="control-error" role="alert"></p>
<label class="check"><input id="crosshair" type="checkbox" checked>Show crosshair</label>
<details id="position-details"><summary>Position</summary><fieldset><legend>Move crosshair by one voxel</legend><div class="axis-buttons">${['X', 'Y', 'Z'].map((axis) => `<button type="button" data-axis="${axis.toLowerCase()}" data-step="-1" aria-label="Decrease ${axis} by one voxel">${axis} −</button><button type="button" data-axis="${axis.toLowerCase()}" data-step="1" aria-label="Increase ${axis} by one voxel">${axis} +</button>`).join('')}</div></fieldset><output id="position" aria-live="polite"></output></details>
<button id="reset" type="button">Reset display</button></fieldset></section>
<details><summary>More image information</summary><p class="hint">From the NIfTI header</p><dl id="information"></dl></details>
<details><summary>Related files</summary><p class="hint">Applicable JSON and resolved diffusion companions. Other acquisition resources remain in the BIDS tree.</p><div id="related"></div></details>
<details><summary>Source details</summary><details><summary>Image location</summary><p id="source"></p></details><div id="provenance"></div></details></main>
<script nonce="${nonce}" type="module" src="${resource(['out', 'browser', 'webview', 'imageViewClient.js'])}"></script></body></html>`;
    view.webview.onDidReceiveMessage(
      (message: { type?: string; target?: string; index?: number; control?: unknown }) => {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'ready') {
          this.publish();
          return;
        }
        const session = this.selected;
        if (!session || message.target !== session.token) return;
        if (message.type === 'control')
          void session.panel.webview.postMessage({
            type: 'imageControl',
            control: message.control,
          });
        if (message.type === 'inspect')
          void vscode.commands.executeCommand('bidsExplorer.inspectMetadata', {
            type: 'entry',
            entry: session.entry,
          });
        if (
          message.type === 'source' &&
          Number.isInteger(message.index) &&
          message.index! >= 0 &&
          message.index! < session.sources.length
        )
          void vscode.commands.executeCommand('bidsExplorer.openFile', {
            type: 'entry',
            entry: session.sources[message.index!],
          });
      },
    );
    view.onDidChangeVisibility(() => this.publish());
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    });
  }
  attach(panel: vscode.WebviewPanel, entry: DirectoryEntry, empty: boolean): void {
    const session: ImageSession = {
      panel,
      entry,
      token: randomBytes(16).toString('hex'),
      metadata: [],
      metadataStatus: empty
        ? 'Empty image placeholder; no image data.'
        : 'Metadata loads when the Image view is shown.',
      state: empty
        ? {
            status: 'No image data: empty placeholder.',
            previewFrames: 0,
            loadedFrames: 0,
            position: 'No voxel data.',
            navigationEnabled: false,
            information: [],
            display: {
              layout: 'quad',
              colormap: 'gray',
              minimum: 0,
              maximum: 1,
              crosshair: true,
              frame: 1,
            },
          }
        : undefined,
      sources: [],
      controller: new AbortController(),
    };
    this.sessions.set(panel, session);
    panel.webview.onDidReceiveMessage((message: ImageState & { type?: string }) => {
      if (message.type === 'showImageControls') {
        this.select(panel);
        void vscode.commands.executeCommand('bidsExplorer.imageControls.focus');
        return;
      }
      if (message.type !== 'imageState') return;
      session.state = message;
      if (this.selected === session) this.publish();
    });
    panel.onDidChangeViewState(() => {
      if (panel.active) this.select(panel);
    });
    panel.onDidDispose(() => {
      session.controller.abort();
      this.sessions.delete(panel);
      if (this.selected === session) {
        this.selected = [...this.sessions.values()].find((item) => item.panel.visible);
        this.publish();
      }
    });
    this.select(panel);
  }
  select(panel: vscode.WebviewPanel, entry?: DirectoryEntry): void {
    const session = this.sessions.get(panel);
    if (session) {
      if (
        entry &&
        (entry.datasetUri !== session.entry.datasetUri ||
          entry.relativePath !== session.entry.relativePath ||
          entry.uri !== session.entry.uri)
      ) {
        session.controller.abort();
        session.controller = new AbortController();
        session.entry = entry;
        session.token = randomBytes(16).toString('hex');
        session.metadata = [];
        session.sources = [];
        session.metadataStatus = 'Metadata loads when the Image view is shown.';
      }
      this.selected = session;
      this.publish();
    }
  }
  private publish(): void {
    if (!this.view?.visible) return;
    const session = this.selected;
    if (!session) {
      void this.view.webview.postMessage({ type: 'image', image: null });
      return;
    }
    if (session.metadataStatus === 'Metadata loads when the Image view is shown.') {
      session.metadataStatus = 'Reading applicable JSON metadata…';
      void this.loadMetadata(session);
    }
    const model = interpretEntry(session.entry);
    const context = ['sub', 'ses'].flatMap((key) => {
      const entity = model.entities.find(
        (entity) => entity.key === key && entity.status === 'resolved',
      );
      return entity ? [`${key === 'sub' ? 'Participant' : 'Session'} ${entity.value}`] : [];
    });
    context.push(
      model.scope?.kind === 'pipeline'
        ? `Derivative · ${model.scope.pipelineName}`
        : 'Dataset: ' + session.entry.datasetUri.split('/').pop(),
    );
    void this.view.webview.postMessage({
      type: 'image',
      image: {
        target: session.token,
        name: displayEntryLabel(session.entry),
        details: displayFileDetails(session.entry),
        context: context.join(' · '),
        source: session.entry.archive ? entryArchiveUri(session.entry) : session.entry.uri,
        state: session.state,
        metadata: session.metadata,
        metadataStatus: session.metadataStatus,
        related: session.sources.map((entry, index) => ({
          index,
          name: entry.relativePath,
          uri: entry.archive ? entryArchiveUri(entry) : entry.uri,
        })),
      },
    });
  }
  private async loadMetadata(session: ImageSession): Promise<void> {
    const controller = session.controller;
    try {
      const result = await this.load(session.entry, controller.signal);
      controller.signal.throwIfAborted();
      session.metadataStatus =
        result.status === 'resolved'
          ? result.fields.length
            ? 'Applicable JSON values, including inheritance.'
            : 'No applicable JSON values recorded.'
          : `Values withheld: ${result.issues.join(' ').slice(0, 1000) || 'Metadata coverage is incomplete or ambiguous.'}`;
      const labels = new Map([
        ['RepetitionTime', 'TR (s)'],
        ['EchoTime', 'TE (s)'],
        ['FlipAngle', 'Flip angle (degrees)'],
        ['PhaseEncodingDirection', 'Phase encoding (voxel axis)'],
        ['TaskName', 'Task name'],
        ['AcquisitionDuration', 'Acquisition duration (s)'],
        ['Manufacturer', 'Manufacturer'],
        ['MagneticFieldStrength', 'Field strength (T)'],
      ]);
      session.metadata = [...labels].flatMap(([key, label]) => {
        const field = result.fields.find((field) => field.key === key)?.value;
        if (!field) return [];
        let value = field.type === 'string' ? String(JSON.parse(field.valueText)) : field.valueText;
        if (
          key === 'EchoTime' &&
          field.type === 'number' &&
          Number.isFinite(Number(field.valueText) * 1000)
        ) {
          label = 'TE (ms)';
          value = String(Number((Number(field.valueText) * 1000).toPrecision(6)));
        }
        return [
          {
            label,
            value: value.slice(0, 1000) + (value.length > 1000 ? '…' : ''),
            sourceUri: field.sourceUri,
            pointer: field.pointer,
            rawValue:
              field.valueText.slice(0, 1000) +
              (field.valueText.length > 1000 ? '… (shortened; open original JSON)' : ''),
          },
        ];
      });
      session.sources = [
        ...new Map(
          [
            ...result.sources.map((source) => source.entry),
            ...result.related.flatMap((related) =>
              related.status === 'resolved' && related.selected ? [related.selected] : [],
            ),
          ].map((entry) => [entry.uri, entry]),
        ).values(),
      ].slice(0, 100);
    } catch (error) {
      if (controller.signal.aborted) return;
      session.metadataStatus = `Metadata unavailable: ${String(error).slice(0, 1000)}`;
    }
    if (this.selected === session) this.publish();
  }
  dispose(): void {
    for (const session of this.sessions.values()) session.controller.abort();
    this.sessions.clear();
    this.selected = undefined;
  }
}
