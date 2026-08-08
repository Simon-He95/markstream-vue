---
title: Override markstream-vue built-in components
description: Override built-in markstream-vue components like image, code_block, mermaid, and link with scoped, project-safe custom mappings.
keywords:
  - markstream-vue component overrides
  - Vue Markdown custom components
  - override Markdown image renderer
  - override code block renderer
  - custom Markdown node renderer
  - scoped Markdown components
---

# Override Built-in Components

Most advanced customization starts with `setCustomComponents`, not parser hooks.

Use this page when you want to:

- replace built-in renderers such as `image`, `code_block`, `mermaid`, or `link`
- keep overrides scoped to one part of the app
- understand which override key matches which node type

If you want trusted custom tags such as `thinking`, go to [Custom Tags & Advanced Components](/guide/custom-components). If props and slots are enough, stay with [Props & Options](/guide/props).

## 1. Prefer scoped overrides

Use `custom-id` on the renderer and register overrides under the same id:

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const DocImage: Component

setCustomComponents('docs', {
  image: DocImage,
})
```

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const markdown = '![demo](https://example.com/demo.png)'
</script>

<template>
  <MarkdownRender custom-id="docs" :content="markdown" />
</template>
```

Why this is the default recommendation:

- it prevents one project area from changing another
- it makes testing and cleanup easier
- it matches how the renderer merges scoped and global mappings

The single-argument form `setCustomComponents({ ... })` is still supported, but it is best treated as a legacy global override.

## 2. The override keys you will actually use

| Key | What it replaces | Notes |
|-----|------------------|-------|
| `image` | `ImageNode` | Great first override for lightboxes, captions, or lazy-loading wrappers |
| `link` | `LinkNode` | Useful for analytics, router links, or custom tooltip behavior |
| `code_block` | Regular fenced code blocks | Used as the generic fallback after exact language keys and the built-in `mermaid` / `d2` / `infographic` routes |
| `mermaid` | Mermaid fenced blocks | Preferred over `code_block` when only Mermaid needs a custom renderer |
| `d2` | D2 and `d2lang` fenced blocks | Same routing idea as Mermaid |
| `infographic` | Infographic fenced blocks | Use when only infographic output changes |
| `inline_code` | Inline code spans | Useful for docs typography or special inline tooling |
| `heading`, `paragraph`, `list_item`, `blockquote` | Container nodes | Powerful, but you must render children yourself |

The full list of built-in node types lives in [Components API](/guide/components) and the exported `CustomComponents` type.

## 3. Start with leaf-like nodes

Leaf-like nodes are the easiest place to begin because they do not require you to manually re-render child nodes.

### Example: replace `image`

```vue twoslash
<script setup lang="ts">
import type { ImageNodeProps } from 'markstream-vue'

const props = defineProps<ImageNodeProps>()
</script>

<template>
  <figure class="docs-image">
    <img :src="props.node.src" :alt="props.node.alt" loading="lazy">
    <figcaption v-if="props.node.title || props.node.alt">
      {{ props.node.title || props.node.alt }}
    </figcaption>
  </figure>
</template>
```

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const DocImage: Component

setCustomComponents('docs', {
  image: DocImage,
})
```

### Example: override regular code blocks

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const CustomCodeBlockNode: Component

setCustomComponents('docs', {
  code_block: CustomCodeBlockNode,
})
```

This only changes regular fenced code blocks. Mermaid, D2, and infographic blocks still route to their specialized renderers unless you override `mermaid`, `d2`, or `infographic`.

### Example: target one fenced language directly

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const EChartsBlockNode: Component

setCustomComponents('docs', {
  echarts: EChartsBlockNode,
})
```

This only catches fences whose language is `echarts`. The routing order for code blocks is:

- exact language key such as `echarts`
- built-in specialized routes such as `mermaid`, `d2`, and `infographic`
- generic `code_block`

### Example: override Mermaid only

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const CustomMermaidBlock: Component

setCustomComponents('docs', {
  mermaid: CustomMermaidBlock,
})
```

This is the safest pattern when you want custom export controls, branding, or diagram chrome without affecting all code blocks.

## 4. What props your override receives

Every custom renderer receives the basics:

- `node`
- `loading`
- `indexKey`
- `customId`
- `isDark`

The renderer also forwards feature-specific props:

- regular code block overrides receive `stream`, `theme`, `darkTheme`, `lightTheme`, `themes`, `minWidth`, `maxWidth`, and anything passed through `codeBlockProps` (`theme` is the recommended field; `darkTheme` / `lightTheme` remain for compatibility)
- Mermaid, D2, and infographic overrides receive the corresponding `mermaidProps`, `d2Props`, or `infographicProps`
- link and list overrides inherit tooltip and typewriter-related bindings from the parent renderer

The exported prop types in `markstream-vue` are the easiest way to keep your overrides strongly typed.

## 5. Container nodes need extra care

Overriding `heading`, `paragraph`, `list_item`, or `blockquote` is absolutely supported, but those nodes carry children. Your component needs to decide how to render them.

Practical advice:

- start with `image`, `link`, `code_block`, `mermaid`, or `inline_code` unless you truly need container-node control
- if you override a container node, inspect the built-in renderer in `src/components/*` and mirror the child-rendering pattern you need
- keep the override scoped with `custom-id` so you can iterate safely

## 6. Cleanup for dynamic scopes

If the override only lives for a temporary view, remove it when that scope is no longer needed:

```ts twoslash
import { removeCustomComponents } from 'markstream-vue'

removeCustomComponents('docs')
```

This is especially helpful in SPAs, Storybook stories, playgrounds, and test suites.
