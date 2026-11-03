# BIDS Explorer

A VS Code extension in early development for navigating BIDS datasets and their derivatives.

- Repository/directory and extension identifier: `bids-explorer`
- Display name: **BIDS Explorer**
- Settings and command namespace: `bidsExplorer`

The development scaffold is in place; dataset browsing and archive readers are not implemented yet. See PROJECT.md (`PROJECT.md`) for the scope and decisions carried over from the Strata exploration.

## Pick up work here

1. Read PROJECT.md (`PROJECT.md`) for scope and decisions.
2. Read RESEARCH.md (`RESEARCH.md`) for exploration, options, lessons and source/test/sample references.
3. Read PLANS.md (`PLANS.md`) for implementation phases and readiness checks.
4. Consult the benchmark snapshot (`docs/evidence/niivue-vscode/REPORT.md`) and its provenance note (`docs/evidence/niivue-vscode/SNAPSHOT.md`).

The repository includes a TypeScript workspace extension, an empty Explorer view, and build/test tooling. Large samples, processing installations and caches remain in Strata. Local-only SSH test locations are in ignored `.local/strata-test-context.json`.

## Development

Install Node.js 22.23.4 (the version in `.nvmrc`; with nvm, run `nvm install` and `nvm use`) and VS Code 1.96 or newer. Then:

```sh
npm ci
npm run check
```

Open this folder in VS Code and press **F5** (`Run BIDS Explorer`). The watch task compiles TypeScript, then an Extension Development Host opens the small synthetic workspace. Expand **BIDS Explorer** in the Explorer sidebar. The empty welcome view and **BIDS Explorer: Refresh** command verify activation; they do not index data yet. Stop debugging to close the development host.

```sh
npm run test:integration  # Downloads VS Code 1.96 and runs extension-host tests
npm run package           # Creates dist/bids-explorer.vsix
```

The integration runner needs network access on its first run and a graphical session (CI uses Xvfb). If VS Code stable is already running and prevents CLI tests, close it or launch tests from VS Code's Extension Test Runner. Install the VSIX using **Extensions: Install from VSIX**. The `bids-explorer-dev` publisher is a development placeholder, not a Marketplace registration. No publication is configured. Packaging skips the license check for this private development preview; choose a license and real publisher before distribution.

## Architecture and remote development

- `src/core/`: VS Code-independent resource identity and dataset contracts.
- `src/ui/`: VS Code tree presentation; no filesystem scanning during rendering.
- `src/extension.ts`: activation, commands and disposable ownership.
- `src/test/unit/`: fast tests independent of VS Code.
- `src/test/integration/`: tests inside a real VS Code extension host.
- `test/fixtures/`: tiny synthetic metadata only; no private or real imaging data.

The manifest uses `extensionKind: ["workspace"]`. In a Remote SSH window, the extension runs on the remote workspace host. To develop there, open a checkout on the remote host with Remote SSH, install Node/dependencies there, and use the same F5 workflow. This scaffold does not initiate SSH connections. Verify the execution location with **Developer: Show Running Extensions**.

Future directory, ZIP, tarball and SquashFS adapters must preserve source URI/member identity separately from logical BIDS paths, report partial coverage, support cancellation and publish bounded background results. Archive readers and workers are not implemented. Detect extraction-tool availability on the workspace host when those adapters are added; no Python, tar or unsquashfs dependency is required by this scaffold. Keep indexes and image caches in VS Code-provided storage outside the checkout. NiiVue remains optional.

CI runs type checking, linting, unit tests, extension-host tests and VSIX packaging on Linux. Before shipping archive support, add local/Remote SSH validation with synthetic containers, duplicate source paths, cancellation and incomplete coverage.

### Dependency audit

The development toolchain currently has 18 npm audit findings (17 moderate, 1 low), including transitive glob/minimatch dependencies in the VS Code test and packaging tools. These development packages are excluded from the VSIX; the extension has no runtime npm dependencies. A `serialize-javascript` override selects a patched release for the test runner. Review upstream updates before release rather than applying `npm audit fix --force`, which proposes incompatible tool downgrades.
