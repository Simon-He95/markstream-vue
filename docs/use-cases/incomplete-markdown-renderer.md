---
title: Incomplete Markdown renderer for AI chat streams
description: Render incomplete Markdown from LLM token streams without broken code fences, partial tables, invalid math, or unstable HTML states.
lastUpdated: 2026-07-01
keywords:
  - incomplete Markdown renderer
  - partial Markdown renderer
  - unclosed code fence renderer
  - AI chat incomplete Markdown
  - LLM streaming Markdown mid-state
faq:
  - question: Why does incomplete Markdown matter for AI chat?
    answer: LLM output is incomplete for most of the stream, so code fences, tables, math, links, and HTML may be half-written while users are already reading.
  - question: Does Markstream require buffering until the final message?
    answer: No. Markstream can render useful mid-states during streaming, then settle into the final Markdown rendering when final is true.
  - question: Should every partial token be rendered immediately?
    answer: No. Batch tiny chunks at animation-frame or small interval cadence so parsing and layout work stay predictable.
---
# Incomplete Markdown renderer for AI chat streams

LLM responses often contain Markdown that is not complete yet. A message can spend seconds in states such as an unclosed code fence, a partial table row, a half-written KaTeX expression, or an opening HTML tag with no close tag. Markstream is built for those mid-stream states.

## Problem

Static Markdown renderers are optimized for complete input. During a token stream, the same content may change shape repeatedly:

| Partial input | Common failure mode |
| --- | --- |
| Unclosed <code>```ts</code> fence | The rest of the message becomes a code block |
| Partial table header row | A partial table flickers between paragraph and table |
| `$$ E = mc` | Math renderer throws or shows noisy errors |
| `<details><summary>Plan` | HTML parsing can produce unstable output |

## Minimal Vue example

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'
import 'markstream-vue/index.css'

const content = ref('')
const isDone = ref(false)

async function appendChunk(chunk: string) {
  content.value += chunk
}
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

Set `final` to `true` only after the stream ends. That gives the parser one clear point to settle incomplete fences, tables, math, and HTML into their final rendering.

## Handling common mid-states

### Unclosed code fences

Markstream keeps an unclosed fence readable instead of treating the rest of the document as finalized highlighted code. When the closing fence arrives, the code block renderer upgrades to the enhanced `stream-diffs` surface or a plain `pre` block depending on your setup.

### Partial tables

Incomplete table syntax is kept stable until enough rows exist to render a table. This avoids the paragraph-to-table-to-paragraph flicker that shows up in fast LLM streams.

### Partial math

KaTeX rendering is deferred until inline or block math is complete enough to parse. Users see the source text during the incomplete phase instead of transient math errors.

### Incomplete HTML

Use `htmlPolicy="escape"` for untrusted model output, or the default safe policy for a constrained rendered subset. Use `trusted` only for content you control.

## Performance notes

- Buffer very small tokens and commit at animation-frame cadence.
- Prefer `fade={false}` or `:fade="false"` in chat surfaces so opacity animation does not restart on each update.
- Use the `nodes` path only when another layer already owns parsing, batching, or worker execution.
- Enable virtualization for long answers that keep growing beyond tens of kilobytes.

## When not to use Markstream

Use a simpler renderer when content is always short, complete before display, and never includes heavy blocks such as Mermaid, math, or code. Markstream is most useful when the UI must stay stable while Markdown is still being written.

## Related guides

- [AI chat streaming Markdown](/use-cases/ai-chat-streaming)
- [SSE and WebSocket Markdown streaming](/use-cases/sse-websocket)
- [Streaming code blocks](/use-cases/streaming-code-blocks)
- [Security](/guide/security)
