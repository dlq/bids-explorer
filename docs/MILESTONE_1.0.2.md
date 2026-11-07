# 1.0.2 release verification

Prepared November 7, 2026, for the approved Marketplace icon update.

The new 256 × 256 PNG combines logical dataset branches, the existing imaging symbol and metadata lines. Its colours are documented in [artwork sources](BRANDING.md). The manifest references `media/icon.png`; the editable SVG stays in Git and is excluded from the VSIX.

A fresh source export passed dependency installation, `npm run check` (170 unit tests and the per-file gate), security scans and packaging. Audit found no runtime vulnerabilities and no high/critical development findings; the previously reviewed 13 moderate and one low development-only findings remain. Package inspection verified the PNG dimensions, exact approved image bytes, manifest icon reference and VSIX icon declaration. All 394 existing packaged runtime files matched 1.0.1 byte for byte.

VS Code 1.96.0 and 1.145.2 each passed all 56 default integration tests; the two public-data opt-in tests were deliberately skipped for this artwork-only patch. Hosted release verification repeats both versions and security/CodeQL checks before publication. This patch changes artwork, manifest/version and documentation; it introduces no dataset access or viewer runtime changes and does not require another private-data or SSH experiment.

The GitHub release receives the exact hosted workflow-built VSIX and checksum. Confirm Microsoft verification and the public listing’s new version/icon separately from successful upload acceptance. Earlier versions and their tags/artifacts remain unchanged.
