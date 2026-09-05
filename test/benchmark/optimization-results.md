# Streaming and history optimization experiments

Baseline: `1dc6f7c375e09dabb82f39961babc46eaaf92617`. Measurements were made on an Apple M1 Pro with Chrome 152.0.7977.77 and Node 23.11.0, using production Vite builds of both source trees. The original checkout's unrelated parser changes were excluded.

The retained change isolates non-code block transitions in the full DOM rendering path behind a Vue component with stable props. Streaming tail updates can skip settled transition subtrees. The existing DOM wrappers, measurement refs, transition options, custom slots, and code-block rendering path are preserved. This uses Vue 3.0-compatible APIs; it does not require `v-memo` or change the peer range.

## Measurement boundaries

- The paired runner builds both variants before measurement, warms up each, then alternates baseline/candidate execution order. Each measured run uses a fresh page. Raw runs and exact parameters are written to `.tmp`.
- `TaskDuration` is Chrome CDP main-thread task time, used as a work/CPU proxy. It is not an OS CPU percentage. Most runs use 4× CPU throttling; native-speed controls are identified separately.
- Streaming uses the same transport chunks, cadence, smoothing configuration, styles, and end marker. Final text, semantic element counts, link attributes, and image attributes must equal both the static oracle and the other variant.
- History timings include mounting, preparation of the visible view, and settling. The internal `restoreReady.elapsedMs` only measures the readiness wait after mounting; it is not end-to-end restore time. Paired runs reject timeouts and mismatched final text, links, images, slot counts, placeholders, or DOM counts.
- Default history tests mount all conversation messages but retain each message's normal node virtualization. They are not a claim that every offscreen enhancement or image has loaded. Separate unbounded-node and narrow-viewport cases cover those different rendering configurations.
- GC runs after timing to measure retained JS heap. Desktop scheduling and animation cadence cause run-to-run variance, especially in small code-only cases. Small exploratory differences are not treated as demonstrated wins.

## Experiments retained or rejected

| Direction | Evidence | Decision |
| --- | --- | --- |
| Stable transition subtree boundary | Broad streaming and history A/B results below; DOM/selection/fade/props/restore checks | Retain the transition-only boundary |
| Direct `v-memo` | Requires a newer runtime than the advertised Vue 3.0 minimum | Reject this implementation |
| Lazy parser creation for `nodes`-only renderers | Three-run production restore matrix: nested +1.7%, changelog +1.6%, React docs +1.7%, docs conversation −4.0%, many-message conversation −1.0% Task time | Reject: no clear CPU benefit |
| Lazy stable-node array copy | Paired no-smoothing runs: long list −1.6%, plain −1.8%; individual runs also regressed | Reject: below observed noise |
| Serialized final-AST cache across instances | Exploratory restore reductions of 5–22%, but the second README instance reused 7 occurrences of the first instance's ID; differential correctness test failed | Reject: breaks instance identity |
| Functional content component instead of an SFC | Paired against the stateful SFC prototype: nested restore about −3%, many-message restore +7–10% Task time | Reject: history regression |
| Reuse readiness-query snapshots | Paired restore: docs conversation +3.5%, many-message conversation +3.9% median paired Task time | Reject: no stable benefit |
| Worker parser with dirty-tail transfer | One cold + three warm runs, 80 streaming chunks, native CPU speed: warm README final 10.0 → 13.8 ms, streaming 61.6 → 84.6 ms; changelog final 53.8 → 68.1 ms, streaming 330.3 → 373.7 ms. Worker startup added 27–38 ms. Exact final AST parity passed. | Reject as the default pipeline: main-thread offload, but no total latency/CPU reduction demonstrated |

The first boundary prototype also wrapped code blocks. A broad run exposed a code-only timing regression, so code blocks were restored to their original direct rendering branches before final validation. A 15 KB nested-list exploratory run at 4× CPU was interrupted during warmup and supplies no performance result.

