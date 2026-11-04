import * as vscode from 'vscode';
import type { DirectoryEntry } from '../core/directory';
import type { InheritanceResult } from '../core/inheritance';
import { loadInheritedMetadata } from '../sources/inheritedMetadata';
import { DocumentPreviewManager } from './documentPreview';
import type { GradientPreviewManager } from './gradientPreview';

export class InheritanceInspector implements vscode.Disposable {
  private readonly previews: DocumentPreviewManager;
  constructor(
    extensionUri: vscode.Uri,
    private readonly gradients?: GradientPreviewManager,
  ) {
    this.previews = new DocumentPreviewManager(extensionUri);
  }
  cancelPending(): void {
    this.previews.cancelPending();
  }
  dispose(): void {
    this.previews.dispose();
  }
  async open(entry: DirectoryEntry): Promise<vscode.WebviewPanel | undefined> {
    let result: InheritanceResult;
    try {
      return await this.previews.open(
        JSON.stringify([entry.datasetUri, entry.uri]),
        async (signal) => {
          result = await loadInheritedMetadata(entry.datasetUri, entry.uri, signal);
          const resolvedPair =
            result.related.length === 2 &&
            result.related.every((item) => item.status === 'resolved');
          const sources = [
            ...new Map([
              ...result.sources.map(
                (source) => [source.entry.uri, source.entry.relativePath] as const,
              ),
              ...result.related.flatMap((related) =>
                related.candidates.map((entry) => [entry.uri, entry.relativePath] as const),
              ),
            ]).entries(),
          ].map(([uri, label]) => ({ uri, label }));
          return {
            title: 'Metadata and related files',
            subtitle: entry.uri,
            notice:
              'Read-only metadata snapshot. No image bytes read, volume/orientation checks or BIDS validation. Values are shortened after 16,000 characters; report values after 4,096. Sources are available as original text. Reload explicitly after external changes.',
            records: [
              {
                title: 'Resolution and coverage',
                text: `${result.status} · ${result.coverage} ancestor coverage\n${result.issues.join('\n')}`,
                detail: `${result.fields.length} effective fields; displaying at most 1,000. Source reads are independent revision-checked snapshots.`,
              },
              ...result.fields.slice(0, 1000).map((field) => ({
                title: field.key,
                text:
                  field.value.valueText.slice(0, 16000) +
                  (field.value.valueText.length > 16000 ? '\n… Shortened' : ''),
                detail:
                  `Selected: ${field.value.sourceUri} ${field.value.pointer}\nOverride history (root to leaf):\n` +
                  field.history
                    .map(
                      (item) =>
                        `${item.sourceUri} ${item.pointer} = ${item.valueText.slice(0, 2000)}${item.valueText.length > 2000 ? '… (shortened)' : ''}`,
                    )
                    .join('\n'),
              })),
              ...result.sources.map((source) => ({
                title: 'JSON source · ' + source.entry.relativePath,
                text:
                  source.error ??
                  `Snapshot ${source.metadata!.snapshot.capturedAt} · ${source.metadata!.snapshot.revision.size} bytes · mtime ${source.metadata!.snapshot.revision.modifiedAt}`,
                detail: source.entry.uri,
              })),
              ...result.related.map((item) => ({
                title: 'Related ' + item.extension,
                text: item.status,
                detail: item.selected?.uri ?? item.candidates.map((entry) => entry.uri).join('\n'),
              })),
            ],
            sources,
            actions: [
              { id: 'report', label: 'Open JSON report' },
              ...(resolvedPair && this.gradients
                ? [{ id: 'gradients', label: 'Preview resolved diffusion gradients' }]
                : []),
            ],
          };
        },
        async (id) => {
          if (id === 'gradients') return this.gradients!.openResolved(entry);
          if (id === 'report') return this.report(result);
        },
      );
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        void vscode.window.showErrorMessage(
          `BIDS Explorer could not inspect metadata: ${String(error)}`,
        );
      return undefined;
    }
  }
  private async report(result: InheritanceResult): Promise<vscode.TextDocument> {
    const document = await vscode.workspace.openTextDocument({
      language: 'json',
      content: JSON.stringify(
        {
          note: 'Generated read-only-source inspection. Re-run Inspect to refresh. JSON values are recorded as exact JSON text, with display values limited to 4,096 characters. This is not BIDS validation. Related files currently cover applicable JSON and DWI bval/bvec only.',
          target: result.target,
          coverage: result.coverage,
          status: result.status,
          issues: result.issues,
          fields: result.fields.map((field) => ({
            key: field.key,
            valueText: field.value.valueText.slice(0, 4096),
            truncated: field.value.valueText.length > 4096,
            sourceUri: field.value.sourceUri,
            pointer: field.value.pointer,
            history: field.history.map((item) => ({
              sourceUri: item.sourceUri,
              pointer: item.pointer,
            })),
          })),
          sources: result.sources.map((source) => ({
            entry: source.entry,
            level: source.level,
            revision: source.metadata?.snapshot.revision,
            capturedAt: source.metadata?.snapshot.capturedAt,
            duplicateKeys: source.metadata?.duplicateKeys,
            error: source.error,
          })),
          related: result.related,
        },
        null,
        2,
      ),
    });
    await vscode.window.showTextDocument(document, { preview: true });
    return document;
  }
}
