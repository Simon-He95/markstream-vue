---
title: Next.js 流式 Markdown 渲染器
description: 在 Next.js App Router 和 Pages Router 中使用 markstream-react 处理 AI 聊天流式 Markdown、SSR-first 渲染和 server-only Markdown。
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
  - question: Next.js 里 markstream-react 必须 client-only 吗？
    answer: 不必须。实时 SSE/WebSocket 区域放在 client component；稳定 Markdown 可以用 markstream-react/next 做 SSR-first，或用 markstream-react/server 做 server-only。
  - question: Next.js 里 CSS 应该在哪里导入？
    answer: 在 app/layout.tsx 或 pages/_app.tsx 导入一次 markstream-react/index.css；需要移动端 px 或 Tailwind 方案时换成对应 CSS 入口。
  - question: Next.js 应该选哪个入口？
    answer: 实时 client streaming 用 root package，SSR-first 用 markstream-react/next，server-only Markdown 用 markstream-react/server。
keywords:
  - Next.js
  - markstream-react
  - SSE 流式渲染
---

# Next.js 流式 Markdown 渲染器

`markstream-react` 在 Next.js 中有三种常见入口：实时 SSE/WebSocket 区域用 root `markstream-react` 放在 `'use client'` 组件里；需要服务器先输出 HTML 再增强时用 `markstream-react/next`；完全 server-only 的 Markdown 预览用 `markstream-react/server`。

```tsx
// app/components/ChatMessage.tsx
'use client'

import MarkdownRender from 'markstream-react'

export function ChatMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

```tsx
// app/page.tsx
import MarkdownRender from 'markstream-react/next'
import 'markstream-react/index.css'

export default function Page() {
  return <MarkdownRender content="# Server HTML first" final />
}
```

| 入口 | 用途 |
| --- | --- |
| `markstream-react` | client component 中的实时流式输出 |
| `markstream-react/next` | SSR-first 页面，服务端 HTML + 客户端增强 |
| `markstream-react/server` | 不需要客户端增强的 server-only 渲染 |

不要把 Next.js 简化成“只能 client-only”。只有 live streaming surface 必须在客户端；稳定内容和服务端预览可以走 SSR-first 或 server-only。
