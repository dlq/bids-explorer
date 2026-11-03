# Strata source and validation map

Reference checkout: `/Users/dlq/Developer/macvdb`. The paths below are relative to it. These are references to inspect and selectively port; no implementation code was copied into BIDS Explorer.

## Models, services and UI examples

| Area | Reference paths | What to inspect |
|---|---|---|
| BIDS semantics | `native/Strata/Sources/Strata/Models/BIDSDataset.swift`; `native/Strata/Sources/Strata/Services/BIDSIndexer.swift` | Entities, nodes/scans, metadata and derivative relationships; distinguish incomplete prototype behavior from the BIDS specification |
| Archive model | `native/Strata/Sources/Strata/Models/ArchiveManifest.swift`; `ArchiveSelection.swift` in the same directory | Physical member identity, validation and source-qualified selections |
| Logical overlay | `native/Strata/Sources/Strata/Models/ArchiveOverlay.swift`; `ArchiveDatasetSummary.swift` | Collection membership, wrapper handling, session normalization, duplicate sources, summary semantics |
| Background state | `native/Strata/Sources/Strata/Models/ArchiveBrowser.swift` | Independent branches, cancellation, coalescing, detached merging and throttled snapshots |
| Archive IO | `native/Strata/Sources/Strata/Services/ArchiveService.swift`; `native/Strata/Sources/Strata/Resources/archive_reader.py` | Index caches, exact-member extraction, ZIP/old and new unsquashfs behavior, safety checks |
| Remote index/cache | `native/Strata/Sources/Strata/Services/RemoteBIDSIndex.swift`; `RemoteImageCache.swift`; `SSHTransport.swift` | Lazy branches, revisions, bounded LRU, temporary files and transport; adapt for VS Code Remote rather than blindly porting SSH |
| Clinical tables | `native/Strata/Sources/Strata/Services/ClinicalTable.swift`; `native/Strata/Sources/Strata/Views/ClinicalTablesView.swift` | CSV/TSV parsing, BIDS table preview and joins; current reader is not a huge-table architecture |
| Large-tree implementation | `native/Strata/Sources/Strata/Views/NativeArchiveOutline.swift` | Lazy expansion, stable item caches and targeted updates; transfer principles, not AppKit code |
| Overview/provenance | `native/Strata/Sources/Strata/Views/ArchiveOverlayView.swift`; `ArchiveDatasetSummaryView.swift`; `RemoteDatasetOverview.swift` | Partial counts, errors and source provenance |
| Session/QC example | `native/Strata/Sources/Strata/Views/SessionComparisonView.swift` | Session comparison interaction and QC context |
| General prototype documentation | `native/Strata/README.md`; `docs/StrataPlan.md` | Historical capabilities and setup details |

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

Benchmark original: `output/benchmarks/niivue-vscode/`, with README-style REPORT.md, four raw run JSONs, and inputs.json. A small evidence snapshot is copied into this project's `docs/evidence/niivue-vscode/`; the original files remain in Strata.

Instrumentation: `script/benchmarks/niivue-vscode.js`. Earlier browser comparisons in `viewer/` and `output/comparison/` are separate experiments, not the VS Code extension benchmark.

The benchmark report's reproduction commands and script paths refer to the Strata repository root. Input hashes identify the exact files. Do not silently replace them with lower-resolution images when comparing performance.

Machine-specific authorized test roots are recorded in ignored `.local/strata-test-context.json`. No credentials or archive listings are copied. Existing SSH authentication may require user-completed MFA; do not trigger a connection just to read this handoff.
