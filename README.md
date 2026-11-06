# BIDS Explorer

Browse a neuroimaging study by participant, session and modality in VS Code. Open NIfTI images, check acquisition metadata and find participants with the data or processing outputs you need. BIDS Explorer reads datasets on your computer or over Remote SSH and leaves the dataset files unchanged.

## Open a study

1. In desktop VS Code 1.96 or newer, install the extension from a supplied VSIX using **Extensions: Install from VSIX**. Version 0.9.0 is a local release.
2. Open the study folder. For a study on a server, connect with VS Code Remote SSH, then open the study folder on that server.
3. In the **Explorer** sidebar, expand **BIDS Explorer**. A folder with a root-level `dataset_description.json` appears automatically. If it doesn’t appear, use **Add Dataset** and select the folder.
4. Expand a participant, then a session and modality. Click a file to open its preview. The regular **File Explorer** still shows the physical folder layout.

## Find what you need

| If you want to…                                                  | In BIDS Explorer                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| See the study name, BIDS version and authors                     | Open `dataset_description.json`. If a collection has several descriptions, open the grouped entry to compare them.                                                                                                                                   |
| Read acquisition parameters for a scan                           | Right-click the image and choose **Inspect Metadata and Related Files**. This shows the applicable values and where they came from, including inherited metadata. Opening a JSON file directly shows what that file records.                         |
| Check participant attributes, session information or task timing | Open the relevant `participants.tsv`, `*_sessions.tsv`, `*_scans.tsv` or `*_events.tsv`. Use **Filter rows** and expand a column in **Column dictionary** to see recorded definitions when available. Event onset and duration are shown in seconds. |
| See an image or diffusion gradient scheme                        | Click a NIfTI image to use the built-in viewer, or click a `.bval` or `.bvec` file to inspect its gradient pair. Use **Open Image With** if you prefer another installed editor.                                                                     |
| Compare raw data and processing outputs                          | Expand **Participant Data** under a participant. For a cohort, right-click the dataset and choose **Show Participant Availability**. Select the sessions or derivative outputs you need and choose **Apply filters**.                                |
| Read the dataset’s release notes                                 | Open `CHANGES`. The preview follows the file’s order and shows its recorded versions and dates.                                                                                                                                                      |

A preview’s **Open original** action opens the source in the regular editor. Use **Reload snapshot** if the file has changed. In the availability grid, **Missing** means the inspected branch contained no matching data. **Not checked** means coverage is incomplete.

## Browse archived studies

BIDS Explorer supports ZIP, tar and gzip tarballs, and SquashFS images with supported compression. Open or add the containing folder to browse archives alongside ordinary files. When sources contribute to the same study, the tree groups recognizable content by participant and session. Where sources disagree, you can inspect the original files separately.

Use **Browse SquashFS Image** on an individual image. Large collections may take time to index, and archived NIfTI files are prepared before the viewer opens. For a 4D NIfTI, the built-in viewer can show the first frame while the remaining frames load.

## More help

Browsing is read-only. Saving changes in a regular editor is a separate action. For supported archive formats, large-file limits, and linking raw and derivative datasets stored separately, see `docs/EXPLORER_REFERENCE.md` and `docs/COMPATIBILITY.md` in the source checkout. The contributor guide is `docs/DEVELOPMENT.md`.
