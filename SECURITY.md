# Security

BIDS Explorer is an unreleased read-only directory browser. Early directory and MRI Remote SSH smoke tests have passed; archive readers and broader remote recovery/caching workflows remain planned. These checks reduce risk but do not establish that future dataset handling is safe.

## Development checks

Install `uv` (https://docs.astral.sh/uv/getting-started/installation/) and Node as described in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), then run:

```sh
npm run check
npm run security
npm audit --audit-level=high
```

`npm run security` uses `uvx` to run Semgrep **1.183.0** with Python 3.12. The first run may download the interpreter, scanner and its dependencies; later runs use uv's cache outside the repository. No Semgrep account is required. Scans use only checked-in rules, disable usage metrics and version checks, and do not upload results to a cloud dashboard. Semgrep and its transitive dependencies remain external development tools. Update the pinned version in both security scripts together and rerun rule tests.

The current baseline has three project rules: reject shell command execution through covered Node child_process imports/calls; reject process options containing literal `shell: true`; and reject `eval`/`new Function`. Positive and negative fixtures validate each rule. This is a narrow, reviewed starting point, not a comprehensive TypeScript security ruleset. Aliasing, computed calls, indirect options and cross-function data flow may evade these patterns. Review new process wrappers manually, and extend rules/tests as actual APIs and helper languages are introduced.

`security:scan` scans `src`, with Semgrep's default exclusions (including test paths). `security:rules` separately checks intentionally unsafe fixtures in `test/security`; those fixtures are never compiled or shipped. Findings and scan errors fail CI. Any suppression needs an adjacent explanation of why it is safe, supported by tests where practical. Do not lower severity or disable rules merely to pass CI.

CI runs Semgrep and npm audit in a separate security job with read-only repository permissions. The audit gate fails on high/critical findings, including development dependencies. Lower-severity findings remain visible for review; existing development-tool findings are documented in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Dependabot is configured for weekly npm and GitHub Actions updates. Hosted checks and update PRs start after the repository is pushed and GitHub enables them.

## Trust boundaries and required implementation tests

Treat dataset metadata, archive member names, tool output and imported tables as untrusted input even in a trusted workspace. Workspace Trust protects extension activation, not the contents of a dataset.

- Never execute dataset content or build shell strings from paths. Invoke trusted tools with separate argument arrays and shell disabled; validate tool options and leading-dash member names too.
- Before archive support ships, test absolute/relative traversal, symlink escapes, special files, duplicate members, corrupt inputs and safe destination containment. Lexical path cleanup alone is insufficient against symlinks.
- Bound listing, preview, decompression and extraction work; test oversized inputs, cancellation, process termination and cleanup of temporary files. Validate revisions and publish completed artifacts atomically.
- Keep caches and credentials outside the repository, preserve source identity and provenance, and avoid recording sensitive paths or clinical values in logs unnecessarily.
- Use supported VS Code/viewer APIs. Keep webview CSP, resource roots and messages restricted; never interpret dataset text as HTML or code.

See TESTING.md for behavior and regression-test expectations. No real SSH connection or private dataset is part of ordinary CI.

## GitHub setup and reporting

When creating the GitHub repository, enable available secret scanning and push protection, private vulnerability reporting, Dependabot alerts/security updates and required CI/security checks on the default branch. Availability depends on repository/account settings; these controls have not been enabled by local configuration. Review action pinning and dependency updates before wider distribution.

There is no public release or reporting channel yet. Once private vulnerability reporting is enabled, use the repository's Security tab for vulnerabilities. Do not put credentials, private datasets or exploit details exposing sensitive information in public issues.

Release preparation and security-gate requirements follow [VERSIONING.md](VERSIONING.md). A version bump does not authorize publication.

## Current directory access

The local adapter imports read-only filesystem operations (`lstat` and `readdir`), performs no dataset writes and does not follow entries identified as symbolic links. Selected file opening is delegated to VS Code after a fresh leaf `lstat`; external editors can still save changes at the user's request. This is not a filesystem sandbox: parent-path replacement/symlink races and mounted filesystem behavior are not fully constrained by these checks. Registrations are stored through VS Code workspace state outside datasets. No BIDS validator or source-edit workflow is invoked by browsing.

## Gradient preview boundary

Selected pairs use asynchronous read-only file handles, bounded to 1 MiB per file and 10,000 volumes. The reader checks leaf type and source identity/revision before and after reading, closes handles on failures/cancellation, and rejects malformed UTF-8. These checks detect ordinary replacement races; they are not an atomic two-file snapshot or a filesystem sandbox. No image bytes, arbitrary directory traversal or source writes are needed for the preview.

The webview loads only packaged scripts/styles from restricted resource roots, has a default-deny CSP with network connections disabled, and receives dataset values through messages rendered with `textContent`/canvas. Host messages accept only fixed actions; raw-file opening selects one of the two known source URIs rather than accepting a webview-supplied path. View state stores only selection, rotation and display thresholds. Closing a panel cancels its reload; extension disposal and Cancel Pending Listings cancel outstanding reads.

## Literal metadata previews

The dataset-description preview shares the bounded, revision-checked text reader with gradients. JSON syntax and resource prerequisites enable display; this is not BIDS conformance validation. Parsing is limited to 1 MiB, 1,000 top-level fields and 32 nested value levels, with cooperative cancellation during scanning. Literal JSON value text avoids rounding large numbers or silently discarding duplicate fields.

Dataset data is sent as structured messages and rendered through `textContent` under a default-deny CSP. Only packaged scripts/styles are accessible; network connections, dataset HTML and executable links are disabled. The host accepts fixed reload/raw-opening actions and always opens the known source URI, ignoring any message-supplied path. Snapshots and preview contents remain in memory. A reload failure preserves the last displayed snapshot; closing a panel cancels its reload. These previews neither follow source-dataset links nor rewrite metadata.

Selected-file inheritance walks lexical ancestors within the registered root, isolating derivative pipelines and nearer dataset markers. It rejects symbolic-link ancestors/targets and does not follow applicable metadata links. It reads no image/TSV bytes, bounds directory/source/JSON work, supports cancellation and rechecks recorded revisions before publication. Checks reduce accidental stale publication but do not sandbox concurrent path replacement or create an atomic snapshot. Reports use native JSON text documents without executable content; source URIs are provenance, not commands dispatched from dataset content.

The participant preview uses the bounded ordinary-file reader for a selected `participants.tsv` and its same-directory `participants.json`. It does not evaluate formulas, follow links in cells/dictionaries or execute embedded HTML; packaged clients render dataset content with text nodes under a restrictive CSP. Host raw-source actions use captured URIs and ignore message-supplied paths. Table parsing is cooperative and limited to 1 MiB, 10,000 records and 128 columns; rendering pages rows/columns and visibly shortens long values. Dictionary failures stay explicit. The two source snapshots are independently checked reads, not a transactional pair.

Session/scan table dictionaries reuse the bounded inheritance resolver within an explicit dataset root. URI/palette preview actions choose a containing registered root; they do not search arbitrary parents to discover a root. Panels retain their interpretation scope as well as physical source URI. Dictionary raw-open messages accept only a checked integer index into host-held source choices, never a message-supplied URI. Recorded scan filename values are text only and are not resolved or opened by the table preview.

Automatic tree descriptions use bounded metadata readers, source-scope checks and a limited background queue. They do not read image bytes or infer display-name columns: participant/session mappings require explicit settings. Description values are plain native tree/tooltip strings, with bounded single-line display; no Markdown trust, HTML or command-link interpretation is enabled. Exact values and source evidence stay in memory and Source Details. Dataset contents are never modified. Failed/ambiguous reads withhold descriptions; cancellation/refresh prevent superseded results from updating the tree.

History and inherited-metadata documents share a packaged CSP-restricted text-node renderer. Sources and action IDs are held by the host; messages cannot provide arbitrary paths or execute dataset content. History headers are interpreted without correcting source data, with 1 MiB/1,000-section limits. Inherited gradient opening requires both sources to resolve unambiguously and rereads bounded, revision-checked ordinary files; ambiguity/unknown coverage refuses opening. Existing panels remain explicit snapshots; there is no atomic metadata/pair transaction.
