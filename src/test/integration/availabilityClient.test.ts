import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import * as vscode from 'vscode';
import { extensionId } from '../extensionId';
import { openAvailabilityView } from '../../ui/availabilityView';
import type { AvailabilityIndex } from '../../core/availability';
import type { DirectoryEntry } from '../../core/directory';

suite('Availability client', () => {
  test('accepts real progress, rejects foreign/stale/malformed messages and submits real filter/reveal actions', async () => {
    const extension = vscode.extensions.getExtension(extensionId)!;
    const participants: DirectoryEntry[] = ['sub-01', 'sub-02'].map((name) => ({
      datasetUri: 'file:///synthetic',
      uri: 'file:///synthetic/' + name,
      relativePath: name,
      name,
      kind: 'directory',
    }));
    const index: AvailabilityIndex = {
      participants,
      columns: ['ses-01'],
      partial: false,
      retryable: false,
      sources: ['Raw'],
      outputModalities: [],
      rows: participants.map(() => [
        {
          sourceIndex: 0,
          complete: true,
          cells: new Map([['ses-01', { modalities: ['anat'], complete: true }]]),
        },
      ]),
    };
    let finish!: (index: AvailabilityIndex) => void;
    let progress!: (completed: number, total: number) => void;
    let revealed: DirectoryEntry | undefined;
    const panel = openAvailabilityView(
      extension.extensionUri,
      (_controller, report) => {
        progress = report;
        return new Promise((resolve) => (finish = resolve));
      },
      (participant) => {
        revealed = participant;
        return Promise.resolve();
      },
    );
    const probe = randomBytes(12).toString('hex');
    let ready = 0;
    let reply: { before: string; after: string } | undefined;
    const listener = panel.webview.onDidReceiveMessage(
      (message: { type?: string; probe?: string; before: string; after: string }) => {
        if (message.type === 'ready') ready++;
        if (message.probe === probe) reply = message;
      },
    );
    const wait = async (done: () => boolean, message: string) => {
      const deadline = Date.now() + 20000;
      while (!done()) {
        assert.ok(Date.now() < deadline, message);
        await setTimeout(25);
      }
    };
    const instrument = async () => {
      const previous = ready;
      const nonce = /nonce="([a-f0-9]+)"/.exec(panel.webview.html)![1];
      panel.webview.html = panel.webview.html.replace(
        '</head>',
        `<script nonce="${nonce}">
        const probeApi = acquireVsCodeApi();
        window.acquireVsCodeApi = () => probeApi;
        window.addEventListener('message', event => {
          if (event.origin !== window.location.origin || event.data?.probe !== '${probe}') return;
          const action = event.data.action;
          if (action === 'filter') {
            document.querySelector('input[name="participant"]').value = 'sub-02';
            document.getElementById('filters').requestSubmit();
          } else if (action === 'reveal') {
            document.querySelector('button[data-participant="1"]').click();
          } else {
            const output = document.getElementById('scan-progress');
            const before = output.textContent;
            const revision = Number(document.body.dataset.revision);
            for (const origin of ['https://foreign.invalid', 'null', ''])
              window.dispatchEvent(new MessageEvent('message', {
                origin, data: {progress:'foreign progress', revision}
              }));
            for (const data of [null, {}, {progress:7, revision}, {progress:'stale', revision:revision-1}])
              window.dispatchEvent(new MessageEvent('message', {origin:location.origin, data}));
            probeApi.postMessage({probe:'${probe}', before, after:output.textContent});
          }
        });
        </script></head>`,
      );
      await wait(() => ready > previous, 'The packaged availability module must start');
    };
    try {
      await instrument();
      progress(1, 2);
      await panel.webview.postMessage({ probe });
      await wait(() => !!reply, 'The real webview must answer the probe');
      assert.match(reply!.before, /Indexed 1 of 2 participants/);
      assert.equal(reply!.after, reply!.before);
      finish(index);
      await wait(
        () => panel.webview.html.includes('2 confirmed matches among 2 indexed participants'),
        'The completed index must render',
      );
      await instrument();
      await panel.webview.postMessage({ probe, action: 'reveal' });
      await wait(() => !!revealed, 'The actual client must reveal a participant');
      assert.equal(revealed, participants[1]);
      await panel.webview.postMessage({ probe, action: 'filter' });
      await wait(
        () => panel.webview.html.includes('1 confirmed match among 2 indexed participants'),
        'The actual form must filter the participant snapshot',
      );
      assert.match(panel.webview.html, /data-participant="1"/);
      assert.doesNotMatch(panel.webview.html, /data-participant="0"/);
    } finally {
      finish(index);
      listener.dispose();
      panel.dispose();
    }
  });
});
