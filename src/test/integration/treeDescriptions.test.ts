import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { DatasetTreeProvider, type EntryElement } from '../../ui/datasetTreeProvider';
import { DatasetBrowser } from '../../core/browser';
import { LocalDirectorySource } from '../../sources/localDirectory';
import type { DirectoryEntry } from '../../core/directory';

async function waitFor(test: () => boolean): Promise<void> {
  const deadline = Date.now() + 10000;
  while (!test()) {
    assert.ok(Date.now() < deadline, 'Expected background tree description');
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
}
suite('Metadata-based tree descriptions', () => {
  test('dataset/task names and explicitly mapped participant/session descriptions preserve tree identity and source provenance', async function () {
    this.timeout(30000);
    const { provider } = await vscode.extensions
      .getExtension<{ provider: DatasetTreeProvider }>('bids-explorer-dev.bids-explorer')!
      .activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-tree-descriptions-host-'));
    const rootUri = vscode.Uri.file(folder);
    const config = vscode.workspace.getConfiguration('bidsExplorer');
    const previousParticipant = config.inspect('participantLabelColumn')?.workspaceValue;
    const previousSession = config.inspect('sessionLabelColumn')?.workspaceValue;
    const put = async (path: string, text: string) => {
      await mkdir(join(folder, path, '..'), { recursive: true });
      await writeFile(join(folder, path), text);
    };
    let root: DirectoryEntry | undefined;
    const element = (path: string, kind: DirectoryEntry['kind'] = 'directory'): EntryElement =>
      provider.element({
        datasetUri: rootUri.toString(),
        uri: vscode.Uri.file(join(folder, path)).toString(),
        relativePath: path,
        name: path.split('/').at(-1)!,
        kind,
      });
    const described = async (item: EntryElement, value: string): Promise<void> =>
      waitFor(() => String(provider.getTreeItem(item).description).includes(value));
    try {
      await config.update('participantLabelColumn', '', vscode.ConfigurationTarget.Workspace);
      await config.update('sessionLabelColumn', '', vscode.ConfigurationTarget.Workspace);
      await put('dataset_description.json', '{"Name":"Example <study> [click](command:unsafe)"}');
      await put('participants.tsv', 'participant_id\tlabel\nsub-001\tAlice\nsub-01\tDifferent');
      await put('participants.json', '{"label":{"Description":"Explicit display label"}}');
      await put('sub-001/sub-001_sessions.tsv', 'session_id\tlabel\nses-002\tFollow-up');
      await mkdir(join(folder, 'sub-001/ses-002'), { recursive: true });
      await put('task-rest_bold.json', '{"TaskName":"Resting state"}');
      const image = 'sub-001/func/sub-001_task-rest_bold.nii.gz';
      await put(image, 'MRI bytes must not be read');
      root = await vscode.commands.executeCommand<DirectoryEntry>(
        'bidsExplorer.addDataset',
        rootUri,
      );
      assert.ok(root);
      const rootElement = provider.element(root),
        subject = element('sub-001'),
        session = element('sub-001/ses-002'),
        task = element(image, 'file');
      const initial = provider.getTreeItem(rootElement);
      assert.equal(initial.label, root.name);
      await described(rootElement, 'Example <study>');
      const rootTooltip = provider.getTreeItem(rootElement).tooltip;
      assert.ok(rootTooltip instanceof vscode.MarkdownString);
      assert.ok(!rootTooltip.value.includes('[click](command:unsafe)'));
      assert.equal(rootTooltip.isTrusted, false);
      assert.equal(rootTooltip.supportHtml, false);
      assert.equal(provider.getTreeItem(rootElement).id, initial.id);
      assert.equal(provider.getTreeItem(rootElement).resourceUri?.toString(), root.uri);
      assert.equal(provider.getTreeItem(subject).description, 'Participant');
      assert.equal(provider.descriptionSnapshot(subject.entry)?.status, 'unloaded');
      await described(task, 'Resting state');
      assert.equal(provider.getTreeItem(task).label, 'BOLD');
      assert.match(
        String(provider.getTreeItem(task).description),
        /^Task rest · NIfTI image · Resting state$/,
      );
      const tooltip = provider.getTreeItem(task).tooltip;
      assert.ok(tooltip instanceof vscode.MarkdownString);
      assert.equal(tooltip.isTrusted, false);
      assert.equal(tooltip.supportHtml, false);
      assert.match(tooltip.value, /Source: task/);
      assert.ok(!tooltip.value.includes('file:///'));
      assert.ok(!tooltip.value.includes('/TaskName'));
      assert.ok(!tooltip.value.includes('Lazy browsing'));
      assert.ok(tooltip.value.indexOf('Resting state') < tooltip.value.indexOf('Source:'));
      await config.update('participantLabelColumn', 'label', vscode.ConfigurationTarget.Workspace);
      await config.update('sessionLabelColumn', 'label', vscode.ConfigurationTarget.Workspace);
      await described(subject, 'Alice');
      await described(session, 'Follow-up');
      assert.equal(provider.getTreeItem(subject).label, '001');
      await vscode.commands.executeCommand('bidsExplorer.showDetails', subject);
      const details = JSON.parse(vscode.window.activeTextEditor!.document.getText()) as {
        treeDescription: {
          status: string;
          description: { evidence: { sourceUri: string; line: number; column: string }[] };
        };
      };
      assert.equal(details.treeDescription.status, 'ready');
      assert.equal(details.treeDescription.description.evidence[0].column, 'label');
      assert.equal(details.treeDescription.description.evidence[0].line, 2);
      assert.equal(
        details.treeDescription.description.evidence[0].sourceUri,
        vscode.Uri.file(join(folder, 'participants.tsv')).toString(),
      );
      await put('participants.tsv', 'participant_id\tlabel\nsub-001\tAlice\nsub-001\tOther');
      provider.refresh(subject);
      provider.getTreeItem(subject);
      await waitFor(() => provider.descriptionSnapshot(subject.entry)?.status === 'unavailable');
      assert.equal(provider.getTreeItem(subject).description, 'Participant');
      await put('task-rest_bold.json', '{"TaskName":"Updated rest"}');
      provider.refresh(element('sub-001/func'));
      await described(task, 'Updated rest');
      assert.equal(await readFile(join(folder, image), 'utf8'), 'MRI bytes must not be read');
      await put('derivatives/demo/dataset_description.json', '{"Name":"Pipeline study"}');
      await mkdir(join(folder, 'derivatives/demo/sub-001'), { recursive: true });
      await described(element('derivatives/demo'), 'Pipeline study');
      const derivativeSubject = element('derivatives/demo/sub-001');
      provider.getTreeItem(derivativeSubject);
      await waitFor(
        () => provider.descriptionSnapshot(derivativeSubject.entry)?.status === 'unavailable',
      );
      assert.equal(provider.getTreeItem(derivativeSubject).description, 'Participant');
    } finally {
      await config.update(
        'participantLabelColumn',
        previousParticipant,
        vscode.ConfigurationTarget.Workspace,
      );
      await config.update(
        'sessionLabelColumn',
        previousSession,
        vscode.ConfigurationTarget.Workspace,
      );
      if (root)
        await vscode.commands.executeCommand('bidsExplorer.removeDataset', provider.element(root));
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await rm(folder, { recursive: true, force: true });
    }
  });
  test('metadata reads never delay tree items and cancellation/disposal suppress late description updates', async () => {
    let release: (() => void) | undefined;
    const provider = new DatasetTreeProvider(
      new DatasetBrowser(new LocalDirectorySource()),
      () =>
        new Promise((resolve) => {
          release = () => resolve({ text: 'Late name', evidence: [] });
        }),
    );
    const item = provider.element({
      datasetUri: 'file:///synthetic',
      uri: 'file:///synthetic/sub-01',
      relativePath: 'sub-01',
      name: 'sub-01',
      kind: 'directory',
    });
    assert.equal(provider.getTreeItem(item).description, 'Participant');
    assert.equal(release, undefined);
    await waitFor(() => release !== undefined);
    provider.cancelPending();
    release!();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    assert.equal(provider.descriptionSnapshot(item.entry)?.status, 'unloaded');
    provider.dispose();
  });
});
