---
title: SolidJS component and API reference
description: Complete markstream-solid component props, callbacks, mode defaults, stream and virtual APIs, emitted workers, SSR boundaries and runtime export signatures.
lastUpdated: "2026-10-31T00:00:00+08:00"
keywords:
  - markstream-solid API
  - SolidJS components
  - SolidJS Markdown props
  - SolidJS workers
---

# Solid components and API reference

This page covers every runtime export of `markstream-solid`, standalone node components, renderer props, callbacks and handles. Start with [the Solid guide](/guide/solid) for installation. Package presence/type signatures and runtime parity are separate checks; behavioral tests cover callbacks, timing, scoped math heights, layout, streaming and restoration.

## Bindings and styles

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

Use camelCase props/callbacks, callback refs and reactive property reads. Vue emits become callbacks and slots become JSX/render functions. Wrap basic standalone nodes in `.markstream-solid` (and `.dark` when needed); import exactly one renderer CSS entry after resets. KaTeX additionally requires `katex/dist/katex.min.css`. Direct low-level nodes expect the corresponding parser AST shape, including `raw`; use the shared parser rather than recreating its tree. `ComponentProps<typeof Component>` is the authoritative TSX prop type.

## Renderer

`default`, `MarkdownRender` and `NodeRenderer` refer to the same component. Non-empty `nodes` take priority; empty/null arrays fall back to `content`. `final` marks completed input; render-final additionally waits for the selected settling policy. Replacement resets stream/measurement state. For full immediate DOM restore, disable smooth streaming, batching, live windows, viewport priority and node deferral; otherwise retain windowing for large documents.

| Mode | fade/tooltips | initial/next batch | delay/budget/idle ms | live/buffer |
| --- | --- | --- | --- | --- |
| docs (default) | true/true | 40/80 | 16/6/120 | 220/60 |
| chat | false/false | 32/48 | 6/8/60 | 0/0 |
| minimal | false/false | 32/48 | 6/8/60 | 0/0 |

Other defaults: `htmlPolicy='safe'`, `isDark=false`, `domMode='full'`, `typewriter=false`, `smoothStreaming='auto'`, parse coalescing 80ms when pacing, `codeBlockStream=true`, `renderCodeBlocksAsPre=false`, `viewportPriority=true`, `nodeVirtual='auto'`. Explicit props override modes. Completed chat/minimal content may automatically window when live limits were omitted; explicit `maxLiveNodes=0` disables it. Completed non-coordinated content restores immediately even when batching is enabled; coordinated unfinished history can batch. Smooth options are read on creation: remount to change the controller configuration. Stable/advanced/internal tiers follow [renderer options](/guide/props), using camelCase in Solid.

The full inherited `MarkdownRenderProps` contract follows. Optional props without a mode/default above are omitted, inherited from context or delegated to the selected runtime. `class` takes priority over `className`; `style` uses Solid CSS properties.
| Prop | Type | Required |
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
## Components

The following common props are used by basic nodes and RenderNode/RenderChildren. `node` is required for node components; context/ctx are supplied to custom components by the renderer. A standalone `HardBreakNode` or `ThematicBreakNode` needs no node. Local event handlers are listed on specialized components below; event bubbling is not a replacement for component callbacks.
| Prop | Type | Required |
| --- | --- | --- |
| `node` | `TNode` | yes |
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

| Component | node.type | AST fields | TSX |
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

`RenderNode` renders one node; `RenderChildren` renders its children or explicit nodes. Use `<RenderChildren {...props} />` inside custom components to preserve context/events. Basic nodes have no extra toggles; ordered/start select list behavior, kind/title/collapsible/open select admonition behavior, tables provide column resizing, and footnote/anchor navigation stays in the renderer scope.

### CodeBlockNode

Optional stream-diffs peer; otherwise native pre fallback. Header/copy/collapse/expand/font/preview toggles default true, fontSize=12, maxHeight=500, themes=vitesse-dark/vitesse-light. HTML preview scripts are disabled by default. Additional Solid props: headerLeft/headerRight (JSX or functions), onCopy(code), onPreviewCode(payload). onCopy also forwards renderer copy handlers.

| Prop | Type | Required |
| --- | --- | --- |
| `node` | `CodeBlockNode` | yes |
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

