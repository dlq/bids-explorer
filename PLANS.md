# BIDS Explorer roadmap

Updated November 8, 2026. This document records direction, priorities and scope boundaries. GitHub issues carry individual work items; a roadmap entry or open issue is not a promise of a release or authorization to change datasets.

## Purpose and supported core

Help neuroimaging practitioners explore studies through a readable logical BIDS tree, source-backed metadata, participant coverage and image viewing. Support ordinary directories and documented ZIP, tar/tarball and SquashFS variants, locally and through VS Code Remote SSH. Preserve access to the physical files and original identifiers.

The supported core is established through 1.0; the manifest is currently 1.0.3. Implemented behavior and limitations belong in the [user guide](docs/USER_GUIDE.md), [explorer reference](docs/EXPLORER_REFERENCE.md) and [compatibility matrix](docs/COMPATIBILITY.md). [PROJECT.md](PROJECT.md) gives project context; [RESEARCH.md](RESEARCH.md) records exploration, alternatives and evidence.

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

| Release     | Outcome                                              | Associated work                                                                                                                                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1.0.3`     | Maintenance and reliability.                         | Completed shared-cache, paging, Availability, lifecycle, packaging and documentation corrections. See the 1.0.3 verification record for checks and the explicitly accepted SSH viewer limitation.                                                                                                               |
| `1.0.4`     | Startup efficiency, conditional on measured benefit. | [Profile activation and evaluate a production host bundle (#32)](https://github.com/dlq/bids-explorer/issues/32). Compare cold/warm activation and package contents. Publish a patch only if a worthwhile compatible improvement results; research alone does not require a release.                            |
| `1.1.0`     | Navigate from recorded scans to their data.          | [Scans-table row navigation (#23)](https://github.com/dlq/bids-explorer/issues/23): reveal/open the recorded resource, preserve physical source choices, and distinguish missing, unchecked and ambiguous targets.                                                                                              |
| `1.2.0`     | Browse large participant tables.                     | First implementation of [large-table support (#15)](https://github.com/dlq/bids-explorer/issues/15), starting with participants.tsv: bounded reading/indexing, paging, cancellable filtering and accurate coverage. Event tables follow as separately scoped work; this release need not close the whole issue. |
| Later `1.x` | Further focused compatible improvements.             | Prioritize field-map target navigation (#14) and additional acquisition collections (#22) after the sequence above. Select each scope explicitly.                                                                                                                                                               |
| `2.0.0`     | A justified breaking change only.                    | Changes to documented commands/settings, registrations, persisted identities or workflows require migration guidance.                                                                                                                                                                                           |

This sequence is agreed; dates remain unset. Version 1.0.3 has been released on GitHub and uploaded to the Marketplace; later releases still require explicit selection and publication authorization. Keep each feature release focused, with synthetic loose/ZIP/tar/SquashFS coverage, an authorized SSH smoke, user documentation and a short practitioner walkthrough. Readiness checks and individual acceptance criteria remain in TESTING.md, VERSIONING.md and the linked issues rather than a duplicated roadmap checklist.

Correctness, data handling and usability defects take priority over optional capabilities. Keep overlays, plugins, clinical joins and validation outside these release scopes. Optional investigations and the remaining backlog below have no assigned release or date. Follow [VERSIONING.md](VERSIONING.md) when preparing each release.

## Metadata and study relationships

Make recorded relationships useful for navigation while keeping interpretation distinct from validation. Extend the logical view using BIDS semantics, inheritance and explicit references; keep ambiguous and incomplete relationships visible.

- [Field-map target navigation (#14)](https://github.com/dlq/bids-explorer/issues/14).
- [Additional acquisition collections, such as flip/inversion/MT variants (#22)](https://github.com/dlq/bids-explorer/issues/22).
- [Navigation from recorded scans-table filenames (#23)](https://github.com/dlq/bids-explorer/issues/23).
- [Event and recording preview design (#24)](https://github.com/dlq/bids-explorer/issues/24).
- [Bounded scan summaries for tree descriptions (#25)](https://github.com/dlq/bids-explorer/issues/25).

## Tables and cohort exploration

Build beyond bounded small-table snapshots without presenting unchecked rows as absent. Keep identifiers, dictionaries, join grain and source coverage understandable to researchers. Large-table handling precedes promises of cohort-scale external joins.

- [Large participant/event-table paging (#15)](https://github.com/dlq/bids-explorer/issues/15).
- [Explicit clinical table join design (#30)](https://github.com/dlq/bids-explorer/issues/30).

## Reliable access at scale

Preserve browsing and useful completed work as sources grow, use unsupported compression or become unavailable. Measure filesystem, indexing, extraction, transfer, decoding and rendering separately before optimizing.

- [Additional SquashFS compression evaluation (#26)](https://github.com/dlq/bids-explorer/issues/26).
- [Shared image-cache budget reservations across windows (#31)](https://github.com/dlq/bids-explorer/issues/31), included in 1.0.3; verification and recovery limits are recorded in RESEARCH.md and the release record.
- [Unexpected Remote SSH transport-loss recovery (#27)](https://github.com/dlq/bids-explorer/issues/27).
- [Activation profiling and production host bundling evaluation (#32)](https://github.com/dlq/bids-explorer/issues/32).
- [Large progressive 4D memory/GPU profiling (#28)](https://github.com/dlq/bids-explorer/issues/28).

## Viewer capabilities

Keep a useful built-in viewer with optional external editors. Investigate selected NiiVue plugins and explicit derivative overlays as separate, unscheduled capabilities. Neither automatically brings the other into a release. Spatial relationships and resource limits must be established before richer scenes or synchronization are enabled.

- [NiiVue plugin evaluation and enablement recommendation (#20)](https://github.com/dlq/bids-explorer/issues/20).
- [Explicit derivative image overlay design (#21)](https://github.com/dlq/bids-explorer/issues/21).

## Validation and later editing workflows

Keep tolerant exploration independent of conformance checking. The intended sequence is explicit read-only validation, then reviewable rename/restructure previews, then a separately designed optional apply workflow. Archive mutation is a separate decision; extracted cache files are not editable originals. Any future writes require per-operation authorization, source rechecks, collision handling, provenance and a tested recovery/rollback strategy.

- [Explicit read-only validation design (#16)](https://github.com/dlq/bids-explorer/issues/16).
- [Read-only rename/restructure preview design (#29)](https://github.com/dlq/bids-explorer/issues/29), following the validation design.

## Deferred directions and open decisions

These remain ideas until a user problem and testable outcome justify a scoped issue:

- Broader recorded dataset relationships, modality-specific channel/electrode/coordinate views and additional image/metadata coordination.
- QC annotations with separate provenance; no implicit source edits.
- Offline browsing, additional persistent/shared metadata caches and branch caching, justified by coverage requirements and measurements.
- Archives nested inside archives, additional tar variants and richer comparison/multiresolution scenes.
- Processing execution or Slurm submission. These remain separate from the explorer; a custom renderer is not a current direction.

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
