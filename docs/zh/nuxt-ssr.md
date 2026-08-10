---
title: Nuxt 3 SSR 用法示例
description: 在 Nuxt 3 SSR 中使用 markstream-vue，获得服务端 HTML、稳定 fallback，以及重节点的客户端增强。
keywords:
  - Nuxt 3 SSR
  - 服务端渲染
  - 流式 Markdown
---

# Nuxt 3 SSR 用法示例

> For the English version, see [nuxt-ssr.md](../nuxt-ssr.md).

`markstream-vue` 现在可以直接在 Nuxt SSR 中产出服务端 HTML。为了“能跑”而把整个 `<MarkdownRender>` 包进 `<ClientOnly>`，已经不是默认推荐做法。

当前的 SSR 模型是：

- 普通 markdown、HTML、链接、表格、脚注、图片会直接在服务端渲染。
- 代码块会先输出稳定的服务端 `<pre><code>` fallback，再在客户端增强成 Monaco。
- 数学公式在提供同步 KaTeX loader 时，可以直接在服务端输出真正的 KaTeX HTML。
- Mermaid、D2、Infographic 会先输出可读的 SSR fallback，再在客户端增强。
- scoped 自定义组件覆盖、自定义 node type、以及 `customHtmlTags` 也都能参与服务端渲染。

## 最小 SSR 页面

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const markdown = ref(`
# 来自 Nuxt SSR 的问候

行内公式：$E = mc^2$

\`\`\`ts
export const greet = (name: string) => \`hello \${name}\`
\`\`\`

\`\`\`mermaid
graph TD
  SSR --> Hydration
\`\`\`
`.trim())
</script>

<template>
  <MarkdownRender :content="markdown" :final="true" />
</template>
```

这样首包就已经有服务端 HTML；重节点仍然会在 hydration 后增强，但不会先给你一个空壳。

## 服务端渲染数学公式

如果你希望 SSR 响应里直接带 KaTeX HTML，可以在 Nuxt 应用里注册同步 loader：

```ts
import katex from 'katex'
import { enableKatex } from 'markstream-vue'

enableKatex(() => katex)
```

如果没有这个 loader，数学公式也仍然是 SSR-safe，只是会稳定回退成可读原文。

## 预解析 nodes 与自定义组件

除了直接传 `content`，你也可以在 SSR 中传 `nodes`，或者配合 scoped custom components / trusted custom tags 一起使用。

```ts
import { setCustomComponents } from 'markstream-vue'
import { defineComponent, h } from 'vue'

setCustomComponents('docs-ssr', {
  thinking: defineComponent({
    props: {
      node: { type: Object, required: true },
    },
    setup(props) {
      return () => h('aside', { 'data-ssr-thinking': '1' }, String((props.node as any).content ?? ''))
    },
  }),
})
```

```vue
<template>
  <MarkdownRender
    custom-id="docs-ssr"
    content="<thinking>服务端自定义标签</thinking>"
    :custom-html-tags="['thinking']"
    :final="true"
  />
</template>
```

如果你的服务端已经拿到了 AST，优先用 `nodes + final`，这样可以避免浏览器端重复解析，SSR 输出也更可控。

## 什么时候还需要 `<ClientOnly>`

通常不是给渲染器本身用的。

只有当你自己的页面逻辑本身依赖浏览器 API，或者你明确想让一整块区域跳过 SSR 时，才需要 `<ClientOnly>`。

## Nuxt playground

仓库里已经提供了完整的 Nuxt playground，路径是 `playground-nuxt/`：

```bash
pnpm install
pnpm play:nuxt
```

专门的 SSR 验证路由是：

- `/ssr-lab`

这个页面里有固定矩阵，用来覆盖：

- 基础 markdown + HTML 的 SSR
- 重节点的 SSR fallback
- hydration 后的增强路径
- 显式禁用增强时的稳定 fallback
- 自定义标签与 scoped override 的验证

## SSR 验收命令

Nuxt SSR 的验收 e2e 命令是：

```bash
pnpm test:e2e:nuxt-ssr
```

它会同时验证：

- `nuxt dev`
- `nuxt build && nuxt preview`

每种模式都会先检查 `/ssr-lab` 的原始 HTTP HTML，再打开浏览器验证 hydration、增强、reload 和路由往返后的稳定性。

## 库级 SSR 回归覆盖

仓库里还有一层直接针对渲染器的 `renderToString` 回归测试：

```bash
pnpm test --run test/ssr-render-to-string.test.ts test/ssr-import.test.ts
```

这层测试显式覆盖了：

- 轻节点 SSR 组件矩阵，例如 heading、paragraph、行内格式、link、list、table、footnote、admonition、`vmr_container`
- 独立的 `MarkdownCodeBlockNode` SSR shell
- 通过 `setCustomComponents` 做 scoped 内置覆盖
- 直接自定义 node type 的 SSR
- 通过 `customHtmlTags` 接入的可信自定义标签 SSR
