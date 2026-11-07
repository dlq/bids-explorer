# BIDS Explorer version roadmap

Working plan, November 3, 2026. Update this as implementation reveals constraints. This describes intended work, not implemented capabilities or a commitment to every candidate feature.

## Goal and starting point

Make a VS Code extension for exploring BIDS datasets locally and over SSH, in ordinary directories, ZIP archives, tarballs and SquashFS images. Navigation and dataset context are the product; visualization is optional.

The unreleased implementation now includes automatic shallow workspace-root recognition, workspace-scoped manual registration, lazy local directory browsing, canonical BIDS-only folder/file recognition, source details, file opening, branch refresh/retry and cancellation. A bounded, read-only diffusion gradient preview is also implemented: sphere, b-value plot and linked original values from a selected same-basename pair. The inspector can open resolved inherited gradient pairs. Image-volume matching and orientation remain future work. Dataset access is read-only. SquashFS cross-source inheritance and persistent indexing remain unimplemented; explicit selected-file inheritance inspection is implemented. Hosted CI remains unverified. Early directory and public-MRI Remote SSH smoke tests passed; broader remote robustness remains future work.

Read [PROJECT.md](PROJECT.md), [RESEARCH.md](RESEARCH.md) for exploration and source references before implementing. Strata is reference material, not an implementation to copy wholesale.

## Version targets

The manifest is currently `0.4.0`, tagged locally as `v0.4.0`. There is no Marketplace or GitHub publication. Proposed releases below are milestones, not dates or implemented features. Move scope or add another `0.x` minor release if readiness checks reveal more work. Do not bump versions for ordinary commits or reserve future versions in the changelog.

| Target  | Intended outcome                                       |
| ------- | ------------------------------------------------------ |
| `0.1.0` | First usable local directory browser                   |
| `0.2.0` | BIDS interpretation and inherited metadata             |
| `0.3.0` | ZIP browsing and declared collections                  |
| `0.4.0` | Tar and documented compressed-tar variants             |
| `0.5.0` | SquashFS browsing and tool compatibility               |
| `0.6.0` | Validated Remote SSH workflows and persistent indexing |
| `0.7.0` | Coverage-aware summaries, filters and availability     |
| `0.8.0` | Optional viewer handoff and distribution preparation   |
| `0.9.0` | Stabilization and release-readiness validation         |
| `1.0.0` | Supported, reliable core exploration workflows         |

Patch releases such as `0.3.1` fix an existing milestone; new functionality goes into the next minor. Before `1.0`, minor releases may contain explicitly documented breaking changes. After `1.0`, compatible features use minor releases, fixes use patches and breaking user-facing contracts require a major release. See [VERSIONING.md](VERSIONING.md) for tags, artifacts, release steps and Marketplace preview rules.

## Design rules throughout

- Keep physical resources (host, URI, container and original member path), logical BIDS paths, semantic metadata and indexing coverage separate. Stable selections retain source identity; revisions invalidate caches.
- Keep the BIDS EXPLORER tree limited to recognizable BIDS elements. Use the native EXPLORER file section for the complete physical tree, including administrative/unrecognized entries. Logical normalization must not rename files or lose provenance. Ambiguous mappings and duplicate logical paths require visible source choices.
- Start with lazy enumeration. Move substantial parsing, indexing, merging, sorting and summaries into cancellable background work. The extension host still needs to remain responsive; asynchronous filesystem calls alone do not solve CPU-heavy work.
- Publish bounded, immutable results and targeted tree refreshes. Preserve selection and expansion; already indexed branches remain usable during other work.
- Distinguish present, absent within a completely indexed scope, unknown and failed. Every count needs a defined scope and coverage.
- Run beside the filesystem through VS Code's workspace extension host. Use URI-aware boundaries and host-local workers/tools; do not introduce a second SSH transport by default.
- Keep indexes, image caches, credentials and large fixtures outside the repository. Use supported viewer APIs only.
- Dataset access is read-only by default. Initial exploration must not validate/fix, rename, move, rewrite metadata or otherwise rationalize source datasets. Store registrations and view preferences outside dataset directories.

