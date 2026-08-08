---
title: markstream-vue vs vue-stream-markdown for AI chat Markdown
description: Compare markstream-vue and vue-stream-markdown for Vue 3 AI chat, LLM token streams, SSE, Nuxt SSR, Mermaid, KaTeX, code blocks, and long responses.
keywords:
  - markstream-vue vs vue-stream-markdown
  - vue-stream-markdown alternative
  - Vue streaming Markdown renderer
  - Vue AI chat Markdown
  - Vue LLM token stream Markdown
lastVerified: '2026-07-01'
markstreamVersion: '1.0.5-beta.1'
competitorVersion: 'vue-stream-markdown@1.0.1-beta.1'
faq:
  - question: Should I use vue-stream-markdown or markstream-vue for a small Vue chat UI?
    answer: Use vue-stream-markdown when you need a lightweight Vue streaming Markdown renderer and do not need heavy blocks, virtualization, or SSR-specific guidance.
  - question: When is markstream-vue the better fit?
    answer: Use markstream-vue when AI output includes Mermaid, KaTeX, streaming code blocks, long responses, safe HTML policy requirements, or Nuxt/VitePress integration.
  - question: Is this comparison claiming permanent feature gaps?
    answer: No. It is a point-in-time comparison based on documented behavior and package versions verified on 2026-07-01.
---
# markstream-vue vs vue-stream-markdown

> Last verified: 2026-07-01 against `markstream-vue@1.0.5-beta.1` and `vue-stream-markdown@1.0.1-beta.1`. Competitor capabilities may change. This page focuses on architecture and documented behavior rather than claiming permanent feature gaps.

## Summary

Both render streaming Markdown in Vue 3. `vue-stream-markdown` focuses on a lightweight Vue streaming experience. `markstream-vue` is broader: it handles AI chat mid-states, optional heavy blocks, long responses, Nuxt/VitePress integration, cross-framework parser behavior, and safe component rendering.

Choose by output shape, not by brand:

| Your Vue app needs | Better starting point |
| --- | --- |
| Small chat messages with basic Markdown | `vue-stream-markdown` |
| LLM token streams with unclosed fences, tables, math, or HTML-like tags | `markstream-vue` |
| Mermaid, KaTeX, diff-tracking code blocks, D2, or Infographic blocks | `markstream-vue` |
| Nuxt SSR or VitePress docs integration | `markstream-vue` |
| Long responses with bounded live nodes | `markstream-vue` |
| The smallest Vue streaming Markdown dependency | `vue-stream-markdown` |

## When to use vue-stream-markdown

Use `vue-stream-markdown` when:
- You need a lightweight Vue 3 streaming Markdown renderer
- You don't need Mermaid/KaTeX or diff-tracking code blocks
- You don't need virtualized long documents
- You want the smallest Vue streaming Markdown dependency
- Your Markdown is mostly paragraphs, lists, links, and basic code fences

## When to use markstream-vue

Use `markstream-vue` when:
- You need stable incomplete Markdown during LLM token streaming
- You need progressive Mermaid during streaming
- KaTeX math in AI output matters
- stream-diffs powered code blocks with diff tracking are needed
- Virtualized long documents (1MB+) are part of your use case
- Safe HTML policy without `v-html` is required
- Mobile WebView `px` CSS for root-font scaling matters
- Cross-framework consistency (same parser as React/Svelte/Angular) is valuable
- You need custom component overrides for specific node types

## Feature comparison

| | markstream-vue | vue-stream-markdown |
| --- | --- | --- |
| Streaming content | ✅ | ✅ |
| Incomplete Markdown | ✅ | ✅ |
| `content` + `nodes` input paths | ✅ both | content-focused |
| Progressive Mermaid | ✅ optional peer | ❌ |
| KaTeX math | ✅ optional peer | ❌ |
| Diff-tracking code blocks | ✅ `stream-diffs` | ❌ |
| Virtualization | ✅ | ❌ |
| Safe HTML policy | ✅ configurable | ⚠️ |
| Mobile px CSS | ✅ `index.px.css` | ❌ |
| Custom components | ✅ | ✅ |
| VitePress / Nuxt SSR | ✅ documented | ⚠️ |
| D2 / Infographic diagrams | ✅ optional peers | ❌ |

