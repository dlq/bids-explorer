# BIDS Explorer

A VS Code extension for exploring BIDS neuroimaging datasets and their derivatives. Version 0.3.0 supports **read-only directory browsing, diffusion gradients, dataset-description and participant/session/scan table previews, metadata-based tree descriptions and selected-file metadata inspection**. Directory workflows have been smoke-tested over VS Code Remote SSH; a ZIP inventory command is available, ZIP and loose sources in registered directories now share a logical subject/session tree, with archive metadata previews and selected MRI opening through your configured viewer. The development build adds tar inventory, logical browsing, metadata previews and selected MRI opening. SquashFS remains planned.

**Status: `0.3.0` released locally as `v0.3.0`; not published to the Marketplace or GitHub.** There is no Marketplace release or public installation link.

## Available today

- A collapsible **BIDS EXPLORER** section inside VS Code's **EXPLORER** sidebar, alongside the normal file tree.
- Automatic recognition of open workspace folders containing an ordinary `dataset_description.json` file at their root, including folders added later.
- **Add Dataset** for external directories or noncanonical roots, with explicit registrations remembered per workspace; removing an entry never deletes files.
- Lazy directory expansion with canonical participant, session, modality and derivatives labels. Sessionless datasets work; the tree shows recognizable BIDS elements only.
- **Show Dataset in File Explorer** adds the dataset folder to the workspace and reveals it in the normal, complete file tree. Files such as `.datalad` metadata and `.DS_Store` are omitted from BIDS Explorer, not deleted.
- File opening through VS Code's selected/default editor, plus **Show Source Details** for the original URI/path, current filesystem size/mtime and immediate-child listing coverage.
- Branch refresh, retryable errors, and cancellation of pending listings. A failed listing retains existing cached rows and marks them stale in Source Details; it does not establish missing data.

This is an initial explorer: canonical folders are labeled in place. Combined `sub-…_ses-…` folders and matching archive names now contribute to logical `sub-… → ses-…` navigation. This changes the displayed hierarchy while preserving source paths; it does not validate BIDS conformance, rename or restructure datasets. JSON inheritance is available through explicit selected-file inspection. Recognizable symbolic-link entries are visible but cannot be expanded/opened through this tree; other special files are left to the native File Explorer. Files are listed without inspecting image contents.

## Quick start

1. Install a locally built VSIX using **Extensions: Install from VSIX**, or run the project with F5 as described in `docs/DEVELOPMENT.md`.
2. Open a local BIDS dataset folder in a trusted desktop VS Code workspace, then expand **EXPLORER → BIDS EXPLORER**. A root-level `dataset_description.json` makes it appear automatically; no Add Dataset step is needed.
3. For a directory outside the workspace, or one without that marker, click **+** or run **BIDS Explorer: Add Dataset**. Manual registration does not require the marker.
4. Expand folders as needed. Click a file to open it; JSON metadata, participant/session/scan/event tables and gradients use BIDS Explorer previews, and other files use VS Code's default editor; image display requires an appropriate installed viewer.
5. Right-click a row for **Show Source Details**, or a folder for branch **Refresh**. **Remove Dataset** is available on dataset roots and removes only the entry/registration. Automatically recognized entries stay hidden for the current window session; Add Dataset restores them, and reloading the window recognizes them again.

Recognition uses at most two shallow filesystem attribute checks per workspace folder, with bounded concurrency. It does not parse the descriptor, validate conformance, scan for nested datasets or follow symbolic-link roots/markers. Open a nested dataset as its own workspace folder or add it manually.

The header Refresh action reruns root recognition and refreshes all displayed datasets. The context-menu Refresh action affects its selected branch. Filesystem changes are not watched automatically; refresh after external changes. Use **BIDS Explorer: Cancel Pending Work** (the stop button) to cancel pending listings, gradient reads, table reads and metadata operations. Cancellation prevents publication and stops cooperative processing; an already-issued OS directory read may finish first. Completed listings remain cached in memory.

