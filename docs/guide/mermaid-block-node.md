# MermaidBlockNode (Component)

`MermaidBlockNode` is a lightweight, extensible renderer for Mermaid diagrams intended for embedding interactive Mermaid charts within documents. The component supports progressive rendering, source/preview toggling, copying source, exporting SVG, and a pseudo-fullscreen modal (with zoom and drag).

## Props (key)
- `node: any` — the Mermaid code node (required)
- `isDark?: boolean` — dark mode flag
- `loading?: boolean` — initial loading placeholder
- `maxHeight?: string | null` — maximum height
- `estimatedPreviewHeightPx?: number` — first-preview height reserved before Mermaid finishes rendering; `MarkdownRender` fills this automatically for Mermaid fences
- `isStrict?: boolean` — defaults to `true`; runs Mermaid in `securityLevel: 'strict'` with DOMPurify + HTML-label hardening. Set `false` only for trusted diagrams that need Mermaid's loose parse/render config. The rendered SVG is still sanitized before mounting and export.
- `enableMermaidInteractions?: boolean` — defaults to `false`; enables Mermaid-generated click bindings after sanitized SVG mount. Use only for trusted diagrams.
- `onRenderError?: (error: unknown, code: string, container: HTMLElement) => boolean | void` — custom error handler called when mermaid rendering fails. Return `true` to prevent the default error display. Receives the error, the raw mermaid source code, and the container DOM element so you can render custom content.
- Header / control props (all optional, default `true`):
  - `showHeader`, `showModeToggle`, `showCopyButton`, `showExportButton`, `showFullscreenButton`, `showCollapseButton`, `showZoomControls`, `showTooltips`
- `enableWheelZoom?: boolean` — enable Ctrl/Cmd + wheel zoom in the canvas (default `false`)
- Timeouts (ms): `workerTimeoutMs`, `parseTimeoutMs`, `renderTimeoutMs`, `fullRenderTimeoutMs` (defaults: `1400/1800/2500/4000`)
- Streaming tuning: `renderDebounceMs`, `contentStableDelayMs`, `previewPollDelayMs`, `previewPollMaxDelayMs`, `previewPollMaxAttempts`

## Slots
- `header-left` — replace the left area (defaults to Mermaid icon + label)
- `header-center` — replace the center area (defaults to preview/source toggle)
- `header-right` — replace the right-side action buttons (take full control of the default controls)

## Emits
The component emits events using a unified `MermaidBlockEvent` object. Listeners can call `preventDefault()` on the event to stop the component's default behavior:

- `copy` — copy button clicked, signature: `(ev: MermaidBlockEvent<{ type: 'copy'; text: string }>)` (call `ev.preventDefault()` to stop the built-in clipboard write + "Copied" state)
- `export` — export button clicked, signature: `(ev: MermaidBlockEvent<{ type: 'export' }>)`
- `openModal` — request to open the pseudo-fullscreen modal, signature: `(ev: MermaidBlockEvent<{ type: 'open-modal' }>)`
- `toggleMode` — toggle between `source` and `preview`, signature: `(target: 'source' | 'preview', ev: MermaidBlockEvent<{ type: 'toggle-mode'; target: 'source' | 'preview' }>)`

### Intercept example
Completely override the component's default export behavior:

```vue
<script setup lang="ts">
import type { MermaidBlockEvent } from 'markstream-vue'
import { MermaidBlockNode } from 'markstream-vue'

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
- Mermaid strict mode is enabled by default, so user/LLM diagrams are rendered with Mermaid's strict config and sanitized before mounting. Set `:is-strict="false"` only for trusted diagrams that need Mermaid's loose config; the SVG output is still sanitized.
- Mermaid click bindings are disabled by default. Set `:enable-mermaid-interactions="true"` only for trusted diagrams that need Mermaid `click` callbacks.
- In AI chat scenarios, use `onRenderError` to show raw mermaid source instead of the default error message:

```vue
<script setup lang="ts">
import { MermaidBlockNode } from 'markstream-vue'

function handleMermaidError(_err: unknown, code: string, container: HTMLElement) {
  // Show the raw mermaid text as a code block instead of an error message
  const pre = document.createElement('pre')
  pre.className = 'text-sm font-mono whitespace-pre-wrap p-4'
  pre.textContent = code
  container.replaceChildren(pre)
  return true // prevent default error display
}
</script>

<template>
  <MermaidBlockNode :node="node" :on-render-error="handleMermaidError" />
</template>
```

## Opting into loose Mermaid config

If a trusted diagram needs Mermaid's loose parse/render config, opt out per component instead of disabling the safer default globally. This does not re-enable raw SVG insertion: Markstream sanitizes Mermaid SVG output in both strict and loose modes, so `foreignObject` and active HTML labels may be removed.

```vue
<script setup lang="ts">
import { MermaidBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'mermaid',
  code: 'flowchart TD\n  A["<b>Trusted</b><br/>label"] --> B',
  raw: 'flowchart TD\n  A["<b>Trusted</b><br/>label"] --> B',
}
</script>

<template>
  <MermaidBlockNode :node="node" :is-strict="false" />
</template>
```

Use this only when the Mermaid source is trusted. For user content or LLM output, keep the default strict mode.

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
