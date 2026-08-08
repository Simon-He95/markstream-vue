---
title: 'Svelte 5 streaming Markdown renderer for AI chat'
description: Use markstream-svelte to render streamed Markdown in Svelte 5 and SvelteKit AI chat, LLM token streams, SSE, WebSocket, incomplete Markdown states, long documents, custom components, Mermaid, KaTeX, and stream-diffs enhanced code blocks. Beta API; Svelte 4 is not supported.
keywords:
  - markstream-svelte
  - Svelte 5 streaming Markdown renderer
  - SvelteKit streaming Markdown
  - Svelte AI chat Markdown
  - Svelte LLM Markdown renderer
  - Svelte SSE Markdown renderer
  - Svelte WebSocket Markdown
  - Svelte incomplete Markdown renderer
  - Svelte Mermaid Markdown
  - Svelte KaTeX Markdown
  - Svelte custom Markdown components
  - Svelte 5 Markdown beta
softwareName: markstream-svelte
softwarePackage: markstream-svelte
npmPackage: markstream-svelte
softwareFramework: Svelte
softwareProgrammingLanguage:
  - TypeScript
  - Svelte
softwareRuntimePlatform:
  - Svelte 5
faq:
  - question: Does markstream-svelte support Svelte 4?
    answer: No. markstream-svelte requires Svelte 5.
  - question: When should I use markstream-svelte?
    answer: Use it for Svelte 5 AI chat, SvelteKit SSE/WebSocket output, long responses, custom Svelte components, smooth streamed content, or progressive Mermaid and KaTeX.
  - question: Is markstream-svelte as mature as markstream-vue?
    answer: No. markstream-svelte is beta and newer than the Vue renderer.
  - question: Do I need to pre-parse nodes for Svelte streaming output?
    answer: No. For normal LLM/SSE/WebSocket streaming, start with the raw content prop and final state. Use nodes only when your app already owns parser or AST state.
  - question: Does markstream-svelte sanitize untrusted Markdown and HTML?
    answer: The renderer defaults to the safe HTML policy and sanitizes link, image, class, and SVG output paths. Review the policy against your own threat model before rendering untrusted content.
---
# Svelte 5 streaming Markdown renderer for AI chat

`markstream-svelte` is the Svelte 5 renderer in the Markstream family. It uses Svelte 5 runes and provides the same component names, worker helpers, and streaming behavior as the Vue and React packages. The package is beta, so check the current release notes before treating the API as fixed.

**Svelte 4 is not supported.**

## When to use markstream-svelte

Use `markstream-svelte` when:

- Content streams from an LLM, SSE, or WebSocket into a Svelte 5 app
- Incomplete Markdown states and token-by-token updates must stay readable
- Long AI responses or long documents matter
- Mermaid/KaTeX/code blocks appear during streaming
- You need Markstream's cross-framework parser behavior
- You need custom Svelte 5 components inside Markdown

For normal chat streaming, pass the raw `content` string and `final` state. The `nodes` path is available for apps that already own parser or AST state.

## Quick Start

```bash
pnpm add markstream-svelte svelte@^5
```

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  let { content = '# Hello from markstream-svelte' }: { content?: string } = $props()
</script>

<MarkdownRender {content} />
```

## Streaming SSE example

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  let content = $state('')
  let final = $state(false)
</script>

<MarkdownRender {content} {final} fade={false} />
```

## Optional peers and what they enable

| Peer | Enables |
| --- | --- |
| `mermaid` | Mermaid diagrams |
| `katex` | Inline and block math rendering |
| `stream-diffs` | Enhanced code blocks (recommended) |
| `@terrastruct/d2` | D2 diagrams |
| `@antv/infographic` | Infographic blocks |

Plain Markdown does not require these optional peers. Install them only for the block types you render. Enhanced code blocks fall back to a plain `<pre>` when `stream-diffs` is not installed.

## When not to use this package

- You are on Svelte 4
- You need a fully stable Svelte renderer API today
- You only render short static Markdown and do not need streaming mid-state handling
- Your app already has a simpler static Markdown stack that covers all content types

## Known limitations / maturity

- **Svelte 5 runes**: uses `$props()`, `$state()`, `$derived()`
- **Two input paths**: raw `content` and pre-parsed `nodes`
- **Smooth streaming**: `smoothStreaming="auto"` can pace the raw `content` path for typewriter-style LLM output
- **Safe HTML policy**: defaults to safe HTML handling and URL/SVG sanitization paths, but you should still review the policy for untrusted content
- **Custom components**: slot Svelte components into Markdown
- **Optional peers**: Mermaid, KaTeX, stream-diffs enhanced code blocks, D2, Infographic
- **Worker parity**: same Katex/Mermaid worker setup as Vue/React
- **Beta status**: check npm and the [Svelte guide](/guide/svelte) for the latest API maturity

## Try it

- [Live playground](https://markstream-svelte.pages.dev/)
- [Full documentation](/guide/svelte)
