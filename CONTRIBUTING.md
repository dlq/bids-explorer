# Contributing to BIDS Explorer

BIDS Explorer is for neuroimaging practitioners exploring studies locally and over SSH. Keep navigation readable, source provenance accessible and dataset access read-only. Ordinary exploration must not rename files, rewrite metadata or run validation fixes.

## Report a problem or propose a change

Use [GitHub issues](https://github.com/dlq/bids-explorer/issues). Describe the expected behavior, what happened, your extension/VS Code versions and whether the source is a directory, ZIP, tarball or SquashFS. Prefer a small synthetic reproduction. Remove participant identifiers, private paths and sensitive metadata from logs and screenshots.

For suspected vulnerabilities, follow [SECURITY.md](SECURITY.md) and use private reporting instead of a public issue.

## Develop and test

Read [PROJECT.md](PROJECT.md), [RESEARCH.md](RESEARCH.md) and [PLANS.md](PLANS.md) before implementing features. Follow [development setup](docs/DEVELOPMENT.md), [TESTING.md](TESTING.md) and [SECURITY.md](SECURITY.md). Use the Node version in `.nvmrc` and install locked dependencies with `npm ci`.

Run `npm run check`, `npm run test:integration` and `npm run security` for code changes. Add meaningful regression tests and preserve the per-file coverage gate. Use `npm run format` and `npm run lint:fix` for formatting and lint fixes. Keep SSH/private-data tests opt-in and keep datasets, credentials and caches outside the repository.

Open a pull request with the problem, resulting behavior and verification performed. Record notable user-visible changes under Unreleased in [CHANGELOG.md](CHANGELOG.md). Do not bump versions or move release tags for routine changes. Preserve imported benchmark evidence verbatim.

## License

BIDS Explorer uses the [MIT license](LICENSE). Contributions intended for inclusion in the project are submitted under the same license. Only contribute material you have permission to license this way. Bundled dependencies retain their own licenses; see [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