The unchanged baseline also failed streamed/static text equality for repeated `<details open>` blocks containing a summary and a Markdown paragraph. Both compact and multiline forms failed. One compact run produced 593 versus 621 normalized text units. Those inputs are excluded from timing claims; the equality assertion remains strict.

A code-only smoothing self-control used byte-identical production files for both variants and still varied from approximately −9% to +49% per pair. Small smoothing-case differences must therefore be read as noise, not evidence of a win or regression.

## Final results

The final matrix covers 45 case/configuration combinations and 290 measured browser runs, plus discarded warmups. All numbers below are medians in milliseconds unless stated otherwise. Negative change means less work. The change column is the ratio of the two medians; the raw data also records the median of within-pair ratios, which can differ when runs are noisy. Every measured pair is included in [optimization-results.json](./optimization-results.json).

### Streaming

The short matrix uses 119 × 18 UTF-16 units, 16 ms transport cadence, 4× CPU throttling, and three measured pairs per case. Smoothing-on and smoothing-off runs are separate experiments.

| Case | Smooth baseline → candidate Task | Change | No smoothing baseline → candidate Task | Change |
| --- | ---: | ---: | ---: | ---: |
| inline-rich | 1,638.7 → 1,051.6 | -35.8% | 1,660.6 → 1,293.4 | -22.1% |
| long-paragraph | 1,099.6 → 924.5 | -15.9% | 1,412.3 → 1,433.3 | +1.5% |
| long-table | 2,009.3 → 1,835.7 | -8.6% | 2,552.7 → 2,538.2 | -0.6% |
| long-list | 3,189.8 → 3,183.2 | -0.2% | 4,107.9 → 3,745.8 | -8.8% |
| single-code | 784.1 → 686.2 | -12.5% | 1,063.6 → 997.5 | -6.2% |
| math | 3,974.9 → 2,393.6 | -39.8% | 4,204.8 → 2,965.3 | -29.5% |
| custom-html | 1,945.0 → 1,650.9 | -15.1% | 1,939.0 → 2,090.3 | +7.8% |
| references | 1,394.1 → 973.5 | -30.2% | 1,448.9 → 1,134.5 | -21.7% |
| plain | 1,675.5 → 905.2 | -46.0% | 1,449.9 → 959.2 | -33.8% |
| list | 1,721.0 → 972.6 | -43.5% | 1,715.7 → 1,257.1 | -26.7% |
| table | 1,859.9 → 1,087.1 | -41.5% | 1,770.9 → 1,406.7 | -20.6% |
| code-ts | 833.9 → 872.3 | +4.6% | 1,061.8 → 1,071.0 | +0.9% |
| code-diff | 889.3 → 1,006.9 | +13.2% | 1,565.9 → 1,493.7 | -4.6% |
| mermaid-source | 879.7 → 852.4 | -3.1% | 1,377.1 → 1,419.2 | +3.1% |
| blockquote | 1,293.1 → 846.9 | -34.5% | 1,408.2 → 1,132.5 | -19.6% |
| full-mix | 1,427.1 → 1,316.0 | -7.8% | 1,685.5 → 1,434.7 | -14.9% |

Native-speed controls use 240 × 64 UTF-16 units (15,360 plus marker), the same 16 ms cadence, no smoothing, and three pairs.

| Case | Baseline Task | Candidate Task | Change |
| --- | ---: | ---: | ---: |
| long-list | 7,139.2 | 7,147.7 | +0.1% |
| single-code | 623.7 | 617.7 | -1.0% |
| plain | 2,811.5 | 800.1 | -71.5% |
| full-mix | 1,692.2 | 1,016.9 | -39.9% |

At native speed, the plain workload also improves total streaming time from 6,832.6 to 4,887.5 ms and per-update P95 from 18.5 to 2.5 ms. The stable-block workloads show the strongest benefit. A single growing list or code fence has little settled transition work to skip; those controls remain approximately flat. Small smoothing-only code differences are not treated as causal regressions or improvements, given the identical-code self-control described above.

