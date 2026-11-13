# Compatibility and stabilization evidence

## Current supported scope

Use desktop VS Code 1.96 or newer in a trusted, non-virtual workspace with ordinary file access on the workspace host. Remote SSH uses the remote workspace host's filesystem. Archive readers ship with the extension. No external Python or system archive tools are required, and the standalone NiiVue extension is optional. Browser-only VS Code and arbitrary remote filesystem URI schemes are unsupported.

| Source            | Supported scope                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Directory         | Ordinary directories and regular files through workspace-host `file:` URIs                                                                      |
| ZIP               | Unencrypted stored or Deflate members within the limits in [ZIP.md](ZIP.md)                                                                     |
| Tar               | POSIX ustar headers in `.tar`, `.tar.gz`, or `.tgz`. Inventory and member scans are sequential. See [TAR.md](TAR.md).                           |
| SquashFS          | SquashFS 4.0 with uncompressed or gzip metadata and data blocks. Unsupported shards can yield partial coverage. See [SQUASHFS.md](SQUASHFS.md). |
| Progressive NIfTI | `.nii` and `.nii.gz`, up to 1 GiB decoded. The first-frame budget is 128 MiB. Archive extraction is limited to 512 MiB per selected member.     |

Interactive installed-package testing covers macOS arm64 clients and Rorqual Linux x64 over Remote SSH. Hosted Linux CI exercises synthetic extension-host workflows on minimum/current stable VS Code with software WebGL; it is not equivalent to a full Linux desktop usability pass. Windows clients and other SSH hosts remain unverified. Dated records below describe the specific versions, fixtures and limits of each check.

## Historical 0.8.0 installed-package pass

The November 6, 2026 pass used a fresh source export of `v0.8.0` (`0b98c8b`), a locked dependency install, and one newly built VSIX. The test cases used synthetic BIDS-like data. These results describe the configurations exercised in this pass.

| Source             | macOS arm64, VS Code 1.96.0         | macOS arm64, VS Code 1.145.2        | Rorqual Linux x64, Remote SSH 1.145.2 |
| ------------------ | ----------------------------------- | ----------------------------------- | ------------------------------------- |
| Ordinary directory | Loose `.nii` and `.nii.gz` rendered | Loose `.nii` and `.nii.gz` rendered | Both NIfTI suffixes rendered          |
| ZIP                | Both NIfTI suffixes rendered        | Both NIfTI suffixes rendered        | Both NIfTI suffixes rendered          |
| POSIX ustar        | Archived `.nii.gz` rendered         | Archived `.nii.gz` rendered         | Archived `.nii.gz` rendered           |
| Gzip POSIX ustar   | Archived `.nii.gz` rendered         | Archived `.nii.gz` rendered         | Archived `.nii.gz` rendered           |
| SquashFS 4.0       | Archived `.nii.gz` rendered         | Archived `.nii.gz` rendered         | Archived `.nii.gz` rendered           |

Both local profiles installed the VSIX in isolated extension directories. The viewer checks observed the first-frame status and both loaded frames. For archive cases, the harness also compared extracted bytes with the fixture. Rorqual host checks used the compiled extension code from the checksum-matched VSIX in two independent SSH sessions. They compared decoded fixture bytes and exercised ZIP replacement and refresh.

## Scale and recovery

In the same November 6 0.8.0-source pass, a synthetic directory held 5,000 participants with one session and an anatomical folder each. The host probe measured the immediate logical dataset listing, a repeat from the in-memory snapshot, and one participant expansion. It added a participant, refreshed, cancelled the next listing, verified the old 5,000-row snapshot remained visible, and retried successfully with 5,001 rows.

| Host              | Initial listing | Cached listing | Participant expansion | Refresh retry |
| ----------------- | --------------: | -------------: | --------------------: | ------------: |
| macOS arm64       |           45 ms |          <1 ms |                  1 ms |         33 ms |
| Rorqual Linux x64 |           66 ms |          <1 ms |                  1 ms |         52 ms |

These are single host-side runs with uncontrolled filesystem caches. The numbers exclude VS Code rendering and SSH transport. The Rorqual probe used VS Code's server Node binary with reduced thread pools.

