---
title: markstream-react vs react-markdown for static Markdown and migration
description: Compare markstream-react and react-markdown for static React Markdown, remark/rehype plugin pipelines, migration trade-offs, and when streaming AI chat needs a streaming-first renderer.
keywords:
  - react-markdown vs markstream
  - streaming react markdown
  - migrate from react-markdown
  - remark rehype markdown
  - ai chat markdown react
ogImage: /og/comparison.png
ogImageAlt: Markstream React and react-markdown comparison
lastVerified: '2026-06-12'
faq:
  - question: Should I replace react-markdown with markstream-react?
    answer: Replace it when you need LLM streaming, incomplete Markdown handling, long responses, or progressive heavy blocks. Keep react-markdown for short static content or established remark/rehype pipelines.
  - question: Does markstream-react have the same plugin model as react-markdown?
    answer: No. markstream-react uses Markstream's renderer and parser model rather than the react-markdown remark/rehype plugin pipeline.
  - question: Is react-markdown still a good choice?
    answer: Yes. react-markdown remains a strong choice for static React Markdown and mature plugin ecosystems.
---
# markstream-react vs react-markdown for static Markdown and migration

> Last verified: 2026-06-12. Competitor capabilities may change. This page focuses on architecture and documented behavior rather than claiming permanent feature gaps.

This page treats `react-markdown` as the static React Markdown baseline. For a direct React streaming Markdown alternative, see [markstream-react vs Streamdown](/compare/streamdown).

## Summary

Use `react-markdown` when:
- content is static or short
- you already have sanitizer/plugin setup
- you do not need token-by-token UX
- you want the smallest familiar React Markdown stack

Use `markstream-react` when:
- content streams from an LLM, SSE, or WebSocket
- incomplete Markdown states need stable mid-stream rendering
- long responses or long transcripts matter
- Mermaid/KaTeX/code blocks appear during streaming
- you want Markstream's cross-framework parser behavior

## Quick comparison

| | markstream-react | react-markdown |
| --- | --- | --- |
| Streaming-first | ✅ | ❌ |
| Incomplete Markdown | Streaming-aware mid-state handling | General Markdown rendering; intermediate states may look unstable |
| Progressive Mermaid | ✅ | ❌ |
| Streaming code blocks | ✅ with diff tracking | ❌ |
| KaTeX math during stream | ✅ | ⚠️ needs manual handling |
| Virtualized long docs | ✅ bounded live nodes | ❌ |
| content prop | ✅ raw Markdown strings | ✅ |
| nodes prop | ✅ pre-parsed AST | ❌ |
| Cross-framework parser | ✅ shared with Vue/Svelte/Angular | ❌ |
| Bundle size | larger (streaming features) | smaller |
| Ecosystem maturity | newer | very mature |

## Why streaming changes everything

When `react-markdown` receives new content, it re-parses and re-renders the Markdown tree. For streaming AI output that updates 10-30 times per second, this can cause:

- **Flicker**: complete re-renders break CSS transitions and cause visual jumps
- **Unstable intermediate states**: unclosed fences, partial math, and half-written tables can require buffering, memoization, or plugin-specific handling
- **Performance degradation**: per-token re-renders compound on long responses

`markstream-react` is designed around these problems:

- **Batch rendering**: updates are collected and rendered in controlled batches
- **Mid-state detection**: unclosed fences are detected and rendered as plain text until completed
- **Progressive heavy blocks**: Mermaid and KaTeX re-render incrementally as syntax stabilizes

## Streaming example

### react-markdown

```tsx
import ReactMarkdown from 'react-markdown'

function ChatMessage({ content }: { content: string }) {
  // Re-renders the entire tree on every content change
  return <ReactMarkdown>{content}</ReactMarkdown>
}
```

### markstream-react

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

function ChatMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return (
    <MarkdownRender
      content={content}
      final={isDone}
      fade={false}
    />
  )
}
```

## When react-markdown is a better fit

react-markdown is a great choice for:
- Blog posts, documentation pages, static README previews
- Short, complete Markdown that never changes after initial render
- Projects where bundle size is critical and streaming is not needed
- Teams already deeply invested in the remark/rehype plugin ecosystem

## Bundle size notes

`react-markdown` is lighter for static use cases. `markstream-react` includes streaming-specific code (batch scheduler, mid-state parser, progressive renderers) that adds bundle weight. If you never stream content, that weight is unnecessary.

However, for AI chat UIs and streaming surfaces, the streaming features replace what you would otherwise need to build yourself: batching, incomplete-state buffering, and progressive heavy block handling.

## Migration checklist

1. Replace `import ReactMarkdown from 'react-markdown'` with `import MarkdownRender from 'markstream-react'`
2. Add `import 'markstream-react/index.css'` to your entry file
3. Change `<ReactMarkdown>{content}</ReactMarkdown>` to `<MarkdownRender content={content} final={true} />`
4. For streaming: pass `final={isDone}` and consider `fade={false}`
5. Test with incomplete Markdown states (unclosed code fences, partial tables)
6. Install optional peers only if your AI output includes Mermaid, KaTeX, or Monaco blocks

For a full migration guide, see [Migrate from react-markdown](/guide/react-markdown-migration).

## Verification

Last verified: 2026-06-12

Sources checked:
- [react-markdown README](https://github.com/remarkjs/react-markdown)
- Markstream React docs and package metadata
- public examples and local smoke reproduction

Tested scenarios:
- incomplete code fences
- partial tables
- partial KaTeX
- long response > 50 KB
- `final=true` settling behavior

## Sources and references

- [react-markdown README](https://github.com/remarkjs/react-markdown)
- [markstream-react framework page](/frameworks/react)
- [Migrate from react-markdown](/guide/react-markdown-migration)
- [1.0 Benchmark Report](/guide/benchmark-1-0)

## Reproduce Markstream scenarios

These commands reproduce the Markstream streaming and performance scenarios used while writing this comparison. They are not a side-by-side benchmark against the alternative package.

```bash
pnpm benchmark:1.0
pnpm run test:e2e:main-playground-performance
```

Test incomplete code fences, partial tables, partial KaTeX, Mermaid blocks, and long AI responses before choosing a renderer for a streaming UI.
