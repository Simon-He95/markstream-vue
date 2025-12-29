# Installation

Install with pnpm, npm or yarn.

```bash
pnpm add markstream-vue
# or
npm install markstream-vue
# or
yarn add markstream-vue
```

## Optional Peer Dependencies

markstream-vue supports various features through optional peer dependencies. Install only what you need:

| Feature | Required Packages | Install Command |
|---------|------------------|-----------------|
| Code Syntax Highlighting | `shiki`, `stream-markdown` | `pnpm add shiki stream-markdown` |
| Monaco Editor (full code block features) | `stream-monaco` | `pnpm add stream-monaco` |
| Mermaid Diagrams | `mermaid` | `pnpm add mermaid` |
| Math Rendering (KaTeX) | `katex` | `pnpm add katex` |

## Enable feature loaders (Mermaid / KaTeX)

After installing optional peers, opt-in loaders in your client entry:

```ts
import { enableKatex, enableMermaid } from 'markstream-vue'

enableMermaid()
enableKatex()
```

Also remember required CSS:

```ts
import 'markstream-vue/index.css'
import 'katex/dist/katex.min.css'
import 'mermaid/dist/mermaid.css'
```

Monaco (`stream-monaco`) does not require a separate CSS import.

Note: `markstream-vue/index.css` is scoped under an internal `.markstream-vue` container to reduce global style conflicts. `MarkdownRender` renders inside that container by default. If you render node components standalone, wrap them with `<div class="markstream-vue">...</div>`.

### Quick Install: All Features

To enable all features at once:

```bash
pnpm add shiki stream-markdown stream-monaco mermaid katex
# or
npm install shiki stream-markdown stream-monaco mermaid katex
```

### Feature Details

#### Code Syntax Highlighting

Requires both `shiki` and `stream-markdown`:

```bash
pnpm add shiki stream-markdown
```

This enables syntax highlighting in code blocks using Shiki.

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

#### KaTeX Math Rendering

For math formula rendering:

```bash
pnpm add katex
```

Also import the KaTeX CSS in your app entry (e.g., `main.ts`):

```ts
import 'katex/dist/katex.min.css'
```

## Quick Test

Import and render a simple markdown string:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const md = '# Hello from markstream-vue!'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```
