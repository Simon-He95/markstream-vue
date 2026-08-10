---
title: 代码块渲染
description: 介绍 markstream-vue 的代码块渲染能力，包括语言识别、语法高亮、diff 显示、复制与工具栏，以及相关配置选项。
keywords:
  - 代码块渲染
  - 语法高亮
  - diff 代码块
---

# 代码块渲染

## 概述

代码块渲染有三种策略，取决于你安装的可选依赖与配置：

- 增强 surface（推荐用于大型或交互式代码块）：安装 `stream-diffs`，获得 File/FileDiff 渲染、语法高亮和 diff 交互。代码块结束流式输出并进入可视区域后，`CodeBlockNode` 才按需加载 core runtime。
- Shiki（MarkdownCodeBlockNode）：安装 `stream-markdown`，并通过 `setCustomComponents` 覆盖 `code_block` 节点以使用轻量的 Markdown 渲染器。
- 回退（无额外依赖）：如果两个可选包均未安装，代码块会退回为普通的 `<pre><code>` 渲染，仅保留基础样式。

## stream-diffs surface（推荐）

- 安装：

```bash
pnpm add stream-diffs
# or
npm i stream-diffs
```

- 职责边界：`stream-diffs` 根入口与框架无关。它的 controller 接收 `HTMLElement` 与普通的 code/diff 数据，不包含 Vue lifecycle。`stream-diffs/vue` 是独立的可选便捷入口，`markstream-vue` 当前不会使用它。
- 行为：Vue 适配层在内容仍在流式输出时让 `CodeBlockNode` 保持稳定的 `PreCodeNode` 表示；代码块结束且进入可视区域后，才挂载一个 `stream-diffs` File 或 FileDiff surface 并应用语法高亮。
- fallback 与 enhanced surface 都会为行号列预留最少四个字符宽度。流式内容跨过 10、100 或 1000 行边界时 gutter 不会改变；超过四位的行号仍会按需扩展。
- `CodeBlockShell` 负责标题和操作栏，内部 `data-diffs-header` 会被关闭，File surface 不会再渲染第二行标题。
- 这个集成不需要 worker plugin，也不需要额外 CSS import。运行时与预热说明见 [/zh/guide/monaco](/zh/guide/monaco)。

### stream-monaco 回退（legacy）

增强代码块 loader 优先 `stream-diffs`，再回退到 `stream-monaco`，最后才是普通 `<pre>`：

```text
已安装 stream-diffs   → stream-diffs File / FileDiff surface（推荐）
已安装 stream-monaco  → legacy Monaco editor surface（自动回退）
两者都未安装           → 普通 <pre><code> 渲染
```

你不需要同时安装两者。保留 `stream-monaco` 可以让现有 Monaco 配置无改动继续工作；当 `stream-diffs` 未安装时 loader 会自动解析它。这个双运行时 loader 在 vue、vue2、react、svelte、angular 五个包中行为一致。

### 配置

代码块选项通过 `CodeBlockMonacoOptions` 传入——出于兼容性保留了该名称，但值会转发给 `stream-diffs` 适配器。这些配置同时作用于 pre-fallback surface（字体、行高、tab 宽度、内边距），保证两个 surface 在 handoff 时对齐。

在 `MarkdownRender` 上用 `code-block-monaco-options`，或在 `CodeBlockNode` 上用 `monaco-options`：

```vue twoslash
<script setup lang="ts">
import type { CodeBlockMonacoOptions, CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'ts',
  code: 'const answer = 42',
  raw: 'const answer = 42',
} satisfies CodeBlockNodeProps['node']

// fontSize / lineHeight / tabSize 同时驱动流式 <pre> fallback，
// 让 enhanced surface 切换时没有视觉跳动。
const codeBlockMonacoOptions = {
  fontSize: 14,
  lineHeight: 21,
  tabSize: 4,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  wordWrap: 'off',
  theme: 'vitesse-dark',
  renderSideBySide: true,
  MAX_HEIGHT: 640,
} satisfies CodeBlockMonacoOptions
</script>

<template>
  <CodeBlockNode :node="node" :monaco-options="codeBlockMonacoOptions" />
</template>
```

