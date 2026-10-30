---
title: Solid 组件与 API 参考
description: 完整查阅 markstream-solid 的组件、参数、回调、默认模式、流控制器、虚拟时间线、worker、SSR 与每个运行时导出的使用方式。
lastUpdated: "2026-10-31T00:00:00+08:00"
keywords:
  - markstream-solid API
  - SolidJS components
  - SolidJS Markdown props
  - SolidJS workers
---

# Solid 组件与 API 参考

本页覆盖 `markstream-solid` 的全部运行时导出、独立节点组件、渲染器参数、回调与句柄。安装先读 [Solid 指南](/zh/guide/solid)。当前仍为 workspace preview，发布前应一起构建/打包新版本 parser、core 和 Solid。导出/类型契约与运行行为分别验证，行为测试覆盖事件、时序、数学高度缓存、布局、streaming 和恢复。

## 绑定与样式

```tsx
import type { ComponentProps } from 'solid-js'
import MarkdownRender, { HeadingNode } from 'markstream-solid'
import 'markstream-solid/index.css'

export function Message(props: { text: string, done: boolean }) {
  return <MarkdownRender mode="chat" content={props.text} final={props.done} />
}
export function Heading(props: ComponentProps<typeof HeadingNode>) {
  return <div class="markstream-solid"><HeadingNode {...props} /></div>
}
```

使用 camelCase 参数/回调、callback ref 和响应式属性读取。Vue emits 对应回调，slot 对应 JSX/render function。直接使用基础节点时包在 `.markstream-solid` 中，需要暗色时同时加 `.dark`；reset 后仅导入一个 renderer CSS 入口。数学另需 `katex/dist/katex.min.css`。独立节点接收相应 parser AST（包括 `raw`），优先使用公共 parser 获取节点。`ComponentProps<typeof Component>` 是完整 TSX 参数类型。

## 渲染器

默认导出、`MarkdownRender` 和 `NodeRenderer` 是同一组件。非空 `nodes` 优先，空/null 数组回退到 `content`。`final` 表示输入完成；render-final 还要求所选稳定策略满足。替换内容重置流和测量状态。全量立即恢复时明确关闭 smooth、batch、live window、viewport priority 和节点延迟；长文档交互通常保留窗口。

| 模式 | fade/tooltips | 初始/下一批 | delay/budget/idle 毫秒 | live/buffer |
| --- | --- | --- | --- | --- |
| docs（默认） | true/true | 40/80 | 16/6/120 | 220/60 |
| chat | false/false | 32/48 | 6/8/60 | 0/0 |
| minimal | false/false | 32/48 | 6/8/60 | 0/0 |

其他默认值：`htmlPolicy='safe'`、`isDark=false`、`domMode='full'`、`typewriter=false`、`smoothStreaming='auto'`、平滑解析合并 80ms、`codeBlockStream=true`、`renderCodeBlocksAsPre=false`、`viewportPriority=true`、`nodeVirtual='auto'`。显式参数覆盖模式。省略 live 限制时，完成的 chat/minimal 历史可能自动窗口化；显式 `maxLiveNodes=0` 关闭窗口。没有外层协调的完成内容即使启用 batch 也立即恢复；外层协调的未完成历史可分批。Smooth options 在创建时读取，修改控制器配置需 remount。稳定/高级/内部参数分层沿用 [参数说明](/zh/guide/props)，Solid 使用 camelCase。

下面列出继承后的完整 `MarkdownRenderProps`。表中可选参数若未在上方给出默认值，则表示未传入、继承上下文或交给所选运行时。`class` 优先于 `className`，`style` 使用 Solid CSS 属性。
| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `data-theme` | `string \| undefined` | — |
| `class` | `string \| undefined` | — |
| `className` | `string \| undefined` | — |
| `style` | `CSSProperties \| undefined` | — |
| `onCopy` | `((code: string) => void) \| undefined` | — |
| `onCopyCode` | `((payload: { type: "copy"; text: string; }) => void) \| undefined` | — |
| `onHandleArtifactClick` | `((payload: CodeBlockPreviewPayload) => void) \| undefined` | — |
| `ref` | `((handle: MarkstreamRendererHandle) => void) \| undefined` | — |
| `onHeightChange` | `((metrics: MarkstreamVirtualMetrics) => void) \| undefined` | — |
| `onVirtualStateChange` | `((state: MarkstreamVirtualState) => void) \| undefined` | — |
| `onAnchorChange` | `((anchor: MarkstreamVirtualAnchor) => void) \| undefined` | — |
| `onRenderSettled` | `((metrics: MarkstreamVirtualMetrics) => void) \| undefined` | — |
| `onRenderFinal` | `((metrics: MarkstreamVirtualMetrics) => void) \| undefined` | — |
| `onClick` | `EventHandlerUnion<HTMLDivElement, MouseEvent, EventHandler<HTMLDivElement, MouseEvent>> \| undefined` | — |
| `onMouseover` | `EventHandlerUnion<HTMLDivElement, MouseEvent, EventHandler<HTMLDivElement, MouseEvent>> \| undefined` | — |
| `onMouseout` | `EventHandlerUnion<HTMLDivElement, MouseEvent, EventHandler<HTMLDivElement, MouseEvent>> \| undefined` | — |
| `content` | `string \| undefined` | — |
| `nodes` | `readonly BaseNode[] \| null \| undefined` | — |
| `final` | `boolean \| undefined` | — |
| `parseOptions` | `ParseOptions \| undefined` | — |
| `customMarkdownIt` | `((md: MarkdownIt) => MarkdownIt) \| undefined` | — |
| `debugPerformance` | `boolean \| undefined` | — |
| `customHtmlTags` | `readonly string[] \| undefined` | — |
| `customComponents` | `CustomComponentMap \| undefined` | — |
| `streamingComponents` | `StreamingComponentMap \| undefined` | — |
| `htmlComponents` | `HtmlComponentMap \| undefined` | — |
| `allowHtml` | `boolean \| undefined` | — |
| `mode` | `NodeRendererMode \| undefined` | — |
| `domMode` | `NodeRendererDomMode \| undefined` | — |
| `htmlPolicy` | `HtmlPolicy \| undefined` | — |
| `viewportPriority` | `boolean \| undefined` | — |
| `viewportPriorityOptions` | `MarkstreamViewportPriorityOptions \| undefined` | — |
| `codeBlockStream` | `boolean \| undefined` | — |
| `codeBlockDarkTheme` | `string \| undefined` | — |
| `codeBlockLightTheme` | `string \| undefined` | — |
| `renderCodeBlocksAsPre` | `boolean \| undefined` | — |
| `codeBlockMinWidth` | `string \| number \| undefined` | — |
| `codeBlockMaxWidth` | `string \| number \| undefined` | — |
| `codeBlockOptions` | `CodeBlockOptions \| undefined` | — |
| `codeBlockProps` | `NodeRendererCodeBlockProps \| undefined` | — |
| `mermaidProps` | `Partial<Omit<MermaidBlockNodeProps, "node" \| "isDark" \| "loading">> \| undefined` | — |
| `d2Props` | `Partial<Omit<D2BlockNodeProps, "node" \| "isDark" \| "loading">> \| undefined` | — |
| `infographicProps` | `Partial<Omit<InfographicBlockNodeProps, "node" \| "isDark" \| "loading">> \| undefined` | — |
| `showTooltips` | `boolean \| undefined` | — |
| `themes` | `CodeBlockThemes \| undefined` | — |
| `isDark` | `boolean \| undefined` | — |
| `customId` | `string \| undefined` | — |
| `indexKey` | `string \| number \| undefined` | — |
| `typewriter` | `NodeRendererTypewriter \| undefined` | — |
| `smoothStreaming` | `boolean \| "auto" \| undefined` | — |
| `smoothStreamingOptions` | `SmoothMarkdownStreamOptions \| undefined` | — |
| `parseCoalesceMs` | `number \| undefined` | — |
| `fade` | `boolean \| undefined` | — |
| `batchRendering` | `boolean \| undefined` | — |
| `initialRenderBatchSize` | `number \| undefined` | — |
| `renderBatchSize` | `number \| undefined` | — |
| `renderBatchDelay` | `number \| undefined` | — |
| `renderBatchBudgetMs` | `number \| undefined` | — |
| `renderBatchIdleTimeoutMs` | `number \| undefined` | — |
| `deferNodesUntilVisible` | `boolean \| undefined` | — |
| `maxLiveNodes` | `number \| undefined` | — |
| `liveNodeBuffer` | `number \| undefined` | — |
| `nodeVirtual` | `boolean \| "auto" \| undefined` | — |
| `virtualScroll` | `MarkstreamVirtualScrollOptions \| undefined` | — |
| `renderAsFragment` | `boolean \| undefined` | — |
## 组件

