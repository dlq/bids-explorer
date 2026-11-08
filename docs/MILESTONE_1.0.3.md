# 1.0.3 release verification

Prepared November 8, 2026. This maintenance release includes the shared-window image-cache budget correction, failed-page navigation recovery, the typed Availability client, standalone panel lifecycle ownership, localized capability explanations and portable VSIX contract checks. Dataset access remains read-only.

All windows sharing the cache must reload onto the updated extension to participate in the new queue. Foreign-host reservations are not expired by age. The queue requires coherent directory reads and atomic rename semantics; synthetic testing does not establish behavior on every HPC filesystem.

Release checks and publication evidence will be recorded below as they complete. Earlier release tags and artifacts remain unchanged.

## Clean snapshot checks

A fresh source export and lockfile install passed formatting, strict type checking, lint, 178 unit tests and the per-file coverage gate. VS Code 1.96.0 and the installed current VS Code each passed all 58 default integration tests; two public-data opt-in cases were skipped. Security rule tests and the source scan passed, and dependency audit found no runtime advisories or high/critical development findings. The reviewed 13 moderate and one low development-tool advisories remain.

The candidate VSIX passed both artifact-contract tests, including localized capability explanations, every preview client, MIT license and approved icon. No native .node files are present. Candidate SHA-256: `2551608ae2e012d0169f2b8d7bd3b6571a9c88bddcdec640cbf1ff9c11f012aa` (2,221,086 bytes). The hosted release workflow builds and tests its own artifact from the release commit; only that exact hosted package will be attached/published.

## Remote checks and recorded limitation

After renewed MFA, the checksum-matched candidate package passed all seven shared-cache regression tests on Rorqual (Linux x64), using VS Code Server’s Node runtime and disposable synthetic data on the shared home filesystem. Separate processes exercised byte/entry budgets, active-image clear protection, waiting/extraction cancellation, killed-owner cleanup, queue contention and malformed state, source changes and CRC-failure recovery. Tests loaded the production cache modules from the copied VSIX; test files and fixtures were separate from its payload. No research datasets were accessed.

A fresh isolated VS Code Remote SSH client timed out before the viewer/metadata harness could connect. The user independently reported SSH trouble and explicitly authorized publishing with this limitation recorded. The seven remote cache tests are not a claim of a completed new interactive SSH viewer test or two graphical windows. Minimum/current local VS Code tests cover viewer and metadata behavior; prior SSH viewer observations remain historical. Fresh interactive SSH verification should be retried when access is reliable. No SSH transport or MFA configuration in the extension was changed.

## Hosted checks and publication

[PR #33](https://github.com/dlq/bids-explorer/pull/33) carries the changes. Its initial [CI run](https://github.com/dlq/bids-explorer/actions/runs/42505699134) and [CodeQL run](https://github.com/dlq/bids-explorer/actions/runs/42505699099) passed; the open CodeQL alert list was empty afterward. The remaining Dependabot advisory concerns development-only minimatch and is included in the reviewed lower-severity tooling findings.

The authorized stable [GitHub release](https://github.com/dlq/bids-explorer/releases/tag/v1.0.3) triggers the existing OIDC workflow. Attach the exact hosted workflow-built VSIX and SHA256SUMS after verification; Marketplace validation/public availability must be checked separately from upload acceptance.
