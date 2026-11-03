# BIDS Explorer

A VS Code extension being built to explore BIDS neuroimaging datasets and their derivatives, locally and over SSH, in directories, ZIP archives, tarballs and SquashFS images.

**Status: unreleased development scaffold (`0.0.1`). Dataset browsing is not available yet.** There is no Marketplace release or public installation link.

## Available today

- A **BIDS Explorer** view in VS Code's Explorer sidebar, showing a welcome message.
- **BIDS Explorer: Refresh**, available from the Command Palette, which refreshes the empty view.

The extension does not yet register datasets, scan files, extract archives or open images. It contributes no settings. The workspace-host configuration is in place for Remote SSH, but remote dataset workflows have not been validated.

## Planned capabilities

These are roadmap targets, not features in the current build:

| Proposed version | Planned capability                                                             |
| ---------------- | ------------------------------------------------------------------------------ |
| `0.1.0`          | Register and browse local dataset directories; open selected files             |
| `0.2.0`          | BIDS-aware grouping and inherited metadata                                     |
| `0.3.0`–`0.5.0`  | ZIP, tarball and SquashFS browsing, including declared archive collections     |
| `0.6.0`          | Validated Remote SSH workflows and persistent indexing                         |
| `0.7.0`          | Coverage-aware summaries, filters and participant/session availability         |
| `0.8.0`–`0.9.0`  | Optional viewer handoff, distribution preparation and stabilization            |
| `1.0.0`          | Supported, reliable core workflows across documented storage formats and hosts |

The intended browser will preserve original source paths and conflicting source choices, distinguish unindexed data from missing data, and keep a physical-file view alongside its BIDS interpretation. NiiVue integration is optional and remains unimplemented. Release targets may change as development proceeds.

## Trying the development build

A locally built VSIX can be installed for a preview of the scaffold:

1. Use VS Code **1.96 or newer** in a trusted workspace.
2. Run **Extensions: Install from VSIX** and select `bids-explorer-0.0.1.vsix` from the local build output.
3. Open the Explorer sidebar and expand **BIDS Explorer** to see its welcome message.
4. Run **BIDS Explorer: Refresh** from the Command Palette to refresh the view.

There is no Add Dataset command yet. No archive tools or NiiVue installation are required for this build. Untrusted and virtual workspaces are not supported. This is a desktop extension scaffold; browser-only VS Code is not a supported target.

For instructions to build the VSIX or run it in a development host, see `docs/DEVELOPMENT.md` in the repository.

## Data and limitations

The current runtime does not read or modify datasets, extract files, create dataset caches, or initiate network transfers. It has no telemetry implementation. Those statements describe the scaffold only; storage, tool requirements and data handling will be documented as features are implemented.

BIDS interpretation and validation are separate concerns. Planned navigation must not be taken as proof that a dataset conforms to BIDS.

## Documentation and feedback

- `CHANGELOG.md`: implemented changes; all work is currently Unreleased.
- `PLANS.md`: proposed versions and readiness checks.
- `docs/DEVELOPMENT.md`: contributor setup, checks and packaging.
- `SECURITY.md`: development security checks and future vulnerability-reporting setup.

A public issue tracker and private vulnerability-reporting channel will be linked when the GitHub repository is available. Do not share private datasets, credentials or sensitive clinical information in public reports.
