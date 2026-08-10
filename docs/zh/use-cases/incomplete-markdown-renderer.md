---
title: 未闭合 Markdown 渲染器
description: 渲染 LLM token 流中的未闭合 Markdown，避免代码 fence 损坏、部分表格、无效数学公式或不稳定的 HTML 状态。
lastUpdated: 2026-07-01
keywords:
  - 未闭合 Markdown 渲染器
  - 部分 Markdown 渲染器
  - 未闭合代码 fence 渲染器
  - AI 聊天未闭合 Markdown
  - LLM 流式 Markdown 中间态
faq:
  - question: 为什么未闭合 Markdown 对 AI 聊天很重要？
    answer: LLM 输出在流的大部分时间内都是未完成的，因此用户已经阅读时，代码 fence、表格、数学公式、链接和 HTML 可能只写了一半。
  - question: Markstream 需要缓冲到最终消息为止吗？
    answer: 不需要。Markstream 可以在流式期间渲染有用的中间态，然后在 final 为 true 时稳定到最终的 Markdown 渲染。
  - question: 每个部分 token 都应该立即渲染吗？
    answer: 不建议。按动画帧或短间隔的节奏批处理小块 chunk，使解析和布局工作保持可预测。
---
# 未闭合 Markdown 渲染器

LLM 回复常常包含尚未完成的 Markdown。一条消息可能会在未闭合的代码 fence、部分表格行、写了一半的 KaTeX 表达式或没有闭合标签的 HTML 开始标签等状态下停留数秒。Markstream 就是为这些流式中间态而构建的。

## 问题

静态 Markdown 渲染器针对完整输入而优化。在 token 流期间，同样的内容可能反复改变形态：

| 部分输入 | 常见失败模式 |
| --- | --- |
| 未闭合的 <code>```ts</code> fence | 消息其余部分变成了代码块 |
| 部分表格表头行 | 部分表格在段落和表格之间闪烁 |
| `$$ E = mc` | 数学公式渲染器抛错或显示噪音错误 |
| `<details><summary>Plan` | HTML 解析可能产生不稳定输出 |

## 最小 Vue 示例

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'
import 'markstream-vue/index.css'

const content = ref('')
const isDone = ref(false)

async function appendChunk(chunk: string) {
  content.value += chunk
}
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

只有在流结束后才将 `final` 设为 `true`。这为解析器提供了一个明确的时点，把未闭合 fence、表格、数学公式和 HTML 稳定到最终渲染状态。

## 处理常见中间态

### 未闭合代码 fence

Markstream 让未闭合 fence 保持可读，而不是把文档其余部分当作最终的高亮代码来处理。当闭合 fence 到达时，代码块渲染器可以根据你的设置升级为 Monaco、Shiki 或普通 `pre` 块。

### 部分表格

在行数足够渲染出表格之前，不完整的表格语法会保持稳定。这避免了快速 LLM 流中出现的段落—表格—段落闪烁。

### 部分数学公式

KaTeX 渲染会推迟到行内或块级数学公式足够完整可解析时再进行。在未完成阶段，用户看到的是源码文本，而不是暂时的数学公式错误。

### 不完整 HTML

对于不可信的模型输出，使用 `htmlPolicy="escape"`，或者对受限渲染子集使用默认的安全策略。只有对你完全控制的内容才使用 `trusted`。

## 性能说明

- 缓冲非常小的 token，并按动画帧节奏提交。
- 在聊天界面中优先使用 `fade={false}` 或 `:fade="false"`，这样透明度动画不会在每次更新时重新启动。
- 只有当另一层已经负责解析、批处理或 worker 执行时才使用 `nodes` 路径。
- 对于持续增长到数十 KB 以上的长回答，请启用虚拟化。

## 何时不宜使用 Markstream

当内容总是简短、在显示前已完成、且从不包含 Mermaid、数学公式或代码等重型块时，使用更简单的渲染器。当 UI 必须在 Markdown 仍被书写时保持稳定，Markstream 最为有用。

## 相关指南

- [AI 聊天流式 Markdown](/zh/use-cases/ai-chat-streaming)
- [SSE 与 WebSocket Markdown 流式渲染](/zh/use-cases/sse-websocket)
- [流式代码块](/zh/use-cases/streaming-code-blocks)
- [安全](/zh/guide/security)
