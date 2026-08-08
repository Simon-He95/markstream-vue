---
description: Use markstream-vue in Nuxt SSR with server-rendered HTML, stable fallbacks, and client enhancement for rich nodes.
---

# Nuxt 3 SSR usage (example)

> 中文版请查看 [Nuxt 3 SSR（中文）](/zh/nuxt-ssr)。

`markstream-vue` can now render directly during Nuxt SSR. You do not need to wrap `<MarkdownRender>` in `<client-only>` just to stay safe.

The SSR model is:

- Standard markdown, HTML, links, tables, footnotes, and images render on the server.
- Code blocks render a stable server `<pre><code>` fallback first, then enhance to the `stream-diffs`-backed `CodeBlockNode` surface on the client (or stay as `pre` when `stream-diffs` is absent).
- Math can render real KaTeX HTML on the server when you provide a synchronous KaTeX loader.
- Mermaid, D2, and Infographic render readable SSR fallbacks first, then enhance on the client.
- Scoped custom component overrides, custom node types, and trusted `customHtmlTags` also render on the server.

## Minimal SSR page

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const markdown = ref(`
# Hello from Nuxt SSR

Inline math: $E = mc^2$

\`\`\`ts
export const greet = (name: string) => \`hello \${name}\`
\`\`\`

\`\`\`mermaid
graph TD
  SSR --> Hydration
\`\`\`
`.trim())
</script>

<template>
  <MarkdownRender :content="markdown" :final="true" />
</template>
```

This gives you server HTML immediately. Heavy nodes still upgrade after hydration, but the first response is not an empty shell.

## Pre-parsed nodes and custom components

SSR also works when you render from `nodes` instead of `content`, or when you register scoped custom components.

```ts
import { setCustomComponents } from 'markstream-vue'
import { defineComponent, h } from 'vue'

setCustomComponents('docs-ssr', {
  thinking: defineComponent({
    props: {
      node: { type: Object, required: true },
    },
    setup(props) {
      return () => h('aside', { 'data-ssr-thinking': '1' }, String((props.node as any).content ?? ''))
    },
  }),
})
```

```vue
<template>
  <MarkdownRender
    custom-id="docs-ssr"
    content="<thinking>Server custom tag</thinking>"
    :custom-html-tags="['thinking']"
    :final="true"
  />
</template>
```

Use `nodes + final` when you already have pre-parsed AST content on the server and want deterministic SSR without re-parsing in the browser.

## Server-rendered math with KaTeX

If you want KaTeX HTML in the SSR response, register a sync loader in your Nuxt app:

```ts
import katex from 'katex'
import { enableKatex } from 'markstream-vue'

enableKatex(() => katex)
```

Without that loader, math still stays SSR-safe and falls back to readable raw text.

## When to still use `<client-only>`

You usually do not need it anymore for the renderer itself.

Use `<client-only>` only when your own page logic is browser-only, or when you intentionally want to skip SSR for a whole region.

## Nuxt playground

This repository ships with a Nuxt playground in `playground-nuxt/`.

```bash
pnpm install
pnpm play:nuxt
```

The dedicated SSR verification route is:

- `/ssr-lab`

It contains a fixed matrix for:

- basic markdown + HTML SSR
- rich-node SSR fallback
- hydration-time enhancement
- disabled-enhancement fallback
- custom-tag and scoped override validation

## SSR regression command

Run the dedicated Nuxt SSR regression suite with:

```bash
pnpm test:e2e:nuxt-ssr
```

That command verifies both:

- `nuxt dev`
- `nuxt build && nuxt preview`

Each mode checks the raw HTTP HTML for `/ssr-lab`, then opens the page in a browser to verify hydration and enhancement stability.

## Library-level SSR regression coverage

The repository also keeps a direct `renderToString` regression suite for the renderer itself:

```bash
pnpm test --run test/ssr-render-to-string.test.ts test/ssr-import.test.ts
```

That suite explicitly covers:

- a built-in node matrix for lighter SSR nodes such as headings, paragraphs, inline formatting, links, lists, tables, footnotes, admonitions, and `vmr_container`
- the standalone `CodeBlockNode` shell during SSR
- scoped built-in overrides via `setCustomComponents`
- direct custom node types rendered through `nodes`
- trusted custom tags wired through `customHtmlTags`
