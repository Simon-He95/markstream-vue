---
title: 安装
description: 按文档站、AI 聊天、Mermaid、KaTeX、Monaco 和大文档场景选择正确的 markstream-vue 安装与 peer 依赖组合。
keywords:
  - 安装
  - peer 依赖
  - markstream-vue
---

# 安装

如果你只是想先把渲染器跑起来，先装主包，再按能力补装 peer 依赖就够了。

## 1. 最小安装

```bash
pnpm add markstream-vue
# 或
npm install markstream-vue
# 或
yarn add markstream-vue
```

只需要普通 Markdown 渲染时，装完主包就可以继续看 [快速开始](/zh/guide/quick-start)。

## 2. 按能力选择 peer 依赖

| 能力 | 需要的包 | 适用场景 |
|------|---------|---------|
| 轻量高亮代码块 | `stream-markdown` | 文档站、SSR、包体积敏感场景 |
| 增强代码块与 diff（推荐） | `stream-diffs` | 需要复制、预览、展开、字体控制、语法高亮和 File/Diff surface |
| legacy Monaco 代码块 | `stream-monaco` | `stream-diffs` 未安装时的自动回退 |
| Mermaid 图表 | `mermaid` | 渲染 `mermaid` fenced code block |
| D2 图表 | `@terrastruct/d2` | 渲染 `d2` / `d2lang` fenced code block |
| KaTeX 数学公式 | `katex` | 行内或块级公式 |
| Infographic 图表 | `@antv/infographic` | 渲染 `infographic` fenced code block；还需要配置 `setInfographicLoader` |

所有框架包（vue、vue2、react、svelte、angular）的增强代码块都通过同一个双运行时 loader 解析：优先 `stream-diffs`，未安装时自动回退 `stream-monaco`，两者都未安装则渲染普通 `<pre>`。安装其中一个即可，不需要同时装两个。

## 3. 常见安装配方

### 文档站 / SSR 优先

```bash
pnpm add markstream-vue stream-markdown
```

如果你接下来要做的是文档站、内容站或 VitePress 主题，继续看 [文档站与 VitePress 集成](/zh/guide/vitepress-docs-integration)。

### AI / 聊天 UI，且需要更强的代码块和图表体验

```bash
pnpm add markstream-vue stream-diffs mermaid katex
```

然后继续看 [AI 聊天与流式输出](/zh/guide/ai-chat-streaming)，里面会串起 `mode="chat"`、`content` 流式渲染、`final` 结束态处理，以及由上层负责解析时才需要的可选 `nodes` 路径。

### 图表型内容较多

```bash
pnpm add markstream-vue mermaid @terrastruct/d2 katex
```

### 一次性全开

```bash
pnpm add markstream-vue stream-markdown stream-diffs mermaid @terrastruct/d2 katex @antv/infographic
```

Infographic 是显式 opt-in 能力。安装 `@antv/infographic` 后，按 [AntV Infographic](/zh/guide/infographic) 配置 `setInfographicLoader`。

## 4. CSS 顺序和安装同样重要

根 JavaScript 入口不会自动注入渲染器样式。请在应用入口或 CSS 管线中显式导入一个已发布的 CSS subpath，并确保它位于 reset/base 之后、业务覆盖样式之前。

```ts
// main.ts
import 'markstream-vue/index.css'
```

在 Tailwind 或 UnoCSS 项目里，建议把 Markstream 样式放到 component layer：

```css
@import 'modern-css-reset';
@tailwind base;

@import 'markstream-vue/index.css' layer(components);
```

如果你的移动端会主动调大根字号，请改用 `markstream-vue/index.px.css`。只有在需要 Tailwind-ready CSS 变体时才使用 `markstream-vue/index.tailwind.css`。

如果你使用数学公式，还要额外引入 KaTeX 的 CSS：

```ts
import 'katex/dist/katex.min.css'
```

`stream-diffs`、`mermaid` 和 `@terrastruct/d2` 不需要再从本包额外引入 CSS。

## 5. 功能加载器（只在 CDN 或自定义控制时需要）

装好 peers 以后，默认 loader 已经启用。只有当你手动关闭过，或者想切到 CDN / 自定义 loader 时，才需要显式调用：

```ts twoslash
import { enableD2, enableKatex, enableMermaid } from 'markstream-vue'

enableMermaid()
enableKatex()
enableD2()
```

## 6. 第一次接入后的检查清单

- 如果你单独使用节点组件，而不是 `MarkdownRender`，请外层包一层 `<div class="markstream-vue">...</div>`。
- 如果公式不显示，优先检查 `katex` 是否安装、CSS 是否导入。
- 如果增强代码块始终停留在 `<pre>`，确认已安装 `stream-diffs`，并确认 `CodeBlockNode` 已结束流式输出且进入可视区域。这个时机由 markstream-vue 适配层决定，`stream-diffs` 根 runtime 本身与框架无关。
- 如果样式错乱，先看 [故障排除](/zh/guide/troubleshooting#css-looks-wrong-start-here)。

## 7. 快速测试

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

type MarkdownRenderProps = InstanceType<typeof MarkdownRender>['$props']

const md: MarkdownRenderProps['content'] = '# 你好，markstream-vue！'
const customId: MarkdownRenderProps['customId'] = 'install-check'
</script>

<template>
  <MarkdownRender
    :content="md"
    :custom-id="customId"
  />
</template>
```

下一步建议：

- [快速开始](/zh/guide/quick-start)：最小接入
- [使用与流式渲染](/zh/guide/usage)：`content` 和 `nodes` 的选择
- [AI 聊天与流式输出](/zh/guide/ai-chat-streaming)：聊天 UI、SSE 与逐 token 输出的完整路径
- [覆盖内置组件](/zh/guide/component-overrides)：需要业务定制时再进入