## 0.1.0 — First usable local dataset browser

**Status:** complete as the locally tagged `v0.1.0` milestone, without Marketplace or GitHub publication. See [milestone validation](docs/MILESTONE_0.1.0.md) for minimum/current VS Code checks, local scale evidence, authorized Linux Remote SSH browsing and public MRI handoff. Canonical folder labeling is implemented; richer entity normalization belongs to `0.2.0`. This does not complete persistent indexing or the broader `0.6.0` remote workflow gates.

Automatically recognize each open workspace folder with a root-level ordinary `dataset_description.json`, without parsing it, validating structure or recursively searching. React to workspace-folder changes and global Refresh. Retain **BIDS Explorer: Add Dataset** for external or noncanonical roots. Keep automatic ownership separate from persisted explicit registration; closing a workspace folder must not discard a manually added dataset. Show dataset → participant → session → modality, with raw data and derivatives kept distinct. Support sessionless datasets. Leave unfamiliar/administrative entries to the native file tree, accessible via Show Dataset in File Explorer; filtering is not BIDS validation.

Extend the core model with dataset registration, source revisions, coverage scope and structured errors. Define the source-adapter boundary early: enumerate children, index a scope, read bounded metadata and resolve a selected resource for opening. Keep these contracts independent of the VS Code UI and avoid building archive machinery before a directory adapter exercises them.

Implement lazy directory expansion, branch refresh, remove-dataset behavior and workspace-scoped registration persistence. Open selected ordinary files through VS Code. Add a small details surface for original URI, parsed entities and provenance; use native VS Code surfaces where they fit.

**Ready when:** synthetic raw/derivative datasets browse and open files; expansion does not recursively scan the root; refresh is isolated to its scope; permission errors preserve browsing context. Exercise a generated large directory tree without checking it into Git.

## 0.2.0 — BIDS interpretation and useful metadata

**Status:** agreed feature scope and validation are complete, released locally as `v0.2.0` with the final manifest, release notes and VSIX; public publication remains separate. Implemented: lexical entity evidence/conflicts, combined-folder recognition, literal dataset metadata, bounded JSON inheritance and source-aware inspection, resolved inherited DWI gradient opening, participant/session/scan previews, metadata-based tree descriptions and a tolerant CHANGES view. Minimum/current VS Code integration tests, public ds000114 metadata checks and a synthetic Rorqual host-side API smoke passed. See [milestone evidence](docs/MILESTONE_0.2.0.md). Broader remote UI/latency and reconnect coverage remain outside this milestone.

The agreed closeout scope excludes richer dataset/fieldmap/event relationships (`SourceDatasets`, `DatasetLinks`, `IntendedFor`), scan-row navigation, automatic logical reparenting and custom README/license/citation views. Native editors remain available. Schedule additional relationships in a later `0.x` minor before the `0.7.0` participant-centred derivative view; this release establishes the source/evidence foundation without implementing every relationship. No dataset validation or edits are enabled.

Parse entities deliberately, including canonical paths, combined `sub-…_ses-…` directories and session-tagged files. Define how explicit and inferred entities conflict before silently grouping them. Preserve original paths and label inferred interpretation.

Resolve JSON inheritance and related files using the BIDS specification, with source-backed metadata details. Start with bounded JSON/text previews and `participants.tsv`, then session/scan tables. Preserve leading zeros and distinguish image-file counts from acquisitions, volumes and time points. Browsing should tolerate imperfect datasets; it must not imply successful BIDS validation.

