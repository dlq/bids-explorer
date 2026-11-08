import assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { WebviewPanelStore } from '../../ui/webviewPanelStore';
import { openAvailabilityView } from '../../ui/availabilityView';
import type { AvailabilityIndex } from '../../core/availability';
import { PreviewPanelManager } from '../../ui/previewPanelManager';

suite('Preview panel lifecycle', () => {
  test('a cancelled read cannot open a panel even if its loader completes', async () => {
    class TestPreviews extends PreviewPanelManager {
      open(load: (signal: AbortSignal) => Promise<void>) {
        return this.showPanel('source', load, () => assert.fail('Cancelled preview rendered'));
      }
    }
    const previews = new TestPreviews(vscode.Uri.file('/unused'), 'Preview manager closed');
    try {
      let finish!: () => void;
      const reading = previews.open(() => new Promise<void>((resolve) => (finish = resolve)));
      previews.cancelPending();
      finish();
      await assert.rejects(reading, { name: 'AbortError' });
    } finally {
      previews.dispose();
    }
  });
  test('standalone panels close with their owner, cancel scanning and cannot reopen after disposal', async () => {
    const owner = new WebviewPanelStore();
    let scan!: AbortController;
    let finish!: (index: AvailabilityIndex) => void;
    const availability = owner.add(
      openAvailabilityView(
        vscode.Uri.file('/unused'),
        (controller) => {
          scan = controller;
          return new Promise((resolve) => (finish = resolve));
        },
        () => Promise.resolve(),
      ),
    );
    let closed = 0;
    availability.onDidDispose(() => closed++);
    const comparison = owner.add(
      vscode.window.createWebviewPanel(
        'bidsExplorer.test.lifecycle',
        'Lifecycle test',
        vscode.ViewColumn.Active,
        { localResourceRoots: [] },
      ),
    );
    comparison.onDidDispose(() => closed++);
    try {
      comparison.dispose();
      assert.equal(closed, 1);
      owner.dispose();
      assert.equal(closed, 2);
      assert.equal(scan.signal.aborted, true);
      finish({
        participants: [],
        columns: [],
        sources: [],
        outputModalities: [],
        rows: [],
        partial: false,
        retryable: false,
      });
      await Promise.resolve();
      const late = vscode.window.createWebviewPanel(
        'bidsExplorer.test.lifecycle',
        'Late panel',
        vscode.ViewColumn.Active,
        { localResourceRoots: [] },
      );
      late.onDidDispose(() => closed++);
      owner.add(late);
      assert.equal(closed, 3, 'A panel completing after owner disposal must close immediately');
      owner.dispose();
      assert.equal(closed, 3);
    } finally {
      owner.dispose();
      finish({
        participants: [],
        columns: [],
        sources: [],
        outputModalities: [],
        rows: [],
        partial: false,
        retryable: false,
      });
    }
  });
});
