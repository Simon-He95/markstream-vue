---
title: Vue 流式 Markdown 渲染器
description: 使用 markstream-vue 在 Vue 3、Nuxt、VitePress 和 AI 聊天界面中渲染流式 Markdown、SSE/WebSocket 输出、Mermaid、KaTeX 和长文档。
ogImage: /og/vue-streaming.png
ogImageAlt: Vue 流式 Markdown 渲染器，适用于 AI 聊天、SSE、WebSocket 和 Nuxt
keywords:
  - markstream-vue
  - Vue 流式 Markdown 渲染器
  - Nuxt 流式 Markdown 渲染器
  - VitePress Markdown 渲染器
  - Vue AI 聊天 Markdown
  - Vue SSE Markdown
  - Vue WebSocket Markdown
  - Vue 未闭合 Markdown
  - Vue Mermaid Markdown
  - Vue KaTeX Markdown
softwareName: markstream-vue
softwarePackage: markstream-vue
npmPackage: markstream-vue
softwareFramework: Vue
softwareProgrammingLanguage:
  - TypeScript
  - Vue
softwareRuntimePlatform:
  - Vue 3
  - Nuxt
  - VitePress
faq:
  - question: Markstream 只是 Vue 库吗？
    answer: 不是。Markstream 也包含 React、Svelte、Angular、Vue 2、parser 和 core 包，但 markstream-vue 是最成熟的渲染器。
  - question: 短静态 Markdown 也应该用 markstream-vue 吗？
    answer: 不一定。短静态 Markdown 可以用更轻的方案；当你需要流式体验、未闭合 Markdown 中间态、长内容或重型块时更适合 markstream-vue。
  - question: markstream-vue 支持 Nuxt SSR 吗？
    answer: 支持。普通 Markdown 可以在 Nuxt SSR 阶段输出，浏览器专属 peer 能力在 hydration 后增强。
---

# Vue 流式 Markdown 渲染器

`markstream-vue` 是 Markstream 家族里最成熟的渲染器，适合 Vue 3、Nuxt、VitePress、AI 聊天、SSE/WebSocket 输出、移动端 WebView 和长文档。它直接渲染 Markdown 字符串，也支持传入预解析的节点数组，用来控制高频流式输出的解析节奏。

| 需求 | 推荐做法 |
| --- | --- |
| AI 聊天或 SSE 输出 | `mode="chat"`、传 `content` 和 `final`、关闭 `fade` |
| 文档站或稳定长文 | `mode="docs"`，按需启用 `stream-diffs`、Mermaid、KaTeX |
| 移动端 WebView | 导入 `markstream-vue/index.px.css` |
| 50KB 以上长回答 | 使用 `node-virtual="auto"` 和 live node 限制 |

```bash
pnpm add markstream-vue
```

```vue
<script setup>
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'
</script>

<template>
  <MarkdownRender
    mode="chat"
    :content="content"
    :final="isDone"
    :fade="false"
  />
</template>
```

如果输出来自外部用户或模型，优先使用 `htmlPolicy="escape"` 或默认安全策略，不要把原始 HTML 当成可信内容。只在需要 Mermaid、KaTeX、`stream-diffs`、D2 或 Infographic 时安装对应 peer 依赖。

不适合的情况：只渲染很短的静态 Markdown、只需要 HTML 字符串、或者项目已经有完整 sanitizer/plugin 体系且没有流式体验要求。
