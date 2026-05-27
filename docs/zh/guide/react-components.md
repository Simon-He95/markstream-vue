# React 组件与 API

markstream-react 提供与 markstream-vue 相同强大的组件，但专为 React 构建。所有组件都支持 React 18+ 并包含完整的 TypeScript 支持。

根入口、`markstream-react/next`、`markstream-react/server` 现在都会产出独立声明文件。像 `NodeRendererProps`、`NodeRendererCodeBlockProps`、`NodeComponentProps`、`RenderContext`、`RenderNodeFn`、`CustomComponentMap`、`CodeBlockMonacoOptions`、`MarkdownCodeBlockNodeProps`、`ListItemNodeProps`、`HtmlPreviewFrameProps`、`TooltipProps`、`TooltipPlacement`、`LinkNodeStyleProps` 这类共享渲染器与组件类型，都可以直接从你实际使用的入口导入。
## 主组件：MarkdownRender

在 React 中渲染 markdown 内容的主要组件。

### Props

`MarkdownRender` 使用 `markstream-react` 的 `NodeRendererProps`。

#### 核心 props

| 属性 | 类型 | 默认值 | 描述 |
|------|------|---------|-------------|
| `content` | `string` | - | 要渲染的 Markdown 内容 |
| `nodes` | `BaseNode[]` | - | 预解析的 AST 节点（通常为 `ParsedNode[]`） |
| `customId` | `string` | - | 作用域标识，用于 `setCustomComponents` 与样式隔离 |
| `final` | `boolean` | `false` | 标记输入结束，停止输出 streaming `loading` 节点 |
| `parseOptions` | `ParseOptions` | - | 解析选项与 token hooks（仅在传入 `content` 时生效） |
| `customHtmlTags` | `readonly string[]` | - | 作为自定义节点输出的 HTML-like 标签（如 `thinking`） |
| `htmlPolicy` | `'safe' \| 'escape' \| 'trusted'` | `'safe'` | 控制 `html_block` / `html_inline` 渲染。`safe` 阻止 active/embed/form 标签，`escape` 显示原始 HTML 文本，`trusted` 恢复更宽松的受信 HTML 行为但仍会剥离脚本和不安全属性。 |
| `customMarkdownIt` | `(md: MarkdownIt) => MarkdownIt` | - | 自定义 MarkdownIt 实例 |
| `debugPerformance` | `boolean` | `false` | 输出解析/渲染耗时与虚拟化统计（仅 dev） |
| `isDark` | `boolean` | `false` | 暗色主题标记，转发给重型节点并在根容器加 `.dark` |
| `indexKey` | `number \| string` | - | 列表渲染时的 key 前缀 |
| `typewriter` | `boolean` | `false` | 流式内容增长时显示闪烁的打字光标 |
| `showTooltips` | `boolean` | `true` | 全局控制 `LinkNode` 与代码块节点 tooltip |
| `smoothStreaming` | `boolean \| 'auto'` | `'auto'` | 为流式 `content` 更新启用内置 pacing。`'auto'` 仅在 `typewriter=true` 或 `maxLiveNodes<=0` 时启用。设 `true` 强制启用，设 `false` 以原始 chunk 节奏渲染。 |
| `smoothStreamingOptions` | `SmoothMarkdownStreamOptions` | - | 内置流式 pacing 的微调参数（`minCharsPerSecond`、`maxCharsPerSecond`、`targetLatencyMs`、`catchUpLatencyMs`、`catchUpThreshold`、`maxCommitFps`、`startDelayMs`、`maxCharsPerCommit`、`flushOnFinish`）。创建渲染器时读取；如需动态修改，用不同的 `key` 重新创建组件。 |
| `fade` | `boolean` | `true` | 启用非代码节点进入渐入动画和追加文本渐入效果 |

#### 流式与重节点开关

| 属性 | 默认值 | 描述 |
|------|---------|-------------|
| `renderCodeBlocksAsPre` | `false` | 将 `code_block` 渲染为 `<pre><code>`（Mermaid/D2/Infographic 也会随之回退） |
| `codeBlockStream` | `true` | 随内容到达流式更新代码块 |
| `viewportPriority` | `true` | 将 Monaco/Mermaid/D2/KaTeX 等重型工作延迟到接近视口时 |
| `deferNodesUntilVisible` | `true` | 重型节点先占位，接近可视区再渲染（仅非虚拟化模式） |

