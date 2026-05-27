import type { CustomComponentMap as MarkstreamCustomComponentMap } from './customComponents'
import type { RenderContext as MarkstreamRenderContext, RenderNodeFn as MarkstreamRenderNodeFn } from './types'
import './index.css'
import './workers/katexRenderer.worker?worker'
import './workers/mermaidParser.worker?worker'

export { AdmonitionNode } from './components/AdmonitionNode/AdmonitionNode'
export { BlockquoteNode } from './components/BlockquoteNode/BlockquoteNode'
export { CheckboxNode } from './components/CheckboxNode/CheckboxNode'
export { CodeBlockNode } from './components/CodeBlockNode/CodeBlockNode'
export { CodeBlockNode as ReactCodeBlockNode } from './components/CodeBlockNode/CodeBlockNode'
export { HtmlPreviewFrame } from './components/CodeBlockNode/HtmlPreviewFrame'
export type { HtmlPreviewFrameProps } from './components/CodeBlockNode/HtmlPreviewFrame'
export type { D2Loader } from './components/D2BlockNode/d2'
export { disableD2, enableD2, isD2Enabled, setD2Loader } from './components/D2BlockNode/d2'
export { D2BlockNode } from './components/D2BlockNode/D2BlockNode'
export { DefinitionListNode } from './components/DefinitionListNode/DefinitionListNode'
export { EmojiNode } from './components/EmojiNode/EmojiNode'
export { EmphasisNode } from './components/EmphasisNode/EmphasisNode'
export { FootnoteAnchorNode } from './components/FootnoteAnchorNode/FootnoteAnchorNode'
export { FootnoteNode } from './components/FootnoteNode/FootnoteNode'
export { FootnoteReferenceNode } from './components/FootnoteReferenceNode/FootnoteReferenceNode'
export { HardBreakNode } from './components/HardBreakNode/HardBreakNode'
export { HeadingNode } from './components/HeadingNode/HeadingNode'
export { HighlightNode } from './components/HighlightNode/HighlightNode'
export { HtmlBlockNode } from './components/HtmlBlockNode/HtmlBlockNode'
export { HtmlInlineNode } from './components/HtmlInlineNode/HtmlInlineNode'
export { ImageNode } from './components/ImageNode/ImageNode'
export { InfographicBlockNode } from './components/InfographicBlockNode/InfographicBlockNode'
export { InlineCodeNode } from './components/InlineCodeNode/InlineCodeNode'
export { InsertNode } from './components/InsertNode/InsertNode'
export { LinkNode } from './components/LinkNode/LinkNode'
export type { LinkNodeStyleProps } from './components/LinkNode/LinkNode'
export { ListItemNode } from './components/ListItemNode/ListItemNode'
export type { ListItemNodeProps } from './components/ListItemNode/ListItemNode'
export { ListNode } from './components/ListNode/ListNode'
export { MarkdownCodeBlockNode } from './components/MarkdownCodeBlockNode/MarkdownCodeBlockNode'
export type { MarkdownCodeBlockNodeProps } from './components/MarkdownCodeBlockNode/MarkdownCodeBlockNode'
export { MathBlockNode } from './components/MathBlockNode/MathBlockNode'
export { MathInlineNode } from './components/MathInlineNode/MathInlineNode'
export { MermaidBlockNode } from './components/MermaidBlockNode/MermaidBlockNode'
export { NodeRenderer } from './components/NodeRenderer'
export { default } from './components/NodeRenderer'
export { FallbackComponent } from './components/NodeRenderer/FallbackComponent'
export { ParagraphNode } from './components/ParagraphNode/ParagraphNode'
export { PreCodeNode } from './components/PreCodeNode/PreCodeNode'
export { ReferenceNode } from './components/ReferenceNode/ReferenceNode'
export { StrikethroughNode } from './components/StrikethroughNode/StrikethroughNode'
export { StrongNode } from './components/StrongNode/StrongNode'
export { SubscriptNode } from './components/SubscriptNode/SubscriptNode'
export { SuperscriptNode } from './components/SuperscriptNode/SuperscriptNode'
export { TableNode } from './components/TableNode/TableNode'
export { TextNode } from './components/TextNode/TextNode'
export { ThematicBreakNode } from './components/ThematicBreakNode/ThematicBreakNode'
export { Tooltip } from './components/Tooltip/Tooltip'
export type { TooltipPlacement, TooltipProps } from './components/Tooltip/Tooltip'
export { VmrContainerNode } from './components/VmrContainerNode/VmrContainerNode'
export {
  clearGlobalCustomComponents,
  getCustomComponentDisplay,
  getCustomNodeComponents,
  removeCustomComponents,
  setCustomComponents,
  withMarkstreamComponentDisplay,
} from './customComponents'
export type {
  CustomComponentDisplayMode,
  MarkstreamCustomComponent,
} from './customComponents'
export { useSmoothMarkdownStream } from './hooks/useSmoothMarkdownStream'
export type {
  SmoothMarkdownStreamOptions,
  SmoothMarkdownStreamSnapshot,
} from './hooks/useSmoothMarkdownStream'
export * from './i18n/useSafeI18n'
export * from './renderers/renderNode'
export type { NodeRendererCodeBlockProps, NodeRendererProps } from './types'
export type {
  CodeBlockDiffAppearance,
  CodeBlockDiffHideUnchangedRegions,
  CodeBlockDiffHideUnchangedRegionsOptions,
  CodeBlockDiffHunkActionContext,
  CodeBlockDiffHunkActionKind,
  CodeBlockDiffHunkSide,
  CodeBlockDiffLineStyle,
  CodeBlockDiffUnchangedRegionStyle,
  CodeBlockMonacoLanguage,
  CodeBlockMonacoOptions,
  CodeBlockMonacoTheme,
  CodeBlockMonacoThemeObject,
  CodeBlockNodeProps,
  CodeBlockPreviewPayload,
  D2BlockNodeProps,
  ImageNodeProps,
  InfographicBlockNodeProps,
  LinkNodeProps,
  MathBlockNodeProps,
  MathInlineNodeProps,
  MermaidBlockEvent,
  MermaidBlockNodeProps,
  PreCodeNodeProps,
} from './types/component-props'
export type { NodeComponentProps } from './types/node-component'
export * from './utils/languageIcon'
export * from './workers/katexWorkerClient'

export * from './workers/mermaidWorkerClient'

export type CustomComponentMap = MarkstreamCustomComponentMap
export type RenderContext = MarkstreamRenderContext
export type RenderNodeFn = MarkstreamRenderNodeFn
