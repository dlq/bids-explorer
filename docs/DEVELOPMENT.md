# Development guide

This is contributor documentation for BIDS Explorer. The root [README.md](../README.md) describes what users can actually do today. Commands below run from the repository root.

## Project context

1. Read [PROJECT.md](../PROJECT.md) for scope and decisions.
2. Read [RESEARCH.md](../RESEARCH.md) for exploration, options, lessons and source/test/sample references.
3. Read [PLANS.md](../PLANS.md) for proposed version milestones and readiness checks.
4. Consult the [benchmark snapshot](evidence/niivue-vscode/REPORT.md) and its [provenance note](evidence/niivue-vscode/SNAPSHOT.md).

Display name: **BIDS Explorer**; package/directory: `bids-explorer`; commands/settings namespace: `bidsExplorer`. Workspace settings include declared collection roots and optional participant/session label columns.

The repository includes a TypeScript workspace extension, a read-only directory browser, gradient and literal dataset-description previews, explicit selected-file JSON inheritance/DWI companion reports, bounded participant/session/scan tables and dictionaries, and build/test tooling. Directory registration and browsing are implemented. ZIP and tar browsing reuse completed inventories across reloads. Participant derivative branches and BIDS Availability support explicit links between registered raw and derivative datasets. SquashFS availability snapshots persist on the workspace host. ZIP/loose sources now share logical subject/session navigation, with original entries retained in `logical.sources`. ZIP inventory inspection and saved ZIP and tar placements are implemented; see [ZIP development notes](ZIP.md). Large samples, processing installations and caches remain in the separate Strata project. Local-only SSH test locations are in ignored `.local/strata-test-context.json`; read them only for an authorized test task.

## Prerequisites and setup

Install Node.js 22.23.4 (the version in `.nvmrc`; with nvm, run `nvm install` and `nvm use`) and VS Code 1.96 or newer. Then:

```sh
npm ci
npm run check             # Includes enforced unit coverage
```

Open this folder in VS Code and press **F5** (`Run BIDS Explorer`). The compound watch task compiles host TypeScript and browser ES modules in parallel, then an Extension Development Host opens the small synthetic workspace. Expand **BIDS** in the Explorer sidebar. The synthetic BIDS workspace should appear automatically, without invoking Add Dataset. Open another dataset as a workspace folder to exercise automatic recognition, or use **BIDS Explorer: Add Dataset** for an external/noncanonical directory. Expand participant/session/modality folders, open a JSON file, inspect Source Details, refresh one branch and remove its registration. These actions must not alter dataset contents. Stop debugging to close the development host.

```sh
npm run test:integration  # Downloads VS Code 1.96 and runs extension-host tests
npm run package           # Creates dist/bids-explorer-<version>.vsix
```

Packaging rebuilds `out/` from scratch and includes the NiiVue ESM bundle used by the viewer. Source files, alternate NiiVue builds, test output and local release artifacts stay out of the VSIX.

The integration runner needs network access on its first run and a graphical session (CI uses Xvfb). If VS Code stable is already running and prevents CLI tests, close it or launch tests from VS Code's Extension Test Runner. Install the VSIX using **Extensions: Install from VSIX**. The manifest uses the confirmed Marketplace publisher `MCIN-dlq`. The [Marketplace workflow](PUBLISHING.md) is prepared; its Marketplace trust policy is active. Packaging includes the MIT license and checks for it. The [initial CodeQL review](CODEQL_REVIEW.md) is complete; prepare a new authorized release before Marketplace publication.

The host and browser builds use `tsconfig.json` and `tsconfig.webview.json`. The portable gradient model and metadata message types are shared without a separate bundler; the built-in image viewer uses the packaged NiiVue library. Type-only metadata/snapshot/revision contracts are `.d.ts` modules, keeping Node IO/parsing out of browser imports. `npm run build` and `npm run typecheck` cover both; F5 starts `watch:host` and `watch:webview`. The packaged preview loads its ESM entry and model from `out/browser/`, with styles in `media/`. The metadata entry is `out/browser/webview/metadataClient.js` and the table entry is `out/browser/webview/tableClient.js`; parsing runs on the host, using the shared bounded text reader and a lossless field scanner. Selected-file syntax/resource checks do not invoke a BIDS validator.

To test an existing VS Code installation, set `BIDS_EXPLORER_TEST_VSCODE_PATH` to its absolute executable path before running `npm run test:integration`. This was used for current macOS VS Code, whose executable is named `Code` rather than the test downloader’s assumed `Electron`. The default still tests 1.96.0.

