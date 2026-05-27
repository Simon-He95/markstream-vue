# stream-markdown-parser

[![NPM version](https://img.shields.io/npm/v/stream-markdown-parser?color=a1b858&label=)](https://www.npmjs.com/package/stream-markdown-parser)
[![English Docs](https://img.shields.io/badge/docs-English-blue)](README.md)
[![NPM downloads](https://img.shields.io/npm/dm/stream-markdown-parser)](https://www.npmjs.com/package/stream-markdown-parser)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/stream-markdown-parser)](https://bundlephobia.com/package/stream-markdown-parser)
[![License](https://img.shields.io/npm/l/stream-markdown-parser)](https://github.com/Simon-He95/markstream-vue/blob/main/license)

纯 JavaScript Markdown 解析器和渲染工具，支持流式处理 - 框架无关。

该包包含从 `markstream-vue` 中提取的核心 Markdown 解析逻辑，使其可以在任何 JavaScript/TypeScript 项目中使用，无需 Vue 依赖。

## 特性

- 🚀 **纯 JavaScript** - 无框架依赖
- 📦 **轻量级** - 最小打包体积
- 🔧 **可扩展** - 基于插件的架构
- 🎯 **类型安全** - 完整的 TypeScript 支持
- ⚡ **高性能** - 性能优化
- 🌊 **流式友好** - 支持渐进式解析

> ℹ️ 自当前版本起我们基于 [`markdown-it-ts`](https://www.npmjs.com/package/markdown-it-ts)（一个 TypeScript 优先的 markdown-it 发行版）进行构建。API 与 markdown-it 保持一致，但内部仅依赖其解析流程，并提供更丰富的 token 类型定义。

## 文档

完整的使用说明与集成教程见 markstream-vue 文档站：

- English: https://markstream-vue-docs.simonhe.me/guide/api
- 中文: https://markstream-vue-docs.simonhe.me/zh/guide/api

本 README 聚焦解析器 API；如需 VitePress/Vite/Nuxt 集成、Worker 流式解析、Tailwind/UnoCSS 配置等指南，请查阅上述文档。

## 安装

```bash
pnpm add stream-markdown-parser
# 或
npm install stream-markdown-parser
# 或
yarn add stream-markdown-parser
```

## 快速 API 速览

- `getMarkdown(msgId?, options?)` — 返回一个预配置的 `markdown-it-ts` 实例；支持 `plugin`、`apply`、`i18n` 等选项（内置任务列表、上下标、数学等插件）。
- `registerMarkdownPlugin(plugin)` / `clearRegisteredMarkdownPlugins()` — 全局注册/清除插件，在所有 `getMarkdown()` 调用中生效（适合特性开关或测试环境）。
- `parseMarkdownToStructure(markdown, md, parseOptions)` — 将 Markdown 转换为可供 `markstream-vue` 等渲染器使用的 AST。
- `processTokens(tokens)` / `parseInlineTokens(children, content?, preToken?, options?)` — 更底层的 token → 节点工具，方便自定义管线。
- `sanitizeImageSrc(value)` — 使用与 Markstream 图片渲染器一致的严格图片 URL 策略。
- `sanitizeMermaidSvg(svg)` / `toSafeMermaidSvgMarkup(svg)` / `toSafeSvgElement(svg)` / `isBrokenMermaidSvg(svg)` — 使用 `DOMParser` 清理或校验 Mermaid SVG；在没有 `DOMParser` 的纯 Node 环境中，这些清理 helper 分别返回 `null` / `''` / `null`。
- `applyMath`、`applyContainers`、`normalizeStandaloneBackslashT`、`findMatchingClose` 等 — 用于构建自定义解析、lint 或内容清洗流程。

## 使用

### 流式解析流程

```
Markdown 字符串
   ↓ getMarkdown() → 带插件的 markdown-it-ts 实例
parseMarkdownToStructure(markdown, md) → AST (ParsedNode[])
   ↓ 交给你的渲染器（markstream-vue、自定义 UI、Worker 等）
```

多次解析时复用同一个 `md` 实例可以避免重复注册插件。与 [`markstream-vue`](https://www.npmjs.com/package/markstream-vue) 一起使用时，你可以把 AST 传给 `<MarkdownRender :nodes="nodes" />`，或仅传入原始 `content` 并共享同一套解析配置。

### 增量 / 流式示例

处理 AI/SSE 流时，可以复用同一个 `md` 实例不停地对累积缓冲区解析，并把 AST 推送给 UI（例如 `markstream-vue`）：

```ts
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

const md = getMarkdown()
let buffer = ''

async function handleChunk(chunk: string) {
  buffer += chunk
  const nodes = parseMarkdownToStructure(buffer, md)
  postMessage({ type: 'markdown:update', nodes })
}
```

在前端通过 `<MarkdownRender :nodes="nodes" />` 渲染即可避免重复解析。具体串联示例见[文档用法指南](https://markstream-vue-docs.simonhe.me/zh/guide/usage)。

### 基础示例

```typescript
import { getMarkdown, parseMarkdownToStructure } from 'stream-markdown-parser'

// 创建一个带有默认插件的 markdown-it-ts 实例
const md = getMarkdown()

// 将 Markdown 解析为流式友好的 AST 结构
const nodes = parseMarkdownToStructure('# Hello World', md)
console.log(nodes)
// [{ type: 'heading', level: 1, children: [...] }]

// 如果仍需 HTML 输出，markdown-it-ts 依旧提供 render()
const html = md.render?.('# Hello World\n\nThis is **bold**.')
```

### 配置数学公式选项

```typescript
import { getMarkdown, setDefaultMathOptions } from 'stream-markdown-parser'

// 设置全局数学公式选项
setDefaultMathOptions({
  commands: ['infty', 'perp', 'alpha'],
  escapeExclamation: true
})

const md = getMarkdown()
```

### 自定义国际化

```typescript
import { getMarkdown } from 'stream-markdown-parser'

// 使用翻译映射
const md = getMarkdown('editor-1', {
  i18n: {
    'common.copy': '复制',
  }
})

// 或使用翻译函数
const md = getMarkdown('editor-1', {
  i18n: (key: string) => translateFunction(key)
})
```

### 使用插件

```typescript
import customPlugin from 'markdown-it-custom-plugin'
import { getMarkdown } from 'stream-markdown-parser'

const md = getMarkdown('editor-1', {
  plugin: [
    [customPlugin, { /* 选项 */ }]
  ]
})
```

### 高级：自定义规则

```typescript
import { getMarkdown } from 'stream-markdown-parser'

const md = getMarkdown('editor-1', {
  apply: [
    (md) => {
      // 添加自定义内联规则
      md.inline.ruler.before('emphasis', 'custom', (state, silent) => {
        // 你的自定义逻辑
        return false
      })
    }
  ]
})
```

### 全局扩展

想在所有 `getMarkdown()` 实例上启用同一个插件，而无需修改调用点？可使用内置 helper：

```ts
import {
  clearRegisteredMarkdownPlugins,
  registerMarkdownPlugin,
} from 'stream-markdown-parser'

registerMarkdownPlugin(myPlugin)

const md = getMarkdown()
// 现在 md 会自动包含 myPlugin

// 测试或清理阶段：
clearRegisteredMarkdownPlugins()
```

- `plugin` 选项 → 针对单次 `getMarkdown` 调用传入 `md.use(...)`。
- `apply` 选项 → 直接操作实例（如 `md.inline.ruler.before(...)`）。如果需要严格模式，可自行包裹 try/catch；默认会打印错误保持兼容。
- `registerMarkdownPlugin` → 全局注册表，适用于 SSR / Worker 等场景统一开启功能。

## API

### 主要函数

#### `getMarkdown(msgId?, options?)`

创建一个配置好的 `markdown-it-ts` 实例（与 markdown-it API 兼容）。

**参数：**
- `msgId` (string, 可选): 该实例的唯一标识符。默认值：`editor-${Date.now()}`
- `options` (GetMarkdownOptions, 可选): 配置选项

**选项：**
```typescript
interface GetMarkdownOptions {
  // 要使用的 markdown-it / markdown-it-ts 插件数组
  plugin?: Array<Plugin | [Plugin, any]>

  // 修改 md 实例的函数数组
  apply?: Array<(md: MarkdownIt) => void>

  // 翻译函数或翻译映射
  i18n?: ((key: string) => string) | Record<string, string>
}
```

#### `parseMarkdownToStructure(content, md, options?)`

将 Markdown 内容解析为结构化节点树。

**参数：**
- `content` (string): 要解析的 Markdown 内容
- `md` (MarkdownItCore): 由 `getMarkdown()` 创建的 markdown-it-ts 实例
- `options` (ParseOptions, 可选): 带有钩子的解析选项

> 注意：默认 `streamParse: 'auto'` 会在 `md.stream.enabled === true` 时为非 final
> 顶层解析使用 markdown-it-ts 的 stream parser，并在该 `md` 实例上保留最近一次
> source 与 token cache。final 一次性解析默认走普通 parser；需要强制 stream 时传
> `{ streamParse: true }`。如果复用同一个 `md` 解析互不相关的一次性文档，请传
> `{ final: true }` 或 `{ streamParse: false }`。不希望保留 stream cache 的调用方可以显式关闭：

```ts
const oneShotNodes = parseMarkdownToStructure(source, md, { final: true })
const optOutNodes = parseMarkdownToStructure(source, md, { streamParse: false })
```

**返回值：** `ParsedNode[]` - 解析后的节点数组

#### `processTokens(tokens)`

将原始 markdown-it tokens 处理为扁平数组。

#### `parseInlineTokens(tokens, content?, preToken?, options?)`

解析内联 markdown-it-ts tokens 并产出节点。可传入原始 `content`（来自父 token）、可选的前一个 token，以及 inline 解析选项（`requireClosingStrong`、`customHtmlTags`、`validateLink`）。

### 配置函数

#### `setDefaultMathOptions(options)`

设置全局数学公式渲染选项。

**参数：**
- `options` (MathOptions): 数学公式配置选项

```typescript
interface MathOptions {
  commands?: readonly string[] // 要转义的 LaTeX 命令
  escapeExclamation?: boolean // 转义独立的 '!' (默认: true)
}
```

### 解析钩子（精细化变换）

ParseOptions 支持以下钩子与标志：

```ts
interface ParseOptions {
  preTransformTokens?: (tokens: Token[]) => Token[]
  postTransformTokens?: (tokens: Token[]) => Token[]
  // 自定义 HTML 类标签，作为自定义节点输出（如 ['thinking']）
  // 请传标签式名字，比如 'thinking'、'answer-box'、'my_component'
  customHtmlTags?: string[]
  // 输出 link 节点前校验 href；返回 false 时降级为纯文本
  validateLink?: (url: string) => boolean
  // true 表示输入已结束（end-of-stream）
  final?: boolean
  // 'auto' 为非 final 顶层文档使用 stream parser；
  // final 解析需强制 stream 时设 true，不希望保留 stream cache 时设 false
  streamParse?: boolean | 'auto'
  // 解析 strong 时要求闭合 `**`（默认 false）
  requireClosingStrong?: boolean
}
```

示例 —— 标记 AI "思考" 块：

```ts
const parseOptions = {
  customHtmlTags: ['thinking'],
}

const nodes = parseMarkdownToStructure(markdown, md, parseOptions)
const tagged = nodes.map(node =>
  node.type === 'html_block' && /<thinking>/.test((node as any).content ?? '')
    ? { ...node, meta: { type: 'thinking' } }
    : node,
)
```

在渲染器中读取 `node.meta` 即可渲染自定义 UI，而无需直接修改 Markdown 文本。

示例 —— 限制链接协议，拦截不安全链接：

```ts
const md = getMarkdown('safe-links')
md.set?.({
  validateLink: (url: string) => !/^\s*javascript:/i.test(url.trim()),
})

const nodes = parseMarkdownToStructure(
  '[ok](https://example.com) [bad](javascript:alert(1))',
  md,
  { final: true },
)
// "ok" 保持为 link 节点；"bad" 会降级为纯文本
```

### 未知 HTML 类标签

默认情况下，非标准的 HTML 类标签（例如 `<question>`）在完整闭合时会按原生 HTML 渲染（作为自定义元素输出）。未闭合或格式不完整的片段会保持为**纯文本**，避免在流式或最终渲染时吞掉周围内容。若希望它们作为自定义节点输出（`type: 'question'`，携带 attrs/content），需要在 `customHtmlTags` 中显式声明。

### 工具函数

#### `isMathLike(content)`

启发式函数，用于检测内容是否类似数学符号。

**参数：**
- `content` (string): 要检查的内容

**返回值：** `boolean`

#### `findMatchingClose(src, startIdx, open, close)`

在字符串中查找匹配的闭合分隔符，处理嵌套对。

**参数：**
- `src` (string): 源字符串
- `startIdx` (number): 开始搜索的索引
- `open` (string): 开启分隔符
- `close` (string): 闭合分隔符

**返回值：** `number` - 匹配闭合的索引，如果未找到则返回 -1

## 使用建议与排障

- **复用解析实例**：缓存 `getMarkdown()` 的结果，避免重复注册插件。
- **服务端解析**：在服务端运行 `parseMarkdownToStructure` 后把 AST 下发给客户端，配合 `markstream-vue` 实现确定性输出。
- **自定义 HTML 组件**：在解析前先把 `<MyWidget>` 这类片段替换为占位符，渲染时再注入，避免在 `html_block` 上进行脆弱的字符串操作。
- **样式提示**：如果将节点交给 `markstream-vue`，务必按照文档的 [CSS 排查清单](https://markstream-vue-docs.simonhe.me/zh/guide/troubleshooting#css-looks-wrong-start-here) 调整 reset / layer，防止 Tailwind/UnoCSS 覆盖样式。
- **错误处理**：`apply` 钩子内部默认捕获异常后打印日志，如需在 CI/生产中抛出错误，可在传入前自行封装并 rethrow。

#### `parseFenceToken(token)`

将代码围栏 token 解析为 CodeBlockNode。

**参数：**
- `token` (MarkdownToken): markdown-it token

**返回值：** `CodeBlockNode`

#### `normalizeStandaloneBackslashT(content, options?)`

规范化数学内容中的反斜杠-t 序列。

**参数：**
- `content` (string): 要规范化的内容
- `options` (MathOptions, 可选): 数学选项

**返回值：** `string`

### 低阶辅助函数

需要更细粒度地控制 token → AST 流程时，可直接使用以下导出：

```ts
import type { MarkdownToken } from 'stream-markdown-parser'
import {

  parseInlineTokens,
  processTokens
} from 'stream-markdown-parser'

const tokens: MarkdownToken[] = md.parse(markdown, {})
const nodes = processTokens(tokens)
// 或仅解析内联内容：
const inlineNodes = parseInlineTokens(tokens[0].children ?? [], tokens[0].content ?? '')
```

`processTokens` 即 `parseMarkdownToStructure` 内部使用的同一个转换器，可在自定义管线中复用，避免重复实现 Markdown-it 遍历。

### 插件函数

#### `applyMath(md, options?)`

将数学插件应用到 markdown-it 实例。

**参数：**
- `md` (MarkdownIt): markdown-it 实例
- `options` (MathOptions, 可选): 数学渲染选项

#### `applyContainers(md)`

将容器插件应用到 markdown-it 实例。

**参数：**
- `md` (MarkdownIt): markdown-it 实例

### 常量

#### `KATEX_COMMANDS`

用于转义的常用 KaTeX 命令数组。

#### `TEX_BRACE_COMMANDS`

使用大括号的 TeX 命令数组。

#### `ESCAPED_TEX_BRACE_COMMANDS`

用于正则表达式的 TEX_BRACE_COMMANDS 转义版本。

## 类型

所有 TypeScript 类型都已导出：

```typescript
import type {
  // 节点类型
  CodeBlockNode,
  GetMarkdownOptions,
  HeadingNode,
  ListItemNode,
  ListNode,
  MathOptions,
  ParagraphNode,
  ParsedNode,
  ParseOptions,
  // ... 更多
} from 'stream-markdown-parser'
```

### 节点类型

解析器导出各种表示不同 Markdown 元素的节点类型：

- `TextNode`, `HeadingNode`, `ParagraphNode`
- `ListNode`, `ListItemNode`
- `CodeBlockNode`, `InlineCodeNode`
- `LinkNode`, `ImageNode`
- `BlockquoteNode`, `TableNode`
- `MathBlockNode`, `MathInlineNode`
- 以及更多...

## 默认插件

该包预配置了以下 markdown-it 插件：

- `markdown-it-sub` - 下标支持（`H~2~O`）
- `markdown-it-sup` - 上标支持（`x^2^`）
- `markdown-it-mark` - 高亮/标记支持（`==highlighted==`）
- `markdown-it-task-checkbox` - 任务列表支持（`- [ ] Todo`）
- `markdown-it-ins` - 插入标签支持（`++inserted++`）
- `markdown-it-footnote` - 脚注支持
- `markdown-it-container` - 自定义容器支持（`::: warning`, `::: tip` 等）
- 数学公式支持 - 使用 `$...$` 和 `$$...$$` 渲染 LaTeX 数学公式

## 框架集成

虽然该包与框架无关，但它被设计为可以无缝配合以下框架使用：

- ✅ **Node.js** - 服务器端渲染
- ✅ **Vue 3** - 配合 `markstream-vue`（或你的自定义渲染层）使用
- ✅ **React** - 使用解析的节点进行自定义渲染
- ✅ **Vanilla JS** - 直接 HTML 渲染
- ✅ **任何框架** - 解析为 AST 并按需渲染

## 从 `markstream-vue` 迁移（解析器导出）

如果你当前是从 `markstream-vue` 引入解析器相关 helper，可以切换为使用独立包：

```typescript
// 之前
import { getMarkdown } from 'markstream-vue'

// 现在
import { getMarkdown } from 'stream-markdown-parser'
```

所有 API 保持不变。详见[迁移指南](https://markstream-vue-docs.simonhe.me/zh/monorepo-migration)。

## 性能

- **轻量级**: ~65KB 压缩后（13KB gzipped）
- **快速**: 针对实时解析优化
- **Tree-shakeable**: 只导入你需要的部分
- **依赖很少**: `markdown-it-ts` + 少量 markdown-it 插件

## 贡献

欢迎提交 Issues 和 PRs！请阅读[贡献指南](https://github.com/Simon-He95/markstream-vue/blob/main/CONTRIBUTING.md)。

## 许可证

MIT © Simon He

## 相关项目

- [markstream-vue](https://www.npmjs.com/package/markstream-vue) - 功能完整的 Vue 3 Markdown 渲染器
