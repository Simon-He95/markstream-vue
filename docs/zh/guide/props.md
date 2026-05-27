---
description: 通过 MarkdownRender 的 props 精细控制流式渲染、暗色主题、自定义标签、解析选项与重节点行为。
---

# 组件 Props 与选项

在集成 `markstream-vue` 时，常会需要微调流式行为、控制重节点渲染或避免 Tailwind/UnoCSS 样式冲突。本页提供对照表与排障提示。

## `MarkdownRender` 核心 props

| Prop | 类型 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `content` | `string` | – | 原始 Markdown 字符串（除非提供 `nodes`，否则必填）。 |
| `nodes` | `BaseNode[]` | – | 预解析后的 AST（通常为 `parseMarkdownToStructure` 返回的 `ParsedNode[]`）。 |
| `custom-id` | `string` | – | 作用域键，可在 `setCustomComponents` 注册映射并用 `[data-custom-id="docs"]` 做样式覆盖。 |
| `is-dark` | `boolean` | `false` | 主题标记，会透传给 Mermaid/D2/KaTeX/CodeBlock，并在根容器上添加 `.dark`。 |
| `index-key` | `number \| string` | – | 内部节点 key 前缀；嵌套渲染或列表中渲染多实例时建议显式传入。 |
| `final` | `boolean` | `false` | 是否为“流结束/最终态”。开启后会关闭解析器的中间态（loading）行为，避免末尾残留分隔符（如 `$$`、未闭合 code fence）永远停留在 loading。 |
| `parse-options` | `ParseOptions` | – | Token 级钩子（`preTransformTokens`、`postTransformTokens`），仅在传入 `content` 时生效。 |
| `custom-html-tags` | `string[]` | – | 扩展流式内联 HTML 中间态白名单，并将这些标签直接输出为自定义节点（如 `type: 'thinking'`）以便 `setCustomComponents` 映射（会传给 `getMarkdown`，如 `['thinking']`）。 |
| `html-policy` | `'safe' \| 'escape' \| 'trusted'` | `'safe'` | 控制 `html_block` / `html_inline` 渲染。`safe` 会阻断 active/embed/form 类标签，`escape` 按文本显示 HTML，`trusted` 保留旧的宽 HTML 行为但仍移除脚本和危险属性。 |
| `custom-markdown-it` | `(md: MarkdownIt) => MarkdownIt` | – | 自定义内部 MarkdownIt 实例（加插件、改配置）。 |
| `debug-performance` | `boolean` | `false` | 打印解析/渲染耗时、虚拟化统计，以及 `parse(stream)` 的 `streamMode` / `streamDelta` 等信息（仅 dev）。 |
| `typewriter` | `boolean` | `false` | 流式内容增长时显示闪烁打字光标。 |
| `smooth-streaming` | `boolean \| 'auto'` | `'auto'` | 为流式 `content` 更新启用内置 pacing。`'auto'` 仅在 `typewriter=true` 或 `max-live-nodes<=0` 时启用。设 `true` 强制启用，`false` 按原始 chunk 节奏渲染。 |
| `smooth-streaming-options` | `SmoothMarkdownStreamOptions` | – | 内置流式 pacing 的选项（`minCharsPerSecond`、`maxCharsPerSecond`、`targetLatencyMs`、`catchUpLatencyMs`、`catchUpThreshold`、`maxCommitFps`、`startDelayMs`、`maxCharsPerCommit`、`flushOnFinish`）。在渲染器创建时读取；如需动态修改，请更换组件 `key` 重新创建渲染器。 |
| `parse-coalesce-ms` | `number` | `80` | 1.x 可用的高级性能调参项：内置 smooth streaming 合并字符级更新时的最小解析间隔。`smooth-streaming=false` 时不会节流原始 `content` prop 的更新，也不影响 `nodes` 模式。设为 `0` 可让每次 smooth-stream commit 都触发解析。默认调度语义后续可能继续优化。 |
| `fade` | `boolean` | `true` | 控制非代码节点进入淡入和流式追加文本淡入。生成静态截图或 SSR 输出时可关闭。 |

::: tip SSR 与 smooth streaming
对于带静态初始内容的 SSR 场景，推荐使用 `smooth-streaming="auto"`（默认值）。`auto` 模式包含一个 mounted 门控，可避免首次客户端渲染时从空白开始 pacing。仅在明确需要从空白开始 pacing 首屏内容时才使用 `smooth-streaming=true`——这在 SSR 场景下可能导致 hydration 不匹配或首屏空白闪烁。
:::

