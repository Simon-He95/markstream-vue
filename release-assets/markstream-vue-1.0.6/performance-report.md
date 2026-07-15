# markstream-vue 1.0.5 vs 1.0.6

## Result

`1.0.6` is materially faster where this release concentrated its work: restoring long AI-chat documents that contain offscreen code, images, math, Mermaid, and Infographic nodes. In the heavy-restore benchmark, initial main-thread work fell 74.5%, DOM nodes fell 60.0%, peak heap fell 59.3%, and long-task time fell 78.1%.

The result is not a blanket speedup. Plain-text streaming was effectively flat in main-thread work, and the 254 KB CHANGELOG streaming-parser case was also flat. The improvement is strongest for large restores and code-heavy streaming.

## Heavy document restore

Scenario: a final AI-chat document with 95 parsed nodes, 72 trailing nodes, and offscreen code, image, KaTeX, Mermaid, and Infographic targets. The page remains unscrolled for 1,200 ms. Values are the median of five runs with Chrome CPU throttled 4× after page readiness.

| Initial restore metric | 1.0.5 | 1.0.6 | Change |
| --- | ---: | ---: | ---: |
| Main-thread task time | 1,579.5 ms | 402.1 ms | **-74.5%** |
| Script time | 475.6 ms | 29.8 ms | **-93.7%** |
| Layout time | 138.2 ms | 35.3 ms | **-74.5%** |
| Style recalculation | 48.5 ms | 23.2 ms | **-52.1%** |
| Long-task total | 1,218 ms | 267 ms | **-78.1%** |
| Peak JS heap | 43.0 MB | 17.5 MB | **-59.3%** |
| Retained JS heap | 20.2 MB | 10.1 MB | **-50.1%** |
| DOM nodes | 583 | 233 | **-60.0%** |
| Mounted slots | 95 | 50 | **-47.4%** |

In `1.0.5`, offscreen heavy targets were enhanced during the initial observation and the image, code, math, Mermaid, and Infographic work was not fully deferred. In `1.0.6`, the same probe reported automatic final-restore virtualization, viewport priority, bounded slots, no offscreen enhancements, no heavy-loader work, and no heavy runtime/image requests before the targets were needed.

This benchmark measures initial restore. `1.0.6` deliberately moves some work to the moment a user reaches an offscreen target, so it should not be read as a claim that visiting every heavy node costs 74.5% less overall.

## Browser streaming

Scenario: 119 transport chunks plus an end marker, 18 characters per chunk, 8 ms cadence, smooth streaming at 3,000 characters/s, 160 characters/commit, and 20 commits/s. Values are the median of five runs after one warm-up, with 4× Chrome CPU throttling.

| Case | Metric | 1.0.5 | 1.0.6 | Change |
| --- | --- | ---: | ---: | ---: |
| TypeScript fences | Catch-up time | 381.2 ms | 303.6 ms | **-20.4%** |
| TypeScript fences | Main-thread task time | 466.2 ms | 381.8 ms | **-18.1%** |
| TypeScript fences | p95 update time | 1.5 ms | 1.3 ms | **-13.3%** |
| Full mixed Markdown | Total time | 2,535.7 ms | 2,415.7 ms | **-4.7%** |
| Full mixed Markdown | Catch-up time | 792.7 ms | 727.1 ms | **-8.3%** |
| Full mixed Markdown | Used JS heap | 20.1 MB | 18.6 MB | **-7.1%** |
| Plain text and headings | Main-thread task time | 2,920.3 ms | 2,925.8 ms | +0.2% |

The full-mix p95 update time moved from 4.9 ms to 5.4 ms (+10.2%) in this run. That is why the release claim is scoped to restore, code-heavy streaming, and memory rather than presented as a universal streaming win.

## Parser

Both parser builds consumed the exact same `1.0.6` corpus. Each result is a seven-run median after two warm-ups; streaming uses 120 target chunks.

| Corpus | Size | Streaming total 1.0.5 | Streaming total 1.0.6 | Change |
| --- | ---: | ---: | ---: | ---: |
| AI chat streaming guide | 14.0 KB | 56.9 ms | 53.2 ms | **-6.4%** |
| English README | 35.0 KB | 313.4 ms | 295.5 ms | **-5.7%** |
| Chinese README | 32.3 KB | 191.6 ms | 174.5 ms | **-8.9%** |
| Performance guide | 21.7 KB | 147.1 ms | 144.5 ms | -1.8% |
| CHANGELOG | 253.7 KB | 2,590.8 ms | 2,617.4 ms | +1.0% |

Full final parsing was mostly flat: changes ranged from +5.3% to -5.5% across these five files. The parser gain is in typical append-stream workloads, not every corpus shape.

## What changed in 1.0.6

- Long final restores in `chat` and `minimal` modes can automatically virtualize nodes instead of mounting the entire document at once.
- Code, images, math, Mermaid, D2, Infographic, and async heavy components use viewport priority and can avoid idle/offscreen enhancement until they approach the viewport.
- Stable top-level parsed nodes can be reused during append/tail streaming when custom parser transforms do not make reuse unsafe.
- Chat/minimal render batches increased from 16 to 32 initially and 48 subsequently, with a larger frame budget and shorter scheduling delays.
- High-frequency virtual metrics emissions are throttled to roughly once per frame.
- Smooth grapheme streaming no longer slices the entire unseen tail on every commit.
- Code and diff rendering now has stricter finalization gates, stable fallback heights, serialized updates, and a more controlled handoff to highlighting/Monaco.
- Streaming fixes cover incomplete fences, diff layouts, math, Mermaid, CJK emphasis, linkify candidates, and restored virtual-timeline identity.

## Method and environment

- Tags: `markstream-vue@1.0.5` (`ba061f3a23c34ca86ff5304c5d0019fb77eb1386`) and `markstream-vue@1.0.6` (`5dd254c71003b1de6d0c37c3df309a75d72d7114`).
- The same `1.0.6` benchmark harness and fixtures loaded each tag through Vite source aliases.
- Machine: Apple M1 Pro, 10 logical CPUs, 32 GB RAM, arm64 macOS/Darwin 23.5.0.
- Browser: Chrome 150.0.7871.115, headless, 1,280 × 900 viewport.
- Parser runtime: Node.js 23.11.0.
- Browser correctness probes passed for the reported code and restore targets.
- Local synthetic results vary by machine and workload; use the relative results and disclosed scenario rather than treating the absolute milliseconds as universal.