Custom HTML has mixed results: smoothing-off Task medians rise 7.8%, while the median within-pair change is +1.5% and individual pairs span −4.7% to +8.5%. No consistent custom-HTML benefit is claimed. This change is retained for the substantial settled-block and full-history gains, with the extra component allocation and these mixed controls explicitly recorded.

### History restoration

Default-node-virtualization cases use five pairs; unbounded-node and mobile cases use three. All use 4× CPU throttling. The mobile viewport is 390 × 844 with message overscan 4 / 800 px. The many-message fixture repeats a synthetic answer 40 times, alternating with user messages (81 records including the end marker). The docs conversation contains 11 records, including five Markdown documents totaling about 395 KB.

| Configuration / case | Task baseline → candidate | Change | Total restore baseline → candidate | GC heap MB baseline → candidate |
| --- | ---: | ---: | ---: | ---: |
| Default / nested-history | 1,520.1 → 1,487.5 | -2.1% | 1,504.9 → 1,473.5 | 40.4 → 40.8 |
| Default / react-components | 632.4 → 623.2 | -1.5% | 667.0 → 668.2 | 11.9 → 11.8 |
| Default / changelog | 959.9 → 949.6 | -1.1% | 986.1 → 967.0 | 20.0 → 19.8 |
| Default / many-message-thread | 2,537.6 → 2,522.4 | -0.6% | 2,523.5 → 2,507.4 | 46.5 → 47.6 |
| Default / docs-chat-thread | 2,022.1 → 2,102.6 | +4.0% | 2,027.5 → 2,095.5 | 41.2 → 41.0 |
| All nodes / many-message-thread | 2,503.8 → 2,554.8 | +2.0% | 2,491.5 → 2,539.5 | 46.5 → 47.5 |
| All nodes / docs-chat-thread | 14,562.3 → 11,647.6 | -20.0% | 14,552.0 → 11,645.8 | 139.0 → 140.1 |
| Mobile / many-message-thread | 233.4 → 235.1 | +0.8% | 351.8 → 351.8 | 12.4 → 12.5 |
| Mobile / docs-chat-thread | 874.3 → 817.1 | -6.5% | 890.0 → 838.4 | 22.5 → 22.7 |

The full docs conversation with node virtualization disabled restores the same **34,213 DOM nodes / 1,062 slots / zero placeholders**. Task time falls from **14,562.3 to 11,647.6 ms (−20.0%)**, with all three candidate runs faster than every baseline run. Total restore time falls from 14,552.0 to 11,645.8 ms. Retained heap grows by about 1 MB (139.0 → 140.1 MB). This is the demonstrated full-history win; default virtual-window restoration is approximately flat. Twenty offscreen images remain pending in both unbounded variants, so these timings do not represent completion of every offscreen enhancement.

### Behavior and validation

The no-smoothing table control exposed premature benchmark completion during the loading indicator’s leave transition. The unchanged baseline reproduced it in 3/5 diagnostic runs and the candidate in 5/5; subsequent inspection found zero remaining indicators in both. The benchmark now waits for indicator removal before counting stable frames. The six resumed no-smoothing cases use that gate; every earlier retained run had already passed the same strict static-output assertion. No library change or relaxed equality assertion was needed.

- `pnpm lint`, `pnpm typecheck`, and `pnpm test --run --testTimeout=10000 --exclude '.tmp/**'` passed: **348 test files / 3,077 tests**. The exclusion prevents local experiment copies from being collected; no repository test directories are excluded.
- `pnpm test:api:strict` passed, including production build, public type checks, 183 runtime exports and 15 subpaths.
- A subsequent CI size-budget fix replaces this internal child's runtime prop validators with TypeScript-only definitions and a prop-name array. The render function is unchanged; the matrix above predates this declaration-only adjustment. A fresh build reduces `dist/exports.js` from 290,868 to 290,779 bytes, passing the unchanged 290,816-byte chunk budget and all other `pnpm size:check` budgets.
- Four focused tests cover skipped settled transitions, raw/reactive caller-owned child updates, and a custom component that reads raw node props while ignoring its slot. The transition test fails against the baseline; the three compatibility tests pass against both.
- The browser check preserves native text selection and DOM identity during streaming, verifies inherited scoped styles, and compares baseline/candidate final screenshots byte for byte. Rich text, lists, tables, nested custom HTML, and code render identically.
- The existing diff-streaming playground check passed four inline/side-by-side and overflow configurations, including surface identity and fold/height restoration. Virtual-scroll smoke checks passed with zero measured fast-wheel scroll jump and height drift.
- Heavy-history regression checks passed three baseline and three candidate runs: the initial view has the same 50 slots / 254 DOM nodes, preserves offscreen deferral, and avoids premature heavy loader work. After scrolling, code, image, math, Mermaid, and infographic enhancements all pass source/correctness checks. This existing fixture inspects Vue development-mode internals, so its timings are not used as production performance evidence. Raw checks are included under `heavyRestore` in the JSON.
- The 26 updated test snapshots only remove the parent scope attribute under Vue Test Utils Transition stubs. Real browser transitions retain that scope attribute; no visible output change was observed.