## Scenario comparison

### AI chat token streaming

For a small Vue chat UI where the answer is mostly text, `vue-stream-markdown` can be a good lightweight default.

Use `markstream-vue` when the stream includes syntax that is incomplete for most of the response lifetime: open code fences, partial tables, changing language tags, KaTeX delimiters, Mermaid fences, or trusted custom tags such as `thinking`.

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

defineProps<{
  content: string
  isDone: boolean
}>()
</script>

<template>
  <MarkdownRender
    mode="chat"
    :content="content"
    :final="isDone"
    :fade="false"
  />
</template>
```

### Nuxt and VitePress SSR

`markstream-vue` has documented Nuxt and VitePress paths. Standard Markdown can render during SSR, while browser-only optional peers such as Mermaid, KaTeX workers, or the enhanced code runtime can stay behind client boundaries.

Use the lighter renderer when the page is client-only and does not need SSR-first output.

### Long responses

If AI answers can grow beyond tens of kilobytes, renderer-level controls matter. `markstream-vue` includes node virtualization, viewport priority, and heavy-block deferral so long answers can stay scrollable without keeping every block fully active.

## Bundle and dependency notes

`markstream-vue` is larger at base because it includes the parser and rendering infrastructure. However, optional peers (Mermaid, KaTeX, stream-diffs, D2, Infographic) are only loaded when installed and imported. If you do not install or import those optional peers, their library payload is not part of the default dependency path.

`vue-stream-markdown` is smaller at base but offers fewer features. Choose based on your AI output requirements, not just bundle size.

## Migration cost

Moving from `vue-stream-markdown` to `markstream-vue` is usually a component replacement plus CSS import when you use the raw Markdown string path:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'
</script>

<template>
  <MarkdownRender :content="content" :final="isDone" :fade="false" />
</template>
```

Plan extra testing when your app uses custom renderers, syntax highlighting, SSR, or optional peers. Test unclosed fences, partial tables, long code blocks, Mermaid, KaTeX, and mobile WebView rendering before switching production chat surfaces.

## When not to use markstream-vue

Do not use `markstream-vue` just because it has more features. If your Vue app only renders short, plain streaming Markdown and bundle size is the dominant requirement, a smaller renderer can be the right choice.

## Verification

Last verified: 2026-07-01

Sources checked:
- [vue-stream-markdown package](https://www.npmjs.com/package/vue-stream-markdown)
- Markstream Vue docs and package metadata
- public examples and local smoke reproduction

Tested scenarios:
- incomplete code fences
- partial tables
- streaming Mermaid and KaTeX
- long response > 50 KB
- Nuxt/VitePress SSR import behavior

## Sources and references

- [vue-stream-markdown package](https://www.npmjs.com/package/vue-stream-markdown)
- [markstream-vue framework page](/frameworks/vue)
- [Vue AI chat Markdown renderer](/use-cases/vue-ai-chat-markdown-renderer)
- [SSE and WebSocket Markdown streaming](/use-cases/sse-websocket)
- [Long AI responses](/use-cases/long-ai-responses)
- [1.0 Benchmark Report](/guide/benchmark-1-0)

## Reproduce Markstream scenarios

These commands reproduce the Markstream streaming and performance scenarios used while writing this comparison. They are not a side-by-side benchmark against the alternative package.

```bash
pnpm benchmark:1.0
pnpm run test:e2e:main-playground-performance
```

Use Vue 3 streaming fixtures with unclosed fences, Mermaid, KaTeX, heavy code blocks, and long responses when validating the trade-offs.
