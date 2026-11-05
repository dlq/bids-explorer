# Changelog

Record new changes under Unreleased. Released versions use `major.minor.patch`, tags `vX.Y.Z` and dated headings; see VERSIONING.md. Planned work belongs in PLANS.md. Version `0.5.0` is a local tagged release (`v0.5.0`).

## Unreleased

## [0.5.0] - 2026-11-05

### Added

- **Inspect SquashFS Image** reads the fixed-size SquashFS 4.0 header and reports image information without scanning members.
- **Browse SquashFS Image** pages through one directory at a time, with revision-checked continuations and on-demand descent.
- SquashFS shards in an open or registered collection contribute to the same paged BIDS tree. Duplicate logical paths keep their physical source choices, and unavailable shards are reported.
- Open SquashFS text and metadata previews and hand selected NIfTI members to the configured MRI viewer.
- Group repeated SquashFS README, JSON and TSV paths. Open a combined dataset description to compare recorded values across shards.
- Visualize selected SquashFS bval and bvec pairs from the same shard directory.
- Navigate backward through paged SquashFS listings.

## [0.4.0] - 2026-11-05

### Added

- **Inspect Tar Archive** scans bounded POSIX ustar inventories from plain tar and gzip tarballs on the workspace host, with cancellation and source revisions.
- Logical BIDS browsing for tar and gzip tarballs, including dataset wrappers, named subject/session shards, mixed-source trees and original member details.
- Tar-backed metadata and gradient previews, cross-source inheritance, and selected MRI opening through the private image cache.

### Changed

- Explain the sequential scan when opening an uncached tar MRI.

- Show dataset-level files above participant and other folders in the logical tree, keeping root metadata visible when a participant is expanded.

## [0.3.0] - 2026-11-05

### Added

- Simple light/dark brain icons for NIfTI files in BIDS Explorer, consistently across local and archive sources.
- Preliminary **Inspect ZIP Archive** command in the palette and native Explorer context menu: bounded, cancellable central-directory inventory on the workspace host, with source revisions, original member paths, duplicate-member identities and a report limited to 200 displayed records.
- Logical subject → session tree overlays for ZIPs and loose directories, including ZIPs within canonical BIDS folders. Matching directories merge file-wise; duplicate files and file/directory conflicts retain source choices. Archive names provide provisional dataset-scoped placement, matching member wrappers are checked on expansion, and contradictory layouts refuse reassignment. Original source paths, lazy indexing and stale-index checks are preserved.
- Inspect Metadata resolves JSON inheritance and diffusion companions across loose and ZIP sources along the selected logical branch, with original source links and explicit ambiguity or incomplete coverage.
- Archive-backed JSON objects/arrays, TSV, gradient and CHANGES previews with readonly raw-source access, original member provenance, bounded CRC-checked reads and exact same-archive companion lookup. Archive table dictionaries are literal same-directory files.
- Selected ZIP MRI opening through the configured VS Code viewer: bounded, CRC/revision-checked extraction to a private workspace-host cache, atomic publication, readonly payloads and retained provenance. Completed files survive reloads; cache clearing requires closed editor/viewer tabs.
- Explicit `bidsExplorer.collectionRoots` workspace declarations for automatically populating descriptorless collections, separate from manual registration and descriptor-based recognition.
- Tested core model for explicitly placing archive subtrees at any dataset depth and merging member paths while preserving conflicting physical sources. Saved custom archive placements are planned for 0.7.0.

## [0.2.0] - 2026-11-03

### Added

