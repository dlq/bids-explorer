# Security

BIDS Explorer supports read-only exploration of directories, ZIP archives, supported tarballs and SquashFS images. It bundles NiiVue for NIfTI rendering. The current release is `1.0.4`; the [compatibility matrix](docs/COMPATIBILITY.md) records the tested formats, hosts and recovery cases.

## Data handling for researchers

Browsing, filtering and previewing leave source dataset files unchanged. Selected images from archives are extracted into private extension storage on the computer or server that holds the dataset. Completed archive inventories and SquashFS participant availability indexes can also be stored there. Metadata and table previews read bounded snapshots of the selected files.

Remote access uses the VS Code Remote SSH connection. A remote image must reach the local viewer to be displayed. The extension does not send dataset content to an analytics service. If you choose **Open original** or an external editor, that editor can save changes through its own commands.

Treat unfamiliar studies as untrusted content. VS Code Workspace Trust is required by the extension manifest. A development host can run in Restricted Mode during tests; this does not establish support for installed extensions in untrusted workspaces. Use **Manage Workspace Trust** only for folders you trust.

For help or vulnerability reports, share the error and extension version first. Dataset paths, participant identifiers and metadata can contain sensitive research information. Check screenshots and logs before sharing them. Report ordinary bugs at https://github.com/dlq/bids-explorer/issues. Report suspected vulnerabilities privately at https://github.com/dlq/bids-explorer/security/advisories/new; do not include sensitive dataset content in public issues.

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

CI runs Semgrep and npm audit in a separate security job with read-only repository permissions. The audit gate fails on high/critical findings, including development dependencies. Lower-severity findings remain visible for review; existing development-tool findings are documented in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Dependabot runs weekly npm and GitHub Actions updates. The CodeQL workflow adds extended JavaScript/TypeScript analysis on pushes, pull requests and a weekly schedule. Marketplace publishing uses OIDC Trusted Publishing in a separate job; no stored publishing token is required. See [publishing setup](docs/PUBLISHING.md).

## Trust boundaries and required implementation tests

Treat dataset metadata, archive member names, tool output and imported tables as untrusted input even in a trusted workspace. Workspace Trust protects extension activation, not the contents of a dataset.

- Never execute dataset content or build shell strings from paths. Invoke trusted tools with separate argument arrays and shell disabled; validate tool options and leading-dash member names too.
- Maintain archive regression coverage for absolute/relative traversal, symlink escapes, special files, duplicate members, corrupt inputs and safe destination containment. Lexical path cleanup alone is insufficient against symlinks.
- Bound listing, preview, decompression and extraction work; test oversized inputs, cancellation, process termination and cleanup of temporary files. Validate revisions and publish completed artifacts atomically.
- Keep caches and credentials outside the repository, preserve source identity and provenance, and avoid recording sensitive paths or clinical values in logs unnecessarily.
- Use supported VS Code/viewer APIs. Keep webview CSP, resource roots and messages restricted; never interpret dataset text as HTML or code.

See TESTING.md for behavior and regression-test expectations. No real SSH connection or private dataset is part of ordinary CI.

## GitHub setup and reporting

The public repository has secret scanning, push protection, private vulnerability reporting and Dependabot alerts/security updates enabled. Required CI/security checks are configured on `main`; administrators retain an override. Availability depends on repository/account settings. Review action pinning and dependency updates before wider distribution.

Public releases and private vulnerability reporting are available. Use the repository's Security tab or the private-report link above for vulnerabilities. Do not put credentials, private datasets or exploit details exposing sensitive information in public issues.

Release preparation and security-gate requirements follow [VERSIONING.md](VERSIONING.md). A version bump does not authorize publication.

## Current directory access

The local adapter imports read-only filesystem operations (`lstat` and `readdir`), performs no dataset writes and does not follow entries identified as symbolic links. Selected file opening is delegated to VS Code after a fresh leaf `lstat`; external editors can still save changes at the user's request. This is not a filesystem sandbox: parent-path replacement/symlink races and mounted filesystem behavior are not fully constrained by these checks. Registrations are stored through VS Code workspace state outside datasets. No BIDS validator or source-edit workflow is invoked by browsing.

## Gradient preview boundary

Selected pairs use asynchronous read-only file handles, bounded to 1 MiB per file and 10,000 volumes. The reader checks leaf type and source identity/revision before and after reading, closes handles on failures/cancellation, and rejects malformed UTF-8. These checks detect ordinary replacement races; they are not an atomic two-file snapshot or a filesystem sandbox. No image bytes, arbitrary directory traversal or source writes are needed for the preview.

