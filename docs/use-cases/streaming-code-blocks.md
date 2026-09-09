---
title: Streaming code block renderer for AI Markdown
description: Render code blocks from LLM token streams with stable incomplete fences, diff-aware updates via the stream-diffs runtime, and mobile-friendly fallbacks.
lastUpdated: 2026-07-01
keywords:
  - streaming code block renderer
  - AI code block Markdown
  - LLM code fence renderer
  - streaming code block
  - stream-diffs code block
faq:
  - question: Can Markstream render a code block before the closing fence arrives?
    answer: Yes. It keeps the incomplete fence readable during streaming, then upgrades to the configured code block renderer when the fence is complete enough.
  - question: Should AI chat apps use the enhanced code block surface for every code block?
    answer: Not always. The `stream-diffs`-backed `CodeBlockNode` is great for large or interactive code; plain `pre` rendering can be better for read-only chat, mobile WebViews, or strict bundle budgets.
  - question: How should I test streaming code blocks?
    answer: Test unclosed fences, changing language tags, long code blocks, diff fences, and fast token updates at the same cadence as your production stream.
---
# Streaming code block renderer for AI Markdown

Code fences are one of the most visible failure points in AI chat. During generation, the opening fence often arrives long before the closing fence, and the language tag or code body may still be changing. Markstream handles that as a streaming state instead of assuming the Markdown is complete.

## Problem

A static Markdown renderer can make an unfinished code fence consume everything below it. In AI chat, that means normal paragraphs, tables, and follow-up text may briefly become part of the code block while the model is still writing.

````md
```ts
export function answer() {
  return "still streaming"
````

The renderer needs to keep this state readable and avoid expensive highlighter churn until the fence is stable.

## Renderer choices

| Renderer | Best for | Notes |
| --- | --- | --- |
| `CodeBlockNode` (via `stream-diffs`) | interactive or large code blocks | Enhanced File/FileDiff surface with syntax highlighting and diff interactions |
| Plain `pre` | mobile or strict bundle budgets | Most predictable fallback, no extra deps |

## Minimal Vue setup

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

For an enhanced code block surface (syntax highlighting plus diff interactions), install the optional `stream-diffs` peer:

```bash
pnpm add stream-diffs
```

When `stream-diffs` is installed, `CodeBlockNode` mounts a File or FileDiff surface once the fence completes and enters the viewport. Supported configuration comes from direct or renderer-level `codeBlockOptions`. When `stream-diffs` is absent, the block falls back to a plain `<pre><code>` representation.

For mobile WebViews or conservative bundles, use plain `pre` rendering:

```vue
<MarkdownRender
  :content="content"
  :final="isDone"
  :render-code-blocks-as-pre="true"
/>
```

## Streaming states to test

- Opening fence with no close fence
- Language tag that changes from empty to `ts`, `tsx`, `vue`, or `diff`
- Long code block streamed in small chunks
- Diff fences with added and removed lines
- Code followed by tables, Mermaid, or math before the close fence arrives

A marker-only line at the streaming tail is ambiguous until more input arrives. For example, the first one or two backticks of a three-backtick closing fence must stay pending instead of entering the rendered code content:

```text
code line                         code line
code line                         code line
` or ``                  ->       (pending tail hidden)
```

If a non-marker character or another line arrives, the pending text is released as literal code. When `final` is true, EOF is authoritative and literal marker-only content is preserved. This rule belongs to the parser output contract so plain `pre` and every framework adapter receive the same stable `code_block.code` value.

## Performance notes

- Batch token updates before rendering; do not commit every byte from an SSE or WebSocket stream.
- Keep `fade` disabled when minimizing animation work. Vue 3 can combine it with smooth streaming for surrounding text and inline code; fenced code blocks do not use this append fade.
- Use viewport priority or virtualization when a long answer contains many code blocks.
- Prefer `render-code-blocks-as-pre` on mobile if users only need to read code.

## Related guides

- [Code Block Rendering](/guide/code-blocks)
- [CodeBlockNode](/guide/code-block-node)
- [Code Block Runtime](/guide/code-block-runtime)
- [AI chat streaming Markdown](/use-cases/ai-chat-streaming)
- [Long AI responses](/use-cases/long-ai-responses)
