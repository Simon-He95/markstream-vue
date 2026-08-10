---
title: Vue AI 聊天 Markdown 流式渲染
description: 使用 markstream-vue 构建 Vue 3 AI 聊天 Markdown 渲染器，处理 LLM token 流、未闭合 Markdown、SSE/WebSocket 更新、安全 HTML、代码块、Mermaid、KaTeX 与长回答。
lastUpdated: 2026-07-01
keywords:
  - Vue AI 聊天 Markdown 渲染器
  - Vue LLM Markdown 渲染器
  - Vue SSE Markdown 渲染器
  - Vue WebSocket Markdown 渲染器
  - Vue 流式 Markdown 聊天
  - markstream-vue AI 聊天
softwareName: markstream-vue
softwarePackage: markstream-vue
npmPackage: markstream-vue
softwareFramework: Vue
softwareProgrammingLanguage:
  - TypeScript
  - Vue
softwareRuntimePlatform:
  - Vue 3
  - Nuxt
faq:
  - question: markstream-vue 能用于 SSE 和 WebSocket 聊天流吗？
    answer: 可以。将流式返回的 chunk 追加到不断增长的 content 字符串中，在回复仍在到达时保持 final 为 false，当流结束时将 final 设为 true。
  - question: 模型仍在书写时，它能渲染未闭合的代码 fence 吗？
    answer: 可以。markstream-vue 能保持未闭合的 Markdown 状态可读，包括未闭合 fence、部分表格、数学公式和类似 HTML 的标签。
  - question: 我应该把 markstream-vue 用于静态 Vue Markdown 吗？
    answer: 对于简短、静态的 Markdown 使用更简单的渲染器。当 AI 聊天流式渲染、未闭合状态、重型块或长回答很重要时，再使用 markstream-vue。
---
# Vue AI 聊天 Markdown 流式渲染

`markstream-vue` 是用于 AI 聊天界面的 Vue 3 渲染器，在 LLM 回复仍在流式输出时 Markdown 就可见。当消息可能包含代码 fence、表格、Mermaid 图、KaTeX 数学公式或长推理输出，且最终 chunk 尚未到达时，它非常有用。

## 安装

```bash
pnpm add markstream-vue
```

```ts
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'
```

在宿主应用会修改根字体缩放的移动端 WebView 中，请使用 `index.px.css` 而不是 `index.css`。

## 最小 Vue 聊天消息

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

defineProps<{
  content: string
  isDone: boolean
}>()
</script>

<template>
  <MarkdownRender
    mode="chat"
    :content="content"
    :final="isDone"
    :fade="false"
  />
</template>
```

两个关键 props 是 `content` 和 `final`。在流式进行期间持续向 `content` 追加文本。只有当模型已结束时才将 `final` 设为 `true`，这样开放的 fence、表格、数学公式和重型块才能稳定到最终渲染状态。

## SSE 聊天流示例

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import 'markstream-vue/index.css'

const content = ref('')
const isDone = ref(false)

let source: EventSource | null = null

onMounted(() => {
  source = new EventSource('/api/chat/stream')
  source.onmessage = (event) => {
    if (event.data === '[DONE]') {
      isDone.value = true
      source?.close()
      return
    }

    const data = JSON.parse(event.data) as { content?: string }
    content.value += data.content ?? ''
  }
})

onBeforeUnmount(() => {
  source?.close()
})
</script>

<template>
  <MarkdownRender
    mode="chat"
    :content="content"
    :final="isDone"
    smooth-streaming="auto"
    :fade="false"
  />
</template>
```

## 这在 AI 聊天中解决了什么

| 流式状态 | 用户应当看到的 |
| --- | --- |
| 未闭合的 <code>```ts</code> fence | 稳定的可读代码块状态，而不是消息其余部分被意外吞掉 |
| 部分表格语法 | 不会在段落和表格之间闪烁的文本 |
| 部分 KaTeX | 在表达式足够完整以渲染之前的源码文本 |
| 仍在增长的 Mermaid 图 | 当图表语法稳定后进行的渐进式渲染 |
| 长推理回答 | 启用虚拟化后有界的 live 节点和视口感知的重型块 |

## 安全 HTML 策略

LLM 输出是外部内容。除非你的服务端完全控制 Markdown，否则请从转义或安全的 HTML 开始。

```vue
<MarkdownRender
  mode="chat"
  :content="content"
  :final="isDone"
  html-policy="escape"
/>
```

当你希望为模型特定的 UI（如 `thinking`）提供额外能力，又不想启用原始 HTML 时，请为可信标签使用自定义组件。

## 何时应避免使用 markstream-vue

当内容简短、在显示前已完成、且从不包含重型块或长时间流式状态时，使用更小的静态渲染器。当用户阅读回答的同时它还在书写时，`markstream-vue` 才体现出价值。

## 后续步骤

- 渲染原始 LLM chunk？阅读 [LLM token 流 Markdown](/zh/use-cases/llm-token-stream-markdown)。
- 传输是 SSE 或 WebSocket？阅读 [SSE 与 WebSocket 流式渲染](/zh/use-cases/sse-websocket)。
- 比较 Vue 方案？阅读 [markstream-vue vs vue-stream-markdown](/compare/vue-stream-markdown)。
- 处理长回答？阅读[长 AI 回答](/zh/use-cases/long-ai-responses)。
