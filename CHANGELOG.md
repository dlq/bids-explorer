# Changelog

Record new changes under Unreleased. Released versions use `major.minor.patch`, tags `vX.Y.Z` and dated headings; see VERSIONING.md. Planned work belongs in PLANS.md. Version `1.0.1` is the Marketplace release; `v1.0.0` remains the original development-publisher artifact.

## Unreleased

- Rename the image-controls sidebar view and its container to **Imaging**, retaining existing view IDs and placement.

- Read shared-cache queue tickets through one bounded, revision-checked file handle, rejecting symlink leaves and changed files without reopening a checked path.
- Update the development compiler, lint, coverage and VS Code test tools; explicitly load host test types for TypeScript 6, update the paired CodeQL actions and select patched transitive development dependencies for a clean npm audit.

## [1.0.3] - 2026-11-08

- Explain Workspace Trust and virtual-workspace restrictions in VS Code, close standalone availability/comparison panels on extension disposal, and add viewport metadata to image views.

- Enforce shared archive-image cache byte and entry budgets across windows with cancellable filesystem reservations, conservative dead-owner recovery and cross-process regression tests.

- Keep the displayed archive page and Previous/Next controls after a failed page read, so navigation and retry remain available.
- Move Availability browser behavior into a type-checked packaged client, reject foreign/stale/malformed progress messages, and resynchronize progress when the client is ready.
- Exclude unused native Rollup build bindings from portable VSIX packages and verify artifact contents, icon and preview clients during packaging.

- Clarify current viewer, logical-tree, archive-table dictionary and shared-cache behavior; update publishing status and contributor guidance, and separate the active roadmap from historical validation records.

## [1.0.2] - 2026-11-07

- Add a Marketplace and Extensions-view icon combining logical dataset branches, imaging and metadata, using colours from the BIDS website.

## [1.0.1] - 2026-11-07

- Add a five-minute public-data walkthrough, a separately downloadable 13 MB anatomical sample with upstream attribution/provenance, troubleshooting, citation metadata, a pull-request template and scoped roadmap issues.
- Exercise minimum and current stable VS Code in hosted CI and publishing verification, preserving the required aggregate check and separate coverage reports.

- Update CI actions and the test-runner patch, and separate routine Dependabot updates from major toolchain changes while preserving the supported API/type baselines.

- Reject foreign-origin messages in all six metadata, table, gradient and image clients. Add real-webview sender regressions, deterministic tar path-replacement checks, and a recorded review of the initial CodeQL alerts.

- Bundle a dedicated Marketplace getting-started guide covering local/SSH setup, archives, imaging, metadata, availability, accessibility and troubleshooting; keep the GitHub README concise.

- Add hosted CodeQL analysis and a tagged-release Marketplace publishing workflow using OIDC Trusted Publishing; upgrade the development-only packaging tool to support it. Use the confirmed `MCIN-dlq` publisher and derive integration-test extension identity from the manifest; its repository/workflow/environment trust policy is active. The production extension has a new VS Code identity; disable the development copy and recreate extension-owned registrations if needed.

- License BIDS Explorer under MIT, include the license in future packages and retain third-party notices.

- Add a study-focused README, public-data screenshot, downloadable release instructions and issue forms. Fix VSIX packaging by recording the public repository URL.

- Publish the source repository at `dlq/bids-explorer` and add contributor and security-reporting links.

## [1.0.0] - 2026-11-07

- Prioritize scan dimensions, voxel size and inherited acquisition parameters above image controls. Display TE in milliseconds and JSON strings as text, preserve exact values in provenance, group fields beneath each source file, collapse voxel-position buttons, hide single-volume navigation and completed loading actions, and shorten intensity limits without changing their internal precision.

- Separate image quadrants with a four-pixel display gap and add eight pixels of padding around the image canvas, without doubling the top gap below the toolbar. Add a separate eight-pixel black inset inside the image pane.

- Default the built-in image viewer to four quadrants: axial, coronal, sagittal and a 3D volume rendering. Retain three-plane, individual-plane and 3D-only choices in the native Image view; Reset display restores the four-quadrant layout.

- Add a movable native **Image** view with selected-acquisition context, frame/layout/colour-map/intensity/crosshair controls, NIfTI header information, inherited BIDS parameters and collapsed related-source/provenance sections. Use **Image controls** in the viewer to open it; move **BIDS Image** to the Secondary Side Bar for a right-hand layout.

- Group matching multi-echo images into one logical acquisition with shared events/JSON and ordered per-echo image/metadata branches. Keep different runs, parts, source conflicts and incomplete listings distinct. Expand readable entity labels across the BIDS vocabulary while preserving indices and original identifiers.

