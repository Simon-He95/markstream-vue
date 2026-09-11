---
title: Props 与选项
description: 通过 MarkdownRender 的 props 精细控制流式渲染、暗色主题、自定义标签、解析选项与重节点行为。
keywords:
  - Props
  - 渲染选项
  - MarkdownRender
---

# 组件 Props 与选项

在集成 `markstream-vue` 时，常会需要微调流式行为、控制重节点渲染或避免 Tailwind/UnoCSS 样式冲突。本页提供对照表与排障提示。

<PrereqChips :items="[
  { text: 'Vue 快速开始', link: '/zh/guide/quick-start' },
  { text: '使用：content 与 nodes', link: '/zh/guide/usage' },
]" />

## `MarkdownRender` 核心 props

| Prop | 类型 | 默认值 | 说明 |
| ---- | ---- | ------ | ---- |
| `content` | `string` | – | 原始 Markdown 字符串（除非提供 `nodes`，否则必填）。 |
| `nodes` | `BaseNode[]` | – | 预解析后的 AST（通常为 `parseMarkdownToStructure` 返回的 `ParsedNode[]`）。 |
| `custom-id` | `string` | – | 作用域键，可在 `setCustomComponents` 注册映射并用 `[data-custom-id="docs"]` 做样式覆盖。 |
| `is-dark` | `boolean` | `false` | 主题标记，会透传给 Mermaid/D2/KaTeX/CodeBlock，并在根容器上添加 `.dark`。 |
| `index-key` | `number \| string` | – | 内部节点 key 前缀；嵌套渲染或列表中渲染多实例时建议显式传入。 |
| `final` | `boolean` | `false` | 是否为“流结束/最终态”。开启后会关闭解析器的中间态（loading）行为，避免末尾残留分隔符（如 `$$`、未闭合 code fence）永远停留在 loading。 |
| `parse-options` | `ParseOptions` | – | 解析钩子（`preTransformTokens`、`postTransformTokens`、`postTransformNodes`），仅在传入 `content` 时生效。 |
| `custom-html-tags` | `string[]` | – | 扩展流式内联 HTML 中间态白名单，并将这些标签直接输出为自定义节点（如 `type: 'thinking'`）以便 `setCustomComponents` 映射（会传给 `getMarkdown`，如 `['thinking']`）。 |
| `html-policy` | `'safe' \| 'escape' \| 'trusted'` | `'safe'` | 控制 `html_block` / `html_inline` 渲染。`safe` 会阻断 active/embed/form 类标签，`escape` 按文本显示 HTML，`trusted` 保留旧的宽 HTML 行为但仍移除脚本和危险属性。 |
| `mode` | `'docs' \| 'chat' \| 'minimal'` | `'docs'` | 按场景选择预设调优。AI/SSE 输出用 `chat`，富文档页面用 `docs`，非聊天的轻量场景用 `minimal`。 |
| `dom-mode` | `'full' \| 'minimal'` | `'full'` | 尽力减少 DOM 结构。`minimal` 只会在不需要 per-node `.node-slot` / `.node-content` 包装时跳过它们；遇到 fade、批量渲染、视口延迟、虚拟化、宿主 virtual-scroll、typewriter 或自定义组件时会回退到 `full`。如需稳定 minimal 输出，请显式关闭这些能力。 |
| `custom-markdown-it` | `(md: MarkdownIt) => MarkdownIt` | – | 自定义内部 MarkdownIt 实例（加插件、改配置）。 |
| `debug-performance` | `boolean` | `false` | 打印解析/渲染耗时、虚拟化统计，以及 `parse(stream)` 的 `streamMode` / `streamDelta` 等信息（仅 dev）。 |
| `typewriter` | `boolean \| 'simple' \| 'precise'` | `false` | 流式内容增长时显示闪烁打字光标。`true` / `'precise'` 使用基于 Range 的精确定位；`'simple'` 使用轻量 CSS 光标。 |
| `smooth-streaming` | `boolean \| 'auto'` | `'auto'` | 为流式 `content` 更新启用内置 pacing。`'auto'` 会在 `typewriter` 为 `true`、`'simple'`、`'precise'` 或 `max-live-nodes<=0` 时启用。设 `true` 强制启用，`false` 按原始 chunk 节奏渲染。 |
| `smooth-streaming-options` | `SmoothMarkdownStreamOptions` | – | 内置流式 pacing 的选项（`minCharsPerSecond`、`maxCharsPerSecond`、`targetLatencyMs`、`catchUpLatencyMs`、`catchUpThreshold`、`maxCommitFps`、`startDelayMs`、`maxCharsPerCommit`、`flushOnFinish`）。在渲染器创建时读取；如需动态修改，请更换组件 `key` 重新创建渲染器。 |
| `parse-coalesce-ms` | `number` | `80` | 高级性能调参项：内置 smooth streaming 合并字符级更新时的最小解析间隔。`smooth-streaming=false` 时不会节流原始 `content` prop 的更新，也不影响 `nodes` 模式。设为 `0` 可让每次 smooth-stream commit 都触发解析。默认调度语义后续可能继续优化。 |
| `fade` | `boolean` | `true` | 控制非代码节点进入淡入和流式追加文本淡入。生成静态截图或 SSR 输出时可关闭。 |
| `node-virtual` | `boolean \| 'auto'` | `'auto'` | 只控制当前 Markdown 文档内部的 node-level virtualization，不负责聊天或 timeline 列表虚拟滚动。 |
| `viewport-priority` | `boolean` | `true` | 将内置重节点延迟到接近可视区域时再渲染。设为 `false` 会立即渲染；单独导入并挂载重节点组件时也默认立即渲染。 |
| `virtual-scroll` | `MarkstreamVirtualScrollOptions` | – | 高级宿主 virtual-scroll 协作协议。外层 timeline virtualizer 应使用回调里的逻辑 `totalHeight`、restore state 和 settle/final 事件，而不是读取当前 DOM 高度。`enabled=true` 时请传稳定的 `sessionKey`。 |
| `viewport-priority-options` | `{ rootMargin?: string; heavyBlockMargin?: string; maxTargets?: number }` | `{ rootMargin: '400px', heavyBlockMargin: rootMargin, maxTargets: 640 }` | `viewportPriority` 的实验性 observer 调参。`rootMargin` 控制 MarkdownRender 节点外壳可见性；`heavyBlockMargin` 当前控制内置代码块渲染器和延迟 HTML block；`maxTargets` 只控制节点外壳 deferral 的自动关闭阈值，不限制子渲染器 observer 数量。 |

