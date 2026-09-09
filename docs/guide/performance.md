---
title: Streaming Markdown performance tuning
description: Improve markstream-vue performance for streaming chat UIs, large documents, enhanced code blocks, and heavy Mermaid or KaTeX content.
ogImage: /og/performance.png
ogImageAlt: Streaming Markdown performance tuning for Markstream
keywords:
  - streaming Markdown performance
  - Vue Markdown performance
  - AI chat renderer performance
  - large Markdown documents
  - streaming Mermaid performance
  - markstream-vue benchmark
---

# Performance Features & Tips

The renderer is optimized for streaming and large docs. Key features:

- Incremental parsing for code blocks
- Efficient DOM updates and memory optimizations
- enhanced code-block streaming updates
- Progressive Mermaid rendering

Performance tips:

- Stream long documents in chunks
- Use `renderCodeBlocksAsPre` for non-editable code
- Scope custom components to enable GC
- Use `setDefaultMathOptions` at bootstrap

## Recommended presets

Small docs can favor simplicity:

```vue
<MarkdownRender
  :content="doc"
  :batch-rendering="false"
  :max-live-nodes="0"
/>
```

AI chat defaults should keep heavy nodes and long transcripts bounded:

```vue
<MarkdownRender
  :content="stream"
  :final="final"
  :batch-rendering="true"
  :defer-nodes-until-visible="true"
  :max-live-nodes="320"
  :live-node-buffer="60"
/>
```

Huge documents should use a smaller live window:

```vue
<MarkdownRender
  :nodes="nodes"
  :batch-rendering="true"
  :defer-nodes-until-visible="true"
  :max-live-nodes="180"
  :live-node-buffer="40"
/>
```

Use `content` for small and medium documents, ordinary docs pages, and moderate streaming. For very large documents or very high-frequency streams, parse outside the component and pass `nodes` so parsing and rendering can be scheduled independently.

## Benchmark coverage for 1.0

Before publishing 1.0, run the public benchmark over the shipped playground scenarios:

| Case | Purpose |
| --- | --- |
| Diagnostic Studio baseline | Mixed docs, code blocks, Mermaid, D2, and Infographic |
| Diagnostic Studio thinking | Custom component and nested Markdown rendering |
| Diagnostic Studio diff | Diff code block rendering |
| Diagnostic Studio stress | Safe repro and escaped content behavior |
| Reverse-flex chat scroll | Main playground chat viewport behavior |

Track LCP, CLS, settle time, p95 `requestAnimationFrame` interval, max long task duration, page and renderer DOM node counts, visible fallback count, heavy-block readiness, scroll position drift, and best-effort Chrome-only heap after renderer unmount plus GC. The benchmark also runs a real-browser Web Vitals probe for a million-character restore and scripted scroll scenario. Synthetic 1000-code-block, 100-Mermaid, and 10k-node cases are future 1.0.x coverage and should not be cited as 1.0 release evidence until they exist in the benchmark script.

Generate the release report with:

```bash
pnpm benchmark:1.0
```

This builds the playground, runs the scenarios through `vite preview`, and writes JSON and Markdown summaries under `benchmark/`, including environment disclosure so release notes can cite measured numbers instead of informal claims.

## 2.0 measured results

Same-machine, same-day comparison: the benchmark was run twice in alternating order
(`1.0.6` → `2.0.0-beta.3`, then `2.0.0-beta.3` → `1.0.6`) on an Apple M1 Pro with
Chrome 151 (viewport 1600×1200), using each version's own checked-in playground and
benchmark script. Rows below are the median of the two rounds. Metrics whose two
rounds disagree by more than ±10 points are flagged as high-variance and should not
be cited in release notes.

### Main playground chat (reverse-flex)