## Architecture and remote development

- `src/extension.ts`: activation, commands and disposable ownership.
- `src/core/`: VS Code-independent dataset models, parsers and resource identity.
- `src/sources/`: workspace-host readers, archive adapters and caches.
- `src/ui/`: extension-host tree providers, commands' presentation helpers and webview panel lifecycle.
- `src/webview/`: browser-side preview scripts. The browser build emits these and their shared modules into `out/browser/`.
- `media/`: packaged styles and icons.
- `src/test/unit/`: fast tests independent of VS Code.
- `src/test/integration/`: tests inside a real VS Code extension host.
- `test/fixtures/`: tiny synthetic metadata only; no private or real imaging data.

Use lower camel case for TypeScript module filenames and variables, PascalCase for classes and types, and `*.test.ts` for test suites. Name host modules for the role they own, such as `datasetTreeProvider.ts`, and browser entry points for the preview they render, such as `metadataClient.ts`. Use `bidsExplorer.<action>` for command IDs and keep registered IDs aligned with the manifest.

The manifest uses `extensionKind: ["workspace"]`. In a Remote SSH window, the extension runs on the remote workspace host. To develop there, open a checkout on the remote host with Remote SSH, install Node/dependencies there, and use the same F5 workflow. The runtime does not initiate SSH connections. Verify the execution location with **Developer: Show Running Extensions**.

The directory, ZIP and tar adapters, and the SquashFS adapter, must preserve source URI/member identity separately from logical BIDS paths, report partial coverage, support cancellation and publish bounded background results. The directory source uses asynchronous filesystem IO and cooperative batched ordering on the workspace host. ZIP central-directory indexing uses bundled `yauzl` and its dependency `pend` on the workspace host. The ZIP adapter indexes only expanded containers and retains physical source choices beneath the logical tree. Selected MRI extraction uses a private workspace-host cache with bounded streaming and CRC/revision checks; dedicated indexing workers remain future work. Archive text has read-only `bids-zip`, `bids-tar` and `bids-squashfs` content providers and uses the existing packaged preview clients. The [tar reader](TAR.md) uses bounded sequential streams. See [ZIP development notes](ZIP.md) for supported methods, limits and cache lifetime. Archive access requires no external Python, tar or unsquashfs installation. Keep indexes and image caches in VS Code-provided storage outside the checkout. The standalone NiiVue extension is an optional editor choice; the built-in viewer uses the bundled library.

The configured CI workflow runs formatting, type checking, linting, unit coverage, extension-host tests, security checks and VSIX packaging on Linux. Hosted CI has not yet been exercised. Repeat the synthetic archive, cancellation and coverage checks when changing adapters. The [compatibility matrix](COMPATIBILITY.md) separates installed-package checks from real Remote SSH and scale observations.

### Dependency audit

On November 7, 2026, the release dependency audit reported 14 findings (13 moderate, 1 low), all in development tooling; none were high or critical. The production-only audit reported zero findings for runtime dependencies, including the ZIP reader and built-in viewer. Development packages remain excluded from the VSIX. The earlier 0.2.0 release evidence retains its audit snapshot. A `serialize-javascript` override selects a patched release for the test runner. Review upstream updates before release rather than applying `npm audit fix --force`, which proposes incompatible tool downgrades.

### Persistent archive inventories

ZIP and tar tree browsing stores completed member inventories in `archive-inventories-v1` under the extension workspace storage directory on the workspace host. A source URI and its device, inode, size, modification time and change time must still match before an inventory can be reused. Refresh drops in-memory branch data and checks the source again. A missing or unreadable source cannot be browsed from this cache.

The cache uses 64 slots of at most 4 MiB each. Sources mapping to the same slot replace the prior entry. Incompatible, oversized or unreadable entries are treated as cache misses. Writes use a private temporary file and publish by rename. The inventory stores member names and metadata. MRI payloads use the separate extracted image cache. SquashFS browsing continues to read bounded directory pages directly from the source.

A local restart probe used separate processes for the cold read, warm read and a same-size ZIP replacement. The warm process reused both the ZIP and gzip tar inventories. The replacement invalidated only the ZIP. A separate regression cancels a write before publication and verifies that the previous inventory remains readable and the temporary file is removed.

