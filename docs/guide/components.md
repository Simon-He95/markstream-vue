# Components & Node renderers

This page explains how each renderer fits together, what peer dependencies or CSS are required, and the typical issues you should check before filing a bug. Pair it with the [VitePress docs playbook](/guide/vitepress-docs) when adding new sections.

## Quick reference

| Component | Best for | Key props/events | Extra CSS / peers | Troubleshooting hooks |
| --------- | -------- | ---------------- | ----------------- | --------------------- |
| `MarkdownRender` | Rendering full AST trees (default export) | `content`, `custom-id`, `setCustomComponents`, `beforeRender`, `afterRender` | Import `markstream-vue/index.css` inside a reset-aware layer (CSS is scoped under an internal `.markstream-vue` container) | Add `custom-id="docs"` to scope overrides; standalone node components need a `.markstream-vue` wrapper; see [CSS checklist](/guide/troubleshooting#css-looks-wrong-start-here) |
| `CodeBlockNode` | Monaco-powered code blocks, streaming diffs | `node`, `monacoOptions`, `stream`, `loading`; slots `header-left` / `header-right` | Install `stream-monaco` (peer) + bundle Monaco workers | Blank editor ⇒ check worker bundling + SSR guards |
| `MarkdownCodeBlockNode` | Lightweight highlighting via `shiki` | `node`, `stream`, `loading`; slots `header-left` / `header-right` | Requires `shiki` + `stream-markdown` | Use for SSR-friendly or low-bundle scenarios |
| `MermaidBlockNode` | Progressive Mermaid diagrams | `node`, `id`, `theme`, `onRender` | Peer `mermaid` ≥ 11; import `mermaid/dist/mermaid.css` for theme | For async errors see `/guide/mermaid` |
| `MathBlockNode` / `MathInlineNode` | KaTeX rendering | `node`, `displayMode`, `macros` | Install `katex` and import `katex/dist/katex.min.css` | SSR requires `client-only` in Nuxt |
| `ImageNode` | Custom previews/lightboxes | Emits `click`, `load`, `error`; accepts `lazy` props via `node.props` | None, but respects global CSS | Wrap in custom component + `setCustomComponents` to intercept events |
| `LinkNode` | Animated underline, tooltips | `color`, `underlineHeight`, `showTooltip` | No extra CSS | Browser defaults can override `a` styles; import reset |
| `VmrContainerNode` | Custom `:::` containers with JSON attrs | `node` (`name`, `attrs`, `children`) | Minimal base CSS; override via `setCustomComponents` | Unknown node type → check `FallbackComponent`; invalid JSON → check `data-attrs` fallback |

## MarkdownRender

> Main entry point that takes Markdown AST content (string or parsed structure) and renders with built-in node components.

### Quick reference
- **Best for**: full markdown documents in Vite, Nuxt, VitePress.
- **Key props**: `content`, `custom-id`, `renderer`, lifecycle hooks.
- **CSS**: include a reset (`modern-css-reset`, `@unocss/reset`, or `@tailwind base`) before `markstream-vue/index.css`. Wrap import with `@layer components` when using Tailwind/UnoCSS.

### CSS scoping

`markstream-vue` scopes its packaged CSS under an internal `.markstream-vue` container to reduce global style conflicts.

- If you use `MarkdownRender`, you normally don't need to do anything—it's already rendered inside that container.
- If you render node components standalone (e.g., `CodeBlockNode`, `MathBlockNode`), wrap them with `<div class="markstream-vue">...</div>` so the library styles and variables apply.

### Usage ladder

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Hello docs\n\nUse `custom-id` to scope styles.'
</script>

<template>
  <MarkdownRender custom-id="docs" :content="md" />
</template>
```

```ts
// Register custom node renderers
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

@layer components {
  @import 'markstream-vue/index.css';
}

[data-custom-id='docs'] .prose {
  max-width: 720px;
}
```

### Performance knobs

- **Batching** — `batchRendering`, `initialRenderBatchSize`, `renderBatchSize`, `renderBatchDelay`, and `renderBatchBudgetMs` define how many nodes transition from placeholders to full components per frame. This incremental mode runs only when virtualization is disabled (`:max-live-nodes="0"`); with virtualization on, the renderer favours instant paint plus DOM windowing over skeleton placeholders.
- **Deferred nodes** — keep `deferNodesUntilVisible` + `viewportPriority` enabled to let heavy blocks (Mermaid, Monaco, KaTeX) yield until they approach the viewport. Disable only when you explicitly want every node to render eagerly.
- **Virtualization window** — `maxLiveNodes` caps how many fully rendered nodes stay mounted; `liveNodeBuffer` controls overscan to avoid pop-in. Tuning these lets long docs stay responsive without sacrificing scrollback. See [Performance tips](/guide/performance) for sample values.
- **Code block fallbacks** — `renderCodeBlocksAsPre` + `codeBlockStream` let you fall back to lightweight `<pre><code>` blocks or pause Monaco streaming when throughput takes priority over tooling.

Combine these props with `custom-id` scoped styles and global parser options (`setDefaultMathOptions`, custom MarkdownIt plugins) to match the latency and UX expectations of your app.

### Common pitfalls
- **Blank styles**: missing reset or incorrect layer ordering → use the [CSS checklist](/guide/troubleshooting#css-looks-wrong-start-here).
- **Conflicting utility classes**: add `custom-id` and scope overrides to `[data-custom-id="..."]`.
- **SSR errors**: wrap in `<ClientOnly>` (Nuxt) or guard with `onMounted` when using browser-only peers.

## CodeBlockNode

> Feature-rich renderer that streams Monaco tokens, supports diff markers, and header slots (`header-left`, `header-right`).

### Quick reference
- **Best for**: interactive editor-like blocks in docs/playgrounds.
- **Peers**: `stream-monaco` (core), Monaco worker bundling via Vite, optional `@shikijs/monaco` for highlighting.
- **CSS**: none (no extra import required).

### Usage

```vue
<script setup lang="ts">
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'ts',
  code: 'const a = 1',
  raw: 'const a = 1',
}
</script>

