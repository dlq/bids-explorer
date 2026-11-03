# Development guide

This is contributor documentation for the locally tagged `v0.1.0` milestone. The root [README.md](../README.md) describes what users can actually do today. Commands below run from the repository root.

## Project context

1. Read [PROJECT.md](../PROJECT.md) for scope and decisions.
2. Read [RESEARCH.md](../RESEARCH.md) for exploration, options, lessons and source/test/sample references.
3. Read [PLANS.md](../PLANS.md) for proposed version milestones and readiness checks.
4. Consult the [benchmark snapshot](evidence/niivue-vscode/REPORT.md) and its [provenance note](evidence/niivue-vscode/SNAPSHOT.md).

Display name: **BIDS Explorer**; package/directory: `bids-explorer`; commands/settings namespace: `bidsExplorer`. The namespace is reserved for future settings; none are contributed yet.

The repository includes a TypeScript workspace extension, a read-only local directory browser, and build/test tooling. Directory registration and browsing are implemented; inherited metadata, archive readers and persistent indexing are not. Large samples, processing installations and caches remain in the separate Strata project. Local-only SSH test locations are in ignored `.local/strata-test-context.json`; read them only for an authorized test task.

## Prerequisites and setup

Install Node.js 22.23.4 (the version in `.nvmrc`; with nvm, run `nvm install` and `nvm use`) and VS Code 1.96 or newer. Then:

```sh
npm ci
npm run check             # Includes enforced unit coverage
```

Open this folder in VS Code and press **F5** (`Run BIDS Explorer`). The compound watch task compiles host TypeScript and browser ES modules in parallel, then an Extension Development Host opens the small synthetic workspace. Expand **BIDS Explorer** in the Explorer sidebar. The synthetic BIDS workspace should appear automatically, without invoking Add Dataset. Open another dataset as a workspace folder to exercise automatic recognition, or use **BIDS Explorer: Add Dataset** for an external/noncanonical directory. Expand participant/session/modality folders, open a JSON file, inspect Source Details, refresh one branch and remove its registration. These actions must not alter dataset contents. Stop debugging to close the development host.

```sh
npm run test:integration  # Downloads VS Code 1.96 and runs extension-host tests
npm run package           # Creates dist/bids-explorer-<version>.vsix
```

The integration runner needs network access on its first run and a graphical session (CI uses Xvfb). If VS Code stable is already running and prevents CLI tests, close it or launch tests from VS Code's Extension Test Runner. Install the VSIX using **Extensions: Install from VSIX**. The `bids-explorer-dev` publisher is a development placeholder, not a Marketplace registration. No publication is configured. Packaging skips the license check for this private development preview; choose a license and real publisher before distribution.

The host and browser builds use `tsconfig.json` and `tsconfig.webview.json`. The portable gradient model is shared without a bundler or runtime dependencies. `npm run build` and `npm run typecheck` cover both; F5 starts `watch:host` and `watch:webview`. The packaged preview loads its ESM entry and model from `out/webview/`, with styles in `media/`.

To test an existing VS Code installation, set `BIDS_EXPLORER_TEST_VSCODE_PATH` to its absolute executable path before running `npm run test:integration`. This was used for current macOS VS Code, whose executable is named `Code` rather than the test downloader’s assumed `Electron`. The default still tests 1.96.0.

## Architecture and remote development

- `src/core/`: VS Code-independent resource identity and dataset contracts.
- `src/ui/`: VS Code tree and read-only gradient webview presentation; no filesystem scanning during rendering.
- `src/extension.ts`: activation, commands and disposable ownership.
- `src/test/unit/`: fast tests independent of VS Code.
- `src/test/integration/`: tests inside a real VS Code extension host.
- `test/fixtures/`: tiny synthetic metadata only; no private or real imaging data.

The manifest uses `extensionKind: ["workspace"]`. In a Remote SSH window, the extension runs on the remote workspace host. To develop there, open a checkout on the remote host with Remote SSH, install Node/dependencies there, and use the same F5 workflow. The runtime does not initiate SSH connections. Verify the execution location with **Developer: Show Running Extensions**.

The directory adapter and future ZIP, tarball and SquashFS adapters must preserve source URI/member identity separately from logical BIDS paths, report partial coverage, support cancellation and publish bounded background results. The directory source uses asynchronous filesystem IO and cooperative batched ordering on the workspace host. Archive readers and dedicated indexing workers are not implemented. Detect extraction-tool availability on the workspace host when those adapters are added; no Python, tar or unsquashfs dependency is required by the runtime. Keep indexes and image caches in VS Code-provided storage outside the checkout. NiiVue remains optional.

The configured CI workflow runs formatting, type checking, linting, unit coverage, extension-host tests, security checks and VSIX packaging on Linux. Hosted CI has not yet been exercised. Before shipping archive support, add local/Remote SSH validation with synthetic containers, duplicate source paths, cancellation and incomplete coverage.

### Dependency audit

The development toolchain currently has 18 npm audit findings (17 moderate, 1 low), including transitive glob/minimatch dependencies in the VS Code test and packaging tools. These development packages are excluded from the VSIX; the extension has no runtime npm dependencies. A `serialize-javascript` override selects a patched release for the test runner. Review upstream updates before release rather than applying `npm audit fix --force`, which proposes incompatible tool downgrades.

## Testing expectations

See [TESTING.md](../TESTING.md) for coverage thresholds, test layers and feature acceptance expectations. Run `npm run check` and `npm run test:integration` before submitting behavior changes.

## Formatting and linting

Install the workspace's recommended Prettier and ESLint extensions. Workspace settings enable format on save and ESLint fixes on explicit save. Prettier owns formatting; ESLint checks code correctness, including TypeScript rules that detect unhandled promises. `.editorconfig` defines whitespace defaults.

```sh
npm run format        # Format source, configuration and documentation
npm run format:check  # Check formatting without changing files
npm run lint          # Type-aware ESLint checks; warnings fail
npm run lint:fix      # Apply available ESLint fixes
npm run check         # Formatting, types, linting and unit coverage
```

CI runs the same checks. Generated output, caches, local state and imported benchmark evidence are excluded from formatting. No Git hooks are required; run checks before committing.

## Security checks

Run `npm run security` (requires uv) and `npm audit --audit-level=high` alongside `npm run check`. See [SECURITY.md](../SECURITY.md) for the pinned Semgrep setup, rule limitations, dependency checks and GitHub setup steps.

## Versioning

The current manifest version is `0.1.0`, tagged locally as `v0.1.0` without Marketplace or GitHub publication. [PLANS.md](../PLANS.md) assigns proposed minor milestones through `1.0.0`; [VERSIONING.md](../VERSIONING.md) defines release conventions. The manifest version determines VSIX filenames such as `bids-explorer-0.1.0.vsix` and release tags such as `v0.1.0`. Ordinary development stays in the changelog's Unreleased section until an actual release is prepared.

## Public dataset smoke tests

See [TEST_DATA.md](TEST_DATA.md) for the downloaded ds000003 anatomical subset and full ds000114 public inventory, provenance, verification and opt-in test boundaries. Both are outside the repository and are not used by ordinary automated tests. The local source adapter has been smoke-tested against both; see [LOCAL_BROWSER_TESTING.md](LOCAL_BROWSER_TESTING.md).

See [0.1.0 milestone validation](MILESTONE_0.1.0.md) for current test results, the authorized Remote SSH/MRI smoke test and measured cache behavior.
