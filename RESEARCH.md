# Research and exploration

Consolidated November 3, 2026, from the Strata handoff, source reference map and BIDS Explorer setup discussion. This replaces `docs/STRATA_HANDOFF.md` and `docs/REFERENCE_MAP.md`. It records observations, alternatives and unresolved questions; it is not a claim that the extension implements these capabilities.

Use [PROJECT.md](PROJECT.md) for agreed scope, [PLANS.md](PLANS.md) for implementation order and [README.md](README.md) for development commands. Keep raw benchmark evidence in [docs/evidence/niivue-vscode](docs/evidence/niivue-vscode/REPORT.md). Historical tool versions and measurements below describe the exploration at the time; verify them before relying on them in implementation.

## Where the exploration has led

The goal is a VS Code BIDS dataset explorer for local and SSH-hosted directories, ZIP archives, tarballs and SquashFS images. The extension scaffold exists at unreleased manifest version `0.0.1`, but browsing, indexing and archive readers are not implemented. Proposed release assignments live in [PLANS.md](PLANS.md); [VERSIONING.md](VERSIONING.md) defines release conventions. Strata remains a separate native SwiftUI/Metal prototype at `/Users/dlq/Developer/macvdb`; its models, tests and performance lessons are references, not a finished extension specification.

The working direction is a native VS Code tree with dataset context, source-aware logical grouping and optional viewer handoff. Apple-specific UI and rendering code do not need to become extension components.

## Options considered and current direction

| Area                 | Exploration / alternatives                                                                      | Current direction and unresolved work                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product shape        | Native Strata viewer versus a VS Code dataset explorer                                          | BIDS Explorer focuses on navigation and context. Strata stays separate.                                                                                                                           |
| Visualization        | Existing NiiVue custom editor, richer cross-extension adapter, embedded NiiVue, native renderer | Start with supported ordinary file opening; NiiVue is optional. Richer APIs and embedding remain undecided. Benchmark results support further investigation, not a universal rendering guarantee. |
| SSH access           | Strata's own SSH transport versus VS Code Remote SSH                                            | Use the workspace extension host beside the data. Direct SSH transport is not planned by default; real remote behavior still needs verification.                                                  |
| Dataset presentation | Physical tree versus semantic BIDS hierarchy                                                    | Provide both. Logical normalization preserves original paths and explainable provenance. Entity conflicts need an explicit policy.                                                                |
| Collections          | Treat every archive independently, infer a collection from names, or declare membership         | Support declared collections and file-wise overlays, including disjoint subjects/sessions. Filename heuristics are collection-specific and cannot establish BIDS membership generally.            |
| Archive IO           | Whole extraction, mounting, or indexed browsing plus selected-member extraction                 | Prefer indexing and exact-member extraction without mounts/root. ZIP and SquashFS were exercised in Strata; tarball support is project scope, not a validated Strata capability.                  |
| Index/cache          | Repeated traversal, eager full indexing, cached progressive enumeration                         | Lazy navigation and background indexes with explicit coverage. Persistent format, workers, refresh policy and extension cache budget remain design work.                                          |
| Tables               | Eager native table reader versus streaming/paged/disk-backed access                             | Small-table behavior was explored. Large-table architecture and external join workflows remain unresolved.                                                                                        |
| Processing           | Recognize pipeline outputs versus execute local/HPC jobs                                        | Recognize derivatives as dataset context. FastSurfer/CIVET/Slurm execution is later exploratory scope.                                                                                            |

## Tarballs: scope added after the Strata exploration

Tar and compressed tarballs are required source types alongside ZIP and SquashFS. No tar reader or tar performance evidence was transferred from Strata. Reader/library selection, compression variants, host dependencies and safe member handling need investigation.

The implementation plan flags compressed sequential access as a constraint: listing and extracting a late member may require reading substantial compressed data. Measure that behavior on representative synthetic containers, expose indexing progress/cancellation, and define cached-index and selected-member behavior before promising efficient remote access. These are design considerations, not measured results from this project.

## Extension development options and setup

The initial scaffold uses TypeScript, a native Explorer view, a workspace extension host, VS Code-independent core contracts, and no runtime npm dependencies. F5 debugging, a pinned Node development version, unit tests, VS Code extension-host tests, CI configuration and local VSIX packaging are present. The sidebar is intentionally empty until dataset registration and browsing are implemented.