高频 streaming 或性能敏感的聊天界面优先使用 `typewriter="simple"`；需要光标精确贴合复杂 inline layout 时使用 `typewriter="precise"`。

::: tip SSR 与 smooth streaming
对于带静态初始内容的 SSR 场景，推荐使用 `smooth-streaming="auto"`（默认值）。`auto` 模式包含一个 mounted 门控，可避免首次客户端渲染时从空白开始 pacing。仅在明确需要从空白开始 pacing 首屏内容时才使用 `smooth-streaming=true`——这在 SSR 场景下可能导致 hydration 不匹配或首屏空白闪烁。
:::

### 虚拟滚动协作

混合 AI timeline 的 0 配置入口优先使用 `MarkstreamVirtualTimeline`；已有第三方 virtualizer 时使用 `useMarkstreamVirtualAdapter`。底层 `virtual-scroll` prop 是这些集成内部使用的 Markdown item 协作协议。

开启 `virtual-scroll.enabled` 后，`MarkdownRender` 会通过 `height-change` 报告整篇 Markdown 的逻辑高度。

外层 virtualizer 应该使用 `metrics.totalHeight` 作为 item size。不要使用当前 DOM 的 `offsetHeight`，因为组件内部可能只挂载了可视窗口内的 Markdown node，当前 DOM 高度不等于整篇文档高度。

单独传 `heightCache` 时必须同时传 `heightCacheWidth`；否则组件会忽略该缓存，以避免容器宽度变化后复用过期高度。

