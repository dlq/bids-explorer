# BIDS Explorer implementation plan

Working plan, November 3, 2026. Update this as implementation reveals constraints. This describes intended work, not implemented capabilities or a commitment to every candidate feature.

## Goal and starting point

Make a VS Code extension for exploring BIDS datasets locally and over SSH, in ordinary directories, ZIP archives, tarballs and SquashFS images. Navigation and dataset context are the product; visualization is optional.

The TypeScript scaffold provides an empty Explorer view, a refresh command, F5 debugging, unit and extension-host tests, CI configuration and VSIX packaging. Dataset registration, browsing, indexing and archive readers remain unimplemented. Local checks and packaging passed; CI has not yet run on a hosted runner, and Remote SSH behavior has not yet been exercised.

Read [PROJECT.md](PROJECT.md), [RESEARCH.md](RESEARCH.md) for exploration and source references before implementing. Strata is reference material, not an implementation to copy wholesale.

## Design rules throughout

- Keep physical resources (host, URI, container and original member path), logical BIDS paths, semantic metadata and indexing coverage separate. Stable selections retain source identity; revisions invalidate caches.
- Preserve a physical-file view. Logical normalization must not rename files or lose provenance. Ambiguous mappings and duplicate logical paths require visible source choices.
- Start with lazy enumeration. Move substantial parsing, indexing, merging, sorting and summaries into cancellable background work. The extension host still needs to remain responsive; asynchronous filesystem calls alone do not solve CPU-heavy work.
- Publish bounded, immutable results and targeted tree refreshes. Preserve selection and expansion; already indexed branches remain usable during other work.
- Distinguish present, absent within a completely indexed scope, unknown and failed. Every count needs a defined scope and coverage.
- Run beside the filesystem through VS Code's workspace extension host. Use URI-aware boundaries and host-local workers/tools; do not introduce a second SSH transport by default.
- Keep indexes, image caches, credentials and large fixtures outside the repository. Use supported viewer APIs only.

## 1. First usable local dataset browser

Register a directory explicitly using **BIDS Explorer: Add Dataset**. Show dataset → participant → session → modality, with raw data and derivatives kept distinct. Support sessionless datasets and preserve unfamiliar files in the physical view.

Extend the core model with dataset registration, source revisions, coverage scope and structured errors. Define the source-adapter boundary early: enumerate children, index a scope, read bounded metadata and resolve a selected resource for opening. Keep these contracts independent of the VS Code UI and avoid building archive machinery before a directory adapter exercises them.

Implement lazy directory expansion, branch refresh, remove-dataset behavior and workspace-scoped registration persistence. Open selected ordinary files through VS Code. Add a small details surface for original URI, parsed entities and provenance; use native VS Code surfaces where they fit.

**Ready when:** synthetic raw/derivative datasets browse and open files; expansion does not recursively scan the root; refresh is isolated to its scope; permission errors preserve browsing context. Exercise a generated large directory tree without checking it into Git.

## 2. BIDS interpretation and useful metadata

Parse entities deliberately, including canonical paths, combined `sub-…_ses-…` directories and session-tagged files. Define how explicit and inferred entities conflict before silently grouping them. Preserve original paths and label inferred interpretation.

Resolve JSON inheritance and related files using the BIDS specification, with source-backed metadata details. Start with bounded JSON/text previews and `participants.tsv`, then session/scan tables. Preserve leading zeros and distinguish image-file counts from acquisitions, volumes and time points. Browsing should tolerate imperfect datasets; it must not imply successful BIDS validation.

**Ready when:** semantic fixtures cover sessionless and multisession data, derivative boundaries, inheritance, ambiguous entities and noncanonical layouts. Independently compare the logical interpretation against fixture inventories.

## 3. Archives and declared collections

Implement one reader at a time: ZIP first, tar/tarball next, then SquashFS. Before each reader, document its host dependencies, supported variants, indexing cost, cancellation behavior and exact-member extraction strategy. Use synthetic archives before real collections.

