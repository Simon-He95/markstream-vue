---
title: 'Vue streaming Markdown renderer for AI chat, SSE, WebSocket, and Nuxt'
description: Use markstream-vue to render LLM token streams, SSE/WebSocket Markdown, incomplete code fences, Mermaid, KaTeX, and long AI responses in Vue 3, Nuxt, and VitePress.
ogImage: /og/vue-streaming.png
ogImageAlt: Vue streaming Markdown renderer for AI chat, SSE, WebSocket, and Nuxt
keywords:
  - markstream-vue
  - Vue streaming Markdown renderer
  - Nuxt streaming Markdown renderer
  - VitePress Markdown renderer
  - Vue AI chat Markdown
  - Vue SSE Markdown
  - Vue WebSocket Markdown
  - Vue incomplete Markdown
  - Vue Mermaid Markdown
  - Vue KaTeX Markdown
softwareName: markstream-vue
softwarePackage: markstream-vue
npmPackage: markstream-vue
softwareFramework: Vue
softwareProgrammingLanguage:
  - TypeScript
  - Vue
softwareRuntimePlatform:
  - Vue 3
  - Nuxt
  - VitePress
faq:
  - question: Is Markstream only for Vue?
    answer: No. Markstream includes Vue, React, Svelte, Angular, Vue 2, parser, and core packages, but markstream-vue is the most mature renderer.
  - question: Should I use markstream-vue for short static Markdown?
    answer: Use a simpler Markdown stack for short static Markdown. Use markstream-vue when streaming UX, incomplete Markdown states, long content, or heavy blocks matter.
  - question: Does markstream-vue work with Nuxt SSR?
    answer: Yes. Standard Markdown can render during Nuxt SSR, while browser-only optional peers upgrade after hydration.
---
# Vue and Nuxt streaming Markdown renderer for AI chat

`markstream-vue` renders Markdown that updates while an LLM response is streaming. Use it for Vue 3, Nuxt, VitePress, SSE, WebSocket, AI chat UIs, long Markdown answers, progressive Mermaid diagrams, KaTeX math, and streaming code blocks.

## When to use markstream-vue

Use `markstream-vue` when:

- Content streams from an LLM, SSE, or WebSocket
- Incomplete Markdown states must not flicker
- Long AI responses or long documents matter
- Mermaid/KaTeX/code blocks appear during streaming
- You need Vue/Nuxt/VitePress component rendering
- You want raw `content` and pre-parsed `nodes` both supported
- Mobile WebView `px` CSS for root-font scaling matters
- You need a safe HTML policy without `v-html`

Use a simpler alternative when:

- You only render short static Markdown in Vue
- You already have a sanitizer/plugin setup and don't need streaming UX

## Quick Start

```bash
pnpm add markstream-vue
```

```vue
<script setup>
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'
</script>

<template>
  <MarkdownRender
    mode="chat"
    :content="streamingContent"
    :final="isDone"
    smooth-streaming="auto"
    :fade="false"
  />
</template>
```

## Key capabilities

- **Two input paths**: `content` for raw Markdown strings and `nodes` for pre-parsed AST
- **Safe HTML policy**: `safe` by default, `escape` for literal text, `trusted` for trusted content only — no `v-html` required
- **Progressive Mermaid**: diagrams render incrementally during streaming
- **Streaming code blocks**: `stream-diffs` File/Diff surfaces or lightweight Shiki rendering
- **Virtualized long documents**: bounded live nodes for 1MB+ content
- **Optional peers**: `stream-diffs`, `stream-markdown`, Mermaid, KaTeX, D2, Infographic — install only what you need
- **Mobile-ready**: `index.px.css` for apps that scale root font size
- **SSR-safe**: worker imports and client-only guards for Nuxt/VitePress

## Framework integration

| Integration | Guide |
| --- | --- |
| Vue 3 | [Installation](/guide/installation) |
| Nuxt | [Nuxt SSR](/nuxt-ssr) |
| VitePress | [Docs Site & VitePress](/guide/vitepress-docs-integration) |
| AI Chat / SSE | [AI Chat & Streaming](/guide/ai-chat-streaming) |

## Optional peers

```bash
pnpm add mermaid katex   # diagrams and math
pnpm add stream-diffs     # enhanced File/Diff code blocks
pnpm add @antv/infographic @terrastruct/d2  # additional diagram types
```

## Try it

- [Live playground](https://markstream-vue.simonhe.me/)
- [Nuxt playground](https://markstream-nuxt.pages.dev/)
- [Full documentation](/guide/)

## Next steps

- Building a Vue AI chat UI? Read [Vue AI chat Markdown renderer](/use-cases/vue-ai-chat-markdown-renderer).
- Rendering raw LLM chunks? Read [LLM token stream Markdown](/use-cases/llm-token-stream-markdown).
- Need Nuxt SSR? Read [Nuxt streaming Markdown renderer](/frameworks/nuxt).
- Comparing Vue alternatives? Read [markstream-vue vs vue-stream-markdown](/compare/vue-stream-markdown).
