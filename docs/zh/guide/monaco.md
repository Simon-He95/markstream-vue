---
title: 代码块 Runtime
description: 说明 markstream-vue 的代码块 Runtime，介绍 CodeBlockNode 使用的可选 stream-diffs runtime 及 stream-monaco 自动回退机制。
keywords:
  - 代码块 Runtime
  - stream-diffs
  - Monaco
---

# 代码块 Runtime

这个保留的旧 URL 现在说明 `CodeBlockNode` 使用的可选 `stream-diffs` runtime。公共 option 的 TypeScript 名称仍保留 `Monaco`，用于兼容已有接入；默认增强 surface 已不再是 Monaco editor。

## 安装

```bash
pnpm add stream-diffs
```

不需要 worker plugin，也不需要额外导入包专用 CSS。

`stream-monaco` 仍然作为自动回退受支持：如果未安装 `stream-diffs`，loader 会尝试 `stream-monaco`（vue2 包走 `stream-monaco/legacy` 入口），再退而渲染普通 `<pre>`。你可以保留现有的 `stream-monaco` 安装，不需要同时安装两个 runtime。

## Runtime 职责边界

```text
markstream-vue                         stream-diffs
---------------                        ------------
CodeBlockNode                          controller + DOM surface
  - Vue props / unmount                  - HTMLElement target
  - 流式结束判断                         - code 或 diff 数据
  - 可视区域判断                         - File / FileDiff 渲染
  - 标题和工具栏                         - syntax highlighting
```

`stream-diffs` 根入口与框架无关：它不导入 Vue，也不拥有 Vue lifecycle。包内另有 `stream-diffs/vue` 这个可选便捷入口，供直接使用 Vue 的业务接入；`markstream-vue` 当前不使用该入口。

## CodeBlockNode 切换流程

`CodeBlockNode` 只有一条稳定的视觉路径：

1. code 正在流式输出时，Vue 渲染 `PreCodeNode`。
2. code 结束且进入可视区域后，组件动态加载 `stream-diffs` 根 runtime，并在既有容器中挂载一个 File 或 FileDiff surface。
3. 组件把当前 theme 应用到 surface；surface ready 后才移除临时 `<pre>`。
4. 组件卸载时，由 Vue 适配层 dispose controller。

结束态、可见性与卸载都是 `CodeBlockNode` 的职责，并不是 `stream-diffs` 的生命周期 hook。

`CodeBlockShell` 负责标题和操作栏。创建 File surface 时会关闭内部 `data-diffs-header`，DOM 始终只有一个 header。

## Runtime options

为兼容已有 API，公开的 TypeScript 名称仍为 `CodeBlockMonacoOptions`。这些值会传给 `CodeBlockNode` 使用的 `stream-diffs` adapter。

```vue twoslash
<script setup lang="ts">
import type { CodeBlockMonacoOptions } from 'markstream-vue'
import MarkdownRender from 'markstream-vue'

const codeBlockMonacoOptions = {
  fontSize: 14,
  lineHeight: 21,
  wordWrap: 'off',
  renderSideBySide: true,
  MAX_HEIGHT: 640,
} satisfies CodeBlockMonacoOptions
</script>

<template>
  <MarkdownRender
    :content="['```ts', 'const answer = 42', '```'].join('\n')"
    :code-block-monaco-options="codeBlockMonacoOptions"
  />
</template>
```

明暗主题请使用 `theme` prop。`CodeBlockNode` 会把主题变化传给已挂载的 surface，不会重建 Vue 组件。

## 可选预热

如果路由确定会出现已经完成且位于可视区域的代码块，可以在空闲时预热 module：

```ts
import { preloadCodeBlockRuntime } from 'markstream-vue'

void preloadCodeBlockRuntime()
```

这个调用只预热可选 module；不会创建 surface、不会完成仍在流式输出的代码块，也不会绕过结束态和可见性 gate。

## Diff 交互

diff block 使用相同的适配边界。通过 `monacoOptions` / `codeBlockMonacoOptions` 设置渲染与 hover action：

```ts twoslash
import type { CodeBlockMonacoOptions } from 'markstream-vue'

const codeBlockMonacoOptions = {
  renderSideBySide: true,
  diffHunkActionsOnHover: true,
  onDiffHunkAction(context) {
    console.log(context.action, context.side)
    return false
  },
} satisfies CodeBlockMonacoOptions
```

返回 `false` 会在回调后阻止默认 diff edit。