No editor peer. Standalone line numbers default off; fenced wrappers enable them by default. diffInline selects unified layout; diffHideUnchangedRegions accepts a boolean or collapse options. reservedHeightPx reserves asynchronous fallback space.

| Prop | Type | Required |
| --- | --- | --- |
| `node` | `CodeBlockNode` | yes |
| `loading` | `boolean \| undefined` | — |
| `showLineNumbers` | `boolean \| undefined` | — |
| `diffInline` | `boolean \| undefined` | — |
| `diffHideUnchangedRegions` | `CodeBlockDiffHideUnchangedRegions \| undefined` | — |
| `reservedHeightPx` | `number \| undefined` | — |

### CodeBlockOptions

Runtime fields are forwarded to stream-diffs. Font/theme/language/header, reveal/disposal and stream ownership stay with the host. Unset runtime fields use the installed runtime defaults; shared typography/layout details are in the code-block runtime guide.

| Prop | Type | Required |
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

Peer mermaid. maxHeight=500px, estimate=360px unless supplied, header/action toggles=true, isStrict=true, interactions=false, fitPreviewHeight=false, renderDebounceMs=300, contentStableDelayMs=500, preview polling=800ms/4000ms/12 attempts (minimum 120ms, 1.5 backoff). onCopy/onExport/onOpenModal receive cancelable MermaidBlockEvent; onToggleMode receives (mode,event). Call event.preventDefault(). onRenderError may return true to suppress default error display.

| Prop | Type | Required |
| --- | --- | --- |
| `node` | `CodeBlockNode` | yes |
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

Peer @terrastruct/d2. source/preview/copy/export/collapse; maxHeight=500px, progressive rendering is opt-in, interval=400ms. Theme ids are forwarded to D2.

| Prop | Type | Required |
| --- | --- | --- |
| `node` | `CodeBlockNode` | yes |
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

Peer @antv/infographic plus enableInfographic loader. Source/preview/copy/export/collapse/zoom/pan/fullscreen; header/actions default true, maxHeight=500px.

| Prop | Type | Required |
| --- | --- | --- |
| `node` | `CodeBlockNode` | yes |
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

Peer katex and its CSS. cacheScope + indexKey names the renderer-owned pending min-height cache; scope defaults to the renderer session. Only renderer descendants share its cache; standalone math retains local pending height. It is not a global HTML/macro cache. Successful rendering clears the pending reservation. Worker backpressure timeout/wait/retry are 3000/2000ms/8.

| Prop | Type | Required |
| --- | --- | --- |
| `node` | `{ type: "math_block"; content: string; raw: string; loading?: boolean \| undefined; }` | yes |
| `indexKey` | `string \| number \| undefined` | — |
| `cacheScope` | `string \| number \| undefined` | — |

### MathInlineNode

Peer katex and CSS; markup=$$ uses display mode. Worker timeout/wait/retry=1500/1500ms/8. Source changes cancel stale requests, streaming calls coalesce for 32ms.

| Prop | Type | Required |
| --- | --- | --- |
| `node` | `{ type: "math_inline"; content: string; raw: string; loading?: boolean \| undefined; markup?: string \| undefined; }` | yes |

### ImageNode

fallbackSrc omitted, lazy=false, usePlaceholder=true. onLoad(src), onError(src), onClick([event,src]); click fires only for a loaded image. Requests respect node.loading and viewport deferral. The 8s lifecycle deadline releases settling without turning a slow request into an image error; metadata-only updates preserve the loaded URL.

| Prop | Type | Required |
| --- | --- | --- |
| `node` | `{ type: "image"; src: string; alt: string; title: string \| null; raw: string; loading?: boolean \| undefined; }` | yes |
| `fallbackSrc` | `string \| undefined` | — |
| `lazy` | `boolean \| undefined` | — |
| `usePlaceholder` | `boolean \| undefined` | — |

### LinkNode

showTooltip=true, underlineHeight=2px, bottom=-3px, animation=1.6s/0.35/ease-in-out/infinite. URLs/attrs are sanitized, incomplete links omit href; external blank targets include noopener/noreferrer.

| Prop | Type | Required |
| --- | --- | --- |
| `node` | `{ type: "link"; href: string; title: string \| null; text: string; attrs?: [string, string][] \| undefined; children: { type: string; raw: string; }[]; raw: string; loading?: boolean \| undefined; markup?: string \| undefined; }` | yes |
| `indexKey` | `string \| number` | yes |
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

