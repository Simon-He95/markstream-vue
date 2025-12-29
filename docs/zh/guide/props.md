# 组件 Props 与选项

在集成 `markstream-vue` 时，常会需要微调流式行为、控制重节点渲染或避免 Tailwind/UnoCSS 样式冲突。本页提供对照表与排障提示。

## `MarkdownRender` 核心 props

| Prop | 类型 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `content` | `string` | – | 原始 Markdown 字符串（除非提供 `nodes`，否则必填）。 |
| `nodes` | `BaseNode[]` | – | 预解析后的 AST（通常为 `parseMarkdownToStructure` 返回的 `ParsedNode[]`）。 |
| `custom-id` | `string` | – | 作用域键，可在 `setCustomComponents` 注册映射并用 `[data-custom-id="docs"]` 做样式覆盖。 |
| `final` | `boolean` | `false` | 是否为“流结束/最终态”。开启后会关闭解析器的中间态（loading）行为，避免末尾残留分隔符（如 `$$`、未闭合 code fence）永远停留在 loading。 |
| `parse-options` | `ParseOptions` | – | Token/节点级钩子（`preTransformTokens`、`postTransformTokens`、`postTransformNodes`），仅在传入 `content` 时生效。 |
| `custom-html-tags` | `string[]` | – | 扩展流式内联 HTML 中间态白名单，并将这些标签直接输出为自定义节点（`type: <tag>`）以便 `setCustomComponents` 映射（会传给 `getMarkdown`，如 `['thinking']`）。 |
| `custom-markdown-it` | `(md: MarkdownIt) => MarkdownIt` | – | 自定义内部 MarkdownIt 实例（加插件、改配置）。 |
| `debug-performance` | `boolean` | `false` | 打印解析/渲染耗时与虚拟化统计（仅 dev）。 |
| `typewriter` | `boolean` | `true` | 控制轻量进入动画。生成静态截图或 SSR 输出时可关闭。 |

## 流式与重节点开关

| Flag | 默认值 | 功能 |
| ---- | ------ | ---- |
| `render-code-blocks-as-pre` | `false` | 将所有 `code_block` 渲染为 `<pre><code>`，适合仅查看或排查 Monaco/Tailwind 样式问题。 |
| `code-block-stream` | `true` | 启用流式代码块更新；关闭后会保持加载态直到完整文本就绪，避免频繁初始化 Monaco。 |
| `viewport-priority` | `true` | 优先渲染视窗内的 Mermaid/Monaco 等重节点，延迟离屏渲染以提升交互体验。 |
| `defer-nodes-until-visible` | `true` | 启用后，重节点在接近视口前可先渲染为占位（仅在非虚拟化模式生效）。 |

## 渲染性能（虚拟化 & 分批渲染）

| Prop | 默认值 | 说明 |
| ---- | ------ | ---- |
| `max-live-nodes` | `320` | 虚拟化阈值；设为 `0` 可关闭虚拟化（全部渲染）。 |
| `live-node-buffer` | `60` | 视窗前后保留的节点数量（overscan）。 |
| `batch-rendering` | `true` | 分批渲染（仅当 `max-live-nodes <= 0` 时启用）。 |
| `initial-render-batch-size` | `40` | 初始立即渲染的节点数。 |
| `render-batch-size` | `80` | 每批渲染的节点数。 |
| `render-batch-delay` | `16` | 每批在 rAF 之后额外延迟（ms）。 |
| `render-batch-budget-ms` | `6` | 单批预算（ms），超过后会自适应缩小后续 batch。 |
| `render-batch-idle-timeout-ms` | `120` | `requestIdleCallback` 切片的超时（ms，若可用）。 |

## 代码块全局选项（由 `MarkdownRender` 下发）

这些 props 会被转发到 `CodeBlockNode` / `MarkdownCodeBlockNode`（但 **不会** 转发到 Mermaid 代码块，因为 Mermaid 会路由到 `MermaidBlockNode`）：

- `code-block-dark-theme`, `code-block-light-theme`
- `code-block-monaco-options`
- `code-block-min-width`, `code-block-max-width`
- `code-block-props`（兜底：转发任意 CodeBlock props）
- `themes`（在安装 `stream-monaco` 时，会转发给其主题系统）

## 代码块头部控制

可直接传给 `CodeBlockNode` / `MarkdownCodeBlockNode`，或在 `MarkdownRender` 上用 `code-block-props` 统一下发：

- `show-header`
- `show-copy-button`
- `show-expand-button`
- `show-preview-button`
- `show-font-size-buttons`

更多细节请参考 `/zh/guide/codeblock-header` 及类型定义。

示例（全局默认）：

```vue
<template>
  <MarkdownRender
    :content="md"
    :code-block-props="{ showHeader: false, showFontSizeButtons: false }"
  />
</template>
```

## 示例

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const md = '# 标题\n\n演示 props 用法。'
</script>

<template>
  <MarkdownRender
    :content="md"
    custom-id="docs"
    :viewport-priority="true"
    :code-block-stream="true"
  />
</template>
```

## 样式与排障提示

1. **先引入 reset**（`modern-css-reset`、`@tailwind base`、`@unocss/reset`），再在 `@layer components` 中导入 `markstream-vue/index.css`，避免被 utilities 覆盖。详见 [Tailwind 指南](/zh/guide/tailwind)。
2. **使用 `custom-id`** 与 `[data-custom-id="docs"]` 限定覆盖范围。
3. **检查同伴 CSS** 是否导入（Mermaid、KaTeX），缺失时会出现空白渲染。
4. **查阅 [样式排查清单](/zh/guide/troubleshooting#css-looks-wrong-start-here)**，确保 reset、layer、Uno/Tailwind 配置正确。
