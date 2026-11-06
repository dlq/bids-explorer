import assert from 'node:assert/strict';
import * as vscode from 'vscode';
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
});
