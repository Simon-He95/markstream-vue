---
title: AI chat streaming Markdown with markstream-vue
description: Build AI chat and streaming Markdown UIs with content, built-in smooth streaming, performance guidance, trusted custom tags, and SSR-safe setup.
keywords:
  - AI chat Markdown renderer
  - Vue AI chat streaming
  - SSE Markdown renderer
  - LLM token stream Markdown
  - smooth streaming Markdown
  - markstream-vue chat
---

# AI Chat & Streaming

Use this path when you are building a chat UI, token stream, SSE response viewer, or any screen where Markdown updates frequently while the user is watching.

<PrereqChips :items="[
  { text: 'Vue Quick Start', link: '/guide/quick-start' },
  { text: 'Installation & Optional Peers', link: '/guide/installation' },
]" />

If you only render static articles or docs pages, go back to [Usage & Streaming](/guide/usage) and prefer the simpler `content` path.

## 1. Choose the leanest install

| Need | Packages | Best for |
| --- | --- | --- |
| Text-only or lightweight chat UI | `markstream-vue` | Basic Markdown, lists, links, blockquotes |
| Plain (SSR-friendly) code blocks | `markstream-vue` (`render-code-blocks-as-pre`) | Lower bundle budgets, SSR-friendly transcripts |
| Rich code interactions | `markstream-vue stream-diffs` | Copy, preview, syntax highlighting, and File/Diff surfaces |
| Diagrams or math in chat output | `markstream-vue mermaid katex` | Mermaid fences and KaTeX formulas |

Install only the peers you actually expect to show up in responses.

## 2. Recommended data flow

For jittery token streams, use built-in smooth pacing on `MarkdownRender`.

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const streamedText = ref('')
const final = ref(false)
</script>

<template>
  <MarkdownRender
    mode="chat"
    :content="streamedText"
    :final="final"
  />
</template>
```

Why this path works better:

- Incoming chunks can be bursty while visible output remains steady.
- Backlog-aware pacing speeds up automatically when pending text grows.
- Final parsing waits for visible content to catch up, so end-of-stream settling is stable.
- `mode="chat"` selects the streaming defaults, including `max-live-nodes="0"`, smooth pacing, incremental batches, and no fade.
- In Vue 3 (including Nuxt), `smooth-streaming` controls output pacing and `fade` controls opacity; they can be enabled together. `mode="chat"` keeps `fade=false` as a lightweight default. Add `fade` when gradual text reveal is desired; keep it off when animation cost matters more.
- Add `custom-id="chat"` only when you need scoped styles or component overrides. Add `typewriter` only when you want a visible cursor.

Turn it off per surface with `:smooth-streaming="false"` if you want raw chunk cadence. If you already parse in a worker/store and need AST control, keep using `nodes` + `final`.

## 3. Renderer settings that usually work well

- Keep the `chat` preset for normal messages. For one measured, extremely long message, set a positive `maxLiveNodes` value to enable a bounded node window; use `MarkstreamVirtualTimeline` to virtualize a long list of messages.
- Use `renderCodeBlocksAsPre` when code fences appear often but the enhanced code surface is too heavy for your chat UI.
- Leave heavy peers off until you need them. Chat UIs get a large win from not shipping Mermaid, KaTeX, or `stream-diffs` by default.
- The `chat` preset already selects batching defaults for `max-live-nodes="0"`. Tune individual batching props only after profiling a real workload.

## 4. Common upgrade paths

### Auto-scroll a live chat without per-token scroll writes

If the chat should follow the latest assistant output, use `useStickToBottom`. It batches scroll writes with `requestAnimationFrame`, preserves bottom intent across layout-driven scroll events, and stops following on the user's first upward wheel, touch, keyboard, or scrollbar action. Avoid `scrollIntoView({ behavior: 'smooth' })` on every chunk; it creates overlapping scroll animations during streaming.

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { useStickToBottom } from 'markstream-vue/utils'
import { computed, nextTick, ref, watch } from 'vue'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  final: boolean
}

const messages = ref<ChatMessage[]>([])
const scrollRoot = ref<HTMLElement | null>(null)
const contentRoot = ref<HTMLElement | null>(null)
const { bottomPinned, scheduleScrollToBottom } = useStickToBottom(scrollRoot, contentRoot)

const latestOutputSignal = computed(() => {
  const latest = messages.value[messages.value.length - 1]
  return latest
    ? `${messages.value.length}:${latest.id}:${latest.content.length}:${latest.final}`
    : '0'
})

watch(
  latestOutputSignal,
  async () => {
    await nextTick()
    scheduleScrollToBottom()
  },
  { flush: 'post' },
)
</script>

<template>
  <div ref="scrollRoot" class="chat-scroll" tabindex="0">
    <div ref="contentRoot" class="chat-list">
      <article
        v-for="message in messages"
        :key="message.id"
        class="chat-message"
        :class="`chat-message--${message.role}`"
      >
        <MarkdownRender
          v-if="message.role === 'assistant'"
          custom-id="chat"
          mode="chat"
          :content="message.content"
          :final="message.final"
          :smooth-streaming="message.final ? false : 'auto'"
          fade
          :typewriter="!message.final"
          v-bind="message.final ? {} : { maxLiveNodes: 0 }"
        />
        <p v-else class="user-text">
          {{ message.content }}
        </p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.chat-scroll {
  height: min(70vh, 720px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.chat-list {
  display: flex;
  min-height: 100%;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.chat-message {
  max-width: min(720px, 88%);
}

.chat-message--user {
  align-self: flex-end;
}

.chat-message--assistant {
  align-self: flex-start;
}
</style>
```

