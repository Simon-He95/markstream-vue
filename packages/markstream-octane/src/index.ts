import type { CustomComponentMap as MarkstreamCustomComponentMap } from './customComponents'
import type { RenderContext as MarkstreamRenderContext, RenderNodeFn as MarkstreamRenderNodeFn } from './types'
import './workers/katexRenderer.worker?worker'
import './workers/mermaidParser.worker?worker'

export { AdmonitionNode } from './components/AdmonitionNode/AdmonitionNode.tsrx'
export { BlockquoteNode } from './components/BlockquoteNode/BlockquoteNode.tsrx'
export { CheckboxNode } from './components/CheckboxNode/CheckboxNode.tsrx'
export { CodeBlockNode } from './components/CodeBlockNode/CodeBlockNode.tsrx'
export { CodeBlockNode as OctaneCodeBlockNode } from './components/CodeBlockNode/CodeBlockNode.tsrx'
export { HtmlPreviewFrame } from './components/CodeBlockNode/HtmlPreviewFrame.tsrx'
export type { HtmlPreviewFrameProps } from './components/CodeBlockNode/HtmlPreviewFrame.tsrx'
export type { D2Loader } from './components/D2BlockNode/d2'
export { disableD2, enableD2, isD2Enabled, setD2Loader } from './components/D2BlockNode/d2'
export { D2BlockNode } from './components/D2BlockNode/D2BlockNode.tsrx'
export { DefinitionListNode } from './components/DefinitionListNode/DefinitionListNode.tsrx'
export { EmojiNode } from './components/EmojiNode/EmojiNode.tsrx'
export { EmphasisNode } from './components/EmphasisNode/EmphasisNode.tsrx'
export { FootnoteAnchorNode } from './components/FootnoteAnchorNode/FootnoteAnchorNode.tsrx'
export { FootnoteNode } from './components/FootnoteNode/FootnoteNode.tsrx'
export { FootnoteReferenceNode } from './components/FootnoteReferenceNode/FootnoteReferenceNode.tsrx'
export { HardBreakNode } from './components/HardBreakNode/HardBreakNode.tsrx'
export { HeadingNode } from './components/HeadingNode/HeadingNode.tsrx'
export { HighlightNode } from './components/HighlightNode/HighlightNode.tsrx'
export { HtmlBlockNode } from './components/HtmlBlockNode/HtmlBlockNode.tsrx'
export { HtmlInlineNode } from './components/HtmlInlineNode/HtmlInlineNode.tsrx'
export { ImageNode } from './components/ImageNode/ImageNode.tsrx'
export { InfographicBlockNode } from './components/InfographicBlockNode/InfographicBlockNode.tsrx'
export { InlineCodeNode } from './components/InlineCodeNode/InlineCodeNode.tsrx'
export { InsertNode } from './components/InsertNode/InsertNode.tsrx'
export { LinkNode } from './components/LinkNode/LinkNode.tsrx'
export type { LinkNodeStyleProps } from './components/LinkNode/LinkNode.tsrx'
export { ListItemNode } from './components/ListItemNode/ListItemNode.tsrx'
export type { ListItemNodeProps } from './components/ListItemNode/ListItemNode.tsrx'
export { ListNode } from './components/ListNode/ListNode.tsrx'
export { MathBlockNode } from './components/MathBlockNode/MathBlockNode.tsrx'
export { MathInlineNode } from './components/MathInlineNode/MathInlineNode.tsrx'
export { MermaidBlockNode } from './components/MermaidBlockNode/MermaidBlockNode.tsrx'
export { NodeRenderer } from './components/NodeRenderer.tsrx'
export { default } from './components/NodeRenderer.tsrx'
export { FallbackComponent } from './components/NodeRenderer/FallbackComponent.tsrx'
export { ParagraphNode } from './components/ParagraphNode/ParagraphNode.tsrx'
export { PreCodeNode } from './components/PreCodeNode/PreCodeNode.tsrx'
export { ReferenceNode } from './components/ReferenceNode/ReferenceNode.tsrx'
export { StrikethroughNode } from './components/StrikethroughNode/StrikethroughNode.tsrx'
export { StrongNode } from './components/StrongNode/StrongNode.tsrx'
export { SubscriptNode } from './components/SubscriptNode/SubscriptNode.tsrx'
export { SuperscriptNode } from './components/SuperscriptNode/SuperscriptNode.tsrx'
export { TableNode } from './components/TableNode/TableNode.tsrx'
export { TextNode } from './components/TextNode/TextNode.tsrx'
export { ThematicBreakNode } from './components/ThematicBreakNode/ThematicBreakNode.tsrx'
export { Tooltip } from './components/Tooltip/Tooltip.tsrx'
export type { TooltipPlacement, TooltipProps } from './components/Tooltip/Tooltip.tsrx'
export { VmrContainerNode } from './components/VmrContainerNode/VmrContainerNode.tsrx'
export {
  clearGlobalCustomComponents,
  defineHtmlComponents,
  defineStreamingComponents,
  getCustomComponentDisplay,
  getCustomNodeComponents,
  removeCustomComponents,
  setCustomComponents,
  withMarkstreamComponentDisplay,
} from './customComponents'
export type {
  CustomComponentDisplayMode,
  HtmlComponent,
  HtmlComponentMap,
  MarkstreamCustomComponent,
  StreamingComponent,
  StreamingComponentMap,
} from './customComponents'
export { useSmoothMarkdownStream } from './hooks/useSmoothMarkdownStream'
export type {
  SmoothMarkdownStreamOptions,
  SmoothMarkdownStreamSnapshot,
} from './hooks/useSmoothMarkdownStream'
export * from './i18n/useSafeI18n'
export * from './renderers/renderNode.tsrx'
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
  CodeBlockNodeProps,
  CodeBlockPreviewPayload,
  CodeBlockTheme,
  CodeBlockThemeObject,
  D2BlockNodeProps,
  ImageNodeProps,
  InfographicBlockNodeProps,
  LinkNodeProps,
  MathBlockNodeProps,
  MathInlineNodeProps,
  MermaidBlockEvent,
  MermaidBlockNodeProps,
  PreCodeNodeProps,
  ShikiCodeBlockProps,
} from './types/component-props'
export type { NodeComponentProps } from './types/node-component'
export * from './utils/languageIcon'
export * from './workers/katexWorkerClient'

export * from './workers/mermaidWorkerClient'

export type CustomComponentMap = MarkstreamCustomComponentMap
export type RenderContext = MarkstreamRenderContext
export type RenderNodeFn = MarkstreamRenderNodeFn
