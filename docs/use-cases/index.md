---
title: AI streaming Markdown use cases
description: "Explore Markstream use cases: AI chat streaming, SSE/WebSocket Markdown, progressive Mermaid and KaTeX, long AI responses, and mobile WebView rendering."
---
# Use cases

Markstream is designed for scenarios where Markdown arrives incrementally. Here are the most common use cases.

## AI chat and LLM streaming

- [Vue AI chat Markdown renderer](/use-cases/vue-ai-chat-markdown-renderer) — build Vue 3 and Nuxt chat surfaces for LLM token streams
- [LLM token stream Markdown](/use-cases/llm-token-stream-markdown) — batch and render chunks from SSE, WebSocket, fetch streams, or custom transports
- [AI chat streaming Markdown](/use-cases/ai-chat-streaming) — render LLM token streams in Vue, React, Svelte, and Angular
- [SSE and WebSocket streaming](/use-cases/sse-websocket) — handle Server-Sent Events and WebSocket Markdown output
- [Incomplete Markdown renderer](/use-cases/incomplete-markdown-renderer) — keep unclosed fences, partial tables, math, and HTML stable while a response is still streaming
- [Streaming code blocks](/use-cases/streaming-code-blocks) — render code fences that arrive token by token with an enhanced `stream-diffs` surface or plain `pre` fallback

## Progressive heavy blocks

- [Streaming Mermaid and KaTeX](/use-cases/streaming-mermaid-katex) — render diagrams and math incrementally during streaming

## Performance at scale

- [Long AI responses](/use-cases/long-ai-responses) — virtualized rendering for 50 KB+ AI output

## Quick reference by framework

| Framework | Package | AI chat | SSE/WS | Mermaid/KaTeX | Long docs |
| --- | --- | --- | --- | --- | --- |
| Vue 3 / Nuxt | `markstream-vue` | ✅ | ✅ | ✅ | ✅ |
| React / Next.js | `markstream-react` | ✅ | ✅ | ✅ | ✅ |
| Svelte 5 | `markstream-svelte` | ✅ | ✅ | ✅ | ✅ |
| Angular | `markstream-angular` | ✅ | ✅ | ✅ | ✅ |
| Vue 2 | `markstream-vue2` | ✅ | ✅ | ✅ | Partial |

## See also

- [Compare Markstream with alternatives](/compare/)
- [Framework-specific guides](/guide/)
- [Installation by scenario](/guide/installation)
