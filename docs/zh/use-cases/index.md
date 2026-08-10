---
title: AI 流式 Markdown 使用场景
lastUpdated: 2026-07-01
description: 探索 Markstream 的典型使用场景：AI 聊天流式渲染、SSE/WebSocket 流式 Markdown、渐进式 Mermaid 与 KaTeX、长 AI 回答渲染以及移动端 WebView 渲染。
keywords:
  - AI 流式 Markdown 使用场景
  - AI 聊天流式 Markdown 渲染
  - SSE WebSocket Markdown 渲染
  - 流式 Mermaid 与 KaTeX
  - 长 AI 回答渲染
---
# AI 流式 Markdown 使用场景

Markstream 专为 Markdown 逐块到达的场景而设计。以下是最常见的使用场景。

## AI 聊天与 LLM 流式渲染

- [Vue AI 聊天 Markdown 渲染器](/zh/use-cases/vue-ai-chat-markdown-renderer) — 为 LLM token 流构建 Vue 3 和 Nuxt 聊天界面
- [LLM token 流 Markdown](/zh/use-cases/llm-token-stream-markdown) — 批处理并渲染来自 SSE、WebSocket、fetch 流或自定义传输的 chunk
- [AI 聊天流式 Markdown](/zh/use-cases/ai-chat-streaming) — 在 Vue、React、Svelte 和 Angular 中渲染 LLM token 流
- [SSE 与 WebSocket 流式渲染](/zh/use-cases/sse-websocket) — 处理 Server-Sent Events 和 WebSocket 的 Markdown 输出
- [未闭合 Markdown 渲染器](/zh/use-cases/incomplete-markdown-renderer) — 在回复仍处于流式阶段时，保持未闭合 fence、部分表格、数学公式和 HTML 稳定
- [流式代码块](/zh/use-cases/streaming-code-blocks) — 为逐 token 到达的代码 fence 选择 Monaco、Shiki 或普通 `pre` 渲染

## 渐进式重型块

- [流式 Mermaid 与 KaTeX](/zh/use-cases/streaming-mermaid-katex) — 在流式渲染期间增量绘制图表和数学公式

## 大规模性能

- [长 AI 回答](/zh/use-cases/long-ai-responses) — 为 50 KB 以上的 AI 输出提供虚拟化渲染

## 按框架快速参考

| 框架 | 包 | AI 聊天 | SSE/WS | Mermaid/KaTeX | 长文档 |
| --- | --- | --- | --- | --- | --- |
| Vue 3 / Nuxt | `markstream-vue` | ✅ | ✅ | ✅ | ✅ |
| React / Next.js | `markstream-react` | ✅ | ✅ | ✅ | ✅ |
| Svelte 5 | `markstream-svelte` | ✅ | ✅ | ✅ | ✅ |
| Angular | `markstream-angular` | ✅ | ✅ | ✅ | ✅ |
| Vue 2 | `markstream-vue2` | ✅ | ✅ | ✅ | Partial |

## 参见

- [对比 Markstream 与其他方案](/compare/)
- [框架专属指南](/zh/guide/)
- [按场景安装](/zh/guide/installation)