| Metric | 1.0.6 | 2.0.0-beta.3 | Median change | Round 1 / Round 2 |
| --- | ---: | ---: | ---: | --- |
| initial LCP (ms) | 346 | 384 | ↑11% (high variance) | +23.5% / −1.1% |
| initial settle (ms) | 628 | 649 | ↑3% | +7.4% / −0.8% |
| initial JS heap (MB) | 12.2 | 13.6 | **↑11%** | +11.6% / +11.0% |
| full-scroll heavy-settle frame p95 (ms) | 9.0 | 10.0 | **↑8%** | +8.9% / +7.5% |
| full-scroll JS heap (MB) | 12.9 | 13.5 | ↑5% | +5.8% / +3.7% |
| replay settle (ms) | 372 | 451 | ↑26% (high variance) | +49.9% / +1.7% |
| replay renderer DOM nodes | 9 | 13 | **↑44%** | both rounds identical |
| replay JS heap before unmount (MB) | 14.5 | 13.6 | **↓6%** | −4.4% / −7.8% |
| memory after unmount (MB) | 8.8 | 9.1 | ↑4% | +4.5% / +3.6% |

Stable findings:

- **2.0 mounts a few extra renderer DOM nodes (replay: 9 → 13)** and its resident state costs about **+11% initial JS heap** — the price of the virtual-scroll protocol, the height model, and async-node bookkeeping that did not exist in 1.x.
- **Streaming replay memory is strictly better (−6% heap before unmount)** — the incremental render-item and dirty-start height work pays off once the initial paced reveal settles.
- Initial LCP/replay-settle movement is real but **high-variance** (fence-atomic smooth commits add per-fence parse+layout passes; the exact cost depends on how many fences the document contains and browser scheduling).