### smooth-streaming 与 fade —— 二选一，不要同时开启

`smooth-streaming` 和 `fade` 都能实现"文本逐步出现"的效果，但作用在不同层面：

| | `smooth-streaming` | `fade` |
|---|---|---|
| **工作方式** | 控制向渲染器暴露 `content` 字符串的速度（按字/秒节流） | 内容立即渲染，但新增文本以 opacity 0→1 CSS 动画渐入（280 ms） |
| **作用层面** | 字符串 / 内容层 | DOM / 视觉层 |
| **适用场景** | 流式 / 实时 token 输出 | 静态或历史消息内容 |

同时开启两者会导致**视觉闪烁**：smooth-streaming 以小批量、高频（~30 fps）更新 `content`，每一批都会触发一段新的 fade 动画。由于下一批内容在 280 ms 动画结束前就到达，delta 文本会在每一帧从约 8% opacity 被瞬间 snap 到 100%——结果是快速闪烁，而非平滑淡入。

**推荐组合：**

| 场景 | `smooth-streaming` | `fade` | 原因 |
|---|---|---|---|
| **流式输出**（token 实时到达） | `'auto'` 或 `true` | `false` | smooth pacing 本身已实现"逐步出现"效果；fade 叠加无益，反而导致闪烁 |
| **恢复历史消息**（完整 Markdown 一次性加载） | `false` | `true` | 内容一次性到达，无需节流；fade 提供优雅的入场动画 |
| **静态 / SSR 快照** | `false` | `false` | 零动画，适合服务端渲染输出或打印场景 |

