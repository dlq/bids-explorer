# Changelog

Record implemented changes under Unreleased. The manifest is currently `0.0.1`, an unreleased scaffold; no version below represents a published release. Follow VERSIONING.md (`VERSIONING.md`): use `major.minor.patch`, release tags `vX.Y.Z` and dated headings `## [X.Y.Z] - YYYY-MM-DD` when releasing. Planned versions belong in PLANS.md (`PLANS.md`), not in release history.

## Unreleased

### Added

- Versioned roadmap through 1.0.0, release conventions and manifest-derived VSIX filenames.

- Pinned local Semgrep rules and regression fixtures, a security CI job with dependency auditing, weekly Dependabot configuration and security guidance.

- Prettier formatting, type-aware ESLint checks, editor save actions and formatting enforcement in CI.

- Enforced per-file unit coverage, extension-host coverage reports, CI coverage artifacts and documented testing expectations.

- Initial TypeScript VS Code extension scaffold with an empty BIDS Explorer view and refresh command.
- Workspace-host configuration for local and Remote SSH development; remote behavior remains unverified.
- F5 debugging, watch builds, type checking, linting, unit and extension-host tests, CI configuration and local VSIX packaging.
- Project scope, research notes, implementation plan and retained Strata benchmark evidence.

Dataset browsing, indexing and archive readers are not implemented yet. No release has been published.
