# BIDS Explorer

[![CI](https://github.com/dlq/bids-explorer/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/dlq/bids-explorer/actions/workflows/ci.yml)

**Explore a BIDS study by participant, session and scan—on your computer or over SSH.**

View MRI images, read acquisition metadata and find participants with the sessions or processing outputs you need. BIDS Explorer brings folders and supported archives into one logical study tree, while keeping original filenames and sources accessible. Browsing leaves your dataset unchanged.

![BIDS Explorer showing a participant’s functional scan, three orthogonal slices and a 3D view, with scan parameters and viewing controls on the right.](docs/images/study-explorer.png)

_Functional MRI example from the public [OpenNeuro ds007661 dataset](https://openneuro.org/datasets/ds007661). The BIDS tree is on the left; image information and controls are on the right._

## What you can do

- **Navigate a study:** browse participants, sessions, anatomical and functional scans, diffusion data and processing outputs. Multi-echo acquisitions keep their echoes together.
- **View images:** open NIfTI images in the built-in viewer, inspect three orthogonal planes and a 3D view, and move through 4D volumes. No separate viewer extension is required.
- **Understand metadata:** inspect TR, TE and other recorded parameters, see inherited JSON values and trace them to their original files. Preview participant tables, event timing and diffusion gradients.
- **Find usable coverage:** filter participant availability by raw sessions and processing outputs, including explicitly linked derivative datasets.
- **Browse data where it lives:** use local folders or VS Code Remote SSH, including ZIP, supported tarballs and SquashFS collections. Selected archive images are prepared in a cache without unpacking the entire study.

## Install and open your first study

1. Install [desktop VS Code](https://code.visualstudio.com/) 1.96 or newer.
2. [Download BIDS Explorer 1.0.0](https://github.com/dlq/bids-explorer/releases/download/v1.0.0/bids-explorer-1.0.0.vsix). In VS Code, open **Extensions**, choose **… → Install from VSIX…**, and select the downloaded file. A VSIX is the extension’s installation package.
3. Open a study folder you trust. In the **Explorer** sidebar, expand **BIDS**. A folder containing `dataset_description.json` appears automatically; otherwise choose **Add Dataset**.
4. Expand a participant, session and modality, then select a scan. Choose **Image controls** to show its parameters and viewing controls.

For a study on a server, first connect using [VS Code Remote SSH](https://code.visualstudio.com/docs/remote/ssh), open the server’s study folder, and install BIDS Explorer on the connected host. The same BIDS view works there.

To place image controls on the right, right-click **BIDS Image** and choose **Move To → Secondary Side Bar**. VS Code remembers the placement.

## What to expect

The BIDS tree is a readable study view; the regular File Explorer still shows the physical files. Original participant/session identifiers and filenames remain available in source details. In availability summaries, **Missing** means no matching data was found within the checked scope; **Not checked** means coverage is incomplete.

Archive support has compression and size limits. Large collections may need an initial background index; supported indexes are cached for later connections. The viewer can show the first volume of a 4D image while the rest loads. See [supported formats and tested platforms](docs/COMPATIBILITY.md).

The current release explores data without validating, renaming or restructuring it. Image overlays, such as displaying a segmentation over an anatomical reference, are planned for later. Opening an original file in a regular editor is a separate action that can allow edits.

## Help and feedback

- [User guide](docs/USER_GUIDE.md): metadata, tables, derivatives, keyboard navigation and viewing controls.
- [Explorer reference](docs/EXPLORER_REFERENCE.md): detailed behavior, source collections and troubleshooting.
- [Report a problem or suggest an improvement](https://github.com/dlq/bids-explorer/issues/new/choose): omit private participant information, dataset paths and sensitive screenshots.
- [Contributing](CONTRIBUTING.md) · [Development setup](docs/DEVELOPMENT.md) · [Release notes](CHANGELOG.md) · [Roadmap](PLANS.md) · [Security reporting](SECURITY.md).

BIDS Explorer is available under the [MIT license](LICENSE). BIDS Explorer is distributed here as a VSIX and is not yet on the VS Code Marketplace. Image rendering uses [NiiVue](https://github.com/niivue/niivue); bundled dependency notices are in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
