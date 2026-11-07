# Project context

Created November 3, 2026, following the native Strata prototype in `/Users/dlq/Developer/macvdb`.

## Handoff documents

- [Exploration, options and source references](RESEARCH.md)
- [Implementation plan](PLANS.md)
- [Benchmark evidence snapshot](docs/evidence/niivue-vscode/REPORT.md)

These documents distinguish agreed scope, historical observations and ideas that remain undecided.

## Initial focus

Build a VS Code extension for exploring BIDS datasets locally and over SSH, whether stored as ordinary directories, ZIP archives, tar archives (including compressed tarballs), or SquashFS images. Dataset exploration across these storage forms is the core purpose.

This is a separate project from the native SwiftUI/Metal viewer. BIDS Explorer packages the NiiVue library for progressive NIfTI viewing and supports other VS Code editors through Open Image With.

Dataset exploration is read-only by default. The initial implementation must not rename, move, restructure, rewrite or automatically validate/fix datasets. Explicit validation and rationalization workflows are later, separate work in PLANS.md.

## Intended audience

BIDS Explorer is for neuroimaging researchers and staff who know concepts such as participants, sessions, modalities, and derivatives. They may have little experience with programming, JSON, the terminal, or VS Code extension development. Lead with study context, recorded values, units, and what the user can do next. Keep exact BIDS names and original files accessible, and put technical paths and parsing details under source information. Distinguish what the dataset records, what the BIDS specification defines, and what the explorer could check.

## Navigation and dataset context

- Automatically recognize BIDS workspace roots by the presence of an ordinary root-level `dataset_description.json`; no recursive discovery or conformance validation. Manual registration remains available for external/noncanonical directories; explicit `bidsExplorer.collectionRoots` declarations also populate descriptorless workspace collections without filename-based membership guessing.

- Dataset → participant → session → modality and processing folders.
- Raw data and derivatives; alternative views by modality and pipeline.
- Semantic filters and a participant × session availability matrix.
- Metadata inheritance, related files, clinical tables, QC and provenance.
- Lazy expansion, cached metadata indexes and bounded selected-image caching.
- Local and Remote SSH workspaces, with indexing on the filesystem host.
- ZIP, tar/tarball and SquashFS sources, locally and over SSH, with file-wise overlays of shards belonging to a declared dataset. Collections can span disjoint subjects, sessions and modalities.
- ZIP files may occur at any level of the physical dataset tree and contain a whole dataset or a subject/session/modality/subtree. Preserve physical archive/member identity separately from the declared or explainable logical placement; do not require every archive to be a dataset root.
- Associate combined `sub-…_ses-…` folders and session-tagged files with logical subject/session folders while preserving original member paths.
- Expose conflicting paths as source choices. Preserve extraction provenance.
- Distinguish absent data from unindexed data. Show indexed-container coverage and explicitly partial overview counts.
- Limit the BIDS EXPLORER section to recognizable BIDS elements. Use the normal EXPLORER file section for the complete physical tree, including `.datalad` and unfamiliar entries. Filtering is not validation.

## Extension boundary

BIDS Explorer owns navigation, indexing, archives, metadata, tables, availability and provenance. Its read-only gradient metadata preview uses raw b-vector components without inferring anatomical orientation. BIDS Explorer manages the image stream in its progressive viewer and delegates rendering to the NiiVue library. The standalone NiiVue editor is an optional editor choice.

Start integration with ordinary file opening through a supported custom editor. Richer comparison, anatomy-plus-overlay scenes, label control and events require inspection of supported APIs and possibly collaboration with NiiVue maintainers. Do not depend on private webview/Preact internals; those were used only for benchmark instrumentation. Do not treat all command declarations as callable viewer APIs.

Workflow execution (local tools and Slurm) is a later possibility, not initial implementation scope. The extension development scaffold is authorized and in place. Read-only directory browsing, literal dataset-description previews, source-backed entity interpretation and in-place combined-folder recognition and explicit selected-file JSON inheritance/DWI companion reports and bounded participant/session/scan table previews are implemented. Metadata descriptions now enrich dataset/pipeline roots, task NIfTI files and explicitly mapped participant/session folders; broader metadata relationships remain follow-up work. The 0.3.0 release includes a bounded ZIP central-directory inspector and tested explicit archive-placement model; ZIP and loose sources in registered directories now overlay into logical subject/session navigation with original source choices; bounded archive metadata previews and checked selected-image extraction/viewer handoff are now implemented. Selected-file metadata inspection supports inheritance across ZIP and loose sources. The 0.4.0 release extends the logical tree, previews and MRI opening to plain POSIX ustar and gzip tarballs. The 0.7.0 release adds saved ZIP and tar placements, linked raw and derivative views, and cached SquashFS availability snapshots. A tolerant CHANGES view, readable metadata inspector and inherited-gradient opening complete the agreed 0.2.0 feature scope. Publishing, a remote repository and processing jobs have not been requested.

## Evidence and reusable exploration

Strata sources: `/Users/dlq/Developer/macvdb/native/Strata`.
Archive helpers: `/Users/dlq/Developer/macvdb/native/Strata/Sources/Strata/Resources/archive_reader.py` and archive models/services in that package.

Benchmark report: `/Users/dlq/Developer/macvdb/output/benchmarks/niivue-vscode/REPORT.md`.
NiiVue VS Code 2.9.0 was tested against Strata on Apple M3 with full-resolution T1, T2 and 16-class SIAM samples. NiiVue showed strong interactive rendering headroom. Different rendering algorithms and measurement paths mean the result is not a universal performance guarantee. Rebenchmark any embedded integration.

The supplied remote Tractoflow collection contained 45 SquashFS files and 7,000 subjects. An audit confirmed every indexed subject/session was preserved by the overlay; session-3-only subjects really were present in this subset. Do not infer missing sessions from expectations.

Keep public sample data and large caches in their existing locations until a concrete implementation needs fixtures. Do not copy credentials, SSH keys, private datasets or caches into this repository.

## Version and release direction

The current manifest is `1.0.0`, released locally as `v1.0.0`. It has not been published to the Marketplace or GitHub. [PLANS.md](PLANS.md) maps proposed `0.x` minor milestones to a supported `1.0.0` core; [VERSIONING.md](VERSIONING.md) defines semantic versioning, release tags and artifact names. After 1.0, compatible features use minor releases and breaking documented behavior requires a major release. Roadmap targets do not imply implemented features or authorization to publish.
