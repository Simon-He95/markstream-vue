---
description: 优化 markstream-vue 在流式聊天、大文档、增强代码块以及 Mermaid 和 KaTeX 重内容场景下的性能表现。
ogImage: /og/performance.svg
ogImageAlt: Markstream 流式 Markdown 性能调优
---

# 性能特性与建议

本渲染器针对流式与大型文档进行优化。

关键功能：

- 针对代码块的增量解析
- 最小化的 DOM 更新与内存优化
- 增强代码块的流式更新
- 渐进式 Mermaid 渲染

性能建议：

- 将长文档分块流式传输，避免阻塞主线程
- 对只读代码块使用 `renderCodeBlocksAsPre`
- 使用 `setDefaultMathOptions` 在应用启动时设置数学渲染默认项
- 对重型节点启用 `viewportPriority`（默认开启）以延迟离屏工作

更多详细信息见 `/zh/guide/performance`。

## 1.0 Benchmark

发布 1.0 前运行：

```bash
pnpm benchmark:1.0
```

它会构建 playground，通过 `vite preview` 跑 Diagnostic Studio baseline/thinking/diff/stress、主 playground reverse-flex chat 场景，以及百万字符恢复与脚本滚动的真实浏览器 Web Vitals probe，并在 `benchmark/` 下生成 JSON 与 Markdown 报告，包含环境披露、LCP、CLS、settle time、p95 `requestAnimationFrame` interval、long task、page 与 renderer DOM 节点数、fallback、重节点 readiness、滚动漂移和 Chrome-only best-effort 的 renderer unmount + GC 后 heap 等指标。1000 code blocks、100 Mermaid、10k nodes 这类 synthetic 场景属于后续 1.0.x 覆盖，未接入脚本前不要作为 1.0 release evidence。

## 包体积优化流程（维护者）

当你修改可能影响构建体积的路径（渲染器、代码块、可选 peer）时，建议在合并前执行：

- `pnpm build:analyze`：生成可视化报告（`bundle-visualizer.html`、`bundle-visualizer-tailwind.html`），确认体积变化是“落在哪个 chunk”。
- `pnpm size:check`：本地执行体积预算守卫，覆盖 `dist` 总量、最大 JS chunk，以及 `npm pack --dry-run` 的 tarball/unpacked 体积。
- 可选：通过环境变量收紧预算（`MAX_DIST_BYTES`、`MAX_JS_CHUNK_BYTES`、`MAX_PACK_TGZ_BYTES`、`MAX_PACK_UNPACKED_BYTES`）。

## 让渲染保持稳定的“逐步更新”

有些 LLM 会一次推送大量文本，导致前端表现为“卡顿一会儿再一次性显示”。想让用户始终看到稳定、连续的输出，可以：

- **需要光标时显式开启 `typewriter`，并在 smooth streaming 期间关闭 `fade`**。`smooth-streaming="auto"` 已经在内容层完成 pacing；再叠加 `fade` 会让每个小提交都重新触发 opacity 动画，容易产生闪烁。`fade=true` 更适合完整历史消息或静态内容一次性进入的场景。
- **用 smooth streaming options 调整文本 pacing**：后端一次推送大段文本时，优先调整 `smooth-streaming-options`。`initialRenderBatchSize` / `renderBatchSize` / `renderBatchDelay` 这类 batching props 主要控制关闭虚拟化时的节点挂载节奏，不是主要的文本 pacing 控制。
- **在上游做节流或拆包**：把后端一次性推送的大段文本按段落拆分，或用 50–100 ms 的防抖再更新 `content`，减少一次性 diff。
- **保留延迟可见渲染**：继续启用 `deferNodesUntilVisible` / `viewportPriority`，避免 Mermaid、增强代码 surface 这类重型节点阻塞文字流。
- 如果 PDF、打印或截图必须立即得到所有重节点，可以设置 `:viewport-priority="false"`；单独导入并挂载重节点组件时默认也是立即渲染，因为不存在 viewport-priority provider。
- **必要时降级代码块**：在突发大块传输时暂时关闭 `codeBlockStream` 或启用 `renderCodeBlocksAsPre`，避免语法高亮抢占时间片。

