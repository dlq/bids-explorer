# Versioning and releases

## Version source and status

`package.json` is the authoritative extension version. Keep the top-level and root-package versions in `package-lock.json` synchronized with it. The current `0.0.1` is an unreleased development build, not a published release. Future feature targets live in [PLANS.md](PLANS.md); implemented changes stay under Unreleased in [CHANGELOG.md](CHANGELOG.md) until release preparation.

Use three numeric components: `major.minor.patch`. Do not bump the version for every commit. Node, TypeScript, archive tool and `engines.vscode` versions are separate compatibility/development requirements; they do not track the extension version.

## Meaning of a bump

| Stage      | Patch                                              | Minor                                                                                       | Major                                                                 |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Before 1.0 | Fixes to existing behavior, e.g. `0.3.0` → `0.3.1` | A usable feature milestone; may include documented breaking changes, e.g. `0.3.1` → `0.4.0` | `1.0.0` establishes the supported core and compatibility expectations |
| After 1.0  | Compatible fixes, e.g. `1.2.0` → `1.2.1`           | Compatible new features, e.g. `1.2.1` → `1.3.0`                                             | Breaking documented behavior, e.g. `1.3.0` → `2.0.0`                  |

Compatibility includes commands, settings, registered datasets, persisted selection identities and supported opening/navigation workflows. A change requiring users to reconfigure or migrate must be described explicitly. Disposable cache formats may change without a major bump if they are safely invalidated/rebuilt, original data and registrations remain intact, and the rebuild cost is documented. Never silently reinterpret source identity or drop a saved selection.

Documentation, internal refactoring and tooling improvements normally wait for the next applicable release; a large implementation alone does not justify a major bump. Record user-facing security fixes under the affected release and explain any required migration without exposing sensitive exploit information prematurely.

## Release names and artifacts

- Manifest version: `0.1.0`.
- Git tag and GitHub release name: `v0.1.0`.
- VSIX: `bids-explorer-0.1.0.vsix`, produced under `dist/` by `npm run package` using the manifest version.
- Changelog heading: `## [0.1.0] - YYYY-MM-DD`, using the actual release date, followed by Added/Changed/Fixed/Security sections as appropriate.

Local development builds can share the unreleased manifest version. Use their commit SHA to distinguish them; they are not immutable releases. Release artifacts must come from the tagged commit after checks pass. Do not overwrite a published version or reuse a release tag; ship a new patch instead.

## Preparing an authorized release

1. Confirm the target milestone's readiness checks in PLANS.md, the supported host/format matrix and any migrations. Select the version explicitly; do not automatically infer a bump from commit messages.
2. On a clean working tree, use `npm version X.Y.Z --no-git-tag-version` to update the manifest and lockfile together. This changes files without creating a commit or tag.
3. Move the implemented Unreleased entries into a dated release heading. Leave a new Unreleased section for subsequent work. Update status/support documentation and clearly identify preview limitations.
4. Run `npm ci`, `npm run check`, `npm run test:integration`, `npm run security`, `npm audit --audit-level=high` and `npm run package`. Complete the required manual/SSH/compatibility validation. Verify the VSIX's manifest version and filename agree and inspect its contents.
5. Commit the release preparation. When release publication is authorized, tag that commit `vX.Y.Z` and attach the matching VSIX and release notes to the GitHub release. Do not create a tag or publish merely by following ordinary development instructions.
6. If Marketplace publication is authorized and configured, publish the same tested version/artifact using the selected channel. Publisher, license, repository/security settings and release credentials must be settled first. No automatic publication is configured today.

CI builds versioned VSIX artifacts on ordinary changes too. Those are CI build outputs, not releases; tagging and distribution remain explicit actions.

## Marketplace previews

Our proposed `0.1.0`, `0.2.0`, etc. milestones describe local/GitHub development. They do not currently assign Marketplace channels.

The Marketplace accepts `major.minor.patch`, not suffixes such as `0.1.0-beta.1`. A preview is marked with the separate `--pre-release` flag. If maintaining simultaneous Marketplace stable and preview channels, adopt Microsoft's even-minor stable / odd-minor preview recommendation and revise the roadmap version assignments before publishing. For example, stable `1.0.x`, preview `1.1.x`, then stable `1.2.0`. Do not publish an odd minor as a stable milestone and later retroactively assume it was a preview.

Keep versions increasing across the channels: VS Code's update selection can move a preview user to a higher stable version. Review the channel transition before each release. See [VS Code publishing guidance](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#prerelease-extensions).
