---
title: 多框架快速开始
description: 为 Vue、React、Svelte 或 Angular 安装正确的 Markstream 渲染器，并渲染第一段流式 Markdown。
keywords:
  - 快速开始
  - 多框架
  - 流式 Markdown
---

# 多框架快速开始

先按运行时选择包。所有框架包都支持直接传入 Markdown 字符串 `content`；做 AI 聊天、SSE 或 WebSocket 流式输出时，再传入结束状态，让未闭合的代码块、表格和数学公式在结束时稳定下来。

## Vue / Nuxt

```bash
pnpm add markstream-vue
```

```vue
<script setup>
import MarkdownRender from 'markstream-vue'
import 'markstream-vue/index.css'

const content = '# Hello from Markstream'
</script>

<template>
  <MarkdownRender :content="content" />
</template>
```

更完整的 Vue 路径看 [Vue 快速开始](/zh/guide/quick-start)；涉及 SSR、client-only 依赖和 worker 时看 [Nuxt](/zh/frameworks/nuxt)。

## React / Next.js

```bash
pnpm add markstream-react
```

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

export function Message({ content, isDone }: { content: string, isDone: boolean }) {
  return <MarkdownRender content={content} final={isDone} fade={false} />
}
```

Next.js 里，实时 SSE/WebSocket 区域用 root `markstream-react` 放在 `'use client'` 组件中；SSR-first 或 server-only Markdown 看 [Next.js 指南](/zh/frameworks/next)。

## Svelte 5

```bash
pnpm add markstream-svelte svelte@^5
```

```svelte
<script lang="ts">
  import MarkdownRender from 'markstream-svelte'
  import 'markstream-svelte/index.css'

  let { content = '# Hello from markstream-svelte' }: { content?: string } = $props()
</script>

<MarkdownRender {content} />
```

`markstream-svelte` 只支持 Svelte 5。worker 和自定义组件细节看 [Svelte 快速开始](/zh/guide/svelte)。

## Angular

```bash
pnpm add markstream-angular
```

```ts
import { Component, signal } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { MarkstreamAngularComponent } from 'markstream-angular'
import 'markstream-angular/index.css'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MarkstreamAngularComponent],
  template: '<markstream-angular [content]="content()" [final]="true" />',
})
class AppComponent {
  readonly content = signal('# Hello from markstream-angular')
}

bootstrapApplication(AppComponent)
```

Standalone 组件和 Angular 版本要求看 [Angular 快速开始](/zh/guide/angular-quick-start)。