`final` 只表示 source stream 结束，不表示布局高度已经稳定。代码块、图表、图片、字体和自定义组件仍可能异步改变高度。`render-final` 表示当前 render session 已通过 settle 策略，不等于所有离屏虚拟节点都已经真实测量。虚拟化或离屏节点存在时，`metrics.confidence` 可能仍是 `mixed`。只有在 `metrics.confidence` 为 `measured` / `final`，或同时持久化返回的 per-node `heightCache`、`width`、`measurementKey`、`contentHash` 时，才建议把该高度缓存作为权威缓存。

### `MarkstreamVirtualTimeline` 恢复 UI

#### `restore-loading`

在恢复已测量过的 thread 时渲染。该 slot 会作为绝对定位 overlay 显示在 timeline 滚动根节点内部，不参与 item 测量。

Slot props：

- `threadKey`：当前 timeline thread key。
- `visibleRecords`：当前虚拟窗口内的 records。

不要把 loading row 插入 `items`；这会改变 offset，并可能破坏滚动恢复。

#### `restore-max-loading-ms`

控制 timeline 在恢复 thread 时最多显示多久恢复 loading。

- `false`（默认）：一直显示 loading，直到恢复后的可视区域通过 ready 检查。
- `number`：即使 ready 检查尚未通过，也会在指定毫秒数后揭开。

如果你更看重滚动和高度稳定，保留默认值。如果产品更看重 loading 时长有上限，再设置数字。

### smooth-streaming 与 fade —— 独立控制

在 Vue 3（含 Nuxt）中，两者可以同时开启。`smooth-streaming` 本身没有透明度动画，只调度交给渲染器的可见内容；`fade` 负责新增文字和非代码节点入场时的动画。

| | `smooth-streaming` | `fade` |
|---|---|---|
| **工作方式** | 平滑调度可见内容，输入积压时加速追赶 | 内容渲染后执行透明度动画 |
| **作用层面** | 字符串 / 内容层 | DOM / 视觉层 |
| **流式行为** | 控制何时出字、一次出多少 | TextNode 和 InlineCodeNode 的追加淡入采用 200 ms、opacity 0→1、`cubic-bezier(0.2, 0, 0.4, 1)` |

Vue 3 的追加淡入在 50 ms 窗口内合批，每个文字节点最多保留四个批次，已有批次自然完成，不会被后续追加重启动画。这个窗口只合并动画批次，不延迟收到的文字；密集更新可能加入已经淡入一部分的批次。非代码节点入场过渡仍保留独立的 280 ms 默认值。

旧版 Vue 3 fade 会被后续更新提前结束，因此过去曾建议避免同时开启。采用有界追加淡入后，这个限制已经不适用。其他框架适配器仍保留各自的 fade 行为，这不是跨框架的动画保证。

| 场景 | `smooth-streaming` | `fade` | 原因 |
|---|---|---|---|
| **流式输出并渐显文字** | `'auto'` 或 `true` | `true` | 平稳出字节奏叠加连续的透明度动画 |
| **减少动画开销的流式输出** | `'auto'` 或 `true` | `false` | `chat`/`minimal` 的轻量默认值，省去淡入批次与动画工作 |
| **恢复历史消息** | `false` | 可选 | 立即展示完整内容，独立选择是否需要入场动画 |
| **静态 / 打印快照** | `false` | `false` | 不做 pacing 或动画 |

保留 chat 默认值，同时开启追加淡入：

```vue
<MarkdownRender mode="chat" :content="content" :final="isDone" fade />
```

