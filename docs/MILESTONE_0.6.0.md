# 0.6.0 Remote SSH and archive inventory validation

The local `v0.6.0` release stores completed ZIP and tar member inventories in private workspace storage on the host running the extension. Reuse requires the same source identity and current read access. Image payloads have a separate cache. SquashFS continues to read bounded directory pages on demand. [Storage and limits](DEVELOPMENT.md#persistent-archive-inventories)

Separate SSH sessions on Rorqual reused the synthetic ZIP and gzip tar inventories. Replacing the ZIP invalidated only its inventory. In VS Code, we closed the remote connection and reopened the same synthetic workspace in a fresh extension host using the authenticated SSH session. Both archive members appeared in the logical tree, and both inventory files retained their original inode and modification time.

A separate Rorqual probe terminated only a synthetic MRI extraction worker after it wrote a payload chunk. A new SSH session reused the completed inventory and removed the abandoned partial when retrying extraction on the same host. The extracted bytes matched the original fixture. Revoking archive read permission produced an access error even with a saved inventory. This was a worker termination test. The VS Code reconnect test used a deliberate disconnect after indexing.

Cleanup reclaims new partial image directories when the owner process has exited on the same host. Entries from another host, older partials without owner information, and uncertain owners remain eligible for explicit cache clearing. The existing image cache keeps completed images until the user clears it.

The release checks passed with 140 unit tests and 41 integration tests each on VS Code 1.96.0 and 1.145.2. Both integration runs included the opt-in Connectome Mapper tarball. Semgrep and the runtime audit reported zero findings. The full audit reported 13 moderate and one low finding in development tooling.

The local artifact is `dist/bids-explorer-0.6.0.vsix`.