The internal child is stateful and uses runtime slots to preserve the old dynamic-slot invalidation behavior. The caller-owned `nodes` array is also an invalidation signal: replacing it can accompany mutation of an otherwise reused raw custom node. These details were required by differential compatibility tests; using a template with compiler-stable slots was rejected.

## Reproduce

Create a clean baseline worktree at the commit above and install its dependencies with the repository's pinned pnpm version. Run the benchmark scripts from the candidate checkout so both variants use exactly the same fixtures and assertions.

```sh
MARKSTREAM_BENCHMARK_BASELINE_ROOT=/absolute/path/to/baseline \
MARKSTREAM_STREAMING_SPLIT_CPU_THROTTLE_RATE=4 \
MARKSTREAM_PAIRS_OUTPUT_DIR=.tmp/streaming-pairs \
node scripts/benchmark-optimization-pairs.mjs

MARKSTREAM_BENCHMARK_BASELINE_ROOT=/absolute/path/to/baseline \
MARKSTREAM_PAIRS_SUITE=restore \
MARKSTREAM_REAL_CORPUS_BROWSER_CPU_THROTTLE_RATE=4 \
MARKSTREAM_PAIRS_OUTPUT_DIR=.tmp/restore-pairs \
node scripts/benchmark-optimization-pairs.mjs

MARKSTREAM_BENCHMARK_BASELINE_ROOT=/absolute/path/to/baseline \
node scripts/e2e-stable-streaming-subtrees.mjs
```

Use `MARKSTREAM_BENCHMARK_SOURCE_ROOT` to select a candidate source tree; it defaults to the current checkout. `MARKSTREAM_PAIRS_REPEATS` controls measured pairs. Set `PLAYWRIGHT_CHROME_PATH` when Chrome is not in the standard macOS location.

Streaming selectors: `MARKSTREAM_STREAMING_SPLIT_CASES`, `MARKSTREAM_STREAMING_SPLIT_CHUNKS`, `MARKSTREAM_STREAMING_SPLIT_CHUNK_SIZE`, `MARKSTREAM_STREAMING_SPLIT_INTERVAL_MS`; set `MARKSTREAM_PAIRS_STREAM_VARIANT=incremental-nosmooth` for the smoothing-off control.

History selectors: `MARKSTREAM_PAIRS_RESTORE_CASES`, `MARKSTREAM_PAIRS_CHAT_CASES`; use `,` to select no cases in either group. `MARKSTREAM_REAL_CORPUS_RENDERER_OPTIONS_JSON='{"maxLiveNodes":0,"nodeVirtual":false}'` renders all nodes. Viewport width/height and chat overscan controls are recorded in each result's parameters.

The existing streaming and real-corpus entry points also accept `MARKSTREAM_BENCHMARK_BUILD=1` for production builds. Without it they retain the development-server workflow. Rejected prototypes are not shipped as production code.

Run `node scripts/benchmark-heavy-restore.mjs` separately with `MARKSTREAM_BENCHMARK_SOURCE_ROOT` pointing to each checkout for the development-mode heavy-node behavior checks.