Local checks and VSIX packaging passed during setup, including two core identity tests and two extension-host tests against VS Code 1.96. Hosted CI, real Remote SSH execution, large-data responsiveness and archive behavior have not been validated for this extension. The publisher is a development placeholder; license, actual publisher, repository hosting and publication remain open. Toolchain audit details belong in README.md and should be reassessed as dependencies change.

The rest of this document preserves the detailed findings and reference locations needed to revisit these choices.

## Dataset model and interpretation

Separate the following concepts explicitly:

1. Physical resource: a file/URI, directory, archive or member, with host and source revision.
2. Logical dataset entry: the subject/session/modality/path presented to the user.
3. Semantic metadata: recorded BIDS entities, inherited metadata, pipeline information and relationships, plus any clearly labeled inference.
4. Coverage: what has actually been enumerated, what remains unknown, when it was indexed, and any errors.

A logical BIDS interpretation is not BIDS validation. Our Tractoflow derivative collection used noncanonical subject/session folder names and did not need a dataset_description.json in every container. Preserve the physical tree and expose how the logical interpretation was derived. Do not invent clinical values, metadata, units, acquisition relationships or absent sessions.

- Support raw data and derivatives without conflating them. A derivative image file is not necessarily an acquisition.
- Use entity parsing rather than unrestricted substring matching. `sub-1000011_ses-2` can appear logically as `sub-1000011/ses-2`. Session-tagged files directly under a subject should be associated with that session as well.
- Preserve original filenames and paths for extraction/opening. Normalization changes navigation, not the dataset on disk.
- Already canonical `sub-…/ses-…` paths must work alongside combined folder names. Explicit and inferred entities can disagree; future implementation needs an explicit conflict policy, not silent reassignment.
- Resolve metadata inheritance and derivative relationships according to BIDS semantics; do not assume only the nearest JSON sidecar matters.
- Subject sessions are counted as subject/session pairs. Reusing the label `ses-2` across subjects does not make it one session.
- Keep file counts, unique image-path counts, acquisitions, 4D volumes and time points distinct.

## Archive collection semantics

An archive may hold one subject, arbitrary subsets of subjects/sessions/modalities, or a whole dataset. ZIP-per-subject and SquashFS-per-subset were both real test cases. Do not infer collection membership from shared subjects or session labels.

The user explicitly declared all SquashFS shards in the supplied Tractoflow collection to be one dataset, including disjoint subjects and both sessions. Strata auto-detected a familiar filename family and also remembered explicit membership. That filename heuristic is collection-specific; it is not a general BIDS rule. Membership may need to include less conventionally named shards.

Overlay directories file-wise by logical relative path. Flatten a known wrapper such as `tractoflow_results` only in the logical view. Preserve the container and original member path throughout. When multiple sources provide the same logical file path, offer source choices; do not silently choose the first/last or assume identical bytes. Type conflicts and ambiguous entity mappings need explicit handling too.

Use source-qualified selection identity. Identical inner paths in different containers are distinct physical resources. Logical row identity should be stable across indexing updates. Strata fixed unstable selection strings by canonical JSON key ordering. Revisions are cache invalidators, not a reason to randomly change every row ID.

Expanding an archive reads its index without replacing the active image or another archive's subtree. Refresh one branch independently. Cancel and resume using completed cached work. Failed image opens should retain browsing context and explain the error.

## Remote storage, cache and extraction lessons

Large HPC filesystems make directory metadata work expensive. Strata exercised a root with roughly 38,000 participant folders. A collection of 45 SquashFS files exposed about 899,000 member entries; cached archive metadata was much faster to browse than repeated filesystem traversal.

