# React 快速开始

在你的 React 项目中开始使用 markstream-react。

::: tip 正在从 react-markdown 迁移？
如果你的应用已经在使用 `react-markdown`，建议先看[迁移指南](/zh/guide/react-markdown-migration)和[迁移 Cookbook](/zh/guide/react-markdown-migration-cookbook)，再开始手动改代码。
:::

## 基础设置

### 1. 安装

首先，安装包：

```bash
pnpm add markstream-react
```

### 2. 导入样式

在你的主入口文件（如 `main.tsx`、`index.tsx` 或 `App.tsx`）中：

```tsx
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

### 3. 使用组件

```tsx
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = `# Hello React!

这是 **markstream-react** - 适用于 React 的流式 Markdown 渲染器。

## 功能

- 代码语法高亮
- Mermaid 图表
- 数学公式
- 还有更多功能！

\`\`\`javascript
console.log('Hello from React!')
\`\`\`
`

  return (
    <div>
      <MarkdownRender content={markdown} />
    </div>
  )
}

export default App
```

## 使用 TypeScript

markstream-react 使用 TypeScript 构建，包含完整的类型定义：

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

## 使用 Next.js

不要再把 `mounted` guard 或 `ssr: false` 当成主接法，Next 现在有专门的 SSR 双入口。

完整说明见 [React Next SSR](/zh/guide/react-next-ssr)。

### App Router（Next.js 14 / 15）

```tsx
import MarkdownRender from 'markstream-react/next'

export default function MarkdownPage() {
  const markdown = `# Hello Next.js!

这个路由会先返回真实 SSR HTML。
`

  return <MarkdownRender content={markdown} final />
}
```

### Pages Router

```tsx
import MarkdownRender from 'markstream-react/next'
import 'markstream-react/index.css'

export default function MarkdownPage() {
  const markdown = `# Hello Next.js Pages Router!`

  return <MarkdownRender content={markdown} final />
}
```

### 纯服务端渲染

```tsx
import MarkdownRender from 'markstream-react/server'

export default function MarkdownPage() {
  const markdown = `# 纯 server 入口`

  return <MarkdownRender content={markdown} final />
}
```

## 启用可选功能

### 代码语法高亮

安装可选对等依赖：

```bash
pnpm add stream-diffs
```

增强代码块（`CodeBlockNode` 运行时）使用 `stream-diffs` 内置的代码与 diff 默认配置，主题通过 `theme` / `darkTheme` / `lightTheme` / `themes` 控制。未安装 `stream-diffs` 时，代码块会回退渲染普通 `<pre>`。

```tsx
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = `\`\`\`javascript
const hello = 'world'
console.log(hello)
\`\`\``

  return <MarkdownRender content={markdown} />
}
```

### Mermaid 图表

安装 mermaid：

```bash
pnpm add mermaid
```

导入样式（安装后会自动加载 Mermaid）：

```tsx
import 'markstream-react/index.css'

function App() {
  const markdown = `#### Mermaid 图表

\`\`\`mermaid
graph TD
    A[开始] --> B{能用吗？}
    B -->|是| C[太好了！]
    B -->|否| D[继续尝试]
\`\`\``

  return <MarkdownRender content={markdown} />
}
```

### D2 图表

安装 D2：

```bash
pnpm add @terrastruct/d2
```

```tsx
import 'markstream-react/index.css'

function App() {
  const markdown = `#### D2 图表

\`\`\`d2
direction: right
Client -> API: request
API -> DB: query
DB -> API: rows
API -> Client: response
\`\`\``

  return <MarkdownRender content={markdown} />
}
```

### 数学公式（KaTeX）

安装 katex：

```bash
pnpm add katex
```

导入样式（安装后会自动加载 KaTeX）：

```tsx
import 'markstream-react/index.css'
import 'katex/dist/katex.min.css'

function App() {
  const markdown = `#### 数学示例

行内数学公式：$E = mc^2$

块级数学公式：

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$`

  return <MarkdownRender content={markdown} />
}
```

## 自定义组件

你可以通过传递自定义组件映射来自定义特定节点的渲染方式：

```tsx
import MarkdownRender, { setCustomComponents } from 'markstream-react'

// 自定义标题组件
function CustomHeading({ node, customId }: any) {
  const level = node.level || 1
  const Tag = `h${level}` as keyof JSX.IntrinsicElements

  return (
    <Tag className="custom-heading" data-custom-id={customId}>
      {node.children?.map((child: any, i: number) => (
        <span key={i}>{child.content || ''}</span>
      ))}
    </Tag>
  )
}

