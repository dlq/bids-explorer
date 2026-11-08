# Testing

Tests accompany feature work and bug fixes. A passing coverage percentage alone does not establish correctness. Assert observable outcomes and invariants, including errors, cancellation and incomplete results; do not just reproduce implementation steps in assertions.

## Commands and coverage

- `npm test`: fast core tests, without coverage collection.
- `npm run check`: format checking, type checking, linting and unit tests with enforced coverage.
- `npm run test:integration`: real VS Code extension-host tests with coverage reporting.
- `npm run package`: build the VSIX and run artifact-contract tests.
- `npm run test:package`: inspect the existing manifest-named VSIX for portable contents, declared assets and preview clients.

Unit coverage is enforced **per production file**: at least 95% lines, statements and functions, and 90% branches. The configuration includes unexecuted compiled production files, so a new untested module cannot disappear from the report. The unit gate excludes tests, the VS Code activation entry point, and presentation code in `src/ui/` and `src/webview/`. Keep dataset logic and workspace-host readers in the covered modules. The generated `out/browser/**` output is also excluded because it contains browser scripts and a second build of the portable gradient model. The canonical model and bounded reader remain inside the per-file gate; real webview startup and linked selection are exercised in extension-host tests. This exclusion does not claim exhaustive DOM interaction coverage.

Unit HTML and LCOV reports are under `coverage/unit/`. Extension-host HTML and LCOV reports are under `coverage/`; this report covers production TypeScript loaded by the extension-host tests and excludes tests. `includeAll` is enabled, but the runner does not reliably discover unloaded TypeScript files; the unit gate is responsible for catching untested core modules. Extension-host percentages are reported but currently have no numeric gate. Some core code only runs in unit tests, so these reports measure different test scopes and must not be presented as combined coverage. CI checks the unit gate, runs extension-host tests and uploads reports even when a check fails. Hosted CI has passed on Linux with both the minimum supported and current stable VS Code versions.

Use coverage reports to identify missing behavior, particularly branches. Any exclusion or threshold reduction requires an explicit rationale in review. Generated code and inherently host-specific glue may justify exceptions; ordinary untested logic does not.

## Test layers

### Core and source adapters

Test BIDS interpretation, resource identity, collection merging, index state and source IO independently of VS Code where possible. Use real tiny temporary directories and containers for reader behavior instead of mocking away all IO. Inject controlled IO failures where necessary to exercise error paths. Use deterministic data and isolated temporary storage; clean up on success and failure.

As features land, cover:

- Canonical, sessionless and noncanonical BIDS layouts; explicit/inferred entity conflicts; metadata inheritance; raw/derivative separation.
- Physical source identity versus logical paths, remote hosts, duplicate sources, wrapper normalization and file/directory conflicts.
- ZIP, tar variants and SquashFS indexing and exact-member extraction; corrupt inputs, traversal, symlinks/special files, duplicate members, missing tools and tool-version compatibility.
- Partial/complete/failed coverage; progressive results; cancellation; independent branch refresh; stable selections and cache invalidation.
- Source changes during extraction, atomic publication, bounded cache behavior and partial-file cleanup.
- Clinical identifiers with leading zeros, duplicate join keys, unmatched rows and ambiguous session joins.

Compare logical inventories and counts with independently constructed expected inventories. Test subject/session pairs explicitly rather than relying on total row counts. Never equate unknown or failed indexing with absence.

### VS Code integration

Use a real extension host for activation, commands, registration/disposal, lazy tree behavior, event delivery, refresh isolation and supported file/viewer handoff. Assert state and observable behavior rather than event counts alone. Add tests alongside each implemented interaction, including its failure path. Visual/manual checks still matter for expansion, selection and responsiveness.

The current tests cover automatic startup/workspace recognition, manual versus automatic ownership, session dismissal, bounded root probing and late results, plus source identity, canonical folder labels, real directory reads, unchanged dataset contents, symlinks/special files, registration persistence/failure, lazy coverage, cancellation races, refresh isolation and error recovery. Extension-host tests cover commands, file/details opening and the native tree. These directory tests cover the original local workflow. ZIP and Remote SSH evidence is listed separately below. See [local browser validation](docs/LOCAL_BROWSER_TESTING.md) for manual and scale evidence.