The same cold, warm and replacement sequence passed in separate SSH sessions on Rorqual using a synthetic ZIP and gzip tar. VS Code Remote SSH created both inventories in remote workspace storage. After closing the remote connection, we reopened the same synthetic workspace in a fresh development host. BIDS Explorer listed both archives' members again, and both inventory files retained their inode and modification time. The reconnect used the authenticated SSH session established through VS Code's Duo prompt. A separate worker interruption test verified retry and cleanup after abrupt process termination. [0.6.0 validation](MILESTONE_0.6.0.md)

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

The current manifest version is `1.0.1`, prepared for release as `v1.0.1` with public source at [dlq/bids-explorer](https://github.com/dlq/bids-explorer) and Marketplace automation configured. [PLANS.md](../PLANS.md) assigns proposed minor milestones through `1.0.0`; [VERSIONING.md](../VERSIONING.md) defines release conventions. The manifest version determines VSIX filenames such as `bids-explorer-1.0.1.vsix` and release tags such as `v1.0.1`. Ordinary development stays in the changelog's Unreleased section until an actual release is prepared.

## Public dataset smoke tests

See [TEST_DATA.md](TEST_DATA.md) for the downloaded ds000003 anatomical subset and full ds000114 public inventory, provenance, verification and opt-in test boundaries. Both are outside the repository and are not used by ordinary automated tests. The local source adapter has been smoke-tested against both; see [LOCAL_BROWSER_TESTING.md](LOCAL_BROWSER_TESTING.md).

See [0.7.0 release validation](../PLANS.md#070--dataset-overview-and-exploration) for the Rorqual availability and cache measurements.

Tree descriptions use a VS Code-independent bounded work queue and source-backed JSON/table selectors. The extension passes a loader to the tree provider; getTreeItem never awaits metadata. Native tree-change events update individual entries after publication. Participant/session column settings are resource-scoped and default to empty. Source Details includes description snapshots/provenance. New metadata sources must retain ambiguity rules, bounds, cancellation and refresh/generation checks; shared/persistent metadata caching and large/SSH throughput remain future work.

History and the inherited-metadata inspector use `DocumentPreviewManager` with `out/browser/webview/documentClient.js`. The host supplies bounded records and captured source/action choices; the browser only renders text and dispatches fixed actions. The history parser and inherited-gradient source resolver remain VS Code-independent and unit-tested. Reload failures retain prior snapshots. Release observations and limitations live in [MILESTONE_0.2.0.md](MILESTONE_0.2.0.md).

## Usability checks

Use synthetic studies for keyboard and theme checks. Verify the installed package as well as development-host behavior, particularly around Workspace Trust. Exercise light, dark and high-contrast themes. Check the rendered page, accessible names, table headers, keyboard focus and filter/paging results. A successful accessibility-tree inspection does not establish spoken screen-reader usability.

The [usability record](USABILITY.md) lists checked workflows and the limits of the sampled usability evidence. Keep user instructions in the README and Explorer reference, with study terminology and exact visible action labels.

See [Publishing](PUBLISHING.md) for CodeQL, Dependabot and tagged-release Marketplace automation.

## Dependency updates

Dependabot groups development-tool minor/patch updates and routine action minor/patch updates separately. Major toolchain changes and production-library changes remain individual reviews; there is no blanket auto-merge. Keep `@types/vscode` at the minimum supported API version (`1.96.0`) until `engines.vscode` is deliberately raised, and keep Node types on the selected Node 22 toolchain. TypeScript versions `>=6.1.0` are temporarily excluded because the current `typescript-eslint` peer range ends below 6.1; revise that exclusion alongside a compatible parser/toolchain.

The reviewed maintenance update uses the official v7 checkout, setup-node, setup-python and upload-artifact actions, pinned to commit SHAs, and updates `@vscode/test-cli` from 0.0.12 to 0.0.15 (Node 22 or newer). TypeScript 7, ESLint 10, c8 12 and test-electron 3 are not part of this combined update. Require clean installation, coverage, integration, security, packaging and hosted CodeQL/CI before merging.

CI runs the minimum supported VS Code 1.96 and current stable on Linux, alongside quality/package and security jobs. The aggregate `check` status requires quality and both integration jobs to succeed. Separate coverage artifacts identify each version. Publishing verification also runs both versions.

Headless CI sets `BIDS_EXPLORER_TEST_SOFTWARE_WEBGL=1` to launch only the disposable test host with Chromium’s [SwiftShader WebGL flags](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md). This explicit software-rendering opt-in is for trusted test content on GPU-less runners; it does not change the installed extension or normal VS Code launches.
