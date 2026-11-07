import { extensionId } from '../extensionId';
import { waitForArchivePreview } from './waitForArchivePreview';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import * as vscode from 'vscode';
import { niftiFixture } from '../niftiFixture';
import { tarFixture, tarRecord } from '../tarFixture';

suite('Tar inventory command', () => {
  test('inspects a gzip tarball and publishes a bounded report without extracting it', async () => {
    await vscode.extensions.getExtension(extensionId)!.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-tar-command-'));
    try {
      const uri = vscode.Uri.file(join(folder, 'sample.tar.gz'));
      const bytes = gzipSync(
        tarFixture(...Array.from({ length: 201 }, (_, i) => tarRecord(`ds-sample/file-${i}`))),
      );
      await writeFile(uri.fsPath, bytes);
      const report = await vscode.commands.executeCommand<vscode.TextDocument>(
        'bidsExplorer.inspectTar',
        uri,
      );
      assert.ok(report);
      const data = JSON.parse(report.getText()) as {
        coverage: string;
        format: string;
        totalMembers: number;
        members: { resource: { memberPath: string } }[];
        note: string;
      };
      assert.equal(data.coverage, 'complete');
      assert.equal(data.format, 'tar.gz');
      assert.equal(data.totalMembers, 201);
      assert.equal(data.members.length, 200);
      assert.equal(data.members[0].resource.memberPath, 'ds-sample/file-0');
      assert.match(data.note, /Sequential tar inventory/);
      assert.deepEqual(await readFile(uri.fsPath), bytes);
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

suite('Tar logical browsing', () => {
  const verify = async (folder: string, real: boolean) => {
    const extension = vscode.extensions.getExtension<{
      provider: import('../../ui/datasetTreeProvider').DatasetTreeProvider;
    }>(extensionId)!;
    const { provider } = await extension.activate();
    const root = await vscode.commands.executeCommand<
      import('../../core/directory').DirectoryEntry
    >('bidsExplorer.addDataset', vscode.Uri.file(folder));
    assert.ok(root);
    const rootElement = provider.element(root);
    try {
      const rows = await provider.getChildren(rootElement);
      assert.ok(
        rows.some((row) => row.type === 'entry' && row.entry.name === 'dataset_description.json'),
      );
      assert.ok(
        !rows.some((row) => row.type === 'entry' && ['ds-sample', 'code'].includes(row.entry.name)),
      );
      const subject = rows.find((row) => row.type === 'entry' && row.entry.name === 'sub-01');
      assert.ok(subject);
      const [session] = await provider.getChildren(subject);
      assert.ok(session?.type === 'entry');
      assert.equal(session.entry.name, 'ses-01');
      const modalities = await provider.getChildren(session);
      assert.deepEqual(
        modalities.flatMap((row) => (row.type === 'entry' ? [row.entry.name] : [])),
        real ? ['anat', 'dwi', 'func'] : ['anat'],
      );
      const preview = async (
        row: import('../../ui/datasetTreeProvider').TreeElement,
        title: RegExp,
      ) => {
        const panel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
          'bidsExplorer.openFile',
          row,
        );
        assert.ok(panel);
        try {
          assert.match(panel.title, title);
          const rendered = await waitForArchivePreview(panel, () => true);
          if (/Gradient/.test(panel.title)) assert.equal(rendered.volumeCount, 129);
          else assert.match(String(rendered.sourceUri), /^bids-tar:/);
        } finally {
          panel.dispose();
        }
      };
      const descriptor = rows.find(
        (row) => row.type === 'entry' && row.entry.name === 'dataset_description.json',
      )!;
      await preview(descriptor, /^Metadata/);
      if (real) {
        const participants = rows.find(
          (row) => row.type === 'entry' && row.entry.name === 'participants.tsv',
        )!;
        await preview(participants, /Participants|participants/);
      }
      for (const modality of modalities) {
        const listed = await provider.getChildren(modality);
        const image = listed.find(
          (row) => row.type === 'entry' && row.entry.name.endsWith('.nii.gz'),
        );
        assert.ok(image?.type === 'entry');
        const files = [...listed, ...(image.acquisition ? await provider.getChildren(image) : [])];
        assert.equal(image.entry.archive?.format, 'tar');
        assert.equal(image.entry.archive?.memberPath, 'ds-sample/' + image.entry.relativePath);
        const item = provider.getTreeItem(image);
        assert.equal(item.contextValue, 'archiveImage');
        assert.equal(item.command?.command, 'bidsExplorer.openFile');
        assert.equal(item.resourceUri?.scheme, 'bids-tar');
        const sidecar = files.find(
          (row) => row.type === 'entry' && row.entry.name.endsWith('.json'),
        );
        if (sidecar) {
          await preview(sidecar, /json|Metadata/);
          const raw = await vscode.workspace.openTextDocument(
            provider.getTreeItem(sidecar).resourceUri!,
          );
          assert.equal(raw.uri.scheme, 'bids-tar');
          assert.ok(JSON.parse(raw.getText()) as unknown);
        }
        const gradients = files.find(
          (row) => row.type === 'entry' && row.entry.name.endsWith('.bval'),
        );
        if (gradients) await preview(gradients, /Gradient/);
        const events = files.find(
          (row) => row.type === 'entry' && row.entry.name.endsWith('_events.tsv'),
        );
        if (events) await preview(events, /Events|events/);
        const opened = await vscode.commands.executeCommand<string>('bidsExplorer.openFile', image);
        assert.ok(opened);
        const bytes = await readFile(vscode.Uri.parse(opened).fsPath);
        const header = gunzipSync(bytes);
        assert.equal(header.readInt32LE(0), 348);
        const volumes = image.entry.name.endsWith('_dwi.nii.gz')
          ? 129
          : image.entry.name.endsWith('_bold.nii.gz')
            ? 100
            : 1;
        assert.equal(header.readInt16LE(40) === 4 ? header.readInt16LE(48) : 1, volumes);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      }
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await vscode.commands.executeCommand('bidsExplorer.clearImageCache');
      await vscode.commands.executeCommand('bidsExplorer.removeDataset', rootElement);
    }
  };

  test('shows wrapped tar members in the native logical tree', async function () {
    this.timeout(30_000);
    const folder = await mkdtemp(join(tmpdir(), 'bids-tar-tree-'));
    try {
      await writeFile(
        join(folder, 'sample.tar.gz'),
        gzipSync(
          tarFixture(
            tarRecord(
              'ds-sample/dataset_description.json',
              Buffer.from('{"Name":"Tar preview fixture"}'),
            ),
            tarRecord('ds-sample/code/config.json'),
            tarRecord('ds-sample/sub-01/ses-01/anat/sub-01_ses-01_T1w.nii.gz', niftiFixture()),
          ),
        ),
      );
      await verify(folder, false);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('previews metadata and opens all three MRIs from the opt-in Connectome Mapper archive', async function () {
    this.timeout(30_000);
    const folder = process.env.BIDS_EXPLORER_CONNECTOME_MAPPER_FIXTURE;
    if (!folder) return this.skip();
    await verify(folder, true);
  });
});
