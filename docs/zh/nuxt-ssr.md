# Nuxt 3 SSR 用法示例

> For the English version, see [nuxt-ssr.md](../nuxt-ssr.md).

本示例演示如何在 Nuxt 3 中安全地集成 `markstream-vue`，确保仅在浏览器端初始化 Monaco、Mermaid、Web Worker 等客户端功能。

## 安装浏览器端依赖

根据需要安装可选依赖。例如要启用 Mermaid 和 Monaco 代码编辑器：

```bash
# pnpm（推荐）
pnpm add mermaid stream-monaco

# npm
npm install mermaid stream-monaco
```

**请勿**在 SSR 的服务端上下文中直接导入这些依赖。

## 示例页面（仅客户端渲染）

创建一个页面或组件，通过 Nuxt 内置的 `<client-only>` 包裹，从而确保渲染器只在客户端挂载：

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'
import { ref } from 'vue'

const markdown = ref(`# 来自 Nuxt 3 的问候\n\n这段内容仅在客户端渲染。`)
</script>

<template>
  <client-only>
    <MarkdownRender :content="markdown" />
  </client-only>
</template>
```

这样可以保证 `MarkdownRender` 组件及其懒加载的可选依赖只会在浏览器端被导入与初始化。

## 服务端渲染图表或公式

如果希望图表或数学公式在服务端即生成 HTML（提高首屏或 SEO），可以在构建阶段或服务端任务中预渲染：

- 使用 `mermaid-cli` / `katex` 等工具在构建时将特定内容转换为 HTML/SVG 并嵌入页面。
- 提供一个服务端接口返回预渲染的图表 HTML/SVG，客户端按需拉取。

随后将这些预渲染内容作为可信 HTML 或服务端生成的 AST 传入渲染器，即可避免在客户端重复初始化重型依赖。

## 注意事项

- 使用 Monaco 编辑器、Web Worker 或渐进式 Mermaid 时，推荐始终配合 `<client-only>`。
- 库经过 SSR 导入安全性设计：重型依赖采用浏览器端懒加载，并对 DOM/Worker 调用做了守卫。如果仍遇到导入阶段的 `ReferenceError`，请附上堆栈信息提交 issue。

---

## Nuxt playground

仓库已经提供了一个完整的 Nuxt playground，路径为 `playground-nuxt/`，它复刻了 Vite playground 的流式示例，方便验证 SSR / Worker / Tailwind 等场景。

```bash
pnpm install
pnpm play:nuxt
```

上述命令会启动 Nuxt 4 开发服务器（默认 `http://localhost:3000`），你可以直接在其中测试 `markstream-vue` 的 Nuxt 集成，并按需拷贝其中的配置到你的项目。
