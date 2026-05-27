---
description: Integrate markstream-vue into VitePress and docs sites with content mode, enhanceApp registration, trusted custom tags, and safe CSS ordering.
---

# Docs Site & VitePress

Use this path when you are building a docs site, knowledge base, or content-heavy app where Markdown is mostly rendered as stable page content rather than a live token stream.

This is the shortest route for VitePress users who need to answer all of these together:

- should I use `content` or `nodes`
- where should `MarkdownRender` and custom nodes be registered
- how should `enhanceApp` be used
- where should `markstream-vue/index.css` be imported
- how do trusted tags such as `thinking` work in docs pages

## 1. Prefer `content` unless you already own the AST

For docs sites, `content` is usually the right default:

| Situation | Recommended input |
| --- | --- |
| Markdown comes from page content, CMS fields, or normal docs pages | `content` |
| You pre-parse on the server or in a content pipeline | `nodes` |
| You are building a live stream or AI chat inside the docs site | Use [AI Chat & Streaming](/guide/ai-chat-streaming) instead |

## 2. Install the smallest docs-friendly set

```bash
pnpm add markstream-vue stream-markdown
```

That gives you a good default for docs sites: regular Markdown rendering plus lightweight highlighted code blocks.

Add more peers only if your docs actually need them:

- `mermaid` for Mermaid fences
- `katex` for math
- `stream-monaco` for Monaco-powered code blocks

## 3. Register renderer and custom nodes in `enhanceApp`

For VitePress, the safest place to wire global docs-only behavior is `docs/.vitepress/theme/index.ts`.

```ts
import MarkdownRender, { setCustomComponents } from 'markstream-vue'
// docs/.vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme'
import ThinkingNode from './components/ThinkingNode.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('MarkdownRender', MarkdownRender)

    setCustomComponents('docs', {
      thinking: ThinkingNode,
    })
  },
}
```

Why this setup helps:

- `MarkdownRender` becomes available in Markdown pages without local imports
- your docs-specific overrides stay scoped to `custom-id="docs"`
- theme wiring is kept in one place instead of being repeated in every page

## 4. Render Markdown in a docs page

```md
<script setup lang="ts">
const source = `
# Hello docs

<thinking>
This block is rendered by a custom Vue component.
</thinking>
`
</script>

<MarkdownRender
  custom-id="docs"
  :content="source"
  :custom-html-tags="['thinking']"
/>
```

Key points:

- `custom-id="docs"` is what keeps overrides local to the docs site
- `custom-html-tags` tells the parser to emit a real custom node instead of leaving the tag as raw HTML
- if the source is ordinary docs content, `content` is simpler than manually managing `nodes`

## 5. Put CSS in a predictable place

If your docs theme uses custom CSS, import `markstream-vue/index.css` in the theme stylesheet, after your reset or base layer.

```css
/* docs/.vitepress/theme/style.css */

@import 'markstream-vue/index.css' layer(components);

[data-custom-id='docs'] .prose {
  max-width: 72ch;
}
```

Practical rules:

- if your site has a reset, load it before this import
- if you use Tailwind or UnoCSS, use `@import '...' layer(components)`
- if you use KaTeX, also import `katex/dist/katex.min.css`

Go deeper: [Tailwind Integration & Style Ordering](/guide/tailwind)

## 6. Trusted tags such as `thinking`

For docs pages, the recommended flow is still:

1. allowlist the tag with `custom-html-tags`
2. register the node renderer with `setCustomComponents('docs', mapping)`
3. keep the page renderer on `custom-id="docs"`

That is usually enough. Reach for parser hooks only when the source format needs AST reshaping, not just a different renderer.

Go deeper: [Custom Tags & Advanced Components](/guide/custom-components), [API Reference](/guide/api)

## 7. Common docs-site mistakes

- The custom tag renders as raw HTML: you forgot `custom-html-tags`
- The component never appears: it was not registered in `enhanceApp`, or the mapping key does not match the tag name
- Styles look broken: CSS import order is wrong, or utility layers override the renderer
- Overrides leak into other pages: use a scoped `custom-id` instead of a global mapping
- Mermaid or Monaco fails in SSR-like environments: check the relevant feature page and client-only boundaries

Start here when layout or CSS still looks off: [Troubleshooting](/guide/troubleshooting#css-looks-wrong-start-here)

## Next pages

- [Installation](/guide/installation) for peer choices
- [Usage & Streaming](/guide/usage) for `content` vs `nodes`
- [Custom Tags & Advanced Components](/guide/custom-components) for nested custom-tag patterns
- [Tailwind Integration & Style Ordering](/guide/tailwind) for utility CSS stacks
- [Troubleshooting](/guide/troubleshooting) when styles or peers behave unexpectedly
