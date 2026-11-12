# Research and exploration

Consolidated November 3, 2026, from the Strata handoff, source reference map and BIDS Explorer setup discussion. This replaces `docs/STRATA_HANDOFF.md` and `docs/REFERENCE_MAP.md`. It records observations, alternatives and unresolved questions; it is not a claim that the extension implements these capabilities.

Use [PROJECT.md](PROJECT.md) for agreed scope, [PLANS.md](PLANS.md) for direction and linked work and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for development commands. Keep raw benchmark evidence in [docs/evidence/niivue-vscode](docs/evidence/niivue-vscode/REPORT.md). Historical tool versions and measurements below describe the exploration at the time; verify them before relying on them in implementation.

## Where the exploration has led

The goal is a VS Code BIDS dataset explorer for local and SSH-hosted directories, ZIP archives, tarballs and SquashFS images. The current implementation browses these sources in one logical tree, preserves source choices, resolves bounded metadata inheritance and opens selected images. ZIP/tar inventories and SquashFS availability indexes have persistent caches. Release themes and scoped issue links live in [PLANS.md](PLANS.md); [VERSIONING.md](VERSIONING.md) defines release conventions. Strata remains a separate native SwiftUI/Metal prototype; its models, tests and performance lessons are references, not an extension specification.

The implementation now embeds the stable NiiVue library for progressive NIfTI viewing, with a native Image sidebar for acquisition context, parameters and controls. External installed editors remain optional. Derivative image overlays and richer coordinated scenes are deferred beyond 1.0. Historical probes below describe earlier choices and measurements; they do not establish performance for every current workflow.

Historical sections retain the options, future-tense notes and test scope recorded at each stage. They are not the current backlog: use PLANS.md and its GitHub issues for that. The current viewer embeds NiiVue 0.69.0; the older external-editor and release-candidate probes below remain comparison evidence.

## Viewer and BIDS-tool comparison — November 8, 2026

This comparison used official tool documentation and BIDS Explorer's current source/user reference. It was not a hands-on usability or performance benchmark. The recommendations below are product judgments for a read-only explorer; another tool's feature does not establish our implementation, compatibility or performance.

