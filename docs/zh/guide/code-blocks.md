# 代码块渲染

## 概述

代码块渲染有两种策略，取决于你安装的可选依赖：

- 增强 surface（推荐用于大型或交互式代码块）：安装 `stream-diffs`，获得 File/FileDiff 渲染、语法高亮和 diff 交互。代码块结束流式输出并进入可视区域后，`CodeBlockNode` 才按需加载 core runtime。
- 回退（无额外依赖）：如果未安装 `stream-diffs`，代码块会退回为普通的 `<pre><code>` 渲染，仅保留基础样式。

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
- 这个集成不需要 worker plugin，也不需要额外 CSS import。运行时与预热说明见 [/zh/guide/code-block-runtime](/zh/guide/code-block-runtime)。

### 配置

增强的 `stream-diffs` surface 不暴露按块（per-block）的 options prop。代码与 diff 选项使用 `stream-diffs` 内置默认值，因此不再需要 `monaco-options` 风格的配置。主题通过 `theme` / `darkTheme` / `lightTheme` / `themes` props 设置（见 `CodeBlockTheme`）。

完整运行时行为、diff 交互与可选预热见 [/zh/guide/code-block-runtime](/zh/guide/code-block-runtime)。

### fallback surface 主题

稳定的 `PreCodeNode` fallback（内容流式期间显示；未安装任何增强运行时也会使用它）通过统一的 `--code-*` token 设置主题——`--code-bg`、`--code-fg`、`--code-border`、`--code-header-bg`、`--code-action-fg`、`--code-line-number` 等。这些 token 是覆盖所有框架适配器（vue / vue2 / react / svelte / angular / octane）的唯一主题通道：覆盖它们即可重设 fallback surface 的样式。增强 surface 由各自的运行时主题绘制，不受 `--code-*` 覆盖影响。

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

## 回退

若未安装 `stream-diffs`，代码块 loader 返回 `null`，渲染器回退为简单的 `pre`/`code` 表现。回退层仍然显示行号并遵循 `--code-*` 主题 token。

## 参考链接

- Worker / SSR 指南：[/zh/nuxt-ssr](/zh/nuxt-ssr)
- 安装说明：[/zh/guide/installation](/zh/guide/installation)

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
