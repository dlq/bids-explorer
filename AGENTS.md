# BIDS Explorer project context

Read `PROJECT.md`, then `RESEARCH.md` and `PLANS.md` before implementing features. The benchmark snapshot is in `docs/evidence/niivue-vscode/REPORT.md`.

- Display name: BIDS Explorer. Directory/extension name: `bids-explorer`. Command/settings namespace: `bidsExplorer`.
- Record notable user-visible changes in `CHANGELOG.md` under Unreleased as they are implemented. Add version/date headings only for actual releases.
- The extension development scaffold is in place. Read-only directory browsing, selected-file JSON inheritance/DWI companion reports and bounded participant/session/scan table previews and source-backed metadata tree descriptions are implemented. Broader relationships, indexing and archive readers remain future work; extend the implementation when the user requests it.
- BIDS navigation and dataset context are the initial focus. NiiVue is an optional visualization integration; embedding remains undecided.
- Use supported viewer integration points. Private Preact/webview probes from the benchmark are not a production API.
- Keep physical source identity separate from logical BIDS paths. Preserve provenance and duplicate-path source choices.
- Keep indexing, archive merging, summaries and table work off the UI path. Show partial coverage and support cancellation.
- Keep large data, caches and credentials outside the repository. Machine-specific test locations are in ignored `.local/strata-test-context.json`; read them only for an authorized test task.
- Strata is a separate project at `/Users/dlq/Developer/macvdb`. Treat its implementation as reference material and verify assumptions before porting it.

- Follow `TESTING.md`: add meaningful tests with behavior changes and bug fixes, maintain the per-file coverage gate, and keep real SSH/private-data tests opt-in.
- Use Prettier for formatting and ESLint for code checks. Run `npm run check` before finishing code changes; use `npm run format` and `npm run lint:fix` for fixes. Preserve imported benchmark evidence verbatim.
- Follow `SECURITY.md`: run `npm run security` for code or rule changes, review dependency audit findings, and add security regression cases as archive/process APIs are implemented.
- Follow `VERSIONING.md` and version targets in `PLANS.md`. Keep `package.json` and the lockfile synchronized on release bumps; derive VSIX names from the manifest. Do not bump versions or create release tags for routine commits.
- Keep `README.md` user-focused and explicit about implemented versus planned behavior. Contributor setup and tooling commands belong in `docs/DEVELOPMENT.md`.
- Dataset access is read-only by default. Do not rename, restructure, rationalize, rewrite metadata or run validation/fixes as part of ordinary exploration. Optional validation/edit workflows are future scope in `PLANS.md`.
- Keep the BIDS EXPLORER section focused on recognizable BIDS elements. Administrative/unrecognized entries belong in the native EXPLORER file tree; never delete them or treat their omission as failed validation or missing data.
- Automatically recognize open workspace roots with an ordinary root-level `dataset_description.json` through shallow attribute checks. Keep this separate from validation and recursive indexing; do not persist automatic roots as manual registrations.
