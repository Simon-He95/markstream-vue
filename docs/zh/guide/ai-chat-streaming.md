---
title: AI 聊天与流式输出
description: 使用 content 与内置 smooth streaming 构建 AI 聊天与流式 Markdown 界面，并掌握性能、可信标签与 SSR 安全接入方式。
keywords:
  - AI 聊天
  - SSE 流式
  - smooth streaming
  - 流式 Markdown
---

# AI 聊天与流式输出

当你在做聊天界面、token 流式输出、SSE 响应预览，或者任何“用户正在看着内容持续变化”的 Markdown 场景时，就走这条路径。

<PrereqChips :items="[
  { text: 'Vue 快速开始', link: '/zh/guide/quick-start' },
  { text: '安装与可选依赖', link: '/zh/guide/installation' },
]" />

如果你的页面其实是静态文章、文档站或低频更新页面，请回到 [使用与流式渲染](/zh/guide/usage)，优先使用更简单的 `content` 路径。

## 1. 先选最小安装组合

| 需求 | 安装包 | 适合场景 |
| --- | --- | --- |
| 纯文本或轻量聊天界面 | `markstream-vue` | 基础 Markdown、列表、链接、引用 |
| 纯文本（SSR 友好）代码块 | `markstream-vue`（`render-code-blocks-as-pre`） | 较小 bundle、SSR 友好聊天记录 |
| 更强的代码交互 | `markstream-vue stream-diffs` | 复制、预览、语法高亮和 File/Diff surface |
| 聊天内容里有图表或公式 | `markstream-vue mermaid katex` | Mermaid 图表和 KaTeX 公式 |

只安装你预期回复里真的会出现的能力，对聊天界面的收益通常很大。

## 2. 推荐的数据流

对于高频 token 流，使用 `MarkdownRender` 内置的 smooth pacing。

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const streamedText = ref('')
const final = ref(false)
</script>

<template>
  <MarkdownRender
    mode="chat"
    :content="streamedText"
    :final="final"
  />
</template>
```

这样做的好处：

- Incoming chunk 可能是突发式的，但可见输出可以保持平稳。
- Backlog-aware pacing 在积压文本增多时会自动加速。
- 最终解析会等到可见内容追上后再触发，避免流结束时的不稳定状态。
- `mode="chat"` 会选择流式默认值，包括 `max-live-nodes="0"`、smooth pacing、增量批次和关闭 fade。
- 在 Vue 3（含 Nuxt）中，`smooth-streaming` 控制出字节奏，`fade` 控制透明度，两者可以同时开启。`mode="chat"` 保留 `fade=false` 作为轻量默认值；需要文字渐显时添加 `fade`，更看重动画成本时保持关闭。
- 只有需要作用域样式或组件覆盖时才添加 `custom-id="chat"`；只有需要可见光标时才添加 `typewriter`。

如果某个渲染面需要原始 chunk 节奏，可以用 `:smooth-streaming="false"` 关闭。如果你已经在 worker/store 中自行解析并需要 AST 控制，可以继续用 `nodes` + `final`。

## 3. 这几个渲染配置通常最稳

- 普通消息保持 `chat` preset。单条消息经过测量确认特别长时，可设置正数 `maxLiveNodes` 启用有界节点窗口；长消息列表则使用 `MarkstreamVirtualTimeline` 做时间线虚拟化。
- 如果代码块很多，但增强代码 surface 对当前聊天界面太重，可以先用 `renderCodeBlocksAsPre` 降级。
- 重型 peers 先别全装。聊天类页面最容易从“不默认带 Mermaid、KaTeX、`stream-diffs`”里拿到体积收益。
- `chat` preset 已经为 `max-live-nodes="0"` 选择了 batching 默认值；只有对真实负载做过 profiling 后才单独调这些参数。

## 4. 常见升级路径

### 直播聊天自动滚到底，但不要每个 token 都写滚动

如果聊天窗口要跟随最新 assistant 输出，使用 `useStickToBottom`。它会用 `requestAnimationFrame` 合并滚动写入，在布局触发的 scroll 事件中保留贴底意图，并在用户第一次向上滚轮、触摸、键盘或拖动滚动条时停止跟随。不要在每个 chunk 上调用 `scrollIntoView({ behavior: 'smooth' })`；流式输出时这会制造一堆互相打断的滚动动画。

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { useStickToBottom } from 'markstream-vue/utils'
import { computed, nextTick, ref, watch } from 'vue'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  final: boolean
}

const messages = ref<ChatMessage[]>([])
const scrollRoot = ref<HTMLElement | null>(null)
const contentRoot = ref<HTMLElement | null>(null)
const { bottomPinned, scheduleScrollToBottom } = useStickToBottom(scrollRoot, contentRoot)

const latestOutputSignal = computed(() => {
  const latest = messages.value[messages.value.length - 1]
  return latest
    ? `${messages.value.length}:${latest.id}:${latest.content.length}:${latest.final}`
    : '0'
})

watch(
  latestOutputSignal,
  async () => {
    await nextTick()
    scheduleScrollToBottom()
  },
  { flush: 'post' },
)
</script>

<template>
  <div ref="scrollRoot" class="chat-scroll" tabindex="0">
    <div ref="contentRoot" class="chat-list">
      <article
        v-for="message in messages"
        :key="message.id"
        class="chat-message"
        :class="`chat-message--${message.role}`"
      >
        <MarkdownRender
          v-if="message.role === 'assistant'"
          custom-id="chat"
          mode="chat"
          :content="message.content"
          :final="message.final"
          :smooth-streaming="message.final ? false : 'auto'"
          fade
          :typewriter="!message.final"
          v-bind="message.final ? {} : { maxLiveNodes: 0 }"
        />
        <p v-else class="user-text">
          {{ message.content }}
        </p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.chat-scroll {
  height: min(70vh, 720px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.chat-list {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.chat-message {
  max-width: min(720px, 88%);
}

.chat-message--user {
  align-self: flex-end;
}

.chat-message--assistant {
  align-self: flex-start;
}
</style>
```