Right-click a dataset root and choose **Show Dataset in File Explorer** for its complete physical tree in the normal EXPLORER file section. This explicitly changes the workspace folder list; VS Code may reload when converting a single-folder window to a workspace. The native Explorer follows your usual file-exclusion settings. BIDS Explorer keeps original names but omits entries outside its current recognition vocabulary; this does not mean they are invalid or absent. Source Details reports coverage for immediate children only. Unexpanded descendants remain unknown even when their parent has been enumerated. No recursive dataset counts are presented yet.

## Entity interpretation

Use **Show Source Details** on a file or folder to inspect subject/session and filename entities, their exact tokens and folder/filename evidence. Leading zeros, case and `+` labels are preserved. Combined `sub-…_ses-…` directories remain visible under their original names; session tags on files are recorded even without a physical session directory.

The details distinguish agreed values, conflicting values, repeated filename entities and keys outside the current vocabulary. Conflicts and duplicate filename entities have no selected winning value. Unknown keys and unparsed filename pieces remain inspectable. A suggested participant/session context is shown only when those labels are unambiguous, with filename-only evidence marked.

Suggestions are scoped to the registered source and physical pipeline namespace. A pipeline folder named like a participant is not interpreted as that participant. Canonical and combined folders can coexist as distinct entries; a shared suggested context never replaces their source URIs or automatically merges them. Entity membership, ordering, numeric-index equivalence, metadata inheritance and BIDS conformance are not validated by this interpretation.

## Metadata-based tree descriptions

Original folder/file names remain the main labels. Dataset roots and pipeline folders gain their recorded `dataset_description.json` **Name** alongside them. Task-tagged NIfTI files gain their applicable inherited **TaskName**. Missing, unreadable or ambiguous metadata leaves the usual description in place; modality folders do not acquire an arbitrary task name.

Participant/session display-label columns are explicitly selected in VS Code settings; both default to empty, so the extension does not guess a `name` column or display unrelated participant attributes. For example, if your tables contain a column called `display_name`, set:

```json
{
  "bidsExplorer.participantLabelColumn": "display_name",
  "bidsExplorer.sessionLabelColumn": "display_name"
}
```

Column names and identifiers must match exactly, preserving leading zeros. Labels require one matching source row and unambiguous ID/label columns. Participant labels come from the current dataset/pipeline's `participants.tsv`; session labels come from the physical participant folder's `sub-…_sessions.tsv`. Combined subject/session folders can display both available labels without changing their physical hierarchy. A nearer nested dataset marker prevents cross-dataset matches. Configured columns can be used without a dictionary; unreadable or ambiguous applicable dictionaries withhold labels.

Hover for a short description, dataset-relative location and source filename; use **Show Source Details → treeDescription** for exact recorded values, row/column or JSON-pointer evidence, source revisions/times and contributing JSON sources. Metadata strings are plain text. Whitespace/control characters are flattened for display, names longer than 120 characters are shortened, and values over 4,096 characters are omitted from automatic descriptions. Original source values are unchanged.

Description work runs separately from tree publication, with at most two jobs active, 32 waiting and 512 cached states/results. Entries beyond those bounds can remain unloaded; Source Details distinguishes unloaded/loading/ready/unavailable. This is partial enrichment, not a recursive metadata index. No image bytes are read. There are no filesystem watchers: refresh a branch to reread its descriptions, or use global Refresh to retry all. Changing column settings clears descriptions without refreshing physical listings. Cancellation drops pending work and retains completed descriptions; there is no persistent description cache. Large/remote description throughput has not yet been benchmarked.

## Dataset description preview

Click `dataset_description.json` in BIDS Explorer to open the readable preview. **Open as JSON text** opens the original file. The explicit **BIDS Explorer: Preview JSON Metadata** action is also available from context menus and the command palette. Native File Explorer opening uses the usual JSON editor. If a descriptor cannot be previewed, the BIDS tree opens the original JSON with a warning.

