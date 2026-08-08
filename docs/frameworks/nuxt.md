---
title: 'Nuxt streaming Markdown renderer for AI chat'
description: Use markstream-vue in Nuxt 3 for AI chat streaming Markdown, SSE/WebSocket output, SSR-first rendering, client-only peer setup, and worker setup.
softwareName: markstream-vue
softwarePackage: markstream-vue
npmPackage: markstream-vue
softwareFramework: Nuxt
softwareProgrammingLanguage:
  - TypeScript
  - Vue
softwareRuntimePlatform:
  - Nuxt 3
  - Vue 3
faq:
  - question: Should every Nuxt Markstream page use ClientOnly?
    answer: No. Standard Markdown can render during SSR. Use ClientOnly only around browser-only stream logic or optional peer setup.
  - question: Does markstream-vue support AI chat in Nuxt?
    answer: Yes. Use markstream-vue in client-side streaming surfaces and pass content, final, and streaming options.
  - question: Where should Nuxt worker setup live?
    answer: Configure Mermaid and KaTeX workers in a client plugin or other browser-only boundary.
---
# Nuxt streaming Markdown renderer for AI chat

`markstream-vue` works with Nuxt 3 for streaming Markdown in AI chat UIs, SSE/WebSocket output, SSR pages, and long documents. Standard Markdown can render during Nuxt SSR; browser-only optional peers upgrade after hydration.

## When to use markstream-vue with Nuxt

Use `markstream-vue` in Nuxt when:

- Your AI chat UI or streaming Markdown surface is in a Nuxt 3 app
- You need SSR-first Markdown output for SEO or first paint
- Browser-only optional peers need `.client` plugin setup
- Web Workers for Mermaid or KaTeX need Nuxt/Vite configuration
- Long AI responses need bounded live nodes

## Install

```bash
pnpm add markstream-vue
```

## SSR-first default

`markstream-vue` can render standard Markdown during Nuxt SSR. Heavy nodes such as Mermaid, D2, Infographic, stream-diffs enhanced code blocks, and worker-backed enhancements upgrade after hydration.

```vue
<!-- pages/index.vue -->
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const markdown = '# Hello Nuxt SSR'
</script>

<template>
  <MarkdownRender :content="markdown" final />
</template>
```

## When to use `<ClientOnly>`

Use `<ClientOnly>` only when your surrounding page logic or optional peer setup is browser-only:

```vue
<template>
  <ClientOnly>
    <MarkdownRender
      mode="chat"
      :content="streamingContent"
      :final="isDone"
      :fade="false"
    />
  </ClientOnly>
</template>
```

## Worker setup in Nuxt

Mermaid and KaTeX use Web Workers. In Nuxt, import them client-side:

```ts
// plugins/markstream.client.ts
import { setKaTeXWorker, setMermaidWorker } from 'markstream-vue'
import KatexWorker from 'markstream-vue/workers/katexRenderer.worker?worker&inline'
import MermaidWorker from 'markstream-vue/workers/mermaidParser.worker?worker&inline'

export default defineNuxtPlugin(() => {
  setMermaidWorker(new MermaidWorker())
  setKaTeXWorker(new KatexWorker())
})
```

`enableMermaid()` and `enableKatex()` control optional dependency loaders. Use `setMermaidWorker()` and `setKaTeXWorker()` when you want Mermaid parsing or KaTeX rendering to run off the main thread.

## Key considerations

- **SSR-first rendering**: standard Markdown renders server-side
- **Client-only peers**: use `.client` plugins or `<ClientOnly>` only when the surrounding logic is browser-only
- **CSS order**: import `markstream-vue/index.css` after your reset/tailwind
- **Hydration upgrades**: optional heavy peers activate after hydration
- **Mobile px CSS**: use `markstream-vue/index.px.css` if your app scales root font size

## Full guide

See [Nuxt SSR](/nuxt-ssr) for the complete Nuxt integration guide with SSR gotchas, worker setup, and performance notes.