click/enter/leave callbacks receive (event,id,messageId,threadId), with id normalized to string. messageId/threadId are optional host context.

| Prop | Type | Required |
| --- | --- | --- |
| `node` | `{ type: "reference"; id: string \| number; raw?: string \| undefined; }` | yes |
| `messageId` | `string \| undefined` | — |
| `threadId` | `string \| undefined` | — |
| `onClick` | `((event: MouseEvent, id: string, messageId?: string \| undefined, threadId?: string \| undefined) => void) \| undefined` | — |
| `onMouseEnter` | `((event: MouseEvent, id: string, messageId?: string \| undefined, threadId?: string \| undefined) => void) \| undefined` | — |
| `onMouseLeave` | `((event: MouseEvent, id: string, messageId?: string \| undefined, threadId?: string \| undefined) => void) \| undefined` | — |

### Tooltip

Browser Portal; placement=top, offset=6. anchorEl may be null; visible controls rendering, id adds aria-describedby and is removed on cleanup.

| Prop | Type | Required |
| --- | --- | --- |
| `visible` | `boolean` | yes |
| `anchorEl` | `HTMLElement \| null` | yes |
| `content` | `string` | yes |
| `placement` | `"top" \| "bottom" \| "left" \| "right" \| undefined` | — |
| `offset` | `number \| undefined` | — |
| `originX` | `number \| null \| undefined` | — |
| `originY` | `number \| null \| undefined` | — |
| `id` | `string \| null \| undefined` | — |
| `isDark` | `boolean \| null \| undefined` | — |

### HtmlPreviewFrame

Browser Portal with srcdoc; sandbox defaults empty. htmlPreviewAllowScripts=true opts in, explicit htmlPreviewSandbox wins. Escape/backdrop/close invokes onClose; previous focus is restored.

| Prop | Type | Required |
| --- | --- | --- |
| `code` | `string` | yes |
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
## Callbacks, refs and configuration

`onCopy(code)` returns copied text; `onCopyCode({type:'copy',text})` is the structured variant. `onHandleArtifactClick(payload)` receives node, artifactType/title and id and takes ownership of HTML/SVG preview. Virtual callbacks are `onHeightChange(metrics)`, `onVirtualStateChange(state)`, `onAnchorChange(anchor)`, `onRenderSettled(metrics)` and `onRenderFinal(metrics)`. Root `onClick/onMouseover/onMouseout` receive DOM events.

A renderer callback ref receives: `getVirtualMetrics(reason?)`, `captureVirtualState(options?)`, `restoreVirtualState(state, options?)`, async `forceMeasure(reason?)`, async `settle({frames,timeoutMs,reason})` and `scrollToNode(index, 'start'|'center'|'end'|'nearest')`. Capture options include requireViewport, allowFallbackAnchor, includeEmptyState. Restore checks session/thread, width, measurementKey and node signatures; use restoreAnchor/allowUncapturedAnchor explicitly. Persist returned states, not hand-built height arrays. `virtualScroll.heightCache` requires `heightCacheWidth`.

`MarkstreamProvider` takes components/defaultI18nMap/languageIconResolver and children. `setCustomComponents(mapping)` or `setCustomComponents(id,mapping)` registers global/scoped overrides; `removeCustomComponents(id)` and `clearGlobalCustomComponents()` remove them. Local customComponents wins; provider/local scope is preferred for SSR requests. `defineStreamingComponents` and `defineHtmlComponents` preserve map typing. `withMarkstreamComponentDisplay(component,'block'|'inline')` marks layout boundaries; `getCustomComponentDisplay` reads them. Parser tags and sanitized HTML replacements are separate inputs. `setDefaultI18nMap` sets global fallback strings; use provider scope for isolation.

Icon APIs are `registerIconTheme`, `setIconTheme`, `getRegisteredThemes`, `setLanguageIconResolver`, `getLanguageIcon`, `preloadExtendedLanguageIcons`, `normalizeLanguageIdentifier` and `resolveLanguageId`. `getRegisteredThemes` returns icon themes, not code-editor themes; `languageMap` and `languageIconsRevision()` expose language labels/revision.

## Streaming controller