| Reference capability                                                                                                                                                                                                   | Useful follow-up for BIDS Explorer                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PyBIDS entity and metadata queries](https://bids-standard.github.io/pybids/layout/index.html)                                                                                                                         | Study-wide acquisition search, beyond participant availability: find a task/run/protocol and navigate to its source-qualified scans.                                                           |
| [CuBIDS parameter/acquisition groups](https://cubids.readthedocs.io/en/latest/usage.html)                                                                                                                              | Read-only parameter comparison and eventual protocol summaries. Borrow the distinction between filename entities and acquisition parameters, without importing curation or renaming workflows. |
| [FSLeyes voxel/world location controls](https://open.oxcin.ox.ac.uk/pages/fsl/fsleyes/fsleyes/userdoc/command_line.html) and [NiiVue display conventions](https://niivue.com/demos/features/ui.html)                   | Complete the explicit position/value/orientation controls; our sidebar currently offers voxel stepping rather than direct coordinate entry and a convention selector.                          |
| [FSLeyes lightbox and screenshots](https://open.oxcin.ox.ac.uk/pages/fsl/fsleyes/fsleyes/userdoc/ortho_lightbox_views.html) and [MRIcroGL image export](https://github.com/rordenlab/MRIcroGL/blob/master/COMMANDS.md) | A multi-slice inspection layout and an explicit save-view action, separate from writing image data.                                                                                            |
| [FSLeyes time-series plots](https://open.oxcin.ox.ac.uk/pages/fsl/fsleyes/fsleyes/userdoc/plot_views.html)                                                                                                             | Extend our volume slider with deliberate playback/direct selection and bounded selected-voxel plots; retain pending-frame and time-axis uncertainty.                                           |
| [fMRIPrep reports/confounds](https://fmriprep.org/en/25.1.1/outputs.html) and [MRIQC individual/group reports](https://mriqc.readthedocs.io/en/stable/reports.html)                                                    | Make existing reports and recorded confounds reachable from participant/run context. Report discovery/opening and plotting are distinct from computing QC metrics or running pipelines.        |
| [PyBIDS tabular inventory export](https://bids-standard.github.io/pybids/generated/bids.layout.BIDSLayout.html)                                                                                                        | Export selected IDs or source-backed inventory rows for downstream work, with filter and coverage context.                                                                                     |

The installed NiiVue 0.69.0 declarations expose `setRadiologicalConvention`, `setSliceMosaicString` and `saveScene`. These are candidate integration points, not evidence that the extension already exposes or has tested those actions. Test the exact packaged version, keyboard/sidebar behavior, selected-frame loading and local/archive/SSH paths before adopting them. Screenshot saving also needs a supported VS Code destination/download flow.

Highest-value directions are acquisition search and parameter comparison, followed by everyday viewer controls, lightbox and screenshot export. Selection export fits alongside search/large tables; richer 4D inspection and existing QC report/confound access follow. [PLANS.md](PLANS.md#tables-and-cohort-exploration) records direction; concrete implementation issues should carry acceptance criteria when selected. These findings do not expand the 1.0.4 security patch or schedule overlays, plugins, validation or processing execution.

## BIDS Manager comparison — November 10, 2026

This comparison uses ANCP Lab’s documentation and the BIDS Explorer code and user reference. Same-study interaction and performance checks remain open. The two tools overlap most when inspecting an existing dataset. BIDS Manager also has a managed project workflow for conversion and curation. Its **View only** path keeps the dataset folder untouched, while adoption adds project files and can fill missing fields in the dataset description. [BIDS Manager adoption guide](https://ancplaboldenburg.github.io/bids_manager_documentation/guides/adopting-a-dataset/)

| Workflow                                    | BIDS Manager                                                                                                                                     | BIDS Explorer                                                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Open and navigate a study                   | The Editor opens an existing folder for viewing or adoption. The documentation teaches first use with a multimodal sample and worked examples.   | Logical participant/session/acquisition navigation, participant availability, explicitly linked derivatives, archives and Remote SSH. The quickstart uses a small anatomical sample. |
| Inspect a 4D image                          | Playback and a time course at the crosshair, with image units or percent of mean. Dynamic PET uses recorded frame times.                         | Progressive first-frame display and volume selection after loading. A selected-voxel plot is planned.                                                                                |
| Inspect EEG/MEG                             | A recording summary precedes explicit signal loading. Channel selection, a scrollable time window and event markers help navigate the recording. | EEG/MEG modality navigation and metadata browsing. Signal preview is a design direction.                                                                                             |
| Inspect diffusion gradients                 | Shell toggles and a shared selected volume across direction, b-value and numeric displays.                                                       | A gradient preview with coordinated direction, b-value and numeric views. Shell visibility is a candidate interaction to compare.                                                    |
| Compare or assess images                    | Synchronized side-by-side image views and on-demand image quality checks with maps.                                                              | Single-image controls and acquisition context. Related image comparison and access to existing QC outputs are possible follow-ups.                                                   |
| Investigate metadata or validation findings | Schema-aware sidecar forms and findings that link back to the affected file or field.                                                            | Inherited acquisition values with source files and override history. Explicit read-only validation remains a separate design.                                                        |

Sources: [BIDS Manager viewer guide](https://ancplaboldenburg.github.io/bids_manager_documentation/guides/viewing/), [BIDS Manager viewing lesson](https://ancplaboldenburg.github.io/bids_manager_documentation/learn/12-viewing-data/), [BIDS Manager project overview](https://ancplaboldenburg.github.io/bids_manager_documentation/about/) and [BIDS Explorer reference](docs/EXPLORER_REFERENCE.md).

Ideas to carry forward:

1. **Crosshair-linked 4D plot.** Extend the existing 4D plan with a shared position and selected-volume indicator between image and plot. Start with image units. Use time only where the axis and timing are known, including irregular PET frames when available. Clearly distinguish loaded samples during progressive reads.
2. **Recording summary before signal loading.** Start with channels, sampling rate, duration and related event files. Evaluate a bounded, scrollable window with channel selection and event markers as a second step under the recording preview design. Measure the bytes needed for a small window over SSH before selecting an approach for compressed or archived recordings.
3. **Go from a finding to its evidence.** Apply BIDS Manager’s navigation pattern to our existing source links. When a recorded scan target or inherited value needs investigation, take the user to the relevant source and field where available. The same pattern can support explicit validation later.
4. **Teach with a real task and an expected result.** Use the planned Everyday workflows page to show what a successful metadata inspection or availability check looks like. A small example with a recording and events could support a future signal-preview walkthrough.

For the hands-on follow-up, use matching copies of a small 4D run and an EEG or MEG recording with events. Check how the plot responds to crosshair movement and how quickly an operator can find a channel and an event. Evaluate BIDS Explorer’s archive and SSH paths separately. The feature review does not establish performance or equivalent source support. [Comparison plan](PLANS.md#deferred-directions-and-open-decisions)

## Options considered and current direction

| Area                 | Exploration / alternatives                                                                      | Current direction and unresolved work                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product shape        | Native Strata viewer versus a VS Code dataset explorer                                          | BIDS Explorer focuses on navigation and context. Strata stays separate.                                                                                                                                                     |
| Visualization        | Existing NiiVue custom editor, richer cross-extension adapter, embedded NiiVue, native renderer | Use the packaged NiiVue library for the built-in viewer and supported VS Code editor handoff for external viewers. Derivative overlays and richer scenes are deferred; benchmarks are not universal performance guarantees. |
| SSH access           | Strata's own SSH transport versus VS Code Remote SSH                                            | Use the workspace extension host beside the data. Deliberate reconnect, inventory reuse and installed-package tests have evidence; unexpected transport-loss recovery remains scoped follow-up work.                        |
| Dataset presentation | Physical tree versus semantic BIDS hierarchy                                                    | Provide both. Logical normalization preserves original paths and explainable provenance. Conflicts retain explicit source/evidence choices.                                                                                 |
| Collections          | Treat every archive independently, infer a collection from names, or declare membership         | Support declared collections and file-wise overlays, including disjoint subjects/sessions. Filename heuristics are collection-specific and cannot establish BIDS membership generally.                                      |
| Archive IO           | Whole extraction, mounting, or indexed browsing plus selected-member extraction                 | Use bounded indexing and exact-member extraction without mounts/root. Extension readers now cover ZIP, documented tar variants and supported SquashFS blocks. Strata evidence remains historical reference.                 |
| Index/cache          | Repeated traversal, eager full indexing, cached progressive enumeration                         | Lazy navigation and background indexes with explicit coverage. ZIP/tar inventories and SquashFS availability snapshots persist with revision checks and documented cache budgets.                                           |
| Tables               | Eager native table reader versus streaming/paged/disk-backed access                             | Bounded table previews are implemented. Large-table architecture and external join workflows remain scoped follow-up work.                                                                                                  |
| Processing           | Recognize pipeline outputs versus execute local/HPC jobs                                        | Recognize derivatives as dataset context. FastSurfer/CIVET/Slurm execution is later exploratory scope.                                                                                                                      |

## Tarballs: scope added after the Strata exploration

At the initial handoff, tar and compressed tarballs were required alongside ZIP and SquashFS, but no tar reader or tar performance evidence was transferred from Strata. Reader selection, variants, host dependencies and safe member handling were open questions. The subsequent 0.4.0 implementation and measurements are in [tar reader notes](docs/TAR.md) and [release validation](docs/MILESTONE_0.4.0.md).

The initial investigation flagged compressed sequential access as a constraint: listing and extracting a late member may require reading substantial compressed data. Measure that behavior on representative synthetic containers, expose indexing progress/cancellation, and define cached-index and selected-member behavior before promising efficient remote access. These were initial design considerations; the later tar records distinguish measured scan/extraction/cache behavior from unmeasured cases.

## Extension development options and setup

### NIfTI editor handoff in 0.8.0

This section records the external-editor option. The built-in viewer is now the default; these standalone-extension observations do not describe its loader or controls.

BIDS Explorer can pass loose and extracted NIfTI file URIs to VS Code’s documented custom editor command. The installed NiiVue 2.9.0 manifest declares the `niiVue.default` editor for both NIfTI suffixes. Its documented controls cover slice and volume navigation, windowing, crosshair, layout, and overlays. Keep those controls and viewer state in NiiVue. Keep the dataset tree, file identity, and related metadata in BIDS Explorer. The NiiVue manifest contributes an extension icon and a custom editor. The BIDS tree supplies its own MRI affordance for archived images. [VS Code commands](https://code.visualstudio.com/api/references/commands) · [NiiVue controls](https://github.com/niivue/niivue-vscode#keyboard-shortcuts)

The custom editor contract accepts an image URI and an editor ID. The installed viewer exposes no documented cross-extension contract for setting a frame, consuming an event time, or moving the crosshair in a named image space. Opening the related file is the supported starting point. A future coordination test needs to agree on original and extracted image identity, the frame/time mapping, and voxel versus world coordinates before adding any synchronization.

### Progressive NIfTI loading: revisit with NiiVue integration

Recorded November 3, 2026, during the authorized Remote SSH MRI smoke test. The ordinary handoff to the standalone editor delegates image loading to that editor. Dataset-tree laziness and cached directory listings are separate from progressive voxel loading.

- Header-first inspection is feasible: the [NIfTI layout](https://nifti.nimh.nih.gov/nifti-1/documentation/faq/index.html) separates header information from voxel data using an offset. For compressed files, read only a bounded decompressed prefix when inspecting headers.
- NiiVue's library documents limited initial 4D loading through `limitFrames4D`, followed by [loading deferred volumes](https://niivue.com/docs/api/niivue/classes/Niivue/#loaddeferred4dvolumes). Treat initial volumes, later volumes, spatial slices and multiresolution detail as different capabilities.
- Ordinary `.nii` allows offset-based reads if the transport and viewer support them. Ordinary `.nii.gz` generally needs sequential decompression to reach later data; early-prefix loading can still stop before the full file. Do not assume arbitrary compressed byte ranges correspond to voxel ranges, or that every partial loader supports every NIfTI variant.
- Static inspection of installed NiiVue VS Code 2.9.0 found `limitFrames4D` in its bundled library, but no exposure in its extension-host wrapper. This is an observation about that installed build, not a supported cross-extension API or a guarantee about newer releases. That ordinary handoff provides no control over when the first frame appears.
- For the in-workspace NIfTI path inspected in that build, NiiVue uses VS Code's `asWebviewUri`; other paths/formats can use `workspace.fs.readFile`. Preserve supported VS Code Remote SSH resource handling rather than adding a parallel SSH transport. Current VS Code source handles byte ranges and cancels Electron resource streams. That establishes an implementation path to test over Remote SSH. Range handling on the minimum supported VS Code version remains unmeasured. [VS Code webview resource loader](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/browser/webviewElement.ts)

A November 6, 2026 probe used VS Code 1.145.2 over Remote SSH to Rorqual, with an instrumented copy of NiiVue VS Code 2.9.0 and synthetic 128 × 128 × 64 × 64 int16 NIfTI-1 data. The two files were about 128 MiB each. NiiVue opened both through the webview resource URL. Each run made one request with no Range header, got HTTP 200, and had all 64 frames and 128 MiB of decoded voxel data when its load promise resolved. No initial frame limit was set.

| Format    | First measured open | Repeat open | Frames at load completion |
| --------- | ------------------- | ----------- | ------------------------- |
| `.nii`    | 1.08 s              | 0.57 s      | 64 of 64                  |
| `.nii.gz` | 11.87 s             | 0.62 s      | 64 of 64                  |

These timings run from the editor open command to the completion report. They include editor startup and do not measure first paint. This is one sequence with uncontrolled filesystem and webview caches. The synthetic data was deliberately high entropy, so the gzip file was about the same size as the uncompressed file. The probe observed requests, responses and decoded voxel bytes. It did not measure SSH wire bytes, peak memory or GPU residency.

A separate probe from the same Remote SSH webview requested bytes 0–351. VS Code returned HTTP 206 with exactly 352 bytes for both URLs. For `.nii`, those bytes contain the NIfTI header and extension flag. For `.nii.gz`, they are compressed bytes and still need decompression. This confirms range support on the tested VS Code version. NiiVue did not use that range path during ordinary opening.

A follow-up on the same fixtures set `limitFrames4D = 1` in the disposable viewer copy, then called `loadDeferred4DVolumes`. Both formats initially loaded 1 of 64 frames and held 2 MiB of decoded voxels. The deferred call loaded all 64 frames and brought decoded voxel data to 128 MiB.

| Format    | Initial viewer load | Deferred viewer load | Initial HTTP requests |
| --------- | ------------------- | -------------------- | --------------------- |
| `.nii`    | 160 ms              | 559 ms               | 1                     |
| `.nii.gz` | 242 ms              | 699 ms               | 3                     |

Each request returned HTTP 200 without a Range header. Each deferred call issued a new request for the same URL. These are viewer load timings from a single follow-up after prior opens, excluding editor startup. The probe did not measure first paint or bytes transferred, so it establishes staged decoding on these fixtures rather than a cold-open speedup or network savings. The standalone-editor handoff in that experiment opened the full image; the later built-in stream described below replaced it as the default.

#### First frame and SSH traffic on a 512 MiB image

A larger Rorqual probe used an uncompressed synthetic NIfTI-1 file with 256 int16 frames at 128 × 128 × 64 voxels each. It used the same VS Code and NiiVue versions. The display marker was the second browser animation callback after drawing, timed from the editor open command. SSH measurements are approximate inbound TCP payload deltas from macOS `nettop` on the Rorqual socket. The socket was shared with other VS Code windows and occasional log reads. Idle traffic was small relative to the image transfers. Distinct file URLs pointed at the same source bytes. These are single runs with uncontrolled caches.

- An ordinary full open reached the display marker in 48.1 s after receiving about 514 MiB over SSH.
- With the one-frame limit and no follow-up request, the marker arrived in 1.0 s. Samples bracketing the marker showed roughly 2–5 MiB received, but the connection continued receiving data after the preview and settled at about 514 MiB. The viewer still held only the first frame.
- In a separate attempt, calling the ordinary deferred loader after an eight-second pause triggered a second request that returned HTTP 408. The socket received about 1,027 MiB before returning to idle. Socket counters cannot attribute those bytes to individual HTTP requests.

A disposable viewer probe split the original response stream inside the webview. One branch supplied the first frame, and the other immediately continued into the full loader after the display marker. It reached the first-frame marker in 1.03 s, with about 6 MiB received by the next socket sample. All 256 frames were ready at 48.23 s. The browser made one HTTP 200 request without a Range header, and about 514 MiB crossed the SSH socket in total. This demonstrated a faster first display with the same overall transfer on this uncompressed fixture. The prototype used fetch instrumentation in a viewer copy. It did not change BIDS Explorer or the installed viewer, and peak memory remains unmeasured.

The gzip follow-up used the same 256 frames. The webview decompressed the incoming response once before splitting the decoded stream. The first-frame marker arrived in 0.71 s, after 2.19 MiB of compressed data had reached the decoder. The first SSH socket sample after the marker showed about 8.1 MiB received since opening, including data that arrived after the marker. All 256 frames were ready at 46.04 s, and the first 64 voxel values matched the preview. One HTTP 200 request delivered the entire 537,034,280-byte gzip payload, and the SSH socket received about 514.3 MiB. The deliberately high-entropy synthetic data compressed poorly, so these figures do not estimate typical gzip file sizes. This was a single run in the disposable viewer.

The 0.8.0 progressive viewer pins the stable NiiVue library at `0.69.0`. BIDS Explorer reads one webview resource response, decompresses gzip in the webview, and uses the public NiiVue buffer loader for the first frame and the complete volume. The standalone editor is still available through the editor picker. [NiiVue volume loading API](https://niivue.com/docs/loading/)

The packaged implementation passed the VS Code 1.96 extension-host test with synthetic `.nii` and `.nii.gz` images. A separate Rorqual smoke test on the large gzip fixture observed the first-frame status at 3.9 s and all 256 frames at 49.0 s from the open command. The smoke harness polled viewer status, so these figures include viewer startup and polling delay. Its purpose was to verify the packaged viewer over SSH.

The published `1.0.0-rc.109` adds WebGPU alongside WebGL2 and exposes chunk sources and GPU memory budgets for spatial streaming. Its public streaming image specification describes a three-dimensional grid and an application-supplied chunk source. The 0.8.0 path uses a sequential NIfTI response and preserves the file geometry. No side-by-side rendering benchmark has established a speed advantage for the release candidate on this path. [NiiVue monorepo](https://github.com/niivue/mono) · [Published release candidate](https://www.npmjs.com/package/@niivue/niivue/v/1.0.0-rc.109)

When revisiting integration, verify the installed viewer's public configuration/API and exact library version. Compare header-first metadata, limited initial 4D volumes and any supported chunked/multiresolution alternatives using real 3D and 4D fixtures. Measure bytes transferred, time to first useful image, deferred-load latency, memory and cancellation separately under cold and warm conditions. Keep source files unchanged; any derived previews or indexes need explicit provenance and bounded storage outside datasets. Do not use private webview/Preact instrumentation as a production integration.

### Initial scaffold observations — November 3, 2026

The initial scaffold used TypeScript, a native Explorer view, a workspace extension host, VS Code-independent core contracts, and initially had no runtime npm dependencies. ZIP development now bundles `yauzl` and `pend`; see [ZIP development notes](docs/ZIP.md). F5 debugging, a pinned Node development version, unit tests, VS Code extension-host tests, CI configuration and local VSIX packaging are present. The initial sidebar was empty; read-only registration and local directory browsing have since been implemented. Current behavior is documented in README.md.

Local checks and VSIX packaging passed during setup, including two core identity tests and two extension-host tests against VS Code 1.96. Hosted CI had not been run at that stage. Later ZIP validation is recorded in [0.3.0 evidence](docs/MILESTONE_0.3.0.md). Later local scale observations and authorized Remote SSH/public-MRI smoke evidence are recorded in [0.1.0 validation](docs/MILESTONE_0.1.0.md); they do not establish general remote or large-image performance. At that stage the publisher was a development placeholder, and license, production publisher, repository hosting and publication were open. Those decisions were subsequently completed with MIT licensing, the public repository and `MCIN-dlq` publication; see [publishing](docs/PUBLISHING.md). Toolchain audit details belong in docs/DEVELOPMENT.md and should be reassessed as dependencies change.

The rest of this document preserves the detailed findings and reference locations needed to revisit these choices.

## Dataset model and interpretation

### Initial entity interpretation policy

The `0.2.0` milestone introduced lexical evidence from canonical subject/session folders, exact combined `sub-…_ses-…` folder names and entity-bearing filenames. The known-key vocabulary comes from the [BIDS 1.11.2 entity schema](https://github.com/bids-standard/bids-specification/blob/v1.11.2/src/schema/objects/entities.yaml). [Common principles](https://bids-specification.readthedocs.io/en/v1.11.2/common-principles.html#entities) define label/index distinctions; labels can include `+`, and compound extensions start at the first eligible period.

Every observation retains its original token, relative path and origin. Equal known values can agree; conflicting values and repeated filename entities remain unresolved. Unknown keys and uninterpreted tokens are retained. Values stay strings, including indices: no case folding, zero-padding normalization, entity-order checks or full schema validation. Do not reuse a resolved lexical token as proof of metadata applicability without applying inheritance rules.

Grouping suggestions include the registered source and pipeline namespace, excluding the pipeline folder name from subject/session interpretation. These are evidence-backed suggestions, not file identity, automatic dataset joins or tree reparenting. Physical URIs/paths remain authoritative. JSON inheritance and explicit source-dataset linking are subsequent work.

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

The following records the Strata/standalone-editor exploration before the embedding decision. Current rendering uses the packaged NiiVue library; external editors remain optional.

BIDS Explorer owns navigation, indexing, archives, metadata, tables, availability and provenance. NiiVue owns image/mesh rendering, viewing controls and display state. Use a small adapter for opening a URI and later supported comparison/scene requests. File transfers/extraction and temporary-file lifetime need a clear owner so two extensions do not duplicate caches or delete a resource still in use.

The installed extension was `KorbinianEckstein.niivue` 2.9.0; its custom-editor ID was `niiVue.default`. Verify installed versions and integration points before implementation. The version inspected did not export a general viewer-control API. Some declared commands were empty keyboard hooks; their presence in package.json does not prove programmatic control. Rich anatomy-plus-overlay scenes, label selection and events may require an upstream API discussion. Embedding offered more presentation control but was undecided during that exploration, with UI/loader/maintenance responsibilities. It was subsequently chosen for the built-in viewer.

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

### Initial inheritance policy

The selected-file resolver follows the [BIDS 1.11.2 inheritance rules](https://bids-specification.readthedocs.io/en/v1.11.2/common-principles.html#the-inheritance-principle): ancestor location, equal suffix and a metadata filename entity subset. It never uses filename specificity to break a same-directory tie. Whole top-level JSON values override ancestors, preserving exact tokens and each field's contributing sources. Known numeric index entities (run, echo, flip, inv, split, chunk) compare without zero padding; label strings remain literal.

The initial scope is explicit NIfTI/TSV inspection and DWI bval/bvec discovery, with registered-root, derivative-pipeline and nearer ordinary nested-descriptor boundaries. Incomplete inventories, skipped applicable links, unreadable JSON, duplicate keys and same-level JSON ambiguity withhold effective fields conservatively. A JSON failure does not by itself invalidate independently determined DWI companion locations. This is applicability interpretation, not full BIDS validation or an atomic filesystem snapshot. Richer UI, inherited-gradient opening, events/fieldmaps and metadata tree descriptions remain future work.

### Initial participant-table preview

The [BIDS tabular-file rules](https://bids-specification.readthedocs.io/en/v1.11.2/common-principles.html#tabular-files) allow quoted strings containing tabs, designate the literal `n/a` as missing, and link same-named JSON dictionary fields to columns. The initial parser also handles escaped quotes and embedded newlines while retaining exact source tokens and record line numbers. Cells remain strings, including participant identifiers and number text. Duplicate headers/IDs and uneven rows are observations for tolerant display, not a dataset validation result.

The first preview targets plain `participants.tsv` only, with a same-directory literal dictionary. It retains all dictionary occurrences and recorded JSON fields rather than choosing winners, supplying defaults or converting units/levels. It does not infer participant names or joins. Reads and rendering are bounded; large/streamed tables, session/scan relationships, compressed formats and metadata-derived tree descriptions remain separate work. Table and dictionary snapshots have independent provenance and are not atomic together.

### Session and scan table extension

The [BIDS 1.11.2 data-summary templates](https://bids-specification.readthedocs.io/en/v1.11.2/modality-agnostic-files/data-summary-files.html) distinguish participant-level session tables (`session_id`) from session/sessionless scan tables (`filename`). The preview keeps both as recorded strings, preserves timestamps/order, and does not normalize dates, count acquisitions or automatically follow recorded paths. Session/scan dictionaries reuse the established inheritance resolver with explicit dataset and pipeline/nested boundaries, rather than assuming only a same-basename JSON applies. Whole column definitions override, ambiguity withholds effective definitions, and original source choices remain accessible. Table/dictionary reads are independent snapshots. Row navigation and metadata-derived tree descriptions remain separate planned work.

### Metadata-based tree descriptions

The initial enrichment uses recorded dataset/pipeline `Name` and inherited `TaskName` for task-tagged NIfTI files (see the [BIDS metadata schema](https://github.com/bids-standard/bids-specification/blob/v1.11.2/src/schema/objects/metadata.yaml)). Participant/session human-readable label columns are not standardized; explicit resource-scoped column settings define those mappings, with no guessing from a column title or dictionary LongName. Exact unique IDs and unambiguous columns/rows are required. Labels retain source revisions, row/column or JSON-pointer evidence and applicable dictionary/JSON contributors. Nested dataset and derivative boundaries prevent raw-to-pipeline joins.

Enrichment runs after physical row publication through a two-job queue (32 waiting, 512 states/results). Missing/ambiguous/failed descriptions fall back to ordinary labels; entries beyond bounds may remain unloaded. Source Details exposes that coverage. Display-only whitespace flattening and shortening do not change raw values. Refresh and settings changes invalidate snapshots, while cancellation retains completed work. This is not a persistent/shared metadata index: repeated source reads and large/remote throughput remain to be measured before optimizing.

### 0.2.0 closeout scope

The tolerant CHANGES parser follows candidate release boundaries from [CPAN::Changes::Spec](https://metacpan.org/pod/CPAN::Changes::Spec), preserving source order, date/version strings and unparsed text without validation or repairs. The shared text-node document UI supplies paging/filtering, raw-source actions and explicit reload for history and inherited metadata. The inspector retains JSON report access and can open independently inherited DWI gradient sources; gradient reload re-resolves applicability. Image-volume/orientation checks remain separate work.

Broader dataset/event/fieldmap relationships, `IntendedFor`/`DatasetLinks`, scan-row navigation and logical reparenting are deferred from 0.2.0 to later minor work. Native README/license/citation editors suffice for this milestone. Opt-in local and synthetic SSH observations are recorded in [0.2.0 validation](docs/MILESTONE_0.2.0.md), with host/UI/cache limits explicit.

## Logical archive layout follow-up (November 5, 2026)

The default tree now overlays physical sources within each registered dataset/pipeline into subject → session navigation. Canonical archive names supply provisional placement so large named collections need no eager archive scan; expanding a session checks member wrappers and retains exact physical choices. Combined loose folders normalize for display too. Directory paths merge, duplicate file choices remain separate, and contradictory wrappers fail explicitly. Source-backed path identity remains separate from navigation. Explicit selected-file inspection resolves inherited metadata across ZIP and loose sources. Saved custom placements and persistent indexing remain future work. See [ZIP development notes](docs/ZIP.md).

Later status: persistent ZIP/tar inventories shipped in 0.6.0, and saved ZIP/tar placements plus SquashFS availability snapshots shipped in 0.7.0. See the [release records](PLANS.md#completed-milestones-and-evidence); the dated November 5 notes above describe their earlier state.

## Code audit — November 8, 2026

Synthetic checks reproduced a paging failure that retained displayed rows but discarded Previous/Next state. The browser now retains both the rows and paging state on failure; a regression exercises navigation and retry without restarting the source listing. Availability browser logic now lives in a type-checked module with origin/revision/type checks and a ready handshake. A real-webview test covers progress, malformed/foreign messages, filtering and participant navigation.

Artifact inspection confirmed that the published Linux-built 1.0.2 VSIX includes an unused optional Rollup native package. Packaging now excludes those build bindings and verifies the portable payload, declared entry point, approved icon and every preview client. The existing release artifact is unchanged. The ZIP/tar inventory adapter is named `ArchiveDirectorySource` to reflect its actual responsibilities; logical projection remains separate.

A separate cache probe used two `ArchiveImageCache` instances, one shared temporary directory, active leases and concurrent extraction of different synthetic ZIP members. With an entry budget of one, both calls succeeded and left two artifact directories in five of five runs. Activity leases protect clearing, but the per-instance serialization queues do not reserve a shared budget across hosts. Byte oversubscription was not measured separately. [Issue #31](https://github.com/dlq/bids-explorer/issues/31) tracks coordinated reservations, cancellation and crash recovery; this audit does not claim the race is fixed. No private data or SSH session was used.

Validation on macOS: `npm run check` passed 171 unit tests and the per-file coverage gate. Both VS Code 1.96 and the installed current version passed 57 extension-host tests, with two opt-in cases skipped. Security-rule tests and the source scan passed with zero findings. Dependency audit reported zero runtime advisories and 14 development-tool findings (13 moderate, one low); no forced dependency changes were applied.

A fresh lockfile install with Linux optional dependencies present produced a portable VSIX of 2,218,195 bytes, with no native `.node` files; both artifact-contract tests passed. A normal local build produced the same size and passed the same checks. The published 1.0.2 artifact was 3,183,935 bytes and contained the unused Rollup binding. These are local audit builds, not a release or a claim of new SSH testing.

### Shared image-cache correction (issue #31)

The follow-up replaces per-window-only mutation serialization with a filesystem bakery queue shared by cache instances. Each request publishes a unique host/PID/UUID directory before selecting its ticket, then atomically publishes an immutable ticket. Requests wait for choosing and earlier-ticket peers. The critical section covers inventory, budget validation, the entire selected-member stream and atomic publication; clearing uses the same queue after its existing activity/lease check. This deliberately serializes extraction across windows instead of maintaining a second mutable byte-reservation ledger.

Dead-owner recovery removes only unique request directories belonging to confirmed exited local processes. It never unlinks a reusable shared lock that might now belong to a new owner. Foreign hosts and uncertain local ownership remain blocking; no age-based lease stealing is used. Waiting supports cancellation and reports a retryable busy error after 30 seconds. Existing partial-artifact recovery remains inside the shared critical section. The queue requires coherent ordinary directory reads and atomic rename semantics; this follow-up does not establish behavior on every shared HPC filesystem. Older extension hosts do not participate, so reload all windows when adopting the fix.

Cross-process regressions use actual synthetic ZIP extraction with a gate after header validation. The second process waits while the first is in flight, then refuses an entry or byte limit that one image fits but two do not. Other cases cover waiting/extraction cancellation, clear refusal during a retained image, killed-owner recovery, concurrent queue exclusion, foreign/choosing owners, invalid/oversized tickets, excessive requests and source revision changes while waiting. No private datasets or live SSH sessions are used.

The original five-run race probe now leaves one successful image and one artifact for an entry limit of one in every run (previously two in every run). The full follow-up passes 178 unit tests and the per-file coverage gate; the queue module has 97.95% line coverage and 100% branch/function coverage. Both minimum and installed current VS Code suites pass 57 tests, with two opt-in cases skipped. Security scans report no findings and the runtime dependency audit is clear; the existing 14 lower-severity development-tool advisories remain.

## VS Code extension-practices review — November 8, 2026

The review compared activation, manifest capabilities, native trees/commands, Remote SSH execution/storage, panel ownership, webview security/state and the development/package workflow with Microsoft’s extension documentation, linked from the development guide. The workspace-host/ordinary-file design is consistent with the declared remote scope; arbitrary filesystem providers and browser-only VS Code remain unsupported. Delayed startup activation supports descriptor-free declared collections, while initial recognition stays shallow and asynchronous.

Concrete changes add localized explanations for unsupported Restricted Mode/virtual workspaces, explicit lifecycle ownership for standalone Availability/comparison panels, and viewport metadata for image webviews. A real extension-host regression checks that disposal cancels scanning, closes panels and immediately closes late arrivals. Artifact tests require packaged localization strings for capability explanations. The image viewer’s retained hidden context remains a deliberate memory tradeoff for decoded 4D/WebGL state; lightweight previews do not opt into it.

The host is not production-bundled, despite Microsoft’s recommendation to reduce module-loading overhead. [Issue #32](https://github.com/dlq/bids-explorer/issues/32) scopes baseline activation measurement and bundle evaluation without inventing a performance regression or changing supported platforms. A registered read-only custom editor could later improve native file associations/restoration; the current standalone WebviewPanel is a supported API, and this review does not change those product behaviors.

Review validation passed: 178 unit tests with the per-file gate, 58 integration tests on both minimum and installed current VS Code (two opt-in cases skipped), source security checks, and both VSIX artifact tests including localized capability explanations. Documentation links/examples and preserved evidence checks also pass. Changes remain local and unreleased.

## Extension host startup — November 12, 2026

For [issue #32](https://github.com/dlq/bids-explorer/issues/32), compare the compiled CommonJS entry from the local 1.0.4 VSIX with an esbuild 0.28.2 bundle of the same code. The bundle targets Node 20, leaves `vscode` external, and includes the ZIP reader. Browser clients and NiiVue assets come from the same VSIX in both cases. To recreate the candidate, unpack the VSIX and run `esbuild extension/out/extension.js --bundle --platform=node --format=cjs --target=node20 --external:vscode --outfile=bundle.js`, then replace the compiled host modules in a separate copy with the bundled entry.

Launch each copy in the real VS Code extension host with `--extensionDevelopmentPath` and an isolated user-data and extensions directory. A fresh run uses a new profile and a reopened run relaunches the same workspace in that profile. Both runs start a new host process and share the operating system's file cache. Alternate the build order between pairs. Use the same entry wrapper for each build to time the implementation `require`, synchronous `activate` call, and completion of the exported `ready` promise. A test runner waits for automatic activation and checks discovery for an empty folder, the checked-in BIDS fixture, and a folder with one subject ZIP declared through `bidsExplorer.collectionRoots`. Time from extension host process start to `ready` includes host startup and scheduling. It measures when discovery finishes, before rendering or expanding the BIDS tree.

On arm64 macOS 27.2.1 with VS Code 1.146.0, all 80 launches passed automatic activation and the discovery assertion. Values below are median differences within pairs, in milliseconds, calculated as bundled minus baseline.

| Workspace               | Profile  | Pairs | Code load | Synchronous activation | Asynchronous discovery | Code load to discovery complete | Host process start to discovery complete |
| ----------------------- | -------- | ----: | --------: | ---------------------: | ---------------------: | ------------------------------: | ---------------------------------------: |
| BIDS folder             | Fresh    |     8 |      −4.7 |                   +0.1 |                   +2.2 |                            −2.3 |                                     −2.9 |
| BIDS folder             | Reopened |     8 |      −5.0 |                   +0.1 |                   +5.3 |                            −0.3 |                                     −4.9 |
| Empty folder            | Fresh    |     6 |      −5.4 |                   +0.1 |                   +4.2 |                            −0.6 |                                    +29.5 |
| Empty folder            | Reopened |     6 |      −6.7 |                   +0.0 |                   −3.2 |                           −11.2 |                                    −52.4 |
| Declared ZIP collection | Fresh    |     6 |      −5.6 |                   +0.0 |                  +14.6 |                            +8.1 |                                    −33.4 |
| Declared ZIP collection | Reopened |     6 |      −4.5 |                   −0.1 |                   +0.3 |                            −4.2 |                                     +9.1 |

The bundle loaded code faster in all 40 pairs. For the ordinary BIDS folder, it reached discovery completion first in only four of eight pairs in each profile mode when timed from host process start. These runs showed mixed changes in discovery and host startup across the three workspaces. A ZIP size estimate replacing the 63 compiled host files and 11 ZIP dependency files with one host file dropped from 2,221,901 to 2,141,071 bytes, about 3.6%. This estimate excludes any license files a production bundling setup would need to retain separately.

Both builds also recognized the declared ZIP collection in fresh and reopened profiles on VS Code 1.96.0. Keep the current host build for now. The measured module-load savings are too small to justify a 1.0.5 release on their own. This experiment covers local startup and discovery. Remote SSH, installed candidate VSIX behavior, and the bundling and debugging workflow remain untested.
