# Initial local browser validation

November 3, 2026. These observations cover the unreleased `0.0.1` implementation targeting the `0.1.0` directory milestone, not archive support, a release certification or Remote SSH validation.

## Automated behavior

Run from the repository root:

```sh
npm run check
npm run test:integration
npm run security
npm run package
```

Unit tests exercise real temporary directories (including a 1,025-participant root), source-qualified identity, canonical labels/folder entities, encoded filenames, sessionless/multisession and derivative paths, unchanged dataset contents, symlinks/special files, persistence failures, corrupt saved state, concurrent registration, branch refresh isolation, cancellation/late-result races and error recovery. Controlled adapter failures exercise permission-denied and unexpected-error cases without depending on OS permission behavior under privileged test runners.

The Unix special-file test uses `mkfifo` with separate process arguments and skips on Windows. Test directory creation and external mutations in failure/race cases are fixture setup, not explorer behavior.

Extension-host tests use VS Code 1.96 in a fresh disposable test profile. They exercise the registered commands, real file opening, source-detail documents, BIDS-only filtering, native File Explorer handoff, lazy native tree behavior, failed-listing retry/stale rows, symlink display and cancellation. Integration coverage is reported separately from the enforced unit gate; it is not combined coverage.

## Public dataset smoke tests

The source adapter was manually traversed against both external public datasets documented in [TEST_DATA.md](TEST_DATA.md). This explicit smoke test read directory entries and filesystem attributes, not image bytes, and did not invoke validation or source edits.

- ds000003: all four expected images found; nine physical files observed versus eight downloaded files.
- ds000114: all 140 expected images found; 191 physical files observed versus 177 downloaded files.

An independent comparison against the download manifests found no missing downloaded files. The extra files were existing `.DS_Store` files (one and fourteen respectively), which were left intact. The physical source adapter reads these entries. The final BIDS projection hides administrative/unrecognized entries; the native File Explorer remains the complete physical view. Nothing was deleted or treated as a BIDS acquisition. Timed metadata walks were about 17 ms and 15 ms on this local run; these warm/local observations are not network or cold-start guarantees.

A follow-up walk through the BIDS-only projection returned 8 recognized files/4 images for ds000003 and 174 recognized files/140 images for ds000114, in about 27 ms and 26 ms. All expected images remained accessible; the three omitted upstream ds000114 files were administrative `.datalad`/`.gitattributes` entries. The extra OS metadata was also omitted. These timings include projection and are still exploratory local observations.

## Generated wide root

A temporary directory with 38,000 empty `sub-<number>` directories was generated outside Git. The actual LocalDirectorySource listed and naturally ordered the root in approximately 360 ms. A 1 ms interval fired 250 times during the operation; the event-loop monitor observed a maximum delay of about 35.6 ms. A subsequent warm run took about 138 ms with 129 interval ticks and a 5.6 ms maximum delay. The fixtures were removed after each run.

The workload involved one directory listing and cooperative ordering, without recursively visiting participant folders or statting each child explicitly. It did not measure rendering 38,000 rows in VS Code, filesystem-provider fallbacks, network latency or incremental indexing. This is exploratory evidence, not a CI timing threshold. To reproduce, generate an equivalent root under the OS temporary directory, call `LocalDirectorySource.root` and `children` on its file URI, and monitor the event loop around the listing call. Do not put the generated tree in the repository.

## Interactive verification

A separate window titled **[Extension Development Host]** was launched using the downloaded VS Code 1.96 application and an isolated user-data directory. Initial interaction preceded the administrative-entry filter; subsequent filter behavior is covered by the extension-host tests and projection smoke tests. Using the extension's Add Dataset picker, ds000114 was registered and expanded through `sub-01 → ses-retest → anat/dwi/func`. The BIDS EXPLORER section appeared inside the regular EXPLORER sidebar; native rows showed participant, session and modality labels with their original folder names.

An initial UI-tool attachment selected the regular project window instead; rejected actions there were not counted as validation. The confirmed development-host interaction was performed afterward. Automated integration tests also independently run in their own isolated extension host.

The integration runner uses a disposable `.code-workspace` file outside the repository. This lets native Explorer handoff add/remove fixture folders without reloading the runner or editing checked-in workspace fixtures. In normal use, converting a single-folder window to a workspace can reload VS Code; registrations remain workspace-scoped.

## Remaining boundaries

- Real Remote SSH execution and Linux/Windows runtime smoke tests remain pending. Linux CI is configured but has not yet run on a hosted repository.
- Symbolic-link entries are not followed; the local adapter is not a security sandbox against parent-path replacement races. See SECURITY.md.
- Cancellation stops cooperative processing and publication, not an OS directory read already in progress.
- Listings are in-memory snapshots refreshed manually; descendants remain unknown until expanded. There is no recursive availability index or metadata inheritance.
- File opening delegates to VS Code and installed editors. NIfTI rendering, read-only enforcement inside other editors and rich NiiVue integration were not established by this slice.

## Automatic root recognition

The VS Code test host is launched with a fresh profile and a BIDS fixture workspace. A test waits for automatic activation (without calling activate or Add Dataset), then confirms that the workspace root appears and its descendants remain unindexed. A second test adds/removes a real temporary BIDS workspace folder, checks automatic entry lifecycle, promotes it with explicit Add Dataset, and verifies that the manual entry survives closing that workspace folder. Descriptor bytes remain unchanged.

Unit tests cover the two-stat root/marker check, no nested discovery, ordinary-marker versus directory/symlink handling, malformed JSON being recognized without parsing, unavailable roots, automatic/manual persistence separation, session dismissal, duplicate roots, bounded probe concurrency, progressive publication, stale results and disposal. Automatic ownership is transient; removed automatic entries stay hidden until explicit Add or window reload. Global Refresh reruns recognition; descriptor changes are not watched.
