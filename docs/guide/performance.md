---
title: Streaming Markdown performance tuning
description: Improve markstream-vue performance for streaming chat UIs, large documents, enhanced code blocks, and heavy Mermaid or KaTeX content.
ogImage: /og/performance.svg
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

## Bundle size workflow (maintainers)

If you are changing code paths that can impact build size (renderers, code blocks, optional peers), run this flow before merging:

- `pnpm build:analyze` to produce visual reports (`bundle-visualizer.html` and `bundle-visualizer-tailwind.html`) and confirm what actually moved between chunks.
- `pnpm size:check` to enforce local size budgets for `dist`, largest JS chunk, and `npm pack --dry-run` output.
- Optional: tighten budgets in CI/locally with env vars like `MAX_DIST_BYTES`, `MAX_JS_CHUNK_BYTES`, `MAX_PACK_TGZ_BYTES`, `MAX_PACK_UNPACKED_BYTES`.

## Keeping a Steady, Typewriter-Style Stream

Some AI or LLM sources send content in large bursts, which can feel like the preview is freezing and then dumping a whole block. To keep the UI feeling like a smooth, continuous typewriter:

- **Enable `typewriter` when you want a cursor, and keep `fade` disabled during smooth streaming**. `smooth-streaming="auto"` already paces the content layer; combining it with `fade` can replay opacity animation on every small commit and cause flicker. Use `fade=true` for completed history/static content that arrives all at once.
- **Tune smooth streaming options for text pacing**: adjust `smooth-streaming-options` when a backend sends large bursts. Use batching props (`initialRenderBatchSize`, `renderBatchSize`, `renderBatchDelay`) for node mounting cadence when virtualization is disabled, not as the primary text pacing control.
- **Throttle upstream updates** if possible: instead of replacing `content` on every incoming hunk, debounce (50–100 ms) or split into smaller paragraphs so each render cycle operates on a “bite-sized” diff.
- **Defer heavy nodes** by keeping `deferNodesUntilVisible`/`viewportPriority` turned on; expensive blocks (Mermaid/enhanced code surfaces) will wait until they are near the viewport so the stream of text is never blocked.
- Set `viewportPriority={false}` when a document must render every heavy node immediately (for example, PDF/print capture). Standalone heavy node components are immediate by default because they have no viewport-priority provider.
- **Fall back for code blocks** when a burst happens: disable `codeBlockStream` or temporarily use `renderCodeBlocksAsPre` during streaming so that syntax-highlighting work does not stall text updates.

These knobs keep DOM work under a predictable budget, so users perceive a calm, steady flow of content even when the backend sends data in erratic bursts.

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

- `maxLiveNodes` (default `220`) caps how many fully rendered nodes remain in the DOM. Tune this based on your layout — lower values reduce memory but require slightly more placeholder churn; higher values prioritise scrollback.
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
