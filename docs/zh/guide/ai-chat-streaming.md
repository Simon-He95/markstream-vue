---
description: 使用 content 与内置 smooth streaming 构建 AI 聊天与流式 Markdown 界面，并掌握性能、可信标签与 SSR 安全接入方式。
---

# AI 聊天与流式输出

当你在做聊天界面、token 流式输出、SSE 响应预览，或者任何“用户正在看着内容持续变化”的 Markdown 场景时，就走这条路径。

如果你的页面其实是静态文章、文档站或低频更新页面，请回到 [使用与流式渲染](/zh/guide/usage)，优先使用更简单的 `content` 路径。

## 1. 先选最小安装组合

| 需求 | 安装包 | 适合场景 |
| --- | --- | --- |
| 纯文本或轻量聊天界面 | `markstream-vue` | 基础 Markdown、列表、链接、引用 |
| 不用 Monaco 的代码高亮 | `markstream-vue stream-markdown` | SSR 友好的聊天记录、较小 bundle |
| 更强的代码交互 | `markstream-vue stream-monaco` | 复制、预览、diff、Monaco 代码块 |
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
    custom-id="chat"
    :content="streamedText"
    :final="final"
    :max-live-nodes="0"
    :batch-rendering="true"
    :render-batch-size="16"
    :render-batch-delay="8"
    :render-batch-budget-ms="4"
    :fade="false"
    :typewriter="true"
  />
</template>
```

这样做的好处：

- Incoming chunk 可能是突发式的，但可见输出可以保持平稳。
- Backlog-aware pacing 在积压文本增多时会自动加速。
- 最终解析会等到可见内容追上后再触发，避免流结束时的不稳定状态。
- `custom-id="chat"` 给了你一个安全的作用域，用来定制聊天界面样式或替换单个节点。
- 默认 `smooth-streaming="auto"` 已经在 `typewriter` 开启或 `max-live-nodes <= 0` 时自动启用 smooth pacing。只有在需要首屏内容也从空白开始 pacing 时才用 `:smooth-streaming="true"`——这会跳过 mounted 门控，在 SSR 场景下可能导致 hydration 不匹配或空白闪烁。

如果某个渲染面需要原始 chunk 节奏，可以用 `:smooth-streaming="false"` 关闭。如果你已经在 worker/store 中自行解析并需要 AST 控制，可以继续用 `nodes` + `final`。

## 3. 这几个渲染配置通常最稳

- 长聊天记录优先保留默认虚拟化；只有在你有明确性能测量时再去调 `maxLiveNodes`。
- 如果代码块很多，但 Monaco 对当前聊天界面太重，可以先用 `renderCodeBlocksAsPre` 降级。
- 重型 peers 先别全装。聊天类页面最容易从“不默认带 Mermaid、KaTeX、Monaco”里拿到体积收益。
- 如果你关闭虚拟化（`:max-live-nodes="0"`），那 [Props 与选项](/zh/guide/props) 里的 batching 相关配置就会更重要。

## 4. 常见升级路径

### 更好的代码块

- 想要更轻的文档风格：用 `MarkdownCodeBlockNode`，配 `stream-markdown`
- 想要更强的预览 / diff / 交互：用 `CodeBlockNode`，配 `stream-monaco`

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
- SSR 场景下，把 Mermaid、D2、Monaco 这类浏览器专属依赖放到 client-only 边界之后
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
const md = getMarkdown('chat')
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

这两种模式需要不同的 `smooth-streaming` 和 `fade` 组合：

### 流式输出（token 实时到达）

```vue
<MarkdownRender
  :content="streamedText"
  :final="false"
  smooth-streaming="auto"
  :fade="false"
  :typewriter="true"
  :max-live-nodes="0"
/>
```

- `smooth-streaming="auto"` 对可见输出进行 pacing，使突发式 chunk 平稳呈现。它已经在内容层实现了"文本逐步出现"的效果。
- `fade=false`，因为 280 ms 的 opacity 动画与高频 smooth-streaming 更新冲突——每个小批量内容都会打断上一帧的 fade，导致闪烁而非平滑淡入。
- `typewriter=true` 在流末尾添加闪烁光标。
- `max-live-nodes=0` 关闭虚拟化，启用流式场景下的增量/分批渲染。

### 恢复历史消息（完整 Markdown 一次性加载）

```vue
<MarkdownRender
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
    :content="content"
    :final="final"
    :smooth-streaming="isStreaming ? 'auto' : false"
    :fade="!isStreaming"
    :typewriter="isStreaming"
    :max-live-nodes="isStreaming ? 0 : undefined"
  />
</template>
```

当流结束时，设置 `final.value = true`。渲染器会立即从 smooth pacing + 无 fade 切换到无 pacing + 淡入，使历史消息获得干净的入场动画，而不会出现两者同时开启时产生的闪烁。

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