Add metadata-based tree descriptions in `0.2.0`: use applicable JSON names/titles, such as `TaskName`, and explicitly described participant/session labels from TSV tables and their dictionaries where available. Keep recognizable BIDS identifiers as the main tree labels and show descriptive names alongside them. Resolve applicability and table identifiers before attaching a description; do not guess display-name columns or replace identifiers with arbitrary values. Retain access to each description's source and inherited provenance, and keep identifier-only labels when metadata is missing, ambiguous or not yet loaded. Load descriptions through bounded, cancellable background work without delaying tree expansion or changing source datasets. This is now implemented as bounded background enrichment; large/remote throughput, persistent/shared metadata caches and broader file-family descriptions remain future work.

### Metadata files and coordinated previews

Plan these surfaces together before adding more file-specific views. The gradient preview is an implemented early slice, not a decision that every recognized file needs a custom editor or an automatic viewer integration. The `CHANGES` history view is implemented; ordinary text opening remains available. Recognition in the BIDS tree, a useful preview, related-file resolution and integration with an image viewer are separate capabilities.

This is a candidate inventory, not an exhaustive BIDS file registry or a promise to implement every view in `0.2.0`. Verify each family's semantics against the applicable BIDS specification before implementation.

| File family                                                                               | Candidate presentation                                                                                                     | Status and dependencies                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dataset_description.json`                                                                | Dataset name, BIDS version, authors, references and derivative provenance, with original field names and values accessible | Literal preview implemented in the first `0.2.0` slice; semantic relationships remain planned. Keep dataset release labels distinct from the BIDS specification version and extension version.                                                |
| `CHANGES`                                                                                 | Dataset release history with version/date headers and change descriptions                                                  | Implemented for `0.2.0` using tolerant CPAN-style release headers; preserve original order, labels and dates, and retain unparsed text. Never silently repair or reorder source history.                                                      |
| `README`, license and citation files                                                      | Readable documentation, license text and citation details                                                                  | Candidate `0.2.0` text/structured previews; prefer supported native editors where sufficient. Disable active content and retain source text.                                                                                                  |
| JSON sidecars and table dictionaries                                                      | Recorded fields, descriptions, units and controlled values; resolved inherited values with their contributing sources      | Core `0.2.0` work. Separate literal file contents from effective inherited metadata; expose overrides, ambiguity and unresolved coverage.                                                                                                     |
| `participants.tsv`, `*_sessions.tsv`, `*_scans.tsv`                                       | Bounded tables with dictionary descriptions, identifiers, missing-value handling and related resources                     | Bounded previews implemented in `0.2.0`, preserving leading zeros and source row order; session/scan dictionaries use inheritance. Larger tables, joins and summaries follow `0.7.0`.                                                         |
| `*_events.tsv` and sampled physiological/stimulus recordings                              | Bounded event table now available; timeline/channel/time-series plots remain candidates                                    | Event table preview added during feedback; plots/recording views remain later candidates. Establish units, onset/time reference, sampling metadata and image/run association first; large or compressed recordings need bounded/paged access. |
| `.bval` / `.bvec`                                                                         | Direction sphere, b-value by volume, display groups and linked numeric values                                              | Same-basename and explicitly resolved inherited-pair previews implemented; image-volume matching and anatomical orientation require verified image metadata and a separate integration decision.                                              |
| Modality-specific companions, such as channel/electrode tables and coordinate-system JSON | Channel tables, recorded coordinates and related acquisition context                                                       | Later candidates after shared table/relationship support. Coordinate frames, units and transforms must be explicit before spatial display or overlays.                                                                                        |

Agree on common behavior before expanding this inventory into implementations:

- Entry points: decide what a tree click opens, where an explicit **Preview** action appears, how users choose a raw editor or **Open With**, and whether related metadata belongs in a shared details panel or a dedicated view. Keep the tree's recognizable BIDS entries; previews must not introduce synthetic filesystem entries or hide original files.
- Relationships: resolve links using BIDS entities, inheritance and recorded references rather than basename guesses. Preserve physical source identity, original paths, source revisions and duplicate-source choices across directories and future archive collections. Show unresolved or partial relationships explicitly.
- Presentation: keep raw text/values accessible, preserve unparsed content, distinguish recorded metadata from derived display choices, and tolerate inconsistent dates, versions and missing companions without claiming conformance validation. Read-only exploration must not trigger fixes or restructuring.
- Resources and lifecycle: bound file size, rows and rendering work; use background parsing/indexing where needed, cancellation and explicit snapshot/refresh semantics. Keep active content out of previews and data/caches outside source datasets.
- Tests: add synthetic fixtures for well-formed and imperfect files, missing companions, inheritance/override ambiguity, duplicate sources, source changes and limits. Test tree entry points and preview lifetime separately from parsing; verify unchanged source bytes.

Use `0.2.0` to establish the shared metadata/relationship contracts and first small previews. Use `0.7.0` for richer tables and coverage-aware summaries, and `0.8.0` for supported image-viewer coordination. A complete custom preview for every family is not a `0.2.0` readiness requirement.

**Ready when:** semantic fixtures cover sessionless and multisession data, derivative boundaries, inheritance, ambiguous entities and noncanonical layouts. Independently compare the logical interpretation against fixture inventories.

## 0.3.0 — ZIP archives and declared collections

**Status:** released locally as `v0.3.0`. Bounded central-directory indexing and an explicit ZIP inventory command are implemented, along with a tested placement/overlay model. See [ZIP development notes](docs/ZIP.md) for limits and the authorized single-ZIP SSH measurement. The default tree now overlays ZIP/loose sources into logical subject/session navigation, including imaging-backed derivative processing folders, directory merging and duplicate file choices. Source paths remain original; archive filename placement is provisional until expansion, with contradictory layouts reported explicitly. CRC/revision-checked selected-member MRI extraction, bounded private storage, viewer lifetime, readonly archive text and JSON/table/gradient/history preview entry points are implemented. Selected-file metadata inspection resolves inheritance across the logical directory/ZIP overlay with physical source provenance and incomplete coverage. Saved custom archive placements move to 0.7.0. See [milestone validation](docs/MILESTONE_0.3.0.md) for checks, evidence, and limits.

Implement one reader at a time. Tar follows ZIP, then SquashFS. The verified [Connectome Mapper fixture](docs/TEST_DATA.md#candidate-tarball-fixture) covers whole-dataset gzip tar browsing. Before each reader, document its host dependencies, supported variants, indexing cost, cancellation behavior and exact-member extraction strategy. Use synthetic archives before real collections.

ZIP files can occur anywhere in the physical BIDS tree, alongside ordinary files and directories: a ZIP may contain the whole dataset, one or more subjects, a session, a modality or a smaller subtree. Do not require archives to be registered only as dataset roots or assume each contains `dataset_description.json`. Define an explicit or explainable mapping from each archive's member root to its logical location in the containing dataset; retain the archive URI and exact member path. Archive placement and filename alone must not silently establish dataset membership or resolve conflicting paths. Archives inside directories are required scope; recursively opening archives stored inside other archives is a separate capability decision.

Test whole-dataset ZIPs, subject ZIPs at the dataset root, session ZIPs within subjects and modality/subtree ZIPs deeper in the tree, including mixtures of ordinary files and archived members, wrapper directories and duplicate logical paths. Verify metadata inheritance across declared directory/archive boundaries while preserving source choices and reporting incomplete coverage.

Tar variants need an explicit capability matrix. Compressed sequential archives may require scanning substantial compressed data to index or reach a member. Surface that cost, cache completed indexes and avoid promising random access or constant-time extraction. Do not unpack whole datasets as the normal browsing strategy. SquashFS tool detection and compatibility checks belong on the workspace host.

Allow users to declare that multiple containers belong to one dataset, including shards with disjoint subjects or sessions. Merge directories file-wise by logical relative path. Expose every conflicting physical source; handle file/directory conflicts explicitly. Flatten wrappers only through an explicit or explainable rule, retaining original member paths.

Extract only the selected member into private temporary storage, validate it and publish atomically. Define traversal, symlink/special-file, duplicate-member, encrypted-archive, listing and size limits. Never interpolate member names into shell commands. Ensure cancellation terminates workers/processes and removes partial artifacts.

**Ready when:** ZIPs can be indexed and selected members opened without full extraction; cancellation and malformed-container cases are tested; duplicate source choices remain selectable; branch coverage distinguishes inspected entries from deferred archives. Collection-wide summaries are scheduled for 0.7.0. Define bounded extraction storage and viewer-resource lifetime here, before enabling extraction; do not defer those safeguards to 0.6.0.

## 0.4.0 — Tar and compressed tarballs

**Status:** released locally as `v0.4.0`. The release adds read-only POSIX ustar inventory for `.tar`, `.tar.gz` and `.tgz`. Logical browsing now merges tar members with ZIP and loose sources. Selected-member MRI opening, metadata previews and cross-source inheritance now use the tar reader. See [milestone validation](docs/MILESTONE_0.4.0.md) and [tar reader notes](docs/TAR.md).

Extend the established source and collection model with tar and explicitly documented compression variants. Reuse the archive safeguards above. Record sequential-access costs and cache behavior, and distinguish unsupported variants from malformed input.

**Ready when:** supported variants pass index/extraction, traversal, special-file, oversized-input and cancellation cases; extracted bytes match fixture inventories; progress explains sequential scans without claiming random access.

## 0.5.0 — SquashFS

The local 0.5.0 release inspects the fixed-size SquashFS 4.0 header without opening a member index. The per-image picker now reads bounded, resumable directory pages directly from metadata blocks. The logical tree also merges shards in bounded pages, preserving duplicate source choices and showing incomplete coverage. See [SquashFS development notes](docs/SQUASHFS.md).

The native reader opens selected text and NIfTI members with uncompressed or gzip data. Additional codecs and optional host tool compatibility remain follow-up work. Use the existing collection model for disjoint shards and conflicting paths. Mounts, FUSE and root must not be required by the supported workflow.

The supported workflow uses the native reader on the workspace host. Uncompressed and gzip blocks are supported. Unsupported shards are reported as partial coverage. Release validation covers member identity, extraction cancellation and cleanup, paging and combined descriptions. See [0.5.0 validation](docs/MILESTONE_0.5.0.md).

## 0.6.0 — Remote SSH and persistent indexing

The local 0.6.0 release persists ZIP and tar browsing inventories in private workspace-host storage and revalidates source identity and read access before reuse. The Rorqual checks verified targeted archive replacement across SSH processes and inventory reuse after reopening the same VS Code workspace. A separate synthetic extraction worker was terminated mid-write. Retry on the same host removed the abandoned partial and recovered the exact member bytes.

SquashFS retains on-demand paging. Evaluate a bounded branch cache if more cold-branch measurements justify it. Offline browsing and recovery from an unplanned transport loss while the VS Code extension host remains active are follow-up work. [0.6.0 validation](docs/MILESTONE_0.6.0.md)

## 0.7.0 — Dataset overview and exploration

**Status:** released locally as `v0.7.0`.

The initial Participant Data view brings together raw acquisitions and matching derivative branches within one registered dataset. It shows partial coverage and keeps session and modality browsing lazy. The view also accepts explicit workspace links between registered raw and derivative roots. Keep explicit **Raw** and named **Pipeline** groupings, retain access to the physical `derivatives/<pipeline>/sub-…` hierarchy, and support separately registered derivative datasets through explicit source-dataset relationships. Match subjects/sessions using source-backed entities and provenance; labels alone must not silently join unrelated datasets. Preserve pipeline/version/variant identity, original paths, duplicate source choices and partial coverage. This is a logical navigation view, never a move or restructure of source files. Build on the source identity and metadata evidence introduced in `0.2.0`.

The participant × session grid shows one row per participant and lists observed modalities in separate raw and derivative session columns. It checks bounded raw and derivative branches in a cancellable scan and can focus on a single pipeline while keeping raw coverage visible. The grid follows source pages to build a refreshable dataset-wide index and pages confirmed matches by participant, required raw sessions and derivative output from local or explicitly linked pipelines. SquashFS availability indexes persist on the workspace host and are reused when the shard revisions match. Loose and mixed datasets are scanned on demand. Show coverage alongside results; unknown cells must not become missing data. Dedicated modality and pipeline views refine the current availability results without rebuilding the index. Workspace settings now save a member root and logical destination for each declared ZIP or tar placement.

External clinical CSV/TSV joins, large-table support and QC annotations are candidates for later minor releases; they are not required for 0.7.0 or 1.0.0. Before adding them, expand table support. Preview and validate joins using explicit keys, duplicates and unmatched rows. Large tables require paging/streaming or disk-backed handling before being offered as a general capability. QC annotations need separate provenance and must not modify source data implicitly.

**Ready when:** overview results reconcile with source inventories, partial and failed scopes stay visible, and filtering leaves browsing responsive at representative scale.

Release validation on Rorqual reconciled all 62,051 indexed participants with the readable SquashFS shard inventories. For 25 sampled participants, all 57 observed session and modality combinations agreed with the index. One of the 13 shards used unsupported compression, and the grid reported partial coverage. In a standalone workspace-host probe, loading the saved snapshot took about 0.2 seconds. Filtering for anatomical data and preparing the first 50 rows took about 7 ms. Separate fixtures cover filtering linked derivative pipelines.

## 0.8.0 — Optional viewer handoff and distribution preparation

Review the standalone NiiVue editor's user interface for broader viewer coordination. Evaluate its controls, layout, navigation, file icons, editor/toolbars and display-state behavior in normal dataset exploration. Identify which surfaces should belong to BIDS Explorer and which should remain with NiiVue, including how to keep navigation and metadata coherent when opening images. Compare the standalone editor and embedded library for broader viewing workflows. Record usability findings and supported customization points; include the current NIfTI file icon in this review. Keep the review separate from the existing rendering-performance benchmark.

**Progressive NIfTI** is the default for NIfTI clicks in BIDS Explorer. It uses a packaged NiiVue renderer and the VS Code webview resource path to display the first frame of a 4D `.nii` or `.nii.gz` while the rest of the same response loads. The [Rorqual prototype measurements](RESEARCH.md#first-frame-and-ssh-traffic-on-a-512-mib-image) cover first display and transferred bytes. Peak memory, broader cold/warm measurements and chunked or multiresolution alternatives remain follow-up work.

**Open Image With** now supports loose and extracted NIfTI files through the documented VS Code custom editor command. The picker offers the configured editor, the VS Code text editor, NiiVue when installed, and a custom editor ID. Establish ownership of extracted-file lifetime before viewer handoff. Rich comparison, overlays and label controls remain separate decisions; private webview/Preact probes are excluded.

Revisit the metadata-preview inventory from `0.2.0` here: decide which related-file actions, selected volumes, event/time references or spatial coordinates would benefit from viewer coordination. NIfTI image display stays with a supported viewer; BIDS Explorer owns source-backed metadata and relationships. Do not synchronize selections or apply orientation transforms until image identity, volume/time mapping, coordinate conventions and the viewer's public API have been verified. Every metadata preview must remain useful without NiiVue installed.

Before broader distribution, choose a license, real publisher and repository destination; review dependency audit findings; test packaging on a clean checkout; and run local/SSH compatibility checks on supported hosts. CI should cover the minimum supported VS Code version and a current stable version. Document supported formats, required tools, limits, cache behavior and failure recovery.

Local validation opened loose and ZIP NIfTI fixtures in NiiVue 2.9.0 through VS Code 1.145.2. The standard extension-host suite verified ZIP handoff without NiiVue and confirmed that clearing the cache is blocked while a viewer tab is open in that window. A fresh source export passed dependency installation and VSIX packaging. On Rorqual, two disposable Remote SSH extension hosts opened loose and ZIP NIfTI fixtures with NiiVue 2.9.0 enabled in one host and disabled in the other. The checks verified editor selection, exact fixture bytes, and protection against cache clearing while the extracted image was open in the test window. A local two-window test reproduced deletion of an open extracted image and then verified the shared guard. Clearing was refused while the image tab was open and succeeded after it closed.

**Ready when:** ordinary Open With works without NiiVue; any optional adapter uses verified supported APIs; extracted resources remain available while in use; publisher/license/repository decisions are concrete before distribution.

## 0.9.0 — Stabilization

Released locally as `v0.9.0`. The [support matrix](docs/COMPATIBILITY.md) records the clean-package checks, local and Remote SSH workflows, cancellation and recovery, and large-collection cache measurements. Full screen-reader testing and broader theme coverage remain open. Distribution still requires the publisher, license and repository decisions below.

## 1.0.0 — Supported core workflows

Work has started with usability verification and documentation updates. The logical tree now adds readable content/modality labels, exact acquisition resource groups, semantic sorting and expansion-triggered timing summaries. Inherited metadata stays coverage-aware across the supported archive readers. Session-level derivative navigation now matches recorded session labels exactly, includes derivative-only sessions and keeps sessionless outputs separate; metadata precedes subtrees throughout the logical view. The built-in viewer now has a native movable Image view with selected acquisition context, header information, key inherited parameters and display controls; broader image/metadata coordination remains follow-up work. Matching multi-echo images now share one acquisition branch with shared events/JSON and separate echo resources. Recognized BIDS entities have readable labels, including run/echo indices and magnitude/phase parts. Further logical relationships to consider are other entity-linked collections (flip/inversion/MT), field-map target navigation using recorded IntendedFor/B0 identifiers, and associations with physiology/recordings; keep these source-backed and coverage-aware rather than grouping by proximity alone. Header-derived image dimensions/voxel spacing and diffusion-shell summaries remain follow-up enrichment; do not obtain them by extracting every scan during browsing. [The usability record](docs/USABILITY.md) records sampled keyboard/theme workflows, user-assisted VoiceOver checks and regression-tested spatial image controls, together with the limits of that evidence. Current user and contributor guides describe the built-in viewer, archive support, troubleshooting and read-only data handling. The manifest remains at the current local release until the 1.0 release gates pass.

Commit to documented behavior for registering, browsing, inspecting and opening BIDS resources from directories, ZIP, supported tar variants and SquashFS, locally and over Remote SSH. Include declared collections, source choices, coverage-aware metadata/overviews, safe extraction and bounded caching. Publish an explicit host/tool/format support matrix rather than imply every compression variant or environment works.

**Release gates:**

- Milestone readiness checks pass on the supported matrix, including real authorized SSH smoke tests and representative scale checks.
- Automated formatting, type checking, linting, coverage, integration, security and packaging checks pass; remaining limitations and accepted lower-severity dependency findings are documented.
- Source identities, metadata/absence semantics, resource lifetime and refresh/cancellation behavior are tested and documented.
- Configuration, persisted registration and cache compatibility policies are documented; migrations or explicit rebuild paths exist where needed.
- Installation, dependencies, troubleshooting, security reporting, license, publisher and release provenance are ready for users.

Embedding a viewer, rich comparison scenes, external clinical joins and processing execution are not 1.0 requirements.

## After 1.0 — Minor features and major changes

Use `1.1.0`, `1.2.0`, etc. for independently scoped, compatible improvements chosen from user feedback, such as saved selections, richer table joins or supported viewer scenes. These are options, not committed release assignments. Continue `1.x.y` patches for fixes.

Reserve `2.0.0` for a justified breaking change to documented commands/settings, dataset registration, persisted selections or supported workflows. It requires its own migration plan and changelog guidance. Do not schedule a major bump merely because a feature is large.

### Proposed follow-on sequence: validation and rationalization

These are future planning options, not authorization to implement mutations now. They follow the supported read-only explorer at 1.0 and can be reordered alongside other compatible minor features.

| Candidate        | Scope                                                              | Boundary                                                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1.1.0`          | Explicit, read-only BIDS validation using an established validator | Report issues and validation coverage without changing files; distinguish validation from tolerant navigation. No validation scans triggered by ordinary browsing.                                |
| `1.2.0`          | Rationalization and rename/restructure previews                    | Produce a reviewable dry-run plan showing source/target paths, entity conflicts, affected references and proposed metadata changes. No source writes.                                             |
| `1.3.0` or later | Optional, explicitly requested application of approved changes     | Separate edit workflow with collision checks, provenance, recovery/rollback strategy and cancellation/failure handling. Recheck sources before applying; never silently fix data while exploring. |

