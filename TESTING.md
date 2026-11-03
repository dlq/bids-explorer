# Testing

Tests accompany feature work and bug fixes. A passing coverage percentage alone does not establish correctness. Assert observable outcomes and invariants, including errors, cancellation and incomplete results; do not just reproduce implementation steps in assertions.

## Commands and coverage

- `npm test`: fast core tests, without coverage collection.
- `npm run check`: format checking, type checking, linting and unit tests with enforced coverage.
- `npm run test:integration`: real VS Code extension-host tests with coverage reporting.
- `npm run package`: ensure the extension still produces a VSIX.

Unit coverage is enforced **per production file**: at least 95% lines, statements and functions, and 90% branches. The configuration includes unexecuted compiled production files, so a new untested module cannot disappear from the report. Tests, the VS Code activation entry point and `src/ui/` are excluded from this unit gate; they belong in extension-host tests. Do not put business logic in UI files to avoid the gate.

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

### Remote, compatibility and performance

Real SSH tests and private datasets are explicit opt-ins. Ordinary tests must not read `.local/strata-test-context.json`, initiate SSH, require credentials or depend on private data. Use synthetic datasets on authorized hosts for remote smoke tests, disconnections, missing tools and host execution checks.

Before release, validate minimum and current supported VS Code versions and supported host platforms. CI currently uses Linux and VS Code 1.96; broaden that matrix as adapters and host dependencies land.

Keep large generated fixtures outside Git. Measure enumeration, indexing, publication, extraction, transfer and opening separately. Define repeatable workload and responsiveness budgets before adding performance gates; avoid timing assertions on shared CI runners without a reliable baseline. Verify that cached browsing stays usable while other scopes index.

## Pull request expectations

Describe the behavior changed, tests run and remaining limitations. Bug fixes should include a regression test where practical. New source formats require adapter tests before real-data validation. Keep `CHANGELOG.md` current for notable user-visible changes and update this document as the test strategy evolves.

Release validation and versioned artifact checks follow [VERSIONING.md](VERSIONING.md); coverage checks alone do not satisfy a roadmap release gate.
