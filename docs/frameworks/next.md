---
title: 'Next.js streaming Markdown renderer for AI chat'
description: Use markstream-react in Next.js App Router or Pages Router for AI chat streaming Markdown, SSE/WebSocket output, SSR-first rendering, and server-only Markdown rendering.
softwareName: markstream-react
softwarePackage: markstream-react
npmPackage: markstream-react
softwareFramework: Next.js
softwareProgrammingLanguage:
  - TypeScript
  - React
softwareRuntimePlatform:
  - Next.js
  - React
faq:
  - question: Does markstream-react require client-only rendering in Next.js?
    answer: No. Live SSE and WebSocket streams belong in client components, but stable Markdown can use SSR-first rendering with markstream-react/next or server-only rendering with markstream-react/server.
  - question: Where should I import markstream-react CSS in Next.js?
    answer: Import markstream-react/index.css once from app/layout.tsx or pages/_app.tsx, or choose index.px.css or index.tailwind.css when those builds match your app.
  - question: Which Next.js entry should I use?
    answer: Use the root package for live client streaming, markstream-react/next for server HTML plus hydration, and markstream-react/server for server-only Markdown.
---
# Next.js streaming Markdown renderer for AI chat

`markstream-react` works with Next.js App Router and Pages Router for AI chat UIs, SSE/WebSocket output, SSR-first pages, and server-only Markdown rendering. Choose the entrypoint based on where rendering happens.

## When to use markstream-react with Next.js

Use `markstream-react` in Next.js when:

- Your AI chat UI or streaming Markdown surface is in a Next.js app
- You want server HTML first and client enhancement after hydration
- You need a pure server Markdown render path
- You have live SSE/WebSocket content in a client component
- Optional peers such as Mermaid, KaTeX, and stream-diffs need browser-only setup

## Install

```bash
pnpm add markstream-react
```

Import styles once from your app shell:

```tsx
// app/layout.tsx or pages/_app.tsx
import 'markstream-react/index.css'
```

## SSR-first render

Use `markstream-react/next` when you want server HTML first and client enhancement after hydration.

```tsx
// app/page.tsx
import MarkdownRender from 'markstream-react/next'

const markdown = '# Hello Next.js'

export default function Page() {
  return <MarkdownRender content={markdown} final />
}
```

## Pure server render

Use `markstream-react/server` when you need server-only Markdown rendering.

```tsx
// app/server-preview/page.tsx
import MarkdownRender from 'markstream-react/server'

const markdown = '# Server-rendered Markdown'

export default function Page() {
  return <MarkdownRender content={markdown} final />
}
```

## Client-only streaming surface

Use the root `markstream-react` package inside a `'use client'` component for live SSE/WebSocket updates.

```tsx
// app/components/ChatMessage.tsx
'use client'

import MarkdownRender from 'markstream-react'

export function ChatMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

Server components can pass initial content into that client streaming surface:

```tsx
// app/chat/page.tsx
import { ChatMessage } from './ChatMessage'

export default async function ChatPage() {
  const initialContent = '# Streaming starts here'
  return <ChatMessage content={initialContent} isDone={false} />
}
```

## Optional peers and workers

Keep browser-only optional peers such as Mermaid, KaTeX, and stream-diffs in client components or client plugins. Use the [Next.js SSR guide](/guide/react-next-ssr) and [React installation guide](/guide/react-installation) for framework-specific setup instead of copying Vite worker import syntax into a Next.js page.

## Key considerations

- **SSR-first**: use `markstream-react/next` for server HTML plus client enhancement
- **Server-only**: use `markstream-react/server` when no client component boundary is needed
- **Live streaming**: use root `markstream-react` inside a `'use client'` component
- **CSS order**: import `markstream-react/index.css` in your app layout or component entry
- **Optional peers**: Mermaid, KaTeX, and `stream-diffs` (enhanced code blocks) are optional — only install what your AI output needs

## Full guides

- [React Quick Start](/guide/react-quick-start)
- [React Installation](/guide/react-installation)
- [Next.js SSR](/guide/react-next-ssr)
