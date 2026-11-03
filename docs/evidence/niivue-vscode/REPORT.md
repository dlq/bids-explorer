# NiiVue VS Code vs Strata: local sample benchmark

Measured October 31, 2026 on Apple M3, 16 GiB, macOS 27.2 (26B123). VS Code 1.144.0 arm64; marketplace extension KorbinianEckstein.niivue 2.9.0. The installed bundle logs NiiVue core 0.68.1 and ANGLE Metal Renderer: Apple M3. Strata uses the current SwiftPM debug prototype and its existing Metal volume shader.

## Finding

NiiVue’s installed VS Code viewer has ample interactive rendering headroom for these samples. Its GPU volume-rendering times were lower than Strata’s for T1 and T2, and close with the SIAM overlay. Strata’s axial slice shader had lower GPU cost; both viewers were far below a typical display frame budget. This supports testing a BIDS browser that hands viewing to NiiVue. It does not establish universal equivalence or a 20% end-to-end latency guarantee.

## GPU execution time

Each cell gives the range across two independent runs. Each run contains 270 measured frames after 20 warmup frames. Median and p95 use separate order statistics; ranges are not confidence intervals. All values are milliseconds.

| Sample | View | NiiVue median | Strata median | NiiVue p95 | Strata p95 |
|---|---|---:|---:|---:|---:|
| T1 | volume | 1.07–1.25 | 2.97–3.02 | 2.06–2.49 | 4.20–4.32 |
| T1 | axial | 0.19–0.19 | 0.04–0.04 | 1.07–1.16 | 0.59–0.62 |
| T2 | volume | 1.12–1.22 | 2.96–2.99 | 2.20–2.58 | 4.24–4.27 |
| T2 | axial | 0.19–0.20 | 0.04–0.04 | 0.99–1.09 | 0.62–0.70 |
| T1+SIAM | volume | 2.39–2.50 | 2.71–2.77 | 4.15–4.19 | 3.88–4.14 |
| T1+SIAM | axial | 0.21–0.31 | 0.04–0.04 | 0.86–1.30 | 0.59–0.66 |

NiiVue’s animation callback cadence had medians of 8.3–8.4 ms and p95 values of 9.1–9.7 ms, approximately a 120 Hz update schedule. This measures scheduled scripted updates, not display-present timestamps or mouse-to-photon latency. No GPU-disjoint flags were reported. The final scene had full 188 × 256 × 190 anatomy and labels, a discrete SIAM LUT, and no WebGL error.

## Load-path wall times

Three reloads per sample per run, in an already-running process with warm filesystem/browser caches. The table pools the six reload durations and reports their median. These are not whole-editor or application launch times, and are not scene-cache hits.

| Sample | NiiVue load path | Strata decode/resource path |
|---|---:|---:|
| T1 | 128 ms | 68 ms |
| T2 | 101 ms | 62 ms |
| T1+SIAM | 368 ms | 1032 ms |

NiiVue loads local webview resource URLs through its existing instance, prepares textures and colors, and calls gl.finish. Strata decodes NIfTI, creates VolumeResources (including pipelines), and synchronizes an upload command buffer. Browser gl.finish wall duration was shorter than GPU timer duration, so it must not be treated as equivalent to Metal waitUntilCompleted. These load-path numbers are useful diagnostics, not a controlled first-visible-frame comparison. Strata’s normal prepared-scene cache and shared-pipeline reuse are not represented by these reloads.

## Method and limitations

- Same byte-identical full-resolution T1, T2, and SIAM inputs; hashes and dimensions are in inputs.json. No voxel downsampling.
- Same 840 × 700 backing-pixel render target. Single volume view or single axial view; not four full-size panels at once.
- NiiVue: temporary DevTools probes attached to its existing Preact viewer instance. The installed extension bundle was not modified. NiiVue rendered visibly in its VS Code webview. Developer tools were docked during measurements.
- Strata: XCTest directly exercised NIfTIReader, VolumeResources, GPUUniforms, the current shader and palette, using an offscreen Metal texture. This excludes SwiftUI scheduling, drawable presentation and input handling.
- Volume angles sweep continuously; axial crosshair position changes across the scan. NiiVue is paced by requestAnimationFrame; the native test submits synchronously without display pacing. GPU clock/power behavior may therefore differ.
- Anatomy window 0–190; SIAM opacity 0.45 with matching 16-class colors. NiiVue anatomy opacity 1; Strata MRI brightness/opacity uniform 0.7, as in the existing native renderer benchmark. Camera/FOV, shading, transfer functions, sampling, lighting and compositing differ. This is a practical workload comparison, not image-quality-normalized algorithm performance.
- GPU times use EXT_disjoint_timer_query_webgl2 in NiiVue and Metal command-buffer GPU timestamps in Strata. CPU wall values are retained separately in raw results; they are not compared as synchronized GPU timings.
- Not measured: cold OS-cache startup, extension-host file-bridge latency, full application memory, true input-to-display latency, large/4D data, remote transfer, SquashFS extraction, or concurrent dataset indexing.

## Reproduce

Install the official extension: `code --install-extension KorbinianEckstein.niivue`.
Open the sample-only workspace in this folder. In Developer: Open Webview Developer Tools, select the active-frame context. Run script/benchmarks/niivue-vscode.js, then runBench() twice. The helper depends on this extension version’s Preact structure and is only benchmark instrumentation. Restore the ordinary layout with the commands at the end of that script.

Native command from repository root:

```sh
STRATA_BENCHMARK_SAMPLES="$PWD/output/benchmarks/niivue-vscode/samples" swift test --package-path native/Strata --filter ViewerComparisonBenchmarkTests
```

Both native runs passed. Raw results are niivue-run1.json, niivue-run2.json, strata-run1.json, and strata-run2.json. Webview submission/cadence/load values are rounded to 0.1 ms in saved JSON; GPU timings retain the reported precision.

Official extension: https://marketplace.visualstudio.com/items?itemName=KorbinianEckstein.niivue
Source: https://github.com/niivue/niivue-vscode
