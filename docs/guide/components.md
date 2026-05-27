---
description: Look up MarkdownRender, CodeBlockNode, MermaidBlockNode, ImageNode, LinkNode, and other exported markstream-vue renderer components.
---

# Renderer & Node Components

Use this page when you already know you need a specific exported component and want the shortest path to its props, events, CSS requirements, and the page that goes deeper.

If you are still deciding where to customize the pipeline, start with:

- Need parser helpers, AST hooks, or `setCustomComponents()` strategy: [API Reference](/guide/api)
- Need a scoped renderer replacement: [Override Built-in Components](/guide/component-overrides)
- Need trusted custom tags such as `thinking`: [Custom Tags & Advanced Components](/guide/custom-components)
- Need configuration, performance, or toolbar tuning: [Props & Options](/guide/props)

## Quick reference

| Component | Best for | Key props/events | Extra CSS / peers | Troubleshooting hooks |
| --------- | -------- | ---------------- | ----------------- | --------------------- |
| `MarkdownRender` | Rendering full AST trees (default export) | Props: `content` / `nodes`, `custom-id`, `final`, `parse-options`, `custom-html-tags`, `is-dark`, `code-block-props`, `mermaid-props`, `d2-props`, `infographic-props`; events: `copy`, `handleArtifactClick`, `click`, `mouseover`, `mouseout` | Import `markstream-vue/index.css` inside a reset-aware layer (CSS is scoped under an internal `.markstream-vue` container) | Use `setCustomComponents(customId, mapping)` + `custom-id` to scope overrides; see [CSS checklist](/guide/troubleshooting#css-looks-wrong-start-here) |
| `CodeBlockNode` | Monaco-powered code blocks, streaming diffs | `node`, `monacoOptions`, `stream`, `loading`; events: `copy`, `previewCode`; slots `header-left` / `header-right`; diff hover actions live under `monacoOptions` (`diffHunkActionsOnHover`, `diffHunkHoverHideDelayMs`, `onDiffHunkAction`) | Install `stream-monaco` (peer) + bundle Monaco workers | SSR sends a `<pre><code>` fallback first; blank editor => check worker bundling + client enhancement setup |
| `MarkdownCodeBlockNode` | Lightweight highlighting via `shiki` | `node`, `stream`, `loading`; slots `header-left` / `header-right` | Requires `stream-markdown` | Use for SSR-friendly or low-bundle scenarios |
| `MermaidBlockNode` | Progressive Mermaid diagrams | `node`, `isDark`, `isStrict`, `maxHeight`, `estimatedPreviewHeightPx`; emits `copy`, `export`, `openModal`, `toggleMode` | Peer `mermaid` >= 11; no extra CSS required | SSR sends readable fallback markup first; for async errors see `/guide/mermaid` |
| `D2BlockNode` | Progressive D2 diagrams | `node`, `isDark`, `maxHeight`, `progressiveRender`, `progressiveIntervalMs`; toolbar toggles | Peer `@terrastruct/d2`; no extra CSS | SSR sends fallback/source first; missing peer stays on fallback; see `/guide/d2` |
| `MathBlockNode` / `MathInlineNode` | KaTeX rendering | `node` | Install `katex` and import `katex/dist/katex.min.css` | SSR can emit KaTeX HTML when you register a sync loader; otherwise it falls back to raw text |
| `ImageNode` | Custom previews/lightboxes | Props: `fallback-src`, `show-caption`, `lazy`, `svg-min-height`, `use-placeholder`; emits `click`, `load`, `error` | None, but respects global CSS | Wrap in a custom component + `setCustomComponents` to intercept events |
| `LinkNode` | Animated underline, tooltips | `color`, `underlineHeight`, `showTooltip` | No extra CSS | Browser defaults can override `a` styles; import reset |
| `VmrContainerNode` | Custom `:::` containers | `node` (`name`, `attrs`, `loading`, `children`) | Minimal base CSS; override via `setCustomComponents` | JSON attrs are normalized onto `node.attrs` (keys without `data-`); invalid/partial JSON becomes `attrs.attrs`; args after name stored in `attrs.args` |

## TypeScript exports

`markstream-vue` exports renderer and component prop interfaces:

```ts twoslash
import type { CodeBlockNodeProps } from 'markstream-vue'
import MarkdownRender from 'markstream-vue'

type MarkdownRenderProps = InstanceType<typeof MarkdownRender>['$props']
type MarkdownRenderCodeBlockProps = NonNullable<MarkdownRenderProps['codeBlockProps']>

declare const markdownRenderProps: MarkdownRenderProps
declare const markdownRenderCodeBlockProps: MarkdownRenderCodeBlockProps
declare const codeBlockProps: CodeBlockNodeProps

// Hover the property names after each dot.
markdownRenderProps.content
markdownRenderProps.customId
markdownRenderProps.isDark
markdownRenderProps.codeBlockProps?.showHeader
markdownRenderProps.codeBlockProps?.showTooltips
markdownRenderProps.codeBlockMonacoOptions
markdownRenderProps.codeBlockMonacoOptions?.theme
markdownRenderProps.codeBlockMonacoOptions?.languages
markdownRenderProps.codeBlockMonacoOptions?.diffHunkActionsOnHover
markdownRenderProps.themes

markdownRenderCodeBlockProps.showFontSizeButtons
markdownRenderCodeBlockProps.showCollapseButton

codeBlockProps.monacoOptions
codeBlockProps.monacoOptions?.MAX_HEIGHT
codeBlockProps.theme
```

Notes:

- `InstanceType<typeof MarkdownRender>['$props']` is the most direct way to inspect the exported component props.
- `NodeRendererProps` is the named export for the same public prop surface.
- `codeBlockProps` now follows the public `CodeBlockNode` prop surface except for `node`, so hover/completion works for flags like `showHeader`, `showFontSizeButtons`, and `showTooltips`.
- Prefer `codeBlockProps.theme` for new code. `darkTheme` / `lightTheme` still exist for backward compatibility.
- Hover the property names after each dot in the snippet above, not the imported type names.
- If you specifically want the best component-prop hover targets, use the `MarkdownRender` snippet below first.
- Only `ts twoslash` and `vue twoslash` fences in this docs site enable hoverable type details.

Language icons default to the built-in `material` theme. Advanced integrations can inspect or switch icon themes with the exported helpers:

```ts
import { getRegisteredThemes, registerIconTheme, setIconTheme } from 'markstream-vue'

console.log(getRegisteredThemes()) // ['material']
setIconTheme('material')

// registerIconTheme(...) lets you add your own icon pack before switching.
```

## Pick the right component quickly

- Use `MarkdownRender` for almost every app-level integration.
- Use `CodeBlockNode`, `MermaidBlockNode`, `D2BlockNode`, or `MathBlockNode` when you are composing lower-level node renderers yourself.
- Use `ImageNode`, `LinkNode`, or `VmrContainerNode` when you only need to replace one built-in node with custom behavior.
- If you render node components directly, wrap them in `<div class="markstream-vue">...</div>` so packaged CSS variables and component styles apply.

## MarkdownRender

> Main entry point that takes Markdown AST content (string or parsed structure) and renders with built-in node components.

### Quick reference

- **Best for**: full markdown documents in Vite, Nuxt, VitePress.
- **Key props**: `content` / `nodes`, `custom-id`, `final`, `parse-options`, `custom-html-tags`
- **CSS order**: import reset first, then use `@import 'markstream-vue/index.css' layer(components);`.

### CSS scope

`markstream-vue` scopes its packaged CSS under an internal `.markstream-vue` container to reduce global style conflicts.

- When you use `MarkdownRender`, this container is already present.
- When you render node components directly, wrap them with `<div class="markstream-vue">...</div>` so theme variables and component styles apply.

### Best hover targets

Start by hovering `:content`, `custom-id`, `:is-dark`, and `:code-block-monaco-options` in this example:

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

type MarkdownRenderProps = InstanceType<typeof MarkdownRender>['$props']

const content: MarkdownRenderProps['content'] = '# Hello'
const customId: MarkdownRenderProps['customId'] = 'docs'
const isDark: MarkdownRenderProps['isDark'] = true
const monacoOptions: MarkdownRenderProps['codeBlockMonacoOptions'] = {
  theme: 'vitesse-dark',
  languages: ['typescript', 'vue'],
  MAX_HEIGHT: 520,
}
</script>

<template>
  <MarkdownRender
    :content="content"
    :custom-id="customId"
    :is-dark="isDark"
    :code-block-monaco-options="monacoOptions"
  />
</template>
```

### Usage ladder

```vue twoslash
<script setup lang="ts">
import type { CodeBlockMonacoOptions } from 'markstream-vue'
import MarkdownRender from 'markstream-vue'

const md = '# Hello\n\nUse custom-id to scope styles.'
const monacoOptions = {
  theme: 'vitesse-dark',
  themes: ['vitesse-dark', 'vitesse-light'],
  languages: ['typescript', 'vue'],
  MAX_HEIGHT: 520,
  diffHunkActionsOnHover: true,
} satisfies CodeBlockMonacoOptions
</script>

<template>
  <MarkdownRender
    custom-id="docs"
    :content="md"
    :code-block-monaco-options="monacoOptions"
  />
</template>
```

```ts
// Register custom nodes
import { setCustomComponents } from 'markstream-vue'
import CustomImageNode from './CustomImageNode.vue'

setCustomComponents('docs', {
  image: CustomImageNode,
})
```

```css
/* styles/main.css */
@import 'modern-css-reset';
@tailwind base;

@import 'markstream-vue/index.css' layer(components);

[data-custom-id='docs'] .prose {
  max-width: 720px;
}
```

### Performance props

- **Batch rendering**: `batchRendering`, `initialRenderBatchSize`, `renderBatchSize`, `renderBatchDelay`, and `renderBatchBudgetMs` control how many nodes switch from skeletons to real components per frame. This only activates when virtualization is disabled (`:max-live-nodes="0"`).
- **Deferred heavy nodes**: `deferNodesUntilVisible` and `viewportPriority` are enabled by default so Mermaid, D2, Monaco, and KaTeX only load near the viewport.
- **Virtualization window**: `maxLiveNodes` limits how many rendered nodes stay in the DOM, and `liveNodeBuffer` controls overscan. See [Performance](/guide/performance).
- **Code block fallback**: use `renderCodeBlocksAsPre` and `codeBlockStream` to downgrade standard code fences to `<pre><code>` or disable streaming updates during heavy workloads.

### Common issues

- **Broken styles**: start with the [CSS checklist](/guide/troubleshooting#css-looks-wrong-start-here).
- **Utility class leakage**: pass `custom-id` and scope overrides with `[data-custom-id="docs"]`.
- **SSR errors**: the renderer itself is SSR-safe; only gate your own browser-only page logic or manual peer initialization with client-only / mounted guards.

### Use this when

- You want the default parser + renderer path with the fewest moving parts.
- You need one integration point for streaming, virtualization, batching, custom tags, and scoped overrides.
- You want to choose between `content` and `nodes` without wiring individual node renderers yourself.

### Most common combinations

- `content` + `custom-id`: static or lightly customized documents.
- `nodes` + `final`: streaming or server-preparsed workflows.
- `custom-html-tags` + `setCustomComponents(customId, mapping)`: trusted custom tags such as `thinking`.
- `renderCodeBlocksAsPre`: downgrade heavy code blocks during SSR or constrained environments.

## CodeBlockNode

> Monaco-backed code block renderer with streaming diff support and interactive toolbar actions.

- **Best for**: rich code review, diff inspection, live patches, hover actions.
- **Key props**: `node`, `monacoOptions`, `stream`, `loading`
- **Events**: `copy`, `previewCode`
- **Slots**: `header-left`, `header-right`
- **Peers**: `stream-monaco`, plus Monaco worker setup in your bundler
- **Common gotcha**: if the editor area is blank, verify worker bundling and SSR guards first

Reach for this when the code block itself is part of the product experience. If you only need syntax highlighting, prefer `MarkdownCodeBlockNode`.

Deep dive: [CodeBlockNode](/guide/code-block-node), [Monaco](/guide/monaco)

## MarkdownCodeBlockNode

> Lightweight syntax-highlighted code block renderer powered by Shiki via `stream-markdown`.

- **Best for**: SSR-friendly docs, blog-style pages, smaller bundles
- **Key props**: `node`, `stream`, `loading`
- **Slots**: `header-left`, `header-right`
- **Peers**: `stream-markdown`
- **Common gotcha**: if highlighting never appears, confirm `stream-markdown` is installed and loaded in the environment where rendering happens

Choose this when you do not need Monaco's editing surface or diff interactions.

## MermaidBlockNode

> Progressive Mermaid renderer with copy/export/modal hooks.

- **Best for**: large Mermaid graphs, AI-generated diagrams, user-triggered export
- **Key props**: `node`, `isDark`, `isStrict`, `maxHeight`, `estimatedPreviewHeightPx`
- **Events**: `copy`, `export`, `openModal`, `toggleMode`
- **Peer**: `mermaid` >= 11
- **Common gotcha**: treat Mermaid as client enhancement; SSR already returns fallback markup, but preview rendering still initializes on the client

`MarkdownRender` estimates `estimatedPreviewHeightPx` for Mermaid fences when callers do not provide it. Pass it manually only when rendering `MermaidBlockNode` directly or when a custom `mermaid` renderer already knows the first-preview height.

Deep dive: [Mermaid](/guide/mermaid), [MermaidBlockNode](/guide/mermaid-block-node)

## D2BlockNode

> Progressive D2 diagram renderer for structured architecture diagrams and sequence-like layouts.

- **Best for**: D2-driven docs, generated architecture views, progressive rendering
- **Key props**: `node`, `isDark`, `maxHeight`, `progressiveRender`, `progressiveIntervalMs`
- **Peer**: `@terrastruct/d2`
- **Common gotcha**: missing peer falls back to source display instead of the rendered diagram

Deep dive: [D2](/guide/d2)

## MathBlockNode / MathInlineNode

> KaTeX-backed block and inline math renderers.

- **Best for**: technical docs, formulas, AI math responses
- **Key prop**: `node`
- **Peer**: `katex`
- **Required CSS**: `katex/dist/katex.min.css`
- **Common gotcha**: invisible math usually means KaTeX CSS is missing, not that parsing failed

## ImageNode

> Built-in image renderer with sensible defaults for captioning, fallbacks, and lazy behavior.

- **Best for**: custom previews, analytics hooks, lightbox integration
- **Key props**: `fallback-src`, `show-caption`, `lazy`, `svg-min-height`, `use-placeholder`
- **Events**: `click`, `load`, `error`
- **Common pattern**: wrap this with a custom component and register it through `setCustomComponents(customId, { image: CustomImageNode })`

Deep dive: [ImageNode](/guide/image-node)

## LinkNode

> Link renderer with underline animation and optional tooltip behavior.

- **Best for**: docs sites and chat surfaces where link affordance needs to match your design system
- **Key props**: `color`, `underlineHeight`, `showTooltip`
- **Common gotcha**: browser defaults or resets can override anchor styles, so verify CSS order before assuming the component is broken

## VmrContainerNode

> Renderer for `:::` containers and other normalized block containers coming from the parser.

- **Best for**: callouts, notices, AI-specific block types, container-style custom components
- **Key prop**: `node` with `name`, `attrs`, `loading`, and `children`
- **Normalization detail**: JSON attrs are normalized onto `node.attrs`; invalid or partial JSON is preserved under `attrs.attrs`; args after the container name are stored in `attrs.args`
- **Common pattern**: use this together with `custom-html-tags` or parser hooks when you need trusted structured blocks

## Direct node rendering checklist

When you bypass `MarkdownRender` and mount node components directly:

- Wrap them in a `.markstream-vue` container.
- Import the same CSS you would for the full renderer.
- Install and guard only the peers needed by the nodes you actually render.
- Scope any replacement styles with a parent selector or `data-custom-id` equivalent.

## Need a different layer of the stack?

- Use [API Reference](/guide/api) for parser helpers, `setCustomComponents`, and AST hooks.
- Use [Props & Options](/guide/props) for full renderer prop behavior.
- Use [Troubleshooting](/guide/troubleshooting) if the right component is already chosen but CSS, peers, or SSR still misbehave.
