# 0.5.0 SquashFS milestone validation

The local `v0.5.0` release adds read-only SquashFS 4.0 inspection, logical shard browsing, forward and backward paging, metadata comparisons, diffusion gradient previews and selected NIfTI opening. The reader supports uncompressed and gzip blocks on the VS Code workspace host. It requires no external SquashFS utility, mount or elevated permissions. [SquashFS support and limits](SQUASHFS.md)

Synthetic fixtures cover malformed and unsupported data, unsafe names, exact member bytes, source revision checks, paging and preservation of original shard versions. The cache regression aborts extraction after writing the selected bytes and verifies that the partial cache is removed and the same file can be opened on retry.

The opt-in Rorqual checks covered 12 readable UKB shards out of 13. The reader reported partial coverage for the unsupported shard. The checks restored page 1 from page 2, loaded 12 shard descriptions, parsed a 105-volume gradient pair and displayed a selected UKB FLAIR image in NiiVue. The comparison and archive gradient tree entry points also have VS Code integration fixtures.

The release checks passed with 136 unit tests and 41 integration tests each on VS Code 1.96.0 and 1.145.0. Both integration runs included the opt-in Connectome Mapper tarball. Semgrep reported zero findings. The runtime dependency audit was clean, and the full audit reported 13 moderate and one low finding in development tooling.

The local artifact is `dist/bids-explorer-0.5.0.vsix`. Persistent indexing and disconnect/reconnect testing belong to the next milestone.
