# vue-renderer-markdown

> 针对 Vue 3 的高性能、流式友好型 Markdown 渲染组件 — 支持渐进式 Mermaid、流式 diff 代码块以及为大文档优化的实时预览。

[![NPM version](https://img.shields.io/npm/v/vue-renderer-markdown?color=a1b858&label=)](https://www.npmjs.com/package/vue-renderer-markdown)
[![中文版](https://img.shields.io/badge/docs-中文文档-blue)](README.zh-CN.md)
[![NPM downloads](https://img.shields.io/npm/dm/vue-renderer-markdown)](https://www.npmjs.com/package/vue-renderer-markdown)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/vue-renderer-markdown)](https://bundlephobia.com/package/vue-renderer-markdown)
[![License](https://img.shields.io/npm/l/vue-renderer-markdown)](./LICENSE)

## 目录

- [为什么使用它？](#为什么使用它)
- [与传统 Markdown 渲染器的区别](#与传统-markdown-渲染器的区别)
- [实时演示](#-实时演示)
- [特性](#特性)
- [安装](#安装)
  - [Peer 依赖](#peer-依赖)
- [服务端渲染（SSR）](#服务端渲染ssr)
- [数学公式渲染选项](#数学公式渲染选项)
- [快速开始](#快速开始)
  - [选择代码块渲染风格](#选择代码块渲染风格)
- [TypeScript 使用](#typescript-使用)
- [为何选择 vue-renderer-markdown？](#为何选择-vue-renderer-markdown)
- [用法示例](#用法示例)
- [性能特性](#性能特性)
- [性能建议](#性能建议)
  - [组件 Props](#组件-props)
- [新属性：`renderCodeBlocksAsPre`](#新属性-rendercodeblocksaspre)
- [高级定制](#高级定制)
- [Monaco 集成](#monaco-集成)
- [代码块头部自定义](#代码块头部自定义)
- [Mermaid：渐进式渲染示例](#mermaid渐进式渲染示例)
- [Tailwind（例如 shadcn）——样式顺序问题处理](#tailwind-eg-shadcn--fix-style-ordering-issues)
- [故障排查](#故障排查)
- [鸣谢](#鸣谢)
- [Star 历史](#star-历史)
- [许可](#许可)

## 为什么使用它？

- 渐进式 Mermaid：图表在语法达到可渲染状态时会立即显示，随后逐步完善，用户能更早看到结果。
- 流式 diff 代码块：代码差异随输入逐步更新，适合显示实时编辑或 AI 生成的逐步更改。
- 为大文档和实时场景优化：尽量减少 DOM 更新与内存占用，保持界面流畅。

## 与传统 Markdown 渲染器的区别

传统渲染器通常把完整的 Markdown 字符串转为静态 HTML 树。本库面向流式与交互式场景，提供若干传统渲染器没有的能力：

- 流式优先：支持对不完整或增量产生的 Markdown 进行局部渲染，而无需对整个文档重复解析。适用于 AI 输出或逐字符/逐 token 产生内容的编辑器。
- 流式感知的代码块与“跳转到”体验：大代码块可增量更新，渲染器能保持光标/选区上下文和细粒度编辑，提升代码编辑体验。
- 内置 diff/流式代码组件：支持按行或按 token 展示差异，最小化回流，适合实时代码审查或 AI 编辑场景。
- 渐进式图表与编辑器：Mermaid 与基于 Monaco 的预览会在语法有效时尽快渲染并在后续增量更新中完善效果。
- 灵活的代码块渲染：可选 Monaco 编辑器（完全交互）或轻量的 Shiki 高亮（只读场景）。
- 平滑交互：针对大文档优化以减少 DOM churn，保证交互体验（流式 diff、增量图表更新、编辑器集成）。

这些能力使本库特别适用于实时、AI 驱动或大文档场景，在这些场景下传统的静态 Markdown-HTML 管线会产生延迟或破坏体验。

## 🚀 实时演示

- [Streaming playground](https://vue-markdown-renderer.simonhe.me/) — 在浏览器中试用大文件、渐进式图表等特性。
- [Markdown vs v-html comparison](https://vue-markdown-renderer.simonhe.me/markdown) — 对比本库的响应式渲染与传统静态管线。

### 交互测试页面

- 试用交互式测试页面以便快速验证与调试： https://vue-markdown-renderer.simonhe.me/test

  此页面提供左侧编辑器与右侧实时预览（由本库驱动）。页面包含“生成并复制分享链接”功能，会将你的输入编码到 URL 中以便分享；当输入过长无法嵌入 URL 时，会提供直接打开或预填 GitHub Issue 的回退流程。

  你可以使用该页面复现渲染问题，验证数学公式 / Mermaid / 代码块的渲染行为，并快速生成可共享链接或带复现信息的 issue。

### 介绍视频

一段短视频介绍了 vue-renderer-markdown 的关键特性与使用方式。

[![在 Bilibili 查看介绍](https://i1.hdslb.com/bfs/archive/f073718bd0e51acaea436d7197880478213113c6.jpg)](https://www.bilibili.com/video/BV17Z4qzpE9c/)

在 Bilibili 上观看： [Open in Bilibili](https://www.bilibili.com/video/BV17Z4qzpE9c/)

## 特性

- ⚡ 极致性能：为流式场景设计的最小化重渲染和高效 DOM 更新
- 🌊 流式优先：原生支持不完整或频繁更新的 token 化 Markdown 内容
- 🧠 Monaco 流式更新：高性能的 Monaco 集成，支持大代码块的平滑增量更新
- 🪄 渐进式 Mermaid：图表在语法可用时即时渲染，并在后续更新中完善
- 🧩 自定义组件：允许在 Markdown 内容中嵌入自定义 Vue 组件
- 📝 完整 Markdown 支持：表格、公式、Emoji、复选框、代码块等
- 🔄 实时更新：支持增量内容而不破坏格式
- 📦 TypeScript 优先：提供完善的类型定义与智能提示
- 🔌 零配置：开箱即可在 Vue 3 项目中使用
- 🎨 灵活的代码块渲染：可选 Monaco 编辑器 (`CodeBlockNode`) 或轻量的 Shiki 高亮 (`MarkdownCodeBlockNode`)

## 安装

```bash
pnpm add vue-renderer-markdown
# or
npm install vue-renderer-markdown
# or
yarn add vue-renderer-markdown
```

### Peer 依赖

本包设计为在运行时按需加载可选依赖，缺失时会优雅退化。要打开高级功能，请按需安装下列 peer：

完整安装（推荐，用于启用全部功能）：

```bash
pnpm add mermaid stream-monaco shiki
```

按需功能：

| 依赖 | 版本 | 启用功能 | 缺省回退 |
|---|---:|---|---|
| `mermaid` | >=11 | 渐进式 Mermaid 图表 | 展示原始代码块 |
| `stream-monaco` | >=0.0.33 | Monaco 编辑器的流式集成 | 以纯文本显示 |
| `stream-markdown` | >=0.0.2 | `MarkdownCodeBlockNode` 的流式高亮 | 以纯文本显示 |
| `shiki` | ^3.13.0 | Shiki 语法高亮 | 以纯文本显示 |
| `vue-i18n` | >=9 | 国际化支持 | 内置轻量同步翻译器 |

重要说明：

- KaTeX 未打包或自动注入。如需 LaTeX 渲染，请在宿主应用中安装 `katex` 并在入口处引入样式：

```bash
pnpm add katex
```

然后在 `main.ts` 中：

```ts
import 'katex/dist/katex.min.css'
```

- 工具栏图标以本地 SVG 提供，无需额外图标库。
- 可选 peer 在运行时按需懒加载，因此你可先以最小依赖开始，然后按需增加功能。

### 自定义解析钩子

对于高级用法，你可以通过 `parseMarkdownToStructure` 的 `options` 参数在解析流程中注入钩子，或者在需要 AST 时直接调用该工具。我们现在内部使用 [`markdown-it-ts`](https://www.npmjs.com/package/markdown-it-ts)（与 markdown-it 兼容的 TypeScript 发行版），因此钩子 API 与插件生态保持一致。

- `preTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` —— 在 `markdown-it-ts` 生成 tokens 后立即调用，可在组件解析前重写或替换 token。
- `postTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` —— 在内部修正执行后调用；若返回新的 token 数组，将重新解析成节点。
- `postTransformNodes?: (nodes: ParsedNode[]) => ParsedNode[]` —— 直接在已解析的节点树上操作，通常是调整最终输出的最简方式。

## 服务端渲染（SSR）

库的导入对 SSR 是安全的。重型依赖（Monaco、Mermaid、Worker）会在浏览器端懒加载。注意某些功能（Monaco 编辑器、渐进式 Mermaid、Web Worker）依赖浏览器 API，只能在客户端渲染。

Nuxt 3 快速示例：使用 `<client-only>` 包裹组件：

```vue
<template>
  <client-only>
    <MarkdownRender :content="markdown" />
  </client-only>
</template>
```

Vite SSR / 自定义 SSR：延迟到 onMounted 后渲染：

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import MarkdownRender from 'vue-renderer-markdown'

const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
</script>

<template>
  <div v-if="mounted">
    <MarkdownRender :content="markdown" />
  </div>
  <div v-else>
    <pre>{{ markdown }}</pre>
  </div>
</template>
```

运行 SSR 检查（仓库提供的脚本）可用：

```bash
pnpm run check:ssr
```

注意：KaTeX 在 SSR 下可用，但仅当宿主应用安装并打包了 `katex`。

## 数学公式渲染选项

本库内置轻量的数学插件，会尝试规范常见 KaTeX/TeX 命令及因字符转义造成的问题（例如字符串中意外出现的控制字符）。

你可以通过 `getMarkdown` 的 `mathOptions` 参数自定义行为：

```ts
import { getMarkdown } from 'vue-renderer-markdown'

const md = getMarkdown({
  mathOptions: {
    commands: ['in', 'perp', 'alpha'],
    escapeExclamation: true,
  }
})
```

导出工具：

- `KATEX_COMMANDS` — 默认需自动加反斜杠的命令列表。
- `normalizeStandaloneBackslashT(s, opts?)` — 内部用到的规范化函数，可用于预处理数学内容。

示例：

```ts
import { KATEX_COMMANDS, normalizeStandaloneBackslashT } from 'vue-renderer-markdown'

const raw = 'a\tb + infty'
const normalized = normalizeStandaloneBackslashT(raw, { commands: KATEX_COMMANDS })
```

### 全局/插件级默认值

安装插件时可传入 math 默认项，所有由库创建的实例都会继承这些默认值：

```ts
import { createApp } from 'vue'
import MarkdownRender, { VueRendererMarkdown } from 'vue-renderer-markdown'

const app = createApp(App)

app.use(VueRendererMarkdown, {
  mathOptions: {
    commands: ['in', 'perp', 'alpha'],
    escapeExclamation: false,
  }
})

app.mount('#app')
```

或者调用 `setDefaultMathOptions`：

```ts
import { setDefaultMathOptions } from 'vue-renderer-markdown'

setDefaultMathOptions({ commands: ['infty', 'perp'], escapeExclamation: true })
```

## 国际化（i18n）

默认 `getMarkdown` 使用英文 UI 文案。你可以通过 `i18n` 选项传入映射表或翻译函数：

```ts
// 翻译映射
// 翻译函数（例如使用 vue-i18n）
import { useI18n } from 'vue-i18n'

const md = getMarkdown('editor-1', { i18n: { 'common.copy': '复制' } })
const { t } = useI18n()
const md2 = getMarkdown('editor-1', { i18n: (key: string) => t(key) })
```

默认翻译键示例：`common.copy` — 代码块复制按钮文本。

该设计使工具函数保持纯净，可与任意 i18n 解决方案集成或直接传入静态翻译映射。

## 快速开始

1. 安装（包含 Vue）：

```bash
pnpm add vue-renderer-markdown vue
```

2. 基本用法：

```vue
<script setup lang="ts">
import MarkdownRender from 'vue-renderer-markdown'
import 'vue-renderer-markdown/index.css'

const content = `
# Hello World

This is **bold** and this is *italic*.

- List item 1
- List item 2

\`\`\`javascript
console.log('Code block!')
\`\`\`
`
</script>

<template>
  <MarkdownRender :content="content" />
</template>
```

### 启用可选特性示例

Mermaid：

```bash
pnpm add mermaid
```

Monaco 编辑器：

```bash
pnpm add stream-monaco
```

Shiki 高亮：

```bash
pnpm add shiki
```

### 组件属性（重要的选项说明）

组件常用 props 概览：

| 名称 | 类型 | 必需 | 描述 |
|---|---|---:|---|
| `content` | `string` | ✓ | 要渲染的 Markdown 文本 |
| `nodes` | `BaseNode[]` |  | 解析好的 AST 节点（替代 `content`） |
| `renderCodeBlocksAsPre` | `boolean` |  | 将所有 code_block 渲染为简单的 `<pre><code>`（轻量、无依赖） |
| `codeBlockStream` | `boolean` |  | 控制 code_block 的流式行为（`true` 时逐步更新，`false` 时等待最终内容） |
| `viewportPriority` | `boolean` |  | 是否优先渲染视口内/附近的重型节点，默认 `true` |

> 注意：`content` 或 `nodes` 必须提供其一。

## 新属性：`renderCodeBlocksAsPre`

- 类型：`boolean`
- 默认：`false`

说明：将 `code_block` 节点全部以简单预格式化文本渲染（库内部的 `PreCodeNode`），而不是使用可能依赖可选 peer（Monaco、Mermaid）的完整 `CodeBlockNode`。适用于需要轻量呈现（例如 AI 思考输出）且不想引入可选依赖的场景。

注意：开启后 `CodeBlockNode` 的相关 prop（例如主题、Monaco 配置等）不会生效。

示例：

```vue
<MarkdownRender :content="markdown" :render-code-blocks-as-pre="true" />
```

## 新属性：`codeBlockStream`

- 类型：`boolean`
- 默认：`true`

说明：设为 `false` 时，`code_block` 节点不会在中途增量渲染，而是保持加载占位并在最终内容准备好时一次性渲染。这在某些场景下可以降低布局抖动或避免频繁初始化 Monaco。仅在 `CodeBlockNode` 被使用时生效。

示例：

```vue
<MarkdownRender :content="markdown" :code-block-stream="false" />
```

## 新属性：`viewportPriority`

- 类型：`boolean`
- 默认：`true`

说明：默认开启时，渲染器会优先处理视口附近的重型节点（如 Mermaid、Monaco），将离屏工作延后，从而提升长文档或流式内容的可交互性。设为 `false` 会使渲染器尽快渲染全部节点（用于打印/导出等场景）。

示例：

```vue
<MarkdownRender :content="markdown" :viewport-priority="false" />
```

## 高级定制

你可以通过两种方式覆盖内部节点的渲染组件：

- 范围化（推荐）：使用 `setCustomComponents(id, mapping)` 并在对应的 `MarkdownRender` 实例上传入 `custom-id`，只影响该实例。
- 全局（兼容旧用法）：调用 `setCustomComponents(mapping)`，但该方式灵活性较差且不推荐用于新的用例。

示例（范围化）：

```ts
import { createApp } from 'vue'
import MarkdownRender, { setCustomComponents } from 'vue-renderer-markdown'
import MyCustomNode from './components/MyCustomNode.vue'

setCustomComponents('docs-page', {
  admonition: MyCustomNode,
})

// 在渲染器中使用：
// <MarkdownRender :content="markdown" custom-id="docs-page" />
```

如果动态创建/销毁映射，请使用 `removeCustomComponents(id)` 释放内存。

### 自定义图片渲染组件覆盖内部 image 节点示例

以下示例展示如何创建一个带有图片预览功能的自定义图片组件来替换默认的 `image` 节点渲染。

#### 可覆盖的内部节点类型

本库支持覆盖以下节点类型的渲染组件：

**块级元素**
- `text`: 普通文本
- `paragraph`: 段落
- `heading`: 标题（如 `#` 开头的行）
- `code_block`: 代码块（如 ` ``` ` 包裹的代码）
- `list`: 列表（包括有序和无序列表）
- `blockquote`: 块引用（如 `>` 开头的段落）
- `table`: 表格
- `definition_list`: 定义列表（如术语和定义的组合）
- `footnote`: 脚注
- `admonition`: 提示块（如 note、warning 等）
- `thematic_break`: 分隔线（如 `---` 或 `***`）
- `math_block`: 数学公式块（如 `$$` 包裹的公式）
- `mermaid`: Mermaid 图表代码块

**内联元素**
- `hardbreak`: 强制换行
- `link`: 链接
- `image`: 图片
- `math_inline`: 行内数学公式（如 `$` 包裹的公式）
- `strong`: 加粗文本
- `emphasis`: 斜体文本
- `strikethrough`: 删除线文本
- `highlight`: 高亮文本
- `insert`: 插入文本
- `subscript`: 下标文本
- `superscript`: 上标文本
- `emoji`: 表情符号
- `checkbox`: 复选框
- `inline_code`: 行内代码
- `reference`: 引用（如 `[id]: URL` 的形式）

#### 实现步骤

**1. 创建自定义图片组件**

创建一个 `ImageViewer.vue` 组件，实现图片预览功能：

```vue
<script setup lang="ts">
import { computed } from 'vue'

// 定义图片节点类型
interface ImageNode {
  type: 'image'
  src: string
  alt: string
  title: string | null
  raw: string
}

const props = defineProps<{
  node: ImageNode & { loading?: boolean }
}>()

// 从 node 对象中提取 src 和 alt
const src = computed(() => props.node.src)
const alt = computed(() => props.node.alt || '')

</script>

<template>
  <div class="image-wrapper">
    <!-- 缩略图 -->
    <img
      :src="src"
      :alt="alt"
      :title="node.title || undefined"
      class="image-thumbnail"
      :class="{ loading: isLoading }"
      @click="openPreview"
    >
  </div>
</template>
```

**2. 注册自定义组件**

在使用 Markdown 渲染器的页面中注册自定义组件：

```vue
<script setup lang="ts">
import { onUnmounted } from 'vue'
import MarkdownRender, { removeCustomComponents, setCustomComponents } from 'vue-renderer-markdown'
import ImageViewer from './components/ImageViewer.vue'

// 注册自定义图片组件（使用唯一 ID）
setCustomComponents('custom-image-demo', {
  image: ImageViewer
})

const markdown = `
# 图片预览示例

点击下方图片可以放大预览：

![示例图片](https://picsum.photos/800/600)

支持鼠标滚轮缩放和 ESC 键关闭。
`

// 组件卸载时清理自定义组件注册
onUnmounted(() => {
  removeCustomComponents('custom-image-demo')
})
</script>

<template>
  <MarkdownRender
    :content="markdown"
    custom-id="custom-image-demo"
  />
</template>
```

#### 关键要点

1. **节点接口定义**：自定义组件必须接收一个 `node` prop，其类型与要覆盖的节点类型匹配。例如，`ImageNode` 包含 `src`、`alt`、`title` 和 `raw` 属性。

2. **范围化注册**：推荐使用 `setCustomComponents(id, mapping)` 进行范围化注册，并在 `MarkdownRender` 组件上指定对应的 `custom-id`。这样可以避免全局污染，不同的渲染实例可以使用不同的自定义组件。

3. **清理注册**：在组件卸载时使用 `removeCustomComponents(id)` 清理注册，防止内存泄漏。

4. **功能增强**：自定义组件可以添加任何你需要的功能，例如图片预览、缩放、键盘快捷键等。

5. **样式自定义**：你可以完全控制自定义组件的样式，不受默认样式限制。

#### 完整示例

完整的实现示例请参考仓库中的 `playground/src/pages/customImage.vue` 和 `playground/src/components/imageViewer.vue` 文件。

在线演示：https://vue-markdown-renderer.simonhe.me/customImage

### MarkdownCodeBlockNode（替代轻量代码块渲染）

`MarkdownCodeBlockNode` 提供了基于 Shiki 的语法高亮替代 Monaco 的展示方式，适合只需展示且希望 SSR 友好的场景。

所需 peer：`stream-markdown` (>=0.0.2) 与 `shiki` (^3.13.0)。

安装：

```bash
pnpm add stream-markdown shiki
```

用法：

```ts
import { MarkdownCodeBlockNode, setCustomComponents } from 'vue-renderer-markdown'

setCustomComponents({ code_block: MarkdownCodeBlockNode })
```

## Vite 配置与 Worker 用法

若使用 Vite，建议将 worker 格式设置为 `es`：

```ts
// vite.config.ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  worker: { format: 'es' },
})
```

为 KaTeX 与 Mermaid 使用 Web Worker：

```ts
import KatexWorker from 'vue-renderer-markdown/workers/katexRenderer.worker?worker'
import { setKaTeXWorker } from 'vue-renderer-markdown/workers/katexWorkerClient'

import MermaidWorker from 'vue-renderer-markdown/workers/mermaidParser.worker?worker'
import { setMermaidWorker } from 'vue-renderer-markdown/workers/mermaidWorkerClient'

setKaTeXWorker(new KatexWorker())

setMermaidWorker(new MermaidWorker())
```

## ImageNode 插槽（占位 / 错误）

`ImageNode` 支持两个命名插槽来自定义加载与报错态：`placeholder` 与 `error`。插槽接收以下响应式 props：

- `node` — 原始 ImageNode 对象
- `displaySrc` — 当前用于渲染的 src（可能为 fallbackSrc）
- `imageLoaded` — 图片是否已加载
- `hasError` — 是否处于错误态
- `fallbackSrc` — 传入的 fallback 地址（如有）
- `lazy` — 是否使用懒加载
- `isSvg` — 当前 displaySrc 是否为 SVG

如果不提供插槽，组件会显示内置的 CSS 旋转加载器与简单错误占位。

## TableNode loading 插槽

`TableNode` 在 `node.loading === true` 时会显示 shimmer + spinner 覆盖层，你可以通过 `loading` 插槽替换覆盖层内容，插槽 props 为 `{ isLoading: boolean }`。

## LinkNode 下划线动画与颜色定制

`LinkNode` 支持运行时配置下划线动画与颜色的若干 prop，默认保持此前的外观。可调整的 prop 包括 `color`、`underlineHeight`、`underlineBottom`、`animationDuration`、`animationOpacity`、`animationTiming`、`animationIteration`、`showTooltip`。

示例、默认值与注意事项见英文文档（`showTooltip` 默认为 `true`，设置为 `false` 时将回退到原生 `title` 提示）。

## Monaco 编辑器集成

若使用 Monaco，请配置 `vite-plugin-monaco-editor-esm` 以正确打包 worker。对于只需要 Monaco 编辑器而不需要完整渲染管线的场景，可以直接使用 `stream-monaco` 进行更轻量的集成。

建议在应用初始化或页面挂载时调用 `getUseMonaco()` 预加载 Monaco，以减少首次渲染延迟（函数会在模块不可用或 SSR 环境下安全降级）：

```ts
import { getUseMonaco } from './src/components/CodeBlockNode/monaco'

getUseMonaco()
```

## Tailwind（例如 shadcn）——样式顺序问题处理

若使用 Tailwind 组件库（如 shadcn），可能遇到样式顺序导致覆盖问题。推荐把库样式放入 Tailwind 的 `components` 层以便应用样式覆盖：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  @import 'vue-renderer-markdown/index.css';
}
```

或根据需要放入 `base` 层以提高优先级。

## 故障排查（常见问题）

- Monaco worker 未找到：请配置 `vite-plugin-monaco-editor-esm` 或使用相应的 Webpack 插件以确保 worker 能被正确打包与加载。
- Mermaid 不渲染：确认已安装 `mermaid` 且语法正确；查看控制台错误以确定问题。
- 语法高亮无效：确认安装 `stream-markdown` 与 `shiki` 并将 `MarkdownCodeBlockNode` 注册为代码块渲染组件。
- TypeScript 类型问题：通过正确路径导入类型并确保 `tsconfig` 的 `moduleResolution` 设置兼容（`bundler` 或 `node16`）。
- SSR 报 `window is not defined`：将涉及浏览器 API 的渲染包裹为 client-only 或延迟到 onMounted 执行。
- 图标未显示：确认引入样式并检查构建工具是否允许从依赖中导入静态资源（SVG）。

更详细的解决方案与示例请参见英文 README 的相应章节。

## 鸣谢

本项目使用并受益于：

- [stream-monaco](https://github.com/Simon-He95/stream-monaco)
- [stream-markdown](https://github.com/Simon-He95/stream-markdown)
- [mermaid](https://mermaid-js.github.io/mermaid)
- [shiki](https://github.com/shikijs/shiki)

感谢这些项目的作者与贡献者！

## Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=Simon-He95/vue-markdown-render&type=Date)](https://www.star-history.com/#Simon-He95/vue-markdown-render&Date)

## 许可

[MIT](./LICENSE) © [Simon He](https://github.com/Simon-He95)
