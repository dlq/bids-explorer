# Project context

Created November 3, 2026, following the native Strata prototype in `/Users/dlq/Developer/macvdb`.

## Handoff documents

- [Strata context and lessons](docs/STRATA_HANDOFF.md)
- [Source/test/sample reference map](docs/REFERENCE_MAP.md)
- [Benchmark evidence snapshot](docs/evidence/niivue-vscode/REPORT.md)

These documents distinguish agreed scope, historical observations and ideas that remain undecided.

## Initial focus

Build a VS Code extension for exploring BIDS datasets locally and over SSH, whether stored as ordinary directories, ZIP archives, tar archives (including compressed tarballs), or SquashFS images. Dataset exploration across these storage forms is the core purpose.

This is a separate project from the native SwiftUI/Metal viewer. Begin by designing clear boundaries with the existing NiiVue extension; embedding a viewer remains undecided.

## Navigation and dataset context

- Dataset → participant → session → modality and processing folders.
- Raw data and derivatives; alternative views by modality and pipeline.
- Semantic filters and saved selections; participant × session availability matrix.
- Metadata inheritance, related files, clinical tables, QC and provenance.
- Lazy expansion, cached metadata indexes and bounded selected-image caching.
- Local and Remote SSH workspaces, with indexing on the filesystem host.
- ZIP, tar/tarball and SquashFS sources, locally and over SSH, with file-wise overlays of shards belonging to a declared dataset. Collections can span disjoint subjects, sessions and modalities.
- Associate combined `sub-…_ses-…` folders and session-tagged files with logical subject/session folders while preserving original member paths.
- Expose conflicting paths as source choices. Preserve extraction provenance.
- Distinguish absent data from unindexed data. Show indexed-container coverage and explicitly partial overview counts.
- Keep a physical-file view available alongside the logical BIDS interpretation.

## Extension boundary

BIDS Explorer owns navigation, indexing, archives, metadata, tables, availability and provenance. NiiVue owns visualization and display state. NiiVue should initially be optional: the browser remains useful without it and can open files using a selected viewer.

Start integration with ordinary file opening through a supported custom editor. Richer comparison, anatomy-plus-overlay scenes, label control and events require inspection of supported APIs and possibly collaboration with NiiVue maintainers. Do not depend on private webview/Preact internals; those were used only for benchmark instrumentation. Do not treat all command declarations as callable viewer APIs.

Workflow execution (local tools and Slurm) is a later possibility, not initial implementation scope. No extension scaffolding, dependencies, publishing, remote repository or processing jobs have been requested yet.

## Evidence and reusable exploration

Strata sources: `/Users/dlq/Developer/macvdb/native/Strata`.
Archive helpers: `/Users/dlq/Developer/macvdb/native/Strata/Sources/Strata/Resources/archive_reader.py` and archive models/services in that package.

Benchmark report: `/Users/dlq/Developer/macvdb/output/benchmarks/niivue-vscode/REPORT.md`.
NiiVue VS Code 2.9.0 was tested against Strata on Apple M3 with full-resolution T1, T2 and 16-class SIAM samples. NiiVue showed strong interactive rendering headroom. Different rendering algorithms and measurement paths mean the result is not a universal performance guarantee. Rebenchmark any embedded integration.

The supplied remote Tractoflow collection contained 45 SquashFS files and 7,000 subjects. An audit confirmed every indexed subject/session was preserved by the overlay; session-3-only subjects really were present in this subset. Do not infer missing sessions from expectations.

Keep public sample data and large caches in their existing locations until a concrete implementation needs fixtures. Do not copy credentials, SSH keys, private datasets or caches into this repository.
