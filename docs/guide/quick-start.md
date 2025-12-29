# Quick Start

A minimal example using the library:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const md = `# Hello World\n\nThis is **bold** and this is *italic*.`
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

Note: the packaged CSS is scoped under an internal `.markstream-vue` container to reduce global style conflicts. You normally don't need to do anything—`MarkdownRender` renders inside that container.

For dark theme variables, either add `.dark` on an ancestor or pass `:is-dark="true"` to scope dark mode to the renderer.

Optional: wrap with `<client-only>` for Nuxt/SSR.

See `/nuxt-ssr` for Nuxt-specific instructions.

Try this quickly in your app:

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const md = `# Hello world\n\nTry a simple Mermaid:\n\n\`\`\`mermaid\ngraph LR\nA-->B\n\`\`\`\n`
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```