#### 性能（虚拟化与批次渲染）

| 属性 | 默认值 | 描述 |
|------|---------|-------------|
| `maxLiveNodes` | `320` | DOM 最大保留节点数（设为 `0` 关闭虚拟化） |
| `liveNodeBuffer` | `60` | 视窗前后 overscan 缓冲 |
| `batchRendering` | `true` | 在关闭虚拟化时启用批次渲染 |
| `smoothStreaming` | `'auto'` | 在 typewriter / 增量模式下内置流式 pacing（`typewriter` 或 `maxLiveNodes <= 0`）。设 `true` 强制启用，设 `false` 以原始 chunk 节奏渲染。 |
| `smoothStreamingOptions` | - | 微调 pacing：`minCharsPerSecond`、`maxCharsPerSecond`、`targetLatencyMs`、`catchUpLatencyMs`、`catchUpThreshold`、`maxCommitFps`、`startDelayMs`、`maxCharsPerCommit`、`flushOnFinish`。创建渲染器时读取一次；如需动态修改，用不同的组件 `key`。 |
| `initialRenderBatchSize` | `40` | 批次渲染前先渲染的节点数量 |
| `renderBatchSize` | `80` | 每个批次渲染的节点数量 |
| `renderBatchDelay` | `16` | 每次批次前的额外延迟（ms） |
| `renderBatchBudgetMs` | `6` | 自适应批次缩小前的预算（ms） |
| `renderBatchIdleTimeoutMs` | `120` | `requestIdleCallback` 超时（ms） |

#### 代码块全局配置

| 属性 | 类型 | 描述 |
|------|------|-------------|
| `codeBlockDarkTheme` | `CodeBlockMonacoTheme` | 转发到每个 `CodeBlockNode` 的 Monaco 深色主题 |
| `codeBlockLightTheme` | `CodeBlockMonacoTheme` | 转发到每个 `CodeBlockNode` 的 Monaco 浅色主题 |
| `codeBlockMonacoOptions` | `CodeBlockMonacoOptions` | 转发到 `stream-monaco` 的选项，包括 `diffHunkActionsOnHover`、`diffHunkHoverHideDelayMs`、`onDiffHunkAction` 这类 diff 悬浮操作配置 |
| `codeBlockMinWidth` | `string \| number` | 转发到 `CodeBlockNode` 的最小宽度 |
| `codeBlockMaxWidth` | `string \| number` | 转发到 `CodeBlockNode` 的最大宽度 |
| `codeBlockProps` | `NodeRendererCodeBlockProps` | 额外转发到每个代码块渲染器（`CodeBlockNode` / `MarkdownCodeBlockNode`）的 props |
| `mermaidProps` | `Partial<Omit<MermaidBlockNodeProps, 'node' \| 'loading' \| 'isDark'>>` | 额外转发到 Mermaid 围栏和自定义 `mermaid` 渲染器的 props |
| `d2Props` | `Partial<Omit<D2BlockNodeProps, 'node' \| 'loading' \| 'isDark'>>` | 额外转发到 D2 围栏和自定义 `d2` 渲染器的 props |
| `infographicProps` | `Partial<Omit<InfographicBlockNodeProps, 'node' \| 'loading' \| 'isDark'>>` | 额外转发到 infographic 围栏和自定义 `infographic` 渲染器的 props |
| `themes` | `CodeBlockMonacoTheme[]` | 转发到 `stream-monaco` 的主题列表 |

#### 重型渲染器 props 透传

`NodeRenderer` 可以直接给重型图表节点传调优参数：

```tsx
<MarkdownRender
  content={markdown}
  viewportPriority
  mermaidProps={{
    showHeader: false,
    renderDebounceMs: 180,
    previewPollDelayMs: 500,
  }}
  d2Props={{ progressiveIntervalMs: 500 }}
  infographicProps={{ showHeader: false }}
/>
```

