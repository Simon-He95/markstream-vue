---
description: Reference the low-level markstream-vue API for parser helpers, render-pipeline decisions, scoped overrides, and AST-aware integration points.
---

# API Reference

This page covers the low-level entry points behind `markstream-vue`: parser helpers, render-pipeline decisions, and scoping hooks.

If you are trying to look up exported Vue components such as `MarkdownRender`, `CodeBlockNode`, or `ImageNode`, use [Renderer & Node Components](/guide/components) instead. Pair this page with [Usage](/guide/usage) and [Props](/guide/props) when wiring everything together.

## Render pipeline at a glance

```
Markdown string → getMarkdown() → markdown-it-ts instance
            ↓
   parseMarkdownToStructure(content, md) → AST (BaseNode[])
            ↓
   <MarkdownRender> → node components (CodeBlockNode, ImageNode, …)
```

You can jump in at any stage:
- Provide `content` to let the component handle parsing automatically.
- Provide `nodes` when you need full control over the AST (server-side parsing, custom transforms).

## Parser helpers

| Helper | Purpose | When to use |
| ------ | ------- | ----------- |
| `getMarkdown(msgId?, options?)` | Returns a configured `markdown-it-ts` instance with the plugins this package expects. | Customize parser options (HTML toggles, additional plugins) before transforming tokens. |
| `parseMarkdownToStructure(content, md)` | Generates the AST consumed by `MarkdownRender` from a Markdown string. | Pre-parse on the server, run validations, or reuse the AST across renders. |

Both helpers are framework-agnostic and can run in Node or the browser. For large documents you can reuse the `md` instance between parses to avoid re-initializing plugins.

> Warning: `parseMarkdownToStructure` defaults to `streamParse: 'auto'`: compatible `md` instances use `md.stream.parse` for non-final top-level parses and retain the latest source/token cache. Final one-shot parses use the regular parser unless you pass `{ streamParse: true }`; pass `{ streamParse: false }` to opt out. If you reuse one `md` instance for unrelated one-shot documents, pass `{ final: true }` or `{ streamParse: false }`.

```ts
const oneShotNodes = parseMarkdownToStructure(source, md, { final: true })
```

## Custom components & scoping

For SSR, prefer app-scoped registration through `VueRendererMarkdown`:

```ts
import { VueRendererMarkdown } from 'markstream-vue'
import { createApp } from 'vue'
import App from './App.vue'
import ThinkingNode from './ThinkingNode.vue'

createApp(App).use(VueRendererMarkdown, {
  components: {
    thinking: ThinkingNode,
  },
})
```

This map is stored on the Vue app instance, so concurrent SSR requests do not share custom components.

Use `setCustomComponents(customId?, mapping)` to override any node renderer in older integrations. Pair it with the `custom-id` prop on `MarkdownRender` so replacements stay scoped.

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const CustomImageNode: Component

setCustomComponents('docs', {
  image: CustomImageNode,
})
```

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '![demo](https://example.com/demo.png)'
</script>

<template>
  <MarkdownRender custom-id="docs" :content="md" />
</template>
```

Tips:
- Use descriptive IDs (`docs`, `playground`, `pdf-export`) for tracing.
- Call `setCustomComponents(mapping)` to set globals, but prefer scoped IDs to avoid surprises in multi-instance apps.
- Clean up mappings in SPA routers if you register them dynamically.

## Parse hooks & transforms

When passing `content`, you can intercept parser stages through `parse-options` (prop) or the `ParseOptions` parameter of `parseMarkdownToStructure`.

Hooks:
- `preTransformTokens(tokens)` — mutate tokens before default handling.
- `postTransformTokens(tokens)` — inspect/adjust tokens before node generation.

If you need to reshape the AST, post-process the returned nodes and pass them to `MarkdownRender` via `nodes`.

Example: render AI “thinking” tags as custom components (no hooks needed):

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const ThinkingNode: Component

setCustomComponents('docs', { thinking: ThinkingNode })
```

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const doc = '<thinking>Need a plan</thinking>'
</script>

<template>
  <MarkdownRender
    custom-id="docs"
    :custom-html-tags="['thinking']"
    :content="doc"
  />
</template>
```

Hooks remain useful if you want to reshape the emitted `thinking` node (strip wrappers, remap attrs, merge blocks, etc.), or post-process the parsed nodes before rendering.

## Utility exports

Besides the core renderer and parser helpers, the package exposes:

- `CodeBlockNode`, `MarkdownCodeBlockNode`, `MermaidBlockNode`, `MathBlockNode`, `ImageNode`, etc. — see [Components](/guide/components) for their props and CSS requirements.
- `useSmoothMarkdownStream(options?)` — adapts bursty source chunks into a stable `visible` Markdown stream with `final`/`pendingChars` state.
- `sanitizeImageSrc(value)` — applies the built-in strict image URL policy when custom image components need the same behavior.
- `VueRendererMarkdown` (global component plugin) and shared type exports (component prop interfaces, parser types).

For parser types and hooks, see [/guide/parser-api](/guide/parser-api) (or the `stream-markdown-parser` README on npm).

## Styling + troubleshooting reminders

- Always include a reset before `markstream-vue/index.css` and use `@import '...' layer(components)` when using Tailwind or UnoCSS. See the [Tailwind guide](/guide/tailwind) and the [CSS checklist](/guide/troubleshooting#css-looks-wrong-start-here).
- Code/graph peers: KaTeX needs its own CSS import; Mermaid does not. Missing KaTeX styles often manifest as invisible formulas.
- Use `custom-id` to scope overrides and avoid global selector conflicts.

Need more examples? Jump into the [Playground](/guide/playground) or run `pnpm play` locally to experiment with custom parsers and renderers.