Tar variants need an explicit capability matrix. Compressed sequential archives may require scanning substantial compressed data to index or reach a member. Surface that cost, cache completed indexes and avoid promising random access or constant-time extraction. Do not unpack whole datasets as the normal browsing strategy. SquashFS tool detection and compatibility checks belong on the workspace host.

Allow users to declare that multiple containers belong to one dataset, including shards with disjoint subjects or sessions. Merge directories file-wise by logical relative path. Expose every conflicting physical source; handle file/directory conflicts explicitly. Flatten wrappers only through an explicit or explainable rule, retaining original member paths.

Extract only the selected member into private temporary storage, validate it and publish atomically. Define traversal, symlink/special-file, duplicate-member, encrypted-archive, listing and size limits. Never interpolate member names into shell commands. Ensure cancellation terminates workers/processes and removes partial artifacts.

**Ready when:** all supported formats can be indexed and selected members opened without full extraction; cancellation and malformed-container cases are tested; duplicate source choices remain selectable; progressive collection counts accurately report coverage.

## 4. Remote SSH and persistent indexing

Design for remote execution from milestone 1, and perform an early smoke test of directory browsing before investing in all archive readers. Use a synthetic dataset on an explicitly authorized test host. Do not initiate connections merely to discover test locations.

Add persistent host-local metadata indexes, revision checks and explicit refresh semantics. Keep image bytes separate from metadata. Define storage locations, cache budgets, incomplete-download accounting, eviction and resource lifetime before enabling cached extracted files. Verify viewer opening from the remote host without creating unnecessary local copies.

Test disconnect/reconnect, stale indexes, missing tools, permissions, cancelled work and source changes during extraction. Cached metadata may remain browsable offline, but must not imply images are available or current.

**Ready when:** directory and supported archive workflows work locally and over Remote SSH; tools execute on the correct host; refreshing one source preserves others; interrupted work leaves usable completed indexes and no orphaned partial extraction files.

## 5. Dataset overview and exploration

Build entity filters, participant × session availability and summaries on background index snapshots. Show coverage alongside results; unknown cells must not become missing data. Add modality/pipeline views and saved selections once the underlying identity and refresh behavior are stable.

Then expand table support and consider external clinical CSV/TSV joins. Preview and validate joins using explicit keys, duplicates and unmatched rows. Large tables require paging/streaming or disk-backed handling before being offered as a general capability. QC annotations need separate provenance and must not modify source data implicitly.

**Ready when:** overview results reconcile with source inventories, partial and failed scopes stay visible, and filtering/table work leaves browsing responsive at representative scale.

## 6. Optional viewer handoff and release hardening

Ordinary file opening should work from the first slice. Add **Open With** and an optional NiiVue adapter after verifying the installed extension's supported integration points. Establish ownership of extracted-file lifetime before viewer handoff. Rich comparison, overlays, label controls and embedding remain separate decisions; private webview/Preact probes are excluded.

Before broader distribution, choose a license, real publisher and repository destination; review dependency audit findings; test packaging on a clean checkout; and run local/SSH compatibility checks on supported hosts. CI should cover the minimum supported VS Code version and a current stable version. Document supported formats, required tools, limits, cache behavior and failure recovery.

## Validation and next slice

Use fast core tests for semantics and identity, extension-host tests for commands and tree behavior, and synthetic archive/large-tree tests for IO and responsiveness. Keep real private datasets and performance runs opt-in. Measure indexing, tree publication, extraction, transfer and viewer opening separately before optimizing.

The next implementation slice is milestone 1: register one local directory, browse it lazily, inspect its physical identity and open a file. Include coverage and cancellation contracts from the start, then verify the same path in a Remote SSH workspace. This provides a usable foundation before metadata richness and archive complexity grow.

When the GitHub repository is created and pushed, add `CONTRIBUTING.md` covering development setup, tests, pull requests and changelog expectations.

Workflow execution, Slurm submission, a custom renderer and automatic Marketplace publishing are outside this plan's initial scope.