下面是基础节点与 RenderNode/RenderChildren 使用的共同参数。节点组件需要 `node`；renderer 为自定义组件提供 context/ctx。独立 `HardBreakNode`、`ThematicBreakNode` 不需要节点。专用事件在下方列出，DOM 冒泡与组件回调是不同契约。
| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `node` | `TNode` | 是 |
| `context` | `SolidRenderContext \| undefined` | — |
| `ctx` | `SolidRenderContext \| undefined` | — |
| `showTooltips` | `boolean \| undefined` | — |
| `codeBlockOptions` | `CodeBlockOptions \| undefined` | — |
| `onCopy` | `((payload: any) => void) \| undefined` | — |
| `onHandleArtifactClick` | `((payload: CodeBlockPreviewPayload) => void) \| undefined` | — |
| `indexKey` | `string \| number \| undefined` | — |
| `isDark` | `boolean \| undefined` | — |
| `customId` | `string \| undefined` | — |
| `typewriter` | `boolean \| "simple" \| "precise" \| undefined` | — |
| `fade` | `boolean \| undefined` | — |

| 组件 | node.type | AST 字段 | TSX |
| --- | --- | --- | --- |
| `ParagraphNode` | `paragraph` | `children` | `<ParagraphNode node={node} />` |
| `HeadingNode` | `heading` | `level, children` | `<HeadingNode node={node} />` |
| `TextNode` | `text / text_special` | `content` | `<TextNode node={node} />` |
| `StrongNode` | `strong` | `children` | `<StrongNode node={node} />` |
| `EmphasisNode` | `emphasis` | `children` | `<EmphasisNode node={node} />` |
| `StrikethroughNode` | `strikethrough` | `children` | `<StrikethroughNode node={node} />` |
| `HighlightNode` | `highlight` | `children` | `<HighlightNode node={node} />` |
| `InsertNode` | `insert` | `children` | `<InsertNode node={node} />` |
| `SubscriptNode` | `subscript` | `children` | `<SubscriptNode node={node} />` |
| `SuperscriptNode` | `superscript` | `children` | `<SuperscriptNode node={node} />` |
| `BlockquoteNode` | `blockquote` | `children, cite?` | `<BlockquoteNode node={node} />` |
| `ListNode` | `list` | `items, ordered?, start?` | `<ListNode node={node} />` |
| `ListItemNode` | `list_item` | `children` | `<ListItemNode node={node} />` |
| `HardBreakNode` | `hardbreak` | `—` | `<HardBreakNode />` |
| `ThematicBreakNode` | `thematic_break` | `—` | `<ThematicBreakNode />` |
| `InlineCodeNode` | `inline_code` | `code / content` | `<InlineCodeNode node={node} />` |
| `TableNode` | `table` | `header.cells, rows[].cells` | `<TableNode node={node} />` |
| `CheckboxNode` | `checkbox / checkbox_input` | `checked` | `<CheckboxNode node={node} />` |
| `EmojiNode` | `emoji` | `name / content` | `<EmojiNode node={node} />` |
| `DefinitionListNode` | `definition_list` | `items[].term, items[].definition` | `<DefinitionListNode node={node} />` |
| `FootnoteNode` | `footnote` | `id, children` | `<FootnoteNode node={node} />` |
| `FootnoteReferenceNode` | `footnote_reference` | `id` | `<FootnoteReferenceNode node={node} />` |
| `FootnoteAnchorNode` | `footnote_anchor` | `id` | `<FootnoteAnchorNode node={node} />` |
| `HtmlBlockNode` | `html_block` | `content, tag?, children?` | `<HtmlBlockNode node={node} />` |
| `HtmlInlineNode` | `html_inline` | `content, tag?, children?` | `<HtmlInlineNode node={node} />` |
| `VmrContainerNode` | `vmr_container` | `name, attrs?, children` | `<VmrContainerNode node={node} />` |
| `AdmonitionNode` | `admonition` | `kind, title?, children, collapsible?, open?` | `<AdmonitionNode node={node} />` |
| `FallbackComponent` | `other parser nodes` | `raw / content` | `<FallbackComponent node={node} />` |

`RenderNode` 渲染一个节点，`RenderChildren` 渲染当前节点的 children 或显式 nodes，自定义组件中使用 `<RenderChildren {...props} />` 可保留上下文与事件。基础节点没有额外开关；列表由 ordered/start 控制，admonition 由 kind/title/collapsible/open 控制，表格自带列拖拽，footnote/anchor 使用作用域内跳转。

### CodeBlockNode

增强需 stream-diffs，否则原生 pre。header/copy/collapse/expand/font/preview 开关默认 true，fontSize=12、maxHeight=500、主题 vitesse-dark/vitesse-light。HTML 预览脚本默认关闭。额外 Solid 参数：headerLeft/headerRight（JSX 或函数）、onCopy(code)、onPreviewCode(payload)。复制同时转发 renderer 回调。

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `node` | `CodeBlockNode` | 是 |
| `codeBlockOptions` | `CodeBlockOptions \| undefined` | — |
| `clipboardWriter` | `((text: string) => void \| Promise<void>) \| undefined` | — |
| `showLineNumbers` | `boolean \| undefined` | — |
| `isDark` | `boolean \| undefined` | — |
| `loading` | `boolean \| undefined` | — |
| `stream` | `boolean \| undefined` | — |
| `theme` | `CodeBlockThemeProp \| undefined` | — |
| `darkTheme` | `string \| undefined` | — |
| `lightTheme` | `string \| undefined` | — |
| `isShowPreview` | `boolean \| undefined` | — |
| `enableFontSizeControl` | `boolean \| undefined` | — |
| `minWidth` | `string \| number \| undefined` | — |
| `maxWidth` | `string \| number \| undefined` | — |
| `themes` | `CodeBlockThemes \| undefined` | — |
| `showPreviewButton` | `boolean \| undefined` | — |
| `showCollapseButton` | `boolean \| undefined` | — |
| `showFontSizeButtons` | `boolean \| undefined` | — |
| `showTooltips` | `boolean \| undefined` | — |
| `htmlPreviewAllowScripts` | `boolean \| undefined` | — |
| `htmlPreviewSandbox` | `string \| undefined` | — |
| `customId` | `string \| undefined` | — |
| `showHeader` | `boolean \| undefined` | — |
| `showCopyButton` | `boolean \| undefined` | — |
| `showExpandButton` | `boolean \| undefined` | — |

### PreCodeNode

不需编辑器 peer。独立节点行号默认关，围栏包装默认开。diffInline 选择统一 diff；diffHideUnchangedRegions 为布尔或折叠参数。reservedHeightPx 预留异步后备高度。

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `node` | `CodeBlockNode` | 是 |
| `loading` | `boolean \| undefined` | — |
| `showLineNumbers` | `boolean \| undefined` | — |
| `diffInline` | `boolean \| undefined` | — |
| `diffHideUnchangedRegions` | `CodeBlockDiffHideUnchangedRegions \| undefined` | — |
| `reservedHeightPx` | `number \| undefined` | — |

### CodeBlockOptions