The important details are:

- `latestOutputSignal` watches the last message, so a long transcript does not trigger deep watchers on every token.
- `nextTick()` waits for the current Vue render pass before reading `scrollHeight`; later smooth-streaming frames are handled by `ResizeObserver`.
- `requestAnimationFrame` coalesces many chunk updates into at most one scroll write per frame.
- `ResizeObserver` catches late height changes from images, KaTeX, code blocks, and fonts while the user is still bottom-pinned.
- `bottomPinned` turns off auto-follow when the user scrolls up, then turns it back on when they return near the bottom.
- For an already-loaded transcript, choose separately whether first mount should jump to the latest message or restore a saved scroll position.

For long mixed timelines, prefer the built-in virtual timeline. Its default `stick-to-bottom="auto"` follows the same product behavior: follow while pinned, respect manual scrollback.

```vue
<MarkstreamVirtualTimeline
  :items="timelineItems"
  :thread-key="activeThreadId"
  stick-to-bottom="auto"
/>
```

### Better code blocks

- Want a lighter surface: set `render-code-blocks-as-pre` on `MarkdownRender` for plain `<pre>` output.
- Want richer preview/diff controls: install `stream-diffs`; the built-in `CodeBlockNode` uses it automatically.
- Want an application-owned renderer: register a scoped `code_block` with `setCustomComponents`. Mermaid, D2, and Infographic use their own component keys.

See [Renderer & Node Components](/guide/components) for the trade-offs.

### Trusted tags such as `thinking`

Use `custom-html-tags` plus `setCustomComponents('chat', mapping)` so custom tags only affect the chat surface.

See [Custom Tags & Advanced Components](/guide/custom-components).

### Scoped overrides for one message surface

Use `setCustomComponents('chat', { image: ChatImageNode })` and render with `custom-id="chat"`.

See [Override Built-in Components](/guide/component-overrides).

## 5. CSS and SSR checklist

- Load your reset first, then use `@import 'markstream-vue/index.css' layer(components);`.
- Import `katex/dist/katex.min.css` only if math is enabled.
- Gate browser-only peers such as Mermaid, D2, or the enhanced code runtime behind client-only boundaries in SSR setups.
- If styles leak, scope your chat tweaks under `[data-custom-id="chat"]`.

