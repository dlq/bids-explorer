# Security

BIDS Explorer 0.3.0 supports read-only exploration of directories and ZIPs. Selected ZIP MRI members are extracted into a bounded private cache outside the dataset. The release evidence covers Remote SSH browsing, image opening and a synthetic cross-source inheritance check. [0.3.0 validation](docs/MILESTONE_0.3.0.md)

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

The webview loads only packaged scripts/styles from restricted resource roots, has a default-deny CSP with network connections disabled, and receives dataset values through messages rendered with `textContent`/canvas. Host messages accept only fixed actions; raw-file opening selects one of the two known source URIs rather than accepting a webview-supplied path. View state stores only selection, rotation and display thresholds. Closing a panel cancels its reload; extension disposal and Cancel Pending Work cancel outstanding reads.

## Literal metadata previews

The dataset-description preview shares the bounded, revision-checked text reader with gradients. JSON syntax and resource prerequisites enable display; this is not BIDS conformance validation. Parsing is limited to 1 MiB, 1,000 top-level fields and 32 nested value levels, with cooperative cancellation during scanning. Literal JSON value text avoids rounding large numbers or silently discarding duplicate fields.

Dataset data is sent as structured messages and rendered through `textContent` under a default-deny CSP. Only packaged scripts/styles are accessible; network connections, dataset HTML and executable links are disabled. The host accepts fixed reload/raw-opening actions and always opens the known source URI, ignoring any message-supplied path. Snapshots and preview contents remain in memory. A reload failure preserves the last displayed snapshot; closing a panel cancels its reload. These previews neither follow source-dataset links nor rewrite metadata.

Selected-file inspection walks logical ancestors within the registered root, isolating derivative pipelines and nearer dataset markers. It resolves applicable JSON and gradient companions from loose files and ZIP members, withholding effective JSON values when coverage is incomplete or applicability is ambiguous. It rejects symbolic-link ancestors/targets and does not follow applicable metadata links. It reads no image/TSV bytes, bounds directory/source/JSON work, supports cancellation and rechecks recorded revisions before publication. Checks reduce accidental stale publication but do not sandbox concurrent path replacement or create an atomic snapshot. Reports use native JSON text documents without executable content; source URIs are provenance, not commands dispatched from dataset content.

The participant preview uses the bounded ordinary-file reader for a selected `participants.tsv` and its same-directory `participants.json`. It does not evaluate formulas, follow links in cells/dictionaries or execute embedded HTML; packaged clients render dataset content with text nodes under a restrictive CSP. Host raw-source actions use captured URIs and ignore message-supplied paths. Table parsing is cooperative and limited to 1 MiB, 10,000 records and 128 columns; rendering pages rows/columns and visibly shortens long values. Dictionary failures stay explicit. The two source snapshots are independently checked reads, not a transactional pair.

Session/scan table dictionaries reuse the bounded inheritance resolver within an explicit dataset root. URI/palette preview actions choose a containing registered root; they do not search arbitrary parents to discover a root. Panels retain their interpretation scope as well as physical source URI. Dictionary raw-open messages accept only a checked integer index into host-held source choices, never a message-supplied URI. Recorded scan filename values are text only and are not resolved or opened by the table preview.

Automatic tree descriptions use bounded metadata readers, source-scope checks and a limited background queue. They do not read image bytes or infer display-name columns: participant/session mappings require explicit settings. Tree labels are plain strings. Tooltips use static Markdown formatting with all dataset values appended as escaped text; Markdown trust and HTML are explicitly disabled, and no command links are enabled. Display values are bounded. Exact values and source evidence stay in memory and Source Details. Dataset contents are never modified. Failed/ambiguous reads withhold descriptions; cancellation/refresh prevent superseded results from updating the tree.

History and inherited-metadata documents share a packaged CSP-restricted text-node renderer. Sources and action IDs are held by the host; messages cannot provide arbitrary paths or execute dataset content. History headers are interpreted without correcting source data, with 1 MiB/1,000-section limits. Inherited gradient opening requires both sources to resolve unambiguously and rereads bounded, revision-checked ordinary files; ambiguity/unknown coverage refuses opening. Existing panels remain explicit snapshots; there is no atomic metadata/pair transaction.

JSON sidecar/dictionary previews use the same bounded literal reader/parser and text-node webview as dataset descriptions. Event previews use bounded quote-aware TSV and existing scoped JSON inheritance; they do not execute cell content or follow stimulus/file links. Native hover formatting escapes all dataset text and disables trust/HTML; ordinary display spaces permit wrapping without unescaping Markdown tokens.

## ZIP inventory boundary

The preliminary inspector reads only bounded central-directory metadata with bundled `yauzl`; it never decompresses, extracts or follows members. It rejects unsafe path spellings, preserves duplicate member ordinals, records encryption/compression/type information and checks archive revisions through a read-only ordinary-file handle. Cancellation is cooperative between records. The JSON report contains at most 200 members and renders in the native text editor. [ZIP development notes](docs/ZIP.md) document current budgets, remote evidence and limitations. These index checks do not substitute for the extraction security regressions required before opening member payloads.

ZIP-backed navigation indexes archives only on expansion, preserves separate physical branches and suppresses metadata readers that require ordinary files for archived members. Member clicks retain provenance, route archive text through the bounded readonly provider, and hand viewers only checked private image-cache files. Indexed scientific-file paths back derivative processing-folder visibility; hidden/admin entries are omitted from navigation without modifying them. Scoped refresh clears prepared indexes, source revision changes refuse stale cached navigation, and cancellation prevents superseded indexes from being published. Branch indexing reads central-directory records without opening member streams.

The logical overlay retains original entries beneath `logical.sources`; synthetic subject/session/display paths are never passed to filesystem readers. Archive-name placement is provisional within a registered dataset and does not join independent dataset/pipeline namespaces. Session expansion checks matching wrappers; contradictory members and additional wrapper siblings require explicit placement. Cross-source duplicate files and file/directory conflicts preserve every choice. Grouping/order/publication yield cooperatively and respect branch bounds; metadata loaders that require ordinary files remain disabled for virtual multi-source nodes and archive members.

## Selected ZIP members and image cache

Selected members are identified by exact central-directory ordinal plus name and a captured container revision. Reads reject unsafe paths, encrypted/unsupported compression, links/special members, excessive ratios and oversized declared/actual output; streamed output must match its length and CRC. Source identity/revisions are checked before publication. Text previews use a readonly content provider with 1 MiB/fatal-UTF8 bounds, original archive provenance and existing text-node/CSP controls. Literal previews treat duplicate same-archive companion names as ambiguous. The separate metadata inspector resolves cross-source inheritance using the logical ancestor chain and retains physical provenance.

MRI extraction writes only to generated private cache directories outside datasets, never to archive-derived directory paths. Files use safe basenames/fallback extensions, exclusive creation, checked streamed writes and readonly permissions; publication is atomic after verification. Cancellation closes handles/removes partial files and prevents observed-cancelled viewer handoff. Completed files remain available across reloads, with explicit cache clearing guarded by current-window editor/viewer and active-work checks. Per-workspace byte/entry budgets include incomplete on-disk artifacts. This is not a filesystem sandbox or cryptographic authenticity check, and optional viewers own NIfTI decoding/rendering and their memory use.
