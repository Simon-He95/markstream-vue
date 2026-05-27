import './index.css'
import './workers/katexRenderer.worker?worker'
import './workers/mermaidParser.worker?worker'

export { AdmonitionNodeComponent as AdmonitionNode } from './components/AdmonitionNode/AdmonitionNode.component'
export { BlockquoteNodeComponent as BlockquoteNode } from './components/BlockquoteNode/BlockquoteNode.component'
export { CheckboxNodeComponent as CheckboxNode } from './components/CheckboxNode/CheckboxNode.component'
export { CodeBlockNodeComponent as CodeBlockNode } from './components/CodeBlockNode/CodeBlockNode.component'
export { CodeBlockNodeComponent as AngularCodeBlockNode } from './components/CodeBlockNode/CodeBlockNode.component'
export { CodeBlockNodeComponent as MarkdownCodeBlockNode } from './components/CodeBlockNode/CodeBlockNode.component'
export { HtmlPreviewFrameComponent as HtmlPreviewFrame } from './components/CodeBlockNode/HtmlPreviewFrame.component'
export { D2BlockNodeComponent as D2BlockNode } from './components/D2BlockNode/D2BlockNode.component'
export { DefinitionListNodeComponent as DefinitionListNode } from './components/DefinitionListNode/DefinitionListNode.component'
export { EmojiNodeComponent as EmojiNode } from './components/EmojiNode/EmojiNode.component'
export { EmphasisNodeComponent as EmphasisNode } from './components/EmphasisNode/EmphasisNode.component'
export { FallbackComponent } from './components/FallbackComponent/FallbackComponent.component'
export { FootnoteAnchorNodeComponent as FootnoteAnchorNode } from './components/FootnoteAnchorNode/FootnoteAnchorNode.component'
export { FootnoteNodeComponent as FootnoteNode } from './components/FootnoteNode/FootnoteNode.component'
export { FootnoteReferenceNodeComponent as FootnoteReferenceNode } from './components/FootnoteReferenceNode/FootnoteReferenceNode.component'
export { HardBreakNodeComponent as HardBreakNode } from './components/HardBreakNode/HardBreakNode.component'
export { HeadingNodeComponent as HeadingNode } from './components/HeadingNode/HeadingNode.component'
export { HighlightNodeComponent as HighlightNode } from './components/HighlightNode/HighlightNode.component'
export { HtmlBlockNodeComponent as HtmlBlockNode } from './components/HtmlBlockNode/HtmlBlockNode.component'
export { HtmlInlineNodeComponent as HtmlInlineNode } from './components/HtmlInlineNode/HtmlInlineNode.component'
export { ImageNodeComponent as ImageNode } from './components/ImageNode/ImageNode.component'
export { InfographicBlockNodeComponent as InfographicBlockNode } from './components/InfographicBlockNode/InfographicBlockNode.component'
export { InlineCodeNodeComponent as InlineCodeNode } from './components/InlineCodeNode/InlineCodeNode.component'
export { InsertNodeComponent as InsertNode } from './components/InsertNode/InsertNode.component'
export { LinkNodeComponent as LinkNode } from './components/LinkNode/LinkNode.component'
export { ListItemNodeComponent as ListItemNode } from './components/ListItemNode/ListItemNode.component'
export { ListNodeComponent as ListNode } from './components/ListNode/ListNode.component'
export { MathBlockNodeComponent as MathBlockNode } from './components/MathBlockNode/MathBlockNode.component'
export { MathInlineNodeComponent as MathInlineNode } from './components/MathInlineNode/MathInlineNode.component'
export { MermaidBlockNodeComponent as MermaidBlockNode } from './components/MermaidBlockNode/MermaidBlockNode.component'
export { NestedRendererComponent as NestedRenderer } from './components/NestedRenderer/NestedRenderer.component'
export { NodeRendererComponent as NodeRenderer } from './components/NodeRenderer/NodeRenderer.component'
export { ParagraphNodeComponent as ParagraphNode } from './components/ParagraphNode/ParagraphNode.component'
export { PreCodeNodeComponent as PreCodeNode } from './components/PreCodeNode/PreCodeNode.component'
export { ReferenceNodeComponent as ReferenceNode } from './components/ReferenceNode/ReferenceNode.component'
export type {
  AngularRenderableNode,
  AngularRenderContext,
  CodeBlockPreviewPayload,
  NodeRendererCodeBlockProps,
  NodeRendererD2Props,
  NodeRendererEvents,
  NodeRendererInfographicProps,
  NodeRendererMermaidProps,
  NodeRendererProps,
} from './components/shared/node-helpers'
export {
  buildRenderContext,
  resolveParsedNodes,
} from './components/shared/node-helpers'
export { SafeAttrsDirective } from './components/shared/safe-attrs.directive'
export { MARKSTREAM_SMOOTH_STREAMING_SCOPE } from './components/shared/smooth-streaming-scope'
export type { SmoothStreamingScope } from './components/shared/smooth-streaming-scope'
export { StrikethroughNodeComponent as StrikethroughNode } from './components/StrikethroughNode/StrikethroughNode.component'
export { StrongNodeComponent as StrongNode } from './components/StrongNode/StrongNode.component'
export { SubscriptNodeComponent as SubscriptNode } from './components/SubscriptNode/SubscriptNode.component'
export { SuperscriptNodeComponent as SuperscriptNode } from './components/SuperscriptNode/SuperscriptNode.component'
export { TableNodeComponent as TableNode } from './components/TableNode/TableNode.component'
export { TextNodeComponent as TextNode } from './components/TextNode/TextNode.component'
export { ThematicBreakNodeComponent as ThematicBreakNode } from './components/ThematicBreakNode/ThematicBreakNode.component'
export { VmrContainerNodeComponent as VmrContainerNode } from './components/VmrContainerNode/VmrContainerNode.component'
export {
  clearGlobalCustomComponents,
  getCustomComponentsRevision,
  getCustomNodeComponents,
  removeCustomComponents,
  setCustomComponents,
  subscribeCustomComponents,
} from './customComponents'
export type { CustomComponentMap } from './customComponents'
export {
  disposeRenderedHtmlEnhancements,
  enhanceRenderedHtml,
} from './enhanceRenderedHtml'
export type { EnhanceRenderedHtmlOptions, RenderedHtmlEnhancementHandle } from './enhanceRenderedHtml'
export { setDefaultI18nMap, useSafeI18n } from './i18n/useSafeI18n'
export { MarkstreamAngularComponent } from './markstream-angular.component'
export { MarkstreamAngularComponent as MarkdownRenderComponent } from './markstream-angular.component'
export { MarkstreamAngularComponent as default } from './markstream-angular.component'
export type { MarkstreamAngularComponentProps } from './markstream-angular.component'
export type { D2Loader } from './optional/d2'
export {
  disableD2,
  enableD2,
  isD2Enabled,
  setD2Loader,
} from './optional/d2'
export type { KatexLoader } from './optional/katex'
export {
  disableKatex,
  enableKatex,
  getKatex,
  isKatexEnabled,
  setKatexLoader,
} from './optional/katex'
export type { MermaidLoader } from './optional/mermaid'
export {
  disableMermaid,
  enableMermaid,
  getMermaid,
  isMermaidEnabled,
  setMermaidLoader,
} from './optional/mermaid'
export {
  parseNestedMarkdownToNodes,
} from './parseNestedMarkdownToNodes'
export type {
  NestedMarkdownNodesInput,
  NestedMarkdownNodesOptions,
} from './parseNestedMarkdownToNodes'
export {
  renderMarkdownNodesToHtml,
  renderMarkdownNodeToHtml,
  renderMarkdownToHtml,
  renderNestedMarkdownToHtml,
} from './renderMarkdownHtml'
export type {
  MarkstreamAngularRenderOptions,
  NestedMarkdownHtmlInput,
  NestedMarkdownHtmlOptions,
  RenderableMarkdownNode,
} from './renderMarkdownHtml'
export { sanitizeHtmlContent } from './sanitizeHtmlContent'
export { SmoothMarkdownStreamService } from './services/smooth-markdown-stream.service'
export type { SmoothMarkdownStreamOptions } from './services/smooth-markdown-stream.service'
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
} from './types/monaco'
export {
  getLanguageIcon,
  languageMap,
  normalizeLanguageIdentifier,
  resolveMonacoLanguageId,
  setLanguageIconResolver,
} from './utils/languageIcon'
export type { LanguageIconResolver } from './utils/languageIcon'
export * from './workers/katexCdnWorker'
export * from './workers/katexWorkerClient'
export * from './workers/mermaidCdnWorker'

export * from './workers/mermaidWorkerClient'