流式建议：
- 保持 `viewportPriority` 开启，避免离屏 Mermaid / Monaco / D2 在文字仍在流式更新时继续做后台工作。
- 抖动较大的 SSE 或 AI token 流推荐用 `content` + 内置 `smoothStreaming`。
- 已有 worker、store 或自定义 AST 管线时才用 `nodes`。
- Mermaid strict mode 现已默认开启。仅在需要宽松 Mermaid HTML-label 行为的可信图表中通过 `mermaidProps` 设置 `{ isStrict: false }`。
- Mermaid 常用调优项包括：`renderDebounceMs`、`contentStableDelayMs`、`previewPollDelayMs`、`previewPollMaxDelayMs`、`previewPollMaxAttempts`。

受信兼容示例：

```tsx
<MarkdownRender
  content={trustedMarkdown}
  htmlPolicy="trusted"
  mermaidProps={{ isStrict: false }}
/>
```

`NodeRendererCodeBlockProps` 会跟随公开的 `CodeBlockNode` props 结构（去掉 `node`），所以像 `showHeader`、`showFontSizeButtons`、`showTooltips` 这类字段都能直接获得补全，而不需要退回 `any`。

```tsx
import type { NodeRendererCodeBlockProps } from 'markstream-react'

const codeBlockProps: NodeRendererCodeBlockProps = {
  showHeader: false,
  showFontSizeButtons: false,
  showTooltips: false,
}
```

#### 事件

| 属性 | 类型 | 描述 |
|------|------|-------------|
| `onCopy` | `(code: string) => void` | 代码块复制事件 |
| `onHandleArtifactClick` | `(payload: any) => void` | 预览/制品点击事件 |
| `onClick` | `(event: React.MouseEvent<HTMLDivElement>) => void` | 根容器点击事件 |
| `onMouseOver` | `(event: React.MouseEvent<HTMLElement>) => void` | 根容器鼠标悬停事件 |
| `onMouseOut` | `(event: React.MouseEvent<HTMLElement>) => void` | 根容器鼠标移出事件 |

### 使用

```tsx
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = `# Hello React!

这是 markstream-react。`

  return (
    <MarkdownRender
      customId="docs"
      content={markdown}
      maxLiveNodes={150}
    />
  )
}
```

## 代码块组件

### MarkdownCodeBlockNode

使用 Shiki 的轻量级代码高亮。

```tsx
import { MarkdownCodeBlockNode } from 'markstream-react'

function CodeBlock() {
  const codeNode = {
    type: 'code_block',
    language: 'javascript',
    code: 'const hello = "world"',
    raw: 'const hello = "world"'
  }

  const handleCopy = () => {
    alert('代码已复制！')
  }

  return (
    <div className="markstream-react">
      <MarkdownCodeBlockNode
        node={codeNode}
        showCopyButton={true}
        showCollapseButton={false}
        onCopy={handleCopy}
      />
    </div>
  )
}
```

### CodeBlockNode

功能丰富的 Monaco 驱动代码块。

```tsx
import { CodeBlockNode } from 'markstream-react'

function MonacoCodeBlock() {
  const codeNode = {
    type: 'code_block',
    language: 'typescript',
    code: 'const greeting: string = "Hello"',
    raw: 'const greeting: string = "Hello"'
  }

  const handleCopy = (code: string) => {
    console.log('代码已复制：', code)
  }

  const handlePreviewCode = (artifact: any) => {
    console.log('预览代码：', artifact)
  }

  return (
    <div className="markstream-react">
      <CodeBlockNode
        node={codeNode}
        monacoOptions={{ fontSize: 14, theme: 'vs-dark' }}
        stream={true}
        showCollapseButton={false}
        onCopy={handleCopy}
        onPreviewCode={handlePreviewCode}
      />
    </div>
  )
}
```

## 数学组件

### MathBlockNode

使用 KaTeX 渲染块级数学公式。

```tsx
import { MathBlockNode } from 'markstream-react'

function MathBlock() {
  const mathNode = {
    type: 'math_block',
    content: '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}',
    raw: '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}'
  }

  return (
    <div className="markstream-react">
      <MathBlockNode node={mathNode} />
    </div>
  )
}
```

### MathInlineNode

渲染行内数学公式。