The webview loads only packaged scripts/styles from restricted resource roots, has a default-deny CSP with network connections disabled, and receives dataset values through messages rendered with `textContent`/canvas. Host messages accept only fixed actions; raw-file opening selects one of the two known source URIs rather than accepting a webview-supplied path. View state stores only selection, rotation and display thresholds. Closing a panel cancels its reload; extension disposal and Cancel Pending Work cancel outstanding reads.

## Literal metadata previews

The dataset-description preview shares the bounded, revision-checked text reader with gradients. JSON syntax and resource prerequisites enable display; this is not BIDS conformance validation. Parsing is limited to 1 MiB, 1,000 top-level fields and 32 nested value levels, with cooperative cancellation during scanning. Literal JSON value text avoids rounding large numbers or silently discarding duplicate fields.

Dataset data is sent as structured messages and rendered through `textContent` under a default-deny CSP. Only packaged scripts/styles are accessible; network connections, dataset HTML and executable links are disabled. The host accepts fixed reload/raw-opening actions and always opens the known source URI, ignoring any message-supplied path. Snapshots and preview contents remain in memory. A reload failure preserves the last displayed snapshot; closing a panel cancels its reload. These previews neither follow source-dataset links nor rewrite metadata.

Selected-file inspection walks logical ancestors within the registered root, isolating derivative pipelines and nearer dataset markers. It resolves applicable JSON and gradient companions from loose files and supported archive members, withholding effective JSON values when coverage is incomplete or applicability is ambiguous. It rejects symbolic-link ancestors/targets and does not follow applicable metadata links. It reads no image/TSV bytes, bounds directory/source/JSON work, supports cancellation and rechecks recorded revisions before publication. Checks reduce accidental stale publication but do not sandbox concurrent path replacement or create an atomic snapshot. Reports use native JSON text documents without executable content; source URIs are provenance, not commands dispatched from dataset content.

The participant preview uses the bounded ordinary-file reader for a selected `participants.tsv` and its same-directory `participants.json`. It does not evaluate formulas, follow links in cells/dictionaries or execute embedded HTML; packaged clients render dataset content with text nodes under a restrictive CSP. Host raw-source actions use captured URIs and ignore message-supplied paths. Table parsing is cooperative and limited to 1 MiB, 10,000 records and 128 columns; rendering pages rows/columns and visibly shortens long values. Dictionary failures stay explicit. The two source snapshots are independently checked reads, not a transactional pair.

Loose session/scan/event table dictionaries reuse the bounded inheritance resolver within an explicit dataset root. Archived table previews use their checked same-directory physical dictionary. URI/palette preview actions choose a containing registered root. Panels retain their interpretation scope and physical source URI. The host resolves dictionary source indices and scan row actions against the current snapshot. Scan navigation checks the table revision and walks exact relative components inside the same dataset or pipeline, rejecting absolute paths, URLs, traversal, and symbolic-link targets. The webview supplies a row number and snapshot revision, and the host opens the selected physical source through the existing preview or editor.

Automatic tree descriptions use bounded metadata readers, source-scope checks and a limited background queue. They do not read image bytes or infer display-name columns: participant/session mappings require explicit settings. Tree labels are plain strings. Tooltips use static Markdown formatting with all dataset values appended as escaped text; Markdown trust and HTML are explicitly disabled, and no command links are enabled. Display values are bounded. Exact values and source evidence stay in memory and Source Details. Dataset contents are never modified. Failed/ambiguous reads withhold descriptions; cancellation/refresh prevent superseded results from updating the tree.

History and inherited-metadata documents share a packaged CSP-restricted text-node renderer. Sources and action IDs are held by the host; messages cannot provide arbitrary paths or execute dataset content. History headers are interpreted without correcting source data, with 1 MiB/1,000-section limits. Inherited gradient opening requires both sources to resolve unambiguously and rereads bounded, revision-checked sources; ambiguity/unknown coverage refuses opening. Existing panels remain explicit snapshots; there is no atomic metadata/pair transaction.

JSON sidecar/dictionary previews use the same bounded literal reader/parser and text-node webview as dataset descriptions. Event previews use bounded quote-aware TSV and existing scoped JSON inheritance; they do not execute cell content or follow stimulus/file links. Native hover formatting escapes all dataset text and disables trust/HTML; ordinary display spaces permit wrapping without unescaping Markdown tokens.

## ZIP inventory boundary

The ZIP inventory inspector reads only bounded central-directory metadata with bundled `yauzl`; it never decompresses, extracts or follows members. It rejects unsafe path spellings, preserves duplicate member ordinals, records encryption/compression/type information and checks archive revisions through a read-only ordinary-file handle. Cancellation is cooperative between records. The JSON report contains at most 200 members and renders in the native text editor. [ZIP development notes](docs/ZIP.md) document current budgets, remote evidence and limitations. Separate member-reader tests cover extraction, cancellation and integrity failures.

