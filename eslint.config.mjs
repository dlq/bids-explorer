import tseslint from 'typescript-eslint';
export default tseslint.config(...tseslint.configs.recommended, { ignores: ['out/**', 'dist/**', '.vscode-test/**'] });