```tsx
import { MathInlineNode } from 'markstream-react'

function MathInline() {
  const inlineMathNode = {
    type: 'math_inline',
    content: 'E = mc^2',
    raw: 'E = mc^2'
  }

  return (
    <div className="markstream-react">
      <p>
        公式如下：
        {' '}
        <MathInlineNode node={inlineMathNode} />
      </p>
    </div>
  )
}
```

## Mermaid 图表

### MermaidBlockNode

渐进式 Mermaid 图表渲染。

#### 快速要点
- **Tooltip 控制**：`showTooltips` 默认 `true`；设为 `false` 可关闭头部按钮 tooltip。

```tsx
import { MermaidBlockNode } from 'markstream-react'

function MermaidDiagram() {
  const mermaidNode = {
    type: 'code_block',
    language: 'mermaid',
    code: `graph TD
    A[开始] --> B{能用吗？}
    B -->|是| C[太好了！]`,
    raw: ''
  }

  const handleExport = (ev: any) => {
    console.log('Mermaid SVG：', ev.svgString)
  }

  return (
    <div className="markstream-react">
      <MermaidBlockNode
        node={mermaidNode}
        isStrict={true}
        onExport={handleExport}
        showTooltips={true}
      />
    </div>
  )
}
```

事件说明：
- `onCopy(code: string)` 直接收到源码字符串（React 版本没有 `MermaidBlockEvent` 包装）。
- `onExport` / `onOpenModal` / `onToggleMode` 接收 `MermaidBlockEvent`，可用 `ev.preventDefault()` 阻止默认行为。
- `onToggleMode` 签名：`(target: 'source' | 'preview', ev)`。
- 如果是在 `MarkdownRender` / `NodeRenderer` 中统一使用，优先通过 `mermaidProps` 传这些参数。

## D2 图表

### D2BlockNode

渐进式 D2 图表渲染，失败时保留上次成功的预览。

```tsx
import { D2BlockNode } from 'markstream-react'

function D2Diagram() {
  const d2Node = {
    type: 'code_block',
    language: 'd2',
    code: `direction: right
Client -> API: request
API -> DB: query`,
    raw: ''
  }

  return (
    <div className="markstream-react">
      <D2BlockNode
        node={d2Node}
        progressiveIntervalMs={600}
      />
    </div>
  )
}
```

## 其他节点组件

### HeadingNode

```tsx
import { HeadingNode } from 'markstream-react'

function CustomHeading() {
  const headingNode = {
    type: 'heading',
    level: 1
  }

  return <HeadingNode node={headingNode}>Hello World</HeadingNode>
}
```

### ParagraphNode

```tsx
import { ParagraphNode } from 'markstream-react'

function CustomParagraph() {
  const paragraphNode = {
    type: 'paragraph'
  }

  return (
    <ParagraphNode node={paragraphNode}>
      这是一个
      {' '}
      <strong>粗体</strong>
      {' '}
      单词。
    </ParagraphNode>
  )
}
```

### ListNode

```tsx
import { ListNode, renderNode } from 'markstream-react'

function CustomList() {
  const listNode = {
    type: 'list',
    ordered: false,
    items: [
      {
        type: 'list_item',
        children: [
          { type: 'paragraph', children: [{ type: 'text', content: '项目 1' }] }
        ]
      },
      {
        type: 'list_item',
        children: [
          { type: 'paragraph', children: [{ type: 'text', content: '项目 2' }] }
        ]
      }
    ]
  }

  const ctx = { events: {} }

  return <ListNode node={listNode} ctx={ctx} renderNode={renderNode} />
}
```

### LinkNode

```tsx
import { LinkNode } from 'markstream-react'

function CustomLink() {
  const linkNode = {
    type: 'link',
    href: 'https://example.com',
    title: '示例',
    text: '点击我'
  }

  return (
    <LinkNode
      node={linkNode}
      color="#e11d48"
      underlineHeight={3}
      showTooltip={true}
    />
  )
}
```

### ImageNode