<template>
  <div class="markstream-vue">
    <CodeBlockNode :node="node" :monaco-options="{ fontSize: 14 }" />
  </div>
</template>
```

```vue
<!-- Advanced: custom header controls -->
<template>
  <CodeBlockNode
    custom-id="docs"
    :node="node"
    :show-copy-button="false"
  >
    <template #header-right>
      <span class="tag">
        Custom
      </span>
    </template>
  </CodeBlockNode>
</template>
```

### HTML/SVG preview dialog
- When `node.language` is `html` or `svg` (and `isShowPreview` stays `true`), the toolbar exposes a Preview button. Without any listener, clicking it opens the built-in iframe dialog (`HtmlPreviewFrame`) that renders your code inside a sandboxed `<iframe>`.
- Attach `@preview-code` to fully override the dialog. The emitted payload contains `{ node, artifactType, artifactTitle, id }`, so you can decide whether to spin up your own modal, route the HTML into a playground, or log artifacts elsewhere. Returning a listener automatically disables the default iframe overlay.

```vue
<script setup lang="ts">
import { ref } from 'vue'

const preview = ref(null)

function handlePreview(artifact) {
  preview.value = artifact
}

function closePreview() {
  preview.value = null
}
</script>

<template>
  <CodeBlockNode
    :node="node"
    show-preview-button
    @preview-code="handlePreview"
  />

  <dialog v-if="preview" class="my-preview" open>
    <header>
      <strong>{{ preview.artifactTitle }}</strong>
      <button type="button" @click="closePreview">
        Close
      </button>
    </header>
    <iframe
      v-if="preview.artifactType === 'text/html'"
      :srcdoc="preview.node.code"
      sandbox="allow-scripts allow-same-origin"
    />
    <div v-else v-html="preview.node.code" />
  </dialog>
</template>
```

> Tip: hide the toolbar control entirely with `:show-preview-button="false"` or globally disable previews via `:is-show-preview="false"` when your docs never need this dialog.

### Common pitfalls
- **Editor invisible**: worker registration missing or blocked by SSR.
- **Tailwind overriding fonts**: wrap imports in `@layer components`.
- **SSR**: Monaco requires browser APIs; use lazy mounts (`client-only`) or `visibility-wrapper`.

## MarkdownCodeBlockNode

> Lightweight code blocks using Shiki instead of Monaco — perfect for SSR/static docs or when bundle size matters.

### Quick reference
- **Peers**: `shiki` + `stream-markdown`.
- **Props**: similar to `CodeBlockNode` (streaming + header controls); lazy-loads `stream-markdown` for Shiki rendering.
- **When to choose it**: VitePress, Nuxt content sites, or anywhere Monaco would be overkill.

### Usage

```vue
<script setup lang="ts">
import { MarkdownCodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'vue',
  code: '<template><p>Hello</p></template>',
  raw: '<template><p>Hello</p></template>',
}
</script>

<template>
  <MarkdownCodeBlockNode :node="node" />
