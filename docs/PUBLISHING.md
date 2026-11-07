# Publishing to the Visual Studio Marketplace

The Visual Studio Marketplace is the extension catalog used by desktop VS Code. Publishing makes BIDS Explorer discoverable in the Extensions view and allows installed copies to receive updates. GitHub Releases and manual VSIX installation remain available separately.

Microsoft's [publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) describes the publisher account and Trusted Publishing setup. This repository uses GitHub Actions OIDC rather than a stored Marketplace access token.

## One-time publisher setup

1. Sign in to [Marketplace publisher management](https://marketplace.visualstudio.com/manage). Create or select a publisher you control. The requested publisher ID is `dlq`, subject to availability; the GitHub username does not reserve that Marketplace ID. Complete any account agreements yourself.
2. Once ownership is confirmed, replace `bids-explorer-dev` in `package.json` with the actual publisher ID. Set the repository variable `MARKETPLACE_PUBLISHER` to the same value if it differs from `dlq`. The publisher is part of the installed extension identifier, so settle it before the first Marketplace release.
3. In that publisher's **Trusted Publishing** settings, create this policy:

   | Setting          | Value           |
   | ---------------- | --------------- |
   | Repository owner | `dlq`           |
   | Repository       | `bids-explorer` |
   | Workflow         | `publish.yml`   |
   | Environment      | `marketplace`   |

4. Keep the GitHub environment named `marketplace`. Only the publishing job requests an OIDC token; test and package jobs cannot obtain publishing credentials. Do not add a `VSCE_PAT` secret for this workflow.

The workflow is prepared, but publishing is not operational until the actual publisher and Marketplace trust policy are configured. The development publisher remains in the manifest until ownership is confirmed.

## Release workflow

Use a new patch release containing the MIT license, production publisher and workflow setup; do not change the existing `v1.0.0` tag or its downloadable artifact.

1. Follow [VERSIONING.md](../VERSIONING.md): update the manifest and lockfile together, update release notes, test and create an authorized `vX.Y.Z` tag on `main`.
2. Publish a stable GitHub Release for that tag. This starts **Marketplace release**. Publishing a prerelease is deliberately rejected until a separate preview-channel policy is adopted.
3. The workflow checks the tag/version/publisher, verifies that the commit belongs to `main`, runs formatting, type checks, lint, coverage, integration tests, Semgrep and dependency audit, then builds a VSIX. CodeQL analyzes the same source commit.
4. The publishing job downloads that exact tested artifact, verifies its SHA-256 checksum and runs `vsce publish --oidc --packagePath …`. It does not rebuild the package or bump a version. The Marketplace trust policy must match the workflow and environment.
5. Check the workflow result and Marketplace listing. Existing Marketplace versions are not silently skipped or overwritten.

For a rehearsal, open **Actions → Marketplace release → Run workflow**, select `main`, and leave **Publish** unchecked. Tests, security scans, packaging and CodeQL run; no Marketplace request is made. To retry an authorized release publication manually, supply its existing tag and check **Publish**.

A successful CodeQL job means analysis completed; it does not mean the alert list is empty. Review new [code-scanning alerts](https://github.com/dlq/bids-explorer/security/code-scanning) before a release. The original GitHub 1.0.0 VSIX predates the production publisher and license file, and must not be submitted as the Marketplace release.

## Security and dependency maintenance

CodeQL scans JavaScript/TypeScript on pushes and pull requests to `main`, weekly, and during release verification. It complements the local Semgrep rules. Dependabot already checks npm dependencies and GitHub Actions weekly, with development dependencies grouped. Dependabot alerts and security updates are enabled in repository settings; review its PRs and their CI results before merging.

Official actions in the new workflows are pinned to commit SHAs with version comments, which Dependabot can update. Publishing runs only for a stable GitHub Release or an explicit publish request, never for an ordinary push or pull request. Keep datasets, credentials and private test data outside CI.
