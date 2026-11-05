# Public test data

## Samples

| Dataset  | Scope                                                           | Approximate size | Main test cases                                                     |
| -------- | --------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| ds000003 | Anatomical subset: 2 subjects, 4 images                         | 13 MB            | Small directory browsing and anatomical file opening                |
| ds000114 | Full public S3 inventory: 10 subjects, 20 subject/session pairs | 4.67 GB          | Multisession/multimodal navigation, inherited metadata and 4D files |

Downloads are for manual and future opt-in tests, not ordinary CI. Both are stored outside the repository.

## ds000003 — Anatomical subset

An anatomical subset of [OpenNeuro ds000003, Rhyme judgment](https://openneuro.org/datasets/ds000003) was downloaded on November 3, 2026 for manual and future opt-in testing. The upstream [dataset repository](https://github.com/OpenNeuroDatasets/ds000003) contains its attribution and licensing information; its README is retained in the downloaded sample.

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

Use this sample to check participant/session/modality grouping, task/entity filters, metadata inheritance, 4D file recognition and realistic indexing/opening behavior. It is not a huge-cohort performance benchmark, and it contains no archive wrappers or collection conflicts. Generate synthetic cases for those boundaries and retain the small fixture suite for routine tests. The 0.3.0 ZIP tests use synthetic fixtures and a separate authorized Remote SSH collection. Tar and SquashFS test variants remain planned. [0.3.0 validation](MILESTONE_0.3.0.md)

## Using it

Use VS Code's ordinary **File: Open Folder** to inspect either downloaded directory. Use **BIDS Explorer: Add Dataset** to register either directory for read-only browsing. Canonical participant/session/modality labels and source details are implemented; bounded metadata inheritance, table/history previews and descriptions are now implemented. See [LOCAL_BROWSER_TESTING.md](LOCAL_BROWSER_TESTING.md) for smoke-test results.

Keep regular CI on tiny synthetic fixtures. Any automated use of downloaded images must be explicit opt-in and skip clearly when the sample is unavailable, with no automatic network download or SSH connection. Archive variants can later be generated outside Git from this sample when reader testing is authorized.
