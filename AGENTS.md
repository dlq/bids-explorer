# BIDS Explorer project context

Read `PROJECT.md`, then `docs/STRATA_HANDOFF.md` and `docs/REFERENCE_MAP.md` before implementing features. The benchmark snapshot is in `docs/evidence/niivue-vscode/REPORT.md`.

- Display name: BIDS Explorer. Directory/extension name: `bids-explorer`. Command/settings namespace: `bidsExplorer`.
- The extension has not been scaffolded. The current work is project setup and context transfer; start implementation only when the user requests it.
- BIDS navigation and dataset context are the initial focus. NiiVue is an optional visualization integration; embedding remains undecided.
- Use supported viewer integration points. Private Preact/webview probes from the benchmark are not a production API.
- Keep physical source identity separate from logical BIDS paths. Preserve provenance and duplicate-path source choices.
- Keep indexing, archive merging, summaries and table work off the UI path. Show partial coverage and support cancellation.
- Keep large data, caches and credentials outside the repository. Machine-specific test locations are in ignored `.local/strata-test-context.json`; read them only for an authorized test task.
- Strata is a separate project at `/Users/dlq/Developer/macvdb`. Treat its implementation as reference material and verify assumptions before porting it.
