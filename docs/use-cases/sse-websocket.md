---
title: SSE and WebSocket Markdown streaming — use Markstream for real-time AI output
description: Render Markdown from SSE and WebSocket streams in Vue, React, Svelte, and Angular. Patterns for token-by-token rendering, batched updates, and graceful incomplete states.
keywords:
  - SSE Markdown renderer
  - WebSocket Markdown renderer
  - real-time AI Markdown
  - streaming Markdown transport
  - token stream batching
  - incomplete Markdown rendering
faq:
  - question: Should an SSE or WebSocket app update Markdown on every token?
    answer: No. Buffer tiny chunks and commit at animation-frame or small batch cadence so the renderer parses fewer intermediate states.
  - question: Does Markstream require SSE specifically?
    answer: No. Markstream receives Markdown content or nodes, so the same rendering path works for SSE, WebSocket, fetch streams, or custom transports.
  - question: What should happen when the server sends the final chunk?
    answer: Mark the message as final so incomplete fences, tables, math, and other streaming mid-states can settle into their final rendering.
---
# SSE and WebSocket Markdown streaming

## Why streaming Markdown is different

SSE (Server-Sent Events) and WebSocket deliver text incrementally. When that text is Markdown, you need a renderer that:

- Handles **unclosed syntax** (code fences, math blocks, HTML tags)
- **Minimizes DOM thrash** during high-frequency updates
- Lets you control parse frequency through batching and `nodes` mode
- Supports **progressive heavy blocks** (Mermaid, KaTeX, code)

## SSE example (Vue 3)

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import 'markstream-vue/index.css'

const content = ref('')
const isDone = ref(false)

let eventSource: EventSource | null = null

onMounted(() => {
  eventSource = new EventSource('/api/chat/stream')
  eventSource.onmessage = (event) => {
    if (event.data === '[DONE]') {
      isDone.value = true
      eventSource?.close()
      return
    }

    const data = JSON.parse(event.data) as { content?: string }
    content.value += data.content ?? ''
  }
})

onBeforeUnmount(() => {
  eventSource?.close()
})
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

## SSE example (React)

```tsx
import MarkdownRender from 'markstream-react'
import { useEffect, useState } from 'react'
import 'markstream-react/index.css'

export function SSEStreamView() {
  const [content, setContent] = useState('')
  const [isDone, setIsDone] = useState(false)

  useEffect(() => {
    const es = new EventSource('/api/chat/stream')
    es.onmessage = (e) => {
      if (e.data === '[DONE]') {
        setIsDone(true)
        es.close()
      }
      else {
        setContent(prev => prev + JSON.parse(e.data).content)
      }
    }
    return () => es.close()
  }, [])

  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

## WebSocket example

```tsx
// WebSocket — same pattern as SSE, different transport
const ws = new WebSocket('wss://api.example.com/chat/stream')
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  if (data.done)
    setIsDone(true)
  else setContent(prev => prev + data.content)
}
```

## Performance tips

### 1. Batch updates

Don't render on every single token. Buffer chunks and update at ~30-60fps.

```tsx
const bufferRef = useRef('')
const frameRef = useRef<number>()

ws.onmessage = (event) => {
  bufferRef.current += JSON.parse(event.data).content
  if (!frameRef.current) {
    frameRef.current = requestAnimationFrame(() => {
      setContent(prev => prev + bufferRef.current)
      bufferRef.current = ''
      frameRef.current = undefined
    })
  }
}
```

### 2. Use the nodes path for high-frequency streams

```tsx
import MarkdownRender from 'markstream-react'
import { useMemo } from 'react'
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

function StreamedMarkdown({
  messageId,
  content,
  isDone,
}: {
  messageId: string
  content: string
  isDone: boolean
}) {
  const md = useMemo(() => getMarkdown(`sse-message-${messageId}`), [messageId])
  const nodes = useMemo(
    () => parseMarkdownToStructure(content, md, { final: isDone }),
    [content, isDone, md],
  )

  return <MarkdownRender nodes={nodes} final={isDone} />
}
```

### 3. Control pacing

```tsx
<MarkdownRender
  content={content}
  final={isDone}
  smoothStreaming="auto" // smooth pacing
  fade={false} // omit opacity animation work
  deferNodesUntilVisible // lazy render off-screen nodes
/>
```

## Handling incomplete states

Markstream renders these gracefully:

| Partial state | Behavior |
| --- | --- |
| `` ```js ` (unclosed fence) | Renders as plain text until fence completes |
| `$$ E = mc` (partial math) | Renders as plain text until `$$` closes |
| `| Header |` (partial table) | Renders as text until table syntax is valid |
| `<thinking>` (unclosed HTML) | Renders as text until tag closes (or according to safe HTML policy) |

## Security for streamed content

When streaming from an LLM, the content may include HTML. Use the safe HTML policy:

```tsx
<MarkdownRender
  content={content}
  htmlPolicy="escape" // escape all HTML (safest)
  // or htmlPolicy="safe" (default: sanitized rendering)
  // or htmlPolicy="trusted" for trusted content only
/>
```

## Full guides

- [LLM token stream Markdown](/use-cases/llm-token-stream-markdown)
- [Vue AI chat Markdown renderer](/use-cases/vue-ai-chat-markdown-renderer)
- [AI Chat & Streaming](/guide/ai-chat-streaming)
- [Performance](/guide/performance)
- [Security](/guide/security)