Start here when visuals look wrong: [Troubleshooting](/guide/troubleshooting#css-looks-wrong-start-here)

## 6. Manual composable usage with `nodes`

If you parse `nodes` yourself (worker, store, or custom AST pipeline), the built-in smooth streaming inside `MarkdownRender` does **not** activate — it only applies to the `content` path. Use `useSmoothMarkdownStream` directly to pace the raw text before parsing.

```ts
import { getMarkdown, parseMarkdownToStructure, useSmoothMarkdownStream } from 'markstream-vue'
import { ref, watch } from 'vue'

const stream = useSmoothMarkdownStream()

// Feed incoming chunks from your event source
eventSource.onmessage = (event) => {
  stream.enqueue(event.data)
}

eventSource.addEventListener('done', () => {
  stream.finish()
})

// Parse only the visible portion; final parsing waits until caught up
declare const messageId: string
const md = getMarkdown(`chat-${messageId}`)
const nodes = ref([])

watch([stream.visible, stream.final], () => {
  nodes.value = parseMarkdownToStructure(stream.visible.value, md, {
    final: stream.final.value,
  })
})
```

The composable returns reactive refs: `visible`, `source`, `caughtUp`, and `final`. Use `visible` for rendering and wait until `caughtUp` is `true` before considering the stream complete.

## 7. Streaming vs recovering history — switching props at runtime

In a chat UI the same `MarkdownRender` instance typically handles two very different modes:

- **Streaming**: the model is generating tokens in real-time — `content` grows incrementally, `final` is `false`.
- **Recovering history**: a previously completed message is loaded from cache or a store — the full Markdown string is available immediately.

Pacing depends on whether content is still arriving. Fade is an independent visual choice; the following Vue 3 examples enable it during both streaming and history display. Keep it disabled when lower animation cost is preferred.

### Streaming (tokens arriving in real-time)

```vue
<MarkdownRender
  mode="chat"
  :content="streamedText"
  :final="false"
  smooth-streaming="auto"
  fade
  :typewriter="true"
  :max-live-nodes="0"
/>
```

- `smooth-streaming="auto"` paces the visible output so bursty chunks appear steadily. It already gives the "text appears gradually" effect at the content layer.
- `fade` opts into Vue 3's 200 ms append reveal. Existing batches finish naturally while later text arrives. It can run alongside pacing; `mode="chat"` leaves it off by default to reduce animation work.
- `typewriter=true` adds a blinking cursor at the end of the stream.
- `max-live-nodes=0` disables virtualization and enables incremental/batched rendering for streaming.

### Recovering history (complete Markdown loaded at once)

```vue
<MarkdownRender
  mode="chat"
  :content="historyText"
  :final="true"
  :smooth-streaming="false"
  :fade="true"
  :typewriter="false"
/>
```

- `smooth-streaming=false` because the content is already complete — pacing would artificially slow down a message the user wants to see immediately.
- `fade=true` gives each paragraph and node a polished opacity entry animation (280 ms), which works well because content only arrives once, not every frame.
- `typewriter=false` — no cursor needed for completed messages.
- `final=true` tells the parser this is the complete document, so it won't leave trailing delimiters in a loading state.

### Dynamic switching in one component

A typical pattern is a single `MarkdownRender` that starts in streaming mode and switches to history mode when the response completes:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { computed, ref } from 'vue'

const content = ref('')
const final = ref(false)
const isStreaming = computed(() => !final.value)
</script>

<template>
  <MarkdownRender
    custom-id="chat"
    mode="chat"
    :content="content"
    :final="final"
    :smooth-streaming="isStreaming ? 'auto' : false"
    fade
    :typewriter="isStreaming"
  />
</template>
```

When the stream ends, set `final.value = true`. This example disables pacing and the cursor while keeping the same `chat` mode and fade choice. There is no requirement to invert fade when streaming ends. Unchanged content is not remounted just to replay an animation; entry fade applies to newly mounted nodes. Use `:fade="false"` throughout if animation cost is more important. These bounded append-fade details apply to Vue 3, not the other adapters.

### Static / SSR snapshot (no animation)

```vue
<MarkdownRender
  :content="staticText"
  :final="true"
  :smooth-streaming="false"
  :fade="false"
/>
```

Zero animation — best for server-rendered output, print, or PDF pipelines.

## 8. When not to use this path

- Use `content` when updates are infrequent or the page is basically static.
- Use server-side preparse + `nodes` when another layer already owns Markdown parsing.
- Use the framework-specific guides when SSR/runtime rules matter more than streaming itself.

## Next pages

- [Installation](/guide/installation) for peer decisions
- [Usage & Streaming](/guide/usage) for `content` vs `nodes`
- [Performance](/guide/performance) for larger transcripts
- [Renderer & Node Components](/guide/components) for code/math/diagram component choices
- [Troubleshooting](/guide/troubleshooting) when CSS, peers, or SSR behave unexpectedly

<NextStep :items="[
  { text: 'Usage: content vs nodes', link: '/guide/usage' },
  { text: 'SSE & WebSocket Markdown', link: '/use-cases/sse-websocket' },
  { text: 'Performance', link: '/guide/performance' },
]" />
