# markstream-react

React/Next.js streaming Markdown renderer for AI chat, SSE/WebSocket output, long AI responses, Mermaid, KaTeX, and code blocks.

`markstream-react` is the React renderer in the Markstream family. It renders raw Markdown strings with `content`, and it can also accept pre-parsed `nodes` when a worker or store already owns parsing.

The coordinated 2.0 family beta will use `markstream-react@next`. Before installing, verify that `npm view markstream-react@next version` reports `0.1.0-beta.1`. It removes the Monaco and Shiki code-block APIs in favor of `stream-diffs`; read the [coordinated 2.0 family migration guide](https://markstream.simonhe.me/guide/migration-2-0) before upgrading.

```bash
pnpm add markstream-react@next stream-diffs
```

This beta requires both `react` and `react-dom` 18 or newer.

## Install

```bash
pnpm add markstream-react
```

Optional features are peer dependencies. Install only what your Markdown output needs.

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
| Enhanced code blocks (recommended) | `stream-diffs` |
| Mermaid diagrams | `mermaid` |
| KaTeX math | `katex` |
| D2 diagrams | `@terrastruct/d2` |
| Infographic blocks | `@antv/infographic` |

KaTeX still needs its CSS in your app when math rendering is enabled:

```tsx
import 'katex/dist/katex.min.css'
```

## Enhanced Code Blocks

`stream-diffs` powers enhanced code blocks across all Markstream packages (smaller runtime, no `monaco-editor`); a plain `<pre>` is rendered when it is not installed.

Install the runtime:

```bash
pnpm add stream-diffs
```

`CodeBlockNode` renders a single code block with the header, toolbar, and a `stream-diffs` File / FileDiff surface. Use it directly for one-off blocks, or let `MarkdownRender` resolve it automatically for code blocks in your Markdown:

```tsx
import type { CodeBlockOptions } from 'markstream-react'
import { CodeBlockNode } from 'markstream-react'

const node = {
  type: 'code_block',
  language: 'ts',
  code: 'const answer = 42',
  raw: 'const answer = 42',
}

const codeBlockOptions: CodeBlockOptions = {
  overflow: 'wrap',
  diffStyle: 'unified',
  enableLineSelection: true,
}

export function CodeBlock() {
  return <CodeBlockNode node={node} codeBlockOptions={codeBlockOptions} isDark showHeader />
}
```

Direct `CodeBlockNode` and top-level `MarkdownRender` both accept `codeBlockOptions`. The shared `CodeBlockOptions` type covers host-managed typography/layout plus supported File/FileDiff, interaction, annotation, and callback fields; `maxHeight` and the single symmetric `padding` value use numeric CSS pixels. Keep header/toolbar controls in `codeBlockProps`. Theme values are registered names: use `darkTheme` / `lightTheme` for the active names and `themes` for the `[dark, light]` pair to preload. An old Monaco JSON theme is not accepted directly: first convert it to a Shiki `ThemeRegistration`, then call `registerCustomTheme(name, loader)` from `stream-diffs/pierre`; see the [coordinated 2.0 family migration guide](https://markstream.simonhe.me/guide/migration-2-0).

### Editing API

`CodeBlockNode` is a `React.forwardRef` component. Install `stream-diffs >= 0.0.5` and hold a `CodeBlockNodeHandle` (aliased as `CodeBlockNodeReactHandle`) to drive editing, undo/redo, line reveal, and scrolling without reaching into the shadow DOM:

```tsx
import type { CodeBlockNodeHandle } from 'markstream-react'
import { CodeBlockNode } from 'markstream-react'
import { useRef } from 'react'

const block = useRef<CodeBlockNodeHandle>(null)
const node = {
  type: 'code_block',
  language: 'ts',
  code: 'const answer = 42',
  raw: 'const answer = 42',
}

export function EditableCode() {
  async function edit() {
    const editor = await block.current?.startEditing({}, 'answer-draft')
    console.log(editor?.getText())
  }

  return (
    <>
      <CodeBlockNode
        ref={block}
        node={node}
        loading={false}
        codeBlockOptions={{ onEditComplete: () => 'accept' }}
      />
      <button onClick={edit}>Edit</button>
      <button onClick={() => block.current?.undo()}>Undo</button>
    </>
  )
}
```

Editing requirements:

- `startEditing()` waits for the finalized `stream-diffs` surface; it rejects with the shared core error while the block is still streaming or when the runtime is missing.
- `stopEditing('complete')` installs edits by default. Provide `codeBlockOptions.onEditComplete` returning `'reject'` to restore the external input, or `'accept'` to keep the edit. The handler must return one of those strings.
- `getCode()` prefers the active editing file, then completed native File/FileDiff contents, then the current display code (trailing newline normalized).
- Changing `node.code`, the language, the theme, or structural diff options recreates the surface and ends an edit session; pass a stable `editStateKey` to `startEditing()` when a draft must survive.
- `revealLine()`, `expandLine()`, and `expandHunk()` need the enhanced surface; they return `false`/no-op when it is unavailable.
- `<CodeBlockNode>` imported from `markstream-react/next` forwards the same ref after hydration; the server-rendered first pass keeps the ref at `null`.

**Playground:** [playground-react18/src/editing-api](../../playground-react18/src/editing-api/README.md) — run `pnpm play:react18` and open <http://localhost:4174/editing-api.html>.

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
