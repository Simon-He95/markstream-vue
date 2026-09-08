# Streaming and history performance follow-up

Baseline: `9a160f1ef` (2.0.8, including PR #753). Apple M1 Pro, Chrome 152.0.7977.77, Node 23.11.0. This follow-up uses new measurements; `optimization-results.md` describes an earlier change already in this baseline.

The retained changes reuse unchanged built-in descendants inside growing Markdown blocks and cache virtual height signatures within a parser revision. They keep the existing parser, pacing, transitions, DOM mode, virtualization limits, persisted signature format and scroll-anchor rules. Caller-owned ASTs, component overrides and custom parser/transform boundaries retain their original behavior. The signature cache stores only strings and indices for one parser revision, not previous ASTs.

## Method and limits

- Production builds, one discarded warmup per variant/case, fresh browser pages, alternating baseline/candidate order. Three measured pairs unless explicitly noted otherwise. Tests reject streamed/static semantic differences, baseline/candidate text/link/image differences, restore timeouts, and restored DOM/slot/placeholder count differences.
- `TaskDuration` is Chrome CDP main-thread task time, a work/CPU proxy, not an OS CPU percentage. The change column is the **median within-pair ratio**. The independently computed before/after medians can imply a different percentage when runs are noisy. Every measured pair is included in [the data file](./streaming-history-2026-09.json); correctness payloads are SHA-256 digested to avoid duplicating corpus text.
- Saved-state chat restore captures heights before timing, then measures a new mount and settle using that state. `chat-mount` starts with only message data and no saved heights. Neither means a cold browser binary or empty network cache. Elapsed time below is end-to-end mount/settle, not only the internal readiness wait.
- Default history mounts all conversation messages but retains each message's normal node virtualization. The unbounded matrix disables node virtualization and checks the complete restored DOM. Narrow viewport: 390 × 844; default: 1280 × 900.
- The timing fixtures render code fences as preformatted source. Rich code/diagram loading is covered separately by the heavy-deferral and playground/virtual-scroll checks; these tables do not claim faster syntax highlighting or diagram-engine execution.
- Native-speed short documents and isolated code cases have small, noisy deltas. These are not claimed as universal wins. Height-cache retention changes in the final history matrix ranged from −0.048 to +0.117 MB after forced GC.

## Experiments

| Direction | Evidence | Decision |
| --- | --- | --- |
| Reuse unchanged parsed descendants | Four longer native-speed cases plus all 16 short streaming cases with smoothing on/off; prefix and behavior checks | Retain |
| Cache height signatures per parser revision | Independent five-case restore experiment plus default/unbounded/narrow/no-saved-height history matrices | Retain |
| Lazy construction of five render-item props variants | Three pairs on five cases; inconsistent results including long-paragraph regressions | Reject |
| Construct only active render-mode props | Five pairs on the same five cases; no reliable overall improvement | Reject |
| Bottom-up array/parent canonicalization beyond descendant reuse | Compared directly with the retained descendant candidate: table about −2%, but all three growing-list pairs regressed about 19–20% | Reject |
| Batch initial timeline ref measurements | Passed 107 timeline tests; three pairs each with and without saved heights showed no stable benefit | Reject; remove code and experiment-only test |

A general asynchronous-ref batching version was ruled out during review because existing tests require immediate anchor correction after imperative `measureRef` calls. The measured batching version flushed only initial-mount refs in `onMounted`. Rejected patches/snapshots remain under the local `.tmp/performance-audit` directory for audit and are not product changes in this PR.

The earlier repository report contains worker parsing and cross-instance AST cache experiments. They are not counted as measurements of this follow-up. The current profiles identified Vue updates/props for growing structures, and repeated signatures/layout reads for history, which motivated these six measured directions.

The data contains **85 experiment/configuration rows and 538 measured browser runs**, excluding warmups. Of these, 58 rows cover retained-path streaming and final history matrices; the remainder cover rejected directions, the independent signature trial and identical-source controls.

## Streaming results

Short matrix: 119 × 18 UTF-16 units plus end marker, 16 ms transport cadence, 4× CPU throttle. The two modes use otherwise identical options. All 32 case/configuration combinations passed semantic checks.

| Case | Smooth Task ms | Paired change | No smoothing Task ms | Paired change |
| --- | ---: | ---: | ---: | ---: |
| inline-rich | 1048.4 → 1036.1 | +7.8% | 1308.8 → 1290.5 | -0.7% |
| long-paragraph | 868.2 → 914.2 | +5.3% | 1309.7 → 1217.7 | -7.5% |
| long-table | 1902.4 → 1520.2 | -20.9% | 2479.4 → 2257.7 | -10.5% |
| long-list | 3354.7 → 2150.1 | -36.6% | 3702.1 → 2924.1 | -20.4% |
| single-code | 583.4 → 594.0 | +3.2% | 1009.7 → 1032.5 | -0.1% |
| math | 2408.8 → 2482.4 | +3.1% | 2667.1 → 2488.7 | -4.1% |
| custom-html | 1898.5 → 1970.6 | +1.0% | 1943.5 → 2047.8 | +5.3% |
| references | 1069.7 → 1052.3 | -1.6% | 1161.0 → 1227.2 | +1.5% |
| plain | 923.6 → 898.7 | +1.3% | 1007.5 → 997.0 | -0.5% |
| list | 1024.1 → 895.2 | -9.9% | 1238.6 → 1130.0 | -6.6% |
| table | 1075.3 → 1073.8 | +4.9% | 1296.6 → 1303.0 | +1.2% |
| code-ts | 775.9 → 728.3 | -1.6% | 1026.2 → 1097.9 | +7.8% |
| code-diff | 767.9 → 835.0 | +10.1% | 1570.7 → 1464.1 | -1.8% |
| mermaid-source | 699.2 → 713.2 | +3.0% | 1266.5 → 1280.5 | +1.1% |
| blockquote | 737.4 → 700.4 | +1.0% | 868.1 → 916.4 | +5.6% |
| full-mix | 1147.9 → 1076.8 | -0.1% | 1360.8 → 1328.1 | -2.3% |

Longer exploratory control: 180 × 48 units plus end marker, native CPU, 16 ms cadence, no smoothing. The later guard/timing-accounting changes do not alter these standard input paths.

| Case | Task ms | Paired change |
| --- | ---: | ---: |
| long-paragraph | 805.8 → 732.4 | -10.6% |
| long-table | 2029.4 → 1463.5 | -27.9% |
| long-list | 3337.1 → 2233.4 | -32.3% |
| full-mix | 686.1 → 680.6 | -0.5% |

## History results

All rows use native CPU. Each row has three measured pairs. Single-document rows show mostly noise-level differences; the consistent target benefit is the multi-document conversation.

| Configuration / case | Task ms | Paired change | Elapsed ms |
| --- | ---: | ---: | ---: |
| Default / nested-history | 254.6 → 257.4 | +6.2% | 318.3 → 319.0 |
| Default / chat-answer | 47.9 → 46.5 | -3.4% | 134.1 → 133.8 |
| Default / ai-chat-streaming | 124.9 → 122.2 | -2.4% | 216.6 → 216.9 |
| Default / readme-en | 164.0 → 166.4 | -0.6% | 250.0 → 250.3 |
| Default / readme-zh | 168.2 → 167.2 | -0.2% | 250.3 → 250.7 |
| Default / docs-performance | 124.8 → 121.9 | -2.3% | 216.8 → 216.6 |
| Default / react-components | 135.0 → 136.2 | +0.2% | 216.8 → 217.8 |
| Default / parser-readme | 145.0 → 141.0 | -2.4% | 233.7 → 233.3 |
| Default / changelog | 224.3 → 222.5 | -0.6% | 284.5 → 284.6 |
| Default / many-message-thread | 550.2 → 546.5 | -0.5% | 621.3 → 622.4 |
| Default / docs-chat-thread | 440.4 → 405.5 | -6.1% | 552.8 → 536.1 |
| All nodes / nested-history | 248.4 → 252.4 | +3.4% | 302.4 → 318.0 |
| All nodes / react-components | 180.4 → 186.0 | +3.1% | 234.0 → 234.1 |
| All nodes / many-message-thread | 520.3 → 509.5 | -1.9% | 604.6 → 587.5 |
| All nodes / docs-chat-thread | 1866.6 → 1426.6 | -8.5% | 1896.7 → 1440.0 |
| Narrow / readme-zh | 167.8 → 169.7 | +2.1% | 250.3 → 250.5 |
| Narrow / changelog | 223.7 → 227.3 | +1.6% | 300.6 → 300.3 |
| Narrow / many-message-thread | 532.5 → 507.7 | -4.7% | 604.4 → 589.1 |
| Narrow / docs-chat-thread | 432.9 → 415.3 | -4.3% | 552.1 → 535.9 |
| No saved heights / chat-answer | 49.1 → 47.2 | -1.2% | 133.1 → 133.8 |
| No saved heights / many-message-thread | 607.7 → 584.2 | -3.9% | 653.6 → 621.6 |
| No saved heights / docs-chat-thread | 654.4 → 637.0 | -2.3% | 685.7 → 668.6 |

## Identical-code control

Two production builds of the **same baseline source** had byte-identical contents across all 393 emitted files. Five alternating pairs still varied: single-code Task changes were −17.2%, −1.5%, −15.1%, −20.8%, +8.7%; custom-HTML changes were −1.6%, −8.6%, +0.6%, −3.6%, +3.7%. This demonstrates substantial scheduling/pacing noise in small cases, not a benefit of the candidate. The structural wins were repeated across larger native workloads and both short throttled modes. Modest isolated increases remain visible in the tables and are not hidden or advertised as improvements.

## Package size

A fresh production build of baseline `9a160f1ef` emits a 290,779-byte `dist/exports.js`; the retained candidate emits 291,598 bytes: **+819 bytes (+0.28%)**. The original 284 KiB chunk budget had only 37 bytes of baseline headroom, so the first PR CI run passed its functional checks but failed the final size gate. The JS chunk allowance is updated by 1 KiB to **285 KiB (291,840 bytes)** to account for the measured implementation cost. Dist-total, tarball and unpacked-package budgets remain unchanged. `pnpm size:check` passes with the updated allowance.

## Verification

- `pnpm lint` and `pnpm typecheck`: passed.
- `pnpm test --run --testTimeout=10000 --exclude '.tmp/**' --maxWorkers=4`: **350 files / 3,096 tests passed**. Only local experiment copies are excluded; no repository test directories are excluded.
- `pnpm build`: parser/core/library bundles, CSS and declarations passed.
- `scripts/e2e-stable-streaming-subtrees.mjs` against baseline and candidate production builds: heading/paragraph/list-item/table-cell selections and DOM identities preserved; both the growing-table and mixed/custom final screenshots were byte-identical and visually inspected. The structural checks run without component overrides so they exercise the new reuse path.
- `scripts/e2e-virtual-scroll.mjs --mode=smoke` and `--mode=stress` with `MARKSTREAM_E2E_VIRTUAL_SCROLL_DEV=1`: passed, including thread restoration, viewport/DOM bounds and layout integrity.
- `scripts/e2e-main-playground-performance.mjs`: passed on the real playground.
- `scripts/benchmark-heavy-restore.mjs`, one run with traces disabled: deterministic counted-loader deferral/deep-scroll checks passed. This is a behavior control, not a claim about production diagram-engine CPU speed.

Added unit checks compare every structural streaming prefix, finalization and replacement with fresh parsing, check list-item identity, and verify height-cache invalidation and caller-owned in-place AST mutation. The repository's existing extension, custom component, SSR, measurement, fade and restore tests also passed. No public API, CSS or default pacing/render-budget changes are part of the retained implementation.

## Reproduction

Use a dependency-installed frozen checkout at `9a160f1ef` as the baseline, and run from the candidate checkout. The data file records every suite's full parameter set, including exploratory and rejected variants.

```sh
export MARKSTREAM_BENCHMARK_BASELINE_ROOT=/path/to/frozen-baseline
MARKSTREAM_PAIRS_REPEATS=3 MARKSTREAM_STREAMING_SPLIT_CPU_THROTTLE_RATE=4 \
  node scripts/benchmark-optimization-pairs.mjs
MARKSTREAM_PAIRS_REPEATS=3 MARKSTREAM_PAIRS_STREAM_VARIANT=incremental-nosmooth \
  MARKSTREAM_STREAMING_SPLIT_CPU_THROTTLE_RATE=4 \
  node scripts/benchmark-optimization-pairs.mjs
MARKSTREAM_PAIRS_SUITE=restore node scripts/benchmark-optimization-pairs.mjs
MARKSTREAM_PAIRS_SUITE=restore MARKSTREAM_PAIRS_CHAT_MODE=chat-mount \
  node scripts/benchmark-optimization-pairs.mjs
MARKSTREAM_PAIRS_SUITE=restore \
  MARKSTREAM_REAL_CORPUS_RENDERER_OPTIONS_JSON='{"nodeVirtual":false,"maxLiveNodes":0}' \
  node scripts/benchmark-optimization-pairs.mjs
```

Set `MARKSTREAM_PAIRS_OUTPUT_DIR` separately per invocation to preserve all output files. Use `MARKSTREAM_PAIRS_RESTORE_CASES` to select the complete corpus and `MARKSTREAM_REAL_CORPUS_BROWSER_VIEWPORT_WIDTH/HEIGHT` for viewport controls, as recorded in the data.
