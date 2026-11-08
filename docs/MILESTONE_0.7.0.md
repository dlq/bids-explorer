# 0.7.0 dataset overview validation

This record preserves the completed 0.7.0 observations moved from PLANS.md on November 8, 2026. It describes the tested collection at the time, not the current contents of a remote dataset or a universal performance guarantee.

The local `v0.7.0` milestone added combined raw/derivative participant navigation, explicit links between separately registered datasets, session/modality availability, dataset-wide filtering and paging, persistent SquashFS availability snapshots and saved ZIP/tar placements. Current behavior belongs in the [user guide](USER_GUIDE.md) and [explorer reference](EXPLORER_REFERENCE.md).

## Recorded release observations

Release validation on Rorqual reconciled all 62,051 indexed participants with the readable SquashFS shard inventories. For 25 sampled participants, all 57 observed session and modality combinations agreed with the index. One of the 13 shards used unsupported compression, and the grid reported partial coverage. In a standalone workspace-host probe, loading the saved snapshot took about 0.2 seconds. Filtering for anatomical data and preparing the first 50 rows took about 7 ms. Separate fixtures cover filtering linked derivative pipelines.

Later compatibility and cache measurements are recorded separately in [COMPATIBILITY.md](COMPATIBILITY.md). Do not combine measurements from different runs or interpret unsupported-source coverage as missing participant data.
