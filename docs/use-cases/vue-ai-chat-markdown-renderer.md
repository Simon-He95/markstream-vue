---
title: Vue AI chat Markdown renderer for LLM streams
description: Build a Vue 3 AI chat Markdown renderer for LLM token streams with stable incomplete Markdown, SSE/WebSocket updates, safe HTML, code blocks, Mermaid, KaTeX, and long responses.
lastUpdated: 2026-07-01
keywords:
  - Vue AI chat Markdown renderer
  - Vue LLM Markdown renderer
  - Vue SSE Markdown renderer
  - Vue WebSocket Markdown renderer
  - Vue streaming Markdown chat
  - markstream-vue AI chat
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
faq:
  - question: Does markstream-vue work with SSE and WebSocket chat streams?
    answer: Yes. Append streamed chunks to a growing content string, keep final false while the answer is still arriving, and set final true when the stream ends.
  - question: Can it render an unclosed code fence while the model is still writing?
    answer: Yes. markstream-vue keeps incomplete Markdown states readable, including unclosed fences, partial tables, math, and HTML-like tags.
  - question: Should I use markstream-vue for static Vue Markdown?
    answer: Use a simpler Markdown renderer for short static Markdown. Use markstream-vue when AI chat streaming, incomplete states, heavy blocks, or long responses matter.
---
# Vue AI chat Markdown renderer

`markstream-vue` is the Vue 3 renderer for AI chat surfaces where Markdown is visible while an LLM response is still streaming. It is useful when the message can contain code fences, tables, Mermaid diagrams, KaTeX math, HTML-like tags, or long reasoning output before the final chunk arrives.

## Install

```bash
pnpm add markstream-vue
```

```ts
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'
```

Use `index.px.css` instead of `index.css` for mobile WebViews where the host app changes root font scaling.

## Minimal Vue chat message

`mode="chat"` defaults to no fade to reduce animation work. For gradual text reveal, add `fade` to the examples below; Vue 3 supports it together with built-in smooth pacing.

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
  />
</template>
```

The two important props are `content` and `final`. Keep appending text to `content` while the stream is active. Set `final` to `true` only when the model has finished, so open fences, tables, math, and heavy blocks can settle into their final rendering.

## SSE chat stream example

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import 'markstream-vue/index.css'

const content = ref('')
const isDone = ref(false)

let source: EventSource | null = null

onMounted(() => {
  source = new EventSource('/api/chat/stream')
  source.onmessage = (event) => {
    if (event.data === '[DONE]') {
      isDone.value = true
      source?.close()
      return
    }

    const data = JSON.parse(event.data) as { content?: string }
    content.value += data.content ?? ''
  }
})

onBeforeUnmount(() => {
  source?.close()
})
</script>

<template>
  <MarkdownRender
    mode="chat"
    :content="content"
    :final="isDone"
    smooth-streaming="auto"
  />
</template>
```

## What this solves in AI chat

| Streaming state | What users should see |
| --- | --- |
| Unclosed <code>```ts</code> fence | A stable readable code block state, not the rest of the message swallowed unexpectedly |
| Partial table syntax | Text that does not flicker between paragraph and table |
| Partial KaTeX | Source text until the expression is complete enough to render |
| Mermaid diagram still growing | Progressive rendering when the diagram syntax becomes stable |
| Long reasoning answer | Bounded live nodes and viewport-aware heavy blocks when virtualization is enabled |

## Safe HTML policy

LLM output is external content. Start with escaped or safe HTML unless your server fully controls the Markdown.

```vue
<MarkdownRender
  mode="chat"
  :content="content"
  :final="isDone"
  html-policy="escape"
/>
```

Use custom components for trusted tags such as `thinking` when you want model-specific UI without enabling raw HTML.

## When to avoid markstream-vue

Use a smaller static renderer when the content is short, complete before display, and never includes heavy blocks or long streaming states. `markstream-vue` earns its weight when the user reads the answer while it is still being written.

## Next steps

- Rendering raw LLM chunks? Read [LLM token stream Markdown](/use-cases/llm-token-stream-markdown).
- Transport is SSE or WebSocket? Read [SSE and WebSocket streaming](/use-cases/sse-websocket).
- Comparing Vue alternatives? Read [markstream-vue vs vue-stream-markdown](/compare/vue-stream-markdown).
- Handling long answers? Read [Long AI responses](/use-cases/long-ai-responses).