ZIP-backed navigation indexes archives only on expansion, preserves physical source choices and suppresses metadata readers that require ordinary files for archived members. Member clicks retain provenance, route archive text through the bounded readonly provider, and hand viewers only checked private image-cache files. Indexed scientific-file paths back derivative processing-folder visibility; hidden/admin entries are omitted from navigation without modifying them. Scoped refresh clears prepared indexes, source revision changes refuse stale cached navigation, and cancellation prevents superseded indexes from being published. Branch indexing reads central-directory records without opening member streams.

The logical overlay retains original entries beneath `logical.sources`; synthetic subject/session/display paths are never passed to filesystem readers. Archive-name placement is provisional within a registered dataset and does not join independent dataset/pipeline namespaces. Session expansion checks matching wrappers; contradictory members and additional wrapper siblings require explicit placement. Cross-source duplicate files and file/directory conflicts preserve every choice. Grouping/order/publication yield cooperatively and respect branch bounds; metadata loaders that require ordinary files remain disabled for virtual multi-source nodes and archive members.

## Selected ZIP members and image cache

Selected members are identified by exact central-directory ordinal plus name and a captured container revision. Reads reject unsafe paths, encrypted/unsupported compression, links/special members, excessive ratios and oversized declared/actual output; streamed output must match its length and CRC. Source identity/revisions are checked before publication. Text previews use a readonly content provider with 1 MiB/fatal-UTF8 bounds, original archive provenance and existing text-node/CSP controls. Literal previews treat duplicate same-archive companion names as ambiguous. The separate metadata inspector resolves cross-source inheritance using the logical ancestor chain and retains physical provenance.

MRI extraction writes only to generated private cache directories outside datasets, never to archive-derived directory paths. Files use safe basenames/fallback extensions, exclusive creation, checked streamed writes and readonly permissions; publication is atomic after verification. Cancellation closes handles/removes partial files and prevents observed-cancelled viewer handoff. Completed files remain available across reloads, with explicit cache clearing guarded by editor and viewer checks and workspace activity markers shared across extension hosts. Markers from confirmed exited local processes can be reclaimed. A marker owned by a different host blocks clearing until that host releases it. Per-workspace byte/entry budgets include incomplete on-disk artifacts. A private filesystem ticket queue serializes budget checks, extraction/publication and clearing across extension hosts. Queue tickets are published atomically and ordered before mutation. Each ticket is opened without following a leaf symlink, then inspected and read through that same handle with a 33-byte bound and before/after revision checks; path replacement, growth or mutation cannot redirect an unbounded pathname read. Read errors and cancellation close the handle; cancellation, failure and normal completion remove only the caller’s unique request. Only confirmed exited local owners are reclaimed, avoiding time-based expiry of a live or foreign-host reservation. Unknown ownership or malformed queue state fails closed, and waits are cancellable and bounded to 30 seconds. All windows sharing storage must run the updated extension to participate in this coordination. This is not a filesystem sandbox or cryptographic authenticity check, and the bundled NiiVue renderer or an explicitly selected external viewer owns NIfTI decoding and rendering.

## Tar, SquashFS and the built-in image viewer

Tar readers accept the documented POSIX ustar variants and scan sequentially with bounds on scan size, entry count and selected output. SquashFS readers use bounded random reads and support the documented uncompressed and gzip blocks. Unsupported or unreadable shards are reported through partial coverage. Selected-file reads verify source revisions before publication. Runtime archive access uses bundled readers.

The built-in NIfTI viewer reads the selected loose file or a verified extracted image through a VS Code webview resource URL. Its CSP permits connections to VS Code webview resources for this read. The viewer restricts script imports and resource roots to its renderer, scripts, styles and the selected image’s directory. Progressive loading accepts up to 1 GiB of decoded image data, with a 128 MiB first-frame budget. Cancel stops the active request; the renderer remains responsible for GPU allocations and interaction behavior. These bounds reduce resource use but do not establish isolation from every malformed image or graphics-driver failure.

The native Image view receives selected-image state through the extension host and renders dataset text using text nodes. Its script/style roots are packaged resources and its CSP denies network access. Per-image tokens reject stale sidebar actions after image selection changes. Source actions select host-held entries by checked index; sidebar messages cannot supply a URI. Renderer controls accept fixed actions, finite ordered intensity limits, valid loaded-frame indices and allowlisted layouts/colour maps. Closing a viewer cancels its sidebar metadata read.

## CodeQL review

Packaged browser clients check the exact webview origin before consuming host messages, in addition to their existing payload and host-action checks. The [initial CodeQL review](docs/CODEQL_REVIEW.md) records the fixes, test-only findings and evidence for the guarded tar-open race. The Availability client also rejects foreign origins and stale/malformed progress messages, with real-webview regression coverage. Do not suppress broader source paths to hide individual alerts.
