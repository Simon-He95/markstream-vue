---
title: React Installation
description: Install markstream-react with pnpm, npm, or yarn, plus next steps for migrating from react-markdown in a React project.
keywords:
  - react installation
  - markstream-react install
  - pnpm npm yarn
  - react-markdown migration
---
# React Installation

Install markstream-react with pnpm, npm or yarn.

::: tip Already on react-markdown?
See the [migration guide](/guide/react-markdown-migration) for the high-level path and the [migration cookbook](/guide/react-markdown-migration-cookbook) for focused before/after examples.
:::

```bash
pnpm add markstream-react
# or
npm install markstream-react
# or
yarn add markstream-react
```

## Requirements

markstream-react requires:
- **React 18+** and **ReactDOM 18+**
- **stream-markdown-parser** (auto-installed as dependency)

## Optional Peer Dependencies

markstream-react supports various features through optional peer dependencies. Install only what you need:

| Feature | Required Packages | Install Command |
|---------|------------------|-----------------|
| Shiki code blocks (`MarkdownCodeBlockNode`) | `stream-markdown` | `pnpm add stream-markdown` |
| Enhanced code blocks (recommended) | `stream-diffs` | `pnpm add stream-diffs` |
| Monaco Editor code blocks (automatic fallback) | `stream-monaco` | `pnpm add stream-monaco` |
| Mermaid Diagrams | `mermaid` | `pnpm add mermaid` |
| D2 Diagrams | `@terrastruct/d2` | `pnpm add @terrastruct/d2` |
| Math Rendering (KaTeX) | `katex` | `pnpm add katex` |

Enhanced code blocks resolve through a dual-runtime loader: `stream-diffs` is preferred (smaller, no `monaco-editor`), `stream-monaco` is the automatic fallback, and a plain `<pre>` is rendered when neither is installed. Install one of the two; you do not need both.

## Optional: off-thread workers in Vite / Vite-compatible bundlers

Mermaid/KaTeX auto-load when installed. The `?worker` import syntax is for Vite-compatible bundlers. In Next.js, use the [Next.js SSR guide](/frameworks/next) and keep browser-only worker setup behind client boundaries.

If you want off-thread parsing/rendering in Vite-compatible apps, inject the workers:

```tsx
import { setKaTeXWorker, setMermaidWorker } from 'markstream-react'
import KatexWorker from 'markstream-react/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-react/workers/mermaidParser.worker?worker'

setMermaidWorker(new MermaidWorker())
setKaTeXWorker(new KatexWorker())
```

Required CSS:

```tsx
import 'markstream-react/index.css'
import 'katex/dist/katex.min.css'
```

`markstream-react` does not inject renderer styles from its JavaScript entry. Import exactly one Markstream CSS file from your app shell or component entry: `index.css`, `index.px.css`, or `index.tailwind.css`.

Monaco (`stream-monaco`) does not require a separate CSS import.

Note: `markstream-react/index.css` is scoped under an internal `.markstream-react` container to reduce global style conflicts. `MarkdownRender` renders inside that container by default. If you render node components standalone, wrap them with `<div className="markstream-react">...</div>`.

## Tailwind CSS Support

If your app uses Tailwind and you want to avoid duplicate utility CSS, import the Tailwind-ready output instead:

```tsx
import 'markstream-react/index.tailwind.css'
```

And include the extracted class list in your `tailwind.config.js`:

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    require('markstream-react/tailwind'),
  ],
}
```

This approach ensures that Tailwind includes all the utility classes used by markstream-react in its purge process, resulting in a smaller final bundle size.

### Quick Install: All Features

To enable all features at once:

```bash
pnpm add stream-markdown stream-diffs mermaid @terrastruct/d2 katex
# or
npm install stream-markdown stream-monaco mermaid @terrastruct/d2 katex
```

### Feature Details

#### Code Syntax Highlighting

Requires `stream-markdown`:

```bash
pnpm add stream-markdown
```

`stream-markdown` bundles the Shiki runtime used by `MarkdownCodeBlockNode`. To use Shiki inside `MarkdownRender`, override the `code_block` renderer (or render `MarkdownCodeBlockNode` directly).

```tsx
import MarkdownRender, { MarkdownCodeBlockNode, setCustomComponents } from 'markstream-react'

setCustomComponents({
  code_block: ({ node, isDark, ctx }: any) => (
    <MarkdownCodeBlockNode
      node={node}
      isDark={isDark}
      stream={ctx?.codeBlockStream}
      {...(ctx?.codeBlockProps || {})}
    />
  ),
})
```

#### Monaco Editor

For full code block functionality (copy button, font size controls, expand/collapse):

```bash
pnpm add stream-monaco
```

Without `stream-monaco`, code blocks will render but interactive buttons may not work.

#### Mermaid Diagrams

For rendering Mermaid diagrams:

```bash
pnpm add mermaid
```

#### D2 Diagrams

For rendering D2 diagrams:

```bash
pnpm add @terrastruct/d2
```

#### KaTeX Math Rendering

For math formula rendering:

```bash
pnpm add katex
```

Also import the KaTeX CSS in your app entry:

```tsx
import 'katex/dist/katex.min.css'
```

## Quick Test

Import and render a simple markdown string:

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

function App() {
  const md = '# Hello from markstream-react!'

  return <MarkdownRender content={md} />
}

export default App
```

## TypeScript Support

markstream-react is written in TypeScript and includes full type definitions out of the box. No additional configuration is needed:

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

## Next.js Integration

For Next.js, prefer the dedicated SSR entrypoints:

```tsx
import MarkdownRender from 'markstream-react/next'
import 'markstream-react/index.css'

export default function MarkdownPage() {
  return <MarkdownRender content="# Hello Next.js!" final />
}
```

If you need a pure server render path with stable fallbacks and no client component boundary:

```tsx
import MarkdownRender from 'markstream-react/server'

export default function MarkdownPage() {
  return <MarkdownRender content="# Hello Next.js!" final />
}
```

See [React Next SSR](/guide/react-next-ssr) for App Router, Pages Router, custom component, and verification details.

## Vite Integration

For Vite projects, simply import the component and styles:

```tsx
// src/main.tsx
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

```tsx
// src/App.tsx
import MarkdownRender from 'markstream-react'

function App() {
  const content = `# Hello Vite!

This is markstream-react working with **Vite**.`

  return <MarkdownRender content={content} />
}

export default App
```

## Webpack Integration

For projects using Webpack, ensure your configuration handles CSS imports:

```js
module.exports = {
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  }
}
```

## Custom Components Setup

To use custom node components, you'll need to create a custom renderer. See the [Components documentation](/guide/react-components) for details.
