import { defineConfig } from '@vscode/test-cli';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// A disposable workspace file keeps native folder handoff from reloading the test host
// or writing temporary workspace paths into the checked-in fixture directory.
const temporary = mkdtempSync(join(tmpdir(), 'bids-extension-tests-'));
const workspace = join(temporary, 'explorer.code-workspace');
writeFileSync(workspace, JSON.stringify({ folders: [{ path: resolve('test/fixtures/bids') }] }));
process.once('exit', () => rmSync(temporary, { recursive: true, force: true }));

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  version: '1.96.0',
  useInstallation: process.env.BIDS_EXPLORER_TEST_VSCODE_PATH
    ? { fromPath: process.env.BIDS_EXPLORER_TEST_VSCODE_PATH }
    : undefined,
  coverage: {
    include: ['src/**/*.ts'],
    exclude: ['src/test/**'],
    includeAll: true,
    reporter: ['text', 'html', 'lcov'],
  },
  workspaceFolder: workspace,
  launchArgs: [
    '--user-data-dir=' + join(temporary, 'user-data'),
    '--extensions-dir=' + join(temporary, 'extensions'),
    // Headless CI has no GPU; opt in only for trusted synthetic test content.
    ...(process.env.BIDS_EXPLORER_TEST_SOFTWARE_WEBGL === '1'
      ? ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader']
      : []),
    '--disable-extensions',
    '--skip-welcome',
    '--skip-release-notes',
  ],
});
