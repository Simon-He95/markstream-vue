---
title: Mermaid export demo
description: A runnable playground demo showing how to intercept the Mermaid export event and upload the serialized SVG from MermaidBlockNode.
keywords:
  - mermaid export demo
  - intercept export event
  - svg upload
  - mermaidblocknode export
---
# Mermaid export demo

This repository includes a runnable playground demo that shows how to intercept the export event from `MermaidBlockNode` and upload the serialized SVG (ev.svgString).

- Playground route: `/mermaid-export-demo`
- File: `playground/src/pages/mermaid-export-demo.vue`

Why use this demo?

- Demonstrates how to use `setCustomComponents` to override the mermaid renderer inside `MarkdownRender`.
- Shows how to intercept `export` and use `ev.svgString` (or `ev.svgElement`) to upload or send the SVG to an API.

Try it: run the playground and visit the route `/mermaid-export-demo`.

Try it locally — runnable example

You can copy the following single-file component into your app or into the playground to try the export handler immediately. It demonstrates a minimal `setCustomComponents` override that intercepts the `export` event and posts the serialized SVG string to a (fake) API.

```vue
<script setup lang="ts">
import MarkdownRender, { MermaidBlockNode, setCustomComponents } from 'markstream-vue'
import { h } from 'vue'

// minimal uploader helper (replace with real upload)
async function uploadSvgToServer(svgString: string) {
  // Example: POST to an API endpoint
  // await fetch('/api/upload', { method: 'POST', body: svgString })
  return `https://example.com/uploads/mermaid-${Date.now()}.svg`
}

setCustomComponents('my-demo', {
  mermaid: (props: any) => h(MermaidBlockNode, {
    ...props,
    // intercept export events (prevent default and upload svgString)
    onExport: async (ev: any) => {
      ev.preventDefault()
      const svg = ev.svgString ?? (ev.svgElement ? new XMLSerializer().serializeToString(ev.svgElement) : null)
      if (!svg) {
        console.warn('no svg available on export')
        return
      }
      const url = await uploadSvgToServer(svg)
      // Show uploaded URL or persist as needed
      console.log('uploaded svg to', url)
    },
  })
})

const md = `
\`\`\`mermaid
graph LR
  A[User] --> B[Server]
  B --> C[Storage]
\`\`\`
`
</script>

<template>
  <MarkdownRender custom-id="my-demo" :content="md" />
</template>
```

Run this in the repo playground with:

```bash
pnpm play
# open http://localhost:5173/mermaid-export-demo or navigate to the route in the playground
```

Live demo (embedded)

You can try the demo right inside the docs site — if the demo is hosted at the public playground URL this iframe will load it (or run the playground locally and open the route):

<div style="max-width:960px; margin: 1rem 0; position:relative;">
  <iframe
    src="https://markstream-vue.simonhe.me/mermaid-export-demo"
    title="Mermaid export demo"
    loading="lazy"
    sandbox="allow-forms allow-scripts allow-popups allow-same-origin"
    style="width:100%; height:540px; border:1px solid #e5e7eb; border-radius:8px; background:#0b0b0b"
  ></iframe>

  <!-- Helpful fallback when embedding is blocked (X-Frame-Options or CSP) -->
  <div style="margin-top:0.5rem; font-size:0.9rem; color:var(--vp-c-default);">
    If the demo shows a blank or black iframe, the remote site may disallow embedding (X-Frame-Options/CSP) or the demo may be offline.
    <strong>Try one of these:</strong>
    <ul>
      <li><a href="https://markstream-vue.simonhe.me/mermaid-export-demo" target="_blank" rel="noopener noreferrer">Open the demo in a new tab</a></li>
      <li>Run the playground locally with <code>pnpm play</code> and visit <code>/mermaid-export-demo</code></li>
      <li>Import the playground into CodeSandbox using the link below to edit and run the demo inline</li>
    </ul>

    <!-- Visual fallback: a representative screenshot stored in docs public assets -->
    <div style="margin-top:0.75rem; border:1px solid rgba(0,0,0,0.06); border-radius:6px; overflow:hidden; max-width:680px;">
      <img src="/screenshots/mermaid-demo.svg" alt="Mermaid export demo screenshot" style="width:100%; display:block; background:#fff" />
      <div style="padding:0.5rem 0.75rem; font-size:0.85rem; color:var(--vp-c-muted);">Preview: Mermaid export demo (run locally if the iframe is blocked)</div>
    </div>
  </div>
</div>

Open in CodeSandbox

If you'd like to edit this demo in a web-based environment, import the repo into CodeSandbox (GitHub import) and open the `playground` folder. Example URL (edit as needed):

[Open the playground in CodeSandbox (GitHub import)](https://codesandbox.io/s/github/Simon-He95/markstream-vue/tree/main/playground)

CodeSandbox (live editable)

<div style="max-width:960px; margin: 1rem 0;">
  <iframe
    src="https://codesandbox.io/embed/github/Simon-He95/markstream-vue/tree/main/playground?autoresize=1&fontsize=14&hidenavigation=1"
    title="Playground (CodeSandbox)"
    style="width:100%; height:520px; border:1px solid #e5e7eb; border-radius:8px;"
    sandbox="allow-modals allow-forms allow-popups allow-scripts allow-same-origin allow-popups-to-escape-sandbox"
  ></iframe>

  <div style="margin-top:0.5rem; font-size:0.9rem; color:var(--vp-c-muted);">
    Edit and run the playground in CodeSandbox — open in a new tab if you prefer the full editor experience:
    <a href="https://codesandbox.io/s/github/Simon-He95/markstream-vue/tree/main/playground" target="_blank" rel="noopener noreferrer">Open playground in CodeSandbox</a>
  </div>
</div>
