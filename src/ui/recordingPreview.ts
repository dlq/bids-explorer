import * as vscode from 'vscode';
import { basename } from 'node:path';
import { isArchiveUri, resourcePath } from '../core/archiveUri';
import { loadRecordingHeader } from '../sources/recordingHeader';
import { DocumentPreviewManager } from './documentPreview';
import { RecordingWaveformManager } from './recordingWaveform';

export function isEdfRecording(uri: vscode.Uri): boolean {
  return (uri.scheme === 'file' || isArchiveUri(uri.toString())) && uri.path.endsWith('.edf');
}

/** Binary recordings use bounded previews, never a text-preview fallback. */
export class RecordingPreviewManager implements vscode.Disposable {
  private readonly previews: DocumentPreviewManager;
  private readonly waveforms: RecordingWaveformManager;
  constructor(extensionUri: vscode.Uri) {
    this.previews = new DocumentPreviewManager(extensionUri);
    this.waveforms = new RecordingWaveformManager(extensionUri);
  }
  private readonly routing = new Set<AbortController>();
  async open(
    uri: vscode.Uri,
    inspect?: () => Promise<unknown>,
    key = uri.toString(),
  ): Promise<vscode.WebviewPanel> {
    if (!isEdfRecording(uri)) throw new Error('Select an EDF recording.');
    const controller = new AbortController();
    this.routing.add(controller);
    try {
      const { header } = await loadRecordingHeader(uri.toString(), controller.signal);
      controller.signal.throwIfAborted();
      return header.format !== 'EDF+D' && !!header.recordCount
        ? await this.waveforms.open(uri, key, inspect)
        : await this.openSummary(uri, inspect, key);
    } finally {
      this.routing.delete(controller);
    }
  }
  openSummary(
    uri: vscode.Uri,
    inspect?: () => Promise<unknown>,
    key = uri.toString(),
  ): Promise<vscode.WebviewPanel> {
    if (!isEdfRecording(uri)) return Promise.reject(new Error('Select an EDF recording.'));
    return this.previews.open(
      key,
      async (signal) => {
        const data = await loadRecordingHeader(uri.toString(), signal);
        const { header } = data;
        const annotations = header.signals.filter((channel) => channel.annotations).length;
        const waveformAvailable = header.format !== 'EDF+D' && !!header.recordCount;
        return {
          title: 'Recording summary',
          subtitle: basename(resourcePath(uri.toString())),
          notice:
            'Technical header only. Signal samples, annotations and payload integrity have not been checked here. ' +
            (waveformAvailable
              ? 'Choose View waveform to load a bounded signal window. '
              : 'Waveform viewing requires a continuous recording with a known positive record count. ') +
            'Channel types, bad-channel status and events have not been checked; browse their tables in BIDS.',
          records: [
            {
              title: 'Recording',
              text: [
                `Format: ${header.format}`,
                `Signal channels: ${header.signals.length - annotations}`,
                `Annotation storage channels: ${annotations}`,
                `Recorded signal duration: ${header.recordedSeconds === undefined ? 'Unknown (record count not recorded)' : header.recordedSeconds + ' s'}`,
                ...(header.format === 'EDF+D'
                  ? [
                      'Discontinuous recording: recorded signal duration is not elapsed session time. Gap timing has not been read.',
                    ]
                  : []),
                `Technical header: ${header.headerBytes} bytes of ${data.memberBytes} recording bytes`,
                'Sampling rates and units are listed per channel below.',
              ].join('\n'),
            },
            ...header.signals.map((channel, index) => ({
              title: `${index + 1}. ${channel.label || '(unnamed channel)'}`,
              text: channel.annotations
                ? 'EDF+ annotation storage; not a numeric signal channel. Annotations have not been decoded.'
                : `Sampling rate: ${channel.samplingFrequency} Hz\nUnit: ${channel.unit || 'Not recorded'}\nPhysical range: ${channel.physicalMinimum} to ${channel.physicalMaximum}\nDigital range: ${channel.digitalMinimum} to ${channel.digitalMaximum}`,
            })),
            {
              title: 'Snapshot source',
              text: `${uri.toString()}\nCaptured: ${data.capturedAt}\nSource revision: ${data.revision.size} bytes · ${data.revision.modifiedAt}\nHeader-only reads may decode archive blocks beyond the header; no recording cache is created. Patient/recording identification fields and dates are omitted.`,
            },
          ],
          sources: [],
          actions: [
            ...(waveformAvailable ? [{ id: 'waveform', label: 'View waveform' }] : []),
            ...(inspect ? [{ id: 'metadata', label: 'Inspect recording JSON metadata' }] : []),
          ],
        };
      },
      (id) =>
        id === 'waveform'
          ? this.waveforms.open(uri, key, inspect)
          : (inspect?.() ?? Promise.resolve()),
    );
  }
  cancelPending(): void {
    for (const controller of this.routing) controller.abort();
    this.previews.cancelPending();
    this.waveforms.cancelPending();
  }
  dispose(): void {
    this.cancelPending();
    this.previews.dispose();
    this.waveforms.dispose();
  }
}
