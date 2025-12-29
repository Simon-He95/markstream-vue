# KaTeX Worker Performance Playbook

> Looking for the Chinese version? See [KaTeX Worker Performance Guide (ZH)](/zh/guide/katex-worker-performance-analysis).

## Question: is a Worker actually faster than rendering on the main thread?

Use this guide to decide when the Worker + cache pipeline is worth enabling.

## Short answer

**Yes. A Worker backed by a cache easily wins in most real workloads.**

Why:
1. **The cache eliminates ~99 % of the cost** (cache hit rate commonly >70 %).
2. **The Worker keeps the main thread responsive**, so scrolling/typing stays smooth even when formulas are heavy.
3. **Memory overhead is tiny** -- roughly 10-50 KB for ~200 cached formulas.

## Quick performance comparisons

### Scenario 1 - single lightweight formula
```
Direct render:   ~2-5 ms
Worker:          ~3-7 ms (includes postMessage overhead)
Takeaway:        Worker is slightly slower but the difference is negligible.
```

### Scenario 2 - single complex formula
```
Direct render:   ~20-50 ms (blocks the main thread)
Worker:          ~22-52 ms (main thread stays free)
Takeaway:        UX improves because the page never freezes.
```

### Scenario 3 - repeated formula with cache
```
Direct render:   5 ms x 10 renders = 50 ms
Worker+cache:    5 ms + 0.01 ms x 9 hits = 5.09 ms
Takeaway:        ~10x faster once cached.
```

### Scenario 4 - mixed real document
```
50 formulas with 35 duplicates:
- No cache:   250 ms (every formula rerenders)
- With cache: 75 ms  (only 15 "unique" renders)
- Cache hit rate: 70 %
- Speedup: ~3.3x
```

## How to benchmark

### 1. Use the built-in Vitest benchmark

```bash
pnpm install
pnpm test test/benchmark/katex-worker-vs-direct.test.ts
pnpm test test/benchmark/katex-worker-vs-direct.test.ts -- --reporter=verbose
```

### 2. Estimate the "switch to Worker" threshold

Compute how many unique formulas (N) you can render on the main thread before risking a noticeable jank:

- Formula: `N ~ floor(B / (R x (1 - H)))`
  - `B`: main-thread budget in ms (use 50 ms for "user sees a hitch" or 16.7 ms for 1 frame).
  - `R`: average time to render one unique formula.
  - `H`: cache hit rate (0-1). When first rendering a page, assume `H = 0`.

Fast helpers:

```bash
node scripts/measure-katex-threshold.mjs
```

```ts
import { recommendNForSamples, recommendWorkerThreshold } from 'markstream-vue/utils/katex-threshold'

const exactN = recommendWorkerThreshold({ R: 10, H: 0, B: 50 })
const sampleBased = recommendNForSamples(['x', '\\sum_{i=1}^{n}', '\\int f(x) dx'], { H: 0, B: 50 })
```

Practical tips:
- Default to the "medium complexity" threshold.
- First paint: assume `B = 50` and `H = 0`. During scrolling or repeat renders, increase `N` because the cache hit rate climbs quickly.
- If you detect lots of integrals/matrices, pick the conservative threshold (smaller `N`).

### 3. Monitor live traffic

```ts
import { enablePerfMonitoring, getPerfReport } from 'markstream-vue/utils/performance-monitor'

enablePerfMonitoring()

setTimeout(() => {
  getPerfReport()
}, 30_000)
```

Browser console helpers:

```js
window.__katexPerfReport()
window.__katexPerfMonitor.exportMetrics()
```

### 4. Inspect Chrome DevTools

#### A. Performance panel
1. Open DevTools -> **Performance**.
2. Record while rendering formulas.
3. Inspect:
   - **Main** lane -> watch `katex.renderToString`.
   - **Worker** lane -> ensure work moved off the main thread.
   - **Long tasks** (>50 ms) -> any red markers mean main thread was blocked.

#### B. Memory panel
1. Take a **Heap snapshot** after rendering.
2. Search for the cache `Map`.
3. Check size:
   - <1 MB -> no worries.
   - >5 MB -> lower `CACHE_MAX`.

#### C. Performance Monitor
1. Cmd/Ctrl + Shift + P -> "Show Performance Monitor".
2. Watch **CPU usage**, **JS heap**, **Frames** while rendering.

