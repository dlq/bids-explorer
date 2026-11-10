# 1.0.4 release verification

The 1.0.4 maintenance patch includes the shared image-cache queue correction, the Imaging sidebar title, and the beginner Remote SSH guide. The manifest and lockfile use 1.0.4. The published 1.0.3 package served as the upgrade starting point.

## Local and remote candidate checks

- Clean dependency installation with pinned Node 22.23.4. Formatting, type checking, lint, 183 unit tests and the per-file coverage gate passed. Semgrep rule tests and source scans passed. npm audit reported zero vulnerabilities. Both VSIX contract tests passed.
- Local VS Code 1.96.0 and 1.145.3 each passed 58 integration cases before the final ticket-removal correction, with two opt-in cases skipped per version. The final release workflow repeats the suites on minimum and current stable.
- In a disposable VS Code 1.145.3 profile, installed the published 1.0.3 VSIX and upgraded to the 1.0.4 candidate. The manual dataset registration and saved ZIP placement survived. Both versions rendered synthetic loose and ZIP NIfTI images and JSON previews. The candidate declares Imaging for the existing view and container IDs.
- Two disposable VS Code 1.145.3 windows used separate profiles and a shared extension cache directory. Opening a ZIP image in one window blocked a clear in the other. The image remained readable until its viewer closed, after which the other window cleared the cache.
- On Rorqual, the first packaged-cache runs exposed timestamp assumptions in tests and a request-finishing race in the queue. The rebuilt candidate ignores a ticket unlinked while its handle is open and still validates linked tickets through that handle. The regression suite covers both cases. Three successive runs of all 12 packaged-cache tests passed using VS Code Server’s Node runtime and a private synthetic fixture on the remote home filesystem.
- A fresh Remote SSH window on VS Code 1.145.3 loaded the candidate modules on Rorqual, detected the synthetic study, applied a ZIP placement, and rendered both loose and archived NIfTI and metadata previews. These checks used only synthetic data.

## Distribution verification

Tag `v1.0.4` identifies commit `cca7d4ec6a74de2242d906d539ed3ab5e9fbd77e`. The [release workflow](https://github.com/dlq/bids-explorer/actions/runs/42900722448) passed quality, 58 integration cases on each of VS Code 1.96.0 and current stable (two opt-in cases skipped per version), security, packaging and CodeQL. The post-run review found zero open CodeQL or Dependabot alerts.

Marketplace accepted the Trusted Publishing upload at 16:04:22 EST on November 10, 2026. The [GitHub release](https://github.com/dlq/bids-explorer/releases/tag/v1.0.4) contains the exact hosted VSIX and its checksum. All 406 packaged files matched the local candidate’s contents. The hosted VSIX is 2,221,901 bytes with SHA-256 `d8858388c1f3e4f1e9e9f88d3c59f997eba4005c7130c768555e9da29344dcb8`.

At 16:08:54 EST the public Marketplace catalog returned validated version 1.0.4. The downloaded public VSIX matched the GitHub asset byte for byte. The public listing returned HTTP 200, and the served icon matched the approved PNG with SHA-256 `09c512a8a37e90946172f53b77acfb6a756b930c9333f4df2270aa5251037eaa`. [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=MCIN-dlq.bids-explorer)
