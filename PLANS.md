# BIDS Explorer roadmap

Updated November 24, 2026. This document records direction, priorities and scope boundaries. GitHub issues carry individual work items; a roadmap entry or open issue is not a promise of a release or authorization to change datasets.

## Purpose and supported core

Help neuroimaging practitioners explore studies through a readable logical BIDS tree, source-backed metadata, participant coverage and image viewing. Support ordinary directories and documented ZIP, tar/tarball and SquashFS variants, locally and through VS Code Remote SSH. Preserve access to the physical files and original identifiers.

The supported core is established through 1.0; the manifest is currently 1.5.0. Implemented behavior and limitations belong in the [user guide](docs/USER_GUIDE.md), [explorer reference](docs/EXPLORER_REFERENCE.md) and [compatibility matrix](docs/COMPATIBILITY.md). [PROJECT.md](PROJECT.md) gives project context; [RESEARCH.md](RESEARCH.md) records exploration, alternatives and evidence.

## How we maintain the plan

- **PLANS.md:** product direction, broad release themes, priorities, architectural boundaries and links to scoped work.
- **GitHub issues:** a specific problem or investigation, acceptance criteria/deliverables, dependencies, examples, discussion and progress. Design/research issues finish with a recorded recommendation; implementation gets its own scope when needed.
- **RESEARCH.md:** findings, measurements, alternatives and decisions that inform the plan and issues.
- **CHANGELOG.md and milestone records:** shipped changes and historical validation. Keep current behavior in user/reference docs.

Update this plan when direction or release scope changes. Update the issue while doing the work; do not maintain a second copy of its acceptance checklist here. Create a concrete issue before starting a feature, and link the implementation PR and resulting documentation back to it.

## Design principles

- **Read-only exploration:** browsing must not validate/fix, rename, restructure, rewrite metadata or repack sources. Future validation and edit workflows need explicit entry points and separate designs.
- **A logical study view:** organize recognizable BIDS elements for a neuroimaging audience. Keep administrative/unrecognized entries accessible in the native File Explorer; omission is not a validation finding.
- **Explainable identity and relationships:** keep physical host/container/member identity separate from logical paths and display labels. Preserve provenance, original values, revisions and duplicate-source choices. Shared participant labels or archive filenames alone cannot establish dataset membership, image alignment or an external join.
- **Coverage is part of the result:** distinguish present, absent within checked scope, unindexed, unsupported and failed data. Do not invent missing sessions or silently resolve ambiguous metadata.
- **Responsive, bounded work:** keep recursive indexing, archive merging, parsing and summaries off the UI path. Support cancellation, useful partial results, targeted refresh and safe cache/resource lifetime across windows.
- **One access model:** run IO beside the data through the workspace extension host. Maintain loose/archive and local/SSH behavior together, including cross-source inheritance and archives at any logical depth. Use documented viewer APIs, not private webview internals.
- **Evidence before broader promises:** maintain meaningful tests, coverage, security and usability checks. Keep real SSH/private-data experiments opt-in and data, caches and credentials outside Git. See [TESTING.md](TESTING.md) and [SECURITY.md](SECURITY.md).

## Release direction and priorities

1.5.0 is the current release. 1.6.0 is the next tentative feature target. The sequence from 1.6.0 onward is provisional and has no calendar dates. Research targets mark when to make a decision. An implementation release depends on the result of that work.

