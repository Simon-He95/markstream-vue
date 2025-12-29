# Component props & options

Use this page when you need to fine-tune streaming behaviour, control heavy nodes, or understand how `MarkdownRender` interacts with Tailwind/UnoCSS projects.

## Core props on `MarkdownRender`

| Prop | Type | Default | Notes |
| ---- | ---- | ------- | ----- |
| `content` | `string` | – | Raw Markdown string (required unless `nodes` is provided). |
| `nodes` | `BaseNode[]` | – | Pre-parsed AST structure (typically `ParsedNode[]` from `parseMarkdownToStructure`). Skip this when you want the component to parse internally. |
| `custom-id` | `string` | – | Scopes `setCustomComponents` mappings and lets you target CSS via `[data-custom-id="..."]`. |
| `final` | `boolean` | `false` | Marks the input as end-of-stream. Disables streaming mid-state (loading) parsing so trailing delimiters (like `$$` or an unclosed code fence) won’t get stuck in a perpetual loading state. |
| `parse-options` | `ParseOptions` | – | Token hooks (`preTransformTokens`, `postTransformTokens`, `postTransformNodes`). Applies only when `content` is provided. |
| `custom-html-tags` | `string[]` | – | Extra HTML-like tags treated as common during streaming mid‑states and emitted as custom nodes (`type: <tag>`) for `setCustomComponents` mapping (forwarded to `getMarkdown`, e.g. `['thinking']`). |
| `custom-markdown-it` | `(md: MarkdownIt) => MarkdownIt` | – | Customize the internal MarkdownIt instance (add plugins, tweak options). |
| `debug-performance` | `boolean` | `false` | Logs parse/render timing and virtualization stats (dev only). |
| `typewriter` | `boolean` | `true` | Enables the subtle enter animation. Disable if you need zero animation for SSR snapshots. |

## Streaming & heavy-node toggles

| Flag | Default | What it does |
| ---- | ------- | ------------ |
| `render-code-blocks-as-pre` | `false` | Render all `code_block` nodes as `<pre><code>` (uses `PreCodeNode`). Helpful when you want to avoid optional peers like Monaco or are debugging CSS collisions. |
| `code-block-stream` | `true` | Stream code blocks as content arrives. Disable to keep Monaco in a loading state until the final chunk lands—useful when incomplete code causes parser hiccups. |
| `viewport-priority` | `true` | Defers heavy work (Monaco, Mermaid) when elements are offscreen. Turn off if you need deterministic renders for PDF/print pipelines. |
| `defer-nodes-until-visible` | `true` | When enabled, heavy nodes can render as placeholders until they approach the viewport (non-virtualized mode only). |

## Rendering performance (virtualization & batching)

| Prop | Default | Notes |
| ---- | ------- | ----- |
| `max-live-nodes` | `320` | Virtualization threshold; set `0` to disable virtualization (renders everything). |
| `live-node-buffer` | `60` | Overscan window (how many nodes to keep before/after the focus range). |
| `batch-rendering` | `true` | Incremental rendering batches (only when `max-live-nodes <= 0`). |
| `initial-render-batch-size` | `40` | How many nodes render immediately before batching begins. |
| `render-batch-size` | `80` | How many nodes render per batch tick. |
| `render-batch-delay` | `16` | Extra delay (ms) before each batch after rAF. |
| `render-batch-budget-ms` | `6` | Time budget (ms) before adaptive batch sizes shrink. |
| `render-batch-idle-timeout-ms` | `120` | Timeout (ms) for `requestIdleCallback` slices (when available). |

## Global code block options (forwarded from `MarkdownRender`)

These props are forwarded to `CodeBlockNode` / `MarkdownCodeBlockNode` (but **not** to Mermaid blocks, which route to `MermaidBlockNode`):

- `code-block-dark-theme`, `code-block-light-theme`
- `code-block-monaco-options`
- `code-block-min-width`, `code-block-max-width`
- `code-block-props` (escape hatch to forward any extra CodeBlock props)
- `themes` (theme list forwarded to `stream-monaco` when present)

## Code block header controls

Pass these props directly to `CodeBlockNode` / `MarkdownCodeBlockNode`, or globally via `code-block-props` on `MarkdownRender`:

- `show-header`
- `show-copy-button`
- `show-expand-button`
- `show-preview-button`
- `show-font-size-buttons`

See `/guide/codeblock-header` and the `CodeBlockNode` types for the exhaustive list.

Example (global defaults):

```vue
<template>
  <MarkdownRender
    :content="md"
    :code-block-props="{ showHeader: false, showFontSizeButtons: false }"
  />
</template>
```

## Quick example

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Title\n\nSome content here.'
</script>

<template>
  <MarkdownRender
    :content="md"
    custom-id="docs"
    :viewport-priority="true"
    :code-block-stream="true"
  />
</template>
```

## Styling & troubleshooting reminders

1. **Import a reset first** (`modern-css-reset`, `@tailwind base`, or `@unocss/reset`), then wrap `markstream-vue/index.css` inside `@layer components` so Tailwind/Uno utilities don’t override node styles. See the [Tailwind guide](/guide/tailwind) for concrete snippets.
2. **Scope overrides** with `custom-id` and `[data-custom-id="docs"]` selectors.
3. **Confirm peer CSS** (Mermaid, KaTeX) is imported; missing styles produce blank renders.
4. **Check the [CSS checklist](/guide/troubleshooting#css-looks-wrong-start-here)** whenever visuals look off.
