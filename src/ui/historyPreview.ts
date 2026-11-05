import * as vscode from 'vscode';
import { parseHistory } from '../core/history';
import { readTextSnapshot } from '../sources/previewText';
import { DocumentPreviewManager } from './documentPreview';

export function isHistoryFile(uri: vscode.Uri): boolean {
  return (
    (uri.scheme === 'file' || uri.scheme === 'bids-zip') && uri.path.split('/').at(-1) === 'CHANGES'
  );
}
export class HistoryPreviewManager implements vscode.Disposable {
  private readonly previews: DocumentPreviewManager;
  constructor(extensionUri: vscode.Uri) {
    this.previews = new DocumentPreviewManager(extensionUri);
  }
  open(uri: vscode.Uri): Promise<vscode.WebviewPanel> {
    if (!isHistoryFile(uri)) return Promise.reject(new Error('Choose a CHANGES file.'));
    return this.previews.open(uri.toString(), async (signal) => {
      const history = await parseHistory(await readTextSnapshot(uri.toString(), signal), signal);
      return {
        title: 'Dataset history',
        subtitle: history.snapshot.sourceUri,
        notice: `Recorded order and text; release headers are interpreted tolerantly. Dates and version labels are not corrected, validated or sorted. Unrecognized text is retained. Sections are shortened after 16,000 characters; open the original for complete text. Snapshot ${history.snapshot.capturedAt} · ${history.snapshot.revision.size} bytes.`,
        records: history.entries.map((entry) => ({
          title: entry.heading ?? 'Unparsed source text',
          text:
            entry.text.slice(0, 16000) +
            (entry.text.length > 16000
              ? '\n… Section shortened; open original for full text.'
              : ''),
          detail: 'Source line ' + entry.line,
        })),
        sources: [{ uri: uri.toString(), label: 'Open CHANGES as text' }],
        actions: [],
      };
    });
  }
  cancelPending(): void {
    this.previews.cancelPending();
  }
  dispose(): void {
    this.previews.dispose();
  }
}
