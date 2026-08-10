---
title: Vue 快速开始
description: 用最小 Vue 示例快速跑起 markstream-vue，并理解显式 CSS 引入与下一步该看哪些页面。
keywords:
  - Vue 快速开始
  - markstream-vue
  - 安装
---

# Vue 快速开始

先在应用入口或 CSS 管线中引入一次渲染器样式：

```ts
// main.ts
import 'markstream-vue/index.css'
```

然后渲染 Markdown：

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

type MarkdownRenderProps = InstanceType<typeof MarkdownRender>['$props']

const md: MarkdownRenderProps['content'] = `# Hello World\n\n这是 **加粗** 的文本。`
const customId: MarkdownRenderProps['customId'] = 'quick-start'
const isDark: MarkdownRenderProps['isDark'] = false
</script>

<template>
  <MarkdownRender
    :content="md"
    :custom-id="customId"
    :is-dark="isDark"
  />
</template>
```

如果你是为了看 props hover，优先 hover `MarkdownRenderProps['content']`、`MarkdownRenderProps['customId']`、`MarkdownRenderProps['isDark']`，或者上面模板里的对应 attribute。直接 hover 组件名在 Vue 片段里通常信息会更少。

说明：本包的 CSS 会限定在内部 `.markstream-vue` 容器下，以尽量减少对宿主应用全局样式的影响；根 JavaScript 入口不会自动注入样式，所以请把 CSS import 保留在应用入口或 CSS 管线中。如果需要精确控制 layer 顺序，使用 `@import 'markstream-vue/index.css' layer(components);`。

暗色变量支持两种方式：给祖先节点加 `.dark`，或给 `MarkdownRender` 传入 `:is-dark="true"`（仅对渲染器生效）。

如果使用 Nuxt 或 SSR，请用 `<client-only>` 包裹。

如果是聊天类流式输出，优先从 `mode="chat"` + `content` 开始；chat 模式里的 `max-live-nodes <= 0` 会启用 `smooth-streaming="auto"`，并默认关闭 fade。如果你已经在 worker/store 中解析，或需要完整 AST 控制，再改用 `:nodes` + `:final`。

快速试一下：

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

type MarkdownRenderProps = InstanceType<typeof MarkdownRender>['$props']

const md: MarkdownRenderProps['content'] = `# Hello world

试试 Mermaid：

\`\`\`mermaid
graph LR
A-->B
\`\`\`

试试 D2：

\`\`\`d2
direction: right
Client -> API: request
API -> DB: query
DB -> API: rows
API -> Client: response
\`\`\`
`
</script>

<template>
  <MarkdownRender :content="md" />
</template>
```

安装 `mermaid` 或 `@terrastruct/d2` 才能看到图表预览；未安装时会回退为源码展示。
