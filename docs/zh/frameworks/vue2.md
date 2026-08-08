---
title: Vue 2 流式 Markdown 渲染器
description: 在 Vue 2.6 和 Vue 2.7 存量项目中使用 markstream-vue2，覆盖 AI 聊天流式 Markdown、LLM token 流、SSE/WebSocket 输出、未闭合 Markdown、Mermaid、KaTeX、增强代码块和 Vue 2 组件渲染。
keywords:
  - markstream-vue2
  - Vue 2 流式 Markdown 渲染器
  - Vue2 Markdown 渲染器
  - Vue 2 AI 聊天 Markdown
  - Vue 2 LLM Markdown 渲染器
  - Vue2 SSE Markdown
  - Vue2 WebSocket Markdown
  - Vue2 未闭合 Markdown
  - Vue2 Mermaid Markdown
  - Vue2 KaTeX Markdown
  - Vue2 代码块
  - Vue 2 存量项目 Markdown 渲染器
softwareName: markstream-vue2
softwarePackage: markstream-vue2
npmPackage: markstream-vue2
softwareFramework: Vue 2
softwareProgrammingLanguage:
  - TypeScript
  - Vue
softwareRuntimePlatform:
  - Vue 2.6
  - Vue 2.7
  - Nuxt 2
faq:
  - question: 新 Vue 项目应该用 markstream-vue2 吗？
    answer: 不应该。Vue 3 和新的 Nuxt 项目应使用 markstream-vue。markstream-vue2 面向 Vue 2.6 / Vue 2.7 存量应用。
  - question: markstream-vue2 支持 Vue 2.6 吗？
    answer: 支持，但 Vue 2.6 应用需要先安装并注册 @vue/composition-api。
  - question: 什么时候 markstream-vue2 比普通 Vue Markdown 渲染器更合适？
    answer: 当 Markdown 来自 LLM、SSE 或 WebSocket 流，且你需要稳定处理中间态、长输出、Mermaid、KaTeX 或代码块时，markstream-vue2 更合适。
---
# Vue 2 流式 Markdown 渲染器

`markstream-vue2` 是 Markstream 家族里的 Vue 2.6 / 2.7 渲染器。它适合必须继续运行在 Vue 2 的 AI 聊天、LLM token 流、SSE/WebSocket 输出、未闭合 Markdown 中间态、Mermaid、KaTeX、增强代码块和 Vue 2 组件渲染场景。

如果是 Vue 3、Nuxt 3 或新项目，优先看 [`markstream-vue`](/zh/frameworks/vue)。

## 什么时候使用 markstream-vue2

使用 `markstream-vue2` 的典型场景：

- 应用必须停留在 Vue 2.6 或 Vue 2.7
- Markdown 来自 LLM、SSE 或 WebSocket 流
- 未闭合代码块、局部数学公式或局部 HTML-like 标签不能闪烁
- 长 AI 回复需要受控的 live rendering
- 流式内容里会出现 Mermaid、KaTeX 和代码块
- 需要在 Markdown 中渲染自定义 Vue 2 节点组件

下面这些情况可以先评估更简单的 Vue Markdown 渲染器：

- 只渲染短的完成态 Markdown
- 只需要 `markdown -> HTML`
- 项目可以迁移到 Vue 3 并使用 `markstream-vue`

## 快速开始

```bash
pnpm add markstream-vue2
```

Vue 2.6 应用还需要：

```bash
pnpm add @vue/composition-api
```

```js
import VueCompositionAPI from '@vue/composition-api'
import { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueCompositionAPI)
Vue.use(VueRendererMarkdown)
```

Vue 2.7 应用不需要 `@vue/composition-api`，但仍应安装渲染器插件：

```js
import { VueRendererMarkdown } from 'markstream-vue2'
import Vue from 'vue'
import 'markstream-vue2/index.css'

Vue.use(VueRendererMarkdown)
```

最小 Vue 2 消息组件：

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  props: { content: String, done: Boolean },
}
</script>

<template>
  <MarkdownRender :content="content" :final="done" :fade="false" />
</template>
```

Vue CLI 4 / Webpack 4 项目应使用真实 CSS 文件路径，因为 Webpack 4 不支持 `package.json#exports`：

```js
import 'markstream-vue2/dist/index.css'
```

## 流式示例

普通聊天流可以持续把 chunk 追加到 `content`，在结束时把 `final` 切为 `true`：

```vue
<script>
import MarkdownRender from 'markstream-vue2'

export default {
  components: { MarkdownRender },
  data: () => ({ content: '', final: false }),
}
</script>

<template>
  <MarkdownRender :content="content" :final="final" :fade="false" />
</template>
```

高频长流建议使用 [Vue 2 快速开始](/zh/guide/vue2-quick-start) 里的 parser / nodes 路径，把解析节奏放在外层控制。

## Mermaid、KaTeX 和代码块

只安装你需要的可选 peer。增强代码块使用可选的对等依赖 `stream-diffs`，未安装时会回退渲染普通 `<pre>`：

```bash
pnpm add stream-diffs
```

Mermaid 图表安装 `mermaid`。KaTeX 数学公式安装 `katex`，并导入它的样式：

```bash
pnpm add mermaid
pnpm add katex
```

```js
import 'katex/dist/katex.min.css'
```

默认 Mermaid 和 KaTeX loader 已经启用。只有在手动关闭后重新启用，或需要自定义 loader 时，才调用 `enableMermaid()` 或 `enableKatex()`。

## 与普通 Vue Markdown 渲染器对比

| 需求 | markstream-vue2 | 普通 Vue Markdown 渲染器 |
| --- | --- | --- |
| Vue 2.6 / 2.7 支持 | 支持 | 取决于包 |
| AI 聊天流式输出 | 面向累积 `content` 和可选 `nodes` 设计 | 通常按完成态 Markdown 重渲染 |
| 未闭合 Markdown | 有流式中间态处理 | 语法未完成时通常不稳定 |
| Mermaid / KaTeX / 代码块 | Markstream 集成和可选 peer | 依赖插件 |
| 新 Vue 3 项目 | 改用 `markstream-vue` | 使用 Vue 3 生态包 |

## 试用与下一步

- [Vue 2 playground](https://markstream-vue2.pages.dev/)
- [Vue 2 快速开始](/zh/guide/vue2-quick-start)
- [Vue 2 安装](/zh/guide/vue2-installation)
- [框架总览](/zh/frameworks/)
- [npm package](https://www.npmjs.com/package/markstream-vue2)
