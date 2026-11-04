# Testing

Tests accompany feature work and bug fixes. A passing coverage percentage alone does not establish correctness. Assert observable outcomes and invariants, including errors, cancellation and incomplete results; do not just reproduce implementation steps in assertions.

## Commands and coverage

- `npm test`: fast core tests, without coverage collection.
- `npm run check`: format checking, type checking, linting and unit tests with enforced coverage.
- `npm run test:integration`: real VS Code extension-host tests with coverage reporting.
- `npm run package`: ensure the extension still produces a VSIX.

Unit coverage is enforced **per production file**: at least 95% lines, statements and functions, and 90% branches. The configuration includes unexecuted compiled production files, so a new untested module cannot disappear from the report. Tests, the VS Code activation entry point and `src/ui/` are excluded from this unit gate; they belong in extension-host tests. Do not put business logic in UI files to avoid the gate. The generated `out/webview/**` ESM output is excluded too: it duplicates the unit-tested portable gradient model plus browser-specific DOM/canvas glue. The canonical model and bounded reader remain inside the per-file gate; real webview startup and linked selection are exercised in extension-host tests. This exclusion does not claim exhaustive DOM interaction coverage.

Unit HTML and LCOV reports are under `coverage/unit/`. Extension-host HTML and LCOV reports are under `coverage/`; this report covers production TypeScript loaded by the extension-host tests and excludes tests. `includeAll` is enabled, but the runner does not reliably discover unloaded TypeScript files; the unit gate is responsible for catching untested core modules. Extension-host percentages are reported but currently have no numeric gate. Some core code only runs in unit tests, so these reports measure different test scopes and must not be presented as combined coverage. CI checks the unit gate, runs extension-host tests and uploads reports even when a check fails. Hosted CI execution remains to be verified after pushing.

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

The current tests cover automatic startup/workspace recognition, manual versus automatic ownership, session dismissal, bounded root probing and late results, plus source identity, canonical folder labels, real directory reads, unchanged dataset contents, symlinks/special files, registration persistence/failure, lazy coverage, cancellation races, refresh isolation and error recovery. Extension-host tests cover commands, file/details opening and the native tree. These do not establish archive or Remote SSH functionality. See [local browser validation](docs/LOCAL_BROWSER_TESTING.md) for manual and scale evidence.

Gradient tests cover original tokens/order, numeric shape and size limits, low-b/group boundaries, raw-axis rotation, missing counterparts, malformed UTF-8, cancellation, unchanged sources and deterministic file-revision races. Real VS Code tests load the packaged module/CSS under CSP, await messages from the running preview, change linked selection and check concurrent-open reuse/disposal. Visual checks cover rotation, plot selection, grouping, original-text opening and snapshot reload. Ordinary tests use temporary synthetic pairs, not the downloaded public data.

The metadata slice tests lossless field scanning after syntax parsing: every JSON value type, escaped keys, duplicate occurrences, JSON-pointer provenance, integers beyond JavaScript's safe range, large exponents, explicit resource limits, cancellation and unchanged files. Real webview tests check packaged script startup under CSP, duplicate-aware paging state, raw/derivative panel separation, concurrent-open reuse, disposal, default descriptor previews, raw-JSON fallback for unusable descriptors, and ordinary sidecar JSON opening. Shared text-reader race/encoding/handle-closure cases remain covered by the gradient IO regression tests. Portable interfaces live in type-only `.d.ts` modules; they emit no executable code and require no coverage exclusion.

Entity tests cover canonical/sessionless/combined layouts, filename-only sessions, explicit versus filename conflicts, duplicate entity tokens, leading zeros, case and `+` labels, compound extensions, unknown/unparsed pieces, malformed or oversized relative paths, immutable results and root/pipeline namespace boundaries. A real extension-host workflow verifies that canonical and combined physical entries coexist with distinct IDs/URIs, Source Details exposes the correct evidence and ambiguity, and no fixture bytes change. Entity interpretation reads paths only; no recursive indexing, image content or validator is involved.