这些组合可以把 DOM 工作量稳定在可控范围，哪怕服务端一次发送很多文本，用户也会感知为持续、丝滑的逐步输出。

## 虚拟化与 DOM 窗口

`MarkdownRender` 会维护一个滑动窗口，只让一部分节点常驻 DOM，从而在极长的对话或文档中保持流畅：

- `maxLiveNodes`（默认 `220`）定义了 DOM 中最多保留多少个已完全渲染的节点。减小可以省内存、增大可以保留更多回溯内容。
- `liveNodeBuffer` 控制窗口前后的超前/超后范围（默认 `60`）。如果节点高度差异巨大，可增大该值以避免快速滚动时闪烁。
- `deferNodesUntilVisible` 搭配 `viewportPriority` 使用，可以让 Mermaid、增强代码 surface、KaTeX 等重型节点在进入视口之前保持占位骨架。
- `batchRendering` 以及 `initialRenderBatchSize`、`renderBatchSize`、`renderBatchDelay`、`renderBatchBudgetMs` 控制每一帧有多少节点从占位态切换为真实组件。该增量模式仅在关闭虚拟化（`:max-live-nodes="0"`）时生效；默认开启虚拟化时，所有节点会立即渲染，依靠窗口裁剪来限制 DOM 工作量。

示例：在保持可滚动回溯的同时降低 DOM 开销。

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

### 与外层 virtualizer 协作

混合 AI conversation surface 优先使用 0 配置 timeline 入口：

```vue
<MarkstreamVirtualTimeline
  :items="timelineItems"
  :thread-key="activeThreadId"
/>
```

自定义 timeline row 时，把 `measureRef` 绑定到包含整行 chrome 的元素上。默认 Markdown row 没有额外 wrapper 高度；如果 bubble、avatar、toolbar 没有被测量，它们不会计入外层 item size：

```vue
<template v-slot:default="{ markdownProps, measureRef }">
  <article :ref="measureRef" class="message-bubble">
    <MarkdownRender v-bind="markdownProps" />
    <MessageToolbar />
  </article>
</template>
```

如果业务已经有自己的外层 virtualizer，使用 `useMarkstreamVirtualAdapter()`，并把 `markdownProps(item, index)` 绑定到 Markdown item。底层 `virtualScroll` prop 继续作为高级 adapter/debug 协议保留。

`MarkstreamVirtualTimeline` 和 `useMarkstreamVirtualAdapter()` 产出的 final Markdown row 默认会使用 node virtualization（`nodeVirtual: 'auto'`、`maxLiveNodes: 50`、`liveNodeBuffer: 16`），这样恢复聊天记录时不会一次性挂载完整 Markdown DOM。如果某一行必须暴露完整 DOM 给选择复制、外部锚点、测试或自定义高亮逻辑，可以在自定义 slot 里覆盖绑定的 props：

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

使用 `useMarkstreamVirtualAdapter()` 时，在绑定 `adapter.markdownProps(item, index)` 的位置应用同样的覆盖即可。

#### Thread restore loading

`MarkstreamVirtualTimeline` 会隐藏正在恢复的真实 rows，直到已恢复 viewport 准备就绪。你可以用 `restore-loading` slot 自定义不参与布局的 loading overlay。这个 overlay 以 absolute 方式定位在 scroll root 内，因此不会改变 `scrollHeight` 或 item 测量值。

```vue
<MarkstreamVirtualTimeline
  :items="timelineItems"
  :thread-key="activeThreadId"
  :initial-thread-state="savedThreadState"
>
  <template #restore-loading="{ threadKey }">
    <div class="thread-restore-loading">
      正在恢复 {{ threadKey }}…
    </div>
  </template>
</MarkstreamVirtualTimeline>
```

