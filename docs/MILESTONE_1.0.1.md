# 1.0.1 release verification

Prepared November 7, 2026, for the first Marketplace release under `MCIN-dlq`. The original `v1.0.0` development-publisher release remains unchanged.

## Checks completed

A fresh source export installed dependencies and passed formatting, TypeScript, ESLint, 170 unit tests and the per-file coverage gate. Both VS Code 1.96.0 and 1.145.2 passed 58 integration tests with the public Connectome Mapper and logical-layout image fixtures enabled. Semgrep passed. Dependency audit found no runtime vulnerabilities and no high/critical development findings; 13 moderate and one low development-only findings remain accepted as documented in the security review.

The resulting 1.0.1 VSIX was installed in isolated profiles on both VS Code versions. Each opened seven synthetic NIfTI cases across loose `.nii`/`.nii.gz`, ZIP, plain/gzip tar and SquashFS, checked literal JSON across all five source forms, and verified acquisition metadata, volume controls and provenance in seven Image sidebar cases.

Both installed versions also exercised the separately distributed public sample: two participants, four anatomical images, dataset-description preview, participant filtering to `sub-02`, a completed two-participant availability result and a real T1-weighted image in the four-quadrant viewer. All eight upstream sample files retained their recorded hashes.

The same locally built VSIX passed the seven synthetic image, five metadata-source and seven sidebar cases in an isolated Remote SSH window on Rorqual using VS Code 1.145.2. This smoke test used synthetic temporary data; it did not access research datasets.

`CITATION.cff` passed the Citation File Format 1.2.0 validator. The changed GitHub workflows passed actionlint. Hosted CI adds separate minimum/current-stable integration jobs and keeps the required aggregate `check` status.

## Distribution gate and limits

These checks establish local package readiness; they do not themselves establish Marketplace publication. The stable GitHub Release triggers fresh hosted verification, CodeQL and OIDC publishing. Confirm that workflow and the Marketplace listing before describing publication as complete. Attach the exact workflow-built VSIX and its checksum to the GitHub release.

The 13 MB sample is a documented anatomical subset, not a complete BIDS study or validation fixture. It does not exercise sessions, events, diffusion or derivatives. Those cases have separate integration fixtures. Windows and arbitrary SSH hosts/codecs are not newly certified by this patch. See [compatibility](COMPATIBILITY.md), [security review](CODEQL_REVIEW.md) and [publishing](PUBLISHING.md).
