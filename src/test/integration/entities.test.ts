import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { DatasetBrowser } from '../../core/browser';
import { LocalDirectorySource } from '../../sources/localDirectory';
import { DatasetTreeProvider, type EntryElement } from '../../ui/datasetTree';
import type { EntryInterpretation } from '../../core/entities';

async function details(element: EntryElement): Promise<EntryInterpretation> {
  await vscode.commands.executeCommand('bidsExplorer.showDetails', element);
  const doc: unknown = JSON.parse(vscode.window.activeTextEditor!.document.getText());
  assert.ok(doc && typeof doc === 'object' && 'entityInterpretation' in doc);
  return doc.entityInterpretation as EntryInterpretation;
}
function named(
  rows: readonly import('../../ui/datasetTree').TreeElement[],
  name: string,
): EntryElement {
  const item = rows.find((row) => row.type === 'entry' && row.entry.name === name);
  assert.ok(item && item.type === 'entry', `Expected visible physical entry ${name}`);
  return item;
}

suite('Source-backed entity interpretation', () => {
  test('combined and canonical folders coexist; filename-only sessions and conflicts remain explicit in source details', async function () {
    this.timeout(20000);
    await vscode.extensions.getExtension('bids-explorer-dev.bids-explorer')!.activate();
    const folder = await mkdtemp(join(tmpdir(), 'bids-entities-host-'));
    const provider = new DatasetTreeProvider(new DatasetBrowser(new LocalDirectorySource()));
    const paths = [
      'sub-01_ses-02/anat/sub-01_ses-02_T1w.json',
      'sub-01_ses-02/anat/sub-99_ses-02_T1w.json',
      'sub-01/ses-02/anat/sub-01_ses-02_T1w.json',
      'sub-01/sub-01_ses-03_bold.json',
      'derivatives/sub-77_ses-88/sub-01/anat/sub-01_desc-preproc_T1w.json',
    ];
    try {
      for (const path of paths) {
        await mkdir(join(folder, ...path.split('/').slice(0, -1)), { recursive: true });
        await writeFile(join(folder, path), '{}\n');
      }
      const root = provider.browser.register(
        await provider.browser.source.root(vscode.Uri.file(folder).toString()),
      );
      const top = await provider.getChildren(provider.element(root));
      const combined = named(top, 'sub-01_ses-02'),
        canonical = named(top, 'sub-01');
      assert.equal(provider.getTreeItem(combined).description, 'Participant / session (combined)');
      assert.equal((provider.getTreeItem(combined).iconPath as vscode.ThemeIcon).id, 'person');
      assert.equal(combined.entry.relativePath, 'sub-01_ses-02');
      const combinedFiles = await provider.getChildren(
        named(await provider.getChildren(combined), 'anat'),
      );
      const file = named(combinedFiles, 'sub-01_ses-02_T1w.json');
      const interpreted = await details(file);
      assert.equal(interpreted.source.uri, file.entry.uri);
      assert.equal(interpreted.suggestedContext?.subject, '01');
      assert.equal(interpreted.suggestedContext?.session, '02');
      assert.equal(interpreted.entities[1].evidence[0].origin, 'combined-folder');
      const canonicalRows = await provider.getChildren(canonical);
      const session = named(canonicalRows, 'ses-02');
      const canonicalFile = named(
        await provider.getChildren(named(await provider.getChildren(session), 'anat')),
        'sub-01_ses-02_T1w.json',
      );
      const canonicalDetails = await details(canonicalFile);
      assert.equal(canonicalDetails.suggestedContext?.key, interpreted.suggestedContext?.key);
      assert.notEqual(canonicalFile.entry.uri, file.entry.uri);
      assert.notEqual(provider.getTreeItem(canonicalFile).id, provider.getTreeItem(file).id);
      const direct = await details(named(canonicalRows, 'sub-01_ses-03_bold.json'));
      assert.deepEqual(direct.suggestedContext?.filenameOnly, ['ses']);
      assert.equal(direct.suggestedContext.session, '03');
      const conflict = await details(named(combinedFiles, 'sub-99_ses-02_T1w.json'));
      assert.equal(conflict.suggestedContext, undefined);
      assert.equal(conflict.entities.find((entity) => entity.key === 'sub')?.status, 'conflict');
      const pipeline = named(
        await provider.getChildren(named(top, 'derivatives')),
        'sub-77_ses-88',
      );
      assert.equal(provider.getTreeItem(pipeline).description, 'Pipeline');
      const pipelineSubject = named(await provider.getChildren(pipeline), 'sub-01');
      const pipelineFile = named(
        await provider.getChildren(named(await provider.getChildren(pipelineSubject), 'anat')),
        'sub-01_desc-preproc_T1w.json',
      );
      const derived = await details(pipelineFile);
      assert.equal(derived.scope?.pipelineName, 'sub-77_ses-88');
      assert.equal(
        derived.entities.some((entity) => entity.key === 'ses'),
        false,
      );
      assert.notEqual(derived.suggestedContext?.key, interpreted.suggestedContext?.key);
      for (const path of paths) assert.equal(await readFile(join(folder, path), 'utf8'), '{}\n');
    } finally {
      provider.dispose();
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await rm(folder, { recursive: true, force: true });
    }
  });
});
