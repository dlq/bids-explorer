# 1.0.3 release verification

Prepared November 8, 2026. This maintenance release includes the shared-window image-cache budget correction, failed-page navigation recovery, the typed Availability client, standalone panel lifecycle ownership, localized capability explanations and portable VSIX contract checks. Dataset access remains read-only.

All windows sharing the cache must reload onto the updated extension to participate in the new queue. Foreign-host reservations are not expired by age. The queue requires coherent directory reads and atomic rename semantics; synthetic testing does not establish behavior on every HPC filesystem.

Release checks and publication evidence will be recorded below as they complete. Earlier release tags and artifacts remain unchanged.

## Clean snapshot checks

A fresh source export and lockfile install passed formatting, strict type checking, lint, 178 unit tests and the per-file coverage gate. VS Code 1.96.0 and the installed current VS Code each passed all 58 default integration tests; two public-data opt-in cases were skipped. Security rule tests and the source scan passed, and dependency audit found no runtime advisories or high/critical development findings. The reviewed 13 moderate and one low development-tool advisories remain.

The candidate VSIX passed both artifact-contract tests, including localized capability explanations, every preview client, MIT license and approved icon. No native .node files are present. Candidate SHA-256: `2551608ae2e012d0169f2b8d7bd3b6571a9c88bddcdec640cbf1ff9c11f012aa` (2,221,086 bytes). The hosted release workflow builds and tests its own artifact from the release commit; only that exact hosted package will be attached/published.

The synthetic Rorqual smoke remains pending renewed MFA. No private research datasets are required for this check. The published package and validation status will be confirmed separately from upload acceptance.
