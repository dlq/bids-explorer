# Try BIDS Explorer in five minutes

This walkthrough uses two participants and four real anatomical MRI images, about 13 MB. It needs no programming or terminal commands. Download time depends on your connection.

## 1. Install the extension

Install desktop [VS Code](https://code.visualstudio.com/) 1.96 or newer. In its **Extensions** view, find **BIDS Explorer** by **Darcy Quesnel (`MCIN-dlq`)** and choose **Install**. You can also use the [Marketplace page](https://marketplace.visualstudio.com/items?itemName=MCIN-dlq.bids-explorer).

For manual installation, download `bids-explorer-1.0.1.vsix` from the [1.0.1 release](https://github.com/dlq/bids-explorer/releases/tag/v1.0.1), then choose **Extensions → … → Install from VSIX…**. If an older development copy is installed under publisher `bids-explorer-dev`, disable or uninstall it first.

## 2. Download and open the small study

1. [Download the sample ZIP](https://github.com/dlq/bids-explorer/releases/download/v1.0.1/bids-explorer-sample-ds000003.zip).
2. Extract it using Finder on macOS, **Extract All…** on Windows, or your usual archive tool on Linux.
3. In VS Code choose **File → Open Folder…** and open the extracted **bids-explorer-sample** folder. Choose the folder containing `dataset_description.json`, not its parent Downloads folder.
4. Open **Explorer** on the left and expand **BIDS**. Look for **bids-explorer-sample**, with **Rhyme judgment** as its study description. If it does not appear, choose **Add Dataset** and select the same folder.

Only mark folders as trusted when you trust their contents. This sample is a documented subset of a public study; it is separate from your research data.

## 3. View an image

Expand **01 → Anatomical** and select **T1-weighted**. You should see three orthogonal planes and a 3D view. Choose **Image controls** for dimensions, voxel spacing and display controls.

To put the controls on the right, right-click **BIDS Image** and choose **Move To → Secondary Side Bar**. Try changing the layout or colour map, then choose **Reset display**. Expand **Position** to move the crosshair with its X, Y and Z buttons.

Participant **02** has another T1-weighted image. Full source filenames remain in tooltips and source details even though the tree uses shorter labels. Browsing does not rewrite the images.

## 4. Read the study information

Open **Dataset description**, **Participants** and `CHANGES`. Use **Filter rows** in Participants to find `sub-02`, then clear the filter. Source identifiers retain their `sub-` prefixes in the original table.

This anatomical subset has no acquisition JSON sidecars, functional scans, diffusion gradients, derivatives or session folders. Missing inherited scan parameters are expected; the subset is not evidence that the complete study lacks those data.

## 5. Check participant coverage

Right-click the dataset and choose **Show Participant Availability**. Look for the two participants and anatomical availability. The study is sessionless, so it will not show invented session 1/session 2 data. A completed check differs from **Not checked**, which means coverage is incomplete.

Use a richer study to try multi-session filters, event timing, gradient previews or preprocessing outputs. The [user guide](USER_GUIDE.md) explains these workflows and [the reference](EXPLORER_REFERENCE.md) explains explicit raw/derivative links.

## What is in the sample?

The sample is an anatomical subset of [OpenNeuro ds000003, Rhyme judgment](https://openneuro.org/datasets/ds000003), credited upstream to G. Xue and R. A. Poldrack. It retains the upstream README, dataset description and CHANGES. The original distribution requests acknowledgement of OpenfMRI and NSF Grant OCI-1131441 (R. Poldrack, PI); retain and consult those upstream notices.

Only participants `sub-01` and `sub-02` and their anatomical images are included. The sample participant table was filtered to those two participants during its original preparation. No new dataset edits are performed by this walkthrough. The ZIP includes source URLs, hashes and a scope/attribution note. This sample is not a complete dataset or a validation result, and the data retain their upstream licensing rather than the extension's MIT license.

If something does not work, use [Troubleshooting](TROUBLESHOOTING.md). Report the failing step and extension/VS Code versions, without private study information.
