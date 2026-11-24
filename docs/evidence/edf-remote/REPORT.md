# Synthetic EDF Remote SSH audit

Recorded November 24, 2026 for the selected 1.5.0 scope: ordinary EDF and continuous EDF+ EEG previews, channel metadata and BIDS events. This is development-build evidence, not the final 1.5.0 VSIX/release check.

## Outcome

All **30 instrumented Remote SSH cases passed**: EDF and continuous EDF+ across loose files, ZIP, tar, gzip tar and gzip SquashFS, three repetitions each. Each case opened calibrated traces and companion tables, rendered events, navigated time, jumped to an event and changed channel selection. The 590-second window loaded from loose files; all archived versions explicitly refused it because reaching it exceeds the current 16 MiB member-prefix budget, preserving the previous completed view.

The marker scans found **no synthetic raw sample bytes, decoded trace JSON fragments, or tested channel/event/JSON/identifier markers** in the isolated client profile at any checked stage. VS Code retained remote workspace paths. Six archive inventories, totalling 2,558 bytes, remained on the remote host; their bytes and modification times were unchanged after reconnect. No recording cache was created by the exercised readers. All 18 synthetic study files retained their original SHA-256 hashes.

## Workload and method

- Client: macOS, VS Code 1.147.0, Remote SSH 0.128.0. Remote workspace host: Linux on Rorqual, Node v24.22.1.
- Source: commit `ef7175f`, with documentation-only scope updates in the checkout. The compiled production reader/preview/client classes and resources were copied to temporary remote storage. The manifest still identifies the development build as 1.4.0; nothing was tagged or published.
- Each recording contains 600 seconds and 64 numeric channels: Fz at 200 Hz, ECG at 128 Hz, and 62 other signals at 256 Hz. EDF+C also has annotation storage, which is not decoded as a waveform. Decoded EDF sizes are 19,456,640 and 19,495,296 bytes. Samples are deterministic high-entropy random values, deliberately unlike physiological EEG. Calibration and units are explicit in the header.
- Distinct synthetic markers identify sample bytes, decoded trace values, patient/recording header fields and channel/event/JSON content. The TSVs contain 64 channel rows and four events, including a negative overlapping interval, a cue, an instantaneous response and an unknown-duration event. The source files were made read-only before testing.
- A temporary workspace extension called the production classes on the remote host and added test-only webview controls/replies. It used its own extension identity/storage; it did not replace the installed Marketplace package. First-display timing starts before panel opening and ends after the requested traces and tables are ready and two browser animation callbacks have occurred. This is an instrumented rendering marker, not a measured human-visible first pixel or a final-package launch benchmark.
- Initial archive browsing/indexing is separate from the display measurements. Each source is inventoried before its three opens. Filesystem/OS caches were uncontrolled; these are repeated local-to-Rorqual session measurements, not a cold-disk guarantee. Fixtures lived in remote temporary storage, not the UKB Lustre collection.
- Each initial ten-second window retains 324,000 record bytes (EDF) or 324,640 (EDF+C), returning 2,000 Fz and 1,280 ECG display points. Interleaved record reads include other channel bytes, although only the selected traces are transmitted. Archive scans and metadata reads may read/decompress more than the retained window; these counters do not measure total host IO.

## Display and navigation timings

Medians of three repetitions per row. Seconds for rendered actions; KiB for the initial JSON-equivalent bridge payload.

| Recording | Source | First window (s) | Next window (s) | Event jump (s) | Initial bridge payload (KiB) |
| --- | --- | ---: | ---: | ---: | ---: |
| EDF | Loose | 0.372 | 0.118 | 0.199 | 152.6 |
| EDF | ZIP | 0.263 | 0.132 | 0.134 | 155.2 |
| EDF | Tar | 0.251 | 0.121 | 0.120 | 155.3 |
| EDF | Gzip tar | 0.324 | 0.130 | 0.132 | 155.3 |
| EDF | SquashFS | 0.219 | 0.129 | 0.119 | 155.0 |
| EDF+C | Loose | 0.228 | 0.125 | 0.126 | 152.8 |
| EDF+C | ZIP | 0.245 | 0.129 | 0.121 | 155.5 |
| EDF+C | Tar | 0.285 | 0.129 | 0.133 | 155.6 |
| EDF+C | Gzip tar | 0.398 | 0.159 | 0.136 | 155.6 |
| EDF+C | SquashFS | 0.238 | 0.165 | 0.133 | 155.2 |

