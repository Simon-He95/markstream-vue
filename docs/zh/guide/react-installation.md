---
title: React 安装
description: 在 React 应用中安装 markstream-react，介绍通过 pnpm、npm 与 yarn 的安装方式，以及 Shiki 等可选 peer 依赖的配置。
keywords:
  - React 安装
  - markstream-react
  - 依赖安装
---

# React 安装

使用 pnpm、npm 或 yarn 安装 markstream-react。

::: tip 已经在用 react-markdown？
如果你是从 `react-markdown` 迁过来，先看[迁移指南](/zh/guide/react-markdown-migration)获取整体路径，再看[迁移 Cookbook](/zh/guide/react-markdown-migration-cookbook)查具体场景。
:::

```bash
pnpm add markstream-react
# 或
npm install markstream-react
# 或
yarn add markstream-react
```

## 要求

markstream-react 需要：
- **React 18+** 和 **ReactDOM 18+**
- **stream-markdown-parser**（作为依赖自动安装）

## 可选的对等依赖

markstream-react 通过可选的对等依赖支持各种功能。只安装你需要的功能：

| 功能 | 所需包 | 安装命令 |
|---------|------------------|-----------------|
| Shiki 代码块（`MarkdownCodeBlockNode`） | `stream-markdown` | `pnpm add stream-markdown` |
| 增强代码块（推荐） | `stream-diffs` | `pnpm add stream-diffs` |
| Monaco 编辑器代码块（自动回退） | `stream-monaco` | `pnpm add stream-monaco` |
| Mermaid 图表 | `mermaid` | `pnpm add mermaid` |
| D2 图表 | `@terrastruct/d2` | `pnpm add @terrastruct/d2` |
| 数学公式渲染（KaTeX） | `katex` | `pnpm add katex` |

增强代码块通过双运行时 loader 解析：优先 `stream-diffs`（更小，不依赖 `monaco-editor`），未安装时自动回退 `stream-monaco`，两者都未安装则渲染普通 `<pre>`。安装其中一个即可，不需要同时装两个。

## 可选：在 Vite / Vite 兼容打包器中启用线程外 Worker

安装后会自动加载 Mermaid/KaTeX。`?worker` import 语法适用于 Vite 兼容打包器。Next.js 项目请看 [Next.js SSR 指南](/zh/frameworks/next)，并把浏览器专属 worker 初始化放在 client boundary 后面。

如果你在 Vite 兼容应用中需要线程外解析/渲染，可在入口注入 Worker：

```tsx
import { setKaTeXWorker, setMermaidWorker } from 'markstream-react'
import KatexWorker from 'markstream-react/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-react/workers/mermaidParser.worker?worker'

setMermaidWorker(new MermaidWorker())
setKaTeXWorker(new KatexWorker())
```

同时记得导入必需的 CSS：

```tsx
import 'markstream-react/index.css'
import 'katex/dist/katex.min.css'
```

`markstream-react` 不会从 JavaScript 入口自动注入渲染器样式。请在应用 shell 或组件入口显式导入一个 Markstream CSS 文件：`index.css`、`index.px.css` 或 `index.tailwind.css`。

Monaco（`stream-monaco`）不需要单独导入 CSS。

注意：`markstream-react/index.css` 的样式被限制在内部的 `.markstream-react` 容器下，以减少全局样式冲突。`MarkdownRender` 默认在该容器内渲染。如果你单独渲染节点组件，请用 `<div className="markstream-react">...</div>` 包裹它们。

## Tailwind CSS 支持

如果你的项目使用 Tailwind，并希望避免重复注入 Tailwind utilities，请改用 Tailwind-ready 输出：

```tsx
import 'markstream-react/index.tailwind.css'
```

并在 `tailwind.config.js` 的 `content` 中加入该包导出的 class 列表：

```js
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    require('markstream-react/tailwind'),
  ],
}
```

这种方式可以确保 Tailwind 在清除未使用的样式时包含 markstream-react 使用的所有工具类，从而获得更小的最终打包体积。

### 快速安装：所有功能

一次性启用所有功能：

```bash
pnpm add stream-markdown stream-diffs mermaid @terrastruct/d2 katex
# 或
npm install stream-markdown stream-diffs mermaid @terrastruct/d2 katex
```

### 功能详情

#### 代码语法高亮

需要安装 `stream-markdown`：

```bash
pnpm add stream-markdown
```

`stream-markdown` 已内置 `MarkdownCodeBlockNode` 所需的 Shiki runtime。若要在 `MarkdownRender` 中使用 Shiki，请覆盖 `code_block` 渲染器（或直接使用 `MarkdownCodeBlockNode`）。

```tsx
import MarkdownRender, { MarkdownCodeBlockNode, setCustomComponents } from 'markstream-react'

setCustomComponents({
  code_block: ({ node, isDark, ctx }: any) => (
    <MarkdownCodeBlockNode
      node={node}
      isDark={isDark}
      stream={ctx?.codeBlockStream}
      {...(ctx?.codeBlockProps || {})}
    />
  ),
})
```

#### Monaco 编辑器

完整的代码块功能（复制按钮、字体大小控制、展开/折叠）：

```bash
pnpm add stream-monaco
```

如果不安装 `stream-monaco`，代码块仍会渲染，但交互式按钮可能无法工作。

#### Mermaid 图表

渲染 Mermaid 图表：

```bash
pnpm add mermaid
```

#### D2 图表

渲染 D2 图表：

```bash
pnpm add @terrastruct/d2
```

#### KaTeX 数学公式渲染

数学公式渲染：

```bash
pnpm add katex
```

同时在应用入口文件中导入 KaTeX CSS：

```tsx
import 'katex/dist/katex.min.css'
```

## 快速测试

导入并渲染一个简单的 markdown 字符串：

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'

function App() {
  const md = '# Hello from markstream-react!'

  return <MarkdownRender content={md} />
}

export default App
```

## TypeScript 支持

markstream-react 使用 TypeScript 编写，并包含完整的类型定义，无需额外配置：

```tsx
import type { NodeRendererProps } from 'markstream-react'
import MarkdownRender from 'markstream-react'

const props: NodeRendererProps = {
  content: '# Hello TypeScript!',
}

function App() {
  return <MarkdownRender {...props} />
}
```

## Next.js 集成

在 Next.js 中，优先使用专门的 SSR 双入口：

```tsx
import MarkdownRender from 'markstream-react/next'
import 'markstream-react/index.css'

export default function MarkdownPage() {
  return <MarkdownRender content="# Hello Next.js!" final />
}
```

如果你需要一条纯 server、只输出稳定 fallback 的路径：

```tsx
import MarkdownRender from 'markstream-react/server'

export default function MarkdownPage() {
  return <MarkdownRender content="# Hello Next.js!" final />
}
```

更完整的 App Router、Pages Router、自定义组件和验证说明见 [React Next SSR](/zh/guide/react-next-ssr)。

## Vite 集成

对于 Vite 项目，只需导入组件和样式：

```tsx
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'markstream-react/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

```tsx
// src/App.tsx
import MarkdownRender from 'markstream-react'

function App() {
  const content = `# Hello Vite!

这是 markstream-react 与 **Vite** 配合使用。`

  return <MarkdownRender content={content} />
}

export default App
```

## Webpack 集成

对于使用 Webpack 的项目，确保你的配置处理 CSS 导入：

```js
module.exports = {
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  }
}
```

## 自定义组件设置

要使用自定义节点组件，你需要创建自定义渲染器。详情请参阅 [组件文档](/zh/guide/react-components)。
