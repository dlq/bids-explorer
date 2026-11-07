# BIDS Explorer artwork

The extension icon combines a logical dataset tree, an imaging tile based on the existing BIDS Explorer imaging symbol, and metadata lines. It is original BIDS Explorer artwork, covered by the repository’s MIT license.

The palette echoes the [official BIDS website stylesheet](https://bids.neuroimaging.io/stylesheets/extra.css), checked November 7, 2026:

| Element              | Colour    | BIDS website variable |
| -------------------- | --------- | --------------------- |
| Background           | `#1F7293` | `--bids-brand`        |
| Tree branches        | `#A6CEE3` | `--mri`               |
| Imaging and metadata | `#FFFFFF` | `--white`             |

The design retains BIDS Explorer’s own symbol; it does not reproduce the official BIDS logo.

Edit [media/icon.svg](../media/icon.svg) and export a 256 × 256 RGBA PNG to [media/icon.png](../media/icon.png). Preserve the transparent rounded corners and inspect the result at small listing sizes. The manifest uses the PNG; the SVG stays in Git as the editable source and is excluded from the VSIX. No additional runtime dependency is required.

These assets identify the extension in Marketplace and the Extensions view. Existing theme-aware tree and activity icons remain separate UI assets.
