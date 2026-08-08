---
title: markstream-react vs Streamdown for React streaming Markdown
description: Compare markstream-react and Streamdown for streaming AI Markdown in React. Both support streaming; choose based on API fit, heavy blocks, long documents, and cross-framework needs.
keywords:
  - markstream-react vs Streamdown
  - Streamdown alternative
  - React streaming Markdown renderer
  - React AI chat Markdown
  - incomplete Markdown React
  - react-markdown streaming alternative
  - streaming Mermaid React
  - long AI response Markdown
lastVerified: '2026-06-12'
faq:
  - question: Are markstream-react and Streamdown both streaming Markdown renderers?
    answer: Yes. Both target React streaming Markdown, but they make different API and architecture trade-offs.
  - question: When should I choose Streamdown?
    answer: Choose Streamdown when you want a React-focused streaming path with a drop-in style close to react-markdown and its plugin ecosystem.
  - question: When should I choose markstream-react?
    answer: Choose markstream-react when you need Markstream's cross-framework parser behavior, progressive heavy blocks, nodes input path, or renderer-level long-document controls.
---
# markstream-react vs Streamdown

Both `markstream-react` and [Streamdown](https://streamdown.ai) are designed for streaming Markdown in React. They target different trade-offs.

> Last verified: 2026-06-12. Competitor capabilities may change. This page focuses on architecture and documented behavior rather than claiming permanent feature gaps. Check [Streamdown's official docs](https://streamdown.ai) for the latest capabilities.

## Quick comparison

| Capability | markstream-react | Streamdown |
| --- | --- | --- |
| React streaming Markdown | ✅ | ✅ |
| Incomplete Markdown handling | Streaming mid-state handling for partial fences, links, images, tables, and inline syntax | Streaming-optimized |
| react-markdown-style API | ❌ different API | ✅ drop-in style |
| Mermaid | ✅ built-in Markstream integration / optional peer | ✅ via `@streamdown/mermaid` |
| Math / KaTeX | ✅ optional peer / worker-capable | ✅ via `@streamdown/math` |
| Code highlighting | ✅ stream-diffs powered code blocks with diff tracking | ✅ via `@streamdown/code` using Shiki |
| Cross-framework family | ✅ Vue/React/Svelte/Angular | ❌ React-focused |
| Long-document live-node bounding | ✅ renderer-level controls | Needs separate app-level virtualization |
| Best fit | Multi-framework AI apps, heavy blocks, long docs | React apps wanting a streaming drop-in path |

## When to use Streamdown

Streamdown is a **drop-in replacement for `react-markdown`** designed for AI-powered streaming. Use it when:

- You're migrating from `react-markdown` and want minimal API changes
- You want React-only streaming Markdown with a familiar API
- You want Streamdown's plugin model for Shiki code, Mermaid, KaTeX, or CJK support
- Long-document virtualization can stay in your application layer

## When to use markstream-react

`markstream-react` is a **streaming-first renderer with progressive heavy blocks**. Use it when:

- AI output includes Mermaid diagrams that should use Markstream's progressive heavy-block behavior
- Streaming code blocks need diff tracking as content arrives
- KaTeX math should render through Markstream's optional worker-capable integration
- Long AI responses need renderer-level live-node bounding
- You want consistent Markdown behavior across React, Vue, Svelte, and Angular
- You need both raw `content` and pre-parsed `nodes` input paths
- You need optional peer dependencies — install only what your AI output needs

## Content path vs nodes path

For a normal AI chat message, you can pass the accumulating Markdown string directly to `MarkdownRender`. You do **not** need to pre-parse nodes just to handle SSE or WebSocket output.

Use the `nodes` path when another layer already owns parsing, batching, worker execution, or AST transforms.

## Streaming example comparison

### Streamdown

```tsx
import { Streamdown } from 'streamdown'

// Drop-in replacement for react-markdown
export default function ChatMessage({ content }: { content: string }) {
  return <Streamdown>{content}</Streamdown>
}
```

### markstream-react

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export default function ChatMessage({ content, isDone }: { content: string, isDone: boolean }) {
  return (
    <MarkdownRender
      content={content}
      final={isDone}
      fade={false}
    />
  )
}
```

## Progressive Mermaid: a key difference

When an LLM streams a Mermaid diagram:

```mermaid
flowchart LR
  Input --> Parser --> Renderer --> Output
```

**Streamdown**: supports Mermaid through `@streamdown/mermaid`, with interactive controls after the diagram is parsed.

**markstream-react**: renders incremental diagram states as the Mermaid syntax arrives. Users see the diagram taking shape — better UX for long or complex diagrams.

## Choosing between them

| Your situation | Recommendation |
| --- | --- |
| Migrating from react-markdown, want minimal changes | Streamdown |
| Need Streamdown's React plugin model | Streamdown |
| AI output includes progressive Mermaid-heavy answers | markstream-react |
| Streaming code blocks with diffs | markstream-react |
| Long AI responses (>50 KB) | markstream-react |
| Multi-framework project (React + Vue + Svelte) | markstream-react |
| Need `content` and pre-parsed `nodes` paths | markstream-react |

## Verification

Last verified: 2026-06-12

Sources checked:
- [Streamdown docs](https://streamdown.ai)
- Streamdown package/plugin documentation
- Markstream React docs and package metadata
- public examples and local smoke reproduction

Tested scenarios:
- incomplete code fences
- partial tables
- streaming Mermaid
- long response > 50 KB
- `final=true` settling behavior

## Sources and references

- [Streamdown docs](https://streamdown.ai)
- [markstream-react framework page](/frameworks/react)
- [Streaming Mermaid and KaTeX](/use-cases/streaming-mermaid-katex)
- [Long AI responses](/use-cases/long-ai-responses)
- [1.0 Benchmark Report](/guide/benchmark-1-0)

## Reproduce Markstream scenarios

These commands reproduce the Markstream streaming and performance scenarios used while writing this comparison. They are not a side-by-side benchmark against the alternative package.

```bash
pnpm benchmark:1.0
pnpm run test:e2e:main-playground-performance
```

Use real AI output that includes unclosed fences, Mermaid, math, fast token updates, and long responses before deciding which API and rendering model fit your React app.
