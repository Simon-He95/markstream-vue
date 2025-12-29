# Playground

This repository includes a playable demo under `/playground` that helps you test features locally and reproduce rendering issues.

How to run the playground locally:

```bash
pnpm install
pnpm play
# Open the dev server shown in terminal (usually http://localhost:5173)
```

The playground demonstrates:

- Live streaming Markdown input with progressive Mermaid diagrams
- Custom components mapping and `setCustomComponents`
- Monaco streaming integration and code block examples

Example pages (open from the playground):

- `https://markstream-vue.simonhe.me/test` — shareable repro page for stress-testing streaming features (hosted demo)
- `/markdown` — Markdown vs static rendering comparison

![Playground demo](/screenshots/playground-demo.svg)

If you want to add examples to the playground for documentation pages, keep them minimal and focused (the `playground/src/pages` folder is a good place to add pages).

Quick try — add a simple playground page by creating `playground/src/pages/quick-test.vue` and pasting a small test like:

```vue
<script setup>
import MarkdownRender from 'markstream-vue'

const md = '# Quick playground test\n\nThis is a demo.'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```
