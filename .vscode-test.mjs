import { defineConfig } from '@vscode/test-cli';
export default defineConfig({ files: 'out/test/integration/**/*.test.js', version: '1.96.0', workspaceFolder: './test/fixtures/bids', launchArgs: ['--disable-extensions', '--skip-welcome', '--skip-release-notes'] });