In two separate Rorqual SSH sessions, the baseline read all five sources. After the ZIP changed, the old member reference was rejected and a refreshed listing returned the replacement member. The Remote SSH viewer passed all seven cases before and after a deliberate disconnect. The server logged a graceful disconnect. Reopening the same workspace in a separate disposable VS Code profile started a fresh extension host and returned identical results. Earlier startup attempts hit the host's 512-task quota. Stopping four extension hosts from completed synthetic tests freed capacity. Persistent ZIP and tar inventory reuse has separate reconnect evidence. [0.6.0 Remote SSH validation](MILESTONE_0.6.0.md)

## Build and security

That 0.8.0-source snapshot passed the 157 unit tests, packaging and Semgrep. Both VS Code versions passed 43 integration tests, with one opt-in test pending in each run. The dependency audit reported zero runtime findings and no high or critical findings overall. The full audit reported 13 moderate and one low finding in development tooling.

## 0.9.0 candidate pass

On November 6, 2026, a fresh copy of the current source changes was built after a locked dependency install. The candidate retained manifest version `0.8.0` for this pre-release check. The VSIX SHA-256 was `fe2d03de3a30e8fb295a2f2a09a0f617e0decf7047d967ebbc4276ac17736508`, verified on macOS and Rorqual.

| Candidate check           | macOS arm64, VS Code 1.96.0                           | macOS arm64, VS Code 1.145.2 | Rorqual Linux x64, Remote SSH 1.145.2               |
| ------------------------- | ----------------------------------------------------- | ---------------------------- | --------------------------------------------------- |
| Default NIfTI viewer      | 7 synthetic cases passed                              | 7 synthetic cases passed     | 7 synthetic cases passed before and after reconnect |
| JSON metadata preview     | Directory, ZIP, ustar, gzip ustar and SquashFS passed | Same five formats passed     | Same five formats passed before and after reconnect |
| Full extension-host suite | 44 passed, 1 opt-in pending                           | 44 passed, 1 opt-in pending  | Synthetic smoke tests above                         |

The local runs installed the VSIX into separate test profiles. The remote runs loaded the checksum-matched VSIX contents in a synthetic Remote SSH workspace. The first successful run closed the remote connection. Reopening the workspace ran the same checks in a different remote extension-host process. The NIfTI checks confirmed the first-frame preview and both loaded frames. Archived images were also checked against the fixture bytes. JSON checks waited for the rendered preview and confirmed the recorded fields.

The 5,000-participant synthetic host probe listed the dataset in 52 ms locally and 64 ms on Rorqual. Repeat listings took under 1 ms. Cancellation retained the prior listing, and refresh returned the new participant. In a separate Rorqual session, an old ZIP reference was rejected after the archive was replaced, and refreshing exposed the new member.

The published UKB collection contained 12 gzip SquashFS images at the time of this check. The candidate indexed 62,051 participants in 112.8 seconds. A separate SSH invocation loaded the persisted index in 359 ms without rebuilding. Both invocations returned the same first page after paging forward and back. These measurements are host-side and exclude VS Code rendering and transport.

A local synthetic participant table was visually checked in Dark Modern and Dark High Contrast. Keyboard focus reached the column disclosure controls and row filter. Filtering reduced two rows to the expected one. The keyboard walkthrough also focused the logical tree, opened the dataset description, found a field by its readable label, opened Participant Availability from the dataset context menu and applied a participant filter. The completed availability view showed the correct count, with a minor singular-label issue. Full screen-reader testing and theme coverage across the other previews remain open.

The clean source passed formatting, type checking, lint, coverage and all 157 unit tests. The Semgrep rule tests and source scan passed. The dependency audit reported no runtime findings and 13 moderate and one low finding in development tooling, with no high or critical findings.

## 0.9.0 release artifact

