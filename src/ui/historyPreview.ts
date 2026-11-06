import { isArchiveUri } from '../core/archiveUri';
import * as vscode from 'vscode';
import { parseHistory } from '../core/history';
import { readTextSnapshot } from '../sources/textSnapshotReader';
import { DocumentPreviewManager } from './documentPreview';

export function isHistoryFile(uri: vscode.Uri): boolean {
  return (
    (uri.scheme === 'file' || isArchiveUri(uri.scheme + ':')) &&
    uri.path.split('/').at(-1) === 'CHANGES'
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
        subtitle: 'CHANGES',
        notice: `Entries are shown in file order with their recorded versions and dates.`,
        records: history.entries.map((entry) => {
          const text = entry.heading
            ? entry.text.slice(entry.heading.length).replace(/^\r?\n/, '')
            : entry.text;
          return {
            title: entry.heading ?? 'Unparsed source text',
            text:
              text.slice(0, 16000) +
              (text.length > 16000 ? '\n… Section shortened; open original for full text.' : ''),
            detail: 'Source line ' + entry.line,
          };
        }),
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
