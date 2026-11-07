# Explorer reference

See [the quick start](../README.md) for everyday browsing. This reference covers advanced settings, preview limits and source behavior.

## Logical file labels

The tree leads with recognizable content: **BOLD**, **T1-weighted**, **Diffusion**, **Events** and other explicitly mapped BIDS suffixes. Task, acquisition, run, direction and other recorded distinctions follow as row descriptions, then the content type. For example, `sub-001_ses-02_task-rest_acq-fast_run-01_bold.nii.gz` under participant 001/session 02 appears as **BOLD · Task rest · Acquisition fast · Run 01 · NIfTI image**.

Values retain their spelling and leading zeros. Participant/session tokens disappear only when they match the containing branches. Unfamiliar suffixes retain their exact spelling while their recognized entities still receive readable labels. Names with unparsed pieces keep their original stem. If a label, acquisition details and type would be identical for two siblings, their full filenames distinguish them. Tooltips and **Show Source Details** retain original names and provenance. This presentation does not validate or modify the study.

Entity labels follow the [BIDS entity definitions](https://bids-specification.readthedocs.io/en/stable/appendices/entities.html). Run and Echo indices keep leading zeros. Flip angle and Inversion **indices** are not measured angles or times. Phase encoding retains the recorded label without inferring its physical direction. Recognized `part-mag`/`part-imag` values display as magnitude/imaginary, and `hemi-L`/`hemi-R` as left/right. Reconstruction, recording, split, chunk, tracer, sample, staining, processing, space and other recognized entities also receive readable labels; custom values remain literal.

## Acquisitions and related resources

Within a completely inspected directory, an unambiguous NIfTI becomes an expandable acquisition. Click its label to open the image; expand it for **Image**, **Acquisition metadata**, and matching original resources. Exact sibling JSON and diffusion companions match the same suffix and entity values. An events table or dictionary joins a BOLD acquisition only when its entities identify that acquisition unambiguously. Images differing only in a numeric echo index form one multi-echo acquisition. Expand it for exactly matching shared Events/JSON followed by numerically ordered **Echo 1**, **Echo 2**, etc.; expand each echo for its image and echo-specific metadata. Shared resources belong to the collection, never to an arbitrary echo. Runs, parts, reconstructions, spaces and other entity differences remain separate. Duplicate echo indices or conflicting sources keep individual rows. Task-wide events without a run, and more general sidecars, remain at their recorded scope. **Acquisition metadata** uses the existing inheritance resolver to explain effective values and their sources.

Grouping does not read image bytes or recursively inspect descendants. Partial/paged directory listings keep their resources flat until coverage is complete. Conflicting image sources remain separate choices. Acquisitions sort by content and recorded entity details, including numeric runs, while participant identifiers retain leading zeros. Anatomical, Functional and Diffusion branches use their readable names. Derivative pipeline branches retain pipeline names; description, space, resolution and hemisphere entities remain in the scan descriptions. Storage format information stays in tooltips and source details unless it distinguishes conflicting sources.

Expanding an acquisition starts a separate cancellable metadata-summary queue (two active reads, 32 waiting, 512 cached states). Resolved numeric RepetitionTime, EchoTime and AcquisitionDuration become TR in seconds, TE in milliseconds and duration in seconds. Sources and exact recorded values remain in **Show Source Details**. Missing/ambiguous values are omitted; cancellation, branch refresh and source changes follow the metadata snapshot rules. No duration is inferred from TR, and image dimensions, voxel spacing and diffusion-shell summaries are not yet collected for tree rows.

SquashFS metadata participates when the inspected logical ancestors are complete. Paged ancestor coverage or multiple applicable shard sidecars withholds effective values, even when a selected original JSON file can be previewed. Expanding a small modality directory does not imply complete study-wide metadata coverage.

Metadata and other file entries precede subtrees at every logical level, including within participants, sessions and modalities. Expandable acquisitions count as subtrees, and grouped shard metadata counts as metadata. Semantic and numeric sorting applies within each section.

Participant expansion performs bounded discovery of matched derivative pipelines and one shallow listing per matched participant. It does not read acquisition files or recursively index sessions. The result is cached for the window until refresh or link changes. Cancellation and partial listings remain visible; derivative sources beyond an uninspected page are not assumed absent. The dataset-level derivative tree retains its ordinary source/paging navigation.

## Keyboard navigation

Open the Command Palette with **Cmd+Shift+P** on macOS or **Ctrl+Shift+P** on Windows/Linux. Run **Explorer: Focus on BIDS View** to enter the study tree. Use the arrow keys to move between entries and expand folders, then **Enter** to open a file. **Shift+F10** opens the selected entry’s context menu.

Inside a preview, use **Tab** and **Shift+Tab** to move between filters, source controls and expandable sections. In the gradient preview, the sphere accepts arrow keys to rotate and the b-value plot accepts left/right arrows to select a volume. The **Volume** field and **Numeric table** offer another way to select a volume. In a loaded 4D NIfTI, focus **Frame** and use left/right arrows to change frames.

Choose **Image controls** in the built-in viewer, then Tab to the X, Y and Z buttons in the native **Image** view. Enter moves the crosshair one voxel and updates the announced voxel coordinates. Tables have a named scrolling region: Tab into it and use arrow keys to reveal additional columns. Expand **Source details** to inspect acquisition-field provenance.

See the [usability record](USABILITY.md) for the sampled keyboard, theme and user-assisted VoiceOver checks and their limits.

The built-in viewer reuses a panel for an already-open image URI, preserving its frame and crosshair instead of reading it again. Close the viewer and reopen the image to reread changed contents. Empty (0-byte) image files display **No image data** without fetching image bytes or starting NiiVue; some lightweight BIDS examples deliberately contain these placeholders.

## When something looks missing

| What you see                                    | What to try                                                                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No study in BIDS Explorer                       | Expand the BIDS section, then choose **Add Dataset** and select the study folder. Automatic recognition requires a root-level `dataset_description.json`. |
| An extension unavailable in a Remote SSH window | In Extensions, install BIDS Explorer on the connected SSH host. Complete SSH/MFA prompts shown by VS Code before retrying.                                |
| A preview shows old values                      | Use **Reload snapshot** in the preview. Refresh the dataset or branch to update its tree entries.                                                         |
| Missing or Not checked in availability          | **Missing** refers to the inspected branch. **Not checked** means the check is incomplete. Refresh the availability snapshot to retry failed reads.       |
| Unsupported SquashFS compression                | Check the format support in [Compatibility](COMPATIBILITY.md). Other readable shards may still be available with partial coverage.                        |
| An image is taking time to open                 | Archived images must be prepared first, and tar reads are sequential. A 4D frame selector becomes available after the full image loads.                   |
| Extracted image cache is full                   | Close the workspace’s viewers and editor tabs in every window using it, then run **BIDS Explorer: Clear Extracted Image Cache**.                          |
| Some files are absent from the logical tree     | Use **Show Dataset in File Explorer** for the physical file tree, including administrative and unfamiliar files.                                          |

## Link separate raw and derivative datasets

Register both dataset folders, then add the derivative dataset paths to the raw dataset’s entry in the workspace setting `bidsExplorer.derivativeDatasets`. Use file URIs on the machine where the datasets live. Session-level **Derivatives** branches and **Show Participant Availability** use those links. Pipeline outputs join sessions by exact recorded session labels: `01` and `1` remain distinct. Sessions found only in derivatives also appear, labelled as derivative sources. Outputs without a session identifier remain under **Derivatives without a session** at participant level. Raw sessions and modalities are not repeated inside Derivatives. The dataset-level **Derivatives** branch provides the complementary pipeline-centred view.

```json
{
  "bidsExplorer.derivativeDatasets": {
    "file:///data/raw": ["file:///data/fmriprep"]
  }
}
```

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

Click `dataset_description.json` in BIDS Explorer to open the readable preview. **Open original JSON** opens the original file. The explicit **BIDS Explorer: Preview JSON Metadata** action is also available from context menus and the command palette. Native File Explorer opening uses the usual JSON editor. If a descriptor cannot be previewed, the BIDS tree opens the original JSON with a warning.

The read-only preview shows recorded fields and the source URI/snapshot time, with field-name filtering and 20 fields per page. It labels `BIDSVersion` as the BIDS specification version. Unknown fields, duplicate names and original numeric values remain visible; duplicate names do not produce an inferred winning summary value. References and HTML-like strings remain plain text.

This is a selected-file snapshot: no inherited values, missing-field defaults, dataset relationships or BIDS conformance checks are applied. Limits are 1 MiB, 1,000 top-level fields and 32 nested value levels. Individual displayed values are shortened after 16,000 characters with a notice; **Open original JSON** provides the complete original. **Reload snapshot** explicitly rereads the file; if it fails, the previous preview stays visible with an error.

## Task JSON and event files

Click a task sidecar such as `task-rest_bold.json` for the same recorded-field JSON preview, including duplicate names, original numeric tokens, filtering/paging and raw-text access. The heading identifies the selected JSON file. This shows that file's recorded contents; use **Inspect Metadata and Related Files** on a data file for effective inherited values. Other recognized JSON dictionaries use this preview too. Native Explorer still opens raw JSON by default, with **Preview JSON Metadata** available explicitly.

Click `task-…_events.tsv` or another recognized `*_events.tsv` for a bounded **Events** table. It labels onset and duration in seconds, as defined by BIDS, and retains original row order, quoted cells, numeric text, trial values and missing cells, and provides filtering, paging, raw-text access and explicit reload. Repeated onsets are allowed and are not treated as duplicate participant/session identifiers. Applicable `*_events.json` column dictionaries use the existing dataset-scoped inheritance resolver. The containing dataset must be registered/recognized for dictionary resolution. Limits match the other tables: 1 MiB, 10,000 records and 128 columns. Timeline plots, image/run association and time-unit conversion remain future work.

## Participant table preview

Click `participants.tsv` in BIDS Explorer to open a read-only table. Use **Filter rows** to search literal cell text; matching rows retain source order. The preview shows 50 rows per page and 12 columns at a time. **Open original TSV** opens the complete original in the normal editor. An explicit **Preview Participants Table** action is available from the BIDS tree, native Explorer and command palette. If the table cannot be previewed, clicking it in the BIDS tree opens its raw text with a warning.

Identifiers and numeric values stay strings, so leading zeros and scientific notation survive. Quoted tabs, embedded newlines and escaped quotes are decoded for display; original cell tokens remain available in tooltips and the source file. The exact value `n/a` is marked as missing; empty and absent cells are distinct. Duplicate header names, repeated recorded participant IDs and uneven rows are reported without dropping, sorting or joining rows. Source line numbers identify records even after filtering.

The **Column dictionary** section shows matching entries from the same-directory `participants.json`, with readable descriptions, units and category labels when available. Expand **Recorded JSON and source** for the original fields. Duplicate dictionary names remain ambiguous, with every occurrence retained. Missing or unreadable dictionaries leave the table usable with their status shown. No defaults, unit conversion or categorical substitutions are applied. Participant navigation links remain planned.

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

## ZIP inventory

Run **BIDS Explorer: Inspect ZIP Archive** from the Command Palette, or right-click a ZIP in the native Explorer. This command reads the selected ZIP's central directory and shows a JSON report with its source revision, total entry count and first 200 members. ZIPs can be selected at any directory depth; they do not need their own dataset descriptor. Cancel through the progress notification or **Cancel Pending Work**.

The inventory is limited to 100,000 entries and 16 MiB of directory metadata. It opens no member streams and performs no decompression, extraction or BIDS validation. BIDS Explorer overlays ZIP and ordinary directory sources into **dataset → subject → session → modality/processing folder** navigation. Sessions for a subject appear together; matching directories merge file-wise and conflicting files remain separate source choices. Known subject/session archive names supply provisional placement without indexing the whole collection. Expanding a session indexes only its contributing archives and checks matching member wrappers; contradictory layouts produce an explicit placement error. Original archive/member paths remain in Source Details. Use **Add Dataset** for a ZIP collection without a root descriptor; registration is remembered for that workspace. Alternatively, declare its workspace-host `file:` URI in `bidsExplorer.collectionRoots` to populate it automatically when that workspace opens. Click archived JSON, TSV, gradient or CHANGES files for a preview. Literal JSON object fields and array items are supported; dataset descriptions, dictionaries and inheritance still require object-shaped metadata. Raw text opens readonly, retaining the original ZIP/member identity. Archive table dictionaries use only an unambiguous same-directory JSON member; gradient previews require unambiguous same-basename companions in that ZIP. Use **Inspect Metadata** on a NIfTI or TSV row to resolve applicable sidecars across its logical ancestors, including loose files and ZIP members. The report identifies the original sources and withholds effective values when coverage is incomplete or multiple JSON sidecars apply at the same level. No external unzip tool is required.

To save a custom ZIP or tar placement, add an entry to `bidsExplorer.archivePlacements` in workspace settings. Key the entry by the registered dataset’s file URI on the workspace host. Set `archivePath` relative to the dataset, `memberRoot` to the directory inside the archive, and `logicalRoot` to its destination in the BIDS tree. Use an empty string for the archive root or the logical dataset root.

```json
{
  "bidsExplorer.archivePlacements": {
    "file:///data/study": [
      {
        "archivePath": "imports/session.zip",
        "memberRoot": "delivery/visit",
        "logicalRoot": "sub-01/ses-02"
      }
    ]
  }
}
```

A saved placement controls where that archive appears in BIDS Explorer. The source archive stays in its original location, and conflicting files retain their individual source choices. Settings changes refresh the tree. After replacing an archive on disk, refresh the dataset root.

## NIfTI files inside ZIPs

Click a `.nii` or `.nii.gz` entry in the logical tree to open the built-in NIfTI viewer. Choose **Open Image With** for another editor. BIDS Explorer verifies the selected ZIP member’s size, CRC and source revision before extracting it into its private cache on the workspace host. The built-in viewer bundles the NiiVue library.

Selected images are limited to 512 MiB per ZIP member. The private cache is limited to 2 GiB and 128 artifact directories per workspace; completed files remain available across extension reloads and are never automatically evicted from an active viewer. To reclaim space, close editor and viewer tabs in all windows using that workspace and run **BIDS Explorer: Clear Extracted Image Cache**. Failed/cancelled reads remove their partial output. Storage includes any incomplete artifacts left by an interrupted host; limits may require explicit clearing before another image opens.

ZIP member reading supports unencrypted stored/Deflate members and rejects links, special members, unsafe paths and excessive compression ratios. The progressive viewer starts reading once the selected member has been extracted.

## Requirements and data handling

Use desktop **VS Code 1.96 or newer** with a trusted, non-virtual workspace. The directory adapter accepts `file:` URIs on the workspace host. The compatibility matrix records tested VS Code versions, hosts, archive formats and recovery cases. Browser-only VS Code and arbitrary remote filesystem URI schemes are unsupported. The runtime uses bundled archive readers and can render NIfTI without the standalone NiiVue extension. See [Compatibility](COMPATIBILITY.md).

Explorer reads directory entries, requested filesystem attributes, bounded selected gradient pairs, explicitly selected dataset descriptions, participant tables/dictionaries and applicable ancestor JSON for selected-file inspection. It never writes dataset files or creates indexes/caches inside datasets. Only explicit registration URIs are saved in VS Code's workspace state; automatic roots follow the current workspace folder list and are not saved as manual registrations; directory listings are kept in memory. SquashFS availability snapshots persist in private extension storage on the workspace host. Completed selected archive images and provenance are stored in a bounded private cache outside datasets, with in-memory reuse during the current extension session. No separate SSH transport or dataset download is initiated by the extension.

Opening other files or using the preview’s Open as text buttons hands them to another VS Code editor; saving changes in that editor is a separate user action. Explorer does not make that editor read-only or control a third-party viewer's behavior.

See [Compatibility](COMPATIBILITY.md) for current release checks, Remote SSH recovery and scale measurements. ZIP and tar inventories and SquashFS availability indexes can be reused across reconnects. Other directory listings remain in memory until refresh or window closure.

## Inspecting a tar archive

Use **BIDS Explorer: Inspect Tar Archive** from the Command Palette or the native Explorer context menu to list a `.tar`, `.tar.gz` or `.tgz` file on the workspace host. The command scans sequentially and reports the first 200 members and the total count. Gzip tarballs must be decompressed through the end for a complete inventory. The scan is cancellable and supports POSIX ustar headers. For logical browsing, use **Add Dataset** on the directory containing the tarball. The tree can show the archive’s subjects, sessions, modalities and files alongside loose and ZIP sources. Select a tar file row for its metadata preview or to open the selected MRI in the built-in viewer. **Show Source Details** displays the original member path. Tar reads scan the archive sequentially and can take longer than ZIP reads.

## Native Image view

The viewer's **Image controls** button opens a standard VS Code webview view. Move the **BIDS Image** activity icon to **Secondary Side Bar** using its **Move To** menu for a right-hand panel. The stable API supported by VS Code 1.96 does not assign a secondary-sidebar default; the workbench remembers your placement. The view is resizable, movable and hideable through normal VS Code controls.

The view follows the most recently selected built-in image and retains that selection while you operate its controls or inspect metadata. Selecting another image updates the context, controls and sources together. Closing the selected image selects another visible image or shows the empty state. Empty image placeholders have no enabled image controls.

The default **Three planes + 3D** layout uses four quadrants for axial, coronal, sagittal and volume rendering, separated by four CSS pixels, with an eight-CSS-pixel black inset inside the image pane and the existing eight-CSS-pixel outer UI margin (scaled for display density). **Reset display** returns to this layout. Viewing controls also offer three-plane, individual axial/coronal/sagittal and 3D-only layouts, grayscale/viridis/hot colour maps, a finite minimum/maximum intensity window, crosshair visibility and single-voxel position buttons, frame selection after all frames arrive, and reset of these display settings. Changes affect the in-memory viewer only. The first decoded frame remains usable while the same image request finishes in the background; display window/colour map and crosshair position are retained when the full image replaces the preview.

**Image information** comes from the loaded NIfTI header: voxel dimensions, spacing with recorded units, frame count, frame interval with temporal units and voxel data type. A header frame interval is not presented as a BIDS JSON RepetitionTime. **BIDS metadata** independently uses the existing bounded, archive-aware inheritance resolver. The initial summary includes recorded TR/TE (seconds), flip angle (degrees), phase encoding, task name, duration, manufacturer and field strength when resolved. Use **Inspect all metadata** for other fields and override histories. Missing, failed and incomplete metadata remain explicit. Header and JSON reads are independent snapshots.

**Related files** currently lists applicable JSON and unambiguous diffusion companions, opened through the usual read-only preview actions. Events and other acquisition resources remain accessible in the BIDS tree. **Source details** retains the original loose/archive identity and each summarized JSON value's source/pointer. Metadata reads start only when the view is visible and never write to the dataset.
