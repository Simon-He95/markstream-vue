# 安全

`MarkdownRender` 默认使用 `htmlPolicy="safe"`。这个默认值适合 AI 输出，以及需要保留少量安全 HTML 的内容面。

## 安全模型

`safe` 表示 active HTML 会在交给 Vue 渲染前被移除：

- `script`、`style`、`form`、`iframe`、`object`、`embed`、`template` 以及相关 active/embed/form 标签会被阻断。
- `on*` 事件属性会被移除。
- `javascript:`、`vbscript:`、不安全的 `data:`、protocol-relative URL 等不安全 URL 协议会被阻断。
- 带脚本 URL、CSS expression 或 import 的内联样式会被移除。
- 带 `target="_blank"` 的 Markdown 链接会保留 `noopener noreferrer`。
- 流式中间态和最终内容使用同一套清理规则。

`trusted` 表示内容来源完全受你的应用控制。不要把它用于 LLM 输出、公开评论、客服工单、用户导入文档，或任何其他用户生成内容。

## HTML 策略

### `htmlPolicy="safe"`

允许常见结构化 HTML，例如链接、图片、列表、表格和 details。危险标签、事件属性、不安全 URL 协议和内联样式会在渲染前被移除或转义。

`safe` 是受限渲染策略，不代表可以渲染任意 active HTML。它仍然允许普通 `http:` / `https:` 链接和图片。如果你的威胁模型不允许第三方网络请求，请使用 `htmlPolicy="escape"`、自定义 ImageNode，或通过 CSP / 图片代理约束。

适合 AI 聊天、受控文档流水线，以及需要有限 HTML 能力的 Markdown 场景。

### `htmlPolicy="escape"`

所有 HTML 都按文本显示。

适合不可信用户内容、公开评论区、第三方内容源，或者任何不需要原始 HTML 的位置。

```vue
<MarkdownRender
  :content="content"
  html-policy="escape"
/>
```

### `htmlPolicy="trusted"`

保留更宽的 HTML 集合，但仍会移除 script 等硬阻断标签。只应用在你完全控制的内容上。
它可能保留内联样式和更宽的 HTML 集。不要用于模型输出或用户生成内容。

## 自定义组件

`customHtmlTags` 只是把标签声明为结构化 streaming 节点，并不代表模型输出可信。

自定义组件是受信任代码。Markstream 会清洗传给自定义组件的 HTML attrs，但无法控制组件内部行为。避免对模型原文使用 `v-html`，避免执行模型输出里的 URL，也不要把模型输出直接写入 `iframe srcdoc`。

更推荐在组件里使用文本插值：

```vue
<script setup lang="ts">
defineProps<{ node: { content?: string } }>()
</script>

<template>
  <div class="thinking-node">
    {{ node.content }}
  </div>
</template>
```

## 链接和图片

Markdown 链接和渲染出的 HTML attrs 会检查 `javascript:`、`vbscript:`、HTML `data:` 文档等不安全协议。

Markdown 图片 URL 默认使用 strict 策略。允许的图片源包括 `http:`、`https:`、相对 URL、`#hash` / `?query` URL，以及 bitmap `data:image/png|gif|jpg|jpeg|webp|avif|bmp` URL。阻断的图片源包括 protocol-relative URL、`javascript:`、`vbscript:`、`data:text/html`、`data:image/svg+xml`、`blob:`、`file:` 和 `filesystem:`。

Bitmap data URL 只对 Markdown 图片 / `img src` 处理放开。`srcset` 继续使用更窄的资源 URL 策略，并拒绝 data URL。

如果你的应用需要受信任的 `blob:` 图片 URL，请通过自定义 ImageNode/custom component 渲染图片，并应用自己的 URL policy。

URL 策略会阻断 `//cdn.example.com/a.png` 这类 protocol-relative URL，因为它们可能静默加载外部资源。

Mermaid SVG 输出在 strict 和 loose Mermaid 模式下都会在挂载前清理。`isStrict=false` 只控制 Mermaid 的解析/渲染配置，不代表原始 SVG 插入。`foreignObject` 这类 unsupported active SVG/HTML 结构仍会被内置 sanitizer 移除。如果需要完整保留可信 Mermaid HTML label 输出，请通过内置 sanitizer 之外的可信自定义组件渲染。

Mermaid 生成的 `bindFunctions` 点击绑定默认不会在清理后的 SVG 挂载后执行。只有可信图表确实需要 Mermaid 点击绑定时，才设置 `mermaidProps.enableMermaidInteractions=true`。

`sanitizeMermaidSvg`、`toSafeMermaidSvgMarkup` 和 `toSafeSvgElement` 需要兼容 `DOMParser` 的运行时。在没有 `DOMParser` 的纯 Node.js 中，它们分别返回 `null`、`''` 和 `null`；服务端 SVG 清理请在 browser、jsdom 或 linkedom 这类环境中使用。
