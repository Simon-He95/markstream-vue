# Compared to traditional Markdown renderers

Traditional Markdown renderers typically convert a finished Markdown string into a static HTML tree. This library is designed for streaming and interactive workflows and therefore provides capabilities you won't find in a classic renderer:

- Streaming-first rendering: render partial or incrementally-updated Markdown content without re-parsing the whole document each time. This enables live previews for AI outputs or editors that emit tokens progressively.
- Streaming-aware code blocks and "code-jump" UX: large code blocks are updated incrementally and the renderer can maintain cursor/selection context and fine-grained edits.
- Built-in diff/code-stream components: show diffs as they arrive (line-by-line or token-by-token) with minimal reflow.
- Progressive diagrams and code previews: Mermaid and stream-diffs powered code blocks update progressively.
- Flexible code block rendering: `stream-diffs` enhanced blocks or plain `<pre>` fallback.

Quick try — render streaming content and static fallback side-by-side:

```vue
<script setup>
const streaming = '# Streaming example\n\nThis appears progressively'
const staticMd = '# Static example\n\nRendered once'
</script>

<template>
  <div>
    <MarkdownRender :content="streaming" />
    <MarkdownRender :content="staticMd" />
  </div>
</template>
```