- Explain empty NIfTI placeholders before starting the image renderer, and reuse existing image viewers on repeated opens to avoid duplicate tabs, requests and graphics contexts. Preserve archive-cache protection for shared viewers.

- Add an opt-in public-data logical-layout walkthrough and regression test using a real five-echo run, matching separately stored fMRIPrep outputs and pinned lightweight field-map examples, all stored outside the repository.

- Present metadata and other file entries before subtrees at every logical level, including grouped metadata and expandable acquisitions. Preserve semantic content and numeric run sorting within each section.

- Replace the redundant **Participant Data → Raw** view with session-level **Derivatives** branches matched by exact session identifiers. Include derivative-only sessions and a participant-level **Derivatives without a session** branch, support explicitly linked datasets, and retain the dataset-level pipeline view.

- Group unambiguous NIfTI acquisitions with their exact sibling JSON, events and diffusion-gradient resources. Keep inherited metadata one action away, preserve shared/uncertain resources separately and retain flat rows for partial listings.
- Use readable modality branches and semantic numeric sorting. Keep archive format details in provenance, while preserving visible source conflicts and derivative entity distinctions.
- Load source-backed TR, TE and recorded duration summaries in a bounded background queue when an acquisition expands. Support SquashFS inheritance when all inspected ancestors are complete; withhold effective values for paged coverage or conflicting shard metadata.

- Lead logical file rows with readable BIDS content labels such as **BOLD**, **T1-weighted**, **Diffusion** and **Events**. Show task, acquisition, run and other recorded distinctions beside the label, followed by the file type; keep unfamiliar suffixes and original source identity intact.

- Shorten logical file labels by hiding known file extensions and matching participant/session entities already supplied by the containing branches. Show readable content types, preserve acquisition/task/run distinctions and retain full filenames when shortened entries would be ambiguous. Present root dataset descriptions and participant metadata with readable names.

- Show participant and session labels without `sub-` and `ses-` in the logical tree, preserving leading zeros and original identifiers in source details and metadata.

- Shorten the Explorer sidebar section title to **BIDS**; the extension remains **BIDS Explorer**.

- Add keyboard-accessible image-position controls and announced voxel coordinates in the built-in viewer.
- Make table scrolling keyboard-focusable, wrap long metadata values, collapse repeated acquisition source paths and improve singular summary labels.

- Add keyboard navigation and troubleshooting guidance for neuroimaging users, update security and development documentation for the current archive readers and built-in viewer, and record the sampled 1.0 usability checks, including user-assisted VoiceOver verification.

## [0.9.0] - 2026-11-06

- Make dataset metadata, participant and events tables, and dataset history easier to read. Show event time units, explain recorded column definitions, and keep source details and original files available.

- Make participant availability easier to find and keep scan status in sync with the displayed results.

- Open loose and archived NIfTI images in the built-in viewer by default when clicked in BIDS Explorer. Use **Open Image With** to select another editor. The tree and viewer tab use the same imaging icon.

- Allow clearing the extracted-image cache when it is already over its entry limit.

- Detect archive or text source changes during reads, including rewrites that preserve the file size and modification time.

## [0.8.0] - 2026-11-06

- Protect extracted images from cache clearing in another VS Code window while the workspace still has them open.

- Open a 4D `.nii` or `.nii.gz` with **Progressive NIfTI** to see its first frame while the remaining frames load from the same request.

- Choose a VS Code editor for loose and archived NIfTI files from the BIDS tree with **Open Image With**. NiiVue appears as a choice when installed.

## [0.7.0] - 2026-11-06

### Added

- Save ZIP and tar subtree placements in workspace settings. Placed members merge into the logical BIDS tree and retain their original archive references.

- Open a participant × session availability grid from a dataset in BIDS Explorer. Each participant has one row, with modality availability in separate raw and derivative session columns. Build a dataset-wide background index and filter it by participant, required raw sessions and derivative output. Filter across explicitly linked derivative datasets and view confirmed matches 50 at a time. Browse the filtered results by session, modality or pipeline. Reuse completed SquashFS availability indexes across reconnects when shard revisions match. Incomplete checks remain distinct from missing data.

- Expand Participant Data under a dataset participant to browse raw acquisitions and matching derivative pipeline branches together, including explicitly linked registered datasets.

## [0.6.0] - 2026-11-06

### Added

- Reuse completed ZIP and tar browsing inventories across reloads when the archive revision still matches.

### Fixed

- Reclaim interrupted image extractions on retry when their owner process has exited on the workspace host.

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
