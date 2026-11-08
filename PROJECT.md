# Project context

BIDS Explorer is a VS Code extension for neuroimaging researchers and staff exploring studies on their computer or over Remote SSH. It presents ordinary folders, supported ZIP/tar archives and SquashFS collections through a logical BIDS tree, with original files and provenance accessible.

## Audience and presentation

Users understand participants, sessions, modalities and derivatives, but may have little programming or VS Code experience. Lead with study context, readable acquisition labels, recorded values and units. Keep exact BIDS identifiers, filenames and source locations available in tooltips and source details. Distinguish what a dataset records from what the explorer infers or could validate.

The BIDS sidebar section is a logical study view. Administrative and unfamiliar entries remain in native File Explorer; omitting them from BIDS is not a validation result. Recognize workspace roots through shallow checks for an ordinary root-level `dataset_description.json`, separately from recursive indexing. Manual registration and explicit collection declarations cover other roots.

## Implemented core

- Read-only local and Remote SSH browsing of directories, supported ZIP and POSIX ustar/gzip tarballs, and SquashFS 4.0 uncompressed/gzip blocks. Format limits are explicit.
- Logical participant/session/modality and derivative navigation, declared archive/shard overlays, saved ZIP/tar placements, original source choices and cross-source selected-file metadata inspection.
- Bounded JSON, table, gradient and CHANGES previews; source-backed tree descriptions and acquisition metadata. Preview capabilities differ by file family and source; see the reference.
- Participant availability filtering/paging, explicitly linked raw/derivative datasets and persistent SquashFS availability snapshots. ZIP/tar inventories persist; ordinary directory listings and description snapshots remain in memory.
- A built-in progressive NIfTI viewer using the packaged NiiVue library, plus a native Imaging view for acquisition/header context and display controls. External installed editors are optional through **Open Image With**.

See the [user guide](docs/USER_GUIDE.md), [explorer reference](docs/EXPLORER_REFERENCE.md) and [compatibility matrix](docs/COMPATIBILITY.md) for current behavior and tested limits. These capabilities do not imply full BIDS validation, every compression variant or unlimited indexing/viewing.

## Boundaries and invariants

Dataset exploration must not rename, move, restructure, rewrite metadata, repack archives or automatically validate/fix a study. Any future validation/editing workflow is separate scope in [PLANS.md](PLANS.md). Opening an ordinary original file in another editor is a separate user action that can allow changes.

Keep physical host/container/member identity separate from logical BIDS paths and display labels. Preserve original values, source revisions, pipeline boundaries and duplicate-path source choices. Match raw/derivative roots through explicit links; shared participant labels or archive filenames alone do not establish dataset membership or spatial alignment. Report incomplete, unsupported and failed coverage separately from absence.

Keep indexing, merging, summaries and table parsing off the UI path, with bounds, cancellation and useful partial results. Archive images use checked selected-member extraction and private storage with shared-window lifetime protection. Use the existing VS Code Remote SSH connection and workspace-host readers rather than a second SSH transport. Keep large data, caches and credentials outside Git; read ignored machine-specific test context only for an authorized test.

BIDS Explorer owns navigation, metadata, relationships and image streaming; NiiVue supplies rendering. Use documented integration points. Private webview/Preact probes in the benchmark are historical instrumentation, not a production API. Optional plugins, derivative overlays, broader relationships, large-table work and explicit validation remain future directions, with scoped issues linked from PLANS.md.

## Documentation and development

- [PLANS.md](PLANS.md): direction, priorities, release themes and links to GitHub work items.
- [RESEARCH.md](RESEARCH.md): findings, options, historical measurements and reference locations.
- [Development guide](docs/DEVELOPMENT.md), [testing](TESTING.md) and [security](SECURITY.md): contributor setup and required checks.
- [CHANGELOG.md](CHANGELOG.md) and [milestone records](PLANS.md#completed-milestones-and-evidence): shipped changes and validation history.
- [VERSIONING.md](VERSIONING.md) and [publishing](docs/PUBLISHING.md): version source, authorized releases and distribution.

The public repository is [dlq/bids-explorer](https://github.com/dlq/bids-explorer), licensed MIT; dependencies and datasets retain their own licenses. The production Marketplace publisher is `MCIN-dlq`. The manifest and lockfile are authoritative for the extension version; release targets do not authorize publication.

Strata is a separate native SwiftUI/Metal project at `/Users/dlq/Developer/macvdb`. Its implementation and the [benchmark snapshot](docs/evidence/niivue-vscode/REPORT.md) are reference material, not an extension specification. Verify assumptions before porting behavior and preserve imported evidence verbatim.
