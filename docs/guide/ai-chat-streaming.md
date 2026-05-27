---
description: Build AI chat and streaming Markdown UIs with nodes plus final patterns, performance guidance, trusted custom tags, and SSR-safe setup.
---

# AI Chat & Streaming

Use this path when you are building a chat UI, token stream, SSE response viewer, or any screen where Markdown updates frequently while the user is watching.

If you only render static articles or docs pages, go back to [Usage & Streaming](/guide/usage) and prefer the simpler `content` path.

## 1. Choose the leanest install

| Need | Packages | Best for |
| --- | --- | --- |
| Text-only or lightweight chat UI | `markstream-vue` | Basic Markdown, lists, links, blockquotes |
| Syntax-highlighted code without Monaco | `markstream-vue stream-markdown` | SSR-friendly transcripts, lower bundle budgets |
| Rich code interactions | `markstream-vue stream-monaco` | Copy, preview, diff, and Monaco-powered code blocks |
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
    custom-id="chat"
    :content="streamedText"
    :final="final"
    :max-live-nodes="0"
    :batch-rendering="true"
    :render-batch-size="16"
    :render-batch-delay="8"
    :render-batch-budget-ms="4"
    :fade="false"
    :typewriter="true"
  />
</template>
```

Why this path works better:

- Incoming chunks can be bursty while visible output remains steady.
- Backlog-aware pacing speeds up automatically when pending text grows.
- Final parsing waits for visible content to catch up, so end-of-stream settling is stable.
- `custom-id="chat"` gives you a scoped place to theme the chat surface or override one renderer safely.
- The default `smooth-streaming="auto"` already enables smooth pacing when `typewriter` is on or `max-live-nodes <= 0`. Only use `:smooth-streaming="true"` if you want first-screen content to also start from blank with the typewriter effect—this bypasses the mounted gate and can cause hydration mismatch or blank flash in SSR scenarios.

Turn it off per surface with `:smooth-streaming="false"` if you want raw chunk cadence. If you already parse in a worker/store and need AST control, keep using `nodes` + `final`.

## 3. Renderer settings that usually work well

- Keep the default virtualization behavior for long transcripts. Only tune `maxLiveNodes` if you have a measured reason.
- Use `renderCodeBlocksAsPre` when code fences appear often but Monaco is too heavy for your chat surface.
- Leave heavy peers off until you need them. Chat UIs get a large win from not shipping Mermaid, KaTeX, or Monaco by default.
- If you disable virtualization (`:max-live-nodes="0"`), then the batching props in [Props & Options](/guide/props) become more important.

## 4. Common upgrade paths

### Better code blocks

- Want a lighter docs-style look: use `MarkdownCodeBlockNode` with `stream-markdown`
- Want richer preview/diff controls: use `CodeBlockNode` with `stream-monaco`

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
- Gate browser-only peers such as Mermaid, D2, or Monaco behind client-only boundaries in SSR setups.
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
const md = getMarkdown('chat')
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

These two modes need different combinations of `smooth-streaming` and `fade`:

### Streaming (tokens arriving in real-time)

```vue
<MarkdownRender
  :content="streamedText"
  :final="false"
  smooth-streaming="auto"
  :fade="false"
  :typewriter="true"
  :max-live-nodes="0"
/>
```

- `smooth-streaming="auto"` paces the visible output so bursty chunks appear steadily. It already gives the "text appears gradually" effect at the content layer.
- `fade=false` because the 280 ms opacity animation conflicts with high-frequency smooth-streaming updates — each small content batch interrupts the previous fade, causing flicker instead of a smooth fade.
- `typewriter=true` adds a blinking cursor at the end of the stream.
- `max-live-nodes=0` disables virtualization and enables incremental/batched rendering for streaming.

### Recovering history (complete Markdown loaded at once)

```vue
<MarkdownRender
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
    :content="content"
    :final="final"
    :smooth-streaming="isStreaming ? 'auto' : false"
    :fade="!isStreaming"
    :typewriter="isStreaming"
    :max-live-nodes="isStreaming ? 0 : undefined"
  />
</template>
```

When the stream ends, set `final.value = true`. The renderer instantly switches from smooth pacing + no-fade to no-pacing + fade-in, giving history content a clean entry animation without the flicker that would occur if both features were on simultaneously.

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
