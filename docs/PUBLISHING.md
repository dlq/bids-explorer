# Publishing to the Visual Studio Marketplace

The Visual Studio Marketplace is the extension catalog used by desktop VS Code. Publishing makes BIDS Explorer discoverable in the Extensions view and allows installed copies to receive updates. GitHub Releases and manual VSIX installation remain available separately.

Microsoft's [publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) describes the publisher account and Trusted Publishing setup. This repository uses GitHub Actions OIDC rather than a stored Marketplace access token.

## One-time publisher setup

1. Sign in to [Marketplace publisher management](https://marketplace.visualstudio.com/manage). Create or select a publisher you control. The confirmed existing publisher is `MCIN-dlq`, owned by Darcy Quesnel. GitHub user `dlq` and Marketplace publisher `MCIN-dlq` are separate identities. Complete any account agreements yourself.
2. The manifest and repository variable `MARKETPLACE_PUBLISHER` use `MCIN-dlq`. Integration tests derive the extension identifier from the manifest. The publisher is part of the installed extension identifier, so settle it before the first Marketplace release.
3. In that publisher's **Trusted Publishing** settings, create this policy:

   | Setting          | Value           |
   | ---------------- | --------------- |
   | Repository owner | `dlq`           |
   | Repository       | `bids-explorer` |
   | Workflow         | `publish.yml`   |
   | Environment      | `marketplace`   |

4. Keep the GitHub environment named `marketplace`. Only the publishing job requests an OIDC token; test and package jobs cannot obtain publishing credentials. Do not add a `VSCE_PAT` secret for this workflow.

Publisher ownership is confirmed and the manifest uses `MCIN-dlq`. The policy above was created and shown as Active on November 7, 2026. No actual Marketplace publish or OIDC token exchange has been exercised yet. The initial CodeQL findings have been reviewed and resolved; prepare a new authorized release before the first publication.

## Moving from the development VSIX

The production extension identifier is `MCIN-dlq.bids-explorer`; older development packages used `bids-explorer-dev.bids-explorer`. VS Code treats them as separate extensions. Before installing the Marketplace copy, remove or disable the development copy to avoid duplicate views and commands. Do not assume extension-owned registrations, placements or caches migrate between these identities; record manual registrations first and re-add them if needed. Settings under `bidsExplorer` retain the same namespace, and ordinary workspace dataset roots can be recognized again. Dataset files are unaffected.

## Release workflow

Version 1.0.1 is the authorized first Marketplace release, containing the MIT license, production publisher and workflow setup. Keep the existing `v1.0.0` tag and development-publisher artifact unchanged.

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

## Initial CodeQL findings

The first extended scan reported ten alerts. The [review record](CODEQL_REVIEW.md) documents origin hardening for all six browser clients, a stronger HTML-escaping assertion, and the evidence for three test/guarded-operation dismissals. Hosted CodeQL confirmed seven fixes, the three reviewed findings were dismissed with evidence, and no alerts remain open at the end of that review. Continue reviewing future alerts; successful analysis alone is not a clean security review.

## Marketplace page content

`package.json` configures `vsce.readmePath` as `docs/MARKETPLACE.md`. That getting-started guide becomes the VSIX `extension/readme.md` and the Marketplace description; the shorter root README remains the GitHub landing page. Its links and image use public HTTPS URLs. Inspect the packaged README before releasing. Marketplace changes take effect when a new package is published; editing GitHub alone does not update an existing listing.
