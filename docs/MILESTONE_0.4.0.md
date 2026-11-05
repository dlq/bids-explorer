# 0.4.0 tar milestone validation

The local `v0.4.0` release adds POSIX ustar `.tar` and gzip `.tar.gz` and `.tgz` inventory, logical browsing, metadata previews and selected MRI opening. The VSIX is `dist/bids-explorer-0.4.0.vsix`. [Tar reader and format limits](TAR.md)

The clean release checks cover locked dependencies, formatting, lint, types, per-file unit coverage, extension-host integration on VS Code 1.96.0 and 1.144.1, Semgrep, dependency audits, and VSIX inspection. Unit fixtures verified byte-for-byte selected reads and in-flight cancellation for both plain and gzip tar. Malformed inputs, unsafe paths, special files and limits have separate regressions.

The opt-in Connectome Mapper archive test exercised logical browsing, rendered metadata and gradient previews, and opening all three MRI members through VS Code. The development window also displayed the 100-volume resting-state scan in NiiVue. An independent system tar read matched the extracted BOLD file by SHA-256. A local host measurement took 150.39 ms to materialize the 94 MB member into an empty image cache and 0.186 ms to reuse the same file. This measures the read and cache path on one local host. [Cache measurement](evidence/0.4.0/connectome-mapper-cache.json)

SquashFS is the next format milestone. Remote performance and reconnect testing remain part of the later Remote SSH milestone.
