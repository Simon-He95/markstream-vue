---
title: 'React streaming Markdown renderer for AI chat'
description: Use markstream-react to render token-by-token or chunked Markdown in React, Next.js, Remix, SSE, WebSocket, and AI chat UIs with optional Mermaid, KaTeX, Shiki, and Monaco.
keywords:
  - react streaming markdown
  - react ai chat markdown
  - react token stream
  - react sse websocket markdown
  - react markdown renderer
ogImage: /og/react-streaming.png
ogImageAlt: React streaming Markdown renderer for AI chat and Next.js
softwareName: markstream-react
softwarePackage: markstream-react
npmPackage: markstream-react
softwareFramework: React
softwareProgrammingLanguage:
  - TypeScript
  - React
softwareRuntimePlatform:
  - React
  - Next.js
  - Remix
faq:
  - question: Is Markstream only for Vue?
    answer: No. markstream-react is the React renderer in the Markstream family, alongside Vue, Svelte, Angular, Vue 2, parser, and core packages.
  - question: Should I use markstream-react, Streamdown, or react-markdown?
    answer: Compare markstream-react with Streamdown for React streaming Markdown. Use react-markdown as the static Markdown baseline or when an existing remark/rehype pipeline matters most.
  - question: Does markstream-react support Next.js SSR?
    answer: Yes. Use markstream-react/next for SSR-first rendering, markstream-react/server for server-only rendering, and the root package in client components for live streams.
---
# React streaming Markdown renderer for AI chat

`markstream-react` renders Markdown that updates while an LLM response is streaming. Use it for React, Next.js, Remix, SSE, WebSocket, AI chat UIs, long Markdown answers, progressive Mermaid diagrams, KaTeX math, and streaming code blocks.

It is **not** a generic replacement for every static Markdown page. For short static content, `react-markdown` may be enough. Use `markstream-react` when streaming UX, incomplete Markdown states, long outputs, or heavy blocks matter.

## When to use markstream-react

Use `markstream-react` when:

- Content streams from an LLM, SSE, or WebSocket
- Incomplete Markdown states must not flicker (unclosed fences, partial math)
- Long AI responses or long transcripts matter
- Mermaid/KaTeX/code blocks appear during streaming
- You want Markstream's cross-framework parser behavior
- You need virtualized long documents with bounded live nodes

Use `react-markdown` when:

- Content is static or short
- You already have sanitizer/plugin setup
- You do not need token-by-token UX
- You want the smallest familiar React Markdown stack

## Quick Start

```bash
pnpm add markstream-react
```

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export default function ChatMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return (
    <MarkdownRender
      content={content}
      final={isDone}
      fade={false}
    />
  )
}
```

## Next.js

For live SSE/WebSocket surfaces, use root `markstream-react` in a `'use client'` component. For SSR-first or server-only Markdown, start from the [Next.js guide](/frameworks/next).

Client streaming example:

```tsx
'use client'

import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export function ChatMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

For SSR safety with optional peers, see the [React installation guide](/guide/react-installation).

## Key capabilities

- **Two input paths**: raw `content` and pre-parsed `nodes`
- **Streaming SSE/WebSocket**: parse outside and pass `nodes` for high-frequency token streams
- **Progressive Mermaid**: diagrams render incrementally
- **Streaming code blocks**: with diff tracking
- **Virtualized long documents**: for 1MB+ content
- **Optional peers**: Mermaid, KaTeX, `stream-diffs` (enhanced code blocks), Monaco (fallback) — install only what you need
- **TypeScript-first**: full type coverage

## Framework integration

| Integration | Guide |
| --- | --- |
| React 18/19 | [React Quick Start](/guide/react-quick-start) |
| Next.js (App Router) | [React Installation](/guide/react-installation) |
| Next.js SSR safety | [Next.js SSR](/guide/react-next-ssr) |
| AI Chat / SSE | [AI Chat & Streaming](/guide/ai-chat-streaming) |
| Migrate from react-markdown | [Migration guide](/guide/react-markdown-migration) |

## vs Streamdown and react-markdown

| | markstream-react | react-markdown | Streamdown |
| --- | --- | --- | --- |
| Streaming-first | ✅ | ❌ | ✅ |
| Incomplete Markdown | Streaming-aware mid-state handling | General renderer; intermediate states may look unstable | Streaming-optimized |
| Mermaid | Built-in Markstream integration / optional peer | Via plugins | Via `@streamdown/mermaid` |
| Virtualized long docs | Renderer-level live-node controls | App-level responsibility | App-level responsibility |
| Cross-framework parser | ✅ | ❌ | ❌ |
| Static Markdown | ✅ (overhead) | ✅ (best fit) | ✅ |

For a detailed streaming comparison, see [markstream-react vs Streamdown](/compare/streamdown). For static-renderer migration trade-offs, see [markstream-react vs react-markdown](/compare/react-markdown).

## Try it

- [Live playground](https://markstream-react.pages.dev/)
- [Full documentation](/guide/react-quick-start)