这个 slot 不应该包含会影响文档布局的元素。不要把 loading row 插入到 `items` 中；那会改变 item offsets，让滚动恢复失效。

#### Streaming 稳定性

底部 pinned streaming 时，内容增长会让 `scrollTop` 变化；稳定性不变量是 `distanceFromBottom <= 1px`。

非底部 streaming 时，`scrollTop` 和当前可见 anchor 应保持不变。如果正在 streaming 的 item 本身可见，除非宿主侧缓冲 chunks 或预留固定高度，否则该 item 自身高度仍可能增长。

#### `vue-virtual-scroller` 示例

playground 里有一个真实可运行的完整页面：`playground/src/pages/virtual-scroller-markstream.vue`（路由 `/virtual-scroller-markstream`）。它使用 `vue-virtual-scroller@3` 的 `DynamicScroller` / `DynamicScrollerItem`，并覆盖完整 Markdown 语法、Mermaid、KaTeX、富代码块、表格、HTML block、图片和脚注，不是简化伪代码。

安装依赖：

```bash
pnpm add vue-virtual-scroller markstream-vue mermaid katex stream-diffs
```

入口导入：

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

外层 scroller adapter 的关键部分：

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

模板核心：

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

切换 thread 时同时保存 markstream 状态和 `vue-virtual-scroller` 的 cache：

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

这个组合里几个值不要删：

- `:buffer="1800"` 是 px overscan，快速拖滚动条时减少长时间空窗。
- `:min-item-size="72"` 给 `DynamicScroller` 初始测量前的下限，避免第一屏滚动数学太离谱。
- `measureItem()` 必须挂在 timeline row 外层，assistant bubble 的 padding、border、header、footer actions 才会计入高度。
- `getRowStyle(item)` 使用 adapter 记录的高度作为 `minHeight`，避免 Markdown node virtual 期间外层 item size 被低估。
- `sessionKey = thread:item:revision` 仍然由 adapter 生成；`measurementKey` 只放布局相关状态，例如宽度 bucket、字体、主题、密度。
- 切 thread 前保存 `captureThreadState()` 和 `cacheSnapshot`，切换后先恢复 scroller cache，再恢复 markstream anchor，滚动条位置和界面都更稳。

如果聊天列表或 thread 列表本身已经按 message 做 virtual-scroll，外层 virtualizer 仍然负责决定哪些 message mount。只在超大的 Markdown message 上开启 `virtual-scroll`，让 `MarkdownRender` 在内部裁剪节点 DOM 的同时，把该 message 的逻辑高度报告给外层。

关键值是 `metrics.totalHeight`。它表示包含 virtual spacer 在内的完整 Markdown 逻辑高度；不要把 renderer 元素当前的 `offsetHeight` 当成 item size，因为当前 DOM 可能只挂载了 live window 内的节点。

当 `virtualScroll.enabled=true` 时，请传入可跨 remount 和 thread restore 保持稳定的 `sessionKey`，例如 `threadId:messageId:revision`。`threadKey` 应该绑定到 message 自身的 thread id，例如 `threadKey: message.threadId`，而不是全局 active thread 状态。不要依赖 renderer fallback id 来持久化恢复状态。

单独传 `heightCache` 时必须同时传 `heightCacheWidth`；否则组件会忽略该缓存，以避免容器宽度变化后复用过期高度。

`render-final` 表示当前 render session 已通过 settle 策略，不等于所有离屏虚拟节点都已经真实测量。虚拟化或离屏节点存在时，`metrics.confidence` 可能仍是 `mixed`。只有在 `metrics.confidence` 为 `measured` / `final`，或同时持久化返回的 per-node `heightCache`、`width`、`measurementKey`、`contentHash` 时，才建议把该高度缓存作为权威缓存。

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
  // 传给你的外层 virtualizer，例如：
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

利用这些旋钮，可以把超长 AI 对话或技术文档维持在一个稳定的 CPU / 内存预算中，同时保持滚动与输入的流畅体验。
