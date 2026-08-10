---
title: LLM token 流 Markdown 渲染器
description: 无需等待最终回答即可渲染 LLM token 流中的 Markdown。了解 chunk 批处理、final 状态、未闭合 Markdown 处理，以及针对 SSE、WebSocket 和 fetch 流的渲染器设置。
lastUpdated: 2026-07-01
keywords:
  - LLM token 流 Markdown 渲染器
  - token 流 Markdown 渲染器
  - SSE token Markdown 渲染器
  - WebSocket token Markdown 渲染器
  - fetch 流 Markdown 渲染器
  - 未闭合 LLM Markdown
faq:
  - question: LLM 流的每个 token 都应该触发一次 Markdown 渲染吗？
    answer: 不建议。先缓冲小的 chunk，并按动画帧或短间隔的节奏提交，这样解析和布局才能保持可预测。
  - question: Markstream 要求特定的传输方式吗？
    answer: 不要求。渲染器接收 content 或 nodes，因此相同的渲染路径适用于 SSE、WebSocket、fetch 流或自定义传输。
  - question: token 流中的 final 是做什么的？
    answer: final 标记回答已完成的时点，允许未闭合 fence、表格、数学公式和重型块稳定到最终渲染状态。
---
# LLM token 流 Markdown 渲染器

LLM token 流不是完整的 Markdown。在回复的大部分生命周期内，文本可能包含未闭合的代码 fence、部分表格行、半截链接，或没有结束分隔符的 KaTeX 表达式。流式渲染器应当在不强迫应用缓冲整个回答的情况下，展示有用的中间状态。

## 与传输无关的渲染契约

Markstream 只需要两部分状态：

| 状态 | 含义 |
| --- | --- |
| `content` | 截至目前累积的 Markdown |
| `final` | 当前回答是否已完成 |

这个契约适用于 SSE、WebSocket、`fetch()` 流、worker 或任何自定义 token 源。

```vue
<MarkdownRender
  mode="chat"
  :content="content"
  :final="isDone"
  :fade="false"
/>
```

## 在渲染前批处理小块 chunk

快速流可能产生许多小块 chunk。在提交到 Vue 状态前先对它们进行批处理。

```ts
import { ref } from 'vue'

const content = ref('')
const pending = ref('')
const isDone = ref(false)

let frameId = 0

export function appendTokenChunk(chunk: string) {
  pending.value += chunk

  if (frameId)
    return

  frameId = requestAnimationFrame(() => {
    content.value += pending.value
    pending.value = ''
    frameId = 0
  })
}

export function flushTokenChunks() {
  if (!pending.value)
    return

  content.value += pending.value
  pending.value = ''

  if (frameId) {
    cancelAnimationFrame(frameId)
    frameId = 0
  }
}
```

这能让渲染器保持响应，同时又不把流隐藏在用户视线之外。

## Fetch 流示例

```ts
async function streamMarkdownResponse(response: Response) {
  const reader = response.body?.getReader()
  const decoder = new TextDecoder()

  if (!reader)
    return

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    appendTokenChunk(decoder.decode(value, { stream: true }))
  }

  const tail = decoder.decode()
  if (tail)
    appendTokenChunk(tail)

  flushTokenChunks()
  isDone.value = true
}
```

只有在循环结束、decoder 已 flush、且所有待处理的缓冲文本都已提交之后，才将 `final` 设为 `true`。

## Chunk 策略

| 流形态 | 推荐做法 |
| --- | --- |
| 每隔几百毫秒的大 chunk | 直接追加到 `content` |
| 每秒多次的小 chunk | 用 `requestAnimationFrame` 批处理 |
| 非常长的回复 | 启用节点虚拟化和视口优先级 |
| 已有解析 worker | 传入预解析的 `nodes` 而不是原始 `content` |

## 常见错误

- 把每个字节当作一次独立的 Vue 状态更新来渲染。
- 在服务端发送最后一块 chunk 之前就设置 `final=true`。
- 在向用户展示任何内容之前缓冲整个回答。
- 只有在少数回答需要时才全局启用重型可选 peer。
- 把 WebSocket、SSE 和 fetch 当作不同的渲染器问题，而不是不同的传输方式。

## 后续步骤

- 构建 Vue 聊天 UI？阅读 [Vue AI 聊天 Markdown 渲染器](/zh/use-cases/vue-ai-chat-markdown-renderer)。
- 使用 SSE 或 WebSocket 事件？阅读 [SSE 与 WebSocket 流式渲染](/zh/use-cases/sse-websocket)。
- 需要稳定的开放 fence 和表格？阅读 [未闭合 Markdown 渲染器](/zh/use-cases/incomplete-markdown-renderer)。
- 渲染长输出？阅读[长 AI 回答](/zh/use-cases/long-ai-responses)。
