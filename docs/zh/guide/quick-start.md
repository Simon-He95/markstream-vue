# 快速开始

示例：

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const md = `# Hello World\n\n这是 **加粗** 的文本。`
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

说明：本包的 CSS 会限定在内部 `.markstream-vue` 容器下，以尽量减少对宿主应用全局样式的影响；正常使用 `MarkdownRender` 无需额外处理。

暗色变量支持两种方式：给祖先节点加 `.dark`，或给 `MarkdownRender` 传入 `:is-dark="true"`（仅对渲染器生效）。

如果使用 Nuxt 或 SSR，请用 `<client-only>` 包裹。
