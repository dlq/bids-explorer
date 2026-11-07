# 1.0.1 release verification

Released November 7, 2026, on GitHub and submitted as the first Marketplace version under `MCIN-dlq`. The original `v1.0.0` development-publisher release remains unchanged.

## Checks completed

A fresh source export installed dependencies and passed formatting, TypeScript, ESLint, 170 unit tests and the per-file coverage gate. Both VS Code 1.96.0 and 1.145.2 passed 58 integration tests with the public Connectome Mapper and logical-layout image fixtures enabled. Semgrep passed. Dependency audit found no runtime vulnerabilities and no high/critical development findings; 13 moderate and one low development-only findings remain accepted as documented in the security review.

The resulting 1.0.1 VSIX was installed in isolated profiles on both VS Code versions. Each opened seven synthetic NIfTI cases across loose `.nii`/`.nii.gz`, ZIP, plain/gzip tar and SquashFS, checked literal JSON across all five source forms, and verified acquisition metadata, volume controls and provenance in seven Image sidebar cases.

Both installed versions also exercised the separately distributed public sample: two participants, four anatomical images, dataset-description preview, participant filtering to `sub-02`, a completed two-participant availability result and a real T1-weighted image in the four-quadrant viewer. All eight upstream sample files retained their recorded hashes.

The same locally built VSIX passed the seven synthetic image, five metadata-source and seven sidebar cases in an isolated Remote SSH window on Rorqual using VS Code 1.145.2. This smoke test used synthetic temporary data; it did not access research datasets.

`CITATION.cff` passed the Citation File Format 1.2.0 validator. The changed GitHub workflows passed actionlint. Current stable initially failed on the GPU-less runner because WebGL2 was unavailable. The disposable test host now explicitly opts into SwiftShader for trusted synthetic fixtures; normal extension launches are unchanged. Hosted CI adds separate minimum/current-stable integration jobs and keeps the required aggregate `check` status.

## Distribution gate and limits

These checks establish local package readiness; they do not themselves establish Marketplace publication. The stable GitHub Release triggers fresh hosted verification, CodeQL and OIDC publishing. Confirm that workflow and the Marketplace listing before describing publication as complete. Attach the exact workflow-built VSIX and its checksum to the GitHub release.

The 13 MB sample is a documented anatomical subset, not a complete BIDS study or validation fixture. It does not exercise sessions, events, diffusion or derivatives. Those cases have separate integration fixtures. Windows and arbitrary SSH hosts/codecs are not newly certified by this patch. See [compatibility](COMPATIBILITY.md), [security review](CODEQL_REVIEW.md) and [publishing](PUBLISHING.md).

## Upload acceptance and pending Marketplace verification

[Run 42418383488](https://github.com/dlq/bids-explorer/actions/runs/42418383488) completed hosted verification, CodeQL and OIDC publication. The exact hosted VSIX was additionally installed and passed the same local minimum/current and synthetic Remote SSH cases before publication resumed. Every shared extension file matched the local build; the Linux build also included three optional Rollup platform-package files and the corresponding generated content-type entry.

The Marketplace returned version **1.0.1**, publisher **MCIN-dlq**, and SHA-256 `d13466575fb83c7515a7f38999b5b69393e99b544648ceab0a1085b35d4a7274`, matching the tested artifact. The [GitHub release](https://github.com/dlq/bids-explorer/releases/tag/v1.0.1) contains that VSIX, the separate sample ZIP and `SHA256SUMS`. The original `v1.0.0` tag/artifact was preserved.

The publisher dashboard showed **Verifying 1.0.1** with **Public** availability after upload. The public listing returned 404 during verification. A successful `vsce publish` and version metadata do not establish that the public listing is already available. GitHub VSIX installation is available while Microsoft verification completes.
