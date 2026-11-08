# 0.3.0 ZIP milestone validation

BIDS Explorer overlays ZIP and loose sources into a logical subject/session tree, retains physical source choices, and opens selected archive members through bounded text previews or a private MRI extraction cache. The explicit metadata inspector resolves applicable sidecars and gradient companions along the selected logical branch. See [ZIP support and limits](ZIP.md) for the supported compression methods, path placement rules, cache limits, and source coverage.

The local release uses the `v0.3.0` tag and `dist/bids-explorer-0.3.0.vsix`. The release checks use a clean Git snapshot, a lockfile install, the per-file coverage gate, extension-host tests on VS Code 1.96.0 and 1.144.1, Semgrep, dependency audits, and package inspection. The extension remains a local release.

## Remote SSH evidence

- The authorized UKB example exercised the logical subject/session tree, an archived JSON preview and a 105-volume archived DWI in NiiVue. [Archive viewing evidence](evidence/0.3.0/archive-viewing.json)
- A separate synthetic fixture on Rorqual exercised the production inheritance loader against a loose root sidecar and an archived override. It resolved a mixed-source gradient pair, reopened the archived JSON by its original member identity, and preserved fixture hashes and revisions. This was an SSH host API check. The local extension-host tests separately exercised the VS Code command. [Synthetic inheritance evidence](evidence/0.3.0/remote-inheritance.json)

The inspection scope is one selected file and its logical ancestors. Saved custom archive placements and collection-wide coverage summaries were outside this milestone and subsequently shipped in [0.7.0](MILESTONE_0.7.0.md). Current direction is in the [roadmap](../PLANS.md).
