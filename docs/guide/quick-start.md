---
title: Vue Quick Start
description: Install markstream-vue and render static or streaming Markdown in a complete, copy-paste Vue 3 example.
keywords:
  - vue markdown quick start
  - markstream vue example
  - renderer css import
  - Vue AI streaming Markdown
---

# Vue Quick Start

This is the shortest complete Vue 3 setup. Install the package:

```bash
pnpm add markstream-vue
```

Import the renderer CSS once from your app entry:

```ts
// main.ts
import 'markstream-vue/index.css'
```

Then render Markdown. This example is copy-paste runnable:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const content = '# Hello World\n\nThis is **bold** and this is *italic*.'
</script>

<template>
  <MarkdownRender :content="content" />
</template>
```

## Stream an AI response

Keep one accumulated string and set `final` when the stream ends. `mode="chat"` selects the chat defaults, including smooth pacing and no fade, so you do not need to repeat those low-level props.

In Vue 3 (including Nuxt), `smooth-streaming` controls output pacing and `fade` controls opacity; they can be enabled together. `mode="chat"` keeps `fade=false` as a lightweight default. Add `fade` when gradual text reveal is desired; keep it off when animation cost matters more.

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const content = ref('')
const isDone = ref(false)

function appendChunk(chunk: string) {
  content.value += chunk
}

function finishStream() {
  isDone.value = true
}
</script>

<template>
  <MarkdownRender
    mode="chat"
    :content="content"
    :final="isDone"
  />
</template>
```

Call `appendChunk()` for each SSE, WebSocket, or LLM chunk and call `finishStream()` once at end-of-stream. Start with the `content` path; use pre-parsed `nodes` only when a worker, store, or custom AST pipeline already owns parsing.

## Add only the features you need

| Need | Install | Next guide |
| --- | --- | --- |
| Enhanced code and diff blocks | `pnpm add stream-diffs` | [Code blocks](/guide/code-blocks) |
| Mermaid diagrams | `pnpm add mermaid` | [Mermaid](/guide/mermaid) |
| KaTeX math | `pnpm add katex` | [Math](/guide/math) |
| Nuxt SSR | No extra package | [Nuxt SSR](/nuxt-ssr) |
| Tailwind or UnoCSS | No extra package | [Tailwind & styling](/guide/tailwind) |

Standard Markdown is SSR-safe in Nuxt. Add a client-only boundary only around features that initialize browser-only peers or workers; do not wrap the basic renderer by default.

Next, read [AI Chat & Streaming](/guide/ai-chat-streaming) for a complete integration path, or [Usage & API](/guide/usage) for `content` versus `nodes` and advanced integration.

<NextStep :items="[
  { text: 'Installation & Optional Peers', link: '/guide/installation' },
  { text: 'AI Chat & Streaming', link: '/guide/ai-chat-streaming' },
  { text: 'Component Gallery', link: '/components/' },
]" />
