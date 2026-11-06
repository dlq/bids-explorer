import { strict as assert } from 'node:assert';
import type * as vscode from 'vscode';

export async function waitForArchivePreview(
  panel: vscode.WebviewPanel,
  accepts: (message: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  let received: Record<string, unknown> | undefined;
  const listener = panel.webview.onDidReceiveMessage((message: unknown) => {
    if (
      message &&
      typeof message === 'object' &&
      'type' in message &&
      message.type === 'rendered' &&
      accepts(message)
    )
      received = message;
  });
  try {
    const deadline = Date.now() + 12000;
    while (!received) {
      assert.ok(Date.now() < deadline, 'Archive preview should render');
      await panel.webview.postMessage({ type: 'inspect' });
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return received;
  } finally {
    listener.dispose();
  }
}