关键点是：

- `latestOutputSignal` 只关注最后一条消息，避免长聊天记录在每个 token 上跑 deep watch。
- `nextTick()` 等当前 Vue render pass 完成后再读取 `scrollHeight`；后续 smooth-streaming 帧的高度变化由 `ResizeObserver` 继续处理。
- `requestAnimationFrame` 把多次 chunk 更新合并成每帧最多一次滚动写入。
- `ResizeObserver` 处理图片、KaTeX、代码块、字体等异步高度变化；前提是用户仍然贴底。
- `bottomPinned` 会在用户向上翻历史时关闭自动跟随，等用户回到底部附近再恢复。
- 如果挂载时已经有完整历史消息，要单独决定首帧跳到最新消息，还是恢复已保存的滚动位置。

长的混合 timeline 优先用内置虚拟列表。默认 `stick-to-bottom="auto"` 是同一类产品行为：贴底时跟随，用户手动翻历史时不抢滚动。

```vue
<MarkstreamVirtualTimeline
  :items="timelineItems"
  :thread-key="activeThreadId"
  stick-to-bottom="auto"
/>
```

### 更好的代码块

- 想要更轻的 surface：在 `MarkdownRender` 上设置 `render-code-blocks-as-pre`，输出纯 `<pre>`。
- 想要更强的预览 / diff / 交互：安装 `stream-diffs`，内置 `CodeBlockNode` 会自动使用。
- 想使用应用自有 renderer：用 `setCustomComponents` 注册带作用域的 `code_block`。Mermaid、D2 与 Infographic 使用各自的组件 key。

具体差异看 [渲染器与节点组件](/zh/guide/components)。

### `thinking` 这类可信标签

使用 `custom-html-tags` + `setCustomComponents('chat', mapping)`，让自定义标签只作用在聊天区域。

详见 [自定义标签与高级组件](/zh/guide/custom-components)。

### 只在一个消息区域里做覆盖

通过 `setCustomComponents('chat', { image: ChatImageNode })` 注册，再配合 `custom-id="chat"` 渲染。

详见 [覆盖内置组件](/zh/guide/component-overrides)。

## 5. CSS 与 SSR 检查清单

- 先引入 reset，再使用 `@import 'markstream-vue/index.css' layer(components);`
- 只有启用数学公式时，才额外导入 `katex/dist/katex.min.css`
- SSR 场景下，把 Mermaid、D2、增强代码 runtime 这类浏览器专属依赖放到 client-only 边界之后
- 如果样式串到别的区域，所有聊天界面的定制都收口到 `[data-custom-id="chat"]`