```tsx
import { ImageNode } from 'markstream-react'

function CustomImage() {
  const imageNode = {
    type: 'image',
    src: 'https://example.com/image.jpg',
    alt: '示例图片',
    title: '示例',
    raw: '![示例图片](https://example.com/image.jpg)'
  }

  const handleClick = () => {
    console.log('图片被点击！')
  }

  const handleLoad = () => {
    console.log('图片已加载！')
  }

  return (
    <ImageNode
      node={imageNode}
      onClick={handleClick}
      onLoad={handleLoad}
    />
  )
}
```

## 工具函数

### getMarkdown

获取配置好的 markdown-it 实例。

```tsx
import { getMarkdown } from 'stream-markdown-parser'

const md = getMarkdown('my-msg-id', {
  html: true,
  linkify: true,
  typographer: true
})

const tokens = md.parse('# Hello World')
```

### parseMarkdownToStructure

将 markdown 字符串解析为 AST 结构。

```tsx
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown()
const nodes = parseMarkdownToStructure('# 标题\n\n这里的内容...', md)

// 与 MarkdownRender 一起使用
// <MarkdownRender nodes={nodes} />
```

### 可选 Worker（Mermaid / KaTeX）

安装后会自动加载 Mermaid/KaTeX。如需线程外解析/渲染，可注入 Worker：

```tsx
import { setKaTeXWorker, setMermaidWorker } from 'markstream-react'
import KatexWorker from 'markstream-react/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-react/workers/mermaidParser.worker?worker'

setMermaidWorker(new MermaidWorker())
setKaTeXWorker(new KatexWorker())
```

## 自定义组件 API

### Props 接口

所有自定义节点组件都接收这些 props：

```tsx
import type { CustomComponentMap, NodeComponentProps, RenderContext, RenderNodeFn } from 'markstream-react'

interface NodeComponentProps<TNode = unknown> {
  node: TNode // 解析后的节点数据
  ctx?: RenderContext // 渲染上下文（主题、事件、开关）
  renderNode?: RenderNodeFn // 子节点渲染助手
  indexKey?: React.Key // 节点的唯一键
  customId?: string // 作用域标识符
  isDark?: boolean
  typewriter?: boolean
  children?: React.ReactNode
}
```

`CustomComponentMap` 就是 `setCustomComponents(...)` 接收的映射类型。

### 示例自定义组件

```tsx
import React from 'react'

interface CustomParagraphProps {
  node: {
    type: string
    children: Array<{
      type: string
      content?: string
      children?: any[]
    }>
  }
  indexKey?: number | string
  customId?: string
}

function CustomParagraph({ node, indexKey, customId }: CustomParagraphProps) {
  return (
    <p
      className={`custom-paragraph custom-paragraph-${indexKey}`}
      data-custom-id={customId}
      data-node-type={node.type}
    >
      {node.children.map((child, i) => (
        <span key={i}>{child.content || ''}</span>
      ))}
    </p>
  )
}

// 使用
function App() {
  const paragraphNode = {
    type: 'paragraph',
    children: [
      { type: 'text', content: '自定义段落内容' }
    ]
  }

  return <CustomParagraph node={paragraphNode} indexKey={0} customId="docs" />
}
```

## Context + 自定义组件

可以在自定义节点组件内部使用 React Context，同时通过 `setCustomComponents` 注册组件：

```tsx
import MarkdownRender, { setCustomComponents } from 'markstream-react'
import React, { createContext, useContext } from 'react'

const ThemeContext = createContext<'light' | 'dark'>('light')

function CustomHeading({ node, customId }: any) {
  const theme = useContext(ThemeContext)
  const level = node.level || 1
  const Tag = `h${level}` as keyof JSX.IntrinsicElements

  return (
    <Tag className={`custom-heading ${theme}`} data-custom-id={customId}>
      {node.children?.map((child: any, i: number) => (
        <span key={i}>{child.content || ''}</span>
      ))}
    </Tag>
  )
}

setCustomComponents('docs', { heading: CustomHeading })

function App() {
  const markdown = `# 自定义标题

这使用了自定义标题组件。
`

  return (
    <ThemeContext.Provider value="dark">
      <MarkdownRender customId="docs" content={markdown} />
    </ThemeContext.Provider>
  )
}
```

## 流式传输支持

markstream-react 支持流式 markdown 内容，并内置 smooth pacing：

