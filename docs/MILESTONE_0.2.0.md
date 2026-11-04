# 0.2.0 milestone validation

Validated November 3, 2026, on macOS arm64 with Node 22.23.4; the synthetic Rorqual host check used Linux and the installed VS Code server's Node 24.22.1. This records the agreed read-only metadata milestone, not Marketplace publication or completion of broader remote/archive/viewer work.

## Completed scope

- Source-backed lexical entities, conflict/duplicate reporting and combined-folder recognition without physical reparenting.
- Literal dataset/task-sidecar/dictionary metadata and bounded JSON inheritance with whole-key overrides, source history, ambiguity and coverage.
- Participant/session/scan/event previews with exact identifiers, source rows and dictionary provenance. Event onsets may repeat; no timeline or run association is inferred.
- Background metadata tree descriptions, with explicit participant/session label-column settings and bounded partial coverage. Short untrusted, escaped Markdown hovers show human-readable descriptions and source filenames; full provenance remains in Source Details.
- Tolerant CHANGES preview preserving recorded dates, version labels, order and unparsed text.
- Readable inherited-metadata inspector, captured-source opening, JSON report access and explicitly resolved inherited DWI gradient previewing. Initial gradient opening and explicit reload resolve sources again; reopening an existing panel retains its snapshot.

The release does not validate/fix datasets, follow scan-row paths, normalize source dates, check image volume/orientation agreement, implement dataset/event/fieldmap relationship graphs or read archives. README/license/citation files retain native editors. Further relationships belong to a later minor milestone, before the participant-centred derivative view.

## Automated checks

- Clean `npm ci` from the lockfile succeeded.
- `npm run check`: formatting, both host/browser typechecks, ESLint and **83 unit tests** passed. Every gated production file meets the 95% line/statement/function and 90% branch thresholds; new history/gradient source logic has full coverage. UI/extension code uses the separate integration layer, not this numeric gate.
- **25 extension-host integration tests passed on VS Code 1.96.0 and the available stable 1.144.1 installation.** Tests load the packaged browser modules and exercise real DOM controls, raw-source actions, reload retention, settings, cancellation and stale-result suppression. Native Explorer handoff also has a concurrent-workspace-update regression; folder membership snapshots are not treated as confirmation of an outstanding edit.
- Semgrep rule fixtures and source scan passed: three configured process/eval rules, zero findings. This is not a general security certification.
- `npm audit --audit-level=high` passed: zero high/critical findings. The existing development-toolchain findings remain **17 moderate and one low**; no runtime npm dependencies are shipped. Breaking forced dependency upgrades were not applied for this milestone. Publisher/license/public repository choices remain distribution prerequisites.
- The local VSIX is `dist/bids-explorer-0.2.0.vsix`; its manifest and filename match 0.2.0, and packaging/archive-content checks pass. Test fixtures, `.local`, dependency trees and source maps are excluded.

## Public ds000114 metadata exercise

Used the existing external public dataset recorded in ignored `.local/public-test-data.json`. No download, source rename or metadata rewrite was performed. The compiled `LocalDirectorySource`, `DatasetBrowser`, metadata/description/history readers and inherited-gradient loader were exercised directly. [Recorded measurements](evidence/0.2.0/local-metadata.json) contain no machine-specific dataset path.

| Observation                                                           | Result                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------- |
| Recognized physical files / NIfTI files                               | 174 / 140                                                  |
| Task-tagged images with resolved descriptions                         | 100 / 100                                                  |
| Initial recognized tree enumeration                                   | 23.76 ms                                                   |
| Cached traversal                                                      | 0.090 ms; zero additional directory-adapter child listings |
| All 100 task-description jobs, two workers                            | 98.33 ms                                                   |
| Maximum observed delay beyond a 5 ms timer interval during enrichment | 3.90 ms                                                    |
| Selected DWI inheritance resolution                                   | 0.57 ms; root `dwi.bval` and `dwi.bvec` resolved           |
| Selected inherited gradient loading                                   | 1.09 ms; 71 volumes                                        |
| Tolerant CHANGES sections                                             | 6                                                          |

Size/mtime checks for recognized files and SHA-256 comparisons for their non-image metadata were unchanged after the exercise. MRI bytes were not read. The full download inventory contains 177 files; the recognized projection excludes administrative entries and is not a completeness/validation result.

These are a single host-side API exercise with uncontrolled OS caches. Cached traversal confirms in-memory browser reuse; inherited metadata has no shared/persistent index. Timer delay is only an event-loop proxy. None of these figures measures native sidebar painting, network throughput, image transfer/first frame or huge-cohort performance. The two-worker description probe exercises the loader's responsiveness; the automatic tree queue's pending/cache limits are covered by separate unit tests.

The final feedback pass also read-tested all nine root task files in ds000114 through the compiled preview loaders: five JSON sidecars (five recorded fields each), and four event tables with 7, 15, 7 and 6 recorded rows. Event dictionaries are absent in this sample and were reported as absent rather than invented. No source changes were made. Automated task-file tests additionally cover duplicate JSON names, raw number tokens, repeated event onsets, inherited dictionaries and safe fallback.

## Authorized Rorqual smoke

After the user renewed SSH authentication, uploaded compiled core/source modules and a small synthetic fixture to a newly created temporary directory. Used no research directories and no private datasets. [Recorded measurements](evidence/0.2.0/remote-metadata.json) describe this host-side smoke.

Dataset, mapped participant/session and inherited task descriptions matched their four expected strings. Session IDs retained leading zeros. Inherited DWI sources resolved to a two-volume gradient pair, and CHANGES retained its deliberately invalid recorded date. Fixture bytes were unchanged after processing; the new temporary fixture/runtime directory was removed afterward. Previously retained user test datasets were left alone.

Root listing took 39.59 ms; cached revisit took 0.0079 ms with no additional directory-adapter listing. Four descriptions took 21.54 ms total; inherited gradient resolution/read took 3.41 ms. These are Linux host API timings over an SSH-invoked Node process, **not a fresh 0.2.0 remote VS Code UI test or SSH transport latency**. The earlier real Remote SSH directory/public-MRI window test remains documented in [0.1.0 evidence](MILESTONE_0.1.0.md). Remote UI latency, disconnect/reconnect, persistent metadata caches and large remote workloads remain the later remote milestone's work.

## Release state and follow-on work

The agreed 0.2.0 feature scope and checks above are complete. The manifest/lockfile and dated release notes match the local `v0.2.0` tag. The matching VSIX was rebuilt from that committed state and its version and packaged contents verified. GitHub/Marketplace publication is not configured. Later tags still require explicit authorization.

Continue with the ZIP/declared-collection milestone next. Additional relationships and richer shared metadata caching should get explicit later-minor scope rather than expanding 0.2.0 indefinitely. Keep NiiVue interface/streaming decisions in the viewer milestone and dataset validation/edit workflows after the read-only core.