| Release     | Outcome                                                         | Associated work                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1.0.3`     | Maintenance and reliability.                                    | Completed shared-cache, paging, Availability, lifecycle, packaging and documentation corrections. See the 1.0.3 verification record for checks and the explicitly accepted SSH viewer limitation.                                                                                                                                                                                 |
| `1.0.4`     | Shared cache security, Imaging sidebar and Remote SSH guidance. | See the [1.0.4 verification record](docs/MILESTONE_1.0.4.md) for the installed upgrade, two-window cache and fresh synthetic SSH checks.                                                                                                                                                                                                                                          |
| `1.1.0`     | Find a scan and open its source.                                | Shipped [scans-table row navigation (#23)](https://github.com/dlq/bids-explorer/issues/23) with source choices for ambiguous targets and distinct missing and unchecked states. The [annotated Quickstart and scan-navigation example (#40)] shipped alongside it. See the [Quickstart](docs/QUICKSTART.md).                                                                      |
| `1.2.0`     | Browse large participant tables.                                | Shipped [large participant table support (#15)](https://github.com/dlq/bids-explorer/issues/15) with bounded reads, paging, cancellable filtering and clear coverage for `participants.tsv`. The Everyday workflows guide distinguishes participant attributes from session and derivative coverage in Availability. Large event tables follow separately.                        |
| `1.3.0`     | Improve everyday image inspection.                              | Shipped direct coordinate entry, voxel values, slice orientation, Crosshair cutaway, Lightbox and PNG export.                                                                                                                                                                                                                                                                     |
| `1.4.0`     | Inspect changes across a 4D image.                              | Shipped [4D playback (#44)](https://github.com/dlq/bids-explorer/issues/44) and a [voxel signal plot (#45)](https://github.com/dlq/bids-explorer/issues/45). Both follow the volume selected in the viewer.                                                                                                                                                                       |
| `1.5.0`     | Preview EDF and continuous EDF+ EEG recordings.                 | Shipped bounded waveform inspection with shared-scale channel displays, amplitude controls, source-qualified channel/event tables and event navigation. Minimum/current installed-VSIX checks, 14 Remote SSH cases and user-assisted physiological EEG/VoiceOver review passed. Other formats and MEG decoding remain deferred. [Verification](docs/evidence/edf-1.5.0/REPORT.md) |
| `1.6.0`     | Follow scan relationships in the study tree.                    | Add [field-map target navigation (#14)](https://github.com/dlq/bids-explorer/issues/14) and [additional acquisition groupings (#22)](https://github.com/dlq/bids-explorer/issues/22). This can proceed independently if recording work takes longer.                                                                                                                              |
| `1.7.0`     | Find acquisitions across participants and sessions.             | Start with BIDS entity and effective metadata filters, plus navigation to matching scans. Add a source-aware inventory export once result coverage is clear. Evaluate [bounded scan summaries (#25)](https://github.com/dlq/bids-explorer/issues/25) against the same metadata needs.                                                                                             |
| `1.8.0`     | Compare protocols and inspect existing QC.                      | Build on scan search to compare recorded parameters across selected scans. Follow the recording and event preview work with [large event-table paging (#15)](https://github.com/dlq/bids-explorer/issues/15) and scope access to existing QC reports and confound plots as separate issues.                                                                                       |
| `1.9.0`     | Review whole-study consistency.                                 | Combine coverage from Availability, field-map links from 1.6.0, and parameter comparisons from 1.8.0. Start with a selected cohort and user-specified expectations.                                                                                                                                                                                                               |
| `1.10.0`    | Check BIDS conformance on demand.                               | Target a read-only validation workflow after the [validation design (#16)](https://github.com/dlq/bids-explorer/issues/16) settles scope, source coverage, and navigation from findings.                                                                                                                                                                                          |
| Later `1.x` | Follow through on evidence from design work.                    | Consider a [rename/restructure preview (#29)](https://github.com/dlq/bids-explorer/issues/29) after validation. Consider [clinical table joins (#30)](https://github.com/dlq/bids-explorer/issues/30) after cohort filtering and large-table handling are established.                                                                                                            |
| `2.0.0`     | A justified breaking change only.                               | Changes to documented commands/settings, registrations, persisted identities or workflows require migration guidance.                                                                                                                                                                                                                                                             |

### Research alongside release work

| Review point                | Decision                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carry forward into 1.6.0    | Use [large-4D profiling (#28)](https://github.com/dlq/bids-explorer/issues/28) to inform playback and plot limits. Reproduce [unexpected SSH-loss recovery (#27)](https://github.com/dlq/bids-explorer/issues/27) when the host is available and schedule any fix independently.                                 |
| During 1.5.0–1.6.0          | Use the recording preview investigation to decide which EEG/MEG formats and archive/SSH workflows are practical. Review additional [SquashFS compression (#26)](https://github.com/dlq/bids-explorer/issues/26) against actual source needs and continue reviewing what remote data is retained.                 |
| After the 1.4.0 viewer work | Evaluate [NiiVue plugins (#20)](https://github.com/dlq/bids-explorer/issues/20) and [derivative overlays (#21)](https://github.com/dlq/bids-explorer/issues/21) independently. Bring forward an implementation target once there is a practitioner workflow and evidence for supported APIs and resource limits. |
| After whole-study review    | Revisit workflow awareness against actual Availability use. Start with a Nipoppy status-table example and a CBRAIN portal link. Use those findings to judge the value of Slurm status and BIDS Apps terminal guidance.                                                                                           |

Keep the current host build. In 80 local launches, bundling saved 4.5–6.7 ms in median code load across scenarios, with mixed effects on time to workspace discovery. See the [startup benchmark](RESEARCH.md#extension-host-startup--november-12-2026) and [issue #32](https://github.com/dlq/bids-explorer/issues/32). The [Remote SSH audit and follow-up](RESEARCH.md#remote-ssh-data-persistence-audit--november-12-2026) found local image copies in 1.0.4 and verified the streaming fix for loose and archived images before 1.1.0. Keep each feature release focused, with synthetic loose/ZIP/tar/SquashFS coverage, an authorized SSH smoke, user documentation and a short practitioner walkthrough. Readiness checks and individual acceptance criteria remain in TESTING.md, VERSIONING.md and the linked issues rather than a duplicated roadmap checklist.

Correctness, data handling and usability defects take priority over optional capabilities. The release table gives the selected scope. Applying dataset edits, offline browsing, nested archives, and app or job execution remain unscheduled. See the [comparison findings](RESEARCH.md#viewer-and-bids-tool-comparison--november-8-2026) for the rationale behind the viewer work. Follow [VERSIONING.md](VERSIONING.md) when preparing each release.

## Maintenance and evidence to carry forward

- **Security maintenance:** triage new CodeQL and Dependabot findings before release; separate runtime exposure from development-tool findings. Publish compatible runtime security/correctness fixes promptly after verification instead of waiting for a feature milestone. Review the temporary dependency overrides on future tooling updates, removing each once upstream supports the patched dependency range; keep clean-install, failure-reporting and packaging checks.
- **Upgrade and recovery:** include upgrade checks from the currently published version when changing shared caches or persisted state. Preserve registrations, placements and source choices, and explain any required window reload or cache rebuild. Prioritize authorized unexpected SSH-loss testing ([#27](https://github.com/dlq/bids-explorer/issues/27)) when reliable access permits; ship reproduced compatible fixes in the next appropriate patch without holding unrelated work for an unbounded investigation.
- **Measured performance:** extend the [local startup baseline](RESEARCH.md#extension-host-startup--november-12-2026) with cache reuse, first tree response, participant filtering and first-frame/full-image loading. Use representative supported sources and separate local/SSH, transfer/decoding and memory costs. Choose regression budgets after measurement; do not promise arbitrary timings or benchmark every large dataset on each patch. Extend image memory/GPU measurements under [#28](https://github.com/dlq/bids-explorer/issues/28).
- **Practitioner acceptance:** for each feature milestone, select a short real workflow (for example, locate a recorded scan or find a participant with both sessions and preprocessing), confirm source/coverage explanations and keyboard usability, and update getting-started/reference documentation. Keep broad feature ideas out of maintenance patches.

Schedule compatible fixes in the next appropriate patch once verified. Keep concrete tasks, acceptance criteria, and test evidence in their issues. Create implementation issues as each target is scoped.

## Beginner workflow documentation

The [Quickstart](docs/QUICKSTART.md), shipped in 1.1.0, includes an annotated workspace screenshot, a glossary, recovery pointers and a scan-row navigation example. Keep these instructions aligned with the current release.

Match screenshots and visible labels to the documented release. The sidebar is titled Imaging starting in 1.0.4. Distinguish upcoming main-branch instructions from the installed release and update screenshots and links during release closeout.

The [Everyday workflows guide](docs/EVERYDAY_WORKFLOWS.md) covers participant lookup and availability, inherited scan metadata, archives, linked derivatives, image inspection and diffusion gradients.

Give each example one concrete task and an expected result. Once a signal preview is available, consider a small recording with events for a walkthrough on finding a channel and an event.

Use small public or synthetic examples, expected results and brief help when a study looks different, especially Missing versus Not checked and ambiguous metadata/source choices. Link the three guides from a concise Getting started list in the README and Marketplace description. Use the existing GitHub Markdown pages and keep the detailed reference separate. Scope the documentation work in an issue when each release starts.

## Metadata and study relationships

Make recorded relationships useful for navigation while keeping interpretation distinct from validation. Extend the logical view using BIDS semantics, inheritance and explicit references; keep ambiguous and incomplete relationships visible.

- [Field-map target navigation (#14)](https://github.com/dlq/bids-explorer/issues/14).
- [Additional acquisition collections, such as flip/inversion/MT variants (#22)](https://github.com/dlq/bids-explorer/issues/22).
- [Navigation from recorded scans-table filenames (#23)](https://github.com/dlq/bids-explorer/issues/23).
- [Event and recording preview design (#24)](https://github.com/dlq/bids-explorer/issues/24).
- [Bounded scan summaries for tree descriptions (#25)](https://github.com/dlq/bids-explorer/issues/25).

- **Jump to the source of a finding.** Recorded scan navigation shipped in 1.1.0. For inherited values, extend the pattern later to the source file and field or row where available. Preserve source choices for ambiguous matches. Reuse this navigation in the future explicit validation workflow.
- **EDF/continuous EDF+ preview (shipped in 1.5.0).** The bounded waveform, channel metadata and BIDS event workflow implements the first slice of recording preview design (#24). Keep discontinuous EDF+D and unknown-duration files in the technical-summary fallback. Synthetic loose/archive SSH checks, final-candidate compatibility and user-assisted physiological EEG/VoiceOver checks passed. MEG and other EEG formats need separate future scope; 1.5.0 does not promise those decoders.

The [first recording-preview design](RESEARCH.md#recording-previews-first-scope--november-24-2026) selects EDF/continuous EDF+ EEG as the initial binary format. Public artificial-signal headers have been checked; 1.5.0 includes a technical-header summary and checked prefix readers for loose files and supported archives. Supported recordings open directly to a compact waveform editor with logical recording labels and channel selection above the plots. Bounded waveform windows now work for ordinary EDF and continuous EDF+ with a known duration, including supported archive prefixes. The waveform editor now resolves applicable channels/events tables across the logical ancestors, preserves physical source choices, shows recorded channel status and header differences, and offers a bounded event timeline and paged event navigation. The [synthetic Rorqual audit](docs/evidence/edf-remote/REPORT.md) passed across loose/ZIP/tar/gzip tar/SquashFS sources, with bounded client persistence findings. Event dictionaries and EDF+ annotation decoding and efficient access to later archived windows remain deferred. MEG format support and signal decoding remain separate scope decisions; the initial EDF work does not provide them.

Recognize existing participant/run QC reports and derivative confound tables as useful related resources. Start with explicit report access and recorded motion/FD/DVARS plots, with units, missing values and source evidence. This is a medium-priority follow-up to event/recording preview design (#24), not execution of MRIQC/fMRIPrep or an automatic quality verdict. Scope report-resource handling and safe opening, especially over SSH/from archives, before implementing it.

## Tables and cohort exploration

Build beyond bounded small-table snapshots without presenting unchecked rows as absent. Keep identifiers, dictionaries, join grain and source coverage understandable to researchers. Large-table handling precedes promises of cohort-scale external joins.

- [Large participant/event-table paging (#15)](https://github.com/dlq/bids-explorer/issues/15).
- [Explicit clinical table join design (#30)](https://github.com/dlq/bids-explorer/issues/30).

High-priority directions from the tool comparison, to scope as separate issues before implementation:

- **Find acquisitions across a study:** filter by BIDS entities and effective recorded metadata, such as resting-state BOLD in session 2 with TR below one second; reveal/open results with physical source choices. This complements participant availability. Use bounded background indexing and paged results, and distinguish unchecked or ambiguous metadata from a non-match. Saved queries remain outside the initial scope.
- **Compare acquisition parameters:** compare selected scans and eventually protocol groups across participants/sessions using TR, TE, voxel spacing, dimensions, phase encoding and volume counts. Show recorded/header provenance, missing values and differences without treating heterogeneity as invalid BIDS. Header reads and cohort-wide metadata work must be explicit, bounded and cancellable; define grouping/tolerance rules before collapsing values.
- **Export the current selection:** export participant IDs or an acquisition inventory to a user-selected destination outside source data. Preserve exact identifiers, logical paths, physical source choices, filter/snapshot context and incomplete coverage. Scope this alongside search and large-table work (#15); it does not authorize dataset edits or bulk image extraction.

### Whole-dataset consistency review

Explore a read-only review that brings together modality and session coverage, recorded links between scans, and acquisition parameter differences across participants. Start with a chosen cohort and explicit expectations, such as which modalities should be present in each session. Show absent expected scans, unresolved field-map references, and protocol differences alongside the scope that was checked.

Distinguish confirmed absence, incomplete checks, unreadable or ambiguous sources, and differences that may be intentional. Let users jump from a finding to the relevant scan, table row, or metadata field, with physical source choices where needed. Build on Availability, scan-row navigation (#23), field-map targets (#14), and acquisition comparison. Coordinate with the separate read-only BIDS validation design (#16) so conformance findings have a clear source and meaning.

Scope the first review around existing inventories and bounded metadata reads, with progress and cancellation for large or remote studies. Use a small synthetic study with mixed modalities, intentional protocol differences, and incomplete coverage to test the design. The provisional target is 1.9.0, after source navigation and acquisition comparison.

## Reliable access at scale

Preserve browsing and useful completed work as sources grow, use unsupported compression or become unavailable. Measure filesystem, indexing, extraction, transfer, decoding and rendering separately before optimizing.

- **Remote image persistence.** The [repeat audit](RESEARCH.md#follow-up-with-streamed-image-messages) verified progressive viewing and found no new image bytes in the scanned client profile. Retain the Remote SSH guide’s distinction between image transfer, copies made by earlier versions, and VS Code workspace traces. [Audit issue #41](https://github.com/dlq/bids-explorer/issues/41)
- **Minimize and protect retained remote data.** For local caches and logs managed by BIDS Explorer, assess which data can be omitted and which diagnostics can omit or scrub study paths, participant identifiers, metadata and image content before writing to disk. Include errors and diagnostic exports in that review. Where policy permits and the workflow requires local retention, evaluate encryption at rest, key management and retention limits. For storage managed by VS Code or the operating system, document which controls belong to the deployment. Use synthetic markers to verify that the chosen controls cover the recorded paths.
- [Additional SquashFS compression evaluation (#26)](https://github.com/dlq/bids-explorer/issues/26).
- [Shared image-cache budget reservations across windows (#31)](https://github.com/dlq/bids-explorer/issues/31), included in 1.0.3; verification and recovery limits are recorded in RESEARCH.md and the release record.
- [Unexpected Remote SSH transport-loss recovery (#27)](https://github.com/dlq/bids-explorer/issues/27).
- [Large progressive 4D memory/GPU profiling (#28)](https://github.com/dlq/bids-explorer/issues/28).

## Viewer capabilities

Versions 1.3.0 and 1.4.0 shipped coordinate entry, voxel values, orientation controls, Lightbox, PNG export, Crosshair cutaway, 4D playback and the voxel signal plot. Current behavior and limits belong in the [Imaging reference](docs/EXPLORER_REFERENCE.md#native-imaging-view). Version 1.5.0 adds bounded EDF/continuous EDF+ EEG inspection. The next tentative feature target is field-map navigation and acquisition groupings in 1.6.0.

Use documented APIs in the packaged NiiVue version. Evaluate selected plugins and derivative overlays as separate investigations, with practitioner workflows, spatial relationships and resource measurements informing any implementation target.

- [NiiVue plugin evaluation and enablement recommendation (#20)](https://github.com/dlq/bids-explorer/issues/20).
- [Explicit derivative image overlay design (#21)](https://github.com/dlq/bids-explorer/issues/21).

### Surface browsing and viewing — release not yet assigned

Extend the logical derivative view and built-in viewer to surface meshes, including GIFTI `.surf.gii` and native FreeSurfer surfaces such as `lh.white`, `rh.pial` and inflated surfaces, including files supplied with a `.surf` extension. Determine the actual format rather than assuming that every `.surf` file has the same encoding. BIDS describes GIFTI surface geometry in its [derivatives format conventions](https://bids-specification.readthedocs.io/en/stable/derivatives/introduction.html#gifti-surface-data-format); native pipeline outputs may coexist under `derivatives/` without following those conventions. Keep format support and BIDS conformance separate.

Present surfaces within participant/session and pipeline context, with readable hemisphere and surface-type labels. Preserve exact filenames, physical sources and choices between duplicate logical paths. Start with opening and inspecting an individual mesh, with rotation, zoom and useful geometry/source information. Evaluate documented APIs in the packaged NiiVue library before choosing the implementation. Surface scalar maps, parcellations and surface-to-volume overlays need separate scope; do not infer spatial alignment from matching participant labels.

Before implementation, create a scoped issue and choose small public or synthetic GIFTI and native FreeSurfer examples. Check recognition and viewing across loose files, ZIP, tar and SquashFS, locally and over Remote SSH. Measure selected-member reads, transfer and mesh memory costs, with cancellation and explicit unsupported-format messages. Keep dataset access read-only and avoid bulk extraction or automatic surface conversion. Assign a release after format/API investigation establishes a practical first scope.

## Validation and later editing workflows

Keep tolerant exploration independent of conformance checking. The intended sequence is explicit read-only validation, then reviewable rename/restructure previews, then a separately designed optional apply workflow. Archive mutation is a separate decision; extracted cache files are not editable originals. Any future writes require per-operation authorization, source rechecks, collision handling, provenance and a tested recovery/rollback strategy.

- [Explicit read-only validation design (#16)](https://github.com/dlq/bids-explorer/issues/16).
- [Read-only rename/restructure preview design (#29)](https://github.com/dlq/bids-explorer/issues/29), following the validation design.

## Deferred directions and open decisions

These remain ideas until a user problem and testable outcome justify a scoped issue:

- **Compare BIDS Explorer with ANCP Lab’s BIDS Manager.** Use the same small public or synthetic study to compare first use, browsing an existing dataset, metadata and image inspection, and how each tool handles dataset changes. Examine the 4D voxel time-series plot, including how the crosshair selects the voxel and how the plot labels time or volume. Examine the EEG/MEG signal viewer, including channel selection, navigation through a recording and how it displays events. Use examples with the relevant recordings. Document BIDS Manager’s conversion, editing and validation workflows alongside BIDS Explorer’s read-only browsing, archive support and Remote SSH access. Identify where the tools complement each other and which usability ideas fit the explorer. The [feature comparison](RESEARCH.md#bids-manager-comparison--november-10-2026) records the documentation review and ideas for the hands-on follow-up. [BIDS Manager documentation](https://ancplaboldenburg.github.io/bids_manager_documentation/index.html)
- Broader recorded dataset relationships, modality-specific channel/electrode/coordinate views and additional image/metadata coordination.
- QC annotations with separate provenance; no implicit source edits.
- Offline browsing, additional persistent/shared metadata caches and branch caching, justified by coverage requirements and measurements.
- Archives nested inside archives, additional tar variants and richer comparison/multiresolution scenes.
- **Possible BIDS Apps terminal assistance:** explore whether terminal guidance or an editable command prepared from selected datasets/participants would help practitioners. Start by establishing a useful workflow and whether documentation alone suffices. Consider local Docker and remote Apptainer/site scheduler environments, explicit app versions, read-only input mounts, separate output/work directories and optional linking of resulting derivatives. A logical archive/shard overlay is not automatically a filesystem input for an app: mounting/staging, storage costs and provenance need a separate design, with no silent bulk extraction. This is an uncertain, unscheduled possibility, not a commitment to install apps, execute commands, manage jobs or build a launcher. Any implementation needs a scoped issue and explicit selection first.
- **Possible read-only workflow awareness:** investigate whether following an externally submitted Slurm job or array would provide useful dataset context without overloading the explorer. Consider explicit job/cluster associations with a dataset, pipeline or participant selection; scheduler state, elapsed time and pending/failure reasons; bounded log access; and navigation to associated outputs. Evaluate a small, on-demand presentation within the existing BIDS context before adding a separate view. Associations and last-observed status could survive reconnects, with stale/unavailable states made clear. Any polling must be bounded, conservative and paused when disconnected; site accounting availability and job-array scale need investigation. Scheduler completion does not establish valid/complete outputs, and scheduler state does not provide a meaningful workflow percentage without workflow-specific evidence. This is an uncertain, unscheduled investigation, separate from BIDS App command preparation and from job submission, cancellation, retry or management. Scope an issue before implementation; no release is assigned.
  - **Nipoppy processing status:** explore linking an existing `processing_status.tsv` to BIDS Availability and showing reported status beside raw and derivative availability. Match participant and session labels and preserve pipeline name, version, and step. Try a small synthetic study to see whether the view helps find participants with both raw sessions and completed preprocessing, and distinguish missing tracker rows from reported incomplete outputs. Keep the source read-only and show when the status table was last read. Nipoppy can submit Slurm job arrays, while its tracker checks for expected outputs. Keep reported processing status separate from scheduler state and leave job submission to Nipoppy. [Nipoppy quickstart](https://nipoppy.readthedocs.io/en/latest/overview/quickstart/index.html) · [Nipoppy HPC guide](https://nipoppy.readthedocs.io/en/latest/how_to_guides/parallelization/hpc_scheduler.html)
  - **CBRAIN task status and outputs:** explore linking an existing CBRAIN task to a BIDS dataset or derivative pipeline. Start with a portal link and evaluate whether the documented API can add useful task status and links to output records. Use a small public or synthetic study to test whether outputs can be associated reliably with participants and sessions and whether that context belongs in BIDS Availability. Check authentication, task and file permissions, and whether output links work without transferring data. [CBRAIN API](https://portal.cbrain.mcgill.ca/swagger)
- Processing execution or Slurm submission remains a separate product decision. A custom renderer is not a current direction.

Use native README/license/citation editors where sufficient. Saved queries are not a current priority. Applying dataset edits has no assigned issue or release until its prerequisite designs are agreed.

## Completed milestones and evidence

Historical implementation detail is kept out of the active backlog. Follow [CHANGELOG.md](CHANGELOG.md) for shipped changes and these records for checks and their limits:

| Milestone                                             | Evidence                                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `0.1.0` — directory browsing                          | [Directory validation](docs/MILESTONE_0.1.0.md)                                                       |
| `0.2.0` — metadata and BIDS interpretation            | [Metadata validation](docs/MILESTONE_0.2.0.md)                                                        |
| `0.3.0` — logical ZIP browsing                        | [ZIP validation](docs/MILESTONE_0.3.0.md)                                                             |
| `0.4.0` — tar/tarball support                         | [Tar validation](docs/MILESTONE_0.4.0.md)                                                             |
| `0.5.0` — SquashFS and shards                         | [SquashFS validation](docs/MILESTONE_0.5.0.md)                                                        |
| `0.6.0` — persistent inventories and reconnect        | [SSH/inventory validation](docs/MILESTONE_0.6.0.md)                                                   |
| `0.7.0` — participant coverage and linked derivatives | [Overview observations](docs/MILESTONE_0.7.0.md)                                                      |
| `0.8.0` — viewer integration and cache lifetime       | [Viewer/cache observations](docs/MILESTONE_0.8.0.md), [compatibility evidence](docs/COMPATIBILITY.md) |
| `0.9.0` — stabilization                               | [Release artifact and compatibility evidence](docs/COMPATIBILITY.md#090-release-artifact)             |
| `1.0.0` — supported core                              | [Release validation](docs/MILESTONE_1.0.0.md), [usability evidence](docs/USABILITY.md)                |
| `1.0.1` / `1.0.2` — distribution and icon             | [1.0.1 verification](docs/MILESTONE_1.0.1.md), [1.0.2 verification](docs/MILESTONE_1.0.2.md)          |

[1.0.3 verification](docs/MILESTONE_1.0.3.md) records that release’s SSH testing limitation. [1.0.4 verification](docs/MILESTONE_1.0.4.md) records the fresh Remote SSH check, upgrade and shared-cache results, and distribution evidence.

### 1.5.0 recording verification

The [candidate and usability record](docs/evidence/edf-1.5.0/REPORT.md) includes physiological EEG, keyboard and dark/light/high-contrast checks, minimum/current installed-VSIX tests and 14 Remote SSH cases. A theme-redraw fix is included. The user confirmed the realistic waveform presentation looked good and VoiceOver announced everything clearly on November 26, 2026. The [synthetic Remote SSH audit](docs/evidence/edf-remote/REPORT.md) and bounded final-candidate marker scan document the checked persistence scope; they do not guarantee retention behavior for every client or mechanism. Further EEG/MEG formats, EDF+ annotation decoding and efficient late archive windows remain separate work under recording preview design (#24).
