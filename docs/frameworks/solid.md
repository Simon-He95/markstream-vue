---
title: SolidJS streaming Markdown renderer for AI chat
description: Use the native markstream-solid renderer in SolidJS 1.9 apps for AI chat, SSE and WebSocket Markdown, incomplete code fences, Mermaid, KaTeX, custom components, SSR, and long-history restoration.
keywords:
  - markstream-solid
  - SolidJS streaming Markdown renderer
  - SolidJS AI chat Markdown
  - Solid Markdown SSR
  - Solid Mermaid KaTeX
faq:
  - question: Which Solid version does markstream-solid support?
    answer: It requires SolidJS 1.9 and uses native Solid components, signals, accessors, and context.
  - question: Can I install markstream-solid from npm now?
    answer: Install with pnpm add markstream-solid solid-js@^1.9 and import markstream-solid/index.css.
  - question: Do I need to pre-parse nodes for streaming?
    answer: Start with accumulated content and a final flag. Pass nodes when your application already owns the parser or AST.
  - question: Does markstream-solid support SSR and hydration?
    answer: Yes. Conditional server/browser builds emit the full server document, preserve it during hydration, and initialize asynchronous enhancements on the client.
---

# SolidJS streaming Markdown renderer

`markstream-solid` renders growing Markdown with native Solid components. It shares the parser and core with Vue 3, including smooth streaming, diff previews, code layout contracts, and diagram utilities. The [Solid guide](/guide/solid) covers installation, compiler setup, and complete examples.

## When to use it

- AI chat, SSE, or WebSocket output in a SolidJS 1.9 application
- Incomplete Markdown and code fences while input is arriving
- Mermaid, KaTeX, D2, infographic, and enhanced code blocks
- Custom Solid components and request-scoped configuration
- Long documents, virtual conversation histories, SSR, and hydration

For a normal stream, pass accumulated `content` and set `final` at completion. Use non-empty `nodes` when your app already owns the AST; an empty array falls back to `content`.

## Quick start

Install in a SolidJS 1.9 / SolidStart application:

```bash
pnpm add markstream-solid solid-js@^1.9
```

Run the repository demo:

```bash
pnpm install
pnpm build:solid
pnpm play:solid
```

Inside a configured Solid application:

```tsx
import MarkdownRender from 'markstream-solid'
import 'markstream-solid/index.css'

export function Message(props: { content: string, done: boolean }) {
  return <MarkdownRender mode="chat" content={props.content} final={props.done} />
}
```

Keep prop reads in JSX/accessors. See [installation and compiler setup](/guide/solid#install-and-requirements) for workspace/tarball consumption, Vite, and TypeScript settings.

## Optional features

| Peer | Enables |
| --- | --- |
| `stream-diffs` | Enhanced code blocks and diffs; native pre fallback while loading |
| `katex` | Math, with `katex/dist/katex.min.css` |
| `mermaid` | Mermaid diagrams |
| `@terrastruct/d2` | D2 diagrams |
| `@antv/infographic` | Infographic blocks, enabled through `enableInfographic` |

Plain Markdown requires none of these optional peers. Import one renderer stylesheet explicitly; pixel and Tailwind CSS entries are available.

## Solid bindings and maturity

- `MarkstreamProvider` scopes components, translations, and language icons.
- Callbacks and JSX/render props provide events and header slots.
- Renderer refs expose virtual-state capture/restore and scroll methods.
- `MarkstreamVirtualTimeline` provides native Solid conversation windows.
- SSR uses the root package's conditional export; browser enhancements start on the client.
- The native implementation has unit, SSR, packed-consumer, browser, geometry, and performance validation.

## Next steps

- [Full Solid guide](/guide/solid)
- [Playground instructions](/guide/playground#solid-playground)
- [Online playground](https://markstream-solid.pages.dev/)
- [Package README](https://github.com/Simon-He95/markstream-vue/tree/main/packages/markstream-solid)