字段转发 stream-diffs；字体/主题/语言/单一头部、显示/销毁与流生命周期由宿主控制。未设置字段沿用所安装运行时默认值，排版布局规则见代码运行时指南。

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `fontSize` | `number \| undefined` | — |
| `lineHeight` | `number \| undefined` | — |
| `fontFamily` | `string \| undefined` | — |
| `maxHeight` | `number \| undefined` | — |
| `padding` | `number \| undefined` | — |
| `tabSize` | `number \| undefined` | — |
| `disableLineNumbers` | `boolean \| undefined` | — |
| `overflow` | `"scroll" \| "wrap" \| undefined` | — |
| `disableVirtualizationBuffers` | `boolean \| undefined` | — |
| `useCSSClasses` | `boolean \| undefined` | — |
| `useTokenTransformer` | `boolean \| undefined` | — |
| `tokenizeMaxLineLength` | `number \| undefined` | — |
| `tokenizeMaxLength` | `number \| undefined` | — |
| `unsafeCSS` | `string \| undefined` | — |
| `diffStyle` | `"unified" \| "split" \| undefined` | — |
| `diffIndicators` | `"classic" \| "bars" \| "none" \| undefined` | — |
| `disableBackground` | `boolean \| undefined` | — |
| `hunkSeparators` | `"simple" \| "metadata" \| "line-info" \| "line-info-basic" \| undefined` | — |
| `expandUnchanged` | `boolean \| undefined` | — |
| `collapsedContextThreshold` | `number \| undefined` | — |
| `lineDiffType` | `"none" \| "word-alt" \| "word" \| "char" \| undefined` | — |
| `maxLineDiffLength` | `number \| undefined` | — |
| `expansionLineCount` | `number \| undefined` | — |
| `parseDiffOptions` | `Record<string, unknown> \| undefined` | — |
| `lineHoverHighlight` | `"number" \| "disabled" \| "both" \| "line" \| undefined` | — |
| `enableTokenInteractionsOnWhitespace` | `boolean \| undefined` | — |
| `enableGutterUtility` | `boolean \| undefined` | — |
| `enableLineSelection` | `boolean \| undefined` | — |
| `controlledSelection` | `boolean \| undefined` | — |
| `onGutterUtilityClick` | `((...args: any[]) => unknown) \| undefined` | — |
| `onLineClick` | `((...args: any[]) => unknown) \| undefined` | — |
| `onLineNumberClick` | `((...args: any[]) => unknown) \| undefined` | — |
| `onLineEnter` | `((...args: any[]) => unknown) \| undefined` | — |
| `onLineLeave` | `((...args: any[]) => unknown) \| undefined` | — |
| `onTokenClick` | `((...args: any[]) => unknown) \| undefined` | — |
| `onTokenEnter` | `((...args: any[]) => unknown) \| undefined` | — |
| `onTokenLeave` | `((...args: any[]) => unknown) \| undefined` | — |
| `onLineSelected` | `((...args: any[]) => unknown) \| undefined` | — |
| `onLineSelectionStart` | `((...args: any[]) => unknown) \| undefined` | — |
| `onLineSelectionChange` | `((...args: any[]) => unknown) \| undefined` | — |
| `onLineSelectionEnd` | `((...args: any[]) => unknown) \| undefined` | — |
| `getLineIndex` | `((...args: any[]) => unknown) \| undefined` | — |
| `renderAnnotation` | `((...args: any[]) => unknown) \| undefined` | — |
| `renderGutterUtility` | `((...args: any[]) => unknown) \| undefined` | — |
| `onPostRender` | `((...args: any[]) => unknown) \| undefined` | — |
| `mergeConflict` | `boolean \| undefined` | — |
| `lineAnnotations` | `unknown[] \| undefined` | — |
| `onController` | `((controller: any) => void) \| undefined` | — |
| `workerManager` | `unknown` | — |

### MermaidBlockNode

需 mermaid。maxHeight=500px、预估高未给定时360px、头部/操作开关=true、isStrict=true、交互=false、fitPreviewHeight=false、renderDebounceMs=300、contentStableDelayMs=500、轮询初始800/上限4000毫秒/12次（最小120毫秒、1.5倍退避）。onCopy/onExport/onOpenModal 接收可取消 MermaidBlockEvent，onToggleMode 为 (mode,event)，调用 event.preventDefault()；onRenderError 返回 true 可抑制默认错误。

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `node` | `CodeBlockNode` | 是 |
| `maxHeight` | `string \| null \| undefined` | — |
| `estimatedPreviewHeightPx` | `number \| undefined` | — |
| `loading` | `boolean \| undefined` | — |
| `isDark` | `boolean \| undefined` | — |
| `workerTimeoutMs` | `number \| undefined` | — |
| `parseTimeoutMs` | `number \| undefined` | — |
| `renderTimeoutMs` | `number \| undefined` | — |
| `fullRenderTimeoutMs` | `number \| undefined` | — |
| `renderDebounceMs` | `number \| undefined` | — |
| `contentStableDelayMs` | `number \| undefined` | — |
| `previewPollDelayMs` | `number \| undefined` | — |
| `previewPollMaxDelayMs` | `number \| undefined` | — |
| `previewPollMaxAttempts` | `number \| undefined` | — |
| `showHeader` | `boolean \| undefined` | — |
| `showModeToggle` | `boolean \| undefined` | — |
| `showCopyButton` | `boolean \| undefined` | — |
| `showExportButton` | `boolean \| undefined` | — |
| `showFullscreenButton` | `boolean \| undefined` | — |
| `showCollapseButton` | `boolean \| undefined` | — |
| `showZoomControls` | `boolean \| undefined` | — |
| `enableWheelZoom` | `boolean \| undefined` | — |
| `isStrict` | `boolean \| undefined` | — |
| `enableMermaidInteractions` | `boolean \| undefined` | — |
| `showTooltips` | `boolean \| undefined` | — |
| `fitPreviewHeight` | `boolean \| undefined` | — |
| `onRenderError` | `((error: unknown, code: string, container: HTMLElement) => boolean \| void) \| undefined` | — |

### D2BlockNode

需 @terrastruct/d2。支持源码/预览/复制/导出/折叠；maxHeight=500px，渐进渲染显式启用，interval=400ms，主题 id 转发 D2。

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `node` | `CodeBlockNode` | 是 |
| `maxHeight` | `string \| null \| undefined` | — |
| `estimatedPreviewHeightPx` | `number \| undefined` | — |
| `loading` | `boolean \| undefined` | — |
| `isDark` | `boolean \| undefined` | — |
| `progressiveRender` | `boolean \| undefined` | — |
| `progressiveIntervalMs` | `number \| undefined` | — |
| `themeId` | `number \| null \| undefined` | — |
| `darkThemeId` | `number \| null \| undefined` | — |
| `showHeader` | `boolean \| undefined` | — |
| `showModeToggle` | `boolean \| undefined` | — |
| `showCopyButton` | `boolean \| undefined` | — |
| `showExportButton` | `boolean \| undefined` | — |
| `showCollapseButton` | `boolean \| undefined` | — |

### InfographicBlockNode

需 @antv/infographic 并启用 loader。源码/预览/复制/导出/折叠/缩放/平移/全屏，头部/操作默认 true，maxHeight=500px。

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `node` | `CodeBlockNode` | 是 |
| `maxHeight` | `string \| null \| undefined` | — |
| `estimatedPreviewHeightPx` | `number \| undefined` | — |
| `loading` | `boolean \| undefined` | — |
| `isDark` | `boolean \| undefined` | — |
| `showHeader` | `boolean \| undefined` | — |
| `showModeToggle` | `boolean \| undefined` | — |
| `showCopyButton` | `boolean \| undefined` | — |
| `showCollapseButton` | `boolean \| undefined` | — |
| `showExportButton` | `boolean \| undefined` | — |
| `showFullscreenButton` | `boolean \| undefined` | — |
| `showZoomControls` | `boolean \| undefined` | — |

### MathBlockNode

需 katex 与 CSS。cacheScope + indexKey 标记 renderer 拥有的待定最小高度缓存，scope 默认 renderer 会话；只有 renderer 后代共享该缓存，独立数学节点保留本地待定高度；不是全局 HTML/macro 缓存。渲染成功清除待定预留。worker 背压 timeout/wait/retry 为3000/2000毫秒/8次。

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `node` | `{ type: "math_block"; content: string; raw: string; loading?: boolean \| undefined; }` | 是 |
| `indexKey` | `string \| number \| undefined` | — |
| `cacheScope` | `string \| number \| undefined` | — |

### MathInlineNode

需 katex 与 CSS，markup=$$ 使用 display 模式。worker timeout/wait/retry=1500/1500毫秒/8次。来源变化取消旧请求，流式请求合并32毫秒。

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `node` | `{ type: "math_inline"; content: string; raw: string; loading?: boolean \| undefined; markup?: string \| undefined; }` | 是 |

### ImageNode

fallbackSrc 未传、lazy=false、usePlaceholder=true。回调 onLoad(src)、onError(src)、onClick([event,src])，点击仅已加载图触发，请求遵守 node.loading 与视口延迟。8秒仅释放生命周期等待，不把慢请求变成图片错误；仅修改 metadata 保留已加载 URL。

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `node` | `{ type: "image"; src: string; alt: string; title: string \| null; raw: string; loading?: boolean \| undefined; }` | 是 |
| `fallbackSrc` | `string \| undefined` | — |
| `lazy` | `boolean \| undefined` | — |
| `usePlaceholder` | `boolean \| undefined` | — |

### LinkNode

