---
title: Install markstream-vue for Vue, Nuxt, and VitePress
description: Install markstream-vue for Vue, Nuxt, and VitePress with the right peer dependency set for docs sites, AI chat UIs, Mermaid, KaTeX, and large documents.
keywords:
  - install markstream-vue
  - Vue Markdown renderer install
  - Nuxt Markdown renderer install
  - VitePress Markdown renderer
  - markstream-vue peer dependencies
  - streaming Markdown Vue setup
---

# Vue / Nuxt Installation

If you chose `markstream-vue` for Vue 3, Nuxt, or VitePress, install the main package first and add peers only for the features you actually use.

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
| Enhanced code blocks and diffs (recommended) | `stream-diffs` | Copy/preview/expand controls, syntax highlighting, and File/Diff surfaces |
| Mermaid diagrams | `mermaid` | Fenced `mermaid` blocks |
| D2 diagrams | `@terrastruct/d2` | Fenced `d2` or `d2lang` blocks |
| KaTeX math | `katex` | Inline or block math rendering |
| Infographic blocks | `@antv/infographic` | Fenced `infographic` blocks; also configure `setInfographicLoader` |

Enhanced code blocks resolve through the same loader across all framework packages (vue, vue2, react, svelte, angular): when `stream-diffs` is installed, the enhanced `stream-diffs` surface is used; otherwise a plain `<pre>` is rendered.

## 3. Common install recipes

### Docs site or SSR-first app

```bash
pnpm add markstream-vue
```

Then continue with [Docs Site & VitePress](/guide/vitepress-docs-integration) if you are wiring a docs site, content hub, or VitePress theme.

### AI / chat UI with richer code blocks and diagrams

```bash
pnpm add markstream-vue stream-diffs mermaid katex
```

Then follow [AI Chat & Streaming](/guide/ai-chat-streaming) for `mode="chat"`, `content` streaming, `final` handling, and the optional `nodes` path when another layer owns parsing.

### Diagram-heavy content

```bash
pnpm add markstream-vue mermaid @terrastruct/d2 katex
```

### Everything enabled

```bash
pnpm add markstream-vue stream-diffs mermaid @terrastruct/d2 katex @antv/infographic
```

Infographic rendering is explicit opt-in. After installing `@antv/infographic`, follow [AntV Infographic](/guide/infographic) to configure `setInfographicLoader`.

## 4. CSS order matters as much as installation

The root JavaScript entry does not inject renderer styles. Import one published CSS subpath from your app entry or CSS pipeline, after resets and before app-specific overrides.

```ts
// main.ts
import 'markstream-vue/index.css'
```

For Tailwind or UnoCSS, keep Markstream styles in the component layer after reset/base styles:

```css
@import 'modern-css-reset';
@tailwind base;

@import 'markstream-vue/index.css' layer(components);
```

Use `markstream-vue/index.px.css` instead when your app intentionally scales the root font size on mobile. Use `markstream-vue/index.tailwind.css` only when you want the Tailwind-ready CSS variant.

Also import KaTeX CSS when you use math:

```ts
import 'katex/dist/katex.min.css'
```

`stream-diffs`, `mermaid`, and `@terrastruct/d2` do not need extra CSS imports from this package.

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
- If enhanced code blocks stay on `<pre>`, verify that `stream-diffs` is installed and that the `CodeBlockNode` block has completed streaming and entered the viewport. This timing is markstream-vue's adapter policy; the `stream-diffs` root runtime is framework-agnostic.
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