</template>
```

Troubleshooting:
- Ensure `shiki` is installed and properly bundled; otherwise the component falls back to plain `<pre><code>`.
- Wrap CSS imports just like the main renderer to avoid Tailwind/Uno overrides.

## MermaidBlockNode

> Renders Mermaid diagrams progressively, streaming updates as soon as `mermaid` parses the graph.

### Quick reference
- **Peer**: `mermaid` ≥ 11 (tree-shakable ESM build recommended).
- **CSS**: import `mermaid/dist/mermaid.css` after your reset.
- **Props**: `node`, `theme`, `isStrict`, `mermaidOptions`, `onRender`, `custom-id`.

### Usage

```ts
import { MermaidBlockNode, setCustomComponents } from 'markstream-vue'
import 'mermaid/dist/mermaid.css'
```

```vue
<MermaidBlockNode
  custom-id="docs"
  :node="node"
  :is-strict="true"
  theme="forest"
  @render="handleMermaidRender"
/>
```

Troubleshooting:
- Async errors usually stem from missing CSS or unsupported syntax. Check browser console for Mermaid logs.
- When diagrams come from untrusted sources (user/LLM), enable `isStrict` to sanitize the SVG and disable HTML labels—this closes holes where `javascript:` URLs or inline handlers could slip into the render.
- When diagrams are blank in SSR, guard rendering with `onMounted` or `<ClientOnly>` and ensure Mermaid is initialized on the client.

## MathBlockNode / MathInlineNode

> KaTeX-powered math display for block and inline formulas.

### Quick reference
- **Peer**: `katex`.
- **CSS**: `import 'katex/dist/katex.min.css'`.
- **Props**: `node`, `displayMode`, `macros`, `throwOnError`.

### Usage

```ts
import 'katex/dist/katex.min.css'
```

```vue
<MathBlockNode :node="node" :display-mode="true" :macros="{ '\\RR': '\\mathbb{R}' }" />

<MathInlineNode :node="inlineNode" />
```

Troubleshooting:
- Missing CSS → blank formulas or fallback text.
- Nuxt SSR needs `<ClientOnly>` or `client:only` since KaTeX touches DOM APIs.
- To override styling, scope selectors using `[data-custom-id]` rather than editing KaTeX globals directly.

## ImageNode — Custom preview handling

`ImageNode` emits `click`, `load`, `error` so you can build lightboxes or lazy loading wrappers.

```vue
<template>
  <ImageNode :node="node" @click="open(node.props.src)" />
</template>
```

```ts
import { setCustomComponents } from 'markstream-vue'
import CustomImageNode from './ImagePreview.vue'

setCustomComponents('docs', { image: CustomImageNode })
```

Common issues:
- Missing reset causes browser default borders—import a reset before `index.css`.
- Tailwind `img` utilities overriding widths—scope your overrides within `[data-custom-id]`.

## LinkNode: underline animation & color customization

`LinkNode` (internal anchor renderer) exposes runtime props (`color`, `underlineHeight`, `showTooltip`, etc.) so you can change the underline animation without CSS hacks.

```vue
<LinkNode
  :node="node"
  color="#e11d48"
  :underline-height="3"
  underline-bottom="-4px"
  :animation-duration="1.2"
  :show-tooltip="false"
/>
```

Notes:
- Underline uses `currentColor`; override via CSS if you need a different color.
- `showTooltip` toggles the singleton tooltip vs native browser `title`.
- Browser default anchor styles may conflict; follow the reset guidance above.

## HtmlInlineNode — streaming inline HTML

`HtmlInlineNode` renders `html_inline` nodes produced by the parser (inline HTML like `<span>...</span>`).

Streaming behavior:
- If the node is a **true mid‑state** (`loading === true` and `autoClosed !== true`), the component renders the literal text to avoid flashing incomplete tags.
- If the node is **auto‑closed mid‑state** (`autoClosed === true`), the parser has appended a closing tag for stability. The component renders HTML via `innerHTML` but keeps `loading=true` so your app can still treat it as incomplete input.
- Once the real closing tag arrives, the parser clears `loading` and `autoClosed` and the node renders as normal HTML.

## VmrContainerNode — custom ::: containers

`VmrContainerNode` renders custom `:::` containers with support for nested markdown content.

### Quick reference
- **Best for**: Custom container blocks like `::: viewcode:topo-test-001 {"devId":"..."}`.
- **Rendering**: Recursively renders child nodes (paragraphs, lists, code blocks, etc.).
- **CSS**: Minimal base styles; override via `setCustomComponents`.

### Supported child nodes

The component supports the following block-level nodes inside containers:
- **Inline nodes** (inside paragraphs): text, strong, emphasis, link, image, inline_code, etc.
- **Block nodes**: paragraph, heading, list, blockquote, code_block, fence, math_block, table

Unknown node types fall back to `FallbackComponent`, which displays the node type and raw content for debugging.

### Syntax

```markdown
::: container-name {"key":"value"}
Content here...
:::
```

The parser extracts:
- `name` — the container name (e.g., `viewcode:topo-test-001`)
- `attrs` — JSON attributes parsed as data attributes
- `children` — child nodes (parsed markdown content)
- `raw` — the original raw markdown string

### Node type definition

```typescript
interface VmrContainerNode {
  type: 'vmr_container'
  name: string // Container name from ::: name
  attrs?: Record<string, string> // Parsed JSON attributes
  children: ParsedNode[] // Child nodes
  raw: string // Raw markdown source
}
```

### Default rendering

The default component recursively renders all child nodes:

```vue
<!-- Default VmrContainerNode output -->
<div class="vmr-container vmr-container-container-name" data-key="value">
  <!-- Child nodes rendered here (paragraphs, lists, code blocks, etc.) -->
