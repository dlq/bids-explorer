# Changelog

Record implemented changes under Unreleased. The manifest is currently `0.0.1`, an unreleased development build; no version below represents a published release. Follow VERSIONING.md (`VERSIONING.md`): use `major.minor.patch`, release tags `vX.Y.Z` and dated headings `## [X.Y.Z] - YYYY-MM-DD` when releasing. Planned versions belong in PLANS.md (`PLANS.md`), not in release history.

## Unreleased

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
- Workspace-host configuration for local and Remote SSH development; remote behavior remains unverified.
- F5 debugging, watch builds, type checking, linting, unit and extension-host tests, CI configuration and local VSIX packaging.
- Project scope, research notes, implementation plan and retained Strata benchmark evidence.

Initial local directory browsing is implemented. Metadata inheritance, persistent indexing, archive readers, validation and restructuring remain future work. No release has been published.