The read-only preview shows recorded fields and the source URI/snapshot time, with field-name filtering and 20 fields per page. It labels `BIDSVersion` as the BIDS specification version. Unknown fields, duplicate names and original numeric values remain visible; duplicate names do not produce an inferred winning summary value. References and HTML-like strings remain plain text.

This is a selected-file snapshot: no inherited values, missing-field defaults, dataset relationships or BIDS conformance checks are applied. Limits are 1 MiB, 1,000 top-level fields and 32 nested value levels. Individual displayed values are shortened after 16,000 characters with a notice; **Open as JSON text** provides the complete original. **Reload snapshot** explicitly rereads the file; if it fails, the previous preview stays visible with an error.

## Task JSON and event files

Click a task sidecar such as `task-rest_bold.json` for the same recorded-field JSON preview, including duplicate names, original numeric tokens, filtering/paging and raw-text access. The heading identifies the selected JSON file. This shows that file's recorded contents; use **Inspect Metadata and Related Files** on a data file for effective inherited values. Other recognized JSON dictionaries use this preview too. Native Explorer still opens raw JSON by default, with **Preview JSON Metadata** available explicitly.

Click `task-…_events.tsv` or another recognized `*_events.tsv` for a bounded **Events** table. It retains original row order, quoted cells, onset/duration text, trial values and missing cells, and provides filtering, paging, raw-text access and explicit reload. Repeated onsets are allowed and are not treated as duplicate participant/session identifiers. Applicable `*_events.json` column dictionaries use the existing dataset-scoped inheritance resolver. The containing dataset must be registered/recognized for dictionary resolution. Limits match the other tables: 1 MiB, 10,000 records and 128 columns. Timeline plots, image/run association and time-unit conversion remain future work.

## Participant table preview

Click `participants.tsv` in BIDS Explorer to open a read-only table. Use **Filter rows** to search literal cell text; matching rows retain source order. The preview shows 50 rows per page and 12 columns at a time. **Open as TSV text** opens the complete original in the normal editor. An explicit **Preview Participants Table** action is available from the BIDS tree, native Explorer and command palette. If the table cannot be previewed, clicking it in the BIDS tree opens its raw text with a warning.

Identifiers and numeric values stay strings, so leading zeros and scientific notation survive. Quoted tabs, embedded newlines and escaped quotes are decoded for display; original cell tokens remain available in tooltips and the source file. The exact value `n/a` is marked as missing; empty and absent cells are distinct. Duplicate header names, repeated recorded participant IDs and uneven rows are reported without dropping, sorting or joining rows. Source line numbers identify records even after filtering.

The **Column dictionary** section shows matching entries from the same-directory `participants.json`, including descriptions, units, levels and unknown fields as recorded JSON. Duplicate dictionary names remain ambiguous, with every occurrence retained. Missing or unreadable dictionaries leave the table usable with their status shown. No defaults, unit conversion or categorical substitutions are applied. Participant navigation links remain planned.

Reads are limited to 1 MiB per file, 10,000 data records and 128 columns including extra cells. Long displayed cells/headings are shortened after 2,000 characters, and dictionary definitions after 16,000. **Reload snapshot** explicitly reads both files again; an unusable table leaves the previous snapshot visible with an error. Table and dictionary revisions/timestamps are separate snapshots, not an atomic dataset snapshot. Compressed tables, large-table streaming, inferred display names and dataset conformance validation are outside this preview.

## Session and scan table previews

Click `sub-…_sessions.tsv` or `sub-…[_ses-…]_scans.tsv` in BIDS Explorer for the same bounded, read-only table controls. **Preview BIDS Table** is also available from the tree, native Explorer and command palette. Session/scan previewing requires the containing dataset to be registered or automatically recognized; explicit URI/palette actions use the most specific registered root containing the file. Participant previews remain usable on their own.

Session identifiers (`session_id`), scan paths (`filename`) and timestamps retain their recorded text and row order. Repeated identifiers or filenames are reported without dropping rows. Scan paths are plain text: previewing does not check whether files exist, follow paths, open images or resolve scan-row links.

