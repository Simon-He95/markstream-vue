# markstream-octane

Native Octane streaming Markdown renderer for AI chat, SSE/WebSocket output, incomplete Markdown, Mermaid, KaTeX, and stream-diffs enhanced code blocks.

`markstream-octane` is compiled with the Octane compiler and runs on the Octane client and server runtimes. It does not require a React root or React compatibility layer. The published package contains precompiled JavaScript, declarations, styles, and workers, so consumers do not need to compile TSRX from `node_modules`.

## Install

```bash
pnpm add markstream-octane octane
```

Octane 0.1.x currently declares Vite 8 plus React/React DOM compatibility peers in its own package metadata. `markstream-octane` does not import or execute React, but package managers may still ask consumers to satisfy those upstream Octane peer declarations.

Optional renderer features are peer dependencies. Install only the features used by your Markdown:

| Feature | Package |
| --- | --- |
| Enhanced code blocks | `stream-diffs` |
| Mermaid diagrams | `mermaid` |
| KaTeX math | `katex` |
| D2 diagrams | `@terrastruct/d2` |
| Infographic blocks | `@antv/infographic` |

## Compiler setup

Octane source components use the `.tsrx` extension. Add the Octane compiler to Vite:

```ts
// vite.config.ts
import { octane } from 'octane/compiler/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [octane()],
  resolve: {
    extensions: ['.tsrx', '.ts', '.mjs', '.js', '.json'],
  },
})
```

Configure TSRX and the Octane JSX runtime:

```json
{
  "tsrx": {
    "compiler": "octane/compiler"
  },
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "octane",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "target": "ESNext"
  }
}
```

## Quick start

Import one Markstream stylesheet explicitly; the JavaScript entry does not inject styles:

```tsrx
// App.tsrx
import { NodeRenderer } from 'markstream-octane'
import 'markstream-octane/index.css'

export function ChatMessage(props: {
  content: string
  isDone: boolean
}) {
  return (
    <NodeRenderer
      content={props.content}
      final={props.isDone}
      fade={false}
    />
  )
}
```

Mount the app with the native Octane root:

```ts
// main.ts
import { createRoot } from 'octane'
import { ChatMessage } from './App.tsrx'

const host = document.getElementById('root')
if (!host)
  throw new Error('Missing #root')

createRoot(host).render(ChatMessage, {
  content: '# Hello from Octane',
  isDone: true,
})
```

Use `markstream-octane/index.px.css` when the application changes the root font size but renderer dimensions should remain pixel-based. Import `katex/dist/katex.min.css` as well when math rendering is enabled.

## Streaming

Accumulate SSE or WebSocket chunks and pass the growing string through `content`. Set `final` only after the stream ends:

```tsrx
import { useState } from 'octane'
import { NodeRenderer } from 'markstream-octane'

export function StreamingMessage() {
  const [content, setContent] = useState('')
  const [final, setFinal] = useState(false)

  const start = () => {
    setContent('')
    setFinal(false)

    const source = new EventSource('/api/chat/stream')
    source.onmessage = (event) => {
      if (event.data === '[DONE]') {
        source.close()
        setFinal(true)
        return
      }

      const chunk = JSON.parse(event.data) as { content: string }
      setContent(current => current + chunk.content)
    }
  }

  return (
    <>
      <button type="button" onClick={start}>Start</button>
      <NodeRenderer
        content={content}
        final={final}
        typewriter
        smoothStreaming="auto"
      />
    </>
  )
}
```

If parsing is already owned by a worker or store, pass pre-parsed `nodes` instead of `content`.

## Server rendering

Use the explicit server entry together with `octane/server`:

```ts
import { NodeRenderer } from 'markstream-octane/server'
import { renderToString } from 'octane/server'

const result = renderToString(NodeRenderer, {
  content: '# Server-rendered Markdown',
  final: true,
})

console.log(result.html)
```

The root export selects the server build through its `node` condition, but `markstream-octane/server` makes the runtime boundary unambiguous in server-only code.

## Custom components

Use `streamingComponents` for parser-backed custom tags. These components receive `NodeComponentProps`, including the parsed node, loading state, render context, and child renderer:

```tsrx
import type { NodeComponentProps } from 'markstream-octane'
import {
  NodeRenderer,
  defineStreamingComponents,
} from 'markstream-octane'

type DocumentNode = {
  type: 'documentlink'
  content: string
  loading?: boolean
}

function DocumentLink(props: NodeComponentProps<DocumentNode>) {
  return (
    <span aria-busy={props.node.loading || undefined}>
      {props.node.content}
    </span>
  )
}

const components = defineStreamingComponents({
  documentlink: DocumentLink,
})

export function Message(props: { content: string }) {
  return (
    <NodeRenderer
      content={props.content}
      streamingComponents={components}
    />
  )
}
```

Keys in `streamingComponents` are normalized and included in the parser's effective `customHtmlTags`, so incomplete tags can render while tokens arrive.

Use `htmlComponents` for the dynamic HTML path. These receive HTML-style props and `children`:

```tsrx
import type { OctaneNode } from 'octane'
import {
  NodeRenderer,
  defineHtmlComponents,
} from 'markstream-octane'

function Badge(props: { kind?: string, children?: OctaneNode }) {
  return <mark data-kind={props.kind}>{props.children}</mark>
}

const htmlComponents = defineHtmlComponents({ badge: Badge })

export function Message(props: { content: string }) {
  return (
    <NodeRenderer
      content={props.content}
      htmlComponents={htmlComponents}
    />
  )
}
```

`setCustomComponents` and `customId` remain available for shared application-level registration and built-in node overrides such as `code_block`, `mermaid`, or a language-specific renderer.

## Tailwind

Non-Tailwind applications should use the precompiled stylesheet:

```ts
import 'markstream-octane/index.css'
```

Tailwind applications can import the Tailwind-ready stylesheet and include the extracted class list:

```ts
import 'markstream-octane/index.tailwind.css'
```

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,tsrx}',
    require('markstream-octane/tailwind'),
  ],
}
```

## Public entries

- `markstream-octane`: precompiled Octane client runtime and public types
- `markstream-octane/server`: precompiled Octane server renderer
- `markstream-octane/index.css`: precompiled renderer styles
- `markstream-octane/index.px.css`: pixel-based renderer styles
- `markstream-octane/index.tailwind.css`: Tailwind-ready styles
- `markstream-octane/tailwind`: extracted Tailwind class source
- worker subpaths for KaTeX and Mermaid

## Development

From the repository root:

```bash
pnpm --filter markstream-octane typecheck
pnpm --filter markstream-octane test
pnpm --filter markstream-octane build
pnpm play:octane
pnpm test:e2e:octane-playground
```