- Enumerate only the required scope. Avoid a full recursive scan when opening a root, and avoid statting every remote archive just to show its name.
- With VS Code Remote SSH, prefer a workspace-host indexing service and URI-aware APIs. Do not automatically reproduce Strata's separate SSH transport or assume every URI is a local filesystem path.
- Transfer only a selected member/image. Neither indexing nor viewing one image should download an entire multi-hundred-GB container.
- Keep metadata indexes separate from image bytes. Define coverage and refresh scope explicitly. An offline cached index does not imply all its images are available offline.
- Strata's image cache used bounded LRU storage (5 GiB default), reserving space for partial downloads and counting source/conversion artifacts. The extension's cache location and budget need their own design, especially when its host is remote; do not blindly create a second local copy on top of NiiVue's transfer path.
- Cache keys include host/dataset/container/member identity, source revision and conversion configuration where applicable.
- Strata used size plus nanosecond mtime as revisions. Local archive reopen checked them; remote indexes were snapshots with explicit refresh. Extraction/download checked revisions before and after reading. Same-size/same-mtime replacement is not detected by this scheme.
- Download into private temporary files, validate expected size, then publish atomically. Remove partial/orphaned files on failure and startup. Cancellation must stop the process and clean temporary extraction artifacts.
- Budget errors, authentication errors, indexing errors and unsupported-image errors should remain distinguishable.

The helper uses Python zipfile for ZIP/ZIP64 and CRC verification, and unsquashfs for SquashFS. It requires no mounts, FUSE or root. The local development Mac had Homebrew squashfs 4.7.5. The remote reader was older and lacked `-cat`: the fallback extracted one exact escaped member into a private temporary directory, verified it, streamed it and cleaned up. Never interpolate unescaped member names into shell or regex expressions.

Keep traversal, symlink/special-file, duplicate member, encrypted ZIP, size/listing and text-preview limits. Strata capped indexes at 250,000 entries per archive and 64 MiB of listing output, and text previews at 1 MiB. These are reference safeguards, not automatically the right extension limits.

## Responsiveness: what went wrong and what fixed it

The sidebar initially showed subjects but stalled or failed to expand during indexing. This was not image download latency.

- Merging/sorting the large tree in View.body blocked the main thread. Move transformations to background work and publish immutable snapshots.
- A growing recursive SwiftUI tree repeatedly diffed thousands of rows. Strata eventually used a native lazy NSOutlineView for the large combined collection. In VS Code, use lazy TreeDataProvider children and targeted refresh events; do not publish a fresh whole tree for each member.
- Even checking an expansion arrow should not build descendants. Cache expanded children and preserve expansion/selection across snapshots.
- Model writes during representable update caused an Observation feedback loop and high CPU. View rendering/update must not register datasets or otherwise mutate its observed input. Keep registration idempotent and attach it to an explicit model/user event.
- Equality wrappers around disclosure rows hid expansion behavior. Optimization must preserve control semantics; verify actual expansion and file opening in the running UI.
- Snapshot publication was throttled to four seconds during collection loading, followed by a final snapshot. That interval is a prototype choice; use a bounded publication rate and ensure completion/cancellation still yields useful final state.
- Already indexed branches should remain browsable while other shards load. Do not disable the whole navigation tree for metadata indexing.
- Dataset overview counts initially read only the outer SSH directory and therefore missed archive contents. Compute archive-backed summaries with background snapshots, deduplicate logical image paths, and show partial coverage until all shards are indexed.
- Loading, decoding, texture upload and rendering are separate costs. Profile each before attributing a slow interaction to the network.

## Navigation and clinical data ideas

Initial priorities: semantic BIDS tree, entity filters, availability matrix, useful metadata/details panel, and supported viewer handoff. Candidate alternate views group by modality or derivative pipeline. Saved selections could identify subjects with both sessions and particular completed outputs. Keep the physical tree accessible for verification.

Missing data needs at least three states: present, absent within fully indexed scope, and unknown because coverage is incomplete or failed. An error is not absence. Make source provenance available without overwhelming ordinary browsing.

BIDS-native participants/session/scan tables and sidecar dictionaries were explored, along with CSV/TSV import preview. Preserve join identity and leading zeros; preview and validate a join before attaching external clinical data. Duplicate identifiers, missing matches and ambiguous cross-session joins need explicit treatment. Do not overwrite the source table or invent a join based on row order. Strata's initial table reader was eager; streaming/paged/disk-backed large-table handling remains design work, not a solved reusable capability.

## Viewer boundary and imaging lessons

BIDS Explorer owns navigation, indexing, archives, metadata, tables, availability and provenance. NiiVue owns image/mesh rendering, viewing controls and display state. Use a small adapter for opening a URI and later supported comparison/scene requests. File transfers/extraction and temporary-file lifetime need a clear owner so two extensions do not duplicate caches or delete a resource still in use.

