# Public test data

## Samples

| Dataset  | Scope                                                           | Approximate size | Main test cases                                                     |
| -------- | --------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| ds000003 | Anatomical subset: 2 subjects, 4 images                         | 13 MB            | Small directory browsing and anatomical file opening                |
| ds000114 | Full public S3 inventory: 10 subjects, 20 subject/session pairs | 4.67 GB          | Multisession/multimodal navigation, inherited metadata and 4D files |

Downloads support manual and explicit opt-in tests, not ordinary CI. Both are stored outside the repository.

## ds000003 — Anatomical subset

An anatomical subset of [OpenNeuro ds000003, Rhyme judgment](https://openneuro.org/datasets/ds000003) was downloaded on November 3, 2026 for manual and explicit opt-in testing. The upstream [dataset repository](https://github.com/OpenNeuroDatasets/ds000003) contains its attribution and licensing information; its README is retained in the downloaded sample.

The subset is about 13 MB (12,967,832 bytes), with eight files:

- Dataset description, upstream README and CHANGES.
- `participants.tsv`, filtered to the two downloaded subjects.
- `sub-01/anat/sub-01_T1w.nii.gz` and `sub-01_inplaneT2.nii.gz`.
- `sub-02/anat/sub-02_T1w.nii.gz` and `sub-02_inplaneT2.nii.gz`.

This is **not the complete dataset**: functional scans, derivatives and other subjects are omitted. It has no session folders and cannot exercise multisession, archive overlay or incomplete-index behavior by itself. Synthetic fixtures remain necessary. It has not been run through a BIDS validator; legacy naming and source metadata should be preserved rather than silently rewritten.

### Subset location and provenance

Data is stored outside the repository in a sibling `bids-explorer-test-data` directory. The ignored `.local/public-test-data.json` records machine-specific dataset and provenance paths. Do not hardcode those paths in ordinary tests or copy the images into Git.

The external `provenance/ds000003-download.json` records source URLs, download time, sizes, source/local SHA-256 hashes and the participant-table transformation. The unfiltered upstream participant table is retained separately in provenance. Public S3 objects were downloaded afresh and checked against the prior Strata download inventory; this is not a claim that the S3 URLs pin an immutable OpenNeuro snapshot.

All eight downloads matched their reference SHA-256 hashes and sizes. Image gzip streams were read fully to check integrity and NIfTI-1 header size/magic were checked. Dataset-description JSON was parsed and the filtered participant table checked for the two expected subjects. These checks establish download/container integrity, not image geometry correctness or BIDS conformance.

## ds000114 — Full public inventory

[OpenNeuro ds000114](https://openneuro.org/datasets/ds000114/versions/1.0.2), **A test-retest fMRI dataset for motor, language and spatial attention functions**, adds ten subjects (`sub-01` through `sub-10`) with `ses-test` and `ses-retest`: twenty subject/session pairs. Its [dataset metadata](https://github.com/OpenNeuroDatasets/ds000114/blob/master/dataset_description.json) declares CC0 and BIDS `1.0.0rc2`. Preserve the upstream attribution and legacy layout.

The complete public S3 `ds000114/` inventory was downloaded on November 3, 2026: **177 files, 4,665,211,250 bytes** (4.67 GB decimal, about 4.35 GiB). It includes:

- 20 anatomical T1w images.
- 20 diffusion images, with root-level b-values and b-vectors.
- 100 functional images spanning five tasks and both sessions.
- Participant metadata, task-level JSON sidecars/event tables, CHANGES, and upstream `.datalad`/`.gitattributes` metadata.

All 140 image files are retained, along with every other object in the public listing. No participant filtering, file renaming or content transformation was applied. This describes completeness against the public S3 inventory at download time, not all historical OpenNeuro snapshots or additional unpublished data. It is not a BIDS validation result.

### Location, provenance and verification

The external dataset directory is `bids-explorer-test-data/ds000114`, beside the smaller subset. `.local/public-test-data.json` records the machine-specific paths. The external `provenance/ds000114-download.json` contains every source URL, size, ETag, local SHA-256, verification status and NIfTI dimensions. Initial and final S3 listing XML files are retained beside it.

The source inventory's paths, sizes and ETags were checked before and after download. Every downloaded file was size-checked, SHA-256 hashed and compared against its object ETag as MD5; all 177 objects had plain MD5 ETags and matched. Image gzip streams were fully decompressed to verify integrity; NIfTI-1 header size/magic and dimension counts were checked. JSON files were parsed, and participant IDs were reconciled against downloaded subject folders.

The S3 object URLs are mutable. Source DOI/version metadata is retained but does not independently pin this download to an immutable snapshot. Neither the download checks nor its historical BIDS version establish current-spec conformance, valid image geometry or suitability for scientific analysis.

### Intended testing

Use this sample to check participant/session/modality grouping, task/entity filters, metadata inheritance, 4D file recognition and realistic indexing/opening behavior. It is not a huge-cohort performance benchmark, and it contains no archive wrappers or collection conflicts. Generate synthetic cases for those boundaries and retain the small fixture suite for routine tests. The 0.3.0 ZIP tests use synthetic fixtures and a separate authorized Remote SSH collection. Tar testing uses the verified Connectome Mapper fixture below. SquashFS validation uses synthetic fixtures and a separate opt-in Remote SSH collection. [0.3.0 validation](MILESTONE_0.3.0.md)

## Using it

Use VS Code's ordinary **File: Open Folder** to inspect either downloaded directory. Use **BIDS Explorer: Add Dataset** to register either directory for read-only browsing. Canonical participant/session/modality labels and source details are implemented; bounded metadata inheritance, table/history previews and descriptions are now implemented. See [LOCAL_BROWSER_TESTING.md](LOCAL_BROWSER_TESTING.md) for smoke-test results.

Keep regular CI on tiny synthetic fixtures. Any automated use of downloaded images must be explicit opt-in and skip clearly when the sample is unavailable, with no automatic network download or SSH connection. Archive variants can later be generated outside Git from this sample when reader testing is authorized.

## Connectome Mapper tarball fixture

Connectome Mapper 3 publishes `ds-sample.tar.gz` (182.1 MB, CC BY 4.0) as a BIDS test dataset. Its subject/session layout includes anatomical, diffusion and resting-state functional MRI. This is the adopted public fixture for whole-dataset gzip-tar browsing, metadata/gradient previews and selected MRI opening. Its single-subject sample has limited value for collection-scale or sharded tar tests. The archive is stored in the sibling `bids-explorer-test-data/connectome-mapper-3-v2.1/` directory. Its 182,060,400 bytes match Zenodo's published MD5 (`5b888b1702e070281d8883e34f4faad9`). [Zenodo dataset and archive listing](https://zenodo.org/records/5790821)

A read-only member scan found 22 files and seven directories under the `ds-sample/` wrapper, including a dataset descriptor, `participants.tsv`, scan JSON sidecars, an events TSV and a DWI gradient pair. The three NIfTI headers show a 3D T1w image, 129 DWI volumes and 100 resting-state BOLD volumes. The descriptor declares BIDS 1.2.2. This archive is suitable for a first end-to-end test of wrapped dataset discovery, metadata previews and opening selected 3D and 4D images from a sequential gzip tarball. Use synthetic fixtures for malformed archives and multi-shard cases.

## Logical layout examples — November 7, 2026

A separate `logical-layout-2026-11-07/` directory beside the earlier samples contains:

| Sample                                                                                                                             | Downloaded scope                                                                                                                                     | Size              | Exercise                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| [ds004662](https://github.com/OpenNeuroDatasets/ds004662)                                                                          | `sub-01`, handgrasp run 1, all five BOLD echoes and single-band references, shared events, physiology, anatomy and unchanged root metadata; 30 files | 802,277,783 bytes | Multi-echo distinctions, shared events, literal acquisition metadata and real 4D viewing                         |
| [ds007661](https://github.com/OpenNeuroDatasets/ds007661)                                                                          | Matching run 1 fMRIPrep outputs in T1w space: preprocessed BOLD, reference, mask, T2* map, confounds and unchanged root metadata; 17 files           | 214,808,169 bytes | Separately stored raw/derivative linking, processing descriptions, image spaces and real processed-image viewing |
| [Official ds000117 example](https://github.com/bids-standard/bids-examples/tree/5e00d47b6f1db106dda1b776d5243eb41b4cb95b/ds000117) | Complete lightweight example at commit `5e00d47b6f1db106dda1b776d5243eb41b4cb95b`; 2,448 files                                                       | 2,096,070 bytes   | MRI/MEG sessions, field-map components, events, modality labels and declared field-map targets                   |

The two OpenNeuro copies are **partial studies**. Run 2, other participants, other derivative spaces and most derivative products were not downloaded. Participant tables and metadata retain their original contents and may describe data absent from these copies. The prepared workspace labels the subsets explicitly. Do not interpret omitted downloads as absent data in the original study.

The public MRI files were downloaded from the OpenNeuro S3 objects listed in the external `provenance/s3-inventory.json`. All 47 files matched their recorded sizes and plain MD5 ETags; local SHA-256 hashes are retained in `fixture-manifest.json`. Gzip streams were checked to completion and single-file NIfTI-1 header magic/dimensions were read. Raw BOLD images are 84 × 84 × 72 × 210; the selected preprocessed BOLD is 61 × 66 × 66 × 210. These are integrity checks, not BIDS validation or scientific quality assessment. S3 URLs are mutable; the inventory and hashes identify the downloaded bytes.

The official repository was sparsely checked out at the pinned commit, and every selected example file was checked against its Git blob hash and recorded with SHA-256. Its imaging files are empty placeholders: **use them for navigation and metadata, not MRI viewing**. `sub-01/ses-mri/fmap` contains magnitude1, magnitude2 and phasediff entries. The phase-difference JSON declares nine `IntendedFor` paths. The explorer can display those recorded values; it does not yet resolve field-map associations into a dedicated navigation view.

`.local/public-test-data.json` records the fixture directory and **Logical Layout Examples.code-workspace** path. The prepared workspace opens the raw subset, the separately stored fMRIPrep subset and the official example, and explicitly links only ds004662 → ds007661. It does not link unrelated participants merely because their labels match.

### Try the logical view

1. Open the prepared workspace in an Extension Development Host using the latest build. The workspace is outside the source datasets.
2. In **BIDS → ds004662 → 01 → Functional**, find the BOLD acquisition for handgrasp run 1. Expand it for five ordered Echo branches. The task-wide Events entry has no run entity, so it remains above the acquisitions at modality scope rather than being assigned to one run. Single-band references form a separate multi-echo group.
3. Expand an Echo row. Open **Image**, **Acquisition metadata**, and **Original JSON**. Verify that the echo-specific EchoTime remains identifiable. The real BOLD image has 210 frames; try the Volume control and the buttons under Position in the Image sidebar.
4. Under raw participant **01 → Derivatives without a session**, open the explicitly linked ds007661 pipeline, then Functional. Find the preprocessed BOLD with `space T1w` and `description preproc`. These examples have no session folders; their derivatives must not be assigned an invented session.
5. In the official ds000117 example, open **01 → mri → Field maps**. Inspect the three components and the phasediff JSON's nine recorded target paths. Avoid opening its empty image placeholders. Check that metadata precedes subtrees within participants, sessions and modalities.
6. Use **Show Source Details** or native Explorer to confirm full filenames and distinct dataset paths. No source edits or validation are part of this walkthrough.

Synthetic fixtures continue to exercise multiple pipelines, derivative-only sessions, incomplete coverage, conflicting sources and exact `01` versus `1` session labels; this real-data subset does not cover every boundary.

### Repeat the opt-in checks

Ordinary tests do not read the machine-specific configuration, download data or open these examples. To opt in explicitly after preparing them:

```sh
BIDS_EXPLORER_LAYOUT_FIXTURE="/path/to/logical-layout-2026-11-07" npm run test:integration
```

To include actual raw and processed 4D viewer loading:

```sh
BIDS_EXPLORER_LAYOUT_FIXTURE="/path/to/logical-layout-2026-11-07" \
BIDS_EXPLORER_LAYOUT_IMAGES=1 \
npm run test:integration
```

Set `BIDS_EXPLORER_LAYOUT_REPORT` to a report path outside the dataset folders to retain structured results. `BIDS_EXPLORER_TEST_VSCODE_PATH` can select an installed VS Code binary; see the development guide. The opt-in test checks all five echo identities, shared events, metadata previews, explicit derivative linking, field-map components and declared targets. With image loading enabled it verifies the raw and processed images reach all 210 frames. It hashes all 47 downloaded files and 2,448 official example files afterward to confirm source contents are unchanged. A missing environment variable skips this test; a supplied but invalid fixture fails clearly.

### Recorded results

On November 7, 2026 the complete integration suite passed with these examples and image loading enabled on VS Code 1.96.0 and the current installed 1.145.2: **51 passed, one unrelated Connectome Mapper opt-in test skipped** on each. Both the selected raw echo and processed BOLD reached all **210 frames**, and all source hashes matched. Structured results are in [public-smoke.json](evidence/logical-layout/public-smoke.json).

The observed local viewer completion intervals were roughly 1.3–2.4 seconds after issuing the open command. These warm-cache observations are not first-frame paint measurements or an SSH performance benchmark. The tests confirm accessibility and decoding for the selected files, not every echo/product, every possible field-map relationship or scientific correctness. Multi-echo presentation now groups matching echoes under one acquisition; automatic field-map target navigation remains planned. The measurements above precede that grouping change.

## Public quick-start download

The 1.0.1 release provides `bids-explorer-sample-ds000003.zip` (12,973,493 bytes; SHA-256 `76fa8480259c3b9e3bf625cfbf3c6c054e47eab97e7753a1b660c85f16de5d6f`) as a separate release asset, outside the repository and VSIX. It contains the eight already-verified anatomical-subset files above, a START_HERE note and a sanitized provenance manifest with public URLs and hashes. Original file bytes are preserved; the previously filtered participant table and subset scope are explicit. Original PDDL/public-domain licensing and attribution notices are retained. See [the five-minute walkthrough](QUICKSTART.md).
