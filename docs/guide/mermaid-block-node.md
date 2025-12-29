# MermaidBlockNode (Component)

`MermaidBlockNode` is a lightweight, extensible renderer for Mermaid diagrams intended for embedding interactive Mermaid charts within documents. The component supports progressive rendering, source/preview toggling, copying source, exporting SVG, and a pseudo-fullscreen modal (with zoom and drag).

## Props (key)
- `node: any` — the Mermaid code node (required)
- `isDark?: boolean` — dark mode flag
- `loading?: boolean` — initial loading placeholder
- `maxHeight?: string | null` — maximum height
- `isStrict?: boolean` — run Mermaid in `securityLevel: 'strict'` with DOMPurify + HTML-label hardening; use this when rendering untrusted diagrams to strip inline scripts/`javascript:` URLs that could otherwise leak into the SVG
- Header / control props (all optional, default `true`):
  - `showHeader`, `showModeToggle`, `showCopyButton`, `showExportButton`, `showFullscreenButton`, `showCollapseButton`, `showZoomControls`

## Slots
- `header-left` — replace the left area (defaults to Mermaid icon + label)
- `header-center` — replace the center area (defaults to preview/source toggle)
- `header-right` — replace the right-side action buttons (take full control of the default controls)

## Emits
The component emits events using a unified `MermaidBlockEvent` object. Listeners can call `preventDefault()` on the event to stop the component's default behavior:

- `copy` — copy event (component retains default copy behavior unless prevented)
- `export` — export button clicked, signature: `(ev: MermaidBlockEvent<{ type: 'export' }>)`
- `openModal` — request to open the pseudo-fullscreen modal, signature: `(ev: MermaidBlockEvent<{ type: 'openModal' }>)`
- `toggleMode` — toggle between `source` and `preview`, signature: `(target: 'source' | 'preview', ev: MermaidBlockEvent<{ type: 'toggleMode'; target: 'source' | 'preview' }>)`

### Intercept example
Completely override the component's default export behavior:

```vue
<script setup lang="ts">
import type { MermaidBlockEvent } from '../../types/component-props'

function onExport(ev: any /* MermaidBlockEvent */) {
  ev.preventDefault()
  // The component exposes the rendered SVG element on the event as `svgElement`.
  const svgEl = ev.svgElement as SVGElement | null
  if (!svgEl) {
    console.warn('No svg element available')
    return
  }
  const svgString = new XMLSerializer().serializeToString(svgEl)
  uploadSvg(svgString)
}
</script>

<template>
  <MermaidBlockNode :node="node" @export="onExport" />
</template>
```

> Note: The event object includes both `svgElement` (DOM node) and `svgString` (serialized SVG) on `export` and `openModal` events — use whichever is more convenient.

## Slot example — fully replace right-side controls

```vue
<MermaidBlockNode :node="node" :showExportButton="false">
  <template #header-right>
    <button @click="downloadSvg">Download</button>
    <button @click="openCustomModal">Open custom modal</button>
  </template>
</MermaidBlockNode>
```

## Recommended usage
- To implement custom export/upload behavior, call `preventDefault()` in the `export` listener and extract the SVG from the rendered DOM in your handler.
- To fully replace the header UI, use the `header-*` slots and set the corresponding `show*` props to `false` to hide the default controls.
- If Mermaid content originates from users/LLMs or any untrusted source, set `:is-strict="true"` so the component sanitizes the SVG and disables HTML labels; this closes the gap where crafted `javascript:` URLs or event handlers could sneak into the rendered output.

---

Notes:
- `svgString` is already included in `export` and `openModal` event payloads (the serialized SVG string is available on the event), so consumers can upload or post the SVG without re-serializing.
- This page is linked from the docs sidebar and a runnable playground demo is provided in the repo (route: `/mermaid-export-demo`, file: `playground/src/pages/mermaid-export-demo.vue`).

## See also

- Override `MermaidBlockNode` (use `setCustomComponents` with `MarkdownRender`): [Override MermaidBlockNode in MarkdownRender](./mermaid-block-node-override.md)

Playground demo: there's a runnable playground page demonstrating how to intercept `export` and upload `ev.svgString` — see the playground route `mermaid-export-demo` (file: `playground/src/pages/mermaid-export-demo.vue`).

Try this — quick mermaid example you can paste into a component:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = `\n\`\`\`mermaid\ngraph TD\nA-->B\n\`\`\`\n`
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```