- Recorded JSON metadata previews for dataset descriptions, task sidecars and table dictionaries, with filtering/paging, original numeric tokens, duplicate-name notices, source snapshots and raw-text access. Unusable JSON falls back to the original editor.
- Source-backed JSON inheritance and a readable **Inspect Metadata and Related Files** view, with effective values, override history, coverage/ambiguity, original-source opening and an explicit JSON report.
- Inherited DWI bval/bvec discovery and gradient opening across different directories/basenames. Initial opening and explicit reload resolve applicability again; unresolved matches refuse opening. No image-volume or anatomical-orientation checks are implied.
- Bounded participant/session/scan/event table previews, with literal filtering, row/column paging, dictionary provenance, source line numbers and explicit reload. Leading zeros, source order, repeated event onsets, duplicate identifiers/headers and uneven rows remain recorded; no joins, unit conversion or timelines are inferred.
- Source-backed folder/filename entity interpretation in **Show Source Details**, preserving original tokens, conflicts, duplicate entities, unknown keys and unparsed text. Combined participant/session folders and `+` labels are recognized in place; physical source identities and pipeline boundaries remain distinct.
- Background tree descriptions from dataset/pipeline `Name`, inherited NIfTI `TaskName` and explicitly configured participant/session label columns. Descriptions retain source evidence, bounded partial coverage, cancellation and refresh semantics without changing tree identity.
- A tolerant read-only `CHANGES` preview, preserving source order, release/date text and unparsed content, with filtering/paging, raw opening and explicit reload.

### Changed

- Simplified tree hovers into short, wrapping summaries with readable descriptions, relative locations and source filenames. Full URIs and internal JSON pointers remain in Source Details; dataset text is escaped with HTML/trust disabled.
- Removed the persistent tree banner and renamed the stop action **Cancel Pending Work** to cover listings and metadata operations.

### Fixed

- Serialize native Explorer workspace-folder handoffs and wait for confirmed workspace events when another update is pending, avoiding intermittent rejected additions.

## [0.1.0] - 2026-11-03

- Prepared the `0.1.0` local milestone build, with recorded minimum/current VS Code tests and authorized Remote SSH/public MRI smoke evidence. Prepared for the local `v0.1.0` release tag; no Marketplace or GitHub publication.

- Added theme-aware participant, session, modality, derivatives and pipeline icons to the BIDS Explorer tree, using built-in VS Code symbols alongside the existing dataset icon.

### Diffusion gradient preview

- Added a read-only, paired bval/bvec preview from the BIDS tree, native Explorer context menu and command palette: rotatable direction sphere, b-value plot, linked volume selection, counts, adjustable display grouping, paged original values and raw-text opening.
- Bound selected gradient reads and reject unusable formats, symlink leaves and detected source revisions; preserve the last snapshot if explicit reload fails. No anatomical orientation, image association, inheritance resolution or BIDS validation is implied.

### Changed

- Made README user-focused with explicit implemented/planned status; moved contributor setup and tooling guidance to docs/DEVELOPMENT.md.

### Added

- Automatic shallow recognition of BIDS workspace roots at startup, on workspace-folder changes and on global Refresh, with separate automatic/manual ownership and no dataset writes or conformance validation.

- Read-only local directory registration and lazy browsing in the BIDS EXPLORER section of EXPLORER, with canonical BIDS participant/session/modality labels and recognizable file filtering.
- Workspace-scoped registration persistence, source details, default-editor file opening, branch refresh/retry, cancellation of pending listings, and native File Explorer handoff for the complete tree. Removing registration does not delete dataset files.
- Directory/source, persistence, cancellation-race and read-only regression tests; native VS Code command/tree integration tests.
- Deferred opt-in validation, restructuring previews and explicit rename/edit workflows to proposed post-1.0 milestones.

- Documented an externally stored, verified public ds000003 anatomical subset and full ds000114 public inventory for future manual/opt-in tests.

- Versioned roadmap through 1.0.0, release conventions and manifest-derived VSIX filenames.

- Pinned local Semgrep rules and regression fixtures, a security CI job with dependency auditing, weekly Dependabot configuration and security guidance.

- Prettier formatting, type-aware ESLint checks, editor save actions and formatting enforcement in CI.

- Enforced per-file unit coverage, extension-host coverage reports, CI coverage artifacts and documented testing expectations.

- Initial TypeScript VS Code extension scaffold with an empty BIDS Explorer view and refresh command.
- Workspace-host configuration for local and Remote SSH development; early directory workflows are smoke-tested on an authorized Linux host; broader compatibility remains unverified.
- F5 debugging, watch builds, type checking, linting, unit and extension-host tests, CI configuration and local VSIX packaging.
- Project scope, research notes, implementation plan and retained Strata benchmark evidence.

Initial local directory browsing is implemented. Metadata inheritance, persistent indexing, archive readers, validation and restructuring remain future work. No Marketplace or GitHub release has been published.
