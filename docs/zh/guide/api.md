---
description: 查阅 markstream-vue 的底层 API，包括解析器工具、渲染流程选择、作用域覆盖与 AST 级接入能力。
---

# API 参考

本页聚焦 `markstream-vue` 的底层入口：解析器工具、渲染流程选择，以及作用域覆盖相关钩子。

如果你是想查 `MarkdownRender`、`CodeBlockNode`、`ImageNode` 这类导出的 Vue 组件，请优先看 [渲染器与节点组件](/zh/guide/components)。搭配 [使用示例](/zh/guide/usage) 与 [props](/zh/guide/props) 页面一起阅读效果更佳。

## 渲染流程速览

```
Markdown 字符串 → getMarkdown() → markdown-it-ts 实例
            ↓
   parseMarkdownToStructure(content, md) → AST (BaseNode[])
            ↓
   <MarkdownRender> → 节点组件（CodeBlockNode、ImageNode 等）
```

可在任意阶段介入：
- 直接传 `content`：组件自动解析。
- 传 `nodes`：自己在服务端/预处理阶段生成 AST 并复用。

## 解析器工具

| Helper | 作用 | 适用场景 |
| ------ | ---- | -------- |
| `getMarkdown(msgId?, options?)` | 返回预配置的 `markdown-it-ts` 实例。 | 需调整 parser 选项（HTML、插件）或复用实例时。 |
| `parseMarkdownToStructure(content, md)` | 生成渲染器使用的 AST。 | 服务端预解析、静态导出、或需在渲染前做校验时。 |

两者均可在 Node/浏览器使用。处理大文档时可复用 `md` 实例避免重复初始化插件。

> 注意：`parseMarkdownToStructure` 默认是 `streamParse: 'auto'`：兼容的 `md` 实例会在非 final 顶层解析时使用 stream parser，并保留最近一次 source/token cache。final 一次性解析默认走普通 parser；需要强制 stream 时传 `{ streamParse: true }`，需要关闭时传 `{ streamParse: false }`。如果复用同一个 `md` 解析互不相关的一次性文档，请传 `{ final: true }` 或 `{ streamParse: false }`。

```ts
const oneShotNodes = parseMarkdownToStructure(source, md, { final: true })
```

## 自定义组件与作用域

通过 `setCustomComponents(customId?, mapping)` 覆盖任意节点渲染器，再在 `MarkdownRender` 上传入匹配的 `custom-id`，即可限定覆盖范围。

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const CustomImageNode: Component

setCustomComponents('docs', {
  image: CustomImageNode,
})
```

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '![demo](https://example.com/demo.png)'
</script>

<template>
  <MarkdownRender custom-id="docs" :content="md" />
</template>
```

提示：
- 使用语义化 ID（如 `docs`、`playground`）方便排查。
- `setCustomComponents(mapping)` 会注册全局映射；更推荐按 ID 作用域隔离。
- 在 SPA 中按需注册/卸载时，记得在路由切换时清理。

## 解析钩子与节点变换

当使用 `content` 时，可通过 `parse-options`（组件 prop）或 `parseMarkdownToStructure` 的 `ParseOptions` 拦截解析阶段：

- `preTransformTokens(tokens)` — 生成节点前预处理 token。
- `postTransformTokens(tokens)` — 在默认处理后继续调整。

如需改造 AST，可在 `parseMarkdownToStructure` 返回后自行处理，再通过 `MarkdownRender` 的 `nodes` 传入。

示例：把 AI “thinking” 标签直接渲染成自定义组件（无需钩子）

```ts twoslash
import type { Component } from 'vue'
import { setCustomComponents } from 'markstream-vue'

declare const ThinkingNode: Component

setCustomComponents('docs', { thinking: ThinkingNode })
```

```vue twoslash
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const doc = '<thinking>Need a plan</thinking>'
</script>

<template>
  <MarkdownRender
    custom-id="docs"
    :custom-html-tags="['thinking']"
    :content="doc"
  />
</template>
```

如果你需要进一步改造 `thinking` 节点（剥掉包裹、重映射 attrs、合并分段等），可使用上述 hooks，或在解析后自行处理 AST。

## 其他导出

- 节点组件：`CodeBlockNode`、`MarkdownCodeBlockNode`、`MermaidBlockNode`、`MathBlockNode`、`ImageNode` 等（详见 [组件与节点渲染器](/zh/guide/components)）。
- `sanitizeImageSrc(value)`：自定义图片组件需要复用内置 strict 图片 URL 策略时可直接使用。
- 工具：`VueRendererMarkdown`（全局组件插件）与共享类型定义（组件 props/解析器类型；参考 [/zh/guide/parser-api](/zh/guide/parser-api) 或 npm 上的 `stream-markdown-parser` README）。

## 样式 & 排障提醒

- 先引入 reset，再使用 `@import 'markstream-vue/index.css' layer(components);`，防止 Tailwind/UnoCSS 覆盖。参考 [Tailwind 指南](/zh/guide/tailwind)。
- 同伴依赖中，KaTeX 需要自己的 CSS；Mermaid 不需要。缺失 KaTeX 样式时通常表现为空白公式。
- 使用 `custom-id` + `[data-custom-id="docs"]` 来局部覆盖样式。
- 遇到样式异常时，依照 [排查清单](/zh/guide/troubleshooting#css-looks-wrong-start-here) 逐项检查。

需要更多示例？打开 [Playground](/zh/guide/playground) 或运行 `pnpm play` 在本地实验解析/渲染组合。
