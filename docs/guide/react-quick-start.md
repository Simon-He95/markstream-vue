# React Quick Start

Get started with markstream-react in your React project.

::: tip Migrating from react-markdown?
If your app already uses `react-markdown`, start with the [migration guide](/guide/react-markdown-migration) and the [migration cookbook](/guide/react-markdown-migration-cookbook) before wiring new code by hand.
:::

## Basic Setup

### 1. Installation

First, install the package:

```bash
pnpm add markstream-react
```

### 2. Import Styles

In your main entry file (e.g., `main.tsx`, `index.tsx`, or `App.tsx`):

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'markstream-react/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

### 3. Use the Component

```tsx
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = `# Hello React!

This is **markstream-react** - a streaming-friendly Markdown renderer for React.

## Features

- Code syntax highlighting
- Mermaid diagrams
- Math formulas
- And much more!

\`\`\`javascript
console.log('Hello from React!')
\`\`\`
`

  return (
    <div>
      <MarkdownRender content={markdown} />
    </div>
  )
}

export default App
```

## Using with TypeScript

markstream-react is built with TypeScript and includes full type definitions:

```tsx
import type { NodeRendererProps } from 'markstream-react'
import MarkdownRender from 'markstream-react'

const props: NodeRendererProps = {
  content: '# Hello TypeScript!',
}

function App() {
  return <MarkdownRender {...props} />
}
```

## Using with Next.js

Use the dedicated SSR entrypoints instead of `mounted` guards or `ssr: false`.

See [React Next SSR](/guide/react-next-ssr) for the full contract and examples.

### App Router (Next.js 14 / 15)

```tsx
import MarkdownRender from 'markstream-react/next'

export default function MarkdownPage() {
  const markdown = `# Hello Next.js!

This route ships real SSR HTML first.
`

  return <MarkdownRender content={markdown} final />
}
```

### Pages Router

```tsx
import MarkdownRender from 'markstream-react/next'
import 'markstream-react/index.css'

export default function MarkdownPage() {
  const markdown = `# Hello Next.js Pages Router!`

  return <MarkdownRender content={markdown} final />
}
```

### Pure Server Rendering

```tsx
import MarkdownRender from 'markstream-react/server'

export default function MarkdownPage() {
  const markdown = `# Pure server entry`

  return <MarkdownRender content={markdown} final />
}
```

## Enabling Optional Features

### Code Syntax Highlighting

Install the optional peer:

```bash
pnpm add stream-diffs
```

Enhanced code blocks (the `CodeBlockNode` runtime) use `stream-diffs` built-in defaults for code and diff options, with theming via `theme` / `darkTheme` / `lightTheme` / `themes`. When `stream-diffs` is not installed, code blocks fall back to a plain `<pre>`.

```tsx
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = `\`\`\`javascript
const hello = 'world'
console.log(hello)
\`\`\``

  return <MarkdownRender content={markdown} />
}
```

### Mermaid Diagrams

Install mermaid:

```bash
pnpm add mermaid
```

Import styles (Mermaid auto-loads when installed):

```tsx
import 'markstream-react/index.css'

function App() {
  const markdown = `#### Mermaid Diagram

\`\`\`mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Keep trying]
\`\`\``

  return <MarkdownRender content={markdown} />
}
```

### D2 Diagrams

Install D2:

```bash
pnpm add @terrastruct/d2
```

```tsx
import 'markstream-react/index.css'

function App() {
  const markdown = `#### D2 Diagram

\`\`\`d2
direction: right
Client -> API: request
API -> DB: query
DB -> API: rows
API -> Client: response
\`\`\``

  return <MarkdownRender content={markdown} />
}
```

### Math Formulas (KaTeX)

Install katex:

```bash
pnpm add katex
```

Import styles (KaTeX auto-loads when installed):

```tsx
import 'markstream-react/index.css'
import 'katex/dist/katex.min.css'

function App() {
  const markdown = `#### Math Example

Inline math: $E = mc^2$

Block math:

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$`

  return <MarkdownRender content={markdown} />
}
```

## Custom Components

You can customize how specific nodes are rendered by passing custom component mappings:

```tsx
import MarkdownRender, { setCustomComponents } from 'markstream-react'

