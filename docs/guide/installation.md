---
description: Install markstream-vue with the right peer dependency set for docs sites, AI chat UIs, Mermaid, KaTeX, Monaco, and large documents.
---

# Installation

If you only want the renderer on screen quickly, install the main package first and add peers only for the features you actually use.

## 1. Minimal install

```bash
pnpm add markstream-vue
# or
npm install markstream-vue
# or
yarn add markstream-vue
```

Then continue with [Quick Start](/guide/quick-start) if you only need basic Markdown rendering.

## 2. Choose peers by capability

| Capability | Packages | When you need it |
|------------|----------|------------------|
| Lightweight highlighted code blocks | `stream-markdown` | Docs sites, SSR, lower bundle budgets |
| Monaco-powered code blocks | `stream-monaco` | Copy/preview/expand controls and richer code UX |
| Mermaid diagrams | `mermaid` | Fenced `mermaid` blocks |
| D2 diagrams | `@terrastruct/d2` | Fenced `d2` or `d2lang` blocks |
| KaTeX math | `katex` | Inline or block math rendering |

## 3. Common install recipes

### Docs site or SSR-first app

```bash
pnpm add markstream-vue stream-markdown
```

Then continue with [Docs Site & VitePress](/guide/vitepress-docs-integration) if you are wiring a docs site, content hub, or VitePress theme.

### AI / chat UI with richer code blocks and diagrams

```bash
pnpm add markstream-vue stream-monaco mermaid katex
```

Then follow [AI Chat & Streaming](/guide/ai-chat-streaming) for the recommended `nodes` + `final` data flow and chat-specific tuning.

### Diagram-heavy content

```bash
pnpm add markstream-vue mermaid @terrastruct/d2 katex
```

### Everything enabled

```bash
pnpm add markstream-vue stream-markdown stream-monaco mermaid @terrastruct/d2 katex
```

## 4. CSS order matters as much as installation

The package entry already imports the default stylesheet, but when your app uses reset layers or utility frameworks you usually want explicit control over order.

```css
@import 'modern-css-reset';
@tailwind base;

@import 'markstream-vue/index.css' layer(components);
```

Also import KaTeX CSS when you use math:

```ts
import 'katex/dist/katex.min.css'
```

`stream-monaco`, `mermaid`, and `@terrastruct/d2` do not need extra CSS imports from this package.

## 5. Optional loaders (only for CDN or custom control)

After installing peers, default loaders are already enabled. Only call loader helpers if you previously disabled them or want a custom loader, for example with CDN assets:

```ts twoslash
import { enableD2, enableKatex, enableMermaid } from 'markstream-vue'

enableMermaid()
enableKatex()
enableD2()
```

## 6. First-run checklist

- If you render standalone node components, wrap them in `<div class="markstream-vue">...</div>`.
- If math does not render, check that `katex` is installed and its CSS is imported.
- If Monaco is blank, verify worker bundling and browser-only guards.
- If styles look wrong, check [Troubleshooting](/guide/troubleshooting#css-looks-wrong-start-here).

## 7. Quick test

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

type MarkdownRenderProps = InstanceType<typeof MarkdownRender>['$props']

const md: MarkdownRenderProps['content'] = '# Hello from markstream-vue!'
const customId: MarkdownRenderProps['customId'] = 'install-check'
</script>

<template>
  <MarkdownRender
    :content="md"
    :custom-id="customId"
  />
</template>
```

Next steps:

- [Quick Start](/guide/quick-start) for the smallest integration
- [Usage & Streaming](/guide/usage) for `content` vs `nodes`
- [AI Chat & Streaming](/guide/ai-chat-streaming) for chat UIs, SSE, and token streams
- [Override Built-in Components](/guide/component-overrides) if you need custom rendering