Session/scan column dictionaries use BIDS JSON inheritance within the registered dataset, derivative pipeline or a nearer nested dataset boundary. Definitions show their selected source URI; **Dictionary source** lists all contributing/candidate JSON files for explicit raw opening. Overrides replace whole top-level column definitions. Same-level ambiguity, unreadable JSON, duplicate keys and incomplete coverage leave dictionary values unresolved while retaining the table and recorded source choices. The separate **Inspect Metadata and Related Files** report exposes override history.

The table byte/row/column/display limits above still apply, along with the ancestor/source limits described below. Source reads have independent revisions and are not an atomic dataset snapshot. No table joins, date normalization, acquisition counts or dataset validation are inferred.

## Dataset history

Click `CHANGES` in BIDS Explorer for a read-only history preview, or use **Preview Dataset History** from the native Explorer or command palette. It recognizes CPAN-style numeric release headers and `Unreleased` tolerantly, retaining recorded order, version/date text, source line numbers and unparsed content. It never repairs dates, renames releases or reorders history.

Filter or page through 20 sections at a time; **Open CHANGES as text** gives the complete original. Reads are limited to 1 MiB and 1,000 sections, with displayed sections shortened after 16,000 characters. **Reload snapshot** rereads explicitly and retains the previous view if reading fails. Unusable files opened from the BIDS tree fall back to their raw text. README/license/citation files continue to use native editors.

## Inherited metadata and related files

Right-click a NIfTI (`.nii`/`.nii.gz`) or TSV (`.tsv`/`.tsv.gz`) file in BIDS Explorer and choose **Inspect Metadata and Related Files**. The readable inspector shows effective JSON fields, contributing source URIs, override history, source revisions, coverage and unresolved issues. Filter its cards or page through 20 at a time. Source buttons open the captured original files as text; **Open JSON report** retains the generated report for detailed inspection. **Reload snapshot** explicitly rereads metadata; failures retain the previous snapshot. Field display values are limited to 16,000 characters and history values to 2,000; report values are limited to 4,096. At most 1,000 effective fields are shown in the readable view, with the full field inventory in the report.

Inspection searches only the selected file's ancestor directories, within its registered dataset, derivative pipeline or a nearer nested dataset marker. It matches suffix and filename entities, treating numeric index padding as equivalent while preserving original labels and source names. JSON values replace whole top-level values from root to leaf; there is no deep merge or implicit deletion. Multiple applicable JSON files at one directory level, duplicate keys, unreadable sources or incomplete coverage withhold effective values instead of guessing.

For DWI files, the inspector identifies the nearest applicable `.bval` and `.bvec` sources, distinguishing ambiguous, absent and unknown matches. When both resolve, **Preview resolved diffusion gradients** opens the pair even when its sources have different names or directories. Initial gradient opening and explicit gradient reload resolve applicability again; reopening an existing panel keeps its snapshot. Image volume counts, anatomical orientation, event/fieldmap associations and `IntendedFor`/`DatasetLinks` remain outside this release.

No image or TSV data bytes are read by inheritance inspection. Ancestor inspection is cancellable and limited to 128 levels and 50,000 entries per level, with at most 64 applicable sources, 1 MiB per JSON file and 8 MiB of accepted JSON overall. Applicable symbolic links are not followed and make coverage incomplete. Detected directory, target or JSON changes reject publication; these checks are not an atomic filesystem snapshot. No persistent inheritance cache is implemented.

## Diffusion gradient preview

Click a `.bval` or `.bvec` file in BIDS Explorer, or right-click it in the normal File Explorer and choose **BIDS Explorer: Preview Diffusion Gradients**. The command also works on the active gradient text editor.

The preview combines a rotatable direction sphere, b-value by volume plot, summary counts and linked volume selection. Use the volume controls or paged numeric table for keyboard selection. Adjust the low-b cutoff and grouping tolerance as display choices; defaults are 50 s/mm² each. Low-b volumes are counted separately and shown on the b-value plot. High-b zero-length vectors are counted but cannot appear on the sphere. Directions are normalized for display only, in stored b-vector axes; anatomical orientation is not inferred.

