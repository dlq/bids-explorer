import * as vscode from 'vscode';
import { entryArchiveUri } from '../core/archiveUri';
import type { DirectoryEntry } from '../core/directory';
import { loadDatasetDescription } from '../sources/datasetDescription';

export async function openDatasetDescriptionComparison(
  versions: readonly DirectoryEntry[],
  extensionUri: vscode.Uri,
  signal: AbortSignal,
): Promise<vscode.WebviewPanel> {
  const fields = new Map<string, Map<string, Set<number>>>();
  const sources = versions.map((entry) => entry.archive!.containerPath);
  const failed = new Map<number, string>();
  for (let i = 0; i < versions.length; i += 4) {
    signal.throwIfAborted();
    await Promise.all(
      versions.slice(i, i + 4).map(async (entry, offset) => {
        const source = i + offset;
        try {
          const data = await loadDatasetDescription(entryArchiveUri(entry), signal);
          for (const field of data.fields) {
            let values = fields.get(field.key);
            if (!values) fields.set(field.key, (values = new Map<string, Set<number>>()));
            let recorded = values.get(field.valueText);
            if (!recorded) values.set(field.valueText, (recorded = new Set()));
            recorded.add(source);
          }
        } catch (error) {
          signal.throwIfAborted();
          failed.set(source, String(error));
        }
      }),
    );
  }
  signal.throwIfAborted();
  const panel = vscode.window.createWebviewPanel(
    'bidsExplorer.datasetDescriptionComparison',
    'Dataset description · combined',
    vscode.ViewColumn.Active,
    { localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')] },
  );
  const style = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'gradients.css'),
  );
  const escape = (value: string) =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const sorted = [...fields].sort(([a], [b]) => a.localeCompare(b));
  const sourceNames = (indices: Iterable<number>) =>
    [...indices]
      .sort((a, b) => a - b)
      .map((index) => `<li>${escape(sources[index])}</li>`)
      .join('');
  const body = sorted
    .slice(0, 120)
    .map(([key, values]) => {
      const options = [...values].sort(([a], [b]) => a.localeCompare(b));
      const variants = options
        .slice(0, 64)
        .map(
          ([value, indices]) =>
            `<pre>${escape(value.length > 600 ? value.slice(0, 600) + '…' : value)}</pre>
       <details><summary>${indices.size} of ${sources.length} sources</summary><ul>${sourceNames(indices)}</ul></details>`,
        )
        .join('');
      return `<section><h2>${escape(key)}</h2>${variants}${values.size > 64 ? '<p>Additional values are available in the original files.</p>' : ''}</section>`;
    })
    .join('');
  panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource};">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="${style.toString()}"><title>Combined dataset description</title></head>
    <body><main><h1>Combined dataset description</h1>
    <p>Read ${sources.length - failed.size} of ${sources.length} shard descriptions. Each field lists the recorded values and which shards supplied them. Expand the tree row to open the originals.</p>
    <details><summary>Shard sources</summary><ul>${sourceNames(sources.keys())}</ul></details>
    ${failed.size ? `<section><h2>Unavailable descriptions</h2><ul>${[...failed].map(([index, error]) => `<li>${escape(sources[index])}: ${escape(error)}</li>`).join('')}</ul></section>` : ''}
    ${body}${fields.size > 120 ? '<p>Additional fields are available in the original files.</p>' : ''}
    </main></body></html>`;
  return panel;
}
