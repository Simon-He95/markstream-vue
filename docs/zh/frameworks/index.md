---
title: Markstream 框架选择
description: 为 Vue、React、Svelte、Angular、Solid、Nuxt 和 Next.js 选择合适的 Markstream 流式 Markdown 渲染器。
keywords:
  - Markstream 框架包
  - 按框架选择流式 Markdown 渲染器
  - Vue 流式 Markdown 渲染器
  - React 流式 Markdown 渲染器
  - Svelte 流式 Markdown 渲染器
  - Angular 流式 Markdown 渲染器
  - Vue 2 流式 Markdown 渲染器
  - Next.js AI 聊天 Markdown
---

# Markstream 框架包

Markstream 是一组面向 AI 应用的流式 Markdown 渲染器，覆盖 Vue、React、Svelte、Angular、Solid、Nuxt 和 Next.js。各框架包共享同一套流式 Markdown 思路：直接传入 `content`，或在高频流式输出里外部解析成 `nodes`；重型块如 Mermaid、KaTeX、代码块和长文档虚拟化按需启用。

## 按框架选择

| 框架 | 推荐包 | 状态 | 安装 | 先看 |
| --- | --- | --- | --- | --- |
| Vue 3 / Nuxt / VitePress | `markstream-vue` | stable | `pnpm add markstream-vue` | [Vue](/zh/frameworks/vue) / [Nuxt](/zh/frameworks/nuxt) |
| React / Next.js / Remix | `markstream-react` | beta | `pnpm add markstream-react` | [React](/zh/frameworks/react) / [Next.js](/zh/frameworks/next) |
| Svelte 5 | `markstream-svelte` | beta | `pnpm add markstream-svelte svelte@^5` | [Svelte](/zh/frameworks/svelte) |
| Solid | `markstream-solid` | beta | `pnpm add markstream-solid solid-js` | [Solid](/zh/frameworks/solid) |
| Angular standalone | `markstream-angular` | alpha | `pnpm add markstream-angular` | [Angular](/zh/frameworks/angular) |
| Vue 2.6 / 2.7 | `markstream-vue2` | compatibility | `pnpm add markstream-vue2` | [Vue 2](/zh/frameworks/vue2) |
| 只要解析器 | `stream-markdown-parser` | stable | `pnpm add stream-markdown-parser` | [解析器 API](/zh/guide/parser-api) |

## 按场景选择

| 场景 | 推荐包 | 原因 |
| --- | --- | --- |
| Vue AI 聊天 | `markstream-vue` | 最成熟的渲染器，Vue/Nuxt 文档最完整 |
| React AI 聊天 | `markstream-react` | 面向 React 流式渲染；直接竞品对比优先看 Streamdown |
| Next.js SSR-first Markdown | `markstream-react/next` | 先输出服务端 HTML，再做客户端增强 |
| Svelte 5 AI 聊天 | `markstream-svelte` | Svelte 5 渲染器，复用 Markstream parser 行为 |
| Solid AI 聊天 | `markstream-solid` | Solid 渲染器，行为基线是 Svelte；主渲染器不做虚拟化 |
| Angular standalone 应用 | `markstream-angular` | Angular 20+ standalone component |
| Vue 2 存量 AI 聊天 | `markstream-vue2` | Vue 2.6 / 2.7 兼容包；高频长流建议传 `nodes` |
| 只要 parser 管线 | `stream-markdown-parser` | 输出结构化 nodes，不绑定 UI runtime |

## 包成熟度

`markstream-vue` 已进入稳定的 1.x API 契约；当前 npm 版本仍可能带 beta tag，用于发布门禁和跨框架家族同步。

| 包 | 成熟度 | 说明 |
| --- | --- | --- |
| `markstream-vue` | stable | 主线渲染器，文档最完整 |
| `stream-markdown-parser` | stable | renderer 共享的 parser-only 包 |
| `markstream-react` | beta | React 与 Next.js 入口分开说明 |
| `markstream-svelte` | beta / experimental | 仅支持 Svelte 5 |
| `markstream-solid` | beta | 行为基线是 Svelte；主渲染器不做虚拟化 |
| `markstream-angular` | alpha | Angular standalone component |
| `markstream-vue2` | compatibility | Vue 2.6 / 2.7 兼容包；新 Vue 3 项目不应优先使用 |

如果只是把短静态 Markdown 转成 HTML，`marked`、`markdown-it` 或框架生态里的普通 Markdown 组件通常更轻。Markstream 的价值在流式场景：LLM token 流、SSE/WebSocket、未闭合代码块、长回答、渐进 Mermaid 和需要稳定 DOM 的 AI 聊天界面。

## 最小示例

::: code-group

```vue [Vue]
<script setup>
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'
</script>

<template>
  <MarkdownRender mode="chat" :content="content" :final="isDone" />
</template>
```

```tsx [React]
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export function Message({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

```svelte [Svelte]
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'
</script>

<MarkdownRender {content} final={isDone} />
```

```ts [Angular]
import { Component, signal } from '@angular/core'
import { MarkstreamAngularComponent } from 'markstream-angular'
import 'markstream-angular/index.css'

@Component({
  selector: 'app-message',
  imports: [MarkstreamAngularComponent],
  template: '<markstream-angular [content]="content()" [final]="true" />',
})
export class MessageComponent {
  content = signal('# Hello from Markstream')
}
```

```tsx [Solid]
import MarkdownRender from 'markstream-solid'
import 'markstream-solid/index.css'

export function Message(props: { content: string, isDone: boolean }) {
  return <MarkdownRender content={props.content} final={props.isDone} />
}
```

:::

## 常见问题

### Markstream 只是 Vue 库吗？

不是。`markstream-vue` 是最成熟的包，但 Markstream 也有 React、Svelte、Solid、Angular、Vue 2、Next.js 和 parser-only 入口。

### 应该用 Markstream 还是 marked / markdown-it？

只需要 `markdown -> HTML` 时，用 `marked` 或 `markdown-it` 更直接。需要框架组件渲染、流式中间态稳定性或 AI 聊天体验时，用 Markstream。

### 应该用 markstream-react、Streamdown 还是 react-markdown？

选择 React 流式 Markdown 渲染器时，优先对比 `markstream-react` 和 Streamdown。短静态 React Markdown 或成熟 remark/rehype 插件链可以继续评估 `react-markdown`。

### 哪些包是稳定的？

`markstream-vue` 和 `stream-markdown-parser` 是 stable。`markstream-react` 和 `markstream-solid` 是 beta，`markstream-svelte` 是 beta / experimental，`markstream-angular` 是 alpha，`markstream-vue2` 是兼容包。

### 新项目应该用 markstream-vue2 吗？

只有应用必须停留在 Vue 2.6 / 2.7 时才使用 `markstream-vue2`。Vue 3 或新的 Nuxt 项目应从 `markstream-vue` 开始。Vue 2 中只渲染短完成态 Markdown 时，普通静态 Markdown 渲染器通常更简单。

## 常用下一步

```bash
pnpm add markstream-vue
pnpm add markstream-react
pnpm add markstream-svelte svelte@^5
pnpm add markstream-solid solid-js
pnpm add markstream-angular
pnpm add markstream-vue2
```

需要最小可运行示例时看 [多框架快速开始](/zh/quick-start)。如果你已经确定框架，直接进入对应页面会更快。