Direct `.bval`/`.bvec` opening uses a same-directory, same-basename pair such as `dwi.bval` and `dwi.bvec`. The metadata inspector can instead open an explicitly resolved inherited pair for a DWI file. The preview distinguishes these modes and shows both physical source URIs. Neither mode checks the image volume count or anatomical orientation. It supports three-row FSL b-vectors, up to 10,000 volumes and 1 MiB per file. Missing partners or unusable numeric shapes produce an error; this is not BIDS validation.

Original values are available in the numeric table and **Open .bval/.bvec as text**. Previewing never changes them. **Reload snapshot** explicitly rereads both files; on failure the prior snapshot stays visible with an error. Source URIs and the snapshot time appear below the plots.

## Preliminary ZIP inventory

Run **BIDS Explorer: Inspect ZIP Archive** from the Command Palette, or right-click a ZIP in the native Explorer. This command reads the selected ZIP's central directory and shows a JSON report with its source revision, total entry count and first 200 members. ZIPs can be selected at any directory depth; they do not need their own dataset descriptor. Cancel through the progress notification or **Cancel Pending Work**.

The inventory is limited to 100,000 entries and 16 MiB of directory metadata. It opens no member streams and performs no decompression, extraction or BIDS validation. BIDS Explorer overlays ZIP and ordinary directory sources into **dataset → subject → session → modality/processing folder** navigation. Sessions for a subject appear together; matching directories merge file-wise and conflicting files remain separate source choices. Known subject/session archive names supply provisional placement without indexing the whole collection. Expanding a session indexes only its contributing archives and checks matching member wrappers; contradictory layouts produce an explicit placement error. Original archive/member paths remain in Source Details. Use **Add Dataset** for a ZIP collection without a root descriptor; registration is remembered for that workspace. Alternatively, declare its workspace-host `file:` URI in `bidsExplorer.collectionRoots` to populate it automatically when that workspace opens. Click archived JSON, TSV, gradient or CHANGES files for a preview. Literal JSON object fields and array items are supported; dataset descriptions, dictionaries and inheritance still require object-shaped metadata. Raw text opens readonly, retaining the original ZIP/member identity. Archive table dictionaries use only an unambiguous same-directory JSON member; gradient previews require unambiguous same-basename companions in that ZIP. Use **Inspect Metadata** on a NIfTI or TSV row to resolve applicable sidecars across its logical ancestors, including loose files and ZIP members. The report identifies the original sources and withholds effective values when coverage is incomplete or multiple JSON sidecars apply at the same level. Saved custom archive placements remain planned. No external unzip tool is required.

## MRI files inside ZIPs

Click a `.nii` or `.nii.gz` entry in the logical tree to open it with your configured VS Code viewer, such as the optional NiiVue extension. BIDS Explorer extracts only that selected member into a private cache on the workspace host, checks its output size, CRC and source revision, then hands off an ordinary file URI. Source archives and datasets remain unchanged. NiiVue is not bundled; install an appropriate image viewer on the workspace host if needed.

Selected images are limited to 512 MiB per ZIP member. The private cache is limited to 2 GiB and 128 artifact directories per workspace; completed files remain available across extension reloads and are never automatically evicted from an active viewer. To reclaim space, close all editor/viewer tabs in that window and run **BIDS Explorer: Clear Extracted Image Cache**. Failed/cancelled reads remove their partial output. Storage includes any incomplete artifacts left by an interrupted host; limits may require explicit clearing before another image opens.

ZIP member reading supports unencrypted stored/Deflate members and rejects links, special members, unsafe paths and excessive compression ratios. This is selected-file extraction, not progressive NIfTI loading or whole-dataset unpacking. The viewer may buffer the complete selected image.

## Requirements and data handling

