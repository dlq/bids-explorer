import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { TablePreviewManager, isParticipantsTable } from '../../ui/tablePreview';
import { DatasetTreeProvider } from '../../ui/datasetTreeProvider';
import { DatasetBrowser } from '../../core/browser';
import { LocalDirectorySource } from '../../sources/localDirectory';

async function rendered(
  panel: vscode.WebviewPanel,
  count: number,
  matches: (state: Record<string, unknown>) => boolean = () => true,
): Promise<Record<string, unknown>> {
  let result: Record<string, unknown> | undefined;
  const listener = panel.webview.onDidReceiveMessage((message: unknown) => {
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'rendered' &&
      'rowCount' in message &&
      message.rowCount === count &&
      matches(message)
    )
      result = message;
  });
  try {
    const deadline = Date.now() + 15000;
    while (!result) {
      assert.ok(Date.now() < deadline, 'Packaged table client should render recorded rows');
      await panel.webview.postMessage({ type: 'inspect' });
      await new Promise<void>((resolve) => setTimeout(resolve, 40));
    }
    return result;
  } finally {
    listener.dispose();
  }
}
function installControls(panel: vscode.WebviewPanel): void {
  const html = panel.webview.html;
  const nonce = /nonce="([a-f0-9]+)"/.exec(html)![1];
  // This harness exists only in the test; the packaged client has no automation actions.
  panel.webview.html = html.replace(
    '</body>',
    `<script nonce="${nonce}">
  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'testControl') return;
    const node = document.getElementById(event.data.id);
    if (node instanceof HTMLSelectElement) { node.value = event.data.value; node.dispatchEvent(new Event('change')); }
    else if (node instanceof HTMLInputElement) { node.value = event.data.value; node.dispatchEvent(new Event('input')); }
    else if (node instanceof HTMLButtonElement) node.click();
  });</script></body>`,
  );
}
async function waitText(uri: vscode.Uri): Promise<void> {
  const deadline = Date.now() + 5000;
  while (vscode.window.activeTextEditor?.document.uri.toString() !== uri.toString()) {
    assert.ok(Date.now() < deadline, 'Expected the captured source URI to open as text');
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
}

suite('Read-only participant tables', () => {
  test('tree opens a paged literal table, preserves IDs and raw text access, and retains snapshots after failed reload', async function () {
    this.timeout(30000);
    await vscode.extensions.getExtension('bids-explorer-dev.bids-explorer')!.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-table-host-'));
    const provider = new DatasetTreeProvider(new DatasetBrowser(new LocalDirectorySource()));
    let panel: vscode.WebviewPanel | undefined;
    try {
      const uri = vscode.Uri.file(join(folder, 'participants.tsv'));
      const extra = Array.from({ length: 11 }, (_, i) => `extra_${i}`);
      const values = extra.map((_, i) => `value-${i}`);
      const text =
        'participant_id\tage\tnote\t' +
        extra.join('\t') +
        '\n' +
        Array.from(
          { length: 63 },
          (_, i) =>
            `sub-${String(i + 1).padStart(3, '0')}\t00034\t<img src=x onerror=alert(1)>\t${values.join('\t')}`,
        ).join('\n');
      const dictionary = vscode.Uri.file(join(folder, 'participants.json'));
      await writeFile(uri.fsPath, text);
      await writeFile(
        dictionary.fsPath,
        '{"age":{"Description":"Recorded age","Units":"year"},"age":{"Description":"duplicate"}}',
      );
      const root = provider.browser.register(
        await provider.browser.source.root(vscode.Uri.file(folder).toString()),
      );
      const entry = (await provider.getChildren(provider.element(root))).find(
        (element) => element.type === 'entry' && element.entry.name === 'participants.tsv',
      );
      assert.ok(entry);
      assert.equal(provider.getTreeItem(entry).contextValue, 'participants');
      assert.equal(isParticipantsTable(uri), true);
      assert.equal(
        isParticipantsTable(vscode.Uri.parse('https://example.org/participants.tsv')),
        false,
      );
      panel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        entry,
      );
      assert.ok(panel);
      installControls(panel);
      const result = await rendered(panel, 63);
      assert.equal(result.visibleCount, 50);
      assert.deepEqual(result.displayedCells, [
        'sub-001',
        '00034',
        '<img src=x onerror=alert(1)>',
        ...values.slice(0, 9),
      ]);
      assert.equal(result.displayedColumns, 12);
      assert.equal(result.tableRegionTabIndex, 0);
      assert.equal(result.firstCell, 'sub-001');
      assert.equal(result.dictionaryStatus, 'loaded');
      assert.match(panel.webview.html, /connect-src 'none'/);
      assert.ok(!panel.webview.html.includes('<img src=x'));
      assert.equal(
        await vscode.commands.executeCommand('bidsExplorer.previewParticipants', uri),
        panel,
      );
      await rendered(panel, 63);
      await panel.webview.postMessage({ type: 'testControl', id: 'right' });
      const right = await rendered(panel, 63, (state) => state.columnPage === 1);
      assert.equal(right.displayedColumns, 2);
      assert.deepEqual(right.displayedCells, ['value-9', 'value-10']);
      await panel.webview.postMessage({ type: 'testControl', id: 'left' });
      await rendered(panel, 63, (state) => state.columnPage === 0);
      await panel.webview.postMessage({ type: 'testControl', id: 'next' });
      assert.equal((await rendered(panel, 63, (state) => state.page === 1)).visibleCount, 13);
      await panel.webview.postMessage({ type: 'testControl', id: 'filter', value: 'sub-063' });
      assert.deepEqual(
        (await rendered(panel, 63, (state) => state.visibleCount === 1)).displayedCells,
        ['sub-063', '00034', '<img src=x onerror=alert(1)>', ...values.slice(0, 9)],
      );
      await panel.webview.postMessage({ type: 'testControl', id: 'filter', value: '' });
      await rendered(panel, 63, (state) => state.visibleCount === 50);
      await panel.webview.postMessage({ type: 'testControl', id: 'raw' });
      await waitText(uri);
      assert.equal(vscode.window.activeTextEditor?.document.getText(), text);
      panel.reveal();
      await rendered(panel, 63);
      await writeFile(uri.fsPath, '');
      await panel.webview.postMessage({ type: 'testControl', id: 'reload' });
      assert.equal(
        (
          await rendered(panel, 63, (state) =>
            String(state.errorText).includes('previous snapshot'),
          )
        ).rowCount,
        63,
      );
      await writeFile(uri.fsPath, 'participant_id\tage\nsub-099\tn/a\n');
      await panel.webview.postMessage({ type: 'testControl', id: 'reload' });
      assert.equal((await rendered(panel, 1)).firstCell, 'sub-099');
      await panel.webview.postMessage({ type: 'testControl', id: 'dictionary-raw' });
      await waitText(dictionary);
      assert.match(vscode.window.activeTextEditor.document.getText(), /Recorded age/);
      assert.equal(await readFile(uri.fsPath, 'utf8'), 'participant_id\tage\nsub-099\tn/a\n');
      assert.equal(
        await readFile(dictionary.fsPath, 'utf8'),
        '{"age":{"Description":"Recorded age","Units":"year"},"age":{"Description":"duplicate"}}',
      );
    } finally {
      panel?.dispose();
      provider.dispose();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('table manager coalesces opens, cancels pending reads, isolates physical sources and falls back to raw for unusable tables', async function () {
    this.timeout(20000);
    const folder = await mkdtemp(join(tmpdir(), 'bids-table-life-'));
    const extension = vscode.extensions.getExtension('bids-explorer-dev.bids-explorer')!;
    await extension.activate();
    const manager = new TablePreviewManager(extension.extensionUri);
    try {
      const uri = vscode.Uri.file(join(folder, 'participants.tsv'));
      await writeFile(uri.fsPath, 'participant_id\nsub-01');
      const a = manager.open(uri),
        b = manager.open(uri);
      assert.equal(a, b);
      const panel = await a;
      assert.equal((await rendered(panel, 1)).dictionaryStatus, 'absent');
      assert.equal(await manager.open(uri), panel);
      panel.dispose();
      const pending = manager.open(uri);
      manager.cancelPending();
      await assert.rejects(pending, /abort/i);
      const reopened = await manager.open(uri);
      assert.notEqual(reopened, panel);
      await writeFile(uri.fsPath, '');
      const element = {
        type: 'entry',
        entry: {
          datasetUri: vscode.Uri.file(folder).toString(),
          uri: uri.toString(),
          relativePath: 'participants.tsv',
          name: 'participants.tsv',
          kind: 'file',
        },
      };
      assert.equal(
        await vscode.commands.executeCommand('bidsExplorer.openFile', element),
        undefined,
      );
      await waitText(uri);
      assert.equal(vscode.window.activeTextEditor?.document.getText(), '');
      await writeFile(uri.fsPath, 'participant_id\nsub-01');
      await writeFile(join(folder, 'participants.json'), 'broken');
      reopened.dispose();
      assert.equal((await rendered(await manager.open(uri), 1)).dictionaryStatus, 'unavailable');
      await mkdir(join(folder, 'other'));
      const other = vscode.Uri.file(join(folder, 'other/participants.tsv'));
      await writeFile(other.fsPath, 'participant_id\nsub-02');
      assert.equal((await rendered(await manager.open(other), 1)).sourceUri, other.toString());
      // A cancelled preview command must not fall through to opening the raw file.
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      // eslint-disable-next-line @typescript-eslint/unbound-method -- Restored to the prototype, never called unbound.
      const open = TablePreviewManager.prototype.open;
      TablePreviewManager.prototype.open = () =>
        Promise.reject(new DOMException('cancelled', 'AbortError'));
      try {
        assert.equal(
          await vscode.commands.executeCommand('bidsExplorer.openFile', element),
          undefined,
        );
        assert.equal(vscode.window.activeTextEditor, undefined);
      } finally {
        TablePreviewManager.prototype.open = open;
      }
      manager.dispose();
      await assert.rejects(manager.open(uri), /closed/);
    } finally {
      manager.dispose();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await rm(folder, { recursive: true, force: true });
    }
  });
  for (const kind of ['sessions', 'scans'] as const) {
    test(`${kind} tables use scoped dictionary inheritance, correct IDs and source-bound raw actions`, async function () {
      this.timeout(25000);
      const extension = vscode.extensions.getExtension<{ provider: DatasetTreeProvider }>(
        'bids-explorer-dev.bids-explorer',
      )!;
      const { provider } = await extension.activate();
      const folder = await mkdtemp(join(tmpdir(), 'bids-summary-host-'));
      const name = kind === 'sessions' ? 'sub-001_sessions.tsv' : 'sub-001_ses-002_scans.tsv';
      const relative = kind === 'sessions' ? 'sub-001/' + name : 'sub-001/ses-002/' + name;
      const path = join(folder, relative),
        uri = vscode.Uri.file(path);
      const rootUri = vscode.Uri.file(folder);
      const identifier = kind === 'sessions' ? 'session_id' : 'filename';
      const value = kind === 'sessions' ? 'ses-002' : '../outside.nii';
      let panel: vscode.WebviewPanel | undefined;
      try {
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(path, `${identifier}\tnote\n${value}\t0001\n${value}\tn/a`);
        await writeFile(join(folder, kind + '.json'), '{"note":{"Description":"Root definition"}}');
        const local = vscode.Uri.file(path.replace(/\.tsv$/, '.json'));
        await writeFile(local.fsPath, '{"note":{"Description":"Local definition"}}');
        await vscode.commands.executeCommand('bidsExplorer.addDataset', rootUri);
        const entry = provider.element({
          datasetUri: rootUri.toString(),
          uri: uri.toString(),
          name,
          relativePath: relative,
          kind: 'file',
        });
        assert.equal(provider.getTreeItem(entry).contextValue, 'summaryTable');
        panel = await vscode.commands.executeCommand('bidsExplorer.openFile', entry);
        assert.ok(panel);
        installControls(panel);
        const state = await rendered(panel, 2);
        assert.equal(state.title, kind === 'sessions' ? 'Sessions' : 'Scans');
        assert.equal(state.identifierColumn, identifier);
        assert.equal(state.firstCell, value);
        assert.equal(state.dictionarySourceCount, 2);
        assert.match(String(state.dictionaryText), /Local definition/);
        assert.ok(!String(state.dictionaryText).includes('Root definition'));
        assert.match(String(state.issuesText), new RegExp(identifier));
        assert.equal(await vscode.commands.executeCommand('bidsExplorer.previewTable', uri), panel);
        await rendered(panel, 2);
        await panel.webview.postMessage({
          type: 'testControl',
          id: 'dictionary-source',
          value: '1',
        });
        await panel.webview.postMessage({ type: 'testControl', id: 'dictionary-raw' });
        await waitText(local);
        assert.match(vscode.window.activeTextEditor!.document.getText(), /Local definition/);
        panel.reveal();
        await rendered(panel, 2);
        await writeFile(local.fsPath, 'broken');
        await panel.webview.postMessage({ type: 'testControl', id: 'reload' });
        const unresolved = await rendered(
          panel,
          2,
          (state) => state.dictionaryStatus === 'unavailable',
        );
        assert.ok(!String(unresolved.dictionaryText).includes('Root definition'));
        assert.equal(unresolved.dictionarySourceCount, 2);
        assert.equal(
          await readFile(path, 'utf8'),
          `${identifier}\tnote\n${value}\t0001\n${value}\tn/a`,
        );
      } finally {
        panel?.dispose();
        const root = provider.browser.datasets().find((entry) => entry.uri === rootUri.toString());
        if (root)
          await vscode.commands.executeCommand(
            'bidsExplorer.removeDataset',
            provider.element(root),
          );
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await rm(folder, { recursive: true, force: true });
      }
    });
  }
});
