import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { activate } from '../../extension';
import type { EntryElement, TreeElement } from '../../ui/datasetTreeProvider';
import type { DirectoryEntry } from '../../core/directory';
import { interpretEntry } from '../../core/entities';
import { waitForArchivePreview } from './waitForArchivePreview';

interface FixtureManifest {
  raw: string;
  derivatives: string;
  officialExample: string;
  files: { dataset: string; relativePath: string; sha256: string; dimensions?: number[] }[];
  exampleFiles: { relativePath: string; sha256: string; bytes: number }[];
}
async function hash(path: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk as Buffer);
  return digest.digest('hex');
}
function named(rows: readonly TreeElement[], name: string): EntryElement {
  const entry = rows.find(
    (row): row is EntryElement => row.type === 'entry' && row.entry.name === name,
  );
  assert.ok(entry, `Expected logical entry ${name}`);
  return entry;
}

suite('Opt-in public logical-layout examples', () => {
  test('real multi-echo data, shared events, separately linked derivatives and field maps remain accessible and unchanged', async function () {
    this.timeout(300000);
    const base = process.env.BIDS_EXPLORER_LAYOUT_FIXTURE;
    if (!base) return this.skip();
    // No network, implicit fixture discovery, source edits, validation or empty-image opening.
    const manifest = JSON.parse(
      await readFile(join(base, 'fixture-manifest.json'), 'utf8'),
    ) as FixtureManifest;
    assert.equal(manifest.raw, 'ds004662');
    assert.equal(manifest.derivatives, 'ds007661');
    assert.equal(manifest.officialExample, 'bids-examples/ds000117');
    const { provider } = await vscode.extensions
      .getExtension<ReturnType<typeof activate>>('bids-explorer-dev.bids-explorer')!
      .activate();
    const settings = vscode.workspace.getConfiguration('bidsExplorer');
    const previous = settings.inspect('derivativeDatasets')?.workspaceValue;
    const roots: DirectoryEntry[] = [];
    const report: Record<string, unknown> = {
      imagesRequested: process.env.BIDS_EXPLORER_LAYOUT_IMAGES === '1',
    };
    try {
      for (const folder of [manifest.raw, manifest.derivatives, manifest.officialExample]) {
        const root = await vscode.commands.executeCommand<DirectoryEntry>(
          'bidsExplorer.addDataset',
          vscode.Uri.file(join(base, folder)),
        );
        assert.ok(root);
        roots.push(root);
      }
      await settings.update(
        'derivativeDatasets',
        { [roots[0].datasetUri]: [roots[1].datasetUri] },
        vscode.ConfigurationTarget.Workspace,
      );
      const participant = named(await provider.getChildren(provider.element(roots[0])), 'sub-01');
      const participantRows = await provider.getChildren(participant);
      const func = named(participantRows, 'func');
      const rows = await provider.getChildren(func);
      const collection = rows.find(
        (row): row is EntryElement =>
          row.type === 'entry' &&
          !!row.acquisition?.echoes &&
          row.entry.name.endsWith('_bold.nii.gz'),
      )!;
      assert.ok(collection);
      assert.match(String(provider.getTreeItem(collection).description), /5 echoes/);
      const collectionRows = await provider.getChildren(collection);
      const echoes = collectionRows.filter(
        (row): row is EntryElement => row.type === 'entry' && !!row.acquisition,
      );
      assert.equal(echoes.length, 5);
      assert.deepEqual(
        echoes.map(
          (row) =>
            interpretEntry(row.entry).entities.find((entity) => entity.key === 'echo')?.value,
        ),
        ['1', '2', '3', '4', '5'],
      );
      assert.deepEqual(
        echoes.map((row) => provider.getTreeItem(row).label),
        ['Echo 1', 'Echo 2', 'Echo 3', 'Echo 4', 'Echo 5'],
      );
      const events = named(rows, 'sub-01_task-handgrasp_events.tsv');
      assert.ok(
        !echoes.some((row) => row.acquisition!.members.includes(events.entry)),
        'Shared events must not be assigned exclusively to one echo',
      );
      assert.ok(
        rows.indexOf(events) < rows.indexOf(collection),
        'Task-wide events stay before acquisition subtrees at their original scope',
      );
      for (const echo of echoes) {
        const children = await provider.getChildren(echo);
        assert.ok(children.some((row) => provider.getTreeItem(row).label === 'Image'));
        const original = children.find(
          (row): row is EntryElement =>
            row.type === 'entry' && row.resourceLabel === 'Original JSON',
        );
        assert.ok(original);
        const recorded = JSON.parse(
          await readFile(vscode.Uri.parse(original.entry.uri).fsPath, 'utf8'),
        ) as { EchoTime: number };
        assert.ok(recorded.EchoTime > 0);
      }
      const eventPanel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        events,
      );
      assert.ok(eventPanel);
      try {
        const rendered = await waitForArchivePreview(
          eventPanel,
          (message) => typeof message.rowCount === 'number',
        );
        assert.ok(Number(rendered.rowCount) > 0);
      } finally {
        eventPanel.dispose();
      }
      const derivativeView = participantRows.find((row) => row.type === 'overview');
      assert.ok(derivativeView);
      assert.equal(provider.getTreeItem(derivativeView).label, 'Derivatives without a session');
      const pipeline = (await provider.getChildren(derivativeView)).find(
        (row): row is EntryElement =>
          row.type === 'entry' && row.entry.datasetUri === roots[1].datasetUri,
      );
      assert.ok(pipeline);
      const processedFunc = named(await provider.getChildren(pipeline), 'func');
      const processed = named(
        await provider.getChildren(processedFunc),
        'sub-01_task-handgrasp_run-1_space-T1w_desc-preproc_bold.nii.gz',
      );
      assert.match(String(provider.getTreeItem(processed).description), /Space T1w/);
      assert.match(String(provider.getTreeItem(processed).description), /Description preproc/);
      assert.equal(processed.entry.datasetUri, roots[1].datasetUri);
      const original = (await provider.getChildren(processed)).find(
        (row): row is EntryElement => row.type === 'entry' && row.resourceLabel === 'Original JSON',
      );
      assert.ok(original);
      const json = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.openFile',
        original,
      );
      assert.ok(json);
      try {
        await waitForArchivePreview(json, (message) => Number(message.fieldCount) > 0);
      } finally {
        json.dispose();
      }
      const example = named(await provider.getChildren(provider.element(roots[2])), 'sub-01');
      const mriSession = named(await provider.getChildren(example), 'ses-mri');
      const fmap = named(await provider.getChildren(mriSession), 'fmap');
      const fieldmaps = await provider.getChildren(fmap);
      assert.ok(
        fieldmaps.some(
          (row) => row.type === 'entry' && /_phasediff\.nii(?:\.gz)?$/.test(row.entry.name),
        ),
      );
      assert.ok(
        fieldmaps.some(
          (row) => row.type === 'entry' && /_magnitude[12]\.nii(?:\.gz)?$/.test(row.entry.name),
        ),
      );
      const phase = fieldmaps.find(
        (row): row is EntryElement =>
          row.type === 'entry' && /_phasediff\.nii(?:\.gz)?$/.test(row.entry.name),
      )!;
      const phaseJson = (await provider.getChildren(phase)).find(
        (row): row is EntryElement => row.type === 'entry' && row.resourceLabel === 'Original JSON',
      );
      assert.ok(phaseJson);
      const declared = JSON.parse(
        await readFile(vscode.Uri.parse(phaseJson.entry.uri).fsPath, 'utf8'),
      ) as { IntendedFor: string[] };
      assert.equal(declared.IntendedFor.length, 9);
      report.fieldMapDeclaredTargets = declared.IntendedFor;
      report.echoes = echoes.map((row) => row.entry.name);
      report.sharedEvents = events.entry.name;
      report.derivative = processed.entry.name;
      report.fieldMaps = fieldmaps
        .filter((row): row is EntryElement => row.type === 'entry')
        .map((row) => row.entry.name);
      if (process.env.BIDS_EXPLORER_LAYOUT_IMAGES === '1') {
        const opened: unknown[] = [];
        for (const element of [echoes[0], processed]) {
          const started = Date.now();
          const panel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
            'bidsExplorer.openFile',
            element,
          );
          assert.ok(panel);
          let state: { status?: string; loadedFrames?: number; previewFrames?: number } = {};
          const listener = panel.webview.onDidReceiveMessage((value: typeof state) => {
            state = value;
          });
          try {
            const deadline = Date.now() + 90000;
            while (!state.loadedFrames && !state.status?.startsWith('Unable')) {
              assert.ok(
                Date.now() < deadline,
                `Image load timed out: ${state.status ?? 'no reply'}`,
              );
              await panel.webview.postMessage('inspect');
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            const expected = manifest.files.find(
              (file) =>
                file.dataset ===
                  (element.entry.datasetUri === roots[0].datasetUri
                    ? manifest.raw
                    : manifest.derivatives) && file.relativePath.endsWith('/' + element.entry.name),
            );
            assert.ok(expected?.dimensions);
            assert.equal(state.loadedFrames, expected.dimensions[3] ?? 1, state.status);
            assert.equal(state.previewFrames, expected.dimensions[3] ?? 1);
            opened.push({ file: element.entry.name, ...state, elapsedMs: Date.now() - started });
          } finally {
            listener.dispose();
            panel.dispose();
          }
        }
        report.viewer = opened;
      }
      for (const file of manifest.files)
        assert.equal(
          await hash(join(base, file.dataset, file.relativePath)),
          file.sha256,
          `Source unchanged: ${file.relativePath}`,
        );
      for (const file of manifest.exampleFiles)
        assert.equal(
          await hash(join(base, 'bids-examples', file.relativePath)),
          file.sha256,
          `Example unchanged: ${file.relativePath}`,
        );
      report.sourcesUnchanged = true;
      if (process.env.BIDS_EXPLORER_LAYOUT_REPORT)
        await writeFile(
          process.env.BIDS_EXPLORER_LAYOUT_REPORT,
          JSON.stringify(report, null, 2) + '\n',
        );
    } finally {
      await settings.update('derivativeDatasets', previous, vscode.ConfigurationTarget.Workspace);
      for (const root of roots.reverse())
        await vscode.commands.executeCommand('bidsExplorer.removeDataset', provider.element(root));
    }
  });
});