```tsx
import MarkdownRender from 'markstream-react'
import { useEffect, useState } from 'react'

function StreamingDemo() {
  const [content, setContent] = useState('')
  const [final, setFinal] = useState(false)
  const fullContent = `# 流式传输演示

此内容正在**逐步**流式传输。
`

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      if (i < fullContent.length) {
        setContent(prev => prev + fullContent[i])
        i++
      }
      else {
        setFinal(true)
        clearInterval(interval)
      }
    }, 30)

    return () => clearInterval(interval)
  }, [])

  return (
    <MarkdownRender
      content={content}
      final={final}
      maxLiveNodes={0}
      batchRendering
      typewriter
    />
  )
}
```

默认 `smoothStreaming="auto"` 会在 `typewriter` 开启或 `maxLiveNodes <= 0` 时自动启用 pacing。只有在需要首屏内容也从空白开始 pacing 时才用 `smoothStreaming={true}`——这会跳过 mounted 门控，在 SSR 场景下可能导致 hydration 不匹配或空白闪烁。

用 `smoothStreamingOptions` 微调 pacing 参数：

```tsx
<MarkdownRender
  content={content}
  final={final}
  smoothStreamingOptions={{
    minCharsPerSecond: 45,
    maxCharsPerSecond: 1200,
    targetLatencyMs: 900,
    catchUpLatencyMs: 350,
  }}
/>
```

## TypeScript 支持

markstream-react 包含完整的 TypeScript 类型定义：

```tsx
import type { NodeComponentProps, NodeRendererProps } from 'markstream-react'
import type { ParsedNode } from 'stream-markdown-parser'
import MarkdownRender from 'markstream-react'

function App() {
  const markdown = '# Hello TypeScript!'
  const nodes: ParsedNode[] = []

  return <MarkdownRender content={markdown} nodes={nodes} />
}
```

代码块相关的 props 类型（`CodeBlockNodeProps` / `MermaidBlockNodeProps` / `D2BlockNodeProps` / `InfographicBlockNodeProps` / `PreCodeNodeProps`）统一使用 `stream-markdown-parser` 的 `CodeBlockNode`（用 `language: 'mermaid'` / `language: 'd2'` / `language: 'd2lang'` / `language: 'infographic'` 区分渲染器）。

## Next.js 最佳实践

优先使用专门的 Next SSR 双入口，而不是 `mounted` guard 或 `ssr: false`。

```tsx
import MarkdownRender from 'markstream-react/next'

export default function MarkdownPage() {
  return <MarkdownRender content="# Hello Next.js!" final />
}
```

如果你需要纯服务端渲染路径：

```tsx
import MarkdownRender from 'markstream-react/server'

export default function MarkdownPage() {
  return <MarkdownRender content="# Hello!" final />
}
```

完整入口模型见 [React Next SSR](/zh/guide/react-next-ssr)。

## Hooks 集成

你可以轻松地与 React hooks 集成：

```tsx
import type { ChangeEvent } from 'react'
import MarkdownRender from 'markstream-react'
import { useCallback, useMemo, useState } from 'react'

function MarkdownEditor() {
  const [content, setContent] = useState('# 编辑我！')
  const [theme, setTheme] = useState('light')

  const memoizedContent = useMemo(() => content, [content])

  const handleChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
  }, [])

  return (
    <div>
      <textarea value={content} onChange={handleChange} />
      <MarkdownRender
        content={memoizedContent}
        customId={`editor-${theme}`}
      />
    </div>
  )
}
```

## 错误处理

```tsx
import MarkdownRender from 'markstream-react'
import { useState } from 'react'

function SafeMarkdown({ content }: { content: string }) {
  const [error, setError] = useState<Error | null>(null)

  if (error) {
    return (
      <div>
        渲染 markdown 时出错：
        {error.message}
      </div>
    )
  }

  try {
    return <MarkdownRender content={content} />
  }
  catch (err) {
    setError(err as Error)
    return null
  }
}
```

## 下一步

- 查看 [React 快速开始](/zh/guide/react-quick-start) 获取设置示例
- 探索 [Vue 3 组件](/zh/guide/components) 获取更多组件示例（API 类似）
- 查看 [使用与 API](/zh/guide/usage) 获取高级模式