Use desktop **VS Code 1.96 or newer** with a trusted, non-virtual workspace. The directory adapter accepts `file:` URIs on the workspace host. Remote SSH window tests covered directory and ZIP browsing and MRI viewing. A separate synthetic Rorqual host test covered cross-source metadata inheritance. Broader remote UI/latency, reconnect and persistent-index behavior remain unvalidated; browser-only VS Code and arbitrary remote filesystem URI schemes are unsupported. No Python, archive tools or NiiVue installation is required by the runtime.

Explorer reads directory entries, requested filesystem attributes, bounded selected gradient pairs, explicitly selected dataset descriptions, participant tables/dictionaries and applicable ancestor JSON for selected-file inspection. It never writes dataset files or creates indexes/caches inside datasets. Only explicit registration URIs are saved in VS Code's workspace state; automatic roots follow the current workspace folder list and are not saved as manual registrations; directory listings are kept in memory. There is no persistent metadata index or telemetry implementation. Completed selected ZIP images and provenance are stored in a bounded private cache outside datasets, with in-memory reuse during the current extension session. No separate SSH transport or dataset download is initiated by the extension.

Opening other files or using the preview’s Open as text buttons hands them to another VS Code editor; saving changes in that editor is a separate user action. Explorer does not make that editor read-only or control a third-party viewer's behavior.

See `docs/MILESTONE_0.1.0.md` for tested environments, Remote SSH/MRI observations, cache behavior and performance limits. Listings are cached in memory on the workspace host; image transfer/display uses VS Code and the selected editor. Selected ZIP images use a bounded workspace-host extraction cache. Persistent remote metadata indexing remains planned.

## Inspecting a tar archive

Use **BIDS Explorer: Inspect Tar Archive** from the Command Palette or the native Explorer context menu to list a `.tar`, `.tar.gz` or `.tgz` file on the workspace host. The command scans sequentially and reports the first 200 members and the total count. Gzip tarballs must be decompressed through the end for a complete inventory. The scan is cancellable and supports POSIX ustar headers. For logical browsing, use **Add Dataset** on the directory containing the tarball. The tree can show the archive’s subjects, sessions, modalities and files alongside loose and ZIP sources. Select a tar file row for its metadata preview or to open the selected MRI in your configured viewer. **Show Source Details** displays the original member path. Tar reads scan the archive sequentially and can take longer than ZIP reads.

## Planned capabilities

| Proposed version | Planned capability                                                                      |
| ---------------- | --------------------------------------------------------------------------------------- |
| `0.1.0`          | Completed directory-browser milestone; local/SSH smoke evidence recorded, not published |
| `0.2.0`          | Completed metadata milestone; tagged locally                                            |
| `0.3.0`          | Completed ZIP browsing and cross-source metadata milestone; tagged locally              |
| `0.4.0`          | Tar archive browsing and selected member opening                                        |
| `0.5.0`          | SquashFS browsing and tool compatibility                                                |
| `0.6.0`          | Validated Remote SSH workflows and persistent indexing                                  |
| `0.7.0`          | Coverage-aware summaries, filters and participant/session availability                  |
| `0.8.0`–`0.9.0`  | Optional viewer integration, distribution preparation and stabilization                 |
| `1.0.0`          | Supported core exploration across documented formats and hosts                          |

The first three milestones are tagged locally. Versions from `0.4.0` onward are roadmap targets. BIDS validation, restructuring and renaming are later, separate opt-in workflows; exploration stays read-only by default. Browsing a dataset does not establish BIDS conformance.

## Documentation and feedback

- `CHANGELOG.md`: released changes and new Unreleased work.
- `PLANS.md`: proposed versions and readiness checks.
- `docs/DEVELOPMENT.md`: contributor setup, checks and packaging.
- `docs/TEST_DATA.md`: public datasets for manual/opt-in smoke tests.
- `SECURITY.md`: security checks and future vulnerability-reporting setup.

A public issue tracker and private vulnerability-reporting channel will be linked when the GitHub repository is available. Do not share private datasets, credentials or sensitive clinical information in public reports.

In the source checkout, `docs/MILESTONE_0.3.0.md` records the ZIP release scope, checks, and Remote SSH evidence.