### Remote, compatibility and performance

Real SSH tests and private datasets are explicit opt-ins. Ordinary tests must not read `.local/strata-test-context.json`, initiate SSH, require credentials or depend on private data. Use synthetic datasets on authorized hosts for remote smoke tests, disconnections, missing tools and host execution checks.

Before release, validate minimum and current supported VS Code versions and supported host platforms. CI currently uses Linux and VS Code 1.96; broaden that matrix as adapters and host dependencies land.

Keep large generated fixtures outside Git. Measure enumeration, indexing, publication, extraction, transfer and opening separately. Define repeatable workload and responsiveness budgets before adding performance gates; avoid timing assertions on shared CI runners without a reliable baseline. Verify that cached browsing stays usable while other scopes index.

## Pull request expectations

Describe the behavior changed, tests run and remaining limitations. Bug fixes should include a regression test where practical. New source formats require adapter tests before real-data validation. Keep `CHANGELOG.md` current for notable user-visible changes and update this document as the test strategy evolves.

Release validation and versioned artifact checks follow [VERSIONING.md](VERSIONING.md); coverage checks alone do not satisfy a roadmap release gate.

Selected-file inheritance tests cover root-to-leaf replacement (including null, objects and exact large-number tokens), filename-only subset matching, numeric index padding, same-level ambiguity, duplicate keys, incomplete coverage, source identity, skipped links, cancellation and resource limits. Directory-adapter tests use disposable synthetic fixtures and injected IO failures/changes; they verify derivative/nested boundaries and preserve source bytes. Extension-host tests exercise the explicit tree command, generated provenance/companion report, bounded display and inspector cancellation. Real dataset/SSH inheritance performance remains unmeasured.

Participant-table tests preserve source order, quoted tabs/newlines/escaped quotes and raw tokens, leading zeros, large/scientific number text, missing/empty/absent cells, duplicate IDs/headers and uneven rows. They exercise byte/row/column limits, cancellation, malformed/missing/linked dictionaries and unchanged source bytes. Extension-host tests load the packaged table client, verify paged DOM text including HTML-like cell values, source-bound raw actions, snapshot reload/failure retention, manager coalescing/cancellation and raw fallback. Real large-table and SSH preview performance remain unmeasured.

Session/scan table tests cover family recognition, correct identifier-column duplicate reporting, literal scan paths (including traversal/URI-like text without opening), inherited definitions/overrides, ambiguity, malformed dictionaries, source choices, dataset/pipeline/nested boundaries and cancellation. Extension-host tests exercise tree and registered-root URI actions for both families, render source-backed definitions, choose a known dictionary source for raw opening and retain the table with unresolved metadata after reload. No real MRI or private datasets are needed.

Tree-description tests cover dataset/pipeline names, inherited task names, explicit participant/session/combined labels, exact zero-padded IDs, duplicate headers/rows/JSON names, missing or malformed metadata, nested/pipeline boundaries, immutable source evidence and unchanged dataset bytes. Queue tests enforce nonblocking publication, request coalescing, concurrency/queue/cache bounds, cancellation and stale-generation suppression. Extension-host tests verify settings-driven labels, unchanged tree IDs/URIs/names, targeted refresh, Source Details provenance, derivative isolation and cancellation without late UI updates. Large/SSH enrichment throughput remains unmeasured.

The 0.2.0 closeout adds lossless/tolerant CHANGES parsing with malformed dates, unknown text, source order, limits and cancellation. Real webview tests exercise history paging/filtering/raw opening/reload retention and inherited gradient actions, including a match becoming ambiguous after inspection. Both VS Code 1.96.0 and available stable 1.144.1 pass. [0.2.0 evidence](docs/MILESTONE_0.2.0.md) records opt-in ds000114 checks and a synthetic SSH host API smoke; neither establishes remote UI/first-frame timing or general huge-cohort throughput.