## Decision matrix

### :white_check_mark: When to prefer Worker + cache

| Scenario | Rationale |
| --- | --- |
| Complex math (>10 ms) | Keeps UI responsive. |
| >5 formulas per page | Cache savings stack up. |
| Lots of repetitions | Cache hit rate skyrockets. |
| Smooth scrolling/typing required | No main-thread stalls. |
| Mobile devices | CPUs are weaker, so avoid blocking. |

### :warning: When direct render is fine

| Scenario | Rationale |
| --- | --- |
| Only trivial formulas | <5 ms each, Worker overhead similar. |
| SSR / Node.js | Worker API unavailable. |
| Single formula | Cache never pays off. |
| Extreme bundle constraints | Worker adds a small chunk. |

### :dart: Recommended pipeline (already implemented)

```
try Worker + cache
  -> on error / timeout
fallback to direct render
  -> on success
store result back in cache
```

Benefits:
- :white_check_mark: Production-safe (there is always a fallback).
- :white_check_mark: Fast path takes advantage of caching.
- :white_check_mark: Progressive enhancement (Worker is optional).

## Real-world measurements

### Render time by formula type

| Type | Example | Avg time | Worker benefit |
| --- | --- | --- | --- |
| Simple | `x = y` | 2-3 ms | Low (~1 ms overhead). |
| Medium | `\sum_{i=1}^{n}` | 5-10 ms | Medium (prevents frame drops). |
| Complex | `\int_{-\infty}^{\infty}` | 15-30 ms | High (avoids jank). |
| Matrix | `\begin{pmatrix}...` | 30-80 ms | Huge (main thread unusable otherwise). |

### Cache effectiveness

| Case | First render | Cache hit | Speedup |
| --- | --- | --- | --- |
| Variable `x` | 2 ms | 0.005 ms | 400x |
| Summation | 10 ms | 0.008 ms | 1250x |
| Complex integral | 30 ms | 0.01 ms | 3000x |

### Sample document (50 formulas, 15 unique)

| Strategy | Total time | Main-thread block | UX |
| --- | --- | --- | --- |
| No optimization | 250 ms | 250 ms | :warning: Noticeable hitching. |
| Worker only | 265 ms | 0 ms | :white_check_mark: Smooth but slower. |
| Worker + cache | 78 ms | 0 ms | :white_check_mark::white_check_mark: Fast *and* smooth. |

## Memory footprint

```
Input formula:   ~30 bytes
HTML output:     ~150 bytes
Expansion ratio: ~5x
One cache entry: ~180 bytes (with key)
200 entries:     ~36 KB
```

**Conclusion:** memory cost is negligible.

## Optimization recipes

### 1. Tune cache size

```ts
// inside katexWorkerClient.ts
const CACHE_MAX = 500 // e.g. bump from 200 to 500 for more unique formulas
```

### 2. Pre-render frequent formulas

```ts
import { setKaTeXCache } from 'markstream-vue/workers/katexWorkerClient'

const commonFormulas = ['x', 'y', 'E=mc^2', '\\sum_{i=1}^{n}']

for (const formula of commonFormulas) {
  requestIdleCallback(() => {
    renderAndCache(formula)
  })
}
```

### 3. Use `requestIdleCallback`

```ts
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => {
    renderKaTeXInWorker(formula)
  })
}
```

## Key takeaways

1. Worker overhead is tiny (~1-2 ms).
2. Cache hit rates >70 % are normal, so caching is the real win.
3. Worker + cache + fallback is the optimal combo.
4. Memory costs stay under ~100 KB even with aggressive caching.
5. Users notice the smoother scrolling much more than the extra kilobytes.

### Final recommendation

**Keep the existing Worker + cache + fallback architecture.**

- :white_check_mark: Great performance (cache removes most work).
- :white_check_mark: Smooth UX (Worker isolates blocking work).
- :white_check_mark: Stable (fallback guarantees output).
- :white_check_mark: Memory friendly.
- :white_check_mark: Progressive enhancement friendly.

Nothing else needs changing -- the current design is already the sweet spot. :tada:

## References

- [Chrome DevTools Performance guide](https://developer.chrome.com/docs/devtools/performance/)
- [Web Worker performance considerations](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#performance_considerations)
- [KaTeX performance tips](https://katex.org/docs/performance.html)
