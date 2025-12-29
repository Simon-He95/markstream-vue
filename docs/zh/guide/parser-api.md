# 解析器 — API 详解

此页从 `packages/markdown-parser` 提取常用函数、类型与便捷工具，便于构建更高级或自定义的解析流程。

## 主要函数

### `getMarkdown(msgId?, options?)`
创建配置好的 `markdown-it-ts` 实例。

参数：
- `msgId` (string，可选)：实例标识
- `options` (GetMarkdownOptions，可选)：配置选项

选项示例：
- `plugin`：插件数组
- `apply`：用于变更 `MarkdownIt` 实例的函数数组
- `i18n`：翻译映射或函数
- `customHtmlTags`：流式内联 HTML 中间态白名单扩展（如 `['thinking']`）

### `parseMarkdownToStructure(content, md?, options?)`
将 Markdown 字符串解析为供渲染器使用的节点树（AST）。

> 提示：对于 `<thinking>` 等简单自定义标签，推荐使用内置的 `customHtmlTags` / `custom-html-tags` 白名单让解析器直接输出自定义节点；只有在需要手动重写 `content/attrs` 时再用 `preTransformTokens`。参见 [自定义组件解析示例](/zh/guide/advanced#自定义组件解析示例)。

返回：`ParsedNode[]`

### ParseOptions: `final`（流结束/最终态）

在流式渲染（SSE/AI Chat）中，解析器会主动产出一些 **“中间态（loading）节点”** 来降低闪烁，例如：
- 未闭合的块级数学公式（以 `$$` 开头但还没等到结尾 `$$`）
- 未闭合的 code fence（只收到 ``` 开始行）

这样做能让 UI 在内容尚未到齐时也能稳定渲染。但当你 **明确知道内容已经结束**（流已结束、消息已完整），应该将解析切换到最终态：

```ts
const nodes = parseMarkdownToStructure(buffer, md, { final: true })
```

`final: true` 的效果：
- 关闭上述“中间态 loading”策略：未闭合的 `$$...` 不再产出 `math_block/loading`；
- 将 EOF 视作 code fence 的隐式闭合，避免代码块永远 loading。

### 其他有用函数
- `processTokens(tokens)` — 将原始 token 处理为可用于构建节点列表的结构
- `parseInlineTokens(tokens, md)` — 解析 inline tokens

## 配置与工具

### `setDefaultMathOptions(options)`
设置全局 KaTeX 配置示例：

```ts
setDefaultMathOptions({
  commands: ['infty', 'perp'],
  escapeExclamation: true
})
```

### 工具函数
- `isMathLike(content)` — 判断文本是否可能为公式
- `findMatchingClose(src, startIdx, open, close)` — 查找匹配的闭合符号
- `parseFenceToken(token)` — 将 code fence 转为 `CodeBlockNode`
- `normalizeStandaloneBackslashT(content, options?)` — 规范化数学内容中的特殊转义

## 解析钩子（高级）
传入 `ParseOptions` 可使用以下钩子：
- `preTransformTokens`、`postTransformTokens`、`postTransformNodes`。

这些钩子也可通过 `MarkdownRender` 组件传入 `parseOptions` prop（仅当使用 `content` prop 时生效）。

### ParseOptions: `requireClosingStrong`

`requireClosingStrong`（boolean，可选）控制解析器在解析 inline 内容时如何处理未闭合的 `**` 加粗分隔符。默认值：`true`。

- **true**：要求存在匹配的关闭 `**` 才会生成加粗（strong）节点。未闭合的 `**` 会被保留为普通文本。这是非交互渲染（例如静态页面或服务器端渲染）推荐的严格模式，可以避免像 `[**cxx](xxx)` 这类在链接文本中错误地解析出 dangling strong 的问题。
- **false**：允许中间态/未完成的 `**`（适用于编辑器的实时预览），解析器会在某些未闭合情况下仍生成临时的加粗节点。

示例 — 严格模式（默认）：

```ts
import { parseMarkdownToStructure } from 'packages/markdown-parser'

const nodes = parseMarkdownToStructure('[**cxx](xxx)', undefined, { requireClosingStrong: true })
// 文本 `[**cxx](xxx)` 将被保留，不会创建不完整的加粗节点
```

示例 — 编辑器友好模式：

```ts
const nodes = parseMarkdownToStructure('[**cxx](xxx)', undefined, { requireClosingStrong: false })
// 允许在实时预览中创建临时/中间态的加粗节点
```

### `$$` 异常分隔符（空公式/误触发）的解释

有些内容会出现“奇怪的 `$$`”，例如：

```md
adasd $$ dasdsa
dasdsad
```

如果把 `$$` 误识别为数学公式分隔符但内部内容为空，就可能导致数学节点一直处于 loading（渲染层没有内容可渲染）。解析器现在会将 **空内容的 `$$` 视为普通文本**，避免这类永久 loading。

### 流式内联 HTML 中间态（`html_inline`）

在流式/聊天/编辑器场景中，内联 HTML 往往以不完整的片段逐步到达。解析器采用保守的中间态策略来减少抖动，同时尽早输出可稳定渲染的 HTML。

行为说明：
- **吞并未完成标签**：当 text token 中出现但尚未闭合到 `>` 的片段（如 `<span class="a"`、结尾的 `<`、`</sp`、结尾的 `</`），会被暂存并从 AST 中移除，避免以普通文本闪烁。
- **识别已完成的开始标签**：常见 HTML 标签（保守白名单）一旦形成完整 `<tag ...>`，会被解析为 `html_inline` 节点。
- **若尚未出现显式闭合标签**，解析器会：
  - 将当前 inline 里后续所有 token 视为该标签的 inner content；
  - 自动在 `content/raw` 末尾补上 `</tag>`，保证片段可作为合法 HTML 渲染；
  - 仍标记为 `loading: true`，并设置 `autoClosed: true` 表示来源尚未真正闭合。
- **当真实闭合标签到达后**，`autoClosed` 消失，`loading=false`。

扩展白名单：
如果需要让自定义标签（例如 `<thinking>`）也享受相同的中间态吞并与自动补闭合策略，可在创建实例时传入 `customHtmlTags`：

```ts
const md = getMarkdown('chat', { customHtmlTags: ['thinking'] })
```

输出自定义节点：
如果希望这些标签直接产出自定义节点类型（便于 `setCustomComponents` 直接按 `type` 映射），可在 `ParseOptions` 中同时传入 `customHtmlTags`，或在 `MarkdownRender` 上使用 `custom-html-tags`（组件会自动透传）：

```ts
const nodes = parseMarkdownToStructure(source, md, { customHtmlTags: ['thinking'] })
```

渲染层说明：
- `HtmlInlineNode` 仅在 `loading===true` 且 `autoClosed!==true` 时显示原文。
  自动补闭合的中间态会直接按 HTML 渲染（`innerHTML`），但仍保留 `loading=true` 供 UX/状态使用。

## 类型提示
导出的类型包含 `CodeBlockNode`、`ParsedNode` 等，可在 TS 中导入：
```ts
import type { CodeBlockNode, ParsedNode } from 'stream-markdown-parser'
```

## 插件与默认配置
本项目为常见解析场景提供了一些便捷插件（例如：footnote、task checkbox、sub/sup/mark 等）。注意：`emoji` 插件已从默认配置中移除——需要 Emoji 支持的用户请显式注册该插件。

可以通过多种方式添加自定义插件：
- 在 `getMarkdown` 的 `plugin` 选项中传入插件数组。
- 在 `getMarkdown` 的 `apply` 回调中直接修改返回的 `MarkdownIt` 实例。
- 在使用 `MarkdownRender` 组件时，通过 `customMarkdownIt` prop 获取并修改该渲染器使用的 `MarkdownIt` 实例。

示例 — 在组件中启用 Emoji：

```vue
<script setup lang="ts">
import type { MarkdownIt } from 'markdown-it-ts'
import { full as markdownItEmoji } from 'markdown-it-emoji'
import MarkdownRender from 'markstream-vue'

function enableEmoji(md: MarkdownIt) {
  md.use(markdownItEmoji)
  return md
}
</script>

<template>
  <MarkdownRender :content="source" :custom-markdown-it="enableEmoji" />
</template>
```

更多示例与完整 API 请参考仓库内的 `packages/markdown-parser/README.md`。

## 示例
使用 playground 快速验证自定义标签解析：对于 `<thinking>` 等简单标签，传入 `customHtmlTags`（或组件上的 `custom-html-tags`）即可自动产出 `type: 'thinking'` 的自定义节点，再用 `setCustomComponents` 做映射。

快速测试 `parseOptions`：

```ts
import { parseMarkdownToStructure } from 'markstream-vue'

const nodes = parseMarkdownToStructure('Hello **world**')
console.log(nodes)
// 渲染：<MarkdownRender :nodes="nodes" />
```

### 自定义组件与标签类元素

标签类自定义元素（如 `<MyWidget ...>...</MyWidget>`）往往产出复杂的 `html_block`/inline token，事后用正则或 AST 拼接会很脆。建议在解析前先提取并占位，再对占位文本做 Markdown 解析，最后渲染时把占位符还原为 Vue 组件。

推荐流程：
- 预扫描 Markdown，把自定义组件提取到映射表，并用占位符（如 `[[CUSTOM:1]]`）替换原始位置。
- 让解析器处理带占位符的内容，正常渲染 AST。
- 渲染时遇到占位符节点，再从映射表取回原始片段并挂载对应组件。

示例（简化版）：

```ts
// 1) 提取自定义标签
const extracted = new Map<string, string>()
let id = 1
const contentWithPlaceholders = source.replace(/<MyWidget[\s\S]*?<\/MyWidget>/g, (m) => {
  const key = `[[CUSTOM:${id++}]]`
  extracted.set(key, m)
  return key
})

// 2) 用占位符内容做 Markdown 解析
const nodes = parseMarkdownToStructure(contentWithPlaceholders)

// 3) 渲染时替换占位符
// if (node.type === 'text' && extracted.has(node.content)) {
//   return h(CustomWrapper, { raw: extracted.get(node.content) })
// }
```

### thinking 片段

针对短小的 “thinking” 片段（如 AI 思考过程），可以用 `parseOptions` 或 `preTransformTokens` 标记该区域，再用内置的 `MarkdownRenderer` 轻量渲染，同时对复杂的自定义组件仍采用上面的提取占位方案。这样避免对 AST 做易碎的字符串拼接，也便于控制自定义组件的挂载范围。
