import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type * as vscode from 'vscode';

/** Exercise real client handlers under their CSP; the injected probe never ships. */
export async function assertHostMessages(
  webview: vscode.Webview,
  inspect: unknown = { type: 'inspect' },
): Promise<void> {
  const nonce = /nonce="([a-f0-9]+)"/.exec(webview.html)?.[1];
  assert.ok(nonce, 'The client must use a nonce-restricted script policy');
  const probe = randomBytes(12).toString('hex');
  let ready = false;
  let counts: number[] | undefined;
  const listener = webview.onDidReceiveMessage((message: unknown) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return;
    if (message.type === 'rendered' || message.type === 'imageState') ready = true;
    if (message.type === probe && 'counts' in message) counts = message.counts as number[];
  });
  try {
    webview.html = webview.html.replace(
      '</head>',
      `<script nonce="${nonce}">
      const securityApi = acquireVsCodeApi();
      let securityReplies = 0;
      window.acquireVsCodeApi = () => ({
        ...securityApi,
        postMessage(message) {
          if (message?.type === 'rendered' || message?.type === 'imageState') securityReplies++;
          securityApi.postMessage(message);
        }
      });
      window.addEventListener('message', event => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== '${probe}') return;
        const data = event.data.inspect;
        const senders = [
          ['https://foreign.invalid', window.parent],
          ['null', window.parent],
          ['', window.parent],
          [window.location.origin, window.parent],
        ];
        const counts = senders.map(([origin, source]) => {
          const before = securityReplies;
          window.dispatchEvent(new MessageEvent('message', {data, origin, source}));
          return securityReplies - before;
        });
        securityApi.postMessage({type:'${probe}', counts});
      });
      </script></head>`,
    );
    const deadline = Date.now() + 20000;
    while (!ready) {
      assert.ok(Date.now() < deadline, 'The real host must still reach the reloaded client');
      await webview.postMessage(inspect);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    while (!counts) {
      assert.ok(Date.now() < deadline, 'The message-sender regression probe must complete');
      await webview.postMessage({ type: probe, inspect });
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.deepEqual(
      counts,
      [0, 0, 0, 1],
      'Reject foreign, opaque and empty origins; accept the webview origin',
    );
  } finally {
    listener.dispose();
  }
}