// Custom heading component
function CustomHeading({ node, customId }: any) {
  const level = node.level || 1
  const Tag = `h${level}` as keyof JSX.IntrinsicElements

  return (
    <Tag className="custom-heading" data-custom-id={customId}>
      {node.children?.map((child: any, i: number) => (
        <span key={i}>{child.content || ''}</span>
      ))}
    </Tag>
  )
}

// Register for a scoped customId
setCustomComponents('docs', { heading: CustomHeading })

function App() {
  const markdown = `# Custom Heading

This heading is rendered with a custom component.
`

  return <MarkdownRender customId="docs" content={markdown} />
}
```

## Streaming Content

markstream-react supports streaming markdown content, which is useful for AI-generated content:

```tsx
import MarkdownRender from 'markstream-react'
import { useState } from 'react'

function StreamingDemo() {
  const [markdown, setMarkdown] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const fullText = `# Streaming Demo

This content is being streamed **in small chunks**.

## Features

1. Progressive rendering
2. No layout shift
3. Smooth animations

\`\`\`javascript
const streaming = true
console.log('Streaming enabled:', streaming)
\`\`\`
`

  const startStreaming = () => {
    setIsStreaming(true)
    setMarkdown('')
    let i = 0

    const interval = setInterval(() => {
      if (i < fullText.length) {
        setMarkdown(prev => prev + fullText[i])
        i++
      }
      else {
        clearInterval(interval)
        setIsStreaming(false)
      }
    }, 20)

    return () => clearInterval(interval)
  }

  return (
    <div>
      <button onClick={startStreaming} disabled={isStreaming}>
        {isStreaming ? 'Streaming...' : 'Start Streaming'}
      </button>
      <MarkdownRender content={markdown} />
    </div>
  )
}
```

## Using with React Hooks

```tsx
import type { ChangeEvent } from 'react'
import MarkdownRender from 'markstream-react'
import { useCallback, useEffect, useState } from 'react'

function MarkdownEditor() {
  const [content, setContent] = useState('# Edit me!')
  const [html, setHtml] = useState('')

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
  }, [])

  return (
    <div className="markdown-editor">
      <textarea
        value={content}
        onChange={handleChange}
        placeholder="Write your markdown here..."
        className="editor-input"
      />
      <div className="editor-preview">
        <MarkdownRender content={content} />
      </div>
    </div>
  )
}
```

## Virtualized Lists

For large markdown documents, you can use virtualization:

```tsx
import MarkdownRender from 'markstream-react'

function LongDocument() {
  // Your very long markdown content
  const markdown = `# Long Document`

  return (
    <MarkdownRender
      content={markdown}
      maxLiveNodes={200}
      liveNodeBuffer={10}
    />
  )
}
```

## Common Props

Below are the most commonly used props. For the full list, see [React Components](/guide/react-components).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `string` | - | Markdown content to render |
| `nodes` | `BaseNode[]` | - | Pre-parsed AST nodes (typically `ParsedNode[]`) |
| `customId` | `string` | - | Identifier for scoping |
| `maxLiveNodes` | `number` | `320` | Max nodes for virtualization |
| `liveNodeBuffer` | `number` | `60` | Buffer for overscan |
| `batchRendering` | `boolean` | `true` | Enable batched rendering |
| `deferNodesUntilVisible` | `boolean` | `true` | Defer heavy nodes |
| `renderCodeBlocksAsPre` | `boolean` | `false` | Use `<pre><code>` fallback (Mermaid blocks will also fall back) |

## Styling

The default styles are scoped under `.markstream-react` class. You can override styles:

```css
/* Your global styles */
.markstream-react {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
}

.markstream-react h1 {
  font-size: 2.5rem;
  font-weight: 700;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 0.5rem;
}

.markstream-react code {
  background: #f3f4f6;
  padding: 0.2rem 0.4rem;
  border-radius: 0.25rem;
}
```

## Using with Tailwind CSS

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'
import './output.css' // Your Tailwind output

function App() {
  return (
    <div className="max-w-4xl mx-auto py-8">
      <MarkdownRender content="# Hello Tailwind!" />
    </div>
  )
}
```

## Next Steps

- Explore [React Components documentation](/guide/react-components) for all available components
- Check out [Examples](/guide/examples) for more usage examples
- See [API Reference](/guide/components) for detailed API documentation
