# Usage & API

This page shows how to wire `markstream-vue` into common stacks, how the parser fits into the renderer, and which docs to visit when something looks odd (reset order, Tailwind/UnoCSS layers, VitePress integration).

## Choose your entry point

- **VitePress** — use `MarkdownRender` + `setCustomComponents` inside `enhanceApp`. Follow the [VitePress docs playbook](/guide/vitepress-docs) for component sections and troubleshooting tips.
- **Vite/Nuxt apps** — import `MarkdownRender` in a page/component, remember to include `markstream-vue/index.css` after a reset and inside a `@layer components` block when Tailwind/UnoCSS is present.
- **Parser-only** — call `getMarkdown()` and `parseMarkdownToStructure()` to build custom render pipelines or run pre-processing before rendering.

Whenever you show markdown content inside an existing design system, add `custom-id` to scope overrides and consult the [CSS checklist](/guide/troubleshooting#css-looks-wrong-start-here) for reset/layer order.

## Minimal render

```vue
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

@layer components {
  @import 'markstream-vue/index.css';
}
```

## VitePress + custom tags

In VitePress, register your custom node component once in `enhanceApp`, then use `custom-html-tags` on `MarkdownRender` to let the parser emit custom nodes automatically.

```ts
import MarkdownRender, { setCustomComponents } from 'markstream-vue'
// docs/.vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme'
import ThinkingNode from './components/ThinkingNode.vue'
import 'markstream-vue/index.css'

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

## Parser pipeline

```ts
import { getMarkdown, parseMarkdownToStructure } from 'markstream-vue'

const md = getMarkdown()

const nodes = parseMarkdownToStructure('# Title', md)
// pass nodes to <MarkdownRender :nodes="nodes" />
```

- `getMarkdown(msgId?, options?)` returns a configured `markdown-it-ts` instance.
- `parseMarkdownToStructure()` transforms the Markdown string/tokens to the AST consumed by the renderer.
- Combine with `setCustomComponents(id?, mapping)` to swap node renderers for a given `custom-id`.

## Component matrix

For a full list of components and props, visit [Components & node renderers](/guide/components). Highlights:

- `CodeBlockNode` — Monaco-powered blocks (requires `stream-monaco`).
- `MarkdownCodeBlockNode` — Shiki-based lightweight highlighting.
- `MermaidBlockNode` — requires `mermaid` ≥ 11 + CSS.
- `ImageNode` — emits `click`, `load`, `error` for custom previews.

## Styling reminders

1. **Reset first** (`modern-css-reset`, `@tailwind base`, `@unocss/reset`), then import `markstream-vue` styles.
2. **Use CSS layers** when Tailwind/UnoCSS is active (`@layer components { @import 'markstream-vue/index.css' }`).
3. **UNO/Tailwind conflicts** — follow the [Tailwind guide](/guide/tailwind) (includes UnoCSS examples) to prevent utilities from overriding renderer styles.
4. **Peer CSS** — KaTeX and Mermaid need their own CSS; Monaco does not.

## CSS scoping (important)

The package CSS is scoped under an internal `.markstream-vue` container to minimize global style conflicts (Tailwind utilities and theme variables included).

- When you use `MarkdownRender`, you get this container automatically.
- If you render exported node components on their own (e.g. `PreCodeNode`, `FootnoteNode`), wrap them with a container element:

```vue
<template>
  <div class="markstream-vue">
    <PreCodeNode :node="node" />
  </div>
</template>
```

If visuals still look wrong, reproduce the issue inside the playground (`pnpm play`) and cross-check with the troubleshooting guide before filing a bug.
