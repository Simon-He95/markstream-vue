---
title: 示例
description: Markstream 中文文档的使用示例合集，展示流式 Markdown、代码块、图表与自定义组件在各种场景中的实际接入方式。
keywords:
  - Markdown 示例
  - 流式渲染示例
  - 组件用例
---

# 示例

简明示例；交互演示请查看 `playground`。以下为中文示例并附带注释：

## 流式 Markdown

这是将字符逐步添加到 `content` 中并让 `MarkdownRender` 渲染的最小示例：

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

## 使用 `nodes`

如果你想跳过字符串解析阶段，可直接传入解析后的节点：

```ts
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('# Hello', md)
// 在 Vue 中传入 nodes 而不是 content
```

更多示例请查看 `/zh/guide/examples` 或 demo playground 页面。
