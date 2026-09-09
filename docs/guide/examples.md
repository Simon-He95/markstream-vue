---
title: Examples
description: Short runnable examples for streaming Markdown in markstream-vue, demonstrating progressive rendering in Vue playground demos.
keywords:
  - markdown examples
  - streaming markdown demo
  - vue renderer examples
  - progressive rendering
---
# Examples

Short examples; see `playground` for interactive demos.

## Streaming Markdown
```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const content = ref('')
const fullContent = `# Streaming Content\n\nThis text appears progressively...`
let i = 0
const interval = setInterval(() => {
  if (i < fullContent.length) {
    content.value += fullContent[i]
    i++
  }
  else {
    clearInterval(interval)
  }
}, 50)
</script>

<template>
  <MarkdownRender :content="content" />
</template>
```

## Typewriter streaming example
- Use `typewriter` for the blinking stream cursor. In Vue 3 (including Nuxt), `smooth-streaming` controls output pacing and `fade` controls opacity; they can be enabled together. `mode="chat"` keeps `fade=false` as a lightweight default. Add `fade` when gradual text reveal is desired; keep it off when animation cost matters more.

## Rendering with `nodes`
- Call `parseMarkdownToStructure` from `stream-markdown-parser` and pass `nodes` to `MarkdownRender` for custom rendering.

Try this — quickly stream a Markdown string with the cursor enabled:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Streaming test\n\nThis text appears with paced streaming and a cursor.'
</script>

<template>
  <MarkdownRender mode="chat" :content="md" :typewriter="true" fade />
</template>
```
