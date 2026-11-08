# 1.0.3 release verification

Released November 8, 2026; public Marketplace validation was confirmed the same day. This maintenance release includes the shared-window image-cache budget correction, failed-page navigation recovery, the typed Availability client, standalone panel lifecycle ownership, localized capability explanations and portable VSIX contract checks. Dataset access remains read-only.

All windows sharing the cache must reload onto the updated extension to participate in the new queue. Foreign-host reservations are not expired by age. The queue requires coherent directory reads and atomic rename semantics; synthetic testing does not establish behavior on every HPC filesystem.

Release checks and publication evidence are recorded below. Earlier release tags and artifacts remain unchanged.

## Clean snapshot checks

A fresh source export and lockfile install passed formatting, strict type checking, lint, 178 unit tests and the per-file coverage gate. VS Code 1.96.0 and the installed current VS Code each passed all 58 default integration tests; two public-data opt-in cases were skipped. Security rule tests and the source scan passed, and dependency audit found no runtime advisories or high/critical development findings. The reviewed 13 moderate and one low development-tool advisories remain.

The candidate VSIX passed both artifact-contract tests, including localized capability explanations, every preview client, MIT license and approved icon. No native .node files are present. Candidate SHA-256: `2551608ae2e012d0169f2b8d7bd3b6571a9c88bddcdec640cbf1ff9c11f012aa` (2,221,086 bytes). The hosted release workflow builds and tests its own artifact from the release commit; only that exact hosted package will be attached/published.

## Remote checks and recorded limitation

After renewed MFA, the checksum-matched candidate package passed all seven shared-cache regression tests on Rorqual (Linux x64), using VS Code Server’s Node runtime and disposable synthetic data on the shared home filesystem. Separate processes exercised byte/entry budgets, active-image clear protection, waiting/extraction cancellation, killed-owner cleanup, queue contention and malformed state, source changes and CRC-failure recovery. Tests loaded the production cache modules from the copied VSIX; test files and fixtures were separate from its payload. No research datasets were accessed.

A fresh isolated VS Code Remote SSH client timed out before the viewer/metadata harness could connect. The user independently reported SSH trouble and explicitly authorized publishing with this limitation recorded. The seven remote cache tests are not a claim of a completed new interactive SSH viewer test or two graphical windows. Minimum/current local VS Code tests cover viewer and metadata behavior; prior SSH viewer observations remain historical. Fresh interactive SSH verification should be retried when access is reliable. No SSH transport or MFA configuration in the extension was changed.

## Hosted checks and publication

[PR #33](https://github.com/dlq/bids-explorer/pull/33) carries the changes. Its initial [CI run](https://github.com/dlq/bids-explorer/actions/runs/42505699134) and [CodeQL run](https://github.com/dlq/bids-explorer/actions/runs/42505699099) passed; the open CodeQL alert list was empty afterward. The remaining Dependabot advisory concerns development-only minimatch and is included in the reviewed lower-severity tooling findings.

The stable [GitHub release](https://github.com/dlq/bids-explorer/releases/tag/v1.0.3) and immutable tag point to `b2cb105fecbd6a42d9efe2b39c5b192b1c127e53`. Final-head PR [CI](https://github.com/dlq/bids-explorer/actions/runs/42506459764) and [CodeQL](https://github.com/dlq/bids-explorer/actions/runs/42506460017) passed before merge.

[Release run 42506668593](https://github.com/dlq/bids-explorer/actions/runs/42506668593) passed verification, CodeQL and OIDC publication. The upload was accepted November 8 at 17:51:37 UTC. The GitHub release contains that exact hosted VSIX and matching SHA256SUMS. VSIX SHA-256: `e3cba6a466267cee24207817ae0667deaee19a4c9eaa073f7c88ecb6dbcd2b57` (2,221,086 bytes). All 406 packaged file contents match the clean local candidate byte for byte; only ZIP container metadata differs. GitHub’s uploaded-asset digest independently matches this checksum. No native .node files are included, and the icon remains the approved PNG.

Marketplace upload acceptance is confirmed. At the initial post-upload check on November 8 around 17:52 UTC, the public gallery still reported 1.0.2; public validation of 1.0.3 had not yet been observed. Upload acceptance and public validation are tracked separately.

## Public Marketplace validation

On November 8 at 17:59 UTC the public gallery reported 1.0.3 validated. The listing returned HTTP 200; the downloaded public VSIX matched the hosted SHA-256 above byte for byte. The served icon matched the approved PNG (SHA-256 `09c512a8a37e90946172f53b77acfb6a756b930c9333f4df2270aa5251037eaa`). Version 1.0.3 is available from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=MCIN-dlq.bids-explorer), separately confirming the earlier upload acceptance.
