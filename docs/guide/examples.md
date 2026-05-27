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

## Typewriter + fade example
- Use `typewriter` for the blinking stream cursor and `fade` for enter/appended-text fade.

## Rendering with `nodes`
- Call `parseMarkdownToStructure` from `stream-markdown-parser` and pass `nodes` to `MarkdownRender` for custom rendering.

Try this — quickly stream a Markdown string with the cursor and fade enabled:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# Streaming test\n\nThis text appears with a subtle enter animation and cursor.'
</script>

<template>
  <MarkdownRender :content="md" :typewriter="true" :fade="true" />
</template>
```
