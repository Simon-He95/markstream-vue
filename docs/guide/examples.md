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
- Use `typewriter` for the blinking stream cursor. During smooth streaming, keep `fade` disabled; use `fade=true` for completed/static content that arrives all at once.

## Rendering with `nodes`
- Call `parseMarkdownToStructure` from `stream-markdown-parser` and pass `nodes` to `MarkdownRender` for custom rendering.

Try this — quickly stream a Markdown string with the cursor enabled:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Streaming test\n\nThis text appears with paced streaming and a cursor.'
</script>

<template>
  <MarkdownRender :content="md" :typewriter="true" :fade="false" />
</template>
```
