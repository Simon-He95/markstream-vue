---
title: Static Markdown rendering vs streaming Markdown rendering
description: Compare static Markdown rendering with streaming Markdown rendering for LLM output, SSE, WebSockets, incomplete syntax, heavy blocks, and long responses.
lastVerified: '2026-06-12'
---
# Static Markdown rendering vs streaming Markdown rendering

> Last verified: 2026-06-12. This page focuses on renderer architecture and streaming behavior.

## The fundamental difference

**Static Markdown rendering** assumes complete, well-formed Markdown at render time. The entire input is parsed once, and the output is stable.

**Streaming Markdown rendering** handles Markdown that is still being written. The input grows over time, and the renderer must handle incomplete syntax without flickering or errors.

## Why streaming is harder

1. **Unclosed code fences**: ` ```js ` with no closing ` ``` ` — static parsers may consume the rest of the document as code block content
2. **Partial tables**: `| col1 | col2 |\n| --- |` with no rows — can break table parsing
3. **Half-written math**: `$$E = mc` without closing `$$` — KaTeX will error on incomplete input
4. **Incomplete HTML**: `<details>` without `</details>` — can break the DOM
5. **Growing Mermaid**: diagram syntax changes as the LLM writes — needs progressive re-rendering
6. **Unclosed inline formatting**: `**bold text` without closing `**` — may consume subsequent content

## How Markstream handles it

### Parser mid-states
Unclosed fences, partial math blocks, and incomplete tables are detected at the parser level. Instead of consuming the rest of the document or throwing errors, the parser marks these as "open" tokens. The renderer displays them as plain text until the closing delimiter arrives.

### Batch rendering
Instead of re-rendering on every token (which could be 20-50 times per second for fast LLMs), updates are collected and rendered in controlled batches. This prevents flicker and keeps the UI smooth.

### Progressive heavy blocks
Mermaid diagrams, KaTeX formulas, and code blocks don't render immediately on first appearance. They wait for their syntax to stabilize:

- **Mermaid**: renders after the closing ` ``` ` and a short stabilization delay
- **KaTeX**: renders after the closing `$$` or `$`
- **Code blocks**: render incrementally with stream-diffs diff tracking or on close

### Viewport priority
Heavy blocks that are offscreen (below the visible area) stay idle until the user scrolls near them. This keeps the DOM and CPU load predictable even for very long responses.

### Bounded live nodes
For long documents (100KB+ Markdown), virtualization keeps only the visible portion in the DOM. Off-screen content is represented by placeholder elements. This prevents memory and performance degradation on very long AI responses.

## Renderer modes

Markstream renderers support different modes optimized for different surface types:

| Mode | Best for | Behavior |
| --- | --- | --- |
| `chat` | AI chat, SSE output | Steady pacing, no opacity animation flicker |
| `docs` | Documentation, static pages | Larger render batches, tooltips, fade enabled |
| `minimal` | Lightweight non-chat surfaces | Same defaults as chat, neutral mode name |

## When static rendering is sufficient

Static Markdown rendering (marked, markdown-it, react-markdown, etc.) is the right choice when:

- Content is fully formed before rendering
- Content never changes after initial render
- You render documentation pages, blog posts, or README files
- Bundle size is critical and you don't need streaming features
- You need the rich plugin ecosystem of remark/rehype

## When streaming rendering is necessary

Streaming Markdown rendering is necessary when:

- Content arrives incrementally from an LLM, SSE endpoint, or WebSocket
- Content is displayed to users while still being generated
- Incomplete Markdown syntax exists during the streaming phase
- Heavy blocks (diagrams, math, code) appear during streaming
- Long responses need virtualization to stay performant
- The renderer must handle content that grows from 0 to potentially 1MB+ over seconds or minutes

## Migration from static to streaming

If you currently use a static renderer and want to add streaming support:

1. **Keep static for static content**: don't replace your blog renderer. Only add streaming for AI chat/SSE surfaces.
2. **Parse before the component**: for high-frequency streaming, parse Markdown outside the component and pass `nodes` instead of `content`.
3. **Add `final` prop**: tell the renderer when the stream is complete so it can finalize heavy blocks and clean up mid-states.
4. **Test with real streaming patterns**: simulate 20-character chunks arriving at 30Hz to verify no flicker.

## Verification

Last verified: 2026-06-12

Sources checked:
- Markstream renderer and parser docs
- static Markdown renderer behavior
- local streaming fixtures
- benchmark and e2e reproduction scripts

Tested scenarios:
- completed Markdown documents
- incomplete code fences
- partial tables
- streaming Mermaid and KaTeX
- long response > 50 KB

## Sources and references

- [SSE and WebSocket Markdown streaming](/use-cases/sse-websocket)
- [Streaming Mermaid and KaTeX](/use-cases/streaming-mermaid-katex)
- [Long AI responses](/use-cases/long-ai-responses)
- [Performance guide](/guide/performance)
- [1.0 Benchmark Report](/guide/benchmark-1-0)

## Reproduce Markstream scenarios

These commands reproduce the Markstream streaming and performance scenarios used while writing this comparison. They are not a side-by-side benchmark against every renderer mode described on this page.

```bash
pnpm benchmark:1.0
pnpm run test:e2e:main-playground-performance
```

Compare completed Markdown against token-stream fixtures that include incomplete fences, partial tables, Mermaid, KaTeX, and long AI output.