Gradient tests cover original tokens/order, numeric shape and size limits, low-b/group boundaries, raw-axis rotation, missing counterparts, malformed UTF-8, cancellation, unchanged sources and deterministic file-revision races. Real VS Code tests load the packaged module/CSS under CSP, await messages from the running preview, change linked selection and check concurrent-open reuse/disposal. Visual checks cover rotation, plot selection, grouping, original-text opening and snapshot reload. Ordinary tests use temporary synthetic pairs, not the downloaded public data.

The metadata slice tests lossless field scanning after syntax parsing: every JSON value type, escaped keys, duplicate occurrences, JSON-pointer provenance, integers beyond JavaScript's safe range, large exponents, explicit resource limits, cancellation and unchanged files. Real webview tests check packaged script startup under CSP, duplicate-aware paging state, raw/derivative panel separation, concurrent-open reuse, disposal, default descriptor previews, raw-JSON fallback for unusable descriptors, and ordinary sidecar JSON opening. Shared text-reader race/encoding/handle-closure cases remain covered by the gradient IO regression tests. Portable interfaces live in type-only `.d.ts` modules; they emit no executable code and require no coverage exclusion.

Entity tests cover canonical/sessionless/combined layouts, filename-only sessions, explicit versus filename conflicts, duplicate entity tokens, leading zeros, case and `+` labels, compound extensions, unknown/unparsed pieces, malformed or oversized relative paths, immutable results and root/pipeline namespace boundaries. A real extension-host workflow verifies that canonical and combined physical entries coexist with distinct IDs/URIs, Source Details exposes the correct evidence and ambiguity, and no fixture bytes change. Entity interpretation reads paths only; no recursive indexing, image content or validator is involved.

### Remote, compatibility and performance

Real SSH tests and private datasets are explicit opt-ins. Ordinary tests must not read `.local/strata-test-context.json`, initiate SSH, require credentials or depend on private data. Use synthetic datasets on authorized hosts for remote smoke tests, disconnections, missing tools and host execution checks.

Before release, validate minimum and current supported VS Code versions and supported host platforms. CI uses Linux with both VS Code 1.96 and current stable. The aggregate check requires both integration versions and the separate quality/package job to pass; unit and per-version integration coverage reports are uploaded separately.

Keep large generated fixtures outside Git. Measure enumeration, indexing, publication, extraction, transfer and opening separately. Define repeatable workload and responsiveness budgets before adding performance gates; avoid timing assertions on shared CI runners without a reliable baseline. Verify that cached browsing stays usable while other scopes index.

## Pull request expectations

Describe the behavior changed, tests run and remaining limitations. Bug fixes should include a regression test where practical. New source formats require adapter tests before real-data validation. Keep `CHANGELOG.md` current for notable user-visible changes and update this document as the test strategy evolves.

Release validation and versioned artifact checks follow [VERSIONING.md](VERSIONING.md); coverage checks alone do not satisfy a roadmap release gate.

Selected-file inheritance tests cover root-to-leaf replacement (including null, objects and exact large-number tokens), filename-only subset matching, numeric index padding, same-level ambiguity, duplicate keys, incomplete coverage, source identity, skipped links, cancellation and resource limits. Directory-adapter tests use disposable synthetic fixtures and injected IO failures/changes; they verify derivative/nested boundaries and preserve source bytes. Extension-host tests exercise the explicit tree command, generated provenance/companion report, bounded display and inspector cancellation. Real dataset/SSH inheritance performance remains unmeasured.

Participant-table tests preserve source order, quoted tabs/newlines/escaped quotes and raw tokens, leading zeros, large/scientific number text, missing/empty/absent cells, duplicate IDs/headers and uneven rows. They exercise byte/row/column limits, cancellation, malformed/missing/linked dictionaries and unchanged source bytes. Extension-host tests load the packaged table client, verify paged DOM text including HTML-like cell values, source-bound raw actions, snapshot reload/failure retention, manager coalescing/cancellation and raw fallback. Real large-table and SSH preview performance remain unmeasured.

Session/scan table tests cover family recognition, correct identifier-column duplicate reporting, literal scan paths (including traversal/URI-like text without opening), inherited definitions/overrides, ambiguity, malformed dictionaries, source choices, dataset/pipeline/nested boundaries and cancellation. Extension-host tests exercise tree and registered-root URI actions for both families, render source-backed definitions, choose a known dictionary source for raw opening and retain the table with unresolved metadata after reload. No real MRI or private datasets are needed.

