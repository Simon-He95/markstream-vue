---
title: Long AI responses — Markdown rendering and virtualization
description: Use Markstream's virtualized rendering for long AI responses (50 KB+). Bounded live nodes, viewport-aware heavy blocks, and predictable memory usage.
keywords:
  - long AI response renderer
  - virtualized Markdown renderer
  - large Markdown document rendering
  - long context LLM Markdown
  - viewport-aware Markdown
  - bounded live nodes
faq:
  - question: When does a long AI answer need Markdown virtualization?
    answer: Enable virtualization when responses regularly exceed tens of kilobytes, contain many blocks, or cause scroll and layout work to become visible.
  - question: Is virtual-scroll required for a single long message?
    answer: Usually no. Use node-level virtualization first; virtual-scroll is for outer timeline virtualizers that coordinate many messages.
  - question: Do offscreen Mermaid or enhanced code blocks still render immediately?
    answer: Not when viewport-priority and defer-until-visible paths are enabled. Heavy blocks can stay idle until they approach the viewport.
---
# Long AI responses

AI "reasoning" models and long-context LLMs can produce responses that are tens or hundreds of kilobytes of Markdown. Traditional renderers struggle with this volume — Markstream's virtualization keeps the UI responsive.

## The problem with long AI responses

When an AI produces a 100 KB Markdown response with code blocks, tables, and diagrams:

1. **DOM nodes explode**: every paragraph, list item, and inline element becomes a DOM node
2. **Memory grows linearly**: 100 KB of Markdown can produce 5000+ DOM nodes
3. **Heavy blocks multiply**: multiple Mermaid diagrams, code blocks, and math expressions all render simultaneously
4. **Scrolling degrades**: the browser layout engine struggles with thousands of nodes

## Markstream's virtualization

Markstream uses viewport-aware rendering to bound the number of live DOM nodes:

```vue
<MarkdownRender
  :content="longResponse"
  :final="isDone"
  node-virtual="auto"
  :max-live-nodes="200"
/>
```

- `node-virtual`: enables node-level virtualization inside this document
- `max-live-nodes`: maximum number of simultaneously rendered nodes (default depends on mode)
- Nodes outside the viewport are replaced with lightweight placeholders
- As the user scrolls, nodes enter and leave the viewport

`virtual-scroll` is an advanced protocol for outer timeline virtualizers (e.g. chat message lists). Most users should use `node-virtual` and `max-live-nodes` instead of enabling `virtual-scroll` directly.

## Viewport-aware heavy blocks

Mermaid diagrams, enhanced code blocks, and other heavy blocks stay idle while offscreen:

```vue
<MarkdownRender
  :content="longDoc"
  viewport-priority
  :defer-nodes-until-visible="true"
/>
```

- `viewport-priority`: heavy blocks render only when approaching the viewport
- `defer-nodes-until-visible`: nodes outside viewport use minimal resources
- As the user scrolls toward a Mermaid diagram, it activates and renders

## Modes and virtualization

Different renderer modes have different virtualization defaults:

| Mode | Virtualization | Best for |
| --- | --- | --- |
| `chat` | Lightweight, no virtualization by default | Short to medium chat messages |
| `docs` | Virtualization enabled by default | Long technical documents |
| `minimal` | Same as chat, neutral name | Non-chat surfaces, lightweight |

For AI chat with potentially long responses, you can combine chat-mode pacing with docs-mode virtualization:

```vue
<MarkdownRender
  mode="chat"
  :content="longResponse"
  :final="isDone"
  smooth-streaming="auto"
  :fade="false"
  node-virtual="auto"
  :max-live-nodes="300"
/>
```

## Performance benchmarks

The numbers below are illustrative targets for planning. Run `pnpm benchmark:1.0` on your target devices before using performance numbers as release criteria, and use the [1.0 Benchmark Report](/guide/benchmark-1-0) for reproducible release-gate methodology.

| Content size | Without virtualization | With virtualization |
| --- | --- | --- |
| 10 KB (short chat) | ~200 DOM nodes, smooth | ~200 DOM nodes, smooth |
| 50 KB (long answer) | ~1000 DOM nodes, slight lag | ~300 live nodes, smooth |
| 100 KB (reasoning) | ~2500 DOM nodes, noticeable lag | ~300 live nodes, smooth |
| 1 MB (technical doc) | May freeze browser | ~500 live nodes, scrollable |

## When virtualization matters

Enable virtualization when:
- AI responses routinely exceed 20 KB
- Users report laggy scrolling in long conversations
- Responses contain multiple Mermaid diagrams or code blocks
- The app runs on mobile devices with limited memory

Skip virtualization when:
- Responses are always short (< 10 KB)
- You want the simplest possible setup
- The target device is a desktop with abundant memory

## See also

- [Vue AI chat Markdown renderer](/use-cases/vue-ai-chat-markdown-renderer)
- [LLM token stream Markdown](/use-cases/llm-token-stream-markdown)
- [AI chat streaming Markdown](/use-cases/ai-chat-streaming)
- [Streaming Mermaid and KaTeX](/use-cases/streaming-mermaid-katex)
- [Performance guide](/guide/performance)
