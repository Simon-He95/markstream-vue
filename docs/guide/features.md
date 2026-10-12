---
title: Features
description: Capability overview of markstream-vue covering progressive Mermaid and D2, stream-diffs code rendering, and parse hooks.
keywords:
  - markdown features
  - progressive mermaid
  - streaming diff code blocks
  - stream-diffs code rendering
  - parse hooks
---
# Features

- Progressive Mermaid: diagrams render incrementally
- Progressive D2: diagrams render incrementally with source fallback
- Streaming-first rendering: handle tokenized and partial markdown
- stream-diffs streaming integration: efficient updates for large code blocks
- Streaming diff code blocks: show diffs as they are generated
- Flexible code rendering: stream-diffs enhanced blocks or plain `<pre>` fallback
- Pluggable parse hooks: pre- and post-transform tokens
- Full Markdown support (tables, math, optional Emoji, task checkboxes, code blocks). Emoji is provided as an optional plugin and is not enabled by default — enable it via `getMarkdown` options or the component `customMarkdownIt` prop.
- CJK-friendly emphasis is **on by default**: markers directly next to Chinese/Japanese/Korean punctuation (`说明**「A」**。`) pair the way CJK prose expects, for strong/emphasis and GFM strikethrough. This deviates from CommonMark, so it can be disabled with `cjkFriendly: false` in `getMarkdown()`/factory options. The renderer components do not forward factory options yet; there, revert it through `customMarkdownIt`.
- Lubu features: math rendering via KaTeX, i18n support

Quick try — render a Markdown string with streaming-friendly features:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Streamed Features\n\n```mermaid\ngraph LR\nA-->B\n```'
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

<NextStep :items="[
  { text: 'Component Gallery', link: '/components/' },
  { text: 'Examples', link: '/guide/examples' },
  { text: 'Showcase', link: '/guide/showcase' },
]" />