The local release VSIX is `bids-explorer-0.9.0.vsix`, SHA-256 `44f81550f8f7fe3fd2c4d7c3763fe130de7a428587bfd8eaa3c34bc021f3bcaa`. Its 390 packaged runtime files matched the candidate byte for byte. The installed release passed the seven NIfTI cases and all five metadata source cases on VS Code 1.96.0 and 1.145.2. The release source passed 157 unit tests and 44 extension-host tests on each VS Code version, with one opt-in test pending on each. Semgrep passed. The dependency audit found no runtime, high or critical findings. Rorqual verified the release checksum and reran the synthetic host read and stale ZIP recovery checks successfully. The Remote SSH rendering and reconnect evidence above used the runtime-identical candidate.

## Usability follow-up

The November 7, 2026 [usability record](USABILITY.md) adds development-host checks of gradient and inherited-metadata previews in dark and high-contrast themes, named image controls, keyboard frame selection and dataset-history opening. The follow-up adds user-assisted VoiceOver announcements, reload recovery and keyboard-accessibility fixes. It distinguishes manual observations, automated checks and installed-package verification.

## 1.0.0 release validation — November 7, 2026

The fresh locked source snapshot passed 169 unit tests and all 58 extension-host tests on each of VS Code 1.96.0 and 1.145.2, including the public tarball and logical-layout image fixtures. The installed 1.0.0 package passed all seven NIfTI cases and JSON previews for directory, ZIP, ustar, gzip ustar and SquashFS on both versions. Image sidebar and four-quadrant rendering states were checked as well.

The checksum-matched package passed the same synthetic image, metadata and sidebar checks in a Rorqual Remote SSH workspace before and after an isolated client reconnect. The final package preserves all 394 candidate runtime files byte for byte; documentation and release metadata are the only packaging changes. Semgrep passed; the audit found zero runtime vulnerabilities and 13 moderate plus one low development-tooling finding. See the [release record](MILESTONE_1.0.0.md) for scope and limitations.

## Published 1.0.1 and 1.0.2 patches

[1.0.1 verification](MILESTONE_1.0.1.md) records the security hardening, installed sample/format checks and hosted minimum/current CI. [1.0.2 verification](MILESTONE_1.0.2.md) records the icon-only runtime-equivalent patch and the validated Marketplace artifact/icon. Historical test counts above are not current suite totals; consult the relevant release record and CI run.

## 1.0.3 maintenance patch

[1.0.3 verification](MILESTONE_1.0.3.md) records 178 unit tests, 58 local integration tests per VS Code version, artifact/security checks and seven separate-process cache tests using packaged code on Rorqual’s shared home filesystem. A fresh interactive Remote SSH viewer check was blocked by connection timeouts; the user explicitly authorized release with that limitation. This does not extend the historical interactive SSH or Windows compatibility claims.

## 1.0.4 maintenance patch

The [1.0.4 verification record](MILESTONE_1.0.4.md) covers the installed upgrade, shared cache across two local windows, and a fresh synthetic Rorqual Remote SSH viewer and metadata check.

## Large participant table benchmark on Rorqual

The development build opened a synthetic `participants.tsv` with 500,000 data rows and four columns from a gzip SquashFS archive in VS Code 1.146.0 over Remote SSH. The TSV was 17.0 MB before compression and the archive was 1.72 MB. Each action checked all 500,000 rows and returned at most 50 result rows to the preview.

| Operation                           |             Time |       Range |
| ----------------------------------- | ---------------: | ----------: |
| Open and render first page          | 5.60 s (one run) |           — |
| Next page                           |    0.80 s median | 0.73–0.91 s |
| Previous page                       |    1.02 s median | 0.71–1.13 s |
| Filter for 100 matches near the end |    1.17 s median | 0.77–1.38 s |
| Filter with zero matches            |    0.94 s median | 0.93–0.98 s |

Paging and filtering each ran three times. Timings include reading and decompressing the member on Rorqual, the Remote SSH round trip, and rendering the result. The first-page measurement also includes opening the preview after the archive member was located. A separate host-only run on a smaller, two-column synthetic loose TSV with the same row count gave medians of 238 ms for the first page, 219 ms for the next page, 239 ms for the late-match filter, and 235 ms for the zero-match filter. The real UKB table remains unbenchmarked.
