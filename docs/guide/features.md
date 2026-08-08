# Features

- Progressive Mermaid: diagrams render incrementally
- Progressive D2: diagrams render incrementally with source fallback
- Streaming-first rendering: handle tokenized and partial markdown
- stream-diffs streaming integration: efficient updates for large code blocks
- Streaming diff code blocks: show diffs as they are generated
- Flexible code rendering: stream-diffs enhanced blocks or plain `<pre>` fallback
- Pluggable parse hooks: pre- and post-transform tokens
- Full Markdown support (tables, math, optional Emoji, task checkboxes, code blocks). Emoji is provided as an optional plugin and is not enabled by default — enable it via `getMarkdown` options or the component `customMarkdownIt` prop.
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