The installed extension was `KorbinianEckstein.niivue` 2.9.0; its custom-editor ID was `niiVue.default`. Verify installed versions and integration points before implementation. The version inspected did not export a general viewer-control API. Some declared commands were empty keyboard hooks; their presence in package.json does not prove programmatic control. Rich anatomy-plus-overlay scenes, label selection and events may require an upstream API discussion. Embedding offers more presentation control but remains undecided and carries UI/loader/maintenance responsibilities.

Private Preact traversal was used solely to instrument the live viewer for benchmarking. Never ship that as an integration. Benchmark source and measurements are references, not supported extension APIs.

NIfTI supports 4D, but its fourth dimension may be time, diffusion volumes or components. Strata was still 3D-only; 4D selection was queued next, not implemented. Count such image files in navigation without claiming they are viewable or treating every fourth dimension as fMRI playback. Some tested derivative NIfTIs omitted spatial units; Strata rejected them rather than silently assigning millimetres. Keep geometry/units warnings independent from BIDS conformance.

macOS Preview worked well for derived surfaces and poorly as a general voxel viewer. This is context for retaining a purpose-built visualization component, not a reason to reproduce the native renderer in the extension.

Local FastSurfer segmentation, CIVET surfaces/thickness and FreeSurfer license constraints were explored in Strata. Processing plans included local and remote tools and Slurm. These are later workflow concerns; keep output recognition separate from submission/execution. Prefer established tools over reimplementing pipelines. Do not copy their installations or models into this project.

## Evidence to retain, and limits of the conclusions

A small benchmark snapshot is copied to `docs/evidence/niivue-vscode/`. Two runs compared the installed extension with the native shader on the same 188 × 256 × 190 T1, T2 and SIAM inputs at 840 × 700 backing pixels. NiiVue median volume GPU times were 1.07–1.25 ms (T1), 1.12–1.22 ms (T2), and 2.39–2.50 ms (T1+SIAM), versus roughly 3, 3, and 2.7 ms in Strata. Strata's axial shader was cheaper; both had ample headroom on those samples. The report records methods, raw data, input hashes and important limitations.

This was not an identical-image-quality comparison or an end-to-end latency/memory/remote test. Native timings were offscreen GPU tests; NiiVue ran in its webview with different shading/compositing. Approximately 120 Hz scripted callback cadence is not a measured display-present rate. Browser submission timing is not equivalent to Metal completion timing. Rebenchmark future integrations; no universal parity guarantee follows.

The raw-index-versus-overlay audit covered all 45 cached Tractoflow shards: 7,000 subjects, of whom 401 had both sessions, 3,412 only session 2, and 3,187 only session 3. Remote names and size/mtime revisions were checked at the time and matched those indexes. Session 2 could exist elsewhere; no evidence justified inventing it in this collection. Keep this kind of independent semantic audit as a test strategy, not a hardcoded assertion about current remote data.

## Source, test and sample reference map

Reference checkout: `/Users/dlq/Developer/macvdb`. The paths below are relative to it. These are references to inspect and selectively port; no implementation code was copied into BIDS Explorer.

## Models, services and UI examples

