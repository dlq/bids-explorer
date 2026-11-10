# BIDS Explorer roadmap

Updated November 10, 2026. This document records direction, priorities and scope boundaries. GitHub issues carry individual work items; a roadmap entry or open issue is not a promise of a release or authorization to change datasets.

## Purpose and supported core

Help neuroimaging practitioners explore studies through a readable logical BIDS tree, source-backed metadata, participant coverage and image viewing. Support ordinary directories and documented ZIP, tar/tarball and SquashFS variants, locally and through VS Code Remote SSH. Preserve access to the physical files and original identifiers.

The supported core is established through 1.0; the manifest is currently 1.0.4. Implemented behavior and limitations belong in the [user guide](docs/USER_GUIDE.md), [explorer reference](docs/EXPLORER_REFERENCE.md) and [compatibility matrix](docs/COMPATIBILITY.md). [PROJECT.md](PROJECT.md) gives project context; [RESEARCH.md](RESEARCH.md) records exploration, alternatives and evidence.

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

| Release             | Outcome                                                         | Associated work                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1.0.3`             | Maintenance and reliability.                                    | Completed shared-cache, paging, Availability, lifecycle, packaging and documentation corrections. See the 1.0.3 verification record for checks and the explicitly accepted SSH viewer limitation.                                                                                                                                                                          |
| `1.0.4`             | Shared cache security, Imaging sidebar and Remote SSH guidance. | See the [1.0.4 verification record](docs/MILESTONE_1.0.4.md) for the installed upgrade, two-window cache and fresh synthetic SSH checks.                                                                                                                                                                                                                                   |
| `1.0.5`             | Startup efficiency, conditional on measured benefit.            | [Profile activation and evaluate a production host bundle (#32)](https://github.com/dlq/bids-explorer/issues/32). Compare cold/warm activation and package contents. Publish a patch only if a worthwhile compatible improvement results; research alone does not require a release.                                                                                       |
| `1.1.0`             | Find a scan and open its source.                                | Use [scans-table row navigation (#23)](https://github.com/dlq/bids-explorer/issues/23) as the first jump-to-source workflow. Preserve source choices and distinguish missing, unchecked and ambiguous targets. Add the [annotated Quickstart screenshot and scan-navigation example (#40)](https://github.com/dlq/bids-explorer/issues/40).                                |
| `1.2.0`             | Browse large participant tables.                                | Start [large-table support (#15)](https://github.com/dlq/bids-explorer/issues/15) with bounded reads, paging, cancellable filtering and clear coverage for `participants.tsv`. Publish the Everyday workflows guide and distinguish looking up participant attributes from checking session and derivative coverage in Availability. Large event tables follow separately. |
| `1.3.0`             | Improve everyday image inspection.                              | Add direct coordinate entry, voxel values, explicit display orientation, lightbox and screenshot export.                                                                                                                                                                                                                                                                   |
| `1.4.0`             | Inspect changes across a 4D image.                              | Add Play and Pause and a signal plot for the voxel at the crosshair. The Volume slider selects the displayed volume and marks it on the plot.                                                                                                                                                                                                                              |
| `1.5.0` (tentative) | Preview EEG and MEG recordings.                                 | Start with recording details and related events. Include channel and event navigation in a bounded signal window if source and SSH measurements show that it is practical. [Recording preview design (#24)](https://github.com/dlq/bids-explorer/issues/24)                                                                                                                |
| Later `1.x`         | Further focused improvements.                                   | Field-map target navigation (#14) and additional acquisition collections (#22) remain candidates.                                                                                                                                                                                                                                                                          |
| `2.0.0`             | A justified breaking change only.                               | Changes to documented commands/settings, registrations, persisted identities or workflows require migration guidance.                                                                                                                                                                                                                                                      |

These are release targets. Calendar dates remain open. Version 1.0.4 is the current maintenance release. Startup profiling remains the next investigation, with a 1.0.5 patch conditional on its results. Run the [synthetic Remote SSH data-persistence audit (#41)](https://github.com/dlq/bids-explorer/issues/41) before 1.1.0 and use its findings to decide whether a maintenance patch is needed. Keep each feature release focused, with synthetic loose/ZIP/tar/SquashFS coverage, an authorized SSH smoke, user documentation and a short practitioner walkthrough. Readiness checks and individual acceptance criteria remain in TESTING.md, VERSIONING.md and the linked issues rather than a duplicated roadmap checklist.

Correctness, data handling and usability defects take priority over optional capabilities. Keep overlays, plugins, clinical joins and validation outside these release scopes. The release table gives the selected scope. Other investigations remain open for later selection. See the [comparison findings](RESEARCH.md#viewer-and-bids-tool-comparison--november-8-2026) for the rationale behind the viewer work. Follow [VERSIONING.md](VERSIONING.md) when preparing each release.

## Maintenance and evidence to carry forward

- **Security maintenance:** triage new CodeQL and Dependabot findings before release; separate runtime exposure from development-tool findings. Publish compatible runtime security/correctness fixes promptly after verification instead of waiting for a feature milestone. Review the temporary dependency overrides on future tooling updates, removing each once upstream supports the patched dependency range; keep clean-install, failure-reporting and packaging checks.
- **Upgrade and recovery:** include upgrade checks from the currently published version when changing shared caches or persisted state. Preserve registrations, placements and source choices, and explain any required window reload or cache rebuild. Prioritize authorized unexpected SSH-loss testing ([#27](https://github.com/dlq/bids-explorer/issues/27)) when reliable access permits; ship reproduced compatible fixes in the next appropriate patch without holding unrelated work for an unbounded investigation.
- **Measured performance:** build a small repeatable baseline alongside activation work ([#32](https://github.com/dlq/bids-explorer/issues/32)): cold/warm startup and cache reuse, first tree response, participant filtering and first-frame/full-image loading. Use representative supported sources and separate local/SSH, transfer/decoding and memory costs. Choose regression budgets after measurement; do not promise arbitrary timings or benchmark every large dataset on each patch. Extend image memory/GPU measurements under [#28](https://github.com/dlq/bids-explorer/issues/28).
- **Practitioner acceptance:** for each feature milestone, select a short real workflow (for example, locate a recorded scan or find a participant with both sessions and preprocessing), confirm source/coverage explanations and keyboard usability, and update getting-started/reference documentation. Keep broad feature ideas out of maintenance patches.

These priorities supplement the linked work items; they do not assign overlays, plugins, validation or external joins to an upcoming release. Detailed acceptance criteria and new implementation tasks belong in issues, rather than a second backlog here.

## Beginner workflow documentation

For 1.1.0, improve orientation in the existing quickstart with a short **Find your way around** section and one annotated screenshot identifying the native file tree, logical BIDS tree, image viewer and Imaging controls. Show which folder to open with a concrete `dataset_description.json` example and distinguish the starting point for archive collections. State the expected sample result so readers can tell setup succeeded. Add a small glossary for participant, session, acquisition, derivative and inherited metadata; explain read-only browsing, external caches and the separate act of editing an original. Give short recovery pointers for hidden views, display reset, refresh and troubleshooting. Add a short example that opens a scan from its `scans.tsv` row.

Match screenshots and visible labels to the documented release. The sidebar is titled Imaging starting in 1.0.4. Distinguish upcoming main-branch instructions from the installed release and update screenshots and links during release closeout.

For 1.2.0, write one compact **Everyday workflows** Markdown page under `docs/`, alongside the existing five-minute quickstart and Remote SSH walkthrough. Use short sections for finding participant coverage, understanding inherited scan metadata, browsing archives, linking separately stored raw/derivative datasets and inspecting images/diffusion gradients. Distinguish participant attributes in `participants.tsv` from session and derivative coverage in Availability. Prioritize availability and metadata inheritance and describe implemented behavior.

Give each example one concrete task and an expected result. Once a signal preview is available, consider a small recording with events for a walkthrough on finding a channel and an event.

Use small public or synthetic examples, expected results and brief help when a study looks different, especially Missing versus Not checked and ambiguous metadata/source choices. Link the three guides from a concise Getting started list in the README and Marketplace description. Use the existing GitHub Markdown pages and keep the detailed reference separate. Scope the documentation work in an issue when each release starts.

## Metadata and study relationships

Make recorded relationships useful for navigation while keeping interpretation distinct from validation. Extend the logical view using BIDS semantics, inheritance and explicit references; keep ambiguous and incomplete relationships visible.

- [Field-map target navigation (#14)](https://github.com/dlq/bids-explorer/issues/14).
- [Additional acquisition collections, such as flip/inversion/MT variants (#22)](https://github.com/dlq/bids-explorer/issues/22).
- [Navigation from recorded scans-table filenames (#23)](https://github.com/dlq/bids-explorer/issues/23).
- [Event and recording preview design (#24)](https://github.com/dlq/bids-explorer/issues/24).
- [Bounded scan summaries for tree descriptions (#25)](https://github.com/dlq/bids-explorer/issues/25).

- **Jump to the source of a finding.** Start with recorded scan references in 1.1.0. For inherited values, extend the pattern later to the source file and field or row where available. Preserve source choices for ambiguous matches. Reuse this navigation in the future explicit validation workflow.
- **Start EEG/MEG preview with a recording summary (tentative 1.5.0).** Show channels, sampling rate, duration and related event files when available. Under recording preview design (#24), evaluate loading a bounded time window on demand, with channel selection and event markers. Measure the data needed to open a small window over SSH before choosing how to handle compressed and archived recordings.

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

Scope the first review around existing inventories and bounded metadata reads, with progress and cancellation for large or remote studies. Use a small synthetic study with mixed modalities, intentional protocol differences, and incomplete coverage to test the design. This follow-up has no assigned release.

## Reliable access at scale

Preserve browsing and useful completed work as sources grow, use unsupported compression or become unavailable. Measure filesystem, indexing, extraction, transfer, decoding and rendering separately before optimizing.

- **Audit Remote SSH data persistence with a synthetic study.** Use an opt-in SSH test with a disposable local VS Code profile and distinctive synthetic paths, participant labels, metadata and image content. Compare a connection-only baseline with browsing, previewing loose and archived files, closing views, reloading and reconnecting. On the client, check recent paths, editor backups and state, logs and webview storage. On the server, check extension storage, including indexes, availability snapshots and extracted images. Record what was sent for display, what persisted, where it landed and whether VS Code or BIDS Explorer wrote it. Use the findings to evaluate approved cache locations and optional persistence controls. Run the audit before 1.1.0. Decide whether to ship a maintenance fix after reviewing the findings.
- **Minimize and protect retained remote data.** For local caches and logs managed by BIDS Explorer, assess which data can be omitted and which diagnostics can omit or scrub study paths, participant identifiers, metadata and image content before writing to disk. Include errors and diagnostic exports in that review. Where policy permits and the workflow requires local retention, evaluate encryption at rest, key management and retention limits. For storage managed by VS Code or the operating system, document which controls belong to the deployment. Use synthetic markers to verify that the chosen controls cover the recorded paths.
- [Additional SquashFS compression evaluation (#26)](https://github.com/dlq/bids-explorer/issues/26).
- [Shared image-cache budget reservations across windows (#31)](https://github.com/dlq/bids-explorer/issues/31), included in 1.0.3; verification and recovery limits are recorded in RESEARCH.md and the release record.
- [Unexpected Remote SSH transport-loss recovery (#27)](https://github.com/dlq/bids-explorer/issues/27).
- [Activation profiling and production host bundling evaluation (#32)](https://github.com/dlq/bids-explorer/issues/32).
- [Large progressive 4D memory/GPU profiling (#28)](https://github.com/dlq/bids-explorer/issues/28).

## Viewer capabilities

Keep a useful built-in viewer with optional external editors. Prioritize everyday image inspection in later feature releases:

- **Position, values and orientation (1.3.0).** direct voxel/physical-coordinate entry, the selected voxel value, and an explicit radiological/neurological display convention. Respect recorded spatial units and transforms, distinguish image coordinates from a named template space, and explain missing or conflicting transform information. Display controls must not rewrite image orientation or headers.
- **Lightbox and screenshot export (1.3.0).** inspect a bounded set of slices with understandable plane/range/spacing controls, and save the displayed view to a user-selected destination. Keep orientation, scale and source context available; exported pictures are separate from dataset images.
- **4D playback (1.4.0).** Today the Volume slider lets you select one volume at a time after the full image loads. In a BOLD fMRI run, the crosshair chooses **where** to look in the brain, and the slider chooses **which volume** to display. Play and Pause are planned additions that would advance through volumes automatically.
- **Plot the signal at the crosshair (1.4.0).** For a 4D run, show how the signal at the selected voxel changes from volume to volume. Moving the crosshair to a different voxel changes the trace. Moving the Volume slider changes the displayed volume and moves a marker on that trace. Start with recorded image units. Label the horizontal axis in seconds when timing is established, including recorded irregular PET frame times, and use volume numbers otherwise. Keep loaded and pending volumes distinguishable during progressive loading. Bound plotting and memory work in coordination with large-4D profiling (#28) and event/recording design (#24).

Scope these directions as separate issues before implementation, using documented APIs in the packaged NiiVue version. Library capability does not establish extension support or a tested archive/SSH workflow. Investigate selected NiiVue plugins and explicit derivative overlays as separate, unscheduled capabilities. Neither automatically brings the other into a release. Spatial relationships and resource limits must be established before richer scenes or synchronization are enabled.

- [NiiVue plugin evaluation and enablement recommendation (#20)](https://github.com/dlq/bids-explorer/issues/20).
- [Explicit derivative image overlay design (#21)](https://github.com/dlq/bids-explorer/issues/21).

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