showTooltip=true、underlineHeight=2px、bottom=-3px、动画1.6秒/0.35/ease-in-out/infinite。URL/attrs 清洗，未完成链接省略 href；外链 blank 带 noopener/noreferrer。

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `node` | `{ type: "link"; href: string; title: string \| null; text: string; attrs?: [string, string][] \| undefined; children: { type: string; raw: string; }[]; raw: string; loading?: boolean \| undefined; markup?: string \| undefined; }` | 是 |
| `indexKey` | `string \| number` | 是 |
| `customId` | `string \| undefined` | — |
| `showTooltip` | `boolean \| undefined` | — |
| `color` | `string \| undefined` | — |
| `underlineHeight` | `number \| undefined` | — |
| `underlineBottom` | `string \| number \| undefined` | — |
| `animationDuration` | `number \| undefined` | — |
| `animationOpacity` | `number \| undefined` | — |
| `animationTiming` | `string \| undefined` | — |
| `animationIteration` | `string \| number \| undefined` | — |

### ReferenceNode

click/enter/leave 回调为 (event,id,messageId,threadId)，id 转为字符串，messageId/threadId 为可选宿主上下文。

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `node` | `{ type: "reference"; id: string \| number; raw?: string \| undefined; }` | 是 |
| `messageId` | `string \| undefined` | — |
| `threadId` | `string \| undefined` | — |
| `onClick` | `((event: MouseEvent, id: string, messageId?: string \| undefined, threadId?: string \| undefined) => void) \| undefined` | — |
| `onMouseEnter` | `((event: MouseEvent, id: string, messageId?: string \| undefined, threadId?: string \| undefined) => void) \| undefined` | — |
| `onMouseLeave` | `((event: MouseEvent, id: string, messageId?: string \| undefined, threadId?: string \| undefined) => void) \| undefined` | — |

### Tooltip

浏览器 Portal；placement=top、offset=6。anchorEl 可为 null，visible 控制渲染，id 绑定 aria-describedby 并在清理时移除。

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `visible` | `boolean` | 是 |
| `anchorEl` | `HTMLElement \| null` | 是 |
| `content` | `string` | 是 |
| `placement` | `"top" \| "bottom" \| "left" \| "right" \| undefined` | — |
| `offset` | `number \| undefined` | — |
| `originX` | `number \| null \| undefined` | — |
| `originY` | `number \| null \| undefined` | — |
| `id` | `string \| null \| undefined` | — |
| `isDark` | `boolean \| null \| undefined` | — |

### HtmlPreviewFrame

浏览器 Portal/srcdoc，sandbox 默认空；htmlPreviewAllowScripts=true 显式允许脚本，显式 htmlPreviewSandbox 优先。Escape/背景/关闭调用 onClose，并恢复原焦点。

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `code` | `string` | 是 |
| `isDark` | `boolean \| undefined` | — |
| `htmlPreviewAllowScripts` | `boolean \| undefined` | — |
| `htmlPreviewSandbox` | `string \| undefined` | — |
| `onClose` | `(() => void) \| undefined` | — |
| `title` | `string \| undefined` | — |

```tsx
import { CodeBlockNode, MathBlockNode, ReferenceNode } from 'markstream-solid'

<>
  <CodeBlockNode node={{ type: 'code_block', language: 'html', code: '<h1>Hello</h1>', raw: '' }} showCopyButton headerLeft={<strong>example.html</strong>} onCopy={text => console.log(text)} />
  <MathBlockNode node={{ type: 'math_block', content: 'x^2', raw: '$$x^2$$' }} indexKey="formula" cacheScope="thread-a" />
  <ReferenceNode node={{ type: 'reference', id: '1' }} messageId="message" threadId="thread" onClick={(event, id, message, thread) => console.log(id, message, thread)} />
</>
```
## 回调、ref 与配置

`onCopy(code)` 返回复制文本；`onCopyCode({type:'copy',text})` 是结构化版本。`onHandleArtifactClick(payload)` 接收 node、artifactType/title、id，并由宿主接管 HTML/SVG 预览。虚拟回调包括 onHeightChange(metrics)、onVirtualStateChange(state)、onAnchorChange(anchor)、onRenderSettled(metrics)、onRenderFinal(metrics)。根 onClick/onMouseover/onMouseout 接收 DOM 事件。

Renderer 的 callback ref 返回 getVirtualMetrics(reason?)、captureVirtualState(options?)、restoreVirtualState(state,options?)、异步 forceMeasure(reason?)、异步 settle({frames,timeoutMs,reason})、scrollToNode(index,align)。align 支持 start/center/end/nearest；捕获支持 requireViewport/allowFallbackAnchor/includeEmptyState。恢复验证 session/thread、宽度、measurementKey 和节点签名，按需设置 restoreAnchor/allowUncapturedAnchor。保存返回状态，不手工拼高度；单独传 virtualScroll.heightCache 时必须带 heightCacheWidth。

MarkstreamProvider 接收 components/defaultI18nMap/languageIconResolver/children。setCustomComponents(mapping) 或 setCustomComponents(id,mapping) 注册全局/指定作用域，removeCustomComponents(id)、clearGlobalCustomComponents() 清理。局部 customComponents 优先，SSR 请求使用 provider/局部隔离。defineStreamingComponents/defineHtmlComponents 保留 map 类型；withMarkstreamComponentDisplay(component,'block'|'inline') 标记布局边界，getCustomComponentDisplay 读取。parser 标签组件与清洗后的 HTML 替换是两套输入。setDefaultI18nMap 修改全局后备翻译，请求隔离优先 provider。

图标 API：registerIconTheme、setIconTheme、getRegisteredThemes、setLanguageIconResolver、getLanguageIcon、preloadExtendedLanguageIcons、normalizeLanguageIdentifier、resolveLanguageId；languageMap 提供语言名称，languageIconsRevision() 提供更新版本。getRegisteredThemes 返回图标主题，不是代码编辑器主题。

## 流控制器

useSmoothMarkdownStream(options?) 在 Solid owner 中调用。响应式 accessor：snapshot()/source()/visible()/done()/final()/caughtUp()/pendingChars()。命令：enqueue(chunk)、finish({flush?})、flush()、reset(initial?,{prefixKnown?})、pause()/resume()、destroy()/dispose()。getSnapshot() 返回非响应式快照；subscribe(listener) 返回取消函数。owner 清理时自动取消订阅并销毁。等待 caughtUp 后再 final 解析，同一响应只保留一个 pacing owner。

配置字段：minCharsPerSecond/maxCharsPerSecond、targetLatencyMs/catchUpLatencyMs/catchUpThreshold、maxCommitFps/startDelayMs/maxCharsPerCommit、flushOnFinish、burstInitialContent/burstRevealThresholdChars。数值默认值见公共 controller 类型；renderer 模式另有自己的默认值。

## 虚拟时间线与 adapter

`MarkstreamVirtualTimeline<T>` 使用 items/getKey/getKind/getContent/getFinal/getRevision，或默认的 id/kind/content/final/revision 字段。没有 kind 时，非空 content 作为 Markdown。Markdown 行由内置 renderer 渲染，renderItem 是非 Markdown 的后备组件。默认 markdownMode=docs、markdownFade=false、overscanPx=1200、overscan=1、Markdown 估算高=360px、stickToBottom=auto、restoreMaxLoadingMs=false。宿主提供有限高度。layoutRevision 开启显式结构失效；key/kind/component/估算输入变化时递增。

回调：onHeightChange({itemKey,metrics})、onVirtualStateChange({itemKey,state})、onThreadStateChange(state)、onRangeChange({start,end})。ref 方法：captureThreadState()/restoreThreadState(state)、scrollToBottom()、scrollToIndex(index,align)、scrollToOffset(offset)、getItemSize(key)、getTotalHeight()、getVisibleRange()。恢复验证测量与会话兼容，用户导航会取消旧测量锚点回写。

useMarkstreamVirtualAdapter(options) 接入已有外层 virtualizer。必须提供 getScrollElement/getScrollTop/setScrollTop/getViewportHeight/getTotalHeight/getItemOffset/getItemSize/setItemSize/getVisibleRange/scrollToOffset/scrollToIndex，measureElement 可选。返回 itemHeights、markdownStates、getItemKey、isMarkdownItem、isRestoringThread、measureItem、unobserveItem、releaseDetached、markdownProps、captureThreadState、preloadThreadState、restoreThreadState、dispose。把 markdownProps 的回调接到嵌套 renderer，释放已离开 DOM 的测量。导出索引中的 key/kind/content/final/revision/估算高度辅助函数沿用相同 extractor。

## Worker 与可选集成

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({ plugins: [solid({ ssr: true })], worker: { format: 'es' } })
```

```ts
// 客户端入口；SSR 组件内在 onMount 创建。
import { setKaTeXWorker, setMermaidWorker } from 'markstream-solid'
import KatexWorker from 'markstream-solid/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-solid/workers/mermaidParser.worker?worker'

setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
```

Mermaid 分包需要文件 worker 提供模块基址，旧 inline 示例无法解析相对 chunk。构建出的 worker 保留模块 import，交给宿主 bundler 处理。KaTeX worker 渲染块/行内数学并包含 mhchem；Mermaid worker 做解析/前缀探测，SVG 生成仍在主线程。安装相应 peer；缺失可选 peer 使用相应 raw/pre 后备。Infographic 通过 enableInfographic(() => import('@antv/infographic')) 显式启用。Katex/Mermaid/D2/Infographic 均有 enable/disable/isEnabled/setLoader API，注意导出拼写 Katex。

KaTeX client：setKaTeXWorker、clearKaTeXWorker、renderKaTeXInWorker(content,displayMode=true,timeout=2000,signal?)、renderKaTeXWithBackpressure(content,displayMode,options)、waitForKaTeXWorkerSlot、isKaTeXWorkerBusy、getKaTeXWorkerLoad、setKaTeXWorkerMaxConcurrency、setKaTeXWorkerDebug、get/setKaTeXBackpressureDefaults、setKaTeXCache。背压默认 timeout=2000、waitTimeout=1500、backoffMs=30、maxRetries=1，单次调用还接受 AbortSignal。busy/timeout/init 错误不同，组件按不同策略处理。

Mermaid client：setMermaidWorker、clearMermaidWorker、canParseOffthread(code,theme,timeout=1400)、findPrefixOffthread(code,theme,timeout=1400)、getMermaidWorkerLoad、setMermaidWorkerMaxConcurrency、setMermaidWorkerClientDebug、terminateWorker。theme 为 light/dark，前缀探测可返回 null。clear 移除客户端绑定，宿主不再使用 worker 时 terminate/dispose。

CDN：buildKaTeXCDNWorkerSource / buildMermaidCDNWorkerSource 返回源码；createKaTeXWorkerFromCDN / createMermaidWorkerFromCDN 返回 {worker,source,dispose}，服务端 worker 为 null。KaTeX 必需 katexUrl，可选 mhchemUrl、mode（classic 默认/module）、debug、workerOptions、renderOptions。Mermaid 必需 mermaidUrl，可选 mode（module 默认/classic）、debug、workerOptions、initializeOptions。提供格式匹配的绝对 UMD/ESM URL；Blob worker 需要 CSP worker-src blob:，远程依赖还需 CORS/CSP。文件 worker 使用自托管构建资源。

高亮池由宿主拥有：set/get/clear/terminateStreamDiffsWorkerPool、syncStreamDiffsWorkerTheme。兼容池实现 initialize/isWorkingPool/setRenderOptions/terminate；worker factory 来自所安装的高亮 SDK，不由本包内置创建。preloadCodeBlockRuntime() 预热可选增强运行时，isCodeBlockRuntimeReady() 查询状态。

## HTML、生命周期与工具

renderMarkdownToHtml({content,nodes,final,parseOptions,customHtmlTags,allowHtml,htmlPolicy})、renderMarkdownNodesToHtml(nodes,options?)、renderNestedMarkdownToHtml(input,options?) 返回 HTML 字符串，不挂载 Solid 组件或运行增强。不可信内容保持 htmlPolicy=safe。公共 parser/安全工具与常量见下方索引及 [API](/zh/guide/api)、[parser](/zh/guide/parser-api)、[安全](/zh/guide/security)。

useMarkstreamNodeLifecycle() 返回当前生命周期或 null。异步自定义组件可调用 markPending(indexKey)、markSettled(indexKey)、reportHeight(indexKey,height)，卸载时配对清理。MARKSTREAM_NODE_LIFECYCLE_KEY 是 Solid context，代替 Vue injection 绑定。

性能工具：enablePerfMonitoring/disablePerfMonitoring、perfMonitor、getPerfReport。safeRaf/safeCancelRaf 用于浏览器帧调度。recommendWorkerThreshold、estimateRByFormula、defaultRByClass、recommendNForSamples 估算数学 worker 阈值，不创建 worker。解析策略共用：非 final 的尾部歧义脚注暂缓，完成时正确输出。

## 配置与虚拟状态类型

下方补充配置、状态及句柄类型，随后列出全部运行时签名。类型/文档覆盖与行为验证分别检查。

### MarkstreamSolidOptions

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `components` | `CustomComponentMap \| undefined` | — |
| `defaultI18nMap` | `Partial<Record<string, string>> \| undefined` | — |
| `languageIconResolver` | `LanguageIconResolver \| null \| undefined` | — |

### MarkstreamVirtualMetrics

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `sessionKey` | `string` | 是 |
| `threadKey` | `string \| undefined` | — |
| `phase` | `MarkstreamVirtualPhase` | 是 |
| `nodeCount` | `number` | 是 |
| `liveRange` | `{ start: number; end: number; }` | 是 |
| `renderedCount` | `number` | 是 |
| `measuredCount` | `number` | 是 |
| `estimatedCount` | `number` | 是 |
| `averageNodeHeight` | `number` | 是 |
| `topSpacerHeight` | `number` | 是 |
| `bottomSpacerHeight` | `number` | 是 |
| `visibleDomHeight` | `number` | 是 |
| `totalHeight` | `number` | 是 |
| `width` | `number` | 是 |
| `final` | `boolean` | 是 |
| `stable` | `boolean` | 是 |
| `confidence` | `MarkstreamVirtualConfidence` | 是 |
| `reason` | `MarkstreamVirtualReason` | 是 |

### MarkstreamVirtualState

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `sessionKey` | `string` | 是 |
| `threadKey` | `string \| undefined` | — |
| `anchor` | `MarkstreamVirtualAnchor \| undefined` | — |
| `anchorCaptured` | `boolean \| undefined` | — |
| `metrics` | `MarkstreamVirtualMetrics` | 是 |
| `width` | `number` | 是 |
| `contentHash` | `string \| undefined` | — |
| `measurementKey` | `string \| undefined` | — |
| `heightCache` | `MarkstreamHeightCache \| undefined` | — |

### MarkstreamViewportPriorityOptions

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `rootMargin` | `string \| undefined` | — |
| `heavyBlockMargin` | `string \| undefined` | — |
| `maxTargets` | `number \| undefined` | — |

### MarkstreamVirtualTimelineProps

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `items` | `readonly T[]` | 是 |
| `threadKey` | `MarkstreamTimelineItemKey \| undefined` | — |
| `layoutRevision` | `MarkstreamTimelineItemKey \| undefined` | — |
| `getKey` | `((item: T, index: number) => MarkstreamTimelineItemKey) \| undefined` | — |
| `getKind` | `((item: T, index: number) => string) \| undefined` | — |
| `getContent` | `((item: T, index: number) => string) \| undefined` | — |
| `getFinal` | `((item: T, index: number) => boolean) \| undefined` | — |
| `getRevision` | `((item: T, index: number) => MarkstreamTimelineItemKey \| undefined) \| undefined` | — |
| `estimateItemHeight` | `((item: T, index: number) => number) \| undefined` | — |
| `overscan` | `number \| undefined` | — |
| `overscanPx` | `number \| undefined` | — |
| `stickToBottom` | `boolean \| "auto" \| undefined` | — |
| `measurementKey` | `string \| number \| undefined` | — |
| `markdownMode` | `NodeRendererMode \| undefined` | — |
| `renderCodeBlocksAsPre` | `boolean \| undefined` | — |
| `initialThreadState` | `MarkstreamThreadVirtualState \| null \| undefined` | — |
| `markdownFade` | `boolean \| undefined` | — |
| `restoreMaxLoadingMs` | `number \| false \| undefined` | — |
| `debug` | `boolean \| undefined` | — |

### MarkstreamOuterVirtualizerAdapter

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `getScrollElement` | `() => HTMLElement \| null` | 是 |
| `getScrollTop` | `() => number` | 是 |
| `setScrollTop` | `(value: number) => void` | 是 |
| `getViewportHeight` | `() => number` | 是 |
| `getTotalHeight` | `() => number` | 是 |
| `getItemOffset` | `(key: string) => number` | 是 |
| `getItemSize` | `(key: string) => number` | 是 |
| `setItemSize` | `(key: string, size: number) => void` | 是 |
| `getVisibleRange` | `() => MarkstreamVisibleRange` | 是 |
| `scrollToOffset` | `(offset: number) => void` | 是 |
| `scrollToIndex` | `(index: number, align?: "start" \| "center" \| "end" \| undefined) => void` | 是 |
| `measureElement` | `((key: string, el: HTMLElement) => void) \| undefined` | — |

### UseMarkstreamVirtualAdapterOptions

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `items` | `MaybeAccessor<readonly T[]>` | 是 |
| `threadKey` | `MaybeAccessor<MarkstreamTimelineItemKey \| undefined>` | — |
| `layoutRevision` | `MaybeAccessor<MarkstreamTimelineItemKey \| undefined>` | — |
| `getKey` | `((item: T, index: number) => MarkstreamTimelineItemKey) \| undefined` | — |
| `getKind` | `((item: T, index: number) => string) \| undefined` | — |
| `getContent` | `((item: T, index: number) => string) \| undefined` | — |
| `getFinal` | `((item: T, index: number) => boolean) \| undefined` | — |
| `getRevision` | `((item: T, index: number) => MarkstreamTimelineItemKey \| undefined) \| undefined` | — |
| `estimateItemHeight` | `((item: T, index: number) => number) \| undefined` | — |
| `measurementKey` | `MaybeAccessor<string \| number \| undefined>` | — |
| `markdownMode` | `MaybeAccessor<NodeRendererMode \| undefined>` | — |
| `renderCodeBlocksAsPre` | `MaybeAccessor<boolean \| undefined>` | — |
| `markdownFade` | `boolean \| undefined` | — |
| `preserveScrollAnchor` | `boolean \| "auto" \| undefined` | — |
| `bottomThresholdPx` | `number \| undefined` | — |
| `debug` | `boolean \| undefined` | — |
| `virtualizer` | `MarkstreamOuterVirtualizerAdapter` | 是 |

### MarkstreamVirtualAdapterController

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `itemHeights` | `Map<string, number>` | 是 |
| `markdownStates` | `Map<string, MarkstreamVirtualState>` | 是 |
| `getItemKey` | `(item: T, index: number) => string` | 是 |
| `isMarkdownItem` | `(item: T, index: number) => boolean` | 是 |
| `isRestoringThread` | `() => boolean` | 是 |
| `measureItem` | `(item: T, index: number, el: Element \| { $el?: Element \| null \| undefined; } \| null \| undefined) => void` | 是 |
| `unobserveItem` | `(key: string) => void` | 是 |
| `releaseDetached` | `() => number` | 是 |
| `markdownProps` | `(item: T, index: number) => MarkstreamVirtualMarkdownProps` | 是 |
| `captureThreadState` | `() => MarkstreamThreadVirtualState` | 是 |
| `preloadThreadState` | `(state: MarkstreamThreadVirtualState \| null \| undefined) => void` | 是 |
| `restoreThreadState` | `(state: MarkstreamThreadVirtualState \| null \| undefined) => void` | 是 |
| `dispose` | `() => void` | 是 |

### MarkstreamVirtualTimelineHandle

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `captureThreadState` | `() => MarkstreamThreadVirtualState` | 是 |
| `restoreThreadState` | `(state: MarkstreamThreadVirtualState) => void` | 是 |
| `scrollToBottom` | `() => void` | 是 |
| `scrollToIndex` | `(index: number, align?: "start" \| "center" \| "end" \| undefined) => void` | 是 |
| `scrollToOffset` | `(offset: number) => void` | 是 |
| `getItemSize` | `(key: string) => number \| undefined` | 是 |
| `getTotalHeight` | `() => number` | 是 |
| `getVisibleRange` | `() => { start: number; end: number; }` | 是 |

启用 virtualScroll 时需要 enabled=true 和 sessionKey；scrollRoot 可为元素、Solid accessor 或返回元素的 resolver。单独 heightCache 必须同时有 width。默认 emitIntervalMs=16、heightDiffThresholdPx=1、settleMode 按配置选择，保持 session/thread/measurementKey 与布局匹配。

### MarkstreamVirtualScrollOptions

| 参数 | 类型 | 必需 |
| --- | --- | --- |
| `scrollRoot` | `MarkstreamScrollRootLike \| MarkstreamScrollRootResolver` | — |
| `threadKey` | `string \| undefined` | — |
| `restoreState` | `MarkstreamVirtualState \| null \| undefined` | — |
| `restoreAnchor` | `string \| number \| boolean \| undefined` | — |
| `measurementKey` | `string \| number \| undefined` | — |
| `settleMode` | `"manual" \| "auto" \| undefined` | — |
| `settledToken` | `string \| number \| boolean \| undefined` | — |
| `emitIntervalMs` | `number \| undefined` | — |
| `heightDiffThresholdPx` | `number \| undefined` | — |
| `heightCacheLimit` | `number \| undefined` | — |

## 全部运行时导出索引

每个运行时导出均列出签名或类型；名称匹配不能替代行为验证。

| 导出 | 调用签名 / 值类型 |
| --- | --- |
| `AdmonitionNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `applyContainers` | `(md: MarkdownIt): void` |
| `applyMath` | `(md: MarkdownIt, mathOpts?: MathOptions \| undefined): void` |
| `BLOCK_HTML_TAG_NAMES` | `readonly ["article", "aside", "blockquote", "details", "div", "figcaption", "figure", "footer", "header", "h1", "h2", "h3", "h4", "h5", "h6", "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "th", "thead", "tr", "ul"]` |
| `BLOCKED_HTML_TAG_NAMES` | `readonly ["script"]` |
| `BLOCKED_HTML_TAGS` | `Set<string>` |
| `BlockquoteNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `buildKaTeXCDNWorkerSource` | `(options: KaTeXCDNWorkerOptions): string` |
| `buildMermaidCDNWorkerSource` | `(options: MermaidCDNWorkerOptions): string` |
| `canParseOffthread` | `(code: string, theme: Theme, timeout?: number): Promise<boolean>` |
| `CheckboxNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `clearGlobalCustomComponents` | `(): void` |
| `clearKaTeXWorker` | `(): void` |
| `clearMermaidWorker` | `(): void` |
| `clearRegisteredMarkdownPlugins` | `(): void` |
| `clearStreamDiffsWorkerPool` | `(): void` |
| `CodeBlockNode` | `(input: SolidCodeBlockNodeProps): Element` |
| `convertHtmlAttrsToProps` | `(attrs: Record<string, string>): Record<string, HtmlPropValue>` |
| `convertHtmlPropValue` | `(value: string, key: string): HtmlPropValue` |
| `createKaTeXWorkerFromCDN` | `(options: KaTeXCDNWorkerOptions): KaTeXCDNWorkerHandle` |
| `createMermaidWorkerFromCDN` | `(options: MermaidCDNWorkerOptions): MermaidCDNWorkerHandle` |
| `D2BlockNode` | `(props: D2BlockNodeProps & Omit<NodeComponentProps<SolidRenderableNode>, "node"> & DiagramEvents): Element` |
| `DANGEROUS_HTML_ATTR_NAMES` | `readonly ["onclick", "onerror", "onload", "onmouseover", "onmouseout", "onmousedown", "onmouseup", "onkeydown", "onkeyup", "onfocus", "onblur", "onsubmit", "onreset", "onchange", "onselect", "ondblclick", "ontouchstart", "ontouchend", "ontouchmove", "ontouchcancel", "onwheel", "onscroll", "oncopy", "oncut", "onpaste", "oninput", "oninvalid", "onsearch", "innerhtml", "outerhtml", "textcontent", "innertext", "srcdoc", "ping"]` |
| `DANGEROUS_HTML_ATTRS` | `Set<string>` |
| `default` | `(input: MarkdownRenderProps): Element` |
| `defaultRByClass` | `(cls: "simple" \| "medium" \| "complex"): number` |
| `defineHtmlComponents` | `<T extends HtmlComponentMap>(components: T): T` |
| `defineStreamingComponents` | `<T extends StreamingComponentMap>(components: T): T` |
| `DefinitionListNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `disableD2` | `(): void` |
| `disableInfographic` | `(): void` |
| `disableKatex` | `(): void` |
| `disableMermaid` | `(): void` |
| `disablePerfMonitoring` | `(): void` |
| `EmojiNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `EmphasisNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `enableD2` | `(loader?: D2Loader \| undefined): void` |
| `enableInfographic` | `(loader: InfographicLoader): void` |
| `enableKatex` | `(loader?: KatexLoader \| undefined): void` |
| `enableMermaid` | `(loader?: MermaidLoader \| undefined): void` |
| `enablePerfMonitoring` | `(): void` |
| `ESCAPED_TEX_BRACE_COMMANDS` | `string` |
| `estimateMarkstreamTimelineItemHeight` | `<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, "getKind" \| "getContent" \| "estimateItemHeight">): number` |
| `estimateRByFormula` | `(sample: string): "simple" \| "medium" \| "complex"` |
| `EXTENDED_STANDARD_HTML_TAG_NAMES` | `readonly ["address", "audio", "body", "canvas", "caption", "colgroup", "datalist", "dd", "dialog", "dl", "dt", "fieldset", "form", "head", "hgroup", "html", "iframe", "legend", "map", "menu", "meter", "noscript", "object", "optgroup", "option", "output", "picture", "progress", "rp", "rt", "ruby", "script", "select", "style", "template", "textarea", "tfoot", "title", "video"]` |
| `EXTENDED_STANDARD_HTML_TAGS` | `Set<string>` |
| `FallbackComponent` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `findMatchingClose` | `(src: string, startIdx: number, open: string, close: string): number` |
| `findPrefixOffthread` | `(code: string, theme: Theme, timeout?: number): Promise<string \| null>` |
| `FootnoteAnchorNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `FootnoteNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `FootnoteReferenceNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `getCustomComponentDisplay` | `(component?: Component<any> \| null \| undefined): CustomComponentDisplayMode \| undefined` |
| `getCustomNodeComponents` | `(id?: string \| undefined): CustomComponentMap` |
| `getHtmlTagFromContent` | `(html: unknown): string` |
| `getKaTeXBackpressureDefaults` | `(): { timeout: number; waitTimeout: number; backoffMs: number; maxRetries: number; }` |
| `getKaTeXWorkerLoad` | `(): { inFlight: number; max: number; }` |
| `getLanguageIcon` | `(lang: string): string` |
| `getMarkdown` | `(msgId?: string \| undefined, options?: GetMarkdownOptions \| undefined): MarkdownIt` |
| `getMarkstreamTimelineItemContent` | `<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, "getContent">): string` |
| `getMarkstreamTimelineItemFinal` | `<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, "getFinal">): boolean` |
| `getMarkstreamTimelineItemKey` | `<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, "getKey">): string` |
| `getMarkstreamTimelineItemKind` | `<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, "getKind">): string` |
| `getMarkstreamTimelineItemRevision` | `<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, "getRevision">): MarkstreamTimelineItemKey \| undefined` |
| `getMermaidWorkerLoad` | `(): { inFlight: number; max: number; }` |
| `getPerfReport` | `(): { totalRenders: number; cacheHitRate: number; averageWorkerTime: number; averageDirectTime: number; averageCacheHitTime: number; workerSavings: number; recommendation: string; cacheHits?: undefined; workerCalls?: undefined; directCalls?: undefined; } \| { totalRenders: number; cacheHits: number; cacheHitRate: string; workerCalls: number; directCalls: number; averageWorkerTime: string; averageDirectTime: string; averageCacheHitTime: string; workerSavings: string; recommendation: string; }` |
| `getRegisteredThemes` | `(): string[]` |
| `getStreamDiffsWorkerPool` | `(): StreamDiffsWorkerPoolLike \| null` |
| `HardBreakNode` | `(): Element` |
| `hasCompleteHtmlTagContent` | `(html: unknown, tag: string): boolean` |
| `hasCustomHtmlComponents` | `(content: string, customComponents: Record<string, unknown>): boolean` |
| `HeadingNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `HighlightNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `HtmlBlockNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `HtmlInlineNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `HtmlPreviewFrame` | `(props: HtmlPreviewFrameProps): Element` |
| `ImageNode` | `(props: ImageNodeProps & Omit<NodeComponentProps<SolidRenderableNode>, "node"> & { onLoad?: ((src: string) => void) \| undefined; onError?: ((src: string) => void) \| undefined; onClick?: ((payload: [Event, string]) => void) \| undefined; }): Element` |
| `InfographicBlockNode` | `(props: InfographicBlockNodeProps & Omit<NodeComponentProps<SolidRenderableNode>, "node"> & DiagramEvents): Element` |
| `INLINE_HTML_TAG_NAMES` | `readonly ["a", "abbr", "b", "bdi", "bdo", "button", "cite", "code", "data", "del", "dfn", "em", "font", "i", "ins", "kbd", "label", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var"]` |
| `InlineCodeNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `InsertNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `isBrokenMermaidSvg` | `(svg: string \| null \| undefined): boolean` |
| `isCodeBlockRuntimeReady` | `(): boolean` |
| `isCustomHtmlComponentTag` | `(tagName: string, customComponents: Record<string, unknown>): boolean` |
| `isD2Enabled` | `(): boolean` |
| `isHtmlLikeTagName` | `(tag: string): boolean` |
| `isHtmlTagBlocked` | `(tagName: string \| undefined, policy?: HtmlPolicy \| undefined): boolean` |
| `isHtmlTagHardBlocked` | `(tagName: string \| undefined, policy?: HtmlPolicy \| undefined): boolean` |
| `isInfographicEnabled` | `(): boolean` |
| `isKatexEnabled` | `(): boolean` |
| `isKaTeXWorkerBusy` | `(): boolean` |
| `isMarkstreamMarkdownTimelineItem` | `<T>(item: T, index: number, options: Pick<UseMarkstreamVirtualAdapterOptions<T>, "getKind" \| "getContent">): boolean` |
| `isMathLike` | `(s: string): boolean` |
| `isMermaidEnabled` | `(): boolean` |
| `isUnsafeHtmlUrl` | `(value: string, context?: HtmlUrlContext \| undefined): boolean` |
| `KATEX_COMMANDS` | `string[]` |
| `languageIconsRevision` | `(): number` |
| `languageMap` | `Record<string, string>` |
| `LinkNode` | `(props: LinkNodeProps & Omit<NodeComponentProps<SolidRenderableNode>, "node" \| "indexKey">): Element` |
| `ListItemNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `ListNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `MarkdownRender` | `(input: MarkdownRenderProps): Element` |
| `MARKSTREAM_NODE_LIFECYCLE_KEY` | `Context<MarkstreamNodeLifecycle \| undefined>` |
| `MarkstreamProvider` | `(props: MarkstreamSolidOptions & { children?: Element; }): Element` |
| `MarkstreamVirtualTimeline` | `<T = MarkstreamTimelineItem>(props: MarkstreamVirtualTimelineProps<T> & { class?: string \| undefined; style?: CSSProperties \| undefined; ref?: ((handle: MarkstreamVirtualTimelineHandle) => void) \| undefined; renderItem?: ((item: T, index: number) => Element) \| undefined; onHeightChange?: ((payload: { itemKey: string; metrics: MarkstreamVirtualMetrics; }) => void) \| undefined; onVirtualStateChange?: ((payload: { itemKey: string; state: MarkstreamVirtualState; }) => void) \| undefined; onThreadStateChange?: ((state: MarkstreamThreadVirtualState) => void) \| undefined; onRangeChange?: ((range: { start: number; end: number; }) => void) \| undefined; }): Element` |
| `MathBlockNode` | `(props: MathBlockNodeProps & Omit<NodeComponentProps<SolidRenderableNode>, "node">): Element` |
| `MathInlineNode` | `(props: MathInlineNodeProps & Omit<NodeComponentProps<SolidRenderableNode>, "node">): Element` |
| `mergeCustomHtmlTags` | `(...lists: (readonly string[] \| undefined)[]): string[]` |
| `MERMAID_DISABLED_CODE` | `"MERMAID_DISABLED"` |
| `MERMAID_WORKER_BUSY_CODE` | `"WORKER_BUSY"` |
| `MermaidBlockNode` | `(props: MermaidBlockNodeProps & Omit<NodeComponentProps<SolidRenderableNode>, "node"> & DiagramEvents): Element` |
| `NodeRenderer` | `(input: MarkdownRenderProps): Element` |
| `NON_STRUCTURING_HTML_TAG_NAMES` | `readonly ["pre", "iframe", "picture", "script", "style", "table", "tbody", "td", "tfoot", "th", "thead", "textarea", "tr", "title", "video"]` |
| `NON_STRUCTURING_HTML_TAGS` | `Set<string>` |
| `normalizeCustomHtmlTagName` | `(value: unknown): string` |
| `normalizeCustomHtmlTags` | `(tags?: readonly string[] \| undefined): string[]` |
| `normalizeLanguageIdentifier` | `(lang?: string \| null \| undefined): string` |
| `normalizeStandaloneBackslashT` | `(s: string, opts?: MathOptions \| undefined): string` |
| `ParagraphNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `parseFenceToken` | `(token: MarkdownToken): CodeBlockNode` |
| `parseInlineTokens` | `(tokens: MarkdownToken[], raw?: string \| undefined, pPreToken?: MarkdownToken \| undefined, options?: ParseOptions \| undefined): ParsedNode[]` |
| `parseMarkdownToStructure` | `(markdown: string, md: MarkdownIt, options?: ParseOptions \| undefined): ParsedNode[]` |
| `perfMonitor` | `PerformanceMonitor` |
| `PreCodeNode` | `(props: PreCodeNodeProps & Omit<NodeComponentProps<SolidRenderableNode>, "node"> & { codeBlockOptions?: CodeBlockOptions \| undefined; themeName?: string \| undefined; class?: string \| undefined; style?: CSSProperties \| undefined; }): Element` |
| `preloadCodeBlockRuntime` | `(): Promise<boolean>` |
| `preloadExtendedLanguageIcons` | `(): Promise<void>` |
| `processTokens` | `(tokens: MarkdownToken[], options?: ParseOptions \| undefined): ParsedNode[]` |
| `recommendNForSamples` | `(formulas: string[], opts?: { H?: number \| undefined; B?: number \| undefined; } \| undefined): number` |
| `recommendWorkerThreshold` | `({ R, H, B }: ThresholdInput): number` |
| `ReferenceNode` | `(props: ReferenceNodeProps & Omit<NodeComponentProps<SolidRenderableNode>, "node">): Element` |
| `registerIconTheme` | `(theme: IconTheme): void` |
| `registerMarkdownPlugin` | `(plugin: MarkdownPluginRegistration<any[]>): void` |
| `removeCustomComponents` | `(id: string): void` |
| `RenderChildren` | `(props: NodeComponentProps<SolidRenderableNode> & { nodes?: readonly SolidRenderableNode[] \| undefined; }): Element` |
| `renderKaTeXInWorker` | `(content: string, displayMode?: boolean, timeout?: number, signal?: AbortSignal \| undefined): Promise<string>` |
| `renderKaTeXWithBackpressure` | `(content: string, displayMode?: boolean, options?: BackpressureOptions): Promise<string>` |
| `renderMarkdownNodesToHtml` | `(nodes: readonly RenderableMarkdownNode[] \| null \| undefined, options?: NestedMarkdownHtmlOptions): string` |
| `renderMarkdownToHtml` | `(input: MarkstreamSolidRenderOptions): string` |
| `renderNestedMarkdownToHtml` | `(input: NestedMarkdownHtmlInput, options?: NestedMarkdownHtmlOptions): string` |
| `RenderNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `resolveCustomHtmlTags` | `(tags?: readonly string[] \| undefined): { key: string; tags: string[]; }` |
| `resolveLanguageId` | `(lang?: string \| null \| undefined): string` |
| `SAFE_ALLOWED_HTML_TAGS` | `Set<string>` |
| `safeCancelRaf` | `(id: number \| null): void` |
| `safeRaf` | `(cb: FrameRequestCallback): any` |
| `sanitizeHtmlAttrs` | `(attrs: Record<string, string>, policy?: HtmlPolicy \| undefined, tagName?: string \| undefined): Record<string, string>` |
| `sanitizeHtmlContent` | `(content: string, policy?: HtmlPolicy \| undefined): string` |
| `sanitizeHtmlTokenAttrs` | `(attrs?: [string, string \| null][] \| null \| undefined, policy?: HtmlPolicy \| undefined, tagName?: string \| undefined): [string, string][] \| undefined` |
| `sanitizeImageSrc` | `(value: unknown): string` |
| `sanitizeMermaidSvg` | `(svg: string \| null \| undefined): string \| null` |
| `setCustomComponents` | `(mapping: CustomComponentMap): void; (id: string, mapping: CustomComponentMap): void` |
| `setD2Loader` | `(loader: D2Loader \| null): void` |
| `setDefaultI18nMap` | `(map: Partial<Record<string, string>>): void` |
| `setDefaultMathOptions` | `(opts: MathOptions \| undefined): void` |
| `setIconTheme` | `(id: string): void` |
| `setInfographicLoader` | `(loader?: InfographicLoader \| null \| undefined): void` |
| `setKaTeXBackpressureDefaults` | `(options: Partial<{ timeout: number; waitTimeout: number; backoffMs: number; maxRetries: number; }>): void` |
| `setKaTeXCache` | `(content: string, displayMode: boolean \| undefined, html: string): void` |
| `setKatexLoader` | `(loader: KatexLoader \| null): void` |
| `setKaTeXWorker` | `(nextWorker: Worker): void` |
| `setKaTeXWorkerDebug` | `(enabled: boolean): void` |
| `setKaTeXWorkerMaxConcurrency` | `(value: number): void` |
| `setLanguageIconResolver` | `(resolver?: LanguageIconResolver \| null \| undefined): void` |
| `setMermaidLoader` | `(loader: MermaidLoader \| null): void` |
| `setMermaidWorker` | `(nextWorker: Worker): void` |
| `setMermaidWorkerClientDebug` | `(enabled: boolean): void` |
| `setMermaidWorkerMaxConcurrency` | `(value: number): void` |
| `setStreamDiffsWorkerPool` | `(pool: StreamDiffsWorkerPoolLike \| null \| undefined): void` |
| `shouldOpenLinkInNewTab` | `(href: string \| null \| undefined): boolean` |
| `shouldRenderUnknownHtmlTagAsText` | `(html: unknown, tag: string): boolean` |
| `STANDARD_BLOCK_HTML_TAGS` | `Set<string>` |
| `STANDARD_HTML_TAGS` | `Set<string>` |
| `StrikethroughNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `stripCustomHtmlWrapper` | `(html: unknown, tag: string): string` |
| `stripHtmlControlAndWhitespace` | `(value: string): string` |
| `StrongNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `SubscriptNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `SuperscriptNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `SVG_HTML_TAG_NAMES` | `readonly ["svg", "g", "path"]` |
| `syncStreamDiffsWorkerTheme` | `(theme: string \| { dark: string; light: string; }): Promise<void>` |
| `TableNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `terminateStreamDiffsWorkerPool` | `(): void` |
| `terminateWorker` | `(): void` |
| `TEX_BRACE_COMMANDS` | `string[]` |
| `TextNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `ThematicBreakNode` | `(): Element` |
| `tokenAttrsToRecord` | `(attrs?: [string, string \| null][] \| null \| undefined): Record<string, string>` |
| `tokenizeHtml` | `(html: string): HtmlToken[]` |
| `Tooltip` | `(props: TooltipProps): Element` |
| `toSafeMermaidSvgMarkup` | `(svg: string \| null \| undefined): string` |
| `toSafeSvgElement` | `<TElement = unknown>(svg: string \| null \| undefined): TElement \| null` |
| `URL_HTML_ATTR_NAMES` | `readonly ["action", "data", "href", "src", "srcset", "poster", "xlink:href", "formaction"]` |
| `URL_HTML_ATTRS` | `Set<string>` |
| `useMarkstreamNodeLifecycle` | `(): MarkstreamNodeLifecycle \| null` |
| `useMarkstreamVirtualAdapter` | `<T = MarkstreamTimelineItem>(options: UseMarkstreamVirtualAdapterOptions<T>): MarkstreamVirtualAdapterController<T>` |
| `useSmoothMarkdownStream` | `(options?: SmoothMarkdownStreamOptions \| undefined): { snapshot: Accessor<SmoothMarkdownStreamSnapshot>; source: () => string; visible: () => string; done: () => boolean; final: () => boolean; caughtUp: () => boolean; pendingChars: () => number; getSnapshot: () => SmoothMarkdownStreamSnapshot; subscribe: (listener: SmoothStreamNotify) => () => void; enqueue: (chunk: string) => void; finish: (options?: { flush?: boolean \| undefined; } \| undefined) => void; flush: () => void; reset: (initialMarkdown?: string \| undefined) => void; pause: () => void; resume: () => void; destroy: () => void; dispose: () => void; }` |
| `VmrContainerNode` | `(props: NodeComponentProps<SolidRenderableNode>): Element` |
| `VOID_HTML_TAG_NAMES` | `readonly ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]` |
| `VOID_HTML_TAGS` | `Set<string>` |
| `waitForKaTeXWorkerSlot` | `(timeout?: number, signal?: AbortSignal \| undefined): Promise<void>` |
| `withMarkstreamComponentDisplay` | `<T extends Component<any>>(component: T, display: CustomComponentDisplayMode): T & { markstreamDisplay: CustomComponentDisplayMode; }` |
| `WORKER_BUSY_CODE` | `"WORKER_BUSY"` |
