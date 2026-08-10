---
title: 流式代码块渲染
description: 渲染 LLM token 流中的代码块，支持稳定的未闭合 fence、Monaco 或 Shiki 高亮、diff 感知更新以及移动端友好回退。
lastUpdated: 2026-07-01
keywords:
  - 流式代码块渲染器
  - AI 代码块 Markdown
  - LLM 代码 fence 渲染器
  - Monaco 流式代码块
  - Shiki 流式 Markdown
faq:
  - question: 在闭合 fence 到达之前，Markstream 能渲染代码块吗？
    answer: 可以。它在流式期间保持未闭合 fence 可读，当 fence 足够完整时再升级到已配置的代码块渲染器。
  - question: AI 聊天应用应该对每个代码块都用 Monaco 吗？
    answer: 不一定。Monaco 适合丰富的交互式代码块；对于只读聊天、移动端 WebView 或严格的包体预算，Shiki 或 pre 渲染可能更好。
  - question: 应该如何测试流式代码块？
    answer: 用与生产环境流相同的节奏，测试未闭合 fence、语言标签变化、长代码块、diff fence 和快速 token 更新。
---
# 流式代码块渲染

代码 fence 是 AI 聊天中最明显的失败点之一。在生成期间，开始 fence 常常远早于闭合 fence 到达，语言标签或代码主体可能仍在变化。Markstream 把它当作一个流式状态来处理，而不是假定 Markdown 已经完整。

## 问题

静态 Markdown 渲染器可能让一个未完成的代码 fence 吞掉它下方的一切内容。在 AI 聊天中，这意味着在模型仍在书写时，普通段落、表格和后续文本可能暂时成为代码块的一部分。

````md
```ts
export function answer() {
  return "still streaming"
````

渲染器需要让这个状态保持可读，并避免在本应稳定之前产生昂贵的高亮器频繁重建。

## 渲染器选择

| 渲染器 | 最适合 | 说明 |
| --- | --- | --- |
| Monaco `CodeBlockNode` | 交互式或大型代码块 | 更重、类似编辑器，适合丰富的代码 UX |
| Shiki `MarkdownCodeBlockNode` | 只读的高亮代码 | 比 Monaco 更轻，适合文档和聊天 |
| 普通 `pre` | 移动端或严格包体预算 | 最可预测的回退 |

## 最小 Vue 设置

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

对于轻量级的 Shiki 渲染器，请安装 `stream-markdown`，并将代码块覆盖范围限定到该聊天界面：

```ts
import { MarkdownCodeBlockNode, setCustomComponents } from 'markstream-vue'

setCustomComponents('chat-code-blocks', {
  code_block: MarkdownCodeBlockNode,
})
```

```vue
<MarkdownRender
  custom-id="chat-code-blocks"
  mode="chat"
  :content="content"
  :final="isDone"
  :fade="false"
/>
```

对于移动端 WebView 或保守的包体，请使用普通 `pre` 渲染：

```vue
<MarkdownRender
  :content="content"
  :final="isDone"
  :render-code-blocks-as-pre="true"
/>
```

## 需要测试的流式状态

- 只有开始 fence 而没有闭合 fence
- 语言标签从空变为 `ts`、`tsx`、`vue` 或 `diff`
- 分小块流式传输的长代码块
- 含新增和删除行的 diff fence
- 在闭合 fence 到达之前，代码后跟着表格、Mermaid 或数学公式

## 性能说明

- 在渲染前批处理 token 更新；不要提交 SSE 或 WebSocket 流中的每个字节。
- 在聊天界面中保持 `fade` 禁用，以避免动画重启。
- 当长回答包含许多代码块时，使用视口优先级或虚拟化。
- 如果移动端用户只需要阅读代码，优先使用 `render-code-blocks-as-pre`。

## 相关指南

- [代码块渲染](/zh/guide/code-blocks)
- [CodeBlockNode](/zh/guide/code-block-node)
- [AI 聊天流式 Markdown](/zh/use-cases/ai-chat-streaming)
- [长 AI 回答](/zh/use-cases/long-ai-responses)