即使批次数量有上限，`fade` 仍会增加 DOM 和浏览器动画工作。请在实际负载下测量组合成本；同时开启是视觉选择，不是性能优化。SSR 首屏优先使用 `smooth-streaming="auto"`，避免强制 `true`。同一聊天消息保持 mode 稳定，fade 与完成状态独立选择，见 [AI 聊天与流式输出](/zh/guide/ai-chat-streaming#流式输出-vs-恢复历史消息-运行时切换-props)。

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
| `render-code-blocks-as-pre` | `false` | 强制内置 fenced-code 路径使用 `<pre><code>`（`PreCodeNode`）。通过 `setCustomComponents` 注册的带作用域语言或 `code_block` 覆盖仍然优先。 |
| `code-block-stream` | `true` | 启用流式代码块更新；关闭后会保持加载态直到完整文本就绪，避免中间态解析产生问题。 |
| `viewport-priority` | `true` | 优先渲染视窗内的代码块/Mermaid/D2/KaTeX 等重节点，延迟离屏渲染以提升交互体验。 |
| `defer-nodes-until-visible` | `true` | 启用后，重节点在接近视口前可先渲染为占位（仅在非虚拟化模式生效）。 |

## 渲染性能（虚拟化 & 分批渲染）

| Prop | 默认值 | 说明 |
| ---- | ------ | ---- |
| `max-live-nodes` | `docs` 模式为 `220`；`chat` / `minimal` 为 `0` | 由 `mode` 选择的虚拟化阈值；只有经过实际测量需要调优时才显式设置。 |
| `live-node-buffer` | `60` | 视窗前后保留的节点数量（overscan）。 |
| `batch-rendering` | `true` | 分批渲染（仅当 `max-live-nodes <= 0` 时启用）。 |
| `smooth-streaming` | `'auto'` | 在 typewriter / 增量模式下内置流式 pacing（`typewriter=true`、`typewriter='simple'`、`typewriter='precise'` 或 `max-live-nodes <= 0`）。设 `true` 强制启用，`false` 按原始 chunk 节奏渲染。 |
| `smooth-streaming-options` | – | 精细调整 pacing：`minCharsPerSecond`、`maxCharsPerSecond`、`targetLatencyMs`、`catchUpLatencyMs`、`catchUpThreshold`、`maxCommitFps`、`startDelayMs`、`maxCharsPerCommit`、`flushOnFinish`。在渲染器创建时一次性读取；如需动态切换，请更改组件 `key`。 |
| `initial-render-batch-size` | `40` | 初始立即渲染的节点数。 |
| `render-batch-size` | `80` | 每批渲染的节点数。 |
| `render-batch-delay` | `16` | 每批在 rAF 之后额外延迟（ms）。 |
| `render-batch-budget-ms` | `6` | 单批预算（ms），超过后会自适应缩小后续 batch。 |
| `render-batch-idle-timeout-ms` | `120` | `requestIdleCallback` 切片的超时（ms，若可用）。 |
| `virtual-scroll` | – | 向外层 virtualizer 报告逻辑高度与恢复状态。监听 `height-change`，并使用 `metrics.totalHeight` 作为消息/item 高度。`enabled=true` 时请传稳定的 `sessionKey`。 |

## `MarkdownRender` 事件

| 事件 | 载荷 | 触发时机 |
| ---- | ---- | ---- |
| `copy` | `string` | 代码块复制按钮复制了代码。 |
| `copy-code` | `string` | 与 `copy` 相同（保留的 kebab-case 别名，属于公开事件契约）。 |
| `handle-artifact-click` | `CodeBlockPreviewPayload` | 点击了代码块 HTML 预览产物。 |
| `click` | `(event: MouseEvent, referenceId?: string)` | 渲染内容中的点击事件冒泡；点击引用节点时会提供 `referenceId`。 |
| `mouseover` | `MouseEvent` | 鼠标进入渲染内容。 |
| `mouseout` | `MouseEvent` | 鼠标离开渲染内容。 |
| `height-change` | `MarkstreamVirtualMetrics` | 发起逻辑高度指标（外部虚拟滚动协调；按 `emitIntervalMs` 节流）。 |
| `virtual-state-change` | `MarkstreamVirtualState` | 发起虚拟布局状态快照（测量、锚点、高度缓存）。 |
| `render-settled` | `MarkstreamVirtualMetrics` | 内容/测量变化后渲染收敛。 |
| `render-final` | `MarkstreamVirtualMetrics` | 最终渲染完成（`final` 内容收敛后）。 |
| `anchor-change` | `MarkstreamVirtualAnchor` | 虚拟滚动锚点变化（用于恢复协调）。 |

所有载荷类型均从 `markstream-vue` 导出（`MarkstreamVirtualMetrics`、`MarkstreamVirtualState`、`MarkstreamVirtualAnchor`、`CodeBlockPreviewPayload`）。

## 代码块全局选项（由 `MarkdownRender` 下发）

这些 props 会被转发到 `CodeBlockNode`（但 **不会** 转发到 Mermaid/D2/Infographic 代码块，因为它们会路由到各自组件）：

- `code-block-dark-theme`, `code-block-light-theme`
- `code-block-min-width`, `code-block-max-width`
- `code-block-options`（`CodeBlockOptions`，从 renderer 顶层传给普通 `CodeBlockNode`；直接使用 `CodeBlockNode` 时也用同名 prop）
- `code-block-props`（额外代码块 props，例如 `showHeader`、`showFontSizeButtons`、`showTooltips`、`htmlPreviewAllowScripts`、`htmlPreviewSandbox`，同时保留不是渲染器结构字段的自定义透传字段；`node`、`key`、`ref`、`ctx`、`renderNode`、`indexKey`、`__proto__`、`prototype`、`constructor` 不会透传）
- `themes`（已注册主题名称组成的 `[dark, light]` 对）

`code-block-options` 与 `code-block-props` 分属不同层。排版/布局（`fontSize`、`lineHeight`、`fontFamily`、number 类型且单位为 px 的 `maxHeight`、number 类型且单位为 px 的上下对称 `padding`、`tabSize`）及受支持的 File/FileDiff runtime 字段使用 `code-block-options`；组件 shell 与 toolbar 使用 `code-block-props`。主题、code/language、流式状态、唯一 header、挂载/显示时机与释放由宿主管理，会覆盖冲突的 runtime 值。`htmlPreviewAllowScripts` 和 `htmlPreviewSandbox` 只影响内置 `CodeBlockNode` 的 inline HTML iframe preview；它们不会影响 `previewCode` 事件处理器，也不会影响外部 artifact renderer。

`code-block-props` 也可以直接走渲染器公开类型，不需要再退回 `any`：

```ts twoslash
import type { CodeBlockOptions, NodeRendererProps } from 'markstream-vue'

const codeBlockOptions: CodeBlockOptions = {
  fontSize: 13,
  overflow: 'wrap',
  diffStyle: 'unified',
  enableLineSelection: true,
}

const codeBlockProps: NonNullable<NodeRendererProps['codeBlockProps']> = {
  showHeader: false,
  showFontSizeButtons: false,
  showTooltips: false,
  htmlPreviewAllowScripts: false,
}
```

两者都从 renderer 顶层传入：`:code-block-options="codeBlockOptions"` 与 `:code-block-props="codeBlockProps"`。直接挂载的 `CodeBlockNode` 接收相同的 `codeBlockOptions` object。直接 `CodeBlockNode.theme` 接收已注册的 string 名称或 `{ dark, light }`；旧 Monaco JSON theme object 需先调用 `stream-diffs/pierre` 的 `registerCustomTheme`，再通过注册名称引用。

## 图表节点全局下发参数

如果你希望统一控制 Mermaid / D2 / Infographic 的工具栏、渐进渲染参数或交互细节，而不手动覆盖组件，可直接在 `MarkdownRender` 上传这些对象：

- `mermaid-props`：透传给 `MermaidBlockNode`
- `d2-props`：透传给 `D2BlockNode`
- `infographic-props`：透传给 `InfographicBlockNode`

对于 Mermaid、Infographic 和 D2 围栏，调用方未传入时 `MarkdownRender` 会自动注入 `estimatedPreviewHeightPx`，用于为异步加载和重新挂载预留稳定的首屏 preview 高度，避免图表替换源码面板时发生跳动。自定义 `mermaid` / `infographic` / `d2` 渲染器也会收到这个 prop；如果自定义块自己渲染 preview shell，应继续转发或使用它。

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

可直接传给 `CodeBlockNode` / `MermaidBlockNode`，或在 `MarkdownRender` 上用 `code-block-props` 统一下发：

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

<NextStep :items="[
  { text: 'API 总览', link: '/zh/guide/api' },
  { text: '功能特性', link: '/zh/guide/features' },
  { text: '覆盖内置组件', link: '/zh/guide/component-overrides' },
]" />
