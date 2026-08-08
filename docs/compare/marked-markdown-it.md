---
title: Markstream vs marked and markdown-it for AI streaming Markdown
description: Compare Markstream with marked and markdown-it for streaming AI Markdown. Traditional parsers are best for static content — Markstream is designed for LLM token streams and progressive rendering.
lastVerified: '2026-06-12'
faq:
  - question: Is Markstream a replacement for marked or markdown-it?
    answer: Not for every use case. Use marked or markdown-it when you only need Markdown-to-HTML parsing; use Markstream when you need framework components and streaming UI behavior.
  - question: Does Markstream use markdown-it?
    answer: Markstream renderers use stream-markdown-parser, which builds on markdown-it-ts and adds streaming mid-state handling.
  - question: When should I avoid Markstream?
    answer: Avoid Markstream when you only need static HTML output, a non-JavaScript runtime, or the smallest possible Markdown parser.
---
# Markstream vs marked and markdown-it

`marked` and `markdown-it` are excellent Markdown parsers. Markstream is a streaming Markdown **renderer** that uses `markdown-it-ts` internally. They serve different purposes.

> Last verified: 2026-06-12. Competitor capabilities may change. This page focuses on architecture and documented behavior rather than claiming permanent feature gaps.

## Summary

Use `marked` or `markdown-it` when:
- You need a parser, not a framework renderer
- Content is static or pre-rendered server-side
- You want to output HTML strings only
- You need the smallest possible Markdown dependency
- You'll build your own streaming/renderer layer on top

Use Markstream when:
- You need a framework component renderer (Vue, React, Svelte, Angular)
- Content streams from an LLM, SSE, or WebSocket
- Incomplete Markdown states need stable mid-stream rendering
- You need progressive Mermaid, KaTeX, or code blocks
- You want safe component-based rendering (no raw HTML dump)

## Comparison table

| | marked | markdown-it | Markstream |
| --- | --- | --- | --- |
| Type | Parser | Parser | Renderer family |
| Output | HTML string | HTML string | Framework components |
| Streaming | Not optimized for mid-stream UX | Not optimized for mid-stream UX | Streaming-aware incremental states |
| Incomplete Markdown during streaming | Not optimized for mid-stream UX | Not optimized for mid-stream UX | Streaming-aware mid-state handling |
| Mermaid | ❌ | Via plugin (HTML) | ✅ progressive |
| KaTeX | ❌ | Via plugin (HTML) | ✅ worker-based |
| Code blocks | ❌ | Via plugin (HTML) | ✅ streaming diff |
| Safe HTML | ❌ (raw output) | ❌ (raw output) | ✅ configurable policy |
| Vue components | ❌ | ❌ | ✅ |
| React components | ❌ | ❌ | ✅ |
| Svelte components | ❌ | ❌ | ✅ |
| Angular components | ❌ | ❌ | ✅ |
| Virtualization | ❌ | ❌ | ✅ |
| Bundle size | ~4 KB | ~40 KB | ~12 KB (core) + peers |

## When Markstream uses markdown-it internally

`markstream-vue` and `markstream-react` use `markdown-it-ts` (a TypeScript fork of `markdown-it`) internally through `stream-markdown-parser`. This means:

- You get `markdown-it`'s parsing correctness
- Plus streaming-specific handling for unclosed fences and partial blocks
- Plus framework-specific component rendering
- Plus optional heavy block support (Mermaid, KaTeX, stream-diffs)

## Streaming: the key difference

```js
// marked / markdown-it: parse complete Markdown → HTML string
const html = marked.parse('# Hello\n\n**World**')
// → '<h1>Hello</h1>\n<p><strong>World</strong></p>\n'

// Markstream: incremental parse during streaming
// Chunk 1: "# Hel" → renders partial heading (no error)
// Chunk 2: "# Hello\n\n**Wo" → updates heading, partial bold
// Chunk 3: "# Hello\n\n**World**" → complete render
```

Traditional parsers can parse many incomplete strings, but they are designed around complete Markdown-to-HTML conversion. In a token stream, the intermediate output may change shape repeatedly, causing visual jumps, unstable code fences, or heavy block churn. Markstream is designed for this scenario from the ground up.

## When NOT to use Markstream

- You only need `markdown → HTML` conversion (use `marked` or `markdown-it`)
- You're building a static site generator that renders at build time
- You need the absolute smallest Markdown dependency
- You're rendering Markdown in a non-JS runtime

## Using stream-markdown-parser alone

If you want `markdown-it`-compatible parsing with streaming support but no framework UI:

```bash
pnpm add stream-markdown-parser
```

```ts
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown()
const nodes = parseMarkdownToStructure(content, md)
// nodes is a structured AST you can render however you want
```

This gives you the streaming parser without any framework dependency.

## Verification

Last verified: 2026-06-12

Sources checked:
- [marked docs](https://marked.js.org/)
- [markdown-it docs](https://markdown-it.github.io/)
- Markstream parser docs and package metadata
- local smoke reproduction

Tested scenarios:
- complete static Markdown
- incomplete code fences
- partial tables
- streaming Mermaid and KaTeX through Markstream renderers
- long response > 50 KB

## Sources and references

- [marked docs](https://marked.js.org/)
- [markdown-it demo and docs](https://markdown-it.github.io/)
- [stream-markdown-parser guide](/guide/parser-api)
- [Static vs streaming Markdown rendering](/compare/static-vs-streaming)
- [1.0 Benchmark Report](/guide/benchmark-1-0)

## Reproduce Markstream scenarios

These commands reproduce the Markstream streaming and performance scenarios used while writing this comparison. They are not a side-by-side benchmark against the alternative packages.

```bash
pnpm benchmark:1.0
pnpm run test:e2e:main-playground-performance
```

Include complete static Markdown, unclosed code fences, partial tables, partial KaTeX, Mermaid, and long AI responses in the same test set.
