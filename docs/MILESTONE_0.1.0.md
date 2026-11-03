# 0.1.0 local milestone validation

November 3, 2026. The initial directory-browser milestone is complete as a local development build. The manifest is `0.1.0`; the local release tag is `v0.1.0`. This is not a Marketplace or GitHub publication. Archive readers, inherited metadata, persistent indexing and richer viewer integration remain future work.

## Scope and compatibility

| Environment                                                          | Verification                                                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| macOS, Apple silicon, VS Code 1.96.0                                 | Full unit/check pipeline and 10 real extension-host tests                                                 |
| macOS, Apple silicon, VS Code 1.144.1                                | Same 10 extension-host tests using the current application's executable                                   |
| Rorqual, Linux x86_64, VS Code Remote SSH 0.128.0 and server 1.144.1 | Authorized synthetic directory workflows and real public MRI opening; not a full Linux integration/CI run |
| Windows and other remote hosts                                       | Not exercised                                                                                             |

The development toolchain uses Node 22.23.4. The tested VS Code remote server supplied Node 24.22.1. No separately installed Node, Python or SSH client is required by BIDS Explorer's runtime; Remote SSH manages the server and connection. Hosted CI remains unverified until the repository is pushed.

## Automated checks

The milestone checks cover a clean locked dependency installation, formatting, TypeScript checking of both host/browser code, ESLint, 43 unit tests with the per-file coverage gate, extension-host tests on minimum/current VS Code, Semgrep, dependency auditing and VSIX packaging.

The unit gate reports 100% statements, lines and functions, and approximately 99% branches overall. Extension-host coverage is separate; it is not combined with unit coverage. Semgrep's three project rules report no findings. The dependency audit has 18 existing development-tool findings (17 moderate, 1 low), with no high/critical findings; see [development guidance](DEVELOPMENT.md).

Current macOS VS Code names its executable `Code`; the test downloader still assumed `Electron` for that downloaded build. The optional `BIDS_EXPLORER_TEST_VSCODE_PATH` test setting selects the actual executable without altering dependencies or the downloaded application. The default runner remains pinned to 1.96.0.

## Authorized Remote SSH observations

Only temporary test fixtures under the authorized account and a copied public image were used. No research dataset was traversed, read or changed. Machine-specific fixture locations are kept in ignored local context, not this report.

- Microsoft Remote SSH installed and managed the server. BIDS Explorer was installed into the remote extension host and tested independently of NiiVue.
- A fresh synthetic workspace appeared automatically without Add Dataset. A temporary test-only extension using public VS Code APIs confirmed `env.remoteName === 'ssh-remote'`, a remote extension installation and recognized roots. It was uninstalled after diagnosis.
- The workspace extension host exposes host-local `file:` URIs. An initially empty tree during initialization was not evidence that URI conversion was needed; a proposed workaround was removed before this milestone.
- Participant/session/modality and derivative/pipeline navigation preserve physical paths. Administrative entries remain available in native File Explorer.
- JSON/text opening and the paired gradient webview worked over SSH. The latter displayed three volumes, two directions and one low-b volume.
- Remote adapter checks independently exercised shallow recognition, lazy listing, descendant coverage and actual Linux `EACCES` handling with retained stale results. The permission fixture was restored and removed.
- All nine original synthetic source files matched their creation bytes afterward, with no extra files inside the fixture. The temporary diagnostic extension and its artifacts were removed.
- Public OpenNeuro ds000003 `sub-01_T1w.nii.gz` was copied into a separate test layout and opened through the normal BIDS tree → VS Code editor → NiiVue 2.9.0 handoff. The original public subset has no matching T1 JSON sidecar; none was invented.
- The image contains 160 × 192 × 192 voxels and occupies 5,712,417 compressed bytes (about 5.45 MiB). Its SHA-256 matched before and after copying: `9cb6dc66d4e845a40f2317027aa60d0035cb95634b303f6c0efce961e1e2a4d6`. The multiplanar slices and 3D rendering were visible in the confirmed SSH window.
- Small test datasets were retained for the user's ongoing inspection. They are temporary fixtures, not extension caches or permanent research data.

## Cache and performance observations

BIDS Explorer caches completed branch snapshots and shares concurrent requests in the workspace extension host's memory. Cached revisits avoid filesystem reads. Explicit Refresh invalidates the selected scope; failed refreshes retain stale rows and report an error. Removing a dataset clears its browser state. There is no TTL/LRU memory budget, persistent index or image-byte cache yet. Memory growth across many expanded branches has not been profiled.

The measurements below used the installed extension's actual `LocalDirectorySource`/`DatasetBrowser` on Rorqual, with a tiny dataset root → participant → anatomy hierarchy containing the public image. The adapter's child-listing calls were counted to distinguish cache hits from fast repeated IO.

| Operation                                                           | Observation                                                                |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| First three branch listings                                         | 8.94 ms total                                                              |
| Cached traversal of those three branches, 20 repetitions            | Median 0.0049 ms; range 0.0026–0.0263 ms; zero additional adapter listings |
| Explicit anatomy-branch refresh, 10 repetitions                     | Median 0.192 ms; range 0.123–0.963 ms                                      |
| Reading the complete 5.7 MB image on the remote host, 3 repetitions | 3.33, 2.85 and 2.04 ms                                                     |

These are host-side API/filesystem timings, not end-to-end sidebar latency, SSH throughput or viewer first-frame timings. Filesystem/OS caches were not flushed; even the first recorded read is not a proven cold-storage read. The dataset is small and the connection/host load was not controlled. Cache hits at microsecond scale merely confirm reuse; they do not imply microsecond UI updates.

The real MRI display establishes functional handoff, not a quantified transfer/rendering benchmark. Cold/warm time to first useful image, bytes transferred, frame rate, memory, larger 4D files, disconnect/reconnect and slow-network behavior remain to be measured. See the [progressive-loading research](../RESEARCH.md#progressive-nifti-loading-revisit-with-niivue-integration) and the `0.6.0`/`0.8.0` roadmap.

## Readiness and next work

The `0.1.0` gates are met: synthetic raw/derivative browsing and file opening, shallow expansion, scoped refresh, errors that preserve browsing context, a generated wide-root check, and an early authorized SSH smoke test. Prior local public-data and 38,000-participant metadata measurements remain in [local browser validation](LOCAL_BROWSER_TESTING.md); they do not establish remote scale or native-tree rendering performance.

Proceed to the shared metadata/relationship design in `0.2.0`. Keep broader Remote SSH support, persistent indexing and reconnect/cache policies in `0.6.0`; keep NiiVue interface/streaming decisions in `0.8.0`. Do not infer those milestones are complete from this smoke test.
