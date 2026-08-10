---
title: Override MermaidBlockNode in MarkdownRender
description: Replace the default mermaid renderer in MarkdownRender using setCustomComponents to mount MermaidBlockNode with custom event handlers.
keywords:
  - override mermaid renderer
  - setcustomcomponents
  - markdownrender mermaid
  - custom event handlers
---
# Override MermaidBlockNode in MarkdownRender

If you want to completely replace the `mermaid` renderer used by `MarkdownRender` (for example in the `playground-demo`), you can use `setCustomComponents` and provide a programmatic renderer that mounts `MermaidBlockNode` with custom event handlers.

Example:

```ts twoslash
import type { MermaidBlockEvent } from 'markstream-vue'
import { MermaidBlockNode, setCustomComponents } from 'markstream-vue'
import { h } from 'vue'

declare function uploadSvgToServer(svg: string): void

setCustomComponents('playground-demo', {
  mermaid: (props: any) => h(MermaidBlockNode, {
    ...props,
    onCopy: async (ev: MermaidBlockEvent<{ type: 'copy', text: string }>) => {
      // Optional: take over the copy behavior (clipboard + toast/analytics)
      ev.preventDefault()
      const text = ev.payload?.text ?? ''
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function')
        await navigator.clipboard.writeText(text)
    },
    onExport: (ev: MermaidBlockEvent) => {
      // read the rendered svg from ev.svgElement and upload or save
      const svgEl = ev.svgElement as SVGElement | null
      if (svgEl) {
        const svgString = new XMLSerializer().serializeToString(svgEl)
        uploadSvgToServer(svgString)
      }
      ev.preventDefault()
    },
  }),
})
```

Key points:
- Use `onExport` / `onCopy` (camelCase) when passing listeners via `h()`.
- Call `ev.preventDefault()` to prevent the default behavior inside `MermaidBlockNode`.
- `ev.svgElement` (if present) gives direct access to the rendered SVG DOM node.
- `ev.svgString` (if present) contains a serialized string of the SVG (ready to upload or send to an API).

Quick try — test the override by mounting the custom renderer inside your app's client entry and interacting with onExport in the playground.

```ts twoslash
// .vitepress/clientAppEnhance.ts or playground client entry
import type { MermaidBlockEvent } from 'markstream-vue'
import { MermaidBlockNode, setCustomComponents } from 'markstream-vue'
import { h } from 'vue'

setCustomComponents('playground-demo', {
  mermaid: (props: any) => h(MermaidBlockNode, { ...props, onExport: (ev: MermaidBlockEvent) => {
    ev.preventDefault()
    console.log('exported', ev.svgElement)
  } })
})
```

Playground demo: the repo includes a runnable playground page demonstrating intercepting the export event and uploading the svg — open: /playground/src/pages/mermaid-export-demo.vue or run the playground and visit the route for the demo.
```
