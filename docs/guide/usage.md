---
description: Choose between content and nodes, understand the render pipeline, and wire markstream-vue into Vite, VitePress, Nuxt, and streaming UIs.
---

# Usage & API

This page shows how to wire `markstream-vue` into common stacks, how the parser fits into the renderer, and which docs to visit when something looks odd (reset order, Tailwind/UnoCSS layers, VitePress integration).

## Choose `content` or `nodes` first

| Situation | Recommended input |
|-----------|-------------------|
| Docs pages, static articles, low-frequency updates | `content` |
| SSE, token streaming, AI chat, or frequent incremental updates | `content` + `smooth-streaming` |
| SSR or worker-preparsed content | `nodes` |

If you only need built-in configuration, stay in this page and [Props & Options](/guide/props). If you need to replace rendering behavior, jump to [Override Built-in Components](/guide/component-overrides).

If your real goal is an AI chat surface, token stream, or SSE response viewer, use the dedicated [AI Chat & Streaming](/guide/ai-chat-streaming) path instead of piecing the docs together manually.

If your real goal is a docs site or VitePress theme, use [Docs Site & VitePress](/guide/vitepress-docs-integration) for the end-to-end `content` + `enhanceApp` + CSS setup.

## Minimal render

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const doc = '# Usage example\n\nSupports **streaming** nodes.'
</script>

<template>
  <MarkdownRender custom-id="docs" :content="doc" />
</template>
```

```css
@import 'modern-css-reset';

@import 'markstream-vue/index.css' layer(components);
```

## VitePress + custom tags

If this is your main use case rather than a one-off example, continue with the dedicated [Docs Site & VitePress](/guide/vitepress-docs-integration) path after this section.

In VitePress, register your custom node component once in `enhanceApp`, then use `custom-html-tags` on `MarkdownRender` to let the parser emit custom nodes automatically.

```ts twoslash
import type { Component } from 'vue'
import MarkdownRender, { setCustomComponents } from 'markstream-vue'
// docs/.vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme'
import 'markstream-vue/index.css'

declare const ThinkingNode: Component

export default {
  extends: DefaultTheme,
  enhanceApp() {
    setCustomComponents('docs', { thinking: ThinkingNode })
  },
}
```

```md
<!-- in a VitePress page -->
<MarkdownRender
  custom-id="docs"
  :custom-html-tags="['thinking']"
  :content="source"
/>
```

Tip: unknown HTML-like tags (such as `<question>`) render as raw HTML elements once closed. Incomplete or malformed fragments stay as plain text so they do not swallow nearby Markdown. Add the tag name to `custom-html-tags` when you want custom node output (type + attrs/content).

## Parser pipeline

```ts twoslash
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue'

const md = getMarkdown()

const nodes = parseMarkdownToStructure('# Title', md)
// pass nodes to <MarkdownRender :nodes="nodes" />
```

- `getMarkdown(msgId?, options?)` returns a configured `markdown-it-ts` instance.
- `parseMarkdownToStructure(content, md)` transforms a Markdown string into the AST consumed by the renderer.
- Combine with `setCustomComponents(id?, mapping)` to swap node renderers for a given `custom-id`.

> Warning: `parseMarkdownToStructure` defaults to `streamParse: 'auto'`: compatible `md` instances use `md.stream.parse` for non-final top-level parses and retain the latest source/token cache. Final one-shot parses use the regular parser unless you pass `{ streamParse: true }`; pass `{ streamParse: false }` to opt out. If you reuse one `md` instance for unrelated one-shot documents, pass `{ final: true }` or `{ streamParse: false }`.

```ts
declare const source: string
const oneShotNodes = parseMarkdownToStructure(source, md, { final: true })
```

When `MarkdownRender` parses its own `content`, it intentionally defaults `parseOptions.streamParse` to `true` so streaming parses use `md.stream.parse`. When `final` changes, the renderer invalidates the stream cache and reparses with final semantics to avoid stale loading or unclosed-token state. Pass `:parse-options="{ streamParse: 'auto' }"` to keep final content parses on the regular parser, or `false` to opt out entirely.

## Streaming recommendation

For low-frequency updates, passing `content` directly is convenient. For chat-style token streams or long documents, the built-in smooth streaming on `MarkdownRender` paces `content` updates so visible output stays steady even when incoming chunks are bursty. The default `smooth-streaming="auto"` enables pacing automatically when `typewriter` is on or `max-live-nodes <= 0`.

If you already parse in a worker/store and need full AST control, keep using `nodes` + `final` — but note that the built-in smooth streaming only applies to the `content` path; for the `nodes` path use `useSmoothMarkdownStream` directly to pace the raw text before parsing.

```ts twoslash
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue'

const md = getMarkdown('chat')
declare const source: string
declare const isFinalChunk: boolean
const nodes = parseMarkdownToStructure(source, md, { final: isFinalChunk })
```

```vue twoslash
<script setup lang="ts">
import type { BaseNode } from 'markstream-vue'
import MarkdownRender from 'markstream-vue'

const nodes: BaseNode[] = []
const isFinalChunk = false
</script>

<template>
  <MarkdownRender :nodes="nodes" :final="isFinalChunk" />
</template>
```

That approach avoids reparsing the full Markdown string inside `MarkdownRender` on every tiny content update, which is usually the biggest win for SSE / AI output when you need AST control. For most streaming scenarios, the simpler `content` + `smooth-streaming` path is now recommended instead.

For a full end-to-end rollout order, peer selection, and chat-specific tuning, continue with [AI Chat & Streaming](/guide/ai-chat-streaming).

## Component matrix

For a full list of components and props, visit [Components & node renderers](/guide/components). Highlights:

- `CodeBlockNode` — Monaco-powered blocks (requires `stream-monaco`).
- `MarkdownCodeBlockNode` — Shiki-based lightweight highlighting.
- `MermaidBlockNode` — requires `mermaid` ≥ 11 (no extra CSS).
- `D2BlockNode` — requires `@terrastruct/d2` (no extra CSS).
- `ImageNode` — emits `click`, `load`, `error` for custom previews.

## Styling reminders

1. **Reset first** (`modern-css-reset`, `@tailwind base`, `@unocss/reset`), then import `markstream-vue` styles.
2. **Use CSS layers** when Tailwind/UnoCSS is active (`@import 'markstream-vue/index.css' layer(components);`).
3. **UNO/Tailwind conflicts** — follow the [Tailwind guide](/guide/tailwind) (includes UnoCSS examples) to prevent utilities from overriding renderer styles.
4. **Peer CSS** — KaTeX needs its own CSS; Mermaid/D2 do not. Monaco does not require extra CSS.

## CSS scoping (important)

The package CSS is scoped under an internal `.markstream-vue` container to minimize global style conflicts (Tailwind utilities and theme variables included).

- When you use `MarkdownRender`, you get this container automatically.
- If you render exported node components on their own (e.g. `PreCodeNode`, `FootnoteNode`), wrap them with a container element:

```vue twoslash
<script setup lang="ts">
import type { PreCodeNodeProps } from 'markstream-vue'
import { PreCodeNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'ts',
  code: 'console.log(1)',
  raw: 'console.log(1)',
} satisfies PreCodeNodeProps['node']
</script>

<template>
  <div class="markstream-vue">
    <PreCodeNode :node="node" />
  </div>
</template>
```

If visuals still look wrong, reproduce the issue inside the playground (`pnpm play`) and cross-check with the troubleshooting guide before filing a bug.