Tree-description tests cover dataset/pipeline names, inherited task names, explicit participant/session/combined labels, exact zero-padded IDs, duplicate headers/rows/JSON names, missing or malformed metadata, nested/pipeline boundaries, immutable source evidence and unchanged dataset bytes. Queue tests enforce nonblocking publication, request coalescing, concurrency/queue/cache bounds, cancellation and stale-generation suppression. Extension-host tests verify settings-driven labels, unchanged tree IDs/URIs/names, targeted refresh, Source Details provenance, derivative isolation and cancellation without late UI updates. Large/SSH enrichment throughput remains unmeasured.

The 0.2.0 closeout adds lossless/tolerant CHANGES parsing with malformed dates, unknown text, source order, limits and cancellation. Real webview tests exercise history paging/filtering/raw opening/reload retention and inherited gradient actions, including a match becoming ambiguous after inspection. At the 0.2.0 closeout, both VS Code 1.96.0 and the then-available stable 1.144.1 passed. [0.2.0 evidence](docs/MILESTONE_0.2.0.md) records opt-in ds000114 checks and a synthetic SSH host API smoke; neither establishes remote UI/first-frame timing or general huge-cohort throughput.

Workspace-folder tests must await `onDidChangeWorkspaceFolders` to confirm edits, rather than only polling the potentially optimistic workspaceFolders snapshot. Native Explorer handoff serializes its own requests and waits/retries after another edit is confirmed, with a real-host regression for overlapping updates. See the [VS Code workspace implementation](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/common/extHostWorkspace.ts) for the documented API's confirmation behavior.

Task-file feedback tests cover literal JSON-sidecar entry points (including duplicate keys, raw numeric tokens, safe text rendering and malformed-source fallback) and event TSV entry points with inherited dictionaries. Events do not select an identifier column or drop repeated onsets. Hover tests verify static untrusted Markdown formatting, escaped dataset text, disabled HTML/trust, short source locations and descriptions preceding provenance.

ZIP development tests use independently generated tiny ZIP records, including ZIP64 end records. They exercise unsafe paths, duplicate-member ordinals, member types/encryption flags, budgets, cancellation, source replacement, explicit placements at different depths and overlay conflicts. The inspector command has a real extension-host test for a nested physical ZIP and the 200-member report limit. Production dependency inclusion is checked during packaging. The opt-in single-ZIP remote index probe is documented in [ZIP development notes](docs/ZIP.md); it does not establish extraction, collection throughput or remote UI behavior.

ZIP tree regressions verify that Add Dataset no longer hides archive-only roots, nested ZIPs coexist with loose files, indexes are lazy/reused/bounded/scoped to registration, duplicate files remain separate, conflicts and administrative omissions preserve provenance, and source details are available without extracting bytes. Remote API and actual UI observations are recorded separately in [ZIP development notes](docs/ZIP.md).

Logical-layout tests cover subject/session grouping across named ZIPs and canonical/combined loose folders, lazy session discovery, wrapper checks, bare shards, pipeline isolation, directory merging, duplicate files and file/directory conflicts, original physical identity, cancellation and bounds. Exact explicit collection declarations have unit coverage and an extension-host regression proving a descriptorless root follows workspace configuration independently of manual registrations.

Archive viewing regressions cover exact URI/ordinal identity and VS Code URI round-tripping, native/fallback CRC vectors, corrupt payloads, declared/output-size lies, unsafe paths, links/special/encrypted/unsupported members, excessive ratios, cancellation at multiple stages, sink/open failures and source changes. Metadata tests cover original provenance, literal JSON numbers, same-archive table dictionaries and gradient ambiguity; cache tests cover checked selected extraction, private/readonly publication, reuse, provenance, budgets, malformed storage and partial cleanup. Real extension-host tests render archive JSON/table/gradient previews, click the actual raw-source control through a test-only nonce harness, prove the readonly scheme cannot be written, and hand off an extracted synthetic NIfTI through VS Code. Actual optional-viewer rendering is verified separately in the authorized remote smoke test.

Cross-source inheritance tests cover both loose and archived selections, source provenance and overrides, mixed-source gradients, same-level ambiguity, unavailable or deferred branches, dataset boundaries and revision changes. The clean 0.3.0 build passed 114 unit tests and 30 integration tests each on VS Code 1.96.0 and 1.144.1. The synthetic Rorqual check exercised the host API separately from the local VS Code command tests. [0.3.0 validation](docs/MILESTONE_0.3.0.md)

