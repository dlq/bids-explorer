# Changelog

Record new changes under Unreleased. Released versions use `major.minor.patch`, tags `vX.Y.Z` and dated headings; see VERSIONING.md. Planned work belongs in PLANS.md. Version `0.2.0` is prepared locally; `v0.1.0` remains the last existing tag. Neither milestone is published to the Marketplace or GitHub.

## Unreleased

### Added

- Added recorded JSON metadata previews for task sidecars and table dictionaries, plus bounded `*_events.tsv` previews with inherited column dictionaries. Event values and repeated onsets remain literal; no timeline or image/run association is inferred.

### Changed

- Simplified tree hovers into short, formatted summaries: name and description first, followed by dataset-relative location and source filename. Full URIs and internal JSON pointers remain in Source Details. Dataset text is escaped, with HTML and Markdown trust disabled.

## [0.2.0] - 2026-11-03

### Added

- Added a tolerant read-only `CHANGES` preview, with recorded release headers/dates/order, unparsed text, source lines, filtering/paging, raw opening and explicit reload. Reads and section display are bounded; source history is never repaired.
- Replaced the initial metadata report entry point with a readable inspector showing effective values, override history, source revisions/coverage and captured-source opening. The JSON report remains an explicit action. Resolved DWI gradients can open from independently inherited bval/bvec sources; initial opening and explicit reload resolve applicability again, with ambiguity refusing the preview. No image-volume or orientation checks are implied.

- Added bounded background metadata descriptions beside original tree labels: dataset/pipeline `Name`, inherited NIfTI `TaskName` and explicitly configured participant/session TSV label columns. Exact identifiers, source-scoped matches, duplicate/ambiguity fallbacks, source evidence and JSON contributors are preserved in Source Details. Refresh/settings changes invalidate descriptions; cancellation retains completed work. Dataset files and tree identities remain unchanged. Automatic enrichment has bounded partial coverage and no persistent cache.

- Extended read-only table previews to `sub-…_sessions.tsv` and `sub-…[_ses-…]_scans.tsv`, with `session_id`/`filename` duplicate reporting and original IDs, paths, timestamps and row order preserved. Their column dictionaries use bounded JSON inheritance with dataset/pipeline/nested boundaries, source provenance, raw-source selection and explicit unresolved states. Added **Preview BIDS Table** while retaining the participant action. Recorded scan paths remain plain text; row links remain planned.

- Added a read-only `participants.tsv` preview by default from the BIDS tree, with literal filtering, row/column paging, source line numbers, unchanged identifiers/numeric text, quote-aware TSV, raw-text access and explicit reload. Duplicate headers/IDs and uneven records remain visible. Same-directory `participants.json` definitions retain original values, duplicate occurrences and source revisions; missing or unreadable dictionaries do not block the table. Reads, records, columns and rendering are bounded and cancellable. Table joins remain planned.

- Added explicit **Inspect Metadata and Related Files** for NIfTI/TSV tree selections: ancestor JSON inheritance with exact value text, source/override provenance, ambiguity and coverage reporting, plus nearest inherited DWI bval/bvec discovery. A generated report remains available alongside the readable inspector; broader relationships remain deferred. Inspection is bounded and cancellable, reads no image/table data, isolates pipelines/nested datasets and writes no dataset files.
- Removed the persistent “BIDS elements · read-only” tree banner and renamed the stop action **Cancel Pending Work** to reflect metadata cancellation as well as listings.

- Added source-backed subject/session/filename entity interpretation to Show Source Details, preserving lexical labels and source evidence, exposing conflicts, duplicate filename entities, unknown keys and unparsed tokens without a winning guess.
- Recognized combined participant/session folder names in place and `+` labels. Suggested contexts remain source/pipeline scoped; raw and derivative files and overlapping physical layouts retain distinct source identities. Logical reparenting remains future work.

- Started the `0.2.0` metadata slice with a read-only dataset-description preview by default from the BIDS tree, also available explicitly from context menus and the command palette. Raw JSON remains accessible; unusable descriptors fall back to the original JSON with a warning. It shows source snapshots, BIDS specification labels, original JSON fields, duplicate-name notices, filtering/paging and raw-text opening.
- Added a shared bounded text reader and literal metadata contracts that preserve field provenance, duplicate occurrences and numeric tokens without coercion. Preview prerequisites and limits are separate from BIDS conformance validation; source-dataset relationships remain planned.

### Fixed

- Serialize native Explorer workspace-folder handoffs and wait for confirmed workspace events when another update is pending, avoiding intermittent rejected additions. A real extension-host regression covers a concurrent workspace edit.

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