完整选项列表、diff 交互与可选预热见 [/zh/guide/monaco](/zh/guide/monaco)。

### fallback surface 主题

稳定的 `PreCodeNode` fallback（内容流式期间显示；未安装任何增强运行时也会使用它）通过统一的 `--code-*` token 设置主题——`--code-bg`、`--code-fg`、`--code-border`、`--code-header-bg`、`--code-action-fg`、`--code-line-number` 等。这些 token 是覆盖所有框架适配器（vue / vue2 / react / svelte / angular / octane）的唯一主题通道：覆盖它们即可重设 fallback surface 的样式。增强编辑器 surface 由各自的运行时主题绘制，不受 `--code-*` 覆盖影响。

## Shiki 模式（MarkdownCodeBlockNode）

- 安装：

```bash
pnpm add stream-markdown
# or
npm i stream-markdown
```

- 通过 `setCustomComponents` 覆盖 `code_block` 节点以注册 Shiki 版渲染器。示例：

```ts twoslash
import { MarkdownCodeBlockNode, setCustomComponents } from 'markstream-vue'

setCustomComponents({ code_block: MarkdownCodeBlockNode })
```

设置后，`code_block` 会使用 `MarkdownCodeBlockNode`（由 `stream-markdown` + Shiki 驱动）。你也可以自定义组件并直接使用 `stream-markdown`。

### 语言图标懒加载

为了减小主包体积，低频语言图标已拆分到异步 chunk：

- 常见语言（JS/TS/HTML/CSS/JSON/Python 等）图标仍在主包内。
- 低频语言图标按需加载，异步 chunk 返回后会自动刷新图标显示。
- 如果你希望避免首次命中时的回退图标，可在应用空闲阶段预热一次：

```ts twoslash
import { preloadExtendedLanguageIcons } from 'markstream-vue'

if (typeof window !== 'undefined')
  void preloadExtendedLanguageIcons()
```

快速试一下：

```vue twoslash
<script setup lang="ts">
import type { CodeBlockNodeProps } from 'markstream-vue'
import { CodeBlockNode } from 'markstream-vue'

const node = {
  type: 'code_block',
  language: 'js',
  code: 'console.log(42)',
  raw: 'console.log(42)',
} satisfies CodeBlockNodeProps['node']
</script>

<template>
  <CodeBlockNode :node="node" />
</template>
```

### Vue CLI 4（Webpack 4）注意事项

如果你使用 Vue CLI 4（Webpack 4），更推荐把代码块切到 Shiki 模式，并通过覆盖 `code_block` 来避免 Monaco 在 legacy bundler 下的一些兼容性问题。

踩坑与解决（可直接参考 `playground-vue2-cli`）：

- Webpack 4 不支持 `package.json#exports`：建议通过 `resolve.alias` 指向真实的 `dist/*` 文件路径。
- `stream-markdown` 属于 ESM-only 包，在 `vue.config.js`（CJS）里可能无法用 `require.resolve('stream-markdown')` 找到：需要用文件系统兜底去定位 `node_modules/stream-markdown`，并 alias 到 `dist/index.js`。
- 如果你用 `IgnorePlugin` 忽略可选依赖，注意不要误伤 `stream-markdown`，否则运行时会出现 `webpackMissingModule`（表现为 “Cannot find module 'stream-markdown'”）。

## 回退

若 `stream-diffs` 和 `stream-monaco` 均未安装，代码块 loader 返回 `null`，渲染器回退为简单的 `pre`/`code` 表现。回退层仍然显示行号并遵循 `--code-*` 主题 token。

## 参考链接

- Worker / SSR 指南：[/zh/nuxt-ssr](/zh/nuxt-ssr)
- 安装说明：[/zh/guide/installation](/zh/guide/installation)
