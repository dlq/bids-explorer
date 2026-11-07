# BIDS Explorer user guide

Browse a neuroimaging study by participant, session and modality in VS Code. Open NIfTI images, check acquisition metadata and find participants with the data or processing outputs you need. BIDS Explorer reads datasets on your computer or over Remote SSH and leaves the dataset files unchanged.

## Open a study

1. In desktop VS Code 1.96 or newer, install the extension from a supplied VSIX using **Extensions: Install from VSIX**. Download the extension from the [1.0.0 release](https://github.com/dlq/bids-explorer/releases/tag/v1.0.0).
2. Open a study folder you trust. For a study on a server, connect with VS Code Remote SSH, then open the study folder on that server and install BIDS Explorer on the connected host.
3. In the **Explorer** sidebar, expand **BIDS**. A folder with a root-level `dataset_description.json` appears automatically. If it doesn’t appear, use **Add Dataset** and select the folder.
4. Expand a participant, then a session and modality. Click a file to open its preview. The regular **File Explorer** still shows the physical folder layout.

Matching multi-echo images share an acquisition branch with ordered **Echo** children. **Run**, **Acquisition**, **Phase encoding** and other readable labels preserve the distinctions between scans. Expand an echo for its image and metadata; original filenames remain in source details.

Images open in four quadrants: axial, coronal, sagittal and a 3D volume view. For image information and viewing controls, choose **Image controls** in the built-in viewer. The native **Image** view follows your selected image, with scan parameters above viewing controls. It shows TE in milliseconds, keeps voxel-position buttons under **Position**, and offers **Volume** navigation for 4D images. To put it on the right, right-click the **BIDS Image** activity icon and choose **Move To → Secondary Side Bar**. VS Code remembers the placement.

## Find what you need

| If you want to…                                                  | In BIDS Explorer                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| See the study name, BIDS version and authors                     | Open `dataset_description.json`. If a collection has several descriptions, open the grouped entry to compare them.                                                                                                                                                                                                                                     |
| Read acquisition parameters for a scan                           | Right-click the image and choose **Inspect Metadata and Related Files**. This shows the applicable values and where they came from, including inherited metadata. Opening a JSON file directly shows what that file records.                                                                                                                           |
| Check participant attributes, session information or task timing | Open the relevant `participants.tsv`, `*_sessions.tsv`, `*_scans.tsv` or `*_events.tsv`. Use **Filter rows** and expand a column in **Column dictionary** to see recorded definitions when available. Event onset and duration are shown in seconds.                                                                                                   |
| See an image or diffusion gradient scheme                        | Click a NIfTI image to use the built-in viewer, or click a `.bval` or `.bvec` file to inspect its gradient pair. Use **Open Image With** if you prefer another installed editor.                                                                                                                                                                       |
| Compare raw data and processing outputs                          | Expand a session’s **Derivatives** branch to browse matching processing pipelines. Outputs without a session appear under **Derivatives without a session** at participant level. For a cohort, right-click the dataset and choose **Show Participant Availability**. Select the sessions or derivative outputs you need and choose **Apply filters**. |
| Read the dataset’s release notes                                 | Open `CHANGES`. The preview follows the file’s order and shows its recorded versions and dates.                                                                                                                                                                                                                                                        |

A preview’s **Open original** action opens the source in the regular editor. Use **Reload snapshot** if the file has changed. In the availability grid, **Missing** means the inspected branch contained no matching data. **Not checked** means coverage is incomplete.

## Browse archived studies

BIDS Explorer supports ZIP, tar and gzip tarballs, and SquashFS images with supported compression. Open or add the containing folder to browse archives alongside ordinary files. When sources contribute to the same study, the tree groups recognizable content by participant and session. Where sources disagree, you can inspect the original files separately.

Use **Browse SquashFS Image** on an individual image. Large collections may take time to index, and archived NIfTI files are prepared before the viewer opens. For a 4D NIfTI, the built-in viewer can show the first frame while the remaining frames load. Reopening an image reveals its existing viewer. Empty image placeholders show a clear explanation instead of starting a load.

The logical tree displays participant and session labels without their `sub-` and `ses-` prefixes. Within participant/session branches, file labels also omit matching identifiers and known extensions: for example, **BOLD** with **task rest · run 01 · NIfTI image** beside it. Recognized BIDS suffixes become readable content labels such as **T1-weighted**, **Diffusion** and **Events**; unfamiliar suffixes remain verbatim. Readable types distinguish images, JSON metadata, tables, b-values and b-vectors. Full filenames remain in tooltips and source details; ambiguous entries keep their filenames. Source files and metadata retain the complete identifiers.

Expand an acquisition to reach its **Image**, **Acquisition metadata**, and matching original JSON, events or diffusion-gradient files. Clicking the acquisition still opens its image. Shared resources and uncertain matches stay separately accessible. Acquisition metadata includes inherited values and explains incomplete coverage. Metadata and other file entries appear before subtrees at every level; acquisitions count as subtrees. Readable modality names and numeric run sorting make scans easier to compare.

Expanded acquisitions can show recorded TR, TE and duration after a background metadata read. These summaries do not infer missing values or read image voxels.

## Keyboard and display

The study tree uses VS Code’s arrow-key navigation. **Enter** opens the selected file, and **Shift+F10** opens its actions. Use **Tab** to reach filters and expandable definitions in previews. In a loaded 4D image, the **Volume** control accepts arrow keys. Expand **Position** in the Image sidebar and use the X, Y and Z buttons to move the crosshair one voxel at a time. Tab into a table’s scrolling region and use arrow keys to reveal additional columns.

Previews follow the VS Code theme. Representative keyboard and VoiceOver workflows have been checked on macOS; see [USABILITY.md](USABILITY.md) for the tested scope.

## More help

Browsing is read-only. Saving changes in a regular editor is a separate action. For supported archive formats, large-file limits, and linking raw and derivative datasets stored separately, see [EXPLORER_REFERENCE.md](EXPLORER_REFERENCE.md) and [COMPATIBILITY.md](COMPATIBILITY.md) in the source checkout. The contributor guide is [DEVELOPMENT.md](DEVELOPMENT.md).

## Source and feedback

Source code and issue tracking are at [dlq/bids-explorer](https://github.com/dlq/bids-explorer). See [CONTRIBUTING.md](../CONTRIBUTING.md) to contribute and [SECURITY.md](../SECURITY.md) for private vulnerability reporting. A project license has not yet been selected. Marketplace publication remains separate.
