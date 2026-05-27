# Mermaid quick start

Mermaid diagrams stream progressively in `markstream-vue`: as soon as the syntax becomes valid the chart renders, then refines as more tokens arrive. This page covers setup, a streaming example, and common fixes.

## 1. Install & import

```bash
pnpm add mermaid
```

No extra Mermaid CSS import is required. Keep `markstream-vue/index.css` after your reset and use `@import '...' layer(components)` when using Tailwind/UnoCSS so utility layers do not override the renderer styles.

```css
@import 'modern-css-reset';

@import 'markstream-vue/index.css' layer(components);
```

## 2. Streaming example

Mermaid renders as soon as the snippet is syntactically valid. The snippet below shows a gradual update (ideal for AI responses or long-running tasks):

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const content = ref('')
const steps = [
  '```mermaid\n',
  'graph TD\n',
  'A[Start]-->B{Is valid?}\n',
  'B -- Yes --> C[Render]\n',
  'B -- No  --> D[Wait]\n',
  '```\n',
]

let i = 0
const id = setInterval(() => {
  content.value += steps[i] || ''
  i++
  if (i >= steps.length)
    clearInterval(id)
}, 120)
</script>

<template>
  <MarkdownRender :content="content" />
  <!-- Diagram progressively appears as content streams in -->
</template>
```

Quick try — paste this Markdown into a page or component:

```md
\`\`\`mermaid
graph LR
A[Start]-->B
B-->C[End]
\`\`\`
```

![Mermaid demo](/screenshots/mermaid-demo.svg)

## 3. Advanced component: `MermaidBlockNode`

Need header controls, export buttons, or a pseudo-fullscreen modal? Use [`MermaidBlockNode`](/guide/mermaid-block-node) or override the default renderer via [setCustomComponents](/guide/mermaid-block-node-override). A runnable playground demo lives at `/mermaid-export-demo`.
Mermaid strict mode and SVG sanitization are enabled by default. Set `:is-strict="false"` only for trusted diagrams that need Mermaid's loose parse/render config. Markstream still sanitizes Mermaid SVG output before mounting.

## 4. When strict mode changes rendering

Moving Mermaid from loose mode to strict mode can change trusted diagrams that depended on Mermaid HTML labels or looser Mermaid parsing/rendering.

Common symptoms after upgrading:

1. Labels that relied on inline HTML such as `<br>`, `<span>`, or richer HTML fragments stop rendering as before.
2. Links or interactions that depended on Mermaid's looser HTML handling disappear from the final SVG.
3. Previously accepted diagram markup now falls back to plain text or renders a simpler label.

If the diagram source is fully trusted and you need Mermaid's loose config, opt out explicitly instead of changing the global default. In Markstream renderers, `isStrict=false` does not mean raw SVG insertion; the final SVG is still sanitized, so `foreignObject` and active HTML labels may be removed.

### Vue 3: switch a trusted Markdown surface to loose Mermaid config

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const trustedMarkdown = `
\`\`\`mermaid
flowchart TD
  A["<b>Trusted HTML label</b><br/>line 2"] --> B
\`\`\`
`
</script>

<template>
  <MarkdownRender
    :content="trustedMarkdown"
    :mermaid-props="{ isStrict: false }"
  />
</template>
```

### Direct component usage

```vue
<MermaidBlockNode :node="node" :is-strict="false" />
```

### Other framework entrypoints

```tsx
import MarkdownRender from 'markstream-react'

<MarkdownRender content={trustedMarkdown} mermaidProps={{ isStrict: false }} />
```

```html
<markstream-angular
  [content]="trustedMarkdown()"
  [mermaidProps]="{ isStrict: false }"
/>
```

```vue
<MarkdownRender :content="trustedMarkdown" :mermaid-props="{ isStrict: false }" />
```

Keep the default strict mode for user content, AI output, or any mixed-trust Markdown stream.

## 5. Troubleshooting checklist

1. **Peer not installed** — run `pnpm add mermaid`. Without it the renderer falls back to showing source text.
2. **Async errors** — check the browser console for Mermaid logs. Versions prior to 11 are unsupported; upgrade to ≥ 11.
3. **SSR guard** — Mermaid needs the DOM. Wrap the component in `<ClientOnly>` for Nuxt or check `typeof window !== 'undefined'` before mounting in SSR contexts.
4. **Heavy graphs** — consider pre-rendering server-side (mermaid CLI) or caching SVG output; the component exposes `svgString` when using `MermaidBlockNode` export events.

Still stuck? Reproduce the issue in the playground (`pnpm play`) with a minimal Markdown sample and link it when opening a bug report.

## CDN usage (no bundler)

If you load Mermaid via CDN and want progressive off-main-thread parsing, inject a CDN-backed worker:

```ts twoslash
import { createMermaidWorkerFromCDN, enableMermaid, setMermaidLoader, setMermaidWorker } from 'markstream-vue'

// use the CDN global (UMD) on the main thread
setMermaidLoader(() => (window as any).mermaid)
enableMermaid(() => (window as any).mermaid)

// optional: worker used for parse/prefix checks during streaming
const { worker } = createMermaidWorkerFromCDN({
  mode: 'module',
  mermaidUrl: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
})
if (worker)
  setMermaidWorker(worker)
```
