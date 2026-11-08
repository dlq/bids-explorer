# 1.0.2 release verification

Released on GitHub and uploaded November 7, 2026, for the approved Marketplace icon update. Public validation and the served icon were confirmed November 8.

The new 256 × 256 PNG combines logical dataset branches, the existing imaging symbol and metadata lines. Its colours are documented in [artwork sources](BRANDING.md). The manifest references `media/icon.png`; the editable SVG stays in Git and is excluded from the VSIX.

A fresh source export passed dependency installation, `npm run check` (170 unit tests and the per-file gate), security scans and packaging. Audit found no runtime vulnerabilities and no high/critical development findings; the previously reviewed 13 moderate and one low development-only findings remain. Package inspection verified the PNG dimensions, exact approved image bytes, manifest icon reference and VSIX icon declaration. All 394 existing packaged runtime files matched 1.0.1 byte for byte.

VS Code 1.96.0 and 1.145.2 each passed all 56 default integration tests; the two public-data opt-in tests were deliberately skipped for this artwork-only patch. Hosted release verification repeats both versions and security/CodeQL checks before publication. This patch changes artwork, manifest/version and documentation; it introduces no dataset access or viewer runtime changes and does not require another private-data or SSH experiment.

The [GitHub release](https://github.com/dlq/bids-explorer/releases/tag/v1.0.2) contains the exact hosted workflow-built VSIX and checksum. Earlier versions and their tags/artifacts remain unchanged.

## Completed publication

[Run 42420351550](https://github.com/dlq/bids-explorer/actions/runs/42420351550) passed hosted verification, CodeQL and OIDC upload. VSIX SHA-256: `db25c173afb7bd159426a51f2a79d0ced64532b1f6c626994334e14500c2794a`. The November 8 gallery check reported 1.0.2 validated and returned that same checksum. Its served icon matched `media/icon.png` byte for byte (SHA-256 `09c512a8a37e90946172f53b77acfb6a756b930c9333f4df2270aa5251037eaa`). Upload acceptance was checked separately from completed public verification.
