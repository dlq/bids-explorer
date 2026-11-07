import { extensionId } from '../extensionId';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { activate } from '../../extension';
import type { DirectoryEntry } from '../../core/directory';

suite('Participant derivatives view', () => {
  test('shows raw sessions once and participant derivative pipelines with original resources, retaining the dataset pipeline view', async () => {
    const extension = vscode.extensions.getExtension<ReturnType<typeof activate>>(extensionId)!;
    const api = await extension.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-participant-view-host-'));
    let root: DirectoryEntry | undefined;
    try {
      const paths = [
        'sub-01/ses-1/anat',
        'derivatives/pipeline-a/sub-01/ses-2/anat',
        'derivatives/pipeline-b/sub-02/anat',
      ];
      for (const path of paths) await mkdir(join(folder, path), { recursive: true });
      await writeFile(join(folder, paths[1], 'sub-01_ses-2_T1w.json'), '{"Test":true}');
      root = await vscode.commands.executeCommand(
        'bidsExplorer.addDataset',
        vscode.Uri.file(folder),
      );
      assert.ok(root);
      await writeFile(join(folder, paths[0], 'sub-01_ses-1_T1w.nii'), '');
      const roots = await api.provider.getChildren(api.provider.element(root));
      const subject = roots.find((row) => row.type === 'entry' && row.entry.name === 'sub-01');
      assert.ok(subject);
      const subjectChildren = await api.provider.getChildren(subject);
      assert.ok(!subjectChildren.some((row) => row.type === 'overview'));
      const rawSession = subjectChildren.find(
        (row) => row.type === 'entry' && row.entry.name === 'ses-1',
      )!;
      const derivedSession = subjectChildren.find(
        (row) => row.type === 'entry' && row.entry.name === 'ses-2',
      )!;
      assert.ok(derivedSession.type === 'entry' && derivedSession.derivativeOnly);
      assert.match(
        String(api.provider.getTreeItem(derivedSession).description),
        /derivative sources/,
      );
      const [overview] = await api.provider.getChildren(derivedSession);
      assert.equal(api.provider.getTreeItem(overview).label, 'Derivatives');
      assert.equal(
        api.provider.getTreeItem(overview).accessibilityInformation?.label,
        'Derivatives for session 2',
      );
      const groups = await api.provider.getChildren(overview);
      assert.deepEqual(
        groups.map((row) => api.provider.getTreeItem(row).label),
        ['pipeline-a'],
      );
      assert.equal(api.provider.getParent(overview), derivedSession);
      assert.equal(api.provider.getParent(groups[0]), overview);
      assert.equal(api.provider.getTreeItem(groups[0]).description, 'Pipeline');
      assert.equal(api.provider.getTreeItem(rawSession).label, '1');
      assert.equal(api.provider.getTreeItem(derivedSession).label, '2');
      assert.equal(
        subjectChildren.filter((row) => row.type === 'entry' && row.entry.name === 'ses-1').length,
        1,
      );
      assert.ok(
        !(await api.provider.getChildren(rawSession)).some((row) => row.type === 'overview'),
      );
      const [anat] = await api.provider.getChildren(groups[0]);
      const [metadata] = await api.provider.getChildren(anat);
      const item = api.provider.getTreeItem(metadata);
      assert.equal(item.resourceUri?.fsPath, join(folder, paths[1], 'sub-01_ses-2_T1w.json'));
      assert.equal(item.command?.command, 'bidsExplorer.openFile');
      assert(roots.some((row) => row.type === 'entry' && row.entry.name === 'derivatives'));
      assert.equal(api.provider.getParent(subject)?.type, 'entry');
      await writeFile(join(folder, paths[1], 'sub-01_ses-2_T1w.nii'), '');
      for (const [participant, session] of [
        ['01', '2'],
        ['02', '1'],
        ['02', '2'],
      ]) {
        const path = join(folder, `sub-${participant}`, `ses-${session}`, 'anat');
        await mkdir(path, { recursive: true });
        await writeFile(join(path, `sub-${participant}_ses-${session}_T1w.nii`), '');
      }
      api.provider.refresh();
      const refreshed = await api.provider.getChildren(subject);
      const matchedSession = refreshed.find(
        (row) => row.type === 'entry' && row.entry.name === 'ses-2',
      )!;
      assert.ok(matchedSession.type === 'entry' && !matchedSession.derivativeOnly);
      const matchedChildren = await api.provider.getChildren(matchedSession);
      assert.ok(matchedChildren.some((row) => row.type === 'entry' && row.entry.name === 'anat'));
      assert.ok(matchedChildren.some((row) => row.type === 'overview'));
      assert.ok(!refreshed.some((row) => row.type === 'overview'));
      const panel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
        'bidsExplorer.showAvailability',
        api.provider.element(root),
      );
      assert.ok(panel);
      try {
        for (
          let attempt = 0;
          attempt < 100 && !panel.webview.html.includes('Snapshot ready.');
          attempt++
        )
          await setTimeout(25);
        const html = panel.webview.html;
        assert.match(html, /Snapshot ready\. 2 participants indexed\./);
        assert.doesNotMatch(html, /data-page="/);
        assert.match(html, /data-view="sessions" aria-pressed="true">By session/);
        assert.match(html, /data-view="modality" aria-pressed="false">By modality/);
        assert.match(html, /data-view="pipeline" aria-pressed="false">By pipeline/);
        assert.match(html, /name="raw" value="ses-2"/);
        assert.match(html, /name="raw" value="ses-1"/);
        assert.match(html, /2 confirmed matches among 2 indexed participants/);
        assert.equal(html.match(/data-participant="0"/g)?.length, 1);
        assert.match(html, /<option value="pipeline-a">pipeline-a<\/option>/);
        assert.match(
          html,
          /<th scope="col">Raw · ses-1<\/th><th scope="col">Raw · ses-2<\/th><th scope="col">Derivatives · No session<\/th><th scope="col">Derivatives · ses-1<\/th><th scope="col">Derivatives · ses-2<\/th>/,
        );
        assert.match(
          html,
          /data-participant="0">sub-01<\/button><\/th><td>Missing<\/td><td><strong>anat<\/strong><\/td><td><strong>anat<\/strong><\/td><td><div data-source="1">pipeline-a · Missing<\/div><div data-source="2">pipeline-b · Missing<\/div><\/td><td><div data-source="1">pipeline-a · Missing<\/div><div data-source="2">pipeline-b · Missing<\/div><\/td><td><div data-source="1">pipeline-a · <strong>anat<\/strong>/,
        );
      } finally {
        panel.dispose();
      }
      const settings = vscode.workspace.getConfiguration('bidsExplorer');
      const setting = 'derivativeDatasets';
      const original = settings.inspect(setting)?.workspaceValue;
      const externalPath = join(folder, 'separate-preproc');
      const externalAnat = join(externalPath, 'sub-01', 'anat');
      await mkdir(externalAnat, { recursive: true });
      await writeFile(join(externalAnat, 'sub-01_T1w.nii'), '');
      await mkdir(join(externalPath, 'sub-01', 'ses-1', 'anat'), { recursive: true });
      await writeFile(join(externalPath, 'sub-01', 'ses-1', 'anat', 'sub-01_ses-1_T1w.nii'), '');
      const external = await vscode.commands.executeCommand<DirectoryEntry>(
        'bidsExplorer.addDataset',
        vscode.Uri.file(externalPath),
      );
      assert.ok(external);
      try {
        await settings.update(
          setting,
          { [root.datasetUri]: [external.datasetUri] },
          vscode.ConfigurationTarget.Workspace,
        );
        const linkedOverview = (await api.provider.getChildren(subject)).find(
          (row) => row.type === 'overview',
        )!;
        assert.equal(
          api.provider.getTreeItem(linkedOverview).label,
          'Derivatives without a session',
        );
        const linked = (await api.provider.getChildren(linkedOverview)).find(
          (row) => row.type === 'entry' && row.entry.datasetUri === external.datasetUri,
        );
        assert.ok(linked);
        const sessionlessChildren = await api.provider.getChildren(linked);
        assert.ok(
          !sessionlessChildren.some(
            (row) => row.type === 'entry' && row.entry.logical?.kind === 'session',
          ),
        );
        const [linkedAnat] = sessionlessChildren;
        const [image] = await api.provider.getChildren(linkedAnat);
        assert.equal(
          api.provider.getTreeItem(image).resourceUri?.fsPath,
          join(externalAnat, 'sub-01_T1w.nii'),
        );
        const linkedPanel = await vscode.commands.executeCommand<vscode.WebviewPanel>(
          'bidsExplorer.showAvailability',
          api.provider.element(root),
        );
        assert.ok(linkedPanel);
        try {
          for (
            let attempt = 0;
            attempt < 100 && !linkedPanel.webview.html.includes('Snapshot ready.');
            attempt++
          )
            await setTimeout(25);
          assert.ok(linkedPanel.webview.html.includes(`separate-preproc (${external.datasetUri})`));
          assert.match(linkedPanel.webview.html, /separate-preproc .* · <strong>anat<\/strong>/);
        } finally {
          linkedPanel.dispose();
        }
        await settings.update(setting, {}, vscode.ConfigurationTarget.Workspace);
        assert(
          !(await api.provider.getChildren(linkedOverview)).some(
            (row) => row.type === 'entry' && row.entry.datasetUri === external.datasetUri,
          ),
        );
      } finally {
        await settings.update(setting, original, vscode.ConfigurationTarget.Workspace);
        await vscode.commands.executeCommand(
          'bidsExplorer.removeDataset',
          api.provider.element(external),
        );
      }
    } finally {
      if (root)
        await vscode.commands.executeCommand(
          'bidsExplorer.removeDataset',
          api.provider.element(root),
        );
      await rm(folder, { recursive: true, force: true });
    }
  });
});
