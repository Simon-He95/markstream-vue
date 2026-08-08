---
title: 'Vue 2 streaming Markdown renderer for AI chat'
description: Use markstream-vue2 in Vue 2.6 and Vue 2.7 legacy apps for AI chat streaming Markdown, LLM token streams, SSE/WebSocket output, incomplete Markdown, Mermaid, KaTeX, enhanced code blocks, and Vue 2 component rendering.
keywords:
  - markstream-vue2
  - Vue 2 streaming Markdown renderer
  - Vue2 Markdown renderer
  - Vue 2 AI chat Markdown
  - Vue 2 LLM Markdown renderer
  - Vue2 SSE Markdown
  - Vue2 WebSocket Markdown
  - Vue2 incomplete Markdown
  - Vue2 Mermaid Markdown
  - Vue2 KaTeX Markdown
  - Vue2 code blocks
  - legacy Vue 2 Markdown renderer
softwareName: markstream-vue2
softwarePackage: markstream-vue2
npmPackage: markstream-vue2
softwareFramework: Vue 2
softwareProgrammingLanguage:
  - TypeScript
  - Vue
softwareRuntimePlatform:
  - Vue 2.6
  - Vue 2.7
  - Nuxt 2
faq:
  - question: Should I use markstream-vue2 for a new Vue project?
    answer: No. Use markstream-vue for Vue 3 and new Nuxt projects. markstream-vue2 exists for legacy Vue 2.6 and Vue 2.7 apps.
  - question: Does markstream-vue2 work with Vue 2.6?
    answer: Yes, but Vue 2.6 apps must install and register @vue/composition-api before using the renderer.
  - question: When is markstream-vue2 better than a normal Vue Markdown renderer?
    answer: Use markstream-vue2 when Markdown is still streaming from an LLM, SSE, or WebSocket, or when incomplete Markdown states, long output, Mermaid, KaTeX, or code blocks need stable rendering.
---
# Vue 2 streaming Markdown renderer for AI chat

`markstream-vue2` is the Vue 2.6 / 2.7 renderer in the Markstream family. Use it when a legacy Vue 2 app needs AI chat Markdown, LLM token streams, SSE/WebSocket output, incomplete Markdown state handling, Mermaid, KaTeX, enhanced code blocks, or Vue 2 component rendering.

For Vue 3, Nuxt 3, or a new project, start with [`markstream-vue`](/frameworks/vue) instead.

## When to use markstream-vue2

Use `markstream-vue2` when:

- The app must stay on Vue 2.6 or Vue 2.7
- Markdown streams from an LLM, SSE endpoint, or WebSocket
- Unclosed fences, partial math, or partial HTML-like tags should not flicker
- Long AI responses need bounded live rendering
- Mermaid, KaTeX, and code blocks appear during streaming
- Custom Vue 2 node components need to render inside Markdown

Use a simpler Vue Markdown renderer when:

- The app only renders short completed Markdown
- You only need `markdown -> HTML`
- The project can migrate to Vue 3 and use `markstream-vue`

## Quick Start

```bash
pnpm add markstream-vue2
```

Vue 2.6 apps also need:

```bash
pnpm add @vue/composition-api
```

```js
import VueCompositionAPI from '@vue/composition-api'
import { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueCompositionAPI)
Vue.use(VueRendererMarkdown)
```

Vue 2.7 apps do not need `@vue/composition-api`, but should still install the renderer plugin:

```js
import { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueRendererMarkdown)
```

Minimal Vue 2 message component:

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  props: { content: String, done: Boolean },
}
</script>

<template>
  <MarkdownRender :content="content" :final="done" :fade="false" />
</template>
```

Vue CLI 4 / Webpack 4 projects should use the real CSS file path because Webpack 4 does not support `package.json#exports`:

```js
import 'markstream-vue2/dist/index.css'
```

## Streaming example

For normal chat streaming, append chunks to `content` and flip `final` when the stream ends:

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data: () => ({ content: '', final: false }),
}
</script>

<template>
  <MarkdownRender :content="content" :final="final" :fade="false" />
</template>
```

For high-frequency long streams, use the parser/node path described in the [Vue 2 quick start](/guide/vue2-quick-start) so parsing cadence stays under your control.

## Mermaid, KaTeX, and code blocks

Install optional peers only for the blocks you render. Enhanced code blocks use the optional `stream-diffs` peer and fall back to a plain `<pre>` when it is not installed:

```bash
pnpm add stream-diffs
```

For Mermaid diagrams, install `mermaid`. For KaTeX math, install `katex` and import its stylesheet:

```bash
pnpm add mermaid
pnpm add katex
```

```js
import 'katex/dist/katex.min.css'
```

The default Mermaid and KaTeX loaders are enabled. Use `enableMermaid()` or `enableKatex()` only after disabling them or when providing a custom loader.

## Compared with Vue Markdown renderers

| Need | markstream-vue2 | Normal Vue Markdown renderer |
| --- | --- | --- |
| Vue 2.6 / 2.7 support | Yes | Varies by package |
| Streaming AI chat | Built for accumulating `content` and optional `nodes` | Usually rerenders completed Markdown |
| Incomplete Markdown | Streaming-aware mid-state handling | Often unstable while syntax is incomplete |
| Mermaid / KaTeX / code blocks | Markstream integrations and optional peers | Plugin dependent |
| New Vue 3 projects | Use `markstream-vue` instead | Use a Vue 3 package |

## Try it

- [Vue 2 playground](https://markstream-vue2.pages.dev/)
- [Vue 2 quick start](/guide/vue2-quick-start)
- [Vue 2 installation](/guide/vue2-installation)
- [Framework overview](/frameworks/)
- [npm package](https://www.npmjs.com/package/markstream-vue2)