All individual first-window measurements were 0.210–0.468 seconds. Initial outbound bridge payloads were approximately 153–156 KiB, including header/table snapshots and bounded traces. These are the JSON-equivalent sizes of outgoing webview messages; they exclude static assets, inbound diagnostics and transport overhead and **are not SSH wire-byte measurements**. Full source recordings were not transferred to the viewer. [Individual numeric results](results.json)

## Persistence checks

The scanner recursively read every ordinary file up to 256 MiB in the dedicated client profile, including workspace/global storage, logs, backups, History locations when present, web storage and caches. It checked literal bytes, UTF-16 little/big endian and base64 representations of known markers, and attempted bounded decoding of embedded gzip bodies. No client files were skipped in these snapshots.

| Stage | Files scanned | Marker hits | Skipped files |
| --- | ---: | ---: | ---: |
| Connection-only baseline | 103 | 0 | 0 |
| Preview open after all 30 cases | 129 | 0 | 0 |
| All previews closed | 129 | 0 | 0 |
| Remote workspace reloaded into another synthetic folder | 135 | 0 | 0 |
| Switched to local workspace | 159 | 0 | 0 |
| Reconnected without reopening recordings | 163 | 0 | 0 |
| Audit window closed | 188 | 0 | 0 |

Positive controls recovered markers from literal, UTF-16, base64 and gzip test bodies outside the client profile. A remote production-reader check confirmed that each decoded trace fragment searched for actually occurs in the serialized initial window, while patient/recording identifiers are omitted from the published header model. The remote audit extension's six persistent index files contained none of the tested content/sample markers.

The reload check opened another synthetic remote folder in the same window and verified a new remote extension-host activation. The disconnect/reconnect check switched that window to a local empty workspace and then reconnected without reopening recordings. It does not test an unexpected network failure or require destruction of the SSH tunnel. The audit window was closed normally afterward and its temporary extension registration removed. Synthetic fixtures and detailed audit artifacts remain outside Git in private temporary locations for reproducibility.

## Limits and remaining checks

This evidence covers the exercised production classes inside a temporary instrumented extension, on one VS Code/Remote SSH version pair and with synthetic recordings. It does not establish retention behavior for every VS Code version, the eventual installed 1.5.0 artifact, arbitrary serialization/compression/encryption, browser memory, OS swap, crash reports outside the scanned profile, clipboard, exports or other extensions/viewers. No research data was accessed. Absence of the tested markers is bounded evidence, not a promise that a client never retains remote data.

Final packaged minimum/current VS Code compatibility, practitioner/keyboard/spoken accessibility checks and a realistic physiological EEG example remain release work. Other EEG formats, MEG decoding, EDF+ annotation decoding, event dictionaries and image synchronization are outside 1.5.0. Efficient later archived windows remain a separate reader improvement.

## Practitioner presentation follow-up

This high-entropy workload tests access, calibration, bounds and responsiveness, not whether a waveform looks like physiological EEG. The current view is a basic signal preview. Established [MNE raw browsers](https://mne.tools/stable/generated/mne.io.Raw.html) and [EEGLAB scrolling views](https://eeglab.org/tutorials/06_RejectArtifacts/Scrolling_data.html) provide useful comparison points: compact stacked channels, explicit amplitude scale bars, shared time navigation, events and keyboard controls.

Evaluate compact stacked traces with a shared scale for compatible EEG channels, separate ECG/other-unit groups, event lines/shading across traces, and simple time/amplitude controls before declaring a familiar EEG-browser workflow. Preserve recorded reference, channel status and display-transform explanations. These are presentation recommendations for the usability pass; this audit does not implement rereferencing, filtering, editing or a general EEG analysis environment.