// 挂载到指定的 customId 作用域
setCustomComponents('docs', { heading: CustomHeading })

function App() {
  const markdown = `# 自定义标题

此标题使用自定义组件渲染。
`

  return <MarkdownRender customId="docs" content={markdown} />
}
```

## 流式内容

markstream-react 支持流式 markdown 内容，适用于 AI 生成的内容：

```tsx
import MarkdownRender from 'markstream-react'
import { useState } from 'react'

function StreamingDemo() {
  const [markdown, setMarkdown] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const fullText = `# 流式传输演示

此内容正在**逐步**流式传输。

## 功能

1. 渐进式渲染
2. 无布局偏移
3. 流畅动画

\`\`\`javascript
const streaming = true
console.log('流式传输已启用:', streaming)
\`\`\`
`

  const startStreaming = () => {
    setIsStreaming(true)
    setMarkdown('')
    let i = 0

    const interval = setInterval(() => {
      if (i < fullText.length) {
        setMarkdown(prev => prev + fullText[i])
        i++
      }
      else {
        clearInterval(interval)
        setIsStreaming(false)
      }
    }, 20)

    return () => clearInterval(interval)
  }

  return (
    <div>
      <button onClick={startStreaming} disabled={isStreaming}>
        {isStreaming ? '传输中...' : '开始流式传输'}
      </button>
      <MarkdownRender content={markdown} />
    </div>
  )
}
```

## 使用 React Hooks

```tsx
import type { ChangeEvent } from 'react'
import MarkdownRender from 'markstream-react'
import { useCallback, useEffect, useState } from 'react'

function MarkdownEditor() {
  const [content, setContent] = useState('# 编辑我！')
  const [html, setHtml] = useState('')

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
  }, [])

  return (
    <div className="markdown-editor">
      <textarea
        value={content}
        onChange={handleChange}
        placeholder="在这里输入 markdown..."
        className="editor-input"
      />
      <div className="editor-preview">
        <MarkdownRender content={content} />
      </div>
    </div>
  )
}
```

## 虚拟化列表

对于大型 markdown 文档，可以使用虚拟化：

```tsx
import MarkdownRender from 'markstream-react'

function LongDocument() {
  // 你的很长的 markdown 内容
  const markdown = `# 长文档`

  return (
    <MarkdownRender
      content={markdown}
      maxLiveNodes={200}
      liveNodeBuffer={10}
    />
  )
}
```

## 常用 Props

以下仅列出常用 props。完整列表请参考 [React Components](/guide/react-components)。

| 属性 | 类型 | 默认值 | 描述 |
|------|------|---------|-------------|
| `content` | `string` | - | 要渲染的 Markdown 内容 |
| `nodes` | `BaseNode[]` | - | 预解析的 AST 节点（通常为 `ParsedNode[]`） |
| `customId` | `string` | - | 作用域标识符 |
| `maxLiveNodes` | `number` | `320` | 虚拟化最大节点数 |
| `liveNodeBuffer` | `number` | `60` | 过扫描缓冲区 |
| `batchRendering` | `boolean` | `true` | 启用批处理渲染 |
| `deferNodesUntilVisible` | `boolean` | `true` | 延迟重型节点 |
| `renderCodeBlocksAsPre` | `boolean` | `false` | 使用 `<pre><code>` 回退（Mermaid/D2/Infographic 也会回退） |

## 样式

默认样式限定在 `.markstream-react` 类下。你可以覆盖样式：

```css
/* 你的全局样式 */
.markstream-react {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
}

.markstream-react h1 {
  font-size: 2.5rem;
  font-weight: 700;
  border-bottom: 2px solid #e5e7eb;
  padding-bottom: 0.5rem;
}

.markstream-react code {
  background: #f3f4f6;
  padding: 0.2rem 0.4rem;
  border-radius: 0.25rem;
}
```

## 使用 Tailwind CSS

```tsx
import MarkdownRender from 'markstream-react'
import 'markstream-react/index.css'
import './output.css' // 你的 Tailwind 输出

function App() {
  return (
    <div className="max-w-4xl mx-auto py-8">
      <MarkdownRender content="# Hello Tailwind!" />
    </div>
  )
}
```

## 下一步

- 探索 [React 组件文档](/zh/guide/react-components) 了解所有可用组件
- 查看 [示例](/zh/guide/examples) 获取更多使用示例
- 查看 [API 参考](/zh/guide/components) 获取详细 API 文档
