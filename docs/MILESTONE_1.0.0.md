# 1.0.0 local release

Released locally on November 7, 2026, as `v1.0.0`. No Marketplace publication or GitHub push was performed during this local closeout; GitHub hosting followed separately, and Marketplace distribution began with 1.0.1. The source manifest and lockfile use `1.0.0`; `npm run package` derives `dist/bids-explorer-1.0.0.vsix` from the manifest.

## Release checks

A fresh source snapshot and locked dependency installation passed formatting, ESLint, type checking, 169 unit tests and the per-file coverage gate. Both VS Code 1.96.0 and 1.145.2 on macOS arm64 passed all 58 extension-host integration tests, with the public Connectome Mapper tarball and logical-layout image fixtures enabled. The tarball regression now follows acquisition groups to exercise actual JSON, events and gradient previews.

The installed VSIX passed seven synthetic NIfTI cases on both VS Code versions: loose `.nii`/`.nii.gz`, both suffixes in ZIP, and selected `.nii.gz` members in ustar, gzip ustar and SquashFS. Checks observed first-frame preview, both loaded frames, the four-quadrant layout, image spacing and sidebar state. Extracted bytes matched the fixtures. Literal JSON previews passed for all five storage formats.

The checksum-matched package was installed into an isolated Rorqual test directory. VS Code Remote SSH ran the same image, JSON and sidebar checks successfully before and after closing and reopening the isolated client. Only temporary synthetic data was used. The extension ran in the remote workspace host; these checks did not introduce a separate SSH transport into the extension.

## Usability

The Image sidebar was checked in Light 2026, Dark Modern and Dark High Contrast, including a narrow sidebar. Labels wrapped and the parameter grid reflowed. Keyboard controls changed and restored voxel coordinates while retaining focus. The user confirmed VoiceOver clearly announced TR/TE labels and units, Layout, expanded Position controls and coordinate updates, and Source details/Open original JSON. Earlier table, filter, error and shard-source announcements were also user-confirmed. These are sampled workflows, not a claim of exhaustive assistive-technology certification. See [the usability record](USABILITY.md).

## Security and compatibility

Semgrep passed three rule fixtures and scanned all 74 source files without findings. The fresh dependency audit found zero runtime vulnerabilities and no high or critical findings overall. Thirteen moderate and one low finding remain in development tooling, including diff, glob and minimatch dependencies. They are omitted from the packaged runtime; forced incompatible toolchain changes were not applied.

Existing dataset registrations and saved placements retain their identifiers. The `bidsExplorer.datasets.v1` registration key and versioned archive/image/availability cache directories are unchanged. Cache data remains disposable and revision-checked. Logical label and sidebar changes do not rename source files or rewrite dataset metadata.

Supported source and compression limits remain in [Compatibility](COMPATIBILITY.md). Windows/Linux desktop clients, other SSH hosts and hosted CI were not exercised in this closeout. Large-image and metadata limits remain enforced. Image derivative overlays, more codecs and broader semantic relationships are deferred. Public distribution still requires license, publisher, repository and security-reporting decisions; the local release does not authorize publication.

## Artifact provenance

Final VSIX SHA-256: `020dcefb257f7737ec92845c13236e26d822ba2c15cf29d0822541ce122f8f0f`. All 394 runtime files match the tested candidate byte for byte. The final installed package was rechecked on both local VS Code versions and over Remote SSH. The before/after reconnect runs used the runtime-identical candidate. [Structured validation evidence](evidence/1.0.0-validation.json) records the results without machine-specific fixture paths.
