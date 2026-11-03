import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';
import { DatasetTreeProvider } from '../../ui/datasetTree';

suite('BIDS Explorer scaffold', () => {
  test('activates and handles refresh', async () => {
    const extension = vscode.extensions.getExtension('bids-explorer-dev.bids-explorer');
    assert.ok(extension);
    await extension.activate();
    assert.ok(extension.isActive);
    await vscode.commands.executeCommand('bidsExplorer.refresh');
  });
  test('empty tree refreshes without scanning the workspace', () => {
    const provider = new DatasetTreeProvider();
    let refreshed = false;
    const subscription = provider.onDidChangeTreeData(() => {
      refreshed = true;
    });
    assert.deepEqual(provider.getChildren(), []);
    provider.refresh();
    assert.ok(refreshed);
    subscription.dispose();
    provider.dispose();
  });
});