The initial-phase and replay increases are dominated by the **streaming code-fence atomicity** added in markstream-core 1.1: reveal pauses at unclosed ``` fences and each fence (marker, info line, body) commits as one atomic unit, so documents with several fences are revealed as more, smaller fence-aligned commits, each costing one parse + layout pass. This is a streaming-correctness feature (1.x could expose half-open fences to the renderer), not a code-block-surface cost.

**Mitigated in 2.0.0**: `SmoothMarkdownStreamOptions.burstInitialContent` (enabled by the renderer for non-typewriter streams) reveals one-shot content of ≥2048 pending chars up to the fence-safe boundary in a single commit. Measured on a 4589-char document with a node rAF harness: 38 reveals / ~1943 ms → 2 reveals / ~87 ms, with unclosed fence opening lines still withheld. In the playground benchmark above, the replay DOM-node regression (13 → back to 9) and full-scroll heavy-settle frame p95 (10.0 → 8.4 ms) are already gone; the chat scenario feeds ~1.4 KB slices (below the burst threshold), so its initial LCP is unchanged by design.

Diagnostic Studio rows are not comparable across versions: 1.0 runs them in the plain
`markdown` render mode, 2.0 in the enhanced `stream-diffs` code surface.

### Parser throughput (same machine, same-day)

`scripts/benchmark-parser-performance.mjs` run against both parser builds with the
official corpus (prose-code-math and headings-lists, scales 1x/2x/4x):

| Case | 1.0.6 commit median | 2.0.0-beta.3 commit median | Change |
| --- | ---: | ---: | ---: |
| prose-code-math 1x | 0.417 ms | 0.376 ms | **−9.8%** |
| prose-code-math 2x | 0.437 ms | 0.329 ms | **−24.7%** |
| prose-code-math 4x | 0.592 ms | 0.336 ms | **−43.2%** |
| headings-lists 1x | 0.507 ms | 0.466 ms | **−8.1%** |
| headings-lists 2x | 0.591 ms | 0.426 ms | **−27.9%** |
| headings-lists 4x | 0.833 ms | 0.470 ms | **−43.6%** |

The 2.0 parser is faster across the board (stream-token reuse, dirty-tail node
reuse, and the incremental height/rendering work behind these numbers are the
same optimizations benchmarked in the hot-path table below). The gap widens with
document size, so large streaming answers benefit the most.

### Bundle size vs 1.0.6

Measured from `pnpm build` output on the same machine (all `dist/*.js` concatenated, gzip):

| Artifact | 1.0.6 | 2.0.0-beta.3 | Change |
| --- | ---: | ---: | --- |
| JS gzip | 178.4 KB | 180.0 KB | +0.9% |
| CSS gzip | 47.7 KB | 40.5 KB | **−15%** |
| npm pack tarball | 269.8 KB | 267.3 KB | −0.9% |
| npm unpacked | 1.1 MB | 1.0 MB | **−9%** |

2.0 ships virtualized rendering, the virtual timeline protocol, and the stream-diffs code surface with essentially flat JS size and a smaller stylesheet.

### Renderer hot-path micro-benchmarks (2.0 optimizations)

Measured by the checked-in benchmark tests (`pnpm test` runs them; outputs are logged with `[prefix-bench]`, `[render-items-bench]`):

| Hot path | Before | After | Speedup |
| --- | ---: | ---: | --- |
| Fallback height prefix rebuild per streaming session | 1029 ms | 225 ms | **4.6x** |
| Height-signature invalidation per commit | 0.0277 ms | 0.0009 ms | **32x** |
| Non-virtualized render-item maintenance per session | 170.7 ms | 4.6 ms | **36.8x** |
| custom-HTML stream session (parser regex reuse) | 166.7 ms | 153.7 ms | **−7.8%** |
| KaTeX burst renders (4 appends) | 4 requests | 1 request | **4x fewer** |

## Bundle size workflow (maintainers)

If you are changing code paths that can impact build size (renderers, code blocks, optional peers), run this flow before merging:

- `pnpm build:analyze` to produce visual reports (`bundle-visualizer.html` and `bundle-visualizer-tailwind.html`) and confirm what actually moved between chunks.
- `pnpm size:check` to enforce local size budgets for `dist`, largest JS chunk, and `npm pack --dry-run` output.
- Optional: tighten budgets in CI/locally with env vars like `MAX_DIST_BYTES`, `MAX_JS_CHUNK_BYTES`, `MAX_PACK_TGZ_BYTES`, `MAX_PACK_UNPACKED_BYTES`.

## Keeping a Steady, Typewriter-Style Stream

Some AI or LLM sources send content in large bursts, which can feel like the preview is freezing and then dumping a whole block. To keep the UI feeling like a smooth, continuous typewriter:

- **Enable `typewriter` only when you want a cursor; choose fade separately from pacing.** In Vue 3 (including Nuxt), `smooth-streaming` controls output pacing and `fade` controls opacity; they can be enabled together. `mode="chat"` keeps `fade=false` as a lightweight default. Add `fade` when gradual text reveal is desired; keep it off when animation cost matters more. Stable batches prevent append-driven animation restarts, but CSS animation and extra DOM still have a cost. Measure both enabled on your workload; fade-only benchmarks do not measure their combined cost.
- **Tune smooth streaming options for text pacing**: adjust `smooth-streaming-options` when a backend sends large bursts. Use batching props (`initialRenderBatchSize`, `renderBatchSize`, `renderBatchDelay`) for node mounting cadence when virtualization is disabled, not as the primary text pacing control.
- **Throttle upstream updates** if possible: instead of replacing `content` on every incoming hunk, debounce (50–100 ms) or split into smaller paragraphs so each render cycle operates on a “bite-sized” diff.
- **Defer heavy nodes** by keeping `deferNodesUntilVisible`/`viewportPriority` turned on; expensive blocks (Mermaid/enhanced code surfaces) will wait until they are near the viewport so the stream of text is never blocked.
- Set `viewportPriority={false}` when a document must render every heavy node immediately (for example, PDF/print capture). Standalone heavy node components are immediate by default because they have no viewport-priority provider.
- **Fall back for code blocks** when a burst happens: disable `codeBlockStream` or temporarily use `renderCodeBlocksAsPre` during streaming so that syntax-highlighting work does not stall text updates.

These knobs keep DOM work under a predictable budget, so users perceive a calm, steady flow of content even when the backend sends data in erratic bursts.

### Large code blocks: off-thread highlighting

`stream-diffs` highlights with Shiki on the main thread by default. Rendering a code block with tens of thousands of lines blocks scrolling and every other interaction for the whole tokenization pass. To move Shiki tokenization into Web Workers, inject an upstream `@pierre/diffs` `WorkerPoolManager` through `setStreamDiffsWorkerPool(...)`:

```ts
import { getOrCreateWorkerPoolSingleton } from '@pierre/diffs/worker'
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
import { setStreamDiffsWorkerPool } from 'markstream-vue'

setStreamDiffsWorkerPool(getOrCreateWorkerPoolSingleton({
  poolOptions: {
    poolSize: 4,
    workerFactory: () => new DiffsWorker(),
  },
  highlighterOptions: {
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
  },
}))
```

Notes:

- The host builds the pool with its own bundler (`?worker` in Vite) and must add `@pierre/diffs` as a direct dependency; markstream-vue only forwards it as the `workerManager` runtime option.
- `poolSize` is the number of parallel highlight workers. Each worker loads Shiki core, grammars, themes, and the oniguruma wasm, so memory grows with pool size; `min(4, hardwareConcurrency)` is a reasonable default.
- `CodeBlockNode` re-syncs the block's active theme to the pool via `setRenderOptions` on every theme change, so the pool theme above is only an initial value and never conflicts with `isDark`/`theme`/`themes`.
- Without an injected pool (or when the pool reports itself unavailable), highlighting falls back to the main thread automatically. A broken pool can never block rendering.
- The worker removes the tokenization cost from the main thread. DOM construction for very large blocks still runs on the main thread; for 100k+ line surfaces consider virtualized/windowed rendering.

Try this — tune rendering performance by enabling `viewportPriority`:

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Perf test'
</script>

<template>
  <MarkdownRender :content="md" :viewport-priority="true" />
</template>
```

For immediate rendering of every heavy node, use `<MarkdownRender :content="md" :viewport-priority="false" />`.

## Virtualization & DOM windows

`MarkdownRender` keeps a moving window of nodes in memory so extremely long documents stay responsive:

- `maxLiveNodes` defaults to `220` in `docs` mode and `0` in `chat` / `minimal` mode. Tune it only after measuring your layout: lower positive values reduce memory but require more placeholder churn, while higher values prioritize scrollback.
- `liveNodeBuffer` controls overscan on both sides of the focus window (default `60`). Increase it when nodes vary wildly in height to avoid visible pop-in while scrolling fast.
- `deferNodesUntilVisible` together with `viewportPriority` defers mounting heavy nodes (Mermaid, enhanced code surfaces, KaTeX) until an observer reports they are close to the viewport.
- `batchRendering`, `initialRenderBatchSize`, `renderBatchSize`, `renderBatchDelay`, and `renderBatchBudgetMs` govern how many nodes switch from placeholders to full components per frame. This incremental mode only runs when virtualization is disabled (`:max-live-nodes="0"`); otherwise the virtual window already limits DOM work, so nodes are rendered immediately without placeholders.

Example: Give the user a lighter DOM footprint while keeping scrollback smooth.

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Virtualized transcript'
</script>

<template>
  <MarkdownRender
    :content="md"
    :max-live-nodes="220"
    :live-node-buffer="40"
    :batch-rendering="true"
    :initial-render-batch-size="24"
    :render-batch-size="48"
    :render-batch-delay="24"
    :render-batch-budget-ms="8"
    :defer-nodes-until-visible="true"
    :viewport-priority="true"
  />
</template>
```

### Coordinating with an outer virtualizer

For a mixed AI conversation surface, prefer the zero-config timeline entry:

```vue
<MarkstreamVirtualTimeline
  :items="timelineItems"
  :thread-key="activeThreadId"
/>
```

If you customize timeline rows, bind `measureRef` to the element that contains the whole row chrome. The default Markdown row has no extra wrapper height, so unmeasured bubbles, avatars, or toolbars are not included in the outer item size:

```vue
<template v-slot:default="{ markdownProps, measureRef }">
  <article :ref="measureRef" class="message-bubble">
    <MarkdownRender v-bind="markdownProps" />
    <MessageToolbar />
  </article>
</template>
```

If your app already owns the outer virtualizer, use `useMarkstreamVirtualAdapter()` and bind its `markdownProps(item, index)` to each Markdown item. The raw `virtualScroll` prop remains available as the advanced protocol for custom adapters and debugging.

Final Markdown rows from `MarkstreamVirtualTimeline` and `useMarkstreamVirtualAdapter()` use node virtualization by default (`nodeVirtual: 'auto'`, `maxLiveNodes: 50`, `liveNodeBuffer: 16`) so restored chat transcripts do not mount the full Markdown DOM at once. If a row must expose the complete DOM for selection, external anchors, tests, or custom highlighters, override the bound props in a custom slot:

```vue
<template v-slot:default="{ markdownProps, measureRef }">
  <article :ref="measureRef" class="message-bubble">
    <MarkdownRender
      v-bind="{
        ...markdownProps,
        nodeVirtual: false,
        maxLiveNodes: 0,
      }"
    />
  </article>
</template>
```

With `useMarkstreamVirtualAdapter()`, apply the same override where you bind `adapter.markdownProps(item, index)`.

#### Thread restore loading

`MarkstreamVirtualTimeline` hides the restoring rows until the restored viewport is ready. You can customize the non-layout loading overlay with the `restore-loading` slot. The overlay is absolutely positioned inside the scroll root, so it does not change `scrollHeight` or item measurements.

```vue
<MarkstreamVirtualTimeline
  :items="timelineItems"
  :thread-key="activeThreadId"
  :initial-thread-state="savedThreadState"
>
  <template #restore-loading="{ threadKey }">
    <div class="thread-restore-loading">
      Restoring {{ threadKey }}…
    </div>
  </template>
</MarkstreamVirtualTimeline>
```

The slot should not contain elements that affect document layout. Avoid inserting loading rows into `items`; that changes item offsets and defeats scroll restoration.

#### Streaming stability

For bottom-pinned streaming, `scrollTop` may change as content grows. The stable invariant is `distanceFromBottom <= 1px`.

For non-bottom streaming, `scrollTop` and the current visible anchor should remain unchanged. If the actively streaming item itself is visible, its own height may grow unless the host buffers chunks or reserves a fixed height.

#### `vue-virtual-scroller` example

The playground includes a real runnable page: `playground/src/pages/virtual-scroller-markstream.vue` route `/virtual-scroller-markstream`. It uses `vue-virtual-scroller@3` `DynamicScroller` / `DynamicScrollerItem` and covers full Markdown syntax, Mermaid, KaTeX, rich code blocks, tables, HTML blocks, images, and footnotes. It is not pseudo-code.

Install the dependencies:

```bash
pnpm add vue-virtual-scroller markstream-vue mermaid katex stream-diffs
```

Entry imports:

```ts
import type {
  MarkstreamOuterVirtualizerAdapter,
  MarkstreamThreadVirtualState,
} from 'markstream-vue'
import type { CacheSnapshot, ScrollToOptions } from 'vue-virtual-scroller'
import MarkdownRender, { useMarkstreamVirtualAdapter } from 'markstream-vue'
import KatexWorker from 'markstream-vue/workers/katexRenderer.worker?worker&inline'
import { setKaTeXWorker } from 'markstream-vue/workers/katexWorkerClient'
import MermaidWorker from 'markstream-vue/workers/mermaidParser.worker?worker&inline'
import { setMermaidWorker } from 'markstream-vue/workers/mermaidWorkerClient'
import { computed, nextTick, reactive, ref } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'markstream-vue/index.css'
import 'katex/dist/katex.min.css'
import 'vue-virtual-scroller/index.css'

setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
```

The outer scroller adapter core:

```ts
const scrollerRef = ref<ScrollerHandle | null>(null)
const itemHeights = reactive(new Map<string, number>()) as Map<string, number>
const itemOffsets = reactive(new Map<string, number>()) as Map<string, number>
const savedThreadStates = new Map<ThreadId, SavedThreadState>()
const visibleRange = ref({ start: 0, end: 0 })
const widthBucket = ref(0)

const items = computed(() => threadItems[activeThreadId.value])
const measurementKey = computed(() => [
  'vue-virtual-scroller-demo',
  widthBucket.value,
].join(':'))

function getScrollElement() {
  const element = scrollerRef.value?.$el
  return element instanceof HTMLElement ? element : null
}

function rebuildOffsets() {
  let offset = 0
  itemOffsets.clear()

  for (const item of items.value) {
    itemOffsets.set(item.key, offset)
    offset += itemHeights.get(item.key) ?? estimateItemHeight(item)
  }
}

const virtualizer: MarkstreamOuterVirtualizerAdapter = {
  getScrollElement,
  getScrollTop: () => getScrollElement()?.scrollTop ?? 0,
  setScrollTop: value => scrollerRef.value?.scrollToPosition?.(value),
  getViewportHeight: () => getScrollElement()?.clientHeight ?? 0,
  getTotalHeight: () => getScrollElement()?.scrollHeight ?? 0,
  getItemOffset: key => itemOffsets.get(key) ?? 0,
  getItemSize: key => itemHeights.get(key) ?? 0,
  setItemSize(key, size) {
    const previous = itemHeights.get(key)
    if (previous != null && Math.abs(previous - size) < 0.5)
      return

    itemHeights.set(key, size)
    rebuildOffsets()

    void nextTick(() => {
      scrollerRef.value?.forceUpdate?.(false)
    })
  },
  getVisibleRange: () => visibleRange.value,
  scrollToOffset: offset => scrollerRef.value?.scrollToPosition?.(offset),
  scrollToIndex: (index, align = 'start') => scrollerRef.value?.scrollToItem?.(index, { align }),
  measureElement: () => {},
}

const adapter = useMarkstreamVirtualAdapter<TimelineItem>({
  items,
  threadKey: activeThreadId,
  getKey: item => item.key,
  getKind: item => item.kind,
  getContent: item => item.kind === 'assistant-markdown' ? item.content : '',
  getFinal: item => item.kind !== 'assistant-markdown' || item.final,
  getRevision: item => item.kind === 'assistant-markdown' ? item.revision : undefined,
  estimateItemHeight,
  measurementKey,
  virtualizer,
})
```

Template core:

```vue
<DynamicScroller
  ref="scrollerRef"
  class="message-scroller"
  :items="items"
  key-field="key"
  :min-item-size="72"
  :buffer="1800"
>
  <template #default="{ item, index, active }">
    <DynamicScrollerItem
      :item="item"
      :active="active"
      :index="index"
      tag="section"
    >
      <article
        :ref="el => adapter.measureItem(item, index, el)"
        class="timeline-row"
        :style="getRowStyle(item)"
      >
        <div v-if="item.kind === 'assistant-markdown'" class="assistant-bubble">
          <MarkdownRender
            v-bind="adapter.markdownProps(item, index)"
            :max-live-nodes="280"
            :live-node-buffer="80"
            :batch-rendering="true"
            :code-block-props="{
              showHeader: true,
              showCopyButton: true,
              showCollapseButton: true,
              showExpandButton: true,
            }"
          />
        </div>

        <div v-else class="message-bubble">
          {{ item.text ?? item.label ?? item.message }}
        </div>
      </article>
    </DynamicScrollerItem>
  </template>
</DynamicScroller>
```

When switching threads, save both the markstream state and the `vue-virtual-scroller` cache:

```ts
function readCacheSnapshot() {
  const snapshot = scrollerRef.value?.cacheSnapshot
  if (!snapshot)
    return null
  return 'value' in snapshot ? snapshot.value : snapshot
}

function rememberThreadState(threadId: ThreadId = activeThreadId.value) {
  savedThreadStates.set(threadId, {
    markstreamState: adapter.captureThreadState(),
    scrollerCache: readCacheSnapshot(),
  })
}

async function switchThread(threadId: ThreadId) {
  if (threadId === activeThreadId.value)
    return

  rememberThreadState()
  activeThreadId.value = threadId

  await nextTick()
  rebuildOffsets()

  const saved = savedThreadStates.get(threadId)
  if (saved) {
    scrollerRef.value?.restoreCache?.(saved.scrollerCache)
    adapter.restoreThreadState(saved.markstreamState)
  }
  else {
    adapter.restoreThreadState(null)
    scrollerRef.value?.scrollToPosition?.(0)
  }
}
```

Do not drop these parts:

- `:buffer="1800"` is px overscan, reducing long blank windows during fast scrollbar drags.
- `:min-item-size="72"` gives `DynamicScroller` a stable initial lower bound before measurements land.
- Put `measureItem()` on the outer timeline row, so assistant bubble padding, borders, headers, and footer actions are included in item height.
- Use adapter-stored height as `minHeight` in `getRowStyle(item)`, so the outer item is not under-reported while Markdown node virtualization is active.
- Keep `sessionKey = thread:item:revision` for content identity; keep `measurementKey` for layout state such as width bucket, font, theme, and density.
- Before switching threads, save `captureThreadState()` and `cacheSnapshot`; after switching, restore the scroller cache first, then restore the markstream anchor.

If a chat or thread list already virtualizes messages, keep that outer virtualizer in charge of which messages are mounted. Enable `virtual-scroll` only on large Markdown messages so `MarkdownRender` can report the message's logical height while it virtualizes nodes internally.

The important value is `metrics.totalHeight`. It represents the full Markdown document height, including virtual spacers; do not use the renderer element's current `offsetHeight` as the item size because only the live node window may be mounted.

When `virtualScroll.enabled=true`, pass a stable `sessionKey` that survives remounts and thread restores, such as `threadId:messageId:revision`. Bind `threadKey` to the message's own thread id, for example `threadKey: message.threadId`, rather than global active-thread state. Do not rely on the renderer's fallback id for persisted restore state.

When passing standalone `heightCache`, also pass `heightCacheWidth`; otherwise the cache is ignored to avoid reusing stale measurements after width changes.

`render-final` means this render session has passed the selected settle policy. For virtualized or offscreen nodes, `metrics.confidence` may still be `mixed`. Persist the height cache as authoritative only when `metrics.confidence` is `measured` or `final`, or when you persist the returned per-node `heightCache` together with `width`, `measurementKey`, and `contentHash`.

```vue
<script setup lang="ts">
import type {
  MarkstreamRendererHandle,
  MarkstreamVirtualMetrics,
  MarkstreamVirtualScrollOptions,
  MarkstreamVirtualState,
} from 'markstream-vue'
import MarkdownRender from 'markstream-vue'
import { computed, ref, shallowRef } from 'vue'

const scrollRoot = ref<HTMLElement | null>(null)
const renderer = shallowRef<MarkstreamRendererHandle | null>(null)
const savedState = shallowRef<MarkstreamVirtualState | null>(null)
const message = { threadId: 'thread-1', id: 'message-1' }
const content = ref('')
const sourceDone = ref(false)
const revision = ref(0)
const pendingTools = ref(false)
const theme = ref('light')
const density = ref('comfortable')
const fontScale = ref(1)
const codeBlockLineHeight = ref(20)

const virtualScroll = computed<MarkstreamVirtualScrollOptions>(() => ({
  enabled: true,
  sessionKey: `${message.threadId}:${message.id}:${revision.value}`,
  threadKey: message.threadId,
  scrollRoot: () => scrollRoot.value,
  restoreState: savedState.value,
  measurementKey: `${theme.value}:${density.value}:${fontScale.value}:${codeBlockLineHeight.value}`,
  settleMode: 'manual',
  settledToken: sourceDone.value && !pendingTools.value,
  emitIntervalMs: 32,
}))

function setMessageHeight(messageId: string, height: number) {
  // Forward this to your outer virtualizer, for example:
  // virtualizer.setItemSize(messageId, height)
}

function onHeightChange(metrics: MarkstreamVirtualMetrics) {
  setMessageHeight(message.id, metrics.totalHeight)
}

function mergeVirtualState(
  previous: MarkstreamVirtualState | null,
  next: MarkstreamVirtualState,
): MarkstreamVirtualState {
  if (next.heightCache?.length)
    return next

  if (
    previous?.heightCache?.length
    && previous.sessionKey === next.sessionKey
    && (previous.threadKey ?? '') === (next.threadKey ?? '')
    && (previous.measurementKey ?? '') === (next.measurementKey ?? '')
    && (!previous.contentHash || !next.contentHash || previous.contentHash === next.contentHash)
  ) {
    return {
      ...next,
      heightCache: previous.heightCache,
      width: previous.width || next.width,
      contentHash: previous.contentHash ?? next.contentHash,
      measurementKey: previous.measurementKey ?? next.measurementKey,
    }
  }

  return next
}

function onVirtualStateChange(state: MarkstreamVirtualState) {
  savedState.value = mergeVirtualState(savedState.value, state)
}
</script>

<template>
  <div ref="scrollRoot" class="thread-scroller">
    <MarkdownRender
      ref="renderer"
      :content="content"
      :final="sourceDone"
      :max-live-nodes="240"
      :live-node-buffer="50"
      :virtual-scroll="virtualScroll"
      @height-change="onHeightChange"
      @virtual-state-change="onVirtualStateChange"
    />
  </div>
</template>
```

With these knobs you can keep large AI transcripts or docs under a predictable CPU budget while still presenting consistent scroll behaviour.
