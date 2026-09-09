---
title: Vue 快速开始
description: 用完整、可复制的 Vue 3 示例安装 markstream-vue，并渲染静态或流式 Markdown。
keywords:
  - Vue 快速开始
  - markstream-vue
  - Vue AI 流式 Markdown
---

# Vue 快速开始

这是最短、完整的 Vue 3 接入。先安装：

```bash
pnpm add markstream-vue
```

然后在应用入口引入一次渲染器样式：

```ts
// main.ts
import 'markstream-vue/index.css'
```

渲染 Markdown。下面的示例可以直接复制运行：

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const content = '# Hello World\n\n这是 **加粗** 的文本。'
</script>

<template>
  <MarkdownRender :content="content" />
</template>
```

## 流式渲染 AI 回复

维护一个持续累加的字符串，并在流结束时设置 `final`。`mode="chat"` 已经选择了平滑输出、关闭 fade 等聊天默认值，不需要重复填写底层 props。

在 Vue 3（含 Nuxt）中，`smooth-streaming` 控制出字节奏，`fade` 控制透明度，两者可以同时开启。`mode="chat"` 保留 `fade=false` 作为轻量默认值；需要文字渐显时添加 `fade`，更看重动画成本时保持关闭。

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const content = ref('')
const isDone = ref(false)

function appendChunk(chunk: string) {
  content.value += chunk
}

function finishStream() {
  isDone.value = true
}
</script>

<template>
  <MarkdownRender
    mode="chat"
    :content="content"
    :final="isDone"
  />
</template>
```

每收到一个 SSE、WebSocket 或 LLM chunk 就调用 `appendChunk()`，流结束时调用一次 `finishStream()`。默认从 `content` 路径开始；只有 worker、store 或自定义 AST 管线已经接管解析时才使用预解析 `nodes`。

## 按需添加能力

| 需求 | 安装 | 下一步 |
| --- | --- | --- |
| 增强代码块和 diff | `pnpm add stream-diffs` | [代码块](/zh/guide/code-blocks) |
| Mermaid 图表 | `pnpm add mermaid` | [Mermaid](/zh/guide/mermaid) |
| KaTeX 数学公式 | `pnpm add katex` | [数学公式](/zh/guide/math) |
| Nuxt SSR | 无额外依赖 | [Nuxt SSR](/zh/nuxt-ssr) |
| Tailwind 或 UnoCSS | 无额外依赖 | [Tailwind 与样式](/zh/guide/tailwind) |

普通 Markdown 本身支持 Nuxt SSR。只有初始化浏览器专属 peer 或 worker 的功能才需要 client-only 边界，不要默认包住整个渲染器。

接下来可阅读 [AI 聊天与流式输出](/zh/guide/ai-chat-streaming) 获取完整接入流程，或阅读 [使用与 API](/zh/guide/usage) 了解 `content`、`nodes` 和高级集成。

<NextStep :items="[
  { text: '安装与可选依赖', link: '/zh/guide/installation' },
  { text: 'AI 聊天与流式输出', link: '/zh/guide/ai-chat-streaming' },
  { text: '组件画廊', link: '/zh/components/' },
]" />
