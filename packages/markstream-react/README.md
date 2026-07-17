# markstream-react

React/Next.js streaming Markdown renderer for AI chat, SSE/WebSocket output, long AI responses, Mermaid, KaTeX, and code blocks.

`markstream-react` is the React renderer in the Markstream family. It renders raw Markdown strings with `content`, and it can also accept pre-parsed `nodes` when a worker or store already owns parsing.

## Install

```bash
pnpm add markstream-react
```

Optional features are peer dependencies. Install only what your Markdown output needs.

Install `stream-diffs` for enhanced File/FileDiff code blocks. While Markdown is streaming or offscreen, React keeps the stable `<pre>` fallback. After the fence closes and the block is visible, it creates one final highlighted surface and swaps only after the first stable frame. The runtime is disposed on unmount or code-block identity change.

## Quick Start

Import one Markstream CSS file explicitly. The JavaScript entry does not inject styles automatically.

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export default function ChatMessage({
  content,
  isDone,
}: {
  content: string
  isDone: boolean
}) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

Use `markstream-react/index.px.css` instead when your app scales the root font size on mobile and you want renderer sizing to stay pixel-based.

## Streaming Example

For most SSE/WebSocket chat surfaces, accumulate the Markdown string and pass `content` plus `final`:

```tsx
import MarkdownRender from 'markstream-react'
import { useEffect, useState } from 'react'
import 'markstream-react/index.css'

export function ChatView() {
  const [content, setContent] = useState('')
  const [isDone, setIsDone] = useState(false)

  useEffect(() => {
    const eventSource = new EventSource('/api/chat/stream')
    eventSource.onmessage = (event) => {
      if (event.data === '[DONE]') {
        setIsDone(true)
        eventSource.close()
        return
      }

      const data = JSON.parse(event.data) as { content?: string }
      setContent(prev => prev + (data.content ?? ''))
    }

    return () => eventSource.close()
  }, [])

  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

If parsing is already external, pass `nodes`. Use a per-message parser id so generated code-block DOM ids stay unique across chat lists.

```tsx
import MarkdownRender from 'markstream-react'
import { useMemo } from 'react'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

export function ParsedChatMessage({
  messageId,
  content,
  isDone,
}: {
  messageId: string
  content: string
  isDone: boolean
}) {
  const md = useMemo(() => getMarkdown(`chat-${messageId}`), [messageId])
  const nodes = useMemo(
    () => parseMarkdownToStructure(content, md, { final: isDone }),
    [content, isDone, md],
  )

  return <MarkdownRender nodes={nodes} final={isDone} fade={false} />
}
```

## Next.js SSR

Import styles once from your app shell:

```tsx
// app/layout.tsx or pages/_app.tsx
import 'markstream-react/index.css'
```

Use the root package in client components for live SSE/WebSocket streams:

```tsx
'use client'

import MarkdownRender from 'markstream-react'

export function LiveMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

Use `markstream-react/next` for SSR-first Markdown with client enhancement, or `markstream-react/server` for server-only rendering:

```tsx
import MarkdownRender from 'markstream-react/next'

export default function Page() {
  return <MarkdownRender content="# Server HTML first" final />
}
```

## Optional Peers

| Feature | Package |
| --- | --- |
| Shiki code blocks | `stream-markdown` |
| Monaco editor code blocks | `stream-monaco` |
| Mermaid diagrams | `mermaid` |
| KaTeX math | `katex` |
| D2 diagrams | `@terrastruct/d2` |
| Infographic blocks | `@antv/infographic` |

KaTeX still needs its CSS in your app when math rendering is enabled:

```tsx
import 'katex/dist/katex.min.css'
```

## Tailwind

Non-Tailwind projects should import the precompiled CSS:

```tsx
import 'markstream-react/index.css'
```

Tailwind projects can import the Tailwind-ready CSS and include the extracted class list in `tailwind.config.js`:

```tsx
import 'markstream-react/index.tailwind.css'
```

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    require('markstream-react/tailwind'),
  ],
}
```

## Custom Components

For HTML-like custom tags in new React code, prefer renderer-local component maps:

- `streamingComponents` receives parser-backed `NodeComponentProps`, including `node.attrs`, `node.content`, and `node.loading`.
- `htmlComponents` renders through the raw/dynamic HTML path and receives normal React props plus `children`.

```tsx
import type { NodeComponentProps } from 'markstream-react'
import type React from 'react'
import MarkdownRender from 'markstream-react'

function DocumentLink(props: NodeComponentProps<{ type: 'documentlink', content: string, loading?: boolean }>) {
  return <span aria-busy={props.node.loading || undefined}>{props.node.content}</span>
}

function Badge({ kind, children }: React.PropsWithChildren<{ kind?: string }>) {
  return <span data-kind={kind}>{children}</span>
}

const renderer = (
  <MarkdownRender
    content={content}
    final={isDone}
    streamingComponents={{ documentlink: DocumentLink }}
    htmlComponents={{ badge: Badge }}
  />
)
```

`streamingComponents` keys are normalized and automatically added to the parser's effective `customHtmlTags`, so incomplete tags can render while content is streaming.

`customHtmlTags` remains available as a lower-level parser option. `setCustomComponents` and `customId` also remain supported for compatibility, shared application-level registration, and existing node overrides:

```tsx
import MarkdownRender, { setCustomComponents } from 'markstream-react'

setCustomComponents('chat', {
  documentlink: DocumentLink,
})

const legacyRenderer = (
  <MarkdownRender
    customId="chat"
    customHtmlTags={['documentlink']}
    content={content}
  />
)
```

Without `customHtmlTags` or `streamingComponents`, registered tag components render through the raw HTML path and receive HTML-style props/children instead of `props.node`. HTML safety is still handled by `htmlPolicy` and sanitization; the API split is not a security boundary.

## When Not to Use It

Use `react-markdown`, `marked`, or `markdown-it` when you only render short static Markdown, need the smallest possible Markdown stack, or already have a complete remark/rehype pipeline and do not need streaming mid-state handling.

## Type Exports

The package root exports the public component and renderer types, including `NodeRendererProps`, `NodeComponentProps`, `StreamingComponentMap`, `HtmlComponentMap`, `RenderContext`, `RenderNodeFn`, `CustomComponentMap`, and code-block option types.

## Development

```bash
pnpm --filter markstream-react dev
pnpm --filter markstream-react build
pnpm --filter markstream-react check:exports
pnpm --filter markstream-react size:check
```
