import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { DatasetTreeProvider } from '../../ui/datasetTree';
import { DatasetBrowser } from '../../core/browser';
import { LocalDirectorySource } from '../../sources/localDirectory';
import { isJsonMetadata } from '../../ui/metadataPreview';

async function rendered(
  panel: vscode.WebviewPanel,
  matches: (value: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  let result: Record<string, unknown> | undefined;
  const listener = panel.webview.onDidReceiveMessage((value: unknown) => {
    if (
      value &&
      typeof value === 'object' &&
      'type' in value &&
      value.type === 'rendered' &&
      matches(value)
    )
      result = value;
  });
  try {
    const deadline = Date.now() + 15000;
    while (!result) {
      assert.ok(Date.now() < deadline, 'Expected task-file preview');
      await panel.webview.postMessage({ type: 'inspect' });
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
    }
    return result;
  } finally {
    listener.dispose();
  }
}
suite('Task metadata and event-file entry points', () => {
  test('task JSON opens recorded metadata and task events open a literal table with matching dictionary', async function () {
    this.timeout(25000);
    await vscode.extensions.getExtension('bids-explorer-dev.bids-explorer')!.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-task-previews-'));
    const provider = new DatasetTreeProvider(new DatasetBrowser(new LocalDirectorySource()));
    const panels: vscode.WebviewPanel[] = [];
    try {
      const json = vscode.Uri.file(join(folder, 'task-rest_bold.json'));
      const jsonText =
        '{"TaskName":"<img> Rest","RepetitionTime":2,"RepetitionTime":3,"Large":9007199254740993}';
      await writeFile(json.fsPath, jsonText);
      const events = vscode.Uri.file(join(folder, 'task-rest_events.tsv'));
      const eventText =
        'onset\tduration\ttrial_type\n0.000\t1.2\tA\n0.000\t1.2\tB\n-1.0\tn/a\t<img>';
      await writeFile(events.fsPath, eventText);
      await writeFile(
        join(folder, 'task-rest_events.json'),
        '{"duration":{"Description":"Recorded event duration","Units":"s"}}',
      );
      const root = provider.browser.register(
        await provider.browser.source.root(vscode.Uri.file(folder).toString()),
      );
      const entries = await provider.getChildren(provider.element(root));
      const jsonEntry = entries.find(
        (item) => item.type === 'entry' && item.entry.name === 'task-rest_bold.json',
      );
      assert.ok(jsonEntry);
      assert.equal(provider.getTreeItem(jsonEntry).contextValue, 'metadata');
      assert.equal(isJsonMetadata(json), true);
      assert.equal(
        isJsonMetadata(vscode.Uri.parse('https://example.org/task-rest_bold.json')),
        false,
      );
      const jsonPanel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        jsonEntry,
      );
      assert.ok(jsonPanel);
      panels.push(jsonPanel);
      const fields = await rendered(jsonPanel, (s) => s.fieldCount === 4);
      assert.equal(fields.title, 'task-rest_bold.json');
      assert.equal(fields.duplicateCount, 1);
      assert.equal(
        await vscode.commands.executeCommand('bidsExplorer.previewMetadata', json),
        jsonPanel,
      );
      assert.ok(!jsonPanel.webview.html.includes('<img> Rest'));
      const eventEntry = entries.find(
        (item) => item.type === 'entry' && item.entry.name === 'task-rest_events.tsv',
      );
      assert.ok(eventEntry);
      assert.equal(provider.getTreeItem(eventEntry).contextValue, 'summaryTable');
      const eventPanel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        eventEntry,
      );
      assert.ok(eventPanel);
      panels.push(eventPanel);
      const rows = await rendered(eventPanel, (s) => s.rowCount === 3);
      assert.equal(rows.title, 'Events');
      assert.equal(rows.identifierColumn, '');
      assert.equal(rows.issuesText, '');
      assert.deepEqual(rows.displayedCells, ['0.000', '1.2', 'A']);
      assert.equal(rows.dictionaryStatus, 'loaded');
      assert.match(String(rows.dictionaryText), /Recorded event duration/);
      assert.equal(await readFile(json.fsPath, 'utf8'), jsonText);
      assert.equal(await readFile(events.fsPath, 'utf8'), eventText);
      // Unusable sidecars retain raw JSON access instead of a blank preview.
      jsonPanel.dispose();
      await writeFile(json.fsPath, 'broken');
      assert.equal(
        await vscode.commands.executeCommand('bidsExplorer.openFile', jsonEntry),
        undefined,
      );
      assert.equal(vscode.window.activeTextEditor?.document.uri.toString(), json.toString());
    } finally {
      for (const panel of panels) panel.dispose();
      provider.dispose();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await rm(folder, { recursive: true, force: true });
    }
  });
});
