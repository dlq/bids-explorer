# BIDS Explorer

A VS Code extension for exploring BIDS neuroimaging datasets and their derivatives. The current development build supports **read-only local directory browsing**. SSH validation, ZIP, tarball and SquashFS readers are planned.

**Status: unreleased development build (`0.0.1`), working toward `0.1.0`.** There is no Marketplace release or public installation link.

## Available today

- A collapsible **BIDS EXPLORER** section inside VS Code's **EXPLORER** sidebar, alongside the normal file tree.
- Automatic recognition of open workspace folders containing an ordinary `dataset_description.json` file at their root, including folders added later.
- **Add Dataset** for external directories or noncanonical roots, with explicit registrations remembered per workspace; removing an entry never deletes files.
- Lazy directory expansion with canonical participant, session, modality and derivatives labels. Sessionless datasets work; the tree shows recognizable BIDS elements only.
- **Show Dataset in File Explorer** adds the dataset folder to the workspace and reveals it in the normal, complete file tree. Files such as `.datalad` metadata and `.DS_Store` are omitted from BIDS Explorer, not deleted.
- File opening through VS Code's selected/default editor, plus **Show Source Details** for the original URI/path, current filesystem size/mtime and immediate-child listing coverage.
- Branch refresh, retryable errors, and cancellation of pending listings. A failed listing retains existing cached rows and marks them stale in Source Details; it does not establish missing data.

This is an initial explorer: canonical folders are labeled in place. It does not normalize combined subject/session names, inherit JSON metadata, validate BIDS conformance, rename or restructure datasets. Recognizable symbolic-link entries are visible but cannot be expanded/opened through this tree; other special files are left to the native File Explorer. Files are listed without inspecting image contents.

## Quick start

1. Install a locally built VSIX using **Extensions: Install from VSIX**, or run the project with F5 as described in `docs/DEVELOPMENT.md`.
2. Open a local BIDS dataset folder in a trusted desktop VS Code workspace, then expand **EXPLORER → BIDS EXPLORER**. A root-level `dataset_description.json` makes it appear automatically; no Add Dataset step is needed.
3. For a directory outside the workspace, or one without that marker, click **+** or run **BIDS Explorer: Add Dataset**. Manual registration does not require the marker.
4. Expand folders as needed. Click a file to open it using VS Code's default editor; image display requires an appropriate installed viewer.
5. Right-click a row for **Show Source Details**, or a folder for branch **Refresh**. **Remove Dataset** is available on dataset roots and removes only the entry/registration. Automatically recognized entries stay hidden for the current window session; Add Dataset restores them, and reloading the window recognizes them again.

Recognition uses at most two shallow filesystem attribute checks per workspace folder, with bounded concurrency. It does not parse the descriptor, validate conformance, scan for nested datasets or follow symbolic-link roots/markers. Open a nested dataset as its own workspace folder or add it manually.

The header Refresh action reruns root recognition and refreshes all displayed datasets. The context-menu Refresh action affects its selected branch. Filesystem changes are not watched automatically; refresh after external changes. Use **BIDS Explorer: Cancel Pending Listings** (the stop button) to cancel pending listing work. Cancellation prevents publication and stops cooperative processing; an already-issued OS directory read may finish first. Completed listings remain cached in memory.

Right-click a dataset root and choose **Show Dataset in File Explorer** for its complete physical tree in the normal EXPLORER file section. This explicitly changes the workspace folder list; VS Code may reload when converting a single-folder window to a workspace. The native Explorer follows your usual file-exclusion settings. BIDS Explorer keeps original names but omits entries outside its current recognition vocabulary; this does not mean they are invalid or absent. Source Details reports coverage for immediate children only. Unexpanded descendants remain unknown even when their parent has been enumerated. No recursive dataset counts are presented yet.

## Requirements and data handling

Use desktop **VS Code 1.96 or newer** with a trusted, non-virtual workspace. The directory adapter accepts `file:` URIs on the workspace host. Remote SSH execution is configured but not yet validated; browser-only VS Code and arbitrary remote filesystem URI schemes are unsupported. No Python, archive tools or NiiVue installation is required by the runtime.

Explorer reads directory entries and requested filesystem attributes. It never writes dataset files or creates indexes/caches inside datasets. Only explicit registration URIs are saved in VS Code's workspace state; automatic roots follow the current workspace folder list and are not saved as manual registrations; directory listings are kept in memory. There is no persistent metadata index, image cache or telemetry implementation. No separate SSH transport or dataset download is initiated by the extension.

Opening a file hands it to another VS Code editor; saving changes in that editor is a separate user action. Explorer does not make that editor read-only or control a third-party viewer's behavior.

## Planned capabilities

| Proposed version | Planned capability                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `0.1.0`          | Complete and verify the initial local directory browser (implemented in development, not released) |
| `0.2.0`          | Richer BIDS interpretation and inherited metadata                                                  |
| `0.3.0`–`0.5.0`  | ZIP, tarball and SquashFS browsing, including declared archive collections                         |
| `0.6.0`          | Validated Remote SSH workflows and persistent indexing                                             |
| `0.7.0`          | Coverage-aware summaries, filters and participant/session availability                             |
| `0.8.0`–`0.9.0`  | Optional viewer integration, distribution preparation and stabilization                            |
| `1.0.0`          | Supported core exploration across documented formats and hosts                                     |

These are roadmap targets, not current features or scheduled releases. BIDS validation, restructuring and renaming are later, separate opt-in workflows; exploration stays read-only by default. Browsing a dataset does not establish BIDS conformance.

## Documentation and feedback

- `CHANGELOG.md`: implemented changes, currently Unreleased.
- `PLANS.md`: proposed versions and readiness checks.
- `docs/DEVELOPMENT.md`: contributor setup, checks and packaging.
- `docs/TEST_DATA.md`: public datasets for manual/opt-in smoke tests.
- `SECURITY.md`: security checks and future vulnerability-reporting setup.

A public issue tracker and private vulnerability-reporting channel will be linked when the GitHub repository is available. Do not share private datasets, credentials or sensitive clinical information in public reports.
