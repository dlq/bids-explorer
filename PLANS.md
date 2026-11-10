# BIDS Explorer roadmap

Updated November 10, 2026. This document records direction, priorities and scope boundaries. GitHub issues carry individual work items; a roadmap entry or open issue is not a promise of a release or authorization to change datasets.

## Purpose and supported core

Help neuroimaging practitioners explore studies through a readable logical BIDS tree, source-backed metadata, participant coverage and image viewing. Support ordinary directories and documented ZIP, tar/tarball and SquashFS variants, locally and through VS Code Remote SSH. Preserve access to the physical files and original identifiers.

The supported core is established through 1.0; the release candidate manifest is 1.0.4. Implemented behavior and limitations belong in the [user guide](docs/USER_GUIDE.md), [explorer reference](docs/EXPLORER_REFERENCE.md) and [compatibility matrix](docs/COMPATIBILITY.md). [PROJECT.md](PROJECT.md) gives project context; [RESEARCH.md](RESEARCH.md) records exploration, alternatives and evidence.

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

| Release     | Outcome                                                | Associated work                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1.0.3`     | Maintenance and reliability.                           | Completed shared-cache, paging, Availability, lifecycle, packaging and documentation corrections. See the 1.0.3 verification record for checks and the explicitly accepted SSH viewer limitation.                                                                                                                                                                                                          |
| `1.0.4`     | Publish the shared-cache security correction promptly. | [Merged security maintenance (#36)](https://github.com/dlq/bids-explorer/pull/36): bounded, revision-checked ticket reads, race/cancellation regressions, updated development tools, patched transitive dependencies, the **Imaging** sidebar title and beginner Remote SSH documentation. Publish at the next authorized release opportunity after candidate checks; do not wait for activation research. |
| `1.0.5`     | Startup efficiency, conditional on measured benefit.   | [Profile activation and evaluate a production host bundle (#32)](https://github.com/dlq/bids-explorer/issues/32). Compare cold/warm activation and package contents. Publish a patch only if a worthwhile compatible improvement results; research alone does not require a release.                                                                                                                       |
| `1.1.0`     | Navigate from recorded scans to their data.            | [Scans-table row navigation (#23)](https://github.com/dlq/bids-explorer/issues/23): reveal/open the recorded resource, preserve physical source choices, and distinguish missing, unchecked and ambiguous targets.                                                                                                                                                                                         |
| `1.2.0`     | Browse large participant tables.                       | First implementation of [large-table support (#15)](https://github.com/dlq/bids-explorer/issues/15), starting with participants.tsv: bounded reading/indexing, paging, cancellable filtering and accurate coverage. Event tables follow as separately scoped work; this release need not close the whole issue.                                                                                            |
| Later `1.x` | Further focused compatible improvements.               | Prioritize field-map target navigation (#14) and additional acquisition collections (#22) after the sequence above. Select each scope explicitly.                                                                                                                                                                                                                                                          |
| `2.0.0`     | A justified breaking change only.                      | Changes to documented commands/settings, registrations, persisted identities or workflows require migration guidance.                                                                                                                                                                                                                                                                                      |

This sequence is agreed; calendar dates remain unset. The next publication target is the 1.0.4 maintenance patch. Version 1.0.3 has been released on GitHub and validated in the Marketplace; later releases still require explicit selection and publication authorization. Keep each feature release focused, with synthetic loose/ZIP/tar/SquashFS coverage, an authorized SSH smoke, user documentation and a short practitioner walkthrough. Readiness checks and individual acceptance criteria remain in TESTING.md, VERSIONING.md and the linked issues rather than a duplicated roadmap checklist.

Correctness, data handling and usability defects take priority over optional capabilities. Keep overlays, plugins, clinical joins and validation outside these release scopes. Optional investigations and the remaining backlog below have no assigned release or date. The viewer/BIDS-tool comparison adds priorities for later feature selection, without expanding 1.0.4 or changing the agreed 1.1/1.2 sequence; see the [comparison findings](RESEARCH.md#viewer-and-bids-tool-comparison--november-8-2026). Follow [VERSIONING.md](VERSIONING.md) when preparing each release.

## Next publication: 1.0.4 maintenance patch

The security correction in [PR #36](https://github.com/dlq/bids-explorer/pull/36) is merged into main, but Marketplace users still receive 1.0.3. Publish this compatible runtime fix at the next authorized release opportunity; development-tool updates alone would normally wait for another release. Include the compatible sidebar/container rename to **Imaging**, with existing view IDs and placement retained and current user instructions updated. Include the [beginner Remote SSH walkthrough](docs/REMOTE_SSH.md), its links from getting-started/help documentation, and the roadmap/research updates. The possible BIDS App assistance and read-only workflow tracking remain unscheduled explorations; documenting them does not add those capabilities to 1.0.4. Keep startup optimization out of this patch. The 1.0.4 candidate is in release preparation.

The merged source passes 182 unit tests with the per-file coverage gate, 58 integration tests on each of minimum/current VS Code, packaging, Semgrep and hosted CI/CodeQL. The November 8 review found zero open CodeQL/Dependabot alerts and zero npm audit vulnerabilities. These are pre-release observations; recheck the actual release commit and artifact.

For this patch, prioritize an installed-package upgrade smoke from 1.0.3, retained registrations/placements, and two windows sharing an archive-image cache: open/retain an image, contend for the budget, cancel/retry and clear safely. Use synthetic data. Retry the outstanding fresh Remote SSH viewer/metadata smoke when Rorqual access is reliable, including the cache tests against the packaged modules. The 1.0.3 outage exception applies to that release only; if SSH remains unavailable, record the gap and obtain a fresh release decision. Unexpected transport-loss testing is broader follow-up work in #27, not a claim established by a successful reconnect.

Use the existing [versioning procedure](VERSIONING.md#preparing-an-authorized-release) and [publishing workflow](docs/PUBLISHING.md#release-workflow): prepare 1.0.4 with synchronized manifest/lockfile and dated release notes, verify the candidate, then create an authorized immutable tag and stable GitHub Release. The OIDC workflow builds/tests and publishes its exact hosted VSIX. Attach that same package and checksum to the GitHub release, then confirm the validated Marketplace version, downloaded package checksum and icon. An upload or a green CI run alone does not establish public availability. Record checks, exceptions and publication evidence in a 1.0.4 milestone record when the release is prepared.

## Maintenance and evidence to carry forward

- **Security maintenance:** triage new CodeQL and Dependabot findings before release; separate runtime exposure from development-tool findings. Publish compatible runtime security/correctness fixes promptly after verification instead of waiting for a feature milestone. Review the temporary dependency overrides on future tooling updates, removing each once upstream supports the patched dependency range; keep clean-install, failure-reporting and packaging checks.
- **Upgrade and recovery:** include upgrade checks from the currently published version when changing shared caches or persisted state. Preserve registrations, placements and source choices, and explain any required window reload or cache rebuild. Prioritize authorized unexpected SSH-loss testing ([#27](https://github.com/dlq/bids-explorer/issues/27)) when reliable access permits; ship reproduced compatible fixes in the next appropriate patch without holding unrelated work for an unbounded investigation.
- **Measured performance:** build a small repeatable baseline alongside activation work ([#32](https://github.com/dlq/bids-explorer/issues/32)): cold/warm startup and cache reuse, first tree response, participant filtering and first-frame/full-image loading. Use representative supported sources and separate local/SSH, transfer/decoding and memory costs. Choose regression budgets after measurement; do not promise arbitrary timings or benchmark every large dataset on each patch. Extend image memory/GPU measurements under [#28](https://github.com/dlq/bids-explorer/issues/28).
- **Practitioner acceptance:** for each feature milestone, select a short real workflow (for example, locate a recorded scan or find a participant with both sessions and preprocessing), confirm source/coverage explanations and keyboard usability, and update getting-started/reference documentation. Keep broad feature ideas out of maintenance patches.

These priorities supplement the linked work items; they do not assign overlays, plugins, validation or external joins to an upcoming release. Detailed acceptance criteria and new implementation tasks belong in issues, rather than a second backlog here.

## Beginner workflow documentation

First improve orientation in the existing quickstart with a short **Find your way around** section and one annotated screenshot identifying the native file tree, logical BIDS tree, image viewer and Imaging controls. Show which folder to open with a concrete `dataset_description.json` example and distinguish the starting point for archive collections. State the expected sample result so readers can tell setup succeeded. Add a small glossary for participant, session, acquisition, derivative and inherited metadata; explain read-only browsing, external caches and the separate act of editing an original. Give short recovery pointers for hidden views, display reset, refresh and troubleshooting. Keep this in the existing guide rather than adding another standalone page.

Match screenshots and visible labels to the documented release. Until 1.0.4 is published, Marketplace users still have the older image-sidebar titles; distinguish upcoming main-branch instructions from the installed release, and update screenshots/links during release closeout.

Write one compact **Everyday workflows** Markdown page under `docs/`, alongside the existing five-minute quickstart and Remote SSH walkthrough. Use short sections for finding participant coverage, understanding inherited scan metadata, browsing archives, linking separately stored raw/derivative datasets and inspecting images/diffusion gradients. Prioritize availability and metadata inheritance; describe only implemented behavior.

Give each example one concrete task and an expected result. Once a signal preview is available, consider a small recording with events for a walkthrough on finding a channel and an event.

Use small public or synthetic examples, expected results and brief help when a study looks different, especially Missing versus Not checked and ambiguous metadata/source choices. Link the three guides from a concise Getting started list in the README and Marketplace description. GitHub renders the pages; no separate documentation site is needed, and the detailed reference remains separate. This is planned documentation work, not a blocker for the 1.0.4 security release or a new feature commitment. Scope a documentation issue when the work is selected.

## Metadata and study relationships

Make recorded relationships useful for navigation while keeping interpretation distinct from validation. Extend the logical view using BIDS semantics, inheritance and explicit references; keep ambiguous and incomplete relationships visible.

- [Field-map target navigation (#14)](https://github.com/dlq/bids-explorer/issues/14).
- [Additional acquisition collections, such as flip/inversion/MT variants (#22)](https://github.com/dlq/bids-explorer/issues/22).
- [Navigation from recorded scans-table filenames (#23)](https://github.com/dlq/bids-explorer/issues/23).
- [Event and recording preview design (#24)](https://github.com/dlq/bids-explorer/issues/24).
- [Bounded scan summaries for tree descriptions (#25)](https://github.com/dlq/bids-explorer/issues/25).

- **Jump to the source of a finding.** From an inherited value or a recorded scan reference, take the user to the relevant source file and field or row where available. Preserve source choices for ambiguous matches. Reuse this navigation in the future explicit validation workflow.
- **Start EEG/MEG preview with a recording summary.** Show channels, sampling rate, duration and related event files when available. Under recording preview design (#24), evaluate loading a bounded time window on demand, with channel selection and event markers. Measure the data needed to open a small window over SSH before choosing how to handle compressed and archived recordings.

Recognize existing participant/run QC reports and derivative confound tables as useful related resources. Start with explicit report access and recorded motion/FD/DVARS plots, with units, missing values and source evidence. This is a medium-priority follow-up to event/recording preview design (#24), not execution of MRIQC/fMRIPrep or an automatic quality verdict. Scope report-resource handling and safe opening, especially over SSH/from archives, before implementing it.

## Tables and cohort exploration

Build beyond bounded small-table snapshots without presenting unchecked rows as absent. Keep identifiers, dictionaries, join grain and source coverage understandable to researchers. Large-table handling precedes promises of cohort-scale external joins.

- [Large participant/event-table paging (#15)](https://github.com/dlq/bids-explorer/issues/15).
- [Explicit clinical table join design (#30)](https://github.com/dlq/bids-explorer/issues/30).

High-priority directions from the tool comparison, to scope as separate issues before implementation:

- **Find acquisitions across a study:** filter by BIDS entities and effective recorded metadata, such as resting-state BOLD in session 2 with TR below one second; reveal/open results with physical source choices. This complements participant availability. Use bounded background indexing and paged results, and distinguish unchecked or ambiguous metadata from a non-match. Saved queries remain outside the initial scope.
- **Compare acquisition parameters:** compare selected scans and eventually protocol groups across participants/sessions using TR, TE, voxel spacing, dimensions, phase encoding and volume counts. Show recorded/header provenance, missing values and differences without treating heterogeneity as invalid BIDS. Header reads and cohort-wide metadata work must be explicit, bounded and cancellable; define grouping/tolerance rules before collapsing values.
- **Export the current selection:** export participant IDs or an acquisition inventory to a user-selected destination outside source data. Preserve exact identifiers, logical paths, physical source choices, filter/snapshot context and incomplete coverage. Scope this alongside search and large-table work (#15); it does not authorize dataset edits or bulk image extraction.

## Reliable access at scale

Preserve browsing and useful completed work as sources grow, use unsupported compression or become unavailable. Measure filesystem, indexing, extraction, transfer, decoding and rendering separately before optimizing.

- **Audit Remote SSH data persistence with a synthetic study.** Use an opt-in SSH test with a disposable local VS Code profile and distinctive synthetic paths, participant labels, metadata and image content. Compare a connection-only baseline with browsing, previewing loose and archived files, closing views, reloading and reconnecting. On the client, check recent paths, editor backups and state, logs and webview storage. On the server, check extension storage, including indexes, availability snapshots and extracted images. Record what was sent for display, what persisted, where it landed and whether VS Code or BIDS Explorer wrote it. Use the findings to evaluate approved cache locations and optional persistence controls. This investigation has no assigned release.
- **Minimize and protect retained remote data.** For local caches and logs managed by BIDS Explorer, assess which data can be omitted and which diagnostics can omit or scrub study paths, participant identifiers, metadata and image content before writing to disk. Include errors and diagnostic exports in that review. Where policy permits and the workflow requires local retention, evaluate encryption at rest, key management and retention limits. For storage managed by VS Code or the operating system, document which controls belong to the deployment. Use synthetic markers to verify that the chosen controls cover the recorded paths.
- [Additional SquashFS compression evaluation (#26)](https://github.com/dlq/bids-explorer/issues/26).
- [Shared image-cache budget reservations across windows (#31)](https://github.com/dlq/bids-explorer/issues/31), included in 1.0.3; verification and recovery limits are recorded in RESEARCH.md and the release record.
- [Unexpected Remote SSH transport-loss recovery (#27)](https://github.com/dlq/bids-explorer/issues/27).
- [Activation profiling and production host bundling evaluation (#32)](https://github.com/dlq/bids-explorer/issues/32).
- [Large progressive 4D memory/GPU profiling (#28)](https://github.com/dlq/bids-explorer/issues/28).

## Viewer capabilities

Keep a useful built-in viewer with optional external editors. Prioritize everyday image inspection in later feature releases:

- **Position, values and orientation (high):** direct voxel/physical-coordinate entry, the selected voxel value, and an explicit radiological/neurological display convention. Respect recorded spatial units and transforms, distinguish image coordinates from a named template space, and explain missing or conflicting transform information. Display controls must not rewrite image orientation or headers.
- **Lightbox/mosaic and screenshot export (high):** inspect a bounded set of slices with understandable plane/range/spacing controls, and save the displayed view to a user-selected destination. Keep orientation, scale and source context available; exported pictures are separate from dataset images.
- **4D inspection (medium).** Today the Volume slider lets you select one volume at a time after the full image loads. In a BOLD fMRI run, the crosshair chooses **where** to look in the brain, and the slider chooses **which volume** to display. Play and Pause are planned additions that would advance through volumes automatically.
- **Plot the signal at the crosshair.** For a 4D run, show how the signal at the selected voxel changes from volume to volume. Moving the crosshair to a different voxel changes the trace. Moving the Volume slider changes the displayed volume and moves a marker on that trace. Start with recorded image units. Label the horizontal axis in seconds when timing is established, including recorded irregular PET frame times, and use volume numbers otherwise. Keep loaded and pending volumes distinguishable during progressive loading. Bound plotting and memory work in coordination with large-4D profiling (#28) and event/recording design (#24).

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

[1.0.3 verification and publication](docs/MILESTONE_1.0.3.md) records the completed maintenance release and its SSH testing limitation.