</div>
```

### Example content inside containers

```markdown
::: info
This is a **bold** paragraph with [links](https://example.com).

## Heading inside container

- List item 1
- List item 2

```js
console.log('code blocks work too')
```
:::
```

### Custom override

To customize rendering, register your component using `setCustomComponents`:

```vue
<script setup lang="ts">
import { setCustomComponents } from 'markstream-vue'
import MyViewCode from './MyViewCode.vue'

setCustomComponents('docs', {
  vmr_container: MyViewCode,
})
</script>

<template>
  <MarkdownRender custom-id="docs" :content="markdown" />
</template>
```

### Example: ViewCode component

Here's a complete example that renders a custom `viewcode:*` container:

```vue
<!-- components/ViewCodeContainer.vue -->
<script setup lang="ts">
import NodeRenderer from 'markstream-vue'
import { computed } from 'vue'

interface Props {
  node: {
    type: 'vmr_container'
    name: string
    attrs?: Record<string, string>
    children: any[]
    raw: string
  }
  indexKey?: number | string
  customId?: string
}

const props = defineProps<Props>()

// Extract devId from attrs
const devId = computed(() => props.node.attrs?.devId || '')

// Check if this is a viewcode container
const isViewCode = computed(() => props.node.name.startsWith('viewcode:'))
</script>

<template>
  <!-- Custom rendering for viewcode containers -->
  <div v-if="isViewCode" class="viewcode-wrapper">
    <div class="viewcode-header">
      <span class="viewcode-title">{{ node.name }}</span>
      <span class="viewcode-dev-id">{{ devId }}</span>
    </div>
    <div class="viewcode-content">
      <NodeRenderer
        :nodes="node.children"
        :custom-id="customId"
        :index-key="`${indexKey}-viewcode`"
      />
    </div>
  </div>

  <!-- Fallback rendering for other containers -->
  <div v-else class="vmr-container" :class="`vmr-container-${node.name}`">
    <NodeRenderer
      :nodes="node.children"
      :custom-id="customId"
      :index-key="`${indexKey}-fallback`"
    />
  </div>
</template>

<style scoped>
.viewcode-wrapper {
  border: 1px solid #eaecef;
  border-radius: 8px;
  overflow: hidden;
  margin: 1rem 0;
}

.viewcode-header {
  background: #f8f8f8;
  padding: 0.5rem 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eaecef;
}

.viewcode-title {
  font-weight: 600;
  color: #333;
}

.viewcode-dev-id {
  font-family: monospace;
  font-size: 0.875rem;
  color: #666;
}

.viewcode-content {
  padding: 1rem;
}
</style>
```

### Example: Conditional rendering by name

You can also render different components based on the container name:

```vue
<script setup lang="ts">
import { setCustomComponents } from 'markstream-vue'
import AlertContainer from './AlertContainer.vue'
import ChartContainer from './ChartContainer.vue'
import GenericContainer from './GenericContainer.vue'

// Mapping of container names to components
const containerMap = {
  chart: ChartContainer,
  alert: AlertContainer,
}

setCustomComponents('docs', {
  vmr_container: (node) => {
    // Select component based on container name
    const Component = containerMap[node.name as keyof typeof containerMap]
      || GenericContainer

    return h(Component, { node })
  },
})
</script>
```

### Troubleshooting
- **Raw text visible**: You're seeing the default renderer. Register a custom component via `setCustomComponents`.
- **Attrs undefined**: Ensure your JSON syntax is valid. Invalid JSON falls back to `data-attrs` with the raw string.
- **Component not receiving props**: Make sure your component accepts the `node` prop with the correct type.

## Utility helpers

- `getMarkdown()` — configured `markdown-it-ts` instance with the parser plugins this package expects.
- `parseMarkdownToStructure()` — convert Markdown strings into the AST consumed by `MarkdownRender`.
- `setCustomComponents(id?, mapping)` — swap any node renderer for a specific `custom-id`.

Whenever you add new components or change behavior, update this page *and* the [VitePress docs playbook](/guide/vitepress-docs) so contributors know how to follow the same structure.