`useSmoothMarkdownStream(options?)` must run under a Solid owner. Accessors: `snapshot()`, `source()`, `visible()`, `done()`, `final()`, `caughtUp()`, `pendingChars()`. Commands: `enqueue(chunk)`, `finish({flush?})`, `flush()`, `reset(initial?,{prefixKnown?})`, `pause()`, `resume()`, `destroy()`/`dispose()`. `getSnapshot()` is a non-reactive snapshot; `subscribe(listener)` returns an unsubscribe function. Owner cleanup unsubscribes/destroys automatically. Set final parsing only after caughtUp; do not pace twice.

Options: minCharsPerSecond/maxCharsPerSecond, targetLatencyMs/catchUpLatencyMs/catchUpThreshold, maxCommitFps/startDelayMs/maxCharsPerCommit, flushOnFinish, burstInitialContent/burstRevealThresholdChars. See the shared controller types for numeric defaults; mode defaults affect the renderer separately.

## Virtual timeline and adapter

`MarkstreamVirtualTimeline<T>` uses items/getKey/getKind/getContent/getFinal/getRevision or the default id/kind/content/final/revision fields. With no kind, non-empty content is Markdown. Markdown rows use the built-in renderer; renderItem is the non-Markdown fallback. Other defaults: markdownMode=docs, markdownFade=false, overscanPx=1200, overscan=1, estimated Markdown height=360px, stickToBottom=auto, restoreMaxLoadingMs=false. The host must supply a bounded height. `layoutRevision` opts into explicit structural invalidation; increment it for key/kind/component/estimate changes.

Timeline callbacks: onHeightChange({itemKey,metrics}), onVirtualStateChange({itemKey,state}), onThreadStateChange(state), onRangeChange({start,end}). Ref methods: captureThreadState(), restoreThreadState(state), scrollToBottom(), scrollToIndex(index,align), scrollToOffset(offset), getItemSize(key), getTotalHeight(), getVisibleRange(). Restored measurement/session compatibility is enforced, and user navigation cancels stale measurement anchors.

`useMarkstreamVirtualAdapter(options)` connects an existing virtualizer. Supply getScrollElement/getScrollTop/setScrollTop/getViewportHeight/getTotalHeight/getItemOffset/getItemSize/setItemSize/getVisibleRange/scrollToOffset/scrollToIndex; measureElement is optional. Returned members: itemHeights, markdownStates, getItemKey, isMarkdownItem, isRestoringThread, measureItem, unobserveItem, releaseDetached, markdownProps, captureThreadState, preloadThreadState, restoreThreadState, dispose. Connect markdownProps callbacks to the nested renderer, and release detached measurements. Key/kind/content/final/revision/estimated-height helpers in the export index use the same adapter option extractors.

## Workers and optional integrations

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({ plugins: [solid({ ssr: true })], worker: { format: 'es' } })
```

```ts
// Browser entry; construct in onMount for SSR components.
import { setKaTeXWorker, setMermaidWorker } from 'markstream-solid'
import KatexWorker from 'markstream-solid/workers/katexRenderer.worker?worker'
import MermaidWorker from 'markstream-solid/workers/mermaidParser.worker?worker'

setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
```

File workers are required for Mermaid's split modules; the old inline example cannot resolve those chunks. The built worker modules retain imports and are bundled by the host. KaTeX renders inline/block math and includes mhchem; Mermaid worker parses/checks prefixes, while SVG rendering stays on the main thread. Add the relevant peers. Missing optional peers use documented raw/pre fallbacks; infographic is opt-in via enableInfographic(() => import('@antv/infographic')). Enable/disable/isEnabled/setLoader APIs exist for Katex, Mermaid, D2 and Infographic (note the exported casing Katex).

KaTeX client APIs: setKaTeXWorker, clearKaTeXWorker, renderKaTeXInWorker(content,displayMode=true,timeout=2000,signal?), renderKaTeXWithBackpressure(content,displayMode,options), waitForKaTeXWorkerSlot, isKaTeXWorkerBusy, getKaTeXWorkerLoad, setKaTeXWorkerMaxConcurrency, setKaTeXWorkerDebug, get/setKaTeXBackpressureDefaults and setKaTeXCache. Backpressure defaults are timeout=2000, waitTimeout=1500, backoffMs=30, maxRetries=1; calls also accept AbortSignal. Busy/timeout/init errors are distinct; component fallback policy handles them separately.

Mermaid client APIs: setMermaidWorker, clearMermaidWorker, canParseOffthread(code,theme,timeout=1400), findPrefixOffthread(code,theme,timeout=1400), getMermaidWorkerLoad, setMermaidWorkerMaxConcurrency, setMermaidWorkerClientDebug, terminateWorker. Theme is light/dark; prefix discovery may return null. Clear detaches a client; terminate/dispose is used when the owner is done with a worker.

CDN APIs: buildKaTeXCDNWorkerSource / buildMermaidCDNWorkerSource return worker source. createKaTeXWorkerFromCDN / createMermaidWorkerFromCDN return {worker,source,dispose}; worker is null on the server. KaTeX options require katexUrl (optional mhchemUrl), mode classic/module (default classic), debug, workerOptions, renderOptions. Mermaid requires mermaidUrl, mode (default module), debug, workerOptions, initializeOptions. Supply absolute URLs with the matching UMD/ESM format; Blob workers require worker-src blob:, remote imports need CORS and the corresponding CSP. File workers use self-hosted assets instead.

Highlighting pools are host-owned: set/get/clear/terminateStreamDiffsWorkerPool and syncStreamDiffsWorkerTheme. A pool implements initialize/isWorkingPool/setRenderOptions/terminate; compatible SDK worker factories are provided by the installed highlighting runtime, not bundled into this package. preloadCodeBlockRuntime() warms the optional enhanced runtime; isCodeBlockRuntimeReady() reports it.

## HTML, lifecycle and utilities

renderMarkdownToHtml({content,nodes,final,parseOptions,customHtmlTags,allowHtml,htmlPolicy}), renderMarkdownNodesToHtml(nodes,options?) and renderNestedMarkdownToHtml(input,options?) return HTML strings. They do not mount Solid components or run enhancements. Keep htmlPolicy=safe for untrusted input. Public shared parser/security helpers and constants are listed below and covered in [API](/guide/api), [parser usage](/guide/parser-api) and [security](/guide/security).

`useMarkstreamNodeLifecycle()` returns the current lifecycle or null. Custom asynchronous components may call markPending(indexKey), markSettled(indexKey), reportHeight(indexKey,height); balance cleanup. MARKSTREAM_NODE_LIFECYCLE_KEY is the native Solid context, replacing Vue injection bindings.

Performance helpers: enablePerfMonitoring/disablePerfMonitoring, perfMonitor and getPerfReport. safeRaf/safeCancelRaf are browser scheduling helpers. recommendWorkerThreshold, estimateRByFormula, defaultRByClass, recommendNForSamples estimate math-worker thresholds; they do not create workers. Parsing policy is shared: ambiguous trailing footnote definitions wait during non-final input and flush correctly at completion.

## Configuration and virtual state types

Supplemental configuration/state/handle types follow. Runtime signatures are indexed afterwards; property/type coverage and runtime behavior are separate checks.

### MarkstreamSolidOptions

| Prop | Type | Required |
| --- | --- | --- |
| `components` | `CustomComponentMap \| undefined` | — |
| `defaultI18nMap` | `Partial<Record<string, string>> \| undefined` | — |
| `languageIconResolver` | `LanguageIconResolver \| null \| undefined` | — |

### MarkstreamVirtualMetrics

| Prop | Type | Required |
| --- | --- | --- |
| `sessionKey` | `string` | yes |
| `threadKey` | `string \| undefined` | — |
| `phase` | `MarkstreamVirtualPhase` | yes |
| `nodeCount` | `number` | yes |
| `liveRange` | `{ start: number; end: number; }` | yes |
| `renderedCount` | `number` | yes |
| `measuredCount` | `number` | yes |
| `estimatedCount` | `number` | yes |
| `averageNodeHeight` | `number` | yes |
| `topSpacerHeight` | `number` | yes |
| `bottomSpacerHeight` | `number` | yes |
| `visibleDomHeight` | `number` | yes |
| `totalHeight` | `number` | yes |
| `width` | `number` | yes |
| `final` | `boolean` | yes |
| `stable` | `boolean` | yes |
| `confidence` | `MarkstreamVirtualConfidence` | yes |
| `reason` | `MarkstreamVirtualReason` | yes |

### MarkstreamVirtualState

| Prop | Type | Required |
| --- | --- | --- |
| `sessionKey` | `string` | yes |
| `threadKey` | `string \| undefined` | — |
| `anchor` | `MarkstreamVirtualAnchor \| undefined` | — |
| `anchorCaptured` | `boolean \| undefined` | — |
| `metrics` | `MarkstreamVirtualMetrics` | yes |
| `width` | `number` | yes |
| `contentHash` | `string \| undefined` | — |
| `measurementKey` | `string \| undefined` | — |
| `heightCache` | `MarkstreamHeightCache \| undefined` | — |

### MarkstreamViewportPriorityOptions

| Prop | Type | Required |
| --- | --- | --- |
| `rootMargin` | `string \| undefined` | — |
| `heavyBlockMargin` | `string \| undefined` | — |
| `maxTargets` | `number \| undefined` | — |

### MarkstreamVirtualTimelineProps

| Prop | Type | Required |
| --- | --- | --- |
| `items` | `readonly T[]` | yes |
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

| Prop | Type | Required |
| --- | --- | --- |
| `getScrollElement` | `() => HTMLElement \| null` | yes |
| `getScrollTop` | `() => number` | yes |
| `setScrollTop` | `(value: number) => void` | yes |
| `getViewportHeight` | `() => number` | yes |
| `getTotalHeight` | `() => number` | yes |
| `getItemOffset` | `(key: string) => number` | yes |
| `getItemSize` | `(key: string) => number` | yes |
| `setItemSize` | `(key: string, size: number) => void` | yes |
| `getVisibleRange` | `() => MarkstreamVisibleRange` | yes |
| `scrollToOffset` | `(offset: number) => void` | yes |
| `scrollToIndex` | `(index: number, align?: "start" \| "center" \| "end" \| undefined) => void` | yes |
| `measureElement` | `((key: string, el: HTMLElement) => void) \| undefined` | — |

### UseMarkstreamVirtualAdapterOptions

| Prop | Type | Required |
| --- | --- | --- |
| `items` | `MaybeAccessor<readonly T[]>` | yes |
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
| `virtualizer` | `MarkstreamOuterVirtualizerAdapter` | yes |

### MarkstreamVirtualAdapterController

| Prop | Type | Required |
| --- | --- | --- |
| `itemHeights` | `Map<string, number>` | yes |
| `markdownStates` | `Map<string, MarkstreamVirtualState>` | yes |
| `getItemKey` | `(item: T, index: number) => string` | yes |
| `isMarkdownItem` | `(item: T, index: number) => boolean` | yes |
| `isRestoringThread` | `() => boolean` | yes |
| `measureItem` | `(item: T, index: number, el: Element \| { $el?: Element \| null \| undefined; } \| null \| undefined) => void` | yes |
| `unobserveItem` | `(key: string) => void` | yes |
| `releaseDetached` | `() => number` | yes |
| `markdownProps` | `(item: T, index: number) => MarkstreamVirtualMarkdownProps` | yes |
| `captureThreadState` | `() => MarkstreamThreadVirtualState` | yes |
| `preloadThreadState` | `(state: MarkstreamThreadVirtualState \| null \| undefined) => void` | yes |
| `restoreThreadState` | `(state: MarkstreamThreadVirtualState \| null \| undefined) => void` | yes |
| `dispose` | `() => void` | yes |

### MarkstreamVirtualTimelineHandle

| Prop | Type | Required |
| --- | --- | --- |
| `captureThreadState` | `() => MarkstreamThreadVirtualState` | yes |
| `restoreThreadState` | `(state: MarkstreamThreadVirtualState) => void` | yes |
| `scrollToBottom` | `() => void` | yes |
| `scrollToIndex` | `(index: number, align?: "start" \| "center" \| "end" \| undefined) => void` | yes |
| `scrollToOffset` | `(offset: number) => void` | yes |
| `getItemSize` | `(key: string) => number \| undefined` | yes |
| `getTotalHeight` | `() => number` | yes |
| `getVisibleRange` | `() => { start: number; end: number; }` | yes |

Enabled virtualScroll requires enabled=true and sessionKey. scrollRoot accepts an element, Solid accessor or resolver. A standalone heightCache requires its width. Defaults include emitIntervalMs=16 and heightDiffThresholdPx=1; keep session/thread/measurementKey compatible with layout and the selected settle policy.

### MarkstreamVirtualScrollOptions

| Prop | Type | Required |
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

## Full runtime export index

Every runtime export has a signature or value type below. Name coverage does not replace behavioral tests.

| Export | Call signature / value type |
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