Validation must work with directories and archive-backed sources without implying that every member was inspected when coverage is partial. Archive mutation is a separate design decision: do not silently repack containers or treat extracted cache files as editable source data. Dataset restructuring also needs a policy for sidecars, inheritance, table references and derivative provenance; a filename-only rename is insufficient.

Before enabling writes, define and test dry-run accuracy, symlink handling, external changes, interrupted operations, rollback and backups. Per-operation user authorization is required; browsing and registering a dataset never authorize edits. Keep exploration read-only by default even after these optional tools exist. Such additive tools can use minor releases; reserve a major version for breaking existing documented contracts, as described above.

## Validation and next slice

Follow [TESTING.md](TESTING.md) for enforced coverage and behavioral test expectations.

Use fast core tests for semantics and identity, extension-host tests for commands and tree behavior, and synthetic archive/large-tree tests for IO and responsiveness. Keep real private datasets and performance runs opt-in. Measure indexing, tree publication, extraction, transfer and viewer opening separately before optimizing.

The `0.1.0` directory milestone and early authorized Remote SSH smoke test are complete; evidence and limits are in [milestone validation](docs/MILESTONE_0.1.0.md). The first `0.2.0` literal metadata slice is implemented. Entity evidence/conflict rules are now implemented. Selected-file JSON inheritance and DWI companion resolution now have an initial explicit report. Bounded participant/session/scan previews are implemented, including quoted TSV, correct identifier columns, source-backed dictionary records and explicit snapshots. Session/scan dictionaries now use the inheritance resolver. The readable inspector, source actions, inherited-gradient opening and history view now complete the agreed feature scope. The local `v0.2.0` release established the metadata foundation for ZIP and declared collections in `v0.3.0`. Metadata tree descriptions are implemented for dataset/pipeline names, task NIfTI files and explicitly mapped participant/session columns. Broader relationships remain planned; keep lexical entity evidence separate from metadata applicability. Continue to distinguish this bounded smoke test from broader remote compatibility, reconnect behavior, persistent indexing and archive support.

When the GitHub repository is created, enable the repository controls listed in [SECURITY.md](SECURITY.md). When it is pushed, add `CONTRIBUTING.md` covering development setup, tests, pull requests and changelog expectations.

Workflow execution, Slurm submission, a custom renderer and automatic Marketplace publishing are outside this plan's initial scope.

Post-preparation feedback: simplified readable tree hovers, added literal JSON-sidecar/dictionary previewing by default in the BIDS tree, and added bounded event-table previews. Event plotting and image/run association remain separate work. These feedback changes are included in the final local `v0.2.0` release.
