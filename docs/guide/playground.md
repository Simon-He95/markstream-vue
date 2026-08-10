---
title: Playground
description: Explore local and online markstream-vue playgrounds to reproduce rendering issues, compare frameworks, and verify fixes quickly.
keywords:
  - markstream playground
  - reproduce rendering issues
  - online playground
  - compare frameworks
---

# Playground

This repository includes a playable demo under `/playground` that helps you test features locally and reproduce rendering issues.

## Online Playgrounds

- Vue 3: https://markstream-vue.simonhe.me/
- React: https://markstream-react.pages.dev/
- React migration demo: https://markstream-react.pages.dev/migration-demo
- Nuxt: https://markstream-nuxt.pages.dev/
- Vue 2: https://markstream-vue2.pages.dev/

## Running Locally

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
- `https://markstream-react.pages.dev/migration-demo` — hosted before/after migration demo for `react-markdown` users
- `/markdown` — Markdown vs static rendering comparison

![Playground demo](/screenshots/playground-demo.svg)

If you want to add examples to the playground for documentation pages, keep them minimal and focused (the `playground/src/pages` folder is a good place to add pages).

Quick try — add a simple playground page by creating `playground/src/pages/quick-test.vue` and pasting a small test like:

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Quick playground test\n\nThis is a demo.'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```
