# Security

BIDS Explorer is an unreleased development scaffold. Archive readers and remote data workflows are not implemented yet. These checks reduce risk but do not establish that future dataset handling is safe.

## Development checks

Install `uv` (https://docs.astral.sh/uv/getting-started/installation/) and Node as described in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), then run:

```sh
npm run check
npm run security
npm audit --audit-level=high
```

`npm run security` uses `uvx` to run Semgrep **1.183.0** with Python 3.12. The first run may download the interpreter, scanner and its dependencies; later runs use uv's cache outside the repository. No Semgrep account is required. Scans use only checked-in rules, disable usage metrics and version checks, and do not upload results to a cloud dashboard. Semgrep and its transitive dependencies remain external development tools. Update the pinned version in both security scripts together and rerun rule tests.

The current baseline has three project rules: reject shell command execution through covered Node child_process imports/calls; reject process options containing literal `shell: true`; and reject `eval`/`new Function`. Positive and negative fixtures validate each rule. This is a narrow, reviewed starting point, not a comprehensive TypeScript security ruleset. Aliasing, computed calls, indirect options and cross-function data flow may evade these patterns. Review new process wrappers manually, and extend rules/tests as actual APIs and helper languages are introduced.

`security:scan` scans `src`, with Semgrep's default exclusions (including test paths). `security:rules` separately checks intentionally unsafe fixtures in `test/security`; those fixtures are never compiled or shipped. Findings and scan errors fail CI. Any suppression needs an adjacent explanation of why it is safe, supported by tests where practical. Do not lower severity or disable rules merely to pass CI.

CI runs Semgrep and npm audit in a separate security job with read-only repository permissions. The audit gate fails on high/critical findings, including development dependencies. Lower-severity findings remain visible for review; existing development-tool findings are documented in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Dependabot is configured for weekly npm and GitHub Actions updates. Hosted checks and update PRs start after the repository is pushed and GitHub enables them.

## Trust boundaries and required implementation tests

Treat dataset metadata, archive member names, tool output and imported tables as untrusted input even in a trusted workspace. Workspace Trust protects extension activation, not the contents of a dataset.

- Never execute dataset content or build shell strings from paths. Invoke trusted tools with separate argument arrays and shell disabled; validate tool options and leading-dash member names too.
- Before archive support ships, test absolute/relative traversal, symlink escapes, special files, duplicate members, corrupt inputs and safe destination containment. Lexical path cleanup alone is insufficient against symlinks.
- Bound listing, preview, decompression and extraction work; test oversized inputs, cancellation, process termination and cleanup of temporary files. Validate revisions and publish completed artifacts atomically.
- Keep caches and credentials outside the repository, preserve source identity and provenance, and avoid recording sensitive paths or clinical values in logs unnecessarily.
- Use supported VS Code/viewer APIs. Revisit webview content security policy, URI access and message validation if webviews are introduced.

See TESTING.md for behavior and regression-test expectations. No real SSH connection or private dataset is part of ordinary CI.

## GitHub setup and reporting

When creating the GitHub repository, enable available secret scanning and push protection, private vulnerability reporting, Dependabot alerts/security updates and required CI/security checks on the default branch. Availability depends on repository/account settings; these controls have not been enabled by local configuration. Review action pinning and dependency updates before wider distribution.

There is no public release or reporting channel yet. Once private vulnerability reporting is enabled, use the repository's Security tab for vulnerabilities. Do not put credentials, private datasets or exploit details exposing sensitive information in public issues.

Release preparation and security-gate requirements follow [VERSIONING.md](VERSIONING.md). A version bump does not authorize publication.
