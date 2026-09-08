# Streaming CPU and history follow-up: source diffs

Baseline: `95d8cf78b2e8a200243bb2d626115f5e0e4ea265` (2.0.8, after PR #754). Measured on Apple M1 Pro, Node 23.11.0 and Chrome 152. Source variants use the same installed dependencies. The earlier streaming/history improvements are already in this baseline and are not counted again.

## Retained changes

1. Intern middle-region source lines as integer IDs before the LCS loops in the shared core diff preview and Vue's diff header statistics. String equality, prefix/suffix trimming, LCS tie breaking, the 1,500,000-cell cutoff, streaming match caches, output keys and line numbers are unchanged. Comparisons inside the quadratic loops no longer repeatedly compare long strings.
2. Collect common suffix matches by appending, then reverse once. Repeated `unshift` moved the existing suffix on every iteration; a large mostly unchanged file with a change near its start paid quadratic array-movement cost before rendering a small collapsed diff.

These changes target source-pair diffs, including their streaming previews and restoration from history. They do not claim faster general Markdown parsing, syntax highlighting, Mermaid or KaTeX. No CSS, DOM mode, parser, public API, pacing, animation, virtualization or rendering-budget changes are retained.

## Experiments rejected

Each browser row below used three alternating baseline/candidate pairs after one discarded warmup per variant. Streaming experiments used 180 × 48 UTF-16 units plus the end marker, 16 ms transport cadence and native CPU; restoration experiments rendered all nodes. All measured runs and their configuration are preserved in [the data file](./diff-cpu-history-2026-09.json).

| Direction | Measured result | Decision |
| --- | --- | --- |
| Explicit list prop instead of object binding | Long list −2.6%, full mix −1.4%, table control +0.6% | Reject: small gains alone did not justify a separate retained change |
| Bypass simple-inline dispatch components | Changelog restore −8.2%, many-message restore −9.1%; streaming long paragraph +9.0%, full mix +19.3% | Reject: mixed streaming results |
| Functional built-in child dispatcher | Changelog restore −6.2%; streaming long list +2.1%, full mix +9.7% | Reject: mixed results |
| Shallow height trees with explicit invalidation | Docs-thread restore +2.0%, many-message +1.1%, changelog −2.3% | Reject: no stable overall benefit |
| Reduce props-merge inputs | Long table −1.2%, long list +0.4%, full mix +1.2% | Reject: below observed noise |
| Identity shortcut in descendant comparisons | Long table −1.1%, long list −2.7%, full mix +0.8% | Reject: small, inconsistent benefit |
| Raw-text rejection plus lazy built-in signature priming | Long list −3.2%, table +0.6%, full mix +2.0% | Reject: no substantial benefit |

The nine browser experiment/configuration groups comprise 34 rows and 204 measured browser runs. Rejected code and experiment-only tests are not shipped; local snapshots remain in the ignored `.tmp/cpu-followup*` directories. CPU profiles identified props merging, descendant comparisons, component initialization and layout reads as the remaining general-renderer hotspots. Worker parsing, cross-instance AST caching and initial timeline-ref batching had already been evaluated in the previous repository reports; their earlier results are not presented as new experiments here.

## Method and correctness

- Diff kernels: one warmup per variant, five alternating pairs, all measured samples retained. Timed loops rotate six input pairs to avoid measuring only the existing last-result cache. Durations are total milliseconds for the stated number of calls; process user/system CPU time is also recorded.
- Diff browser cases: production Vite builds, fresh pages, native CPU, one warmup and five alternating pairs. `TaskDuration` is Chrome CDP main-thread task time, not an OS CPU percentage. Percentage changes are the median of within-pair ratios; separately reported medians can imply a different ratio.
- The browser fixture renders the real `PreCodeBlock` source-pair preview with normal styles and collapsed unchanged regions. The `thread-*` fixture cases mount batches of blocks, not a virtualized conversation; the real timeline controls are listed separately below. Streaming appends 40 lines per animation frame, then finalizes. This fixture measures the preview used before enhancement or by preformatted rendering; it does not measure a completed syntax-highlighting engine.
- Every pair checks the entire final HTML hash and DOM count. Split-pane measurement must finish and the DOM must stay unchanged for four frames. An initial two-frame completion probe was rejected because the asynchronous row-height module could still be loading; no equality assertions were relaxed.
- All 14 final screenshot pairs are byte-identical. The single-diff and multi-block screenshots were visually inspected. Screenshot hashes are recorded in the data file.
- Differential validation against the frozen baseline passed **1,000 randomized statistics cases, 2,000 complete preview cases, and 17,338 cached streaming prefixes/finalizations**. Cases include duplicate and empty lines, Unicode, LF/CRLF/CR, inline/split layouts and collapsed/expanded output. The final deterministic kernel fixtures also compare complete results before timing.
- The fixture's elapsed timer covers rendering and settling after source preparation; it excludes the final HTML serialization. CDP task time includes that instrumentation, so the two measures are not interchangeable. These are warm-browser page mounts, not cold browser-process launches.

## Diff kernel results

| Case | Operation | Calls per sample | Baseline → candidate ms | Paired change |
| --- | --- | ---: | ---: | ---: |
| 30 lines | Header statistics | 600 | 4.73 → 5.08 | +5.8% |
| 30 lines | Complete preview | 600 | 8.05 → 8.48 | +4.8% |
| Real source, 1,000 lines | Header statistics | 18 | 70.52 → 40.73 | −42.2% |
| Real source, 1,000 lines | Complete preview | 18 | 82.89 → 58.43 | −29.5% |
| Long lines, 1,000 lines | Header statistics | 18 | 752.30 → 71.71 | −90.5% |
| Long lines, 1,000 lines | Complete preview | 18 | 773.44 → 101.74 | −86.9% |
| Repeated lines, 1,000 lines | Header statistics | 18 | 133.34 → 37.08 | −72.2% |
| Repeated lines, 1,000 lines | Complete preview | 18 | 152.74 → 65.27 | −57.2% |
| 1,500 lines, over cutoff | Complete preview | 18 | 5.34 → 5.35 | +0.4% |
| Common suffix, 1,000 lines | Complete preview | 18 | 6.08 → 4.34 | −28.6% |
| Common suffix, 10,000 lines | Complete preview | 6 | 62.12 → 15.33 | −75.2% |
| Common suffix, 50,000 lines | Complete preview | 6 | 1,781.45 → 183.80 | −89.8% |

The small-case setup cost is visible: roughly 0.6–0.7 microseconds more per call in this run. The existing large-input cutoff remains active; no larger quadratic workload is enabled. Integer IDs and their map are temporary linear storage, while the existing LCS score table and retained match-cache format are unchanged. Independent numeric-ID and suffix experiments are included alongside the final combined measurements.

## Browser diff restoration and streaming

| Case | Task ms baseline → candidate | Paired change |
| --- | ---: | ---: |
| suffix-1000-split | 25.1 → 25.2 | +0.8% |
| suffix-1000-inline | 21.8 → 21.8 | -0.3% |
| suffix-10000-split | 39.8 → 36.2 | -9.0% |
| suffix-10000-inline | 35.8 → 31.9 | -10.8% |
| suffix-50000-split | 192.6 → 78.3 | -59.4% |
| suffix-50000-inline | 189.7 → 71.8 | -62.3% |
| source-1000-split | 115.4 → 113.0 | -2.5% |
| source-1000-inline | 65.7 → 62.9 | -3.1% |
| thread-8-source | 698.3 → 690.8 | -0.8% |
| stream-source | 1191.7 → 1172.8 | -1.1% |
| long-lines-split | 178.6 → 143.1 | -19.2% |
| long-lines-inline | 109.8 → 76.2 | -30.5% |
| thread-4-long-lines | 626.9 → 490.4 | -21.9% |
| stream-long-lines | 1585.2 → 1504.6 | -5.3% |

The 50,000-line collapsed split diff becomes ready in 243.6 → 132.9 ms; inline becomes ready in 222.0 → 102.8 ms. Restoring four long-line diffs improves 566.4 → 420.1 ms. Ordinary eight-block source restoration is a modest change, not a large-history-wide speedup. In the four long-line browser cases, retained heap after forced GC differs by about **+0.002 MB** per case.

## Broad renderer controls

Final controls use production builds, a warmup per variant and three alternating pairs. Streaming covers 16 cases × smoothing on/off, each with 119 × 18 UTF-16 units plus the end marker, 16 ms transport cadence and 4× CDP CPU throttling. History controls use native CPU and include saved-height restoration and first mount without saved heights. Every pair passed final semantic equality; history also passed settled DOM/slot/placeholder-count equality and completion checks. These paths are largely unaffected by the retained algorithms, so the results below are regression controls, not additional claimed wins.

| Streaming case | Smooth task ms | Paired change | No smooth task ms | Paired change |
| --- | ---: | ---: | ---: | ---: |
| inline-rich | 989.3 → 1108.4 | +12.0% | 1246.1 → 1250.4 | +0.5% |
| long-paragraph | 902.7 → 879.1 | -2.8% | 1228.6 → 1210.9 | +1.2% |
| long-table | 1454.5 → 1538.6 | +5.8% | 2005.4 → 2002.0 | +0.3% |
| long-list | 2103.7 → 2268.7 | +3.7% | 2740.6 → 2752.1 | +0.4% |
| single-code | 766.5 → 801.2 | +2.1% | 961.5 → 960.0 | -0.1% |
| math | 2522.3 → 2438.4 | -4.9% | 2375.2 → 2354.6 | -0.9% |
| custom-html | 1658.4 → 1783.3 | +7.5% | 1857.5 → 1859.6 | +0.9% |
| references | 1055.2 → 1079.1 | +2.3% | 1176.9 → 1155.3 | +0.2% |
| plain | 913.6 → 863.2 | -5.6% | 1005.5 → 1035.7 | +2.4% |
| list | 924.8 → 940.5 | +1.7% | 1149.0 → 1162.3 | +0.4% |
| table | 1098.8 → 1061.0 | -5.6% | 1361.2 → 1358.8 | -0.1% |
| code-ts | 883.8 → 798.9 | -2.5% | 1076.7 → 1071.1 | -0.3% |
| code-diff | 890.8 → 997.0 | +7.6% | 1394.2 → 1393.4 | -0.1% |
| mermaid-source | 813.4 → 792.1 | -2.0% | 1312.6 → 1323.8 | +0.6% |
| blockquote | 773.1 → 778.7 | +0.7% | 910.5 → 934.7 | +2.7% |
| full-mix | 1096.7 → 1205.5 | +9.9% | 1296.9 → 1303.8 | +0.9% |

| History configuration | Case | Task ms baseline → candidate | Paired change |
| --- | --- | ---: | ---: |
| Default | nested-history | 254.0 → 246.5 | -2.4% |
| Default | chat-answer | 49.0 → 49.5 | +2.4% |
| Default | ai-chat-streaming | 121.9 → 121.5 | -0.7% |
| Default | readme-en | 164.4 → 161.6 | -1.4% |
| Default | readme-zh | 166.9 → 167.7 | +0.5% |
| Default | docs-performance | 119.5 → 116.5 | -3.7% |
| Default | react-components | 130.5 → 131.8 | +2.4% |
| Default | parser-readme | 139.7 → 140.4 | +1.1% |
| Default | changelog | 223.0 → 225.3 | +1.0% |
| Default | many-message-thread | 512.8 → 505.6 | -1.4% |
| Default | docs-chat-thread | 398.3 → 395.7 | -0.6% |
| All nodes | nested-history | 244.6 → 245.5 | -0.4% |
| All nodes | react-components | 187.9 → 182.2 | -0.0% |
| All nodes | changelog | 639.9 → 641.8 | +0.3% |
| All nodes | many-message-thread | 509.2 → 500.9 | -0.5% |
| All nodes | docs-chat-thread | 1666.6 → 1641.1 | -3.2% |
| 390 × 844 | readme-zh | 166.8 → 166.7 | -0.0% |
| 390 × 844 | changelog | 223.8 → 224.2 | -0.2% |
| 390 × 844 | many-message-thread | 516.2 → 518.2 | -0.4% |
| 390 × 844 | docs-chat-thread | 397.1 → 401.0 | +0.8% |
| No saved heights | chat-answer | 48.4 → 48.0 | -0.7% |
| No saved heights | many-message-thread | 576.8 → 576.6 | -0.4% |
| No saved heights | docs-chat-thread | 633.5 → 621.6 | -0.7% |

The initial smooth controls are visibly noisy. Four cases were therefore rerun with five alternating pairs, alongside a separate five-pair calibration in which **all 393 production build files were byte-identical**. No-smoothing controls stay within −0.9% to +2.7%; history controls stay within −3.7% to +2.4%. The smooth recheck does not reproduce the initial larger increases. This does not establish sub-percent improvements or rule out every small regression.

| Smooth case | Identical-build paired change | Candidate recheck paired change |
| --- | ---: | ---: |
| inline-rich | +2.0% | -0.9% |
| custom-html | -0.6% | -1.0% |
| code-diff | -2.6% | +1.2% |
| full-mix | -5.4% | +0.1% |

Together with the rejected experiments and targeted diff cases, the recorded browser datasets contain **754 measured runs**, excluding warmups, profiling and rejected completion probes. There is no substantial general Markdown/history speedup claimed by this follow-up.

## Verification

- `pnpm lint`, `pnpm typecheck`, and core typecheck passed.
- `pnpm test --run --testTimeout=10000 --exclude '.tmp/**' --maxWorkers=4`: **352 files / 3,105 tests passed**. Only ignored local experiment copies are excluded. A pre-existing untracked table-hook test was included in the run but is not part of this PR.
- `pnpm build` passed. `pnpm size:check` passed with the existing budgets. `dist/exports.js` is **291,826 bytes**, +228 bytes versus the baseline's recorded 291,598 bytes; the 291,840-byte limit is unchanged.
- `node scripts/e2e-diff-streaming-stability.mjs`: all four inline/split × wrap/scroll combinations passed, with zero invalid frames, unexpected height drops or enhancement handoff height delta.
- `MARKSTREAM_E2E_VIRTUAL_SCROLL_DEV=1 node scripts/e2e-virtual-scroll.mjs --mode=smoke` and `--mode=stress` passed, including reload, cold thread switching, diff state restoration, streaming and wheel controls. Stress recorded zero blank probes, coverage gaps, height drift and restored-anchor delta.
- `node scripts/e2e-main-playground-performance.mjs` passed. These interaction checks exercise the actual playground and enhancement path; their timings are not used as baseline/candidate speedup claims.

## Reproduce

Use a frozen dependency-installed checkout at the baseline commit. Both variants must resolve the same dependency versions. From the candidate repository:

```sh
export MARKSTREAM_BENCHMARK_BASELINE_ROOT=/absolute/path/to/baseline
pnpm exec tsx scripts/benchmark-diff-cpu.ts
node scripts/benchmark-diff-cpu-browser.mjs
```

`DIFF_BENCH_OUTPUT` preserves each invocation's results separately; the kernel and browser defaults already use different directories. `DIFF_BENCH_REPEATS` controls browser pairs (default five). `DIFF_BENCH_CASES` selects browser cases. `PLAYWRIGHT_CHROME_PATH` selects the browser executable. The kernel command also performs the baseline differential checks.

General controls use the existing `scripts/benchmark-optimization-pairs.mjs`; the data records all `MARKSTREAM_*` parameters. CPU profiling with `MARKSTREAM_STREAMING_SPLIT_CPU_PROFILE=1` now saves the complete `.cpuprofile` in addition to the existing self-time summary, allowing caller attribution.