Tar regression tests cover exact selected bytes and cancellation during payload delivery for plain ustar and gzip tarballs. They also cover duplicate ordinals, mismatched revisions and paths, unsafe names, special members, corrupt headers and gzip checksums, truncation, and read and scan limits. The opt-in Connectome Mapper test exercises the native logical tree, rendered metadata previews and MRI handoff. [Tar reader validation](docs/TAR.md)

## Usability and accessibility checks

Use a synthetic study outside the repository and record the VS Code version, host, build and workspace-trust mode. Check a representative tree, literal and inherited JSON, participant/session/scan/event tables, history, gradients, availability and image viewer. Test ordinary and high-contrast themes, keyboard focus order, named controls, table headers, live result status, long content and recovery after errors.

Use an actual screen reader for spoken-navigation checks. Accessibility-tree output and screenshots alone do not establish spoken usability. Track observations and unverified cases in [USABILITY.md](docs/USABILITY.md). The November 7 pass includes user-assisted VoiceOver checks and regression tests for image-position controls, collapsed provenance and focusable table scrolling.

## Opt-in public logical-layout walkthrough

`src/test/integration/publicLayout.test.ts` uses the separately downloaded ds004662/ds007661 run subsets and pinned official ds000117 example only when `BIDS_EXPLORER_LAYOUT_FIXTURE` is explicitly set. `BIDS_EXPLORER_LAYOUT_IMAGES=1` additionally loads real raw and processed 4D NIfTI data in the packaged viewer. Ordinary runs skip the test and perform no download. The test verifies source hashes, echo identities, shared resources, separate derivative linking, literal field-map targets and metadata previews. The prepared workspace and manual checklist are documented in [TEST_DATA.md](docs/TEST_DATA.md#logical-layout-examples--november-7-2026). These are browsing/integrity checks; no validator, metadata rewriting or processing pipeline runs.

Multi-echo grouping tests cover exact sibling entity matches, numerical echo ordering, shared versus echo-specific resources, duplicate indices, conflicting images, run/part/dataset boundaries and incomplete-listing fallback. Extension-host cases exercise loose, ZIP, tar and SquashFS navigation, original resource identity, parent relationships and refresh. The opt-in public example checks five-echo BOLD/reference groups while keeping task-wide events at modality scope.

Native Image view regressions exercise the real workbench view and packaged client: selected-image context, inherited metadata and source provenance, literal HTML-like dataset values, renderer controls, image switching and disposal. Progressive NIfTI tests cover layout, colour map, intensity limits, frame selection, crosshair movement and reset, including rejection of invalid control values. Manual layout checks verify moving the view to the Secondary Side Bar.

Image sidebar presentation regressions cover scan parameters before controls, TE conversion with unchanged source values, readable literal strings, one provenance group per source, collapsed position controls and hidden single-volume navigation. Full-precision intensity limits remain internal when formatted for display.

Webview sender-boundary regressions exercise all six packaged clients in real VS Code: genuine host messages work, foreign/opaque/empty origins are ignored, and a matching-origin control is processed. Tar tests deterministically replace a path between stat and open with another inode, a directory or a symlink, for inventories and selected-member reads; they assert rejection before any read/output and closure of acquired descriptors. See [CodeQL review evidence](docs/CODEQL_REVIEW.md).

Availability client integration checks exercise actual host progress, foreign/opaque/empty-origin rejection, stale/malformed messages and real filter/reveal controls. Package tests live in `src/test/package.test.ts`, outside the unit glob because they require a built VSIX; `npm run package` invokes them after packaging, including in CI/release verification. `BIDS_EXPLORER_VSIX` can explicitly select an artifact for this check. They reject native build bindings and development sources, and verify the declared entry, icon, license, README and every browser client.

Shared image-cache regression tests fork separate Node processes with real synthetic ZIP reads. A gated stream pauses after header/budget validation, making overlap deterministic. They cover entry and byte budgets including provenance, waiting/extraction cancellation, active-image clear protection, killed-owner partial cleanup, queue contention, conservative foreign-owner handling, malformed state and source changes while waiting. These tests exercise the shared filesystem boundary without a private dataset or SSH connection.