在聊天界面中，同一个 `MarkdownRender` 通常先以流式模式运行，响应完成后再切换到历史消息模式。具体代码示例见 [AI 聊天与流式输出 → 流式输出 vs 恢复历史消息](/zh/guide/ai-chat-streaming#流式输出-vs-恢复历史消息-运行时切换-props)。

### 进阶 smooth streaming 配置

使用 `smooth-streaming-options` 精细调整 pacing 行为：

```vue
<MarkdownRender
  :content="content"
  :smooth-streaming-options="{
    minCharsPerSecond: 45,
    maxCharsPerSecond: 1200,
    targetLatencyMs: 900,
    catchUpLatencyMs: 350,
  }"
/>
```

可用字段：`minCharsPerSecond`、`maxCharsPerSecond`、`targetLatencyMs`、`catchUpLatencyMs`、`catchUpThreshold`、`maxCommitFps`、`startDelayMs`、`maxCharsPerCommit`、`flushOnFinish`。这些选项在渲染器创建时一次性读取；如需动态切换，请更改组件 `key`。只有在启用内置 smooth streaming 且有明确性能测量需求时，再使用 `parse-coalesce-ms` 单独调整解析合并间隔。

### 安全默认值与兼容性回退

`MarkdownRender` 现在默认采用更安全的 HTML 与 Mermaid 行为：

- `html-policy="safe"`：默认阻断 active/embed/form 类 HTML 标签。
- `mermaid-props.isStrict` 默认是 `true`：Mermaid 默认走 strict 模式。
- `mermaid-props.enableMermaidInteractions` 默认是 `false`：不会执行 Mermaid 生成的点击绑定，除非可信内容显式开启。

如果某个可信渲染面确实需要保留加固前的宽松行为，请显式按该渲染面回退，并把这个决定限制在可信内容来源上：

```vue
<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

const trustedMarkdown = `
<iframe src="https://example.com/embed"></iframe>

\`\`\`mermaid
flowchart TD
  A["<b>可信 HTML label</b><br/>第 2 行"] --> B
\`\`\`
`
</script>

<template>
  <MarkdownRender
    :content="trustedMarkdown"
    html-policy="trusted"
    :mermaid-props="{ isStrict: false }"
  />
</template>
```

如果你希望 HTML 完全按源码文本显示，而不是渲染任何 HTML，可使用 `html-policy="escape"`。

## 流式与重节点开关

| Flag | 默认值 | 功能 |
| ---- | ------ | ---- |
| `render-code-blocks-as-pre` | `false` | 将非 Mermaid/Infographic/D2 的 `code_block` 渲染为 `<pre><code>`，适合仅查看或排查 Monaco/Tailwind 样式问题。Mermaid/infographic/D2 仍会路由到各自组件，除非用 `setCustomComponents` 覆盖。 |
| `code-block-stream` | `true` | 启用流式代码块更新；关闭后会保持加载态直到完整文本就绪，避免频繁初始化 Monaco。 |
| `viewport-priority` | `true` | 优先渲染视窗内的 Mermaid/D2/Monaco/KaTeX 等重节点，延迟离屏渲染以提升交互体验。 |
| `defer-nodes-until-visible` | `true` | 启用后，重节点在接近视口前可先渲染为占位（仅在非虚拟化模式生效）。 |

## 渲染性能（虚拟化 & 分批渲染）

| Prop | 默认值 | 说明 |
| ---- | ------ | ---- |
| `max-live-nodes` | `320` | 虚拟化阈值；设为 `0` 可关闭虚拟化（全部渲染）。 |
| `live-node-buffer` | `60` | 视窗前后保留的节点数量（overscan）。 |
| `batch-rendering` | `true` | 分批渲染（仅当 `max-live-nodes <= 0` 时启用）。 |
| `smooth-streaming` | `'auto'` | 在 typewriter / 增量模式下内置流式 pacing（`typewriter` 或 `max-live-nodes <= 0`）。设 `true` 强制启用，`false` 按原始 chunk 节奏渲染。 |
| `smooth-streaming-options` | – | 精细调整 pacing：`minCharsPerSecond`、`maxCharsPerSecond`、`targetLatencyMs`、`catchUpLatencyMs`、`catchUpThreshold`、`maxCommitFps`、`startDelayMs`、`maxCharsPerCommit`、`flushOnFinish`。在渲染器创建时一次性读取；如需动态切换，请更改组件 `key`。 |
| `initial-render-batch-size` | `40` | 初始立即渲染的节点数。 |
| `render-batch-size` | `80` | 每批渲染的节点数。 |
| `render-batch-delay` | `16` | 每批在 rAF 之后额外延迟（ms）。 |
| `render-batch-budget-ms` | `6` | 单批预算（ms），超过后会自适应缩小后续 batch。 |
| `render-batch-idle-timeout-ms` | `120` | `requestIdleCallback` 切片的超时（ms，若可用）。 |

## 代码块全局选项（由 `MarkdownRender` 下发）

这些 props 会被转发到 `CodeBlockNode` / `MarkdownCodeBlockNode`（但 **不会** 转发到 Mermaid/D2/Infographic 代码块，因为它们会路由到各自组件）：

- `code-block-dark-theme`, `code-block-light-theme`
- `code-block-monaco-options`
- `code-block-min-width`, `code-block-max-width`
- `code-block-props`（额外代码块 props，例如 `showHeader`、`showFontSizeButtons`、`showTooltips`、`htmlPreviewAllowScripts`、`htmlPreviewSandbox`，同时保留自定义透传字段）
- `themes`（在安装 `stream-monaco` 时，会转发给其主题系统）

注意：`code-block-monaco-options` 仅作用于 Monaco 版 `CodeBlockNode`。如果你把 `code_block` 覆盖成 `MarkdownCodeBlockNode`，此时 `code-block-dark-theme` / `code-block-light-theme` 应填写 Shiki 主题名，`themes` 为需要预加载的 Shiki 主题列表。`htmlPreviewAllowScripts` 和 `htmlPreviewSandbox` 只影响内置 `CodeBlockNode` 的 inline HTML iframe preview；它们不会影响 `previewCode` 事件处理器、`MarkdownCodeBlockNode`，也不会影响外部 artifact renderer。

只有 `ts twoslash` / `vue twoslash` 代码块才会在这个文档站里显示 hover 类型信息。更推荐 hover 下面对象里的字段，或者模板里的 `:code-block-monaco-options`，而不是只 hover 导入的类型名。

```vue twoslash
<script setup lang="ts">
import type { CodeBlockMonacoOptions } from 'markstream-vue'
import MarkdownRender from 'markstream-vue'

const md = '```ts\nconsole.log("hover monaco options")\n```'
const monacoOptions = {
  themes: ['vitesse-dark', 'vitesse-light'],
  languages: ['typescript', 'vue', 'json'],
  theme: 'vitesse-dark',
  MAX_HEIGHT: 640,
  diffHideUnchangedRegions: {
    enabled: true,
    contextLineCount: 2,
  },
  diffHunkActionsOnHover: true,
  diffHunkHoverHideDelayMs: 240,
} satisfies CodeBlockMonacoOptions
</script>

<template>
  <MarkdownRender
    custom-id="docs"
    :content="md"
    :code-block-monaco-options="monacoOptions"
  />
</template>
```

`code-block-props` 也可以直接走渲染器公开类型，不需要再退回 `any`：

```ts twoslash
import type { NodeRendererProps } from 'markstream-vue'

const codeBlockProps: NonNullable<NodeRendererProps['codeBlockProps']> = {
  showHeader: false,
  showFontSizeButtons: false,
  showTooltips: false,
  htmlPreviewAllowScripts: false,
}
```

## 图表节点全局下发参数

如果你希望统一控制 Mermaid / D2 / Infographic 的工具栏、渐进渲染参数或交互细节，而不手动覆盖组件，可直接在 `MarkdownRender` 上传这些对象：

- `mermaid-props`：透传给 `MermaidBlockNode`
- `d2-props`：透传给 `D2BlockNode`
- `infographic-props`：透传给 `InfographicBlockNode`

对于 Mermaid 和 Infographic 围栏，调用方未传入时 `MarkdownRender` 会自动注入 `estimatedPreviewHeightPx`，用于为异步加载和重新挂载预留稳定的首屏 preview 高度。自定义 `mermaid` / `infographic` 渲染器也会收到这个 prop；如果自定义块自己渲染 preview shell，应继续转发或使用它。

示例：

```vue
<MarkdownRender
  :content="md"
  :mermaid-props="{ showHeader: false, renderDebounceMs: 180, previewPollDelayMs: 500 }"
  :d2-props="{ progressiveIntervalMs: 450, showCopyButton: false }"
/>
```

其中 `mermaid-props` 很适合用于流式调优，常用项包括：

- `isStrict`（只有可信图表确实需要 Mermaid loose 配置时才设为 `false`；最终 SVG 仍会被清理）
- `enableMermaidInteractions`（只有可信图表需要 Mermaid 生成的点击绑定时才设为 `true`）
- `renderDebounceMs`
- `contentStableDelayMs`
- `previewPollDelayMs`
- `previewPollMaxDelayMs`
- `previewPollMaxAttempts`
- `showHeader`、`showModeToggle`、`showExportButton`、`showZoomControls` 等工具栏开关

## 代码块头部控制

可直接传给 `CodeBlockNode` / `MarkdownCodeBlockNode` / `MermaidBlockNode`，或在 `MarkdownRender` 上用 `code-block-props` 统一下发：

- `show-header`
- `show-copy-button`
- `show-expand-button`
- `show-preview-button`
- `show-collapse-button`
- `show-font-size-buttons`
- `show-tooltips`（全局控制 `LinkNode` + 代码块节点的 tooltip + Mermaid块节点的 tooltip）
- `html-preview-allow-scripts` / `html-preview-sandbox`（仅作用于内置 `CodeBlockNode` inline HTML preview；`htmlPreviewSandbox` 优先级更高，`null` 这类无效非 string override 会回退到 `sandbox=""`，省略 override 时仍由 `htmlPreviewAllowScripts` 控制，只有可信内容才建议开启脚本）

更多细节请参考 `/zh/guide/codeblock-header` 及类型定义。

示例（全局默认）：

```vue
<template>
  <MarkdownRender
    :content="md"
    :code-block-props="{ showHeader: false, showFontSizeButtons: false, showTooltips: false }"
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

1. **先引入 reset**（`modern-css-reset`、`@tailwind base`、`@unocss/reset`），再使用 `@import 'markstream-vue/index.css' layer(components);`，避免被 utilities 覆盖。详见 [Tailwind 指南](/zh/guide/tailwind)。
2. **使用 `custom-id`** 与 `[data-custom-id="docs"]` 限定覆盖范围。
3. **检查同伴 CSS** 是否导入（KaTeX），Mermaid/D2 不需要额外 CSS。
4. **查阅 [样式排查清单](/zh/guide/troubleshooting#css-looks-wrong-start-here)**，确保 reset、layer、Uno/Tailwind 配置正确。