| Area                            | Reference paths                                                                                                                 | What to inspect                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| BIDS semantics                  | `native/Strata/Sources/Strata/Models/BIDSDataset.swift`; `native/Strata/Sources/Strata/Services/BIDSIndexer.swift`              | Entities, nodes/scans, metadata and derivative relationships; distinguish incomplete prototype behavior from the BIDS specification |
| Archive model                   | `native/Strata/Sources/Strata/Models/ArchiveManifest.swift`; `ArchiveSelection.swift` in the same directory                     | Physical member identity, validation and source-qualified selections                                                                |
| Logical overlay                 | `native/Strata/Sources/Strata/Models/ArchiveOverlay.swift`; `ArchiveDatasetSummary.swift`                                       | Collection membership, wrapper handling, session normalization, duplicate sources, summary semantics                                |
| Background state                | `native/Strata/Sources/Strata/Models/ArchiveBrowser.swift`                                                                      | Independent branches, cancellation, coalescing, detached merging and throttled snapshots                                            |
| Archive IO                      | `native/Strata/Sources/Strata/Services/ArchiveService.swift`; `native/Strata/Sources/Strata/Resources/archive_reader.py`        | Index caches, exact-member extraction, ZIP/old and new unsquashfs behavior, safety checks                                           |
| Remote index/cache              | `native/Strata/Sources/Strata/Services/RemoteBIDSIndex.swift`; `RemoteImageCache.swift`; `SSHTransport.swift`                   | Lazy branches, revisions, bounded LRU, temporary files and transport; adapt for VS Code Remote rather than blindly porting SSH      |
| Clinical tables                 | `native/Strata/Sources/Strata/Services/ClinicalTable.swift`; `native/Strata/Sources/Strata/Views/ClinicalTablesView.swift`      | CSV/TSV parsing, BIDS table preview and joins; current reader is not a huge-table architecture                                      |
| Large-tree implementation       | `native/Strata/Sources/Strata/Views/NativeArchiveOutline.swift`                                                                 | Lazy expansion, stable item caches and targeted updates; transfer principles, not AppKit code                                       |
| Overview/provenance             | `native/Strata/Sources/Strata/Views/ArchiveOverlayView.swift`; `ArchiveDatasetSummaryView.swift`; `RemoteDatasetOverview.swift` | Partial counts, errors and source provenance                                                                                        |
| Session/QC example              | `native/Strata/Sources/Strata/Views/SessionComparisonView.swift`                                                                | Session comparison interaction and QC context                                                                                       |
| General prototype documentation | `native/Strata/README.md`; `docs/StrataPlan.md`                                                                                 | Historical capabilities and setup details                                                                                           |

## Tests to use as behavioral references

All under `native/Strata/Tests/StrataTests/`:

- `ArchiveTests.swift`: synthetic ZIP/SquashFS readers, member handling and optional remote examples.
- `ArchiveTreeTests.swift`: source-qualified identity, independent branch state, cache reuse, and branch refresh isolation.
- `ArchiveOverlayTests.swift`: collection membership across disjoint subjects/sessions; directory union; conflicting files and original paths; canonical and combined session paths; partial summaries; progressive indexing; optional full real-index session audit.
- `NativeArchiveOutlineTests.swift`: checking expandability does not build descendants; view updates do not mutate the model; conflicting sources remain selectable.
- `RemoteBIDSTests.swift`: lazy metadata branches, offline snapshots, revision invalidation, LRU behavior and orphan cleanup.
- `BIDSIndexerTests.swift`, `BIDSSampleTests.swift`: local semantic indexes and anatomical sample.
- `ClinicalTableTests.swift`: table parsing, identity and preview behavior.
- `SessionComparisonTests.swift`: grouping without pairing different subjects/sessions, QC persistence and real T1/T2 comparison.
- `ViewerComparisonBenchmarkTests.swift`: native half of the benchmark. Opt-in via STRATA_BENCHMARK_SAMPLES.

Port assertions into the new language/test framework selectively. Do not port tests that merely mirror implementation or require private remote data for ordinary development. Real remote and performance tests should remain explicit opt-ins.

## Samples and benchmark evidence

Public sample files in the existing checkout:

- `samples/nifti/chris_t1.nii.gz` and `samples/nifti/chris_t2.nii.gz`.
- `native/Strata/Sources/Strata/Resources/siamV02_skull_input.nii.gz`: the 16-class SIAM label volume actually benchmarked; prefer this exact file over similarly named earlier segmentation outputs.
- `output/bids/ds000003-anatomical-subset`: small anatomical BIDS sample. Provenance is in `output/bids/ds000003-download.json`.
- `samples/nifti/manifest.json` and `tools/segmentation/siam-provenance.json`: source/provenance notes.

Benchmark original: `output/benchmarks/niivue-vscode/`, with README-style REPORT.md, four raw run JSONs, and inputs.json. A small evidence snapshot is retained in this project's `docs/evidence/niivue-vscode/`; the original files remain in Strata.

Instrumentation: `script/benchmarks/niivue-vscode.js`. Earlier browser comparisons in `viewer/` and `output/comparison/` are separate experiments, not the VS Code extension benchmark.

The benchmark report's reproduction commands and script paths refer to the Strata repository root. Input hashes identify the exact files. Do not silently replace them with lower-resolution images when comparing performance.

Machine-specific authorized test roots are recorded in ignored `.local/strata-test-context.json`. No credentials or archive listings are copied. Existing SSH authentication may require user-completed MFA; do not trigger a connection just to read this handoff.