页面效果不对时，先从这里开始排： [故障排除](/zh/guide/troubleshooting#css-looks-wrong-start-here)

## 6. 手动使用 composable 搭配 `nodes`

如果你自己在 worker、store 或自定义 AST 管线中解析 `nodes`，`MarkdownRender` 内置的 smooth streaming **不会**启用——它只作用于 `content` 路径。你可以直接使用 `useSmoothMarkdownStream`，在解析前对原始文本做 pacing。

```ts
import { getMarkdown, parseMarkdownToStructure, useSmoothMarkdownStream } from 'markstream-vue'
import { ref, watch } from 'vue'

const stream = useSmoothMarkdownStream()

// 从事件源喂入新 chunk
eventSource.onmessage = (event) => {
  stream.enqueue(event.data)
}

eventSource.addEventListener('done', () => {
  stream.finish()
})

// 只解析可见部分；最终解析等 caughtUp 后再触发
declare const messageId: string
const md = getMarkdown(`chat-${messageId}`)
const nodes = ref([])

watch([stream.visible, stream.final], () => {
  nodes.value = parseMarkdownToStructure(stream.visible.value, md, {
    final: stream.final.value,
  })
})
```

该 composable 返回响应式 ref：`visible`、`source`、`caughtUp` 和 `final`。用 `visible` 渲染，等 `caughtUp` 为 `true` 后再认为流结束。

## 7. 流式输出 vs 恢复历史消息 —— 运行时切换 props

在聊天界面中，同一个 `MarkdownRender` 实例通常需要处理两种截然不同的模式：

- **流式输出**：模型正在实时生成 token — `content` 逐步增长，`final` 为 `false`。
- **恢复历史消息**：从缓存或存储中加载已完成的消息 — 完整的 Markdown 字符串一次性可用。

是否还在接收内容决定了 pacing 的选择。fade 是独立的视觉选择；下面的 Vue 3 示例在流式与历史展示期间都开启淡入。更看重动画成本时可以保持关闭。

### 流式输出（token 实时到达）

```vue
<MarkdownRender
  mode="chat"
  :content="streamedText"
  :final="false"
  smooth-streaming="auto"
  fade
  :typewriter="true"
  :max-live-nodes="0"
/>
```

- `smooth-streaming="auto"` 对可见输出进行 pacing，使突发式 chunk 平稳呈现。它已经在内容层实现了"文本逐步出现"的效果。
- `fade` 显式开启 Vue 3 的 200 ms 追加渐显，后续文字到达时，已有批次仍然自然完成。它可以与 pacing 同时使用；`mode="chat"` 默认关闭它以减少动画工作。
- `typewriter=true` 在流末尾添加闪烁光标。
- `max-live-nodes=0` 关闭虚拟化，启用流式场景下的增量/分批渲染。

### 恢复历史消息（完整 Markdown 一次性加载）

```vue
<MarkdownRender
  mode="chat"
  :content="historyText"
  :final="true"
  :smooth-streaming="false"
  :fade="true"
  :typewriter="false"
/>
```

- `smooth-streaming=false`，因为内容已经完整——pacing 会人为地拖慢一条用户希望立即看到的消息。
- `fade=true` 为每个段落和节点提供优雅的 opacity 入场动画（280 ms），这在内容只到达一次（而非每帧到达）时效果很好。
- `typewriter=false`——已完成的消息不需要光标。
- `final=true` 告知解析器这是完整文档，不会将末尾分隔符留在 loading 状态。

### 在一个组件中动态切换

典型模式是：一个 `MarkdownRender` 先以流式模式运行，当响应完成时切换到历史消息模式：

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { computed, ref } from 'vue'

const content = ref('')
const final = ref(false)
const isStreaming = computed(() => !final.value)
</script>

<template>
  <MarkdownRender
    custom-id="chat"
    mode="chat"
    :content="content"
    :final="final"
    :smooth-streaming="isStreaming ? 'auto' : false"
    fade
    :typewriter="isStreaming"
  />
</template>
```

当流结束时，设置 `final.value = true`。这个示例关闭 pacing 和光标，同时保持 `chat` mode 与 fade 选择不变；无需在流结束时反转 fade。已有内容不会为了重播动画而重新挂载，入场 fade 作用于新挂载的节点。若更看重动画成本，可以始终使用 `:fade="false"`。这些有界追加淡入细节仅适用于 Vue 3，不代表其他适配器的实现。

### 静态 / SSR 快照（无动画）

```vue
<MarkdownRender
  :content="staticText"
  :final="true"
  :smooth-streaming="false"
  :fade="false"
/>
```

零动画——适合服务端渲染输出、打印或 PDF 管线。

## 8. 什么时候不该走这条路径

- 更新频率不高、页面基本静态时，用 `content` 更简单
- 如果服务端或别的层已经接管 Markdown 解析，就直接用预解析后的 `nodes`
- 如果当前问题主要是 SSR / runtime 边界，而不是流式输出本身，优先看对应框架文档

## 下一步继续看

- [安装](/zh/guide/installation)：选 peers
- [使用与流式渲染](/zh/guide/usage)：理解 `content` vs `nodes`
- [性能](/zh/guide/performance)：处理更长的聊天记录
- [渲染器与节点组件](/zh/guide/components)：选择代码块 / 图表 / 公式组件
- [故障排除](/zh/guide/troubleshooting)：排 CSS、peers 和 SSR

<NextStep :items="[
  { text: '使用：content 与 nodes', link: '/zh/guide/usage' },
  { text: 'SSE 与 WebSocket Markdown', link: '/zh/use-cases/sse-websocket' },
  { text: '性能', link: '/zh/guide/performance' },
]" />
