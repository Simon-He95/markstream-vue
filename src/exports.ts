import type { MathOptions } from 'stream-markdown-parser'
import type { App, Component, DefineComponent, Plugin } from 'vue'
import type { InfographicLoader } from './components/InfographicBlockNode/infographic'
import type { MarkstreamVirtualTimelineProps } from './composables/useMarkstreamVirtualAdapter'
import type { CustomComponents as MarkstreamCustomComponents } from './types'
import type {
  CodeBlockNodeProps,
  D2BlockNodeProps,
  InfographicBlockNodeProps,
  MathBlockNodeProps,
  MathInlineNodeProps,
  MermaidBlockNodeProps,
} from './types/component-props'
import type { LanguageIconResolver } from './utils/languageIcon'
import { setDefaultMathOptions } from 'stream-markdown-parser'
import { defineAsyncComponent } from 'vue'
import AdmonitionNode from './components/AdmonitionNode'

import BlockquoteNode from './components/BlockquoteNode'
import CheckboxNode from './components/CheckboxNode'
import { disableD2, enableD2, isD2Enabled, setD2Loader } from './components/D2BlockNode/d2'
import DefinitionListNode from './components/DefinitionListNode'
import EmojiNode from './components/EmojiNode'
import EmphasisNode from './components/EmphasisNode'
import FootnoteAnchorNode from './components/FootnoteAnchorNode'
import FootnoteNode from './components/FootnoteNode'
import FootnoteReferenceNode from './components/FootnoteReferenceNode'
import HardBreakNode from './components/HardBreakNode'
import HeadingNode from './components/HeadingNode'
import HighlightNode from './components/HighlightNode'
import HtmlBlockNode from './components/HtmlBlockNode'
import HtmlInlineNode from './components/HtmlInlineNode'
import ImageNode from './components/ImageNode'
import { disableInfographic, enableInfographic, isInfographicEnabled, setInfographicLoader } from './components/InfographicBlockNode/infographic'
import InlineCodeNode from './components/InlineCodeNode'
import InsertNode from './components/InsertNode'
import LinkNode from './components/LinkNode'
import ListItemNode from './components/ListItemNode'
import ListNode from './components/ListNode'
import { disableKatex, enableKatex, isKatexEnabled, setKatexLoader } from './components/MathInlineNode/katex'
import { disableMermaid, enableMermaid, isMermaidEnabled, setMermaidLoader } from './components/MermaidBlockNode/mermaid'
import MarkdownRender from './components/NodeRenderer'
import ParagraphNode from './components/ParagraphNode'
import PreCodeNode from './components/PreCodeNode'
import ReferenceNode from './components/ReferenceNode'
import StrikethroughNode from './components/StrikethroughNode'
import StrongNode from './components/StrongNode'
import SubscriptNode from './components/SubscriptNode'
import SuperscriptNode from './components/SuperscriptNode'
import TableNode from './components/TableNode'
import TextNode from './components/TextNode'
import ThematicBreakNode from './components/ThematicBreakNode'
import VmrContainerNode from './components/VmrContainerNode'
import { useMarkstreamVirtualAdapter } from './composables/useMarkstreamVirtualAdapter'
import { setDefaultI18nMap } from './composables/useSafeI18n'
import { useSmoothMarkdownStream } from './composables/useSmoothMarkdownStream'
import { setIconTheme } from './icon-themes'
import { setLanguageIconResolver } from './utils/languageIcon'
import { MARKSTREAM_LANGUAGE_ICON_RESOLVER_KEY } from './utils/languageIconResolver'
import { clearGlobalCustomComponents, createCustomComponentsRef, getCustomNodeComponents, MARKSTREAM_CUSTOM_COMPONENTS_KEY, removeCustomComponents, setCustomComponents } from './utils/nodeComponents'

function definePublicAsyncComponent<TProps extends object>(
  loader: () => Promise<{ default: Component }>,
): DefineComponent<TProps> {
  return defineAsyncComponent(loader) as DefineComponent<TProps>
}

const CodeBlockNode = definePublicAsyncComponent<CodeBlockNodeProps>(() => import('./components/CodeBlockNode'))
const MathBlockNode = definePublicAsyncComponent<MathBlockNodeProps>(() => import('./components/MathBlockNode'))
const MathInlineNode = definePublicAsyncComponent<MathInlineNodeProps>(() => import('./components/MathInlineNode'))
const MermaidBlockNode = definePublicAsyncComponent<MermaidBlockNodeProps>(() => import('./components/MermaidBlockNode'))
const InfographicBlockNode = definePublicAsyncComponent<InfographicBlockNodeProps>(() => import('./components/InfographicBlockNode'))
const D2BlockNode = definePublicAsyncComponent<D2BlockNodeProps>(() => import('./components/D2BlockNode'))
const Tooltip = definePublicAsyncComponent<Record<string, unknown>>(() => import('./components/Tooltip'))
const MarkdownCodeBlockNode = definePublicAsyncComponent<Record<string, unknown>>(
  () => import('./components/MarkdownCodeBlockNode'),
)
const MarkstreamVirtualTimeline = definePublicAsyncComponent<MarkstreamVirtualTimelineProps<any>>(
  () => import('./components/MarkstreamVirtualTimeline'),
)

export type { D2Loader } from './components/D2BlockNode/d2'
export type { InfographicLoader } from './components/InfographicBlockNode/infographic'
export type { KatexLoader } from './components/MathInlineNode/katex'

export type { MermaidLoader } from './components/MermaidBlockNode/mermaid'
export type {
  MarkstreamBottomAnchor,
  MarkstreamOuterAnchor,
  MarkstreamOuterVirtualizerAdapter,
  MarkstreamThreadAnchor,
  MarkstreamThreadVirtualState,
  MarkstreamTimelineItem,
  MarkstreamTimelineItemKey,
  MarkstreamVirtualAdapterController,
  MarkstreamVirtualMarkdownProps,
  MarkstreamVirtualTimelineProps,
  MarkstreamVisibleRange,
  UseMarkstreamVirtualAdapterOptions,
} from './composables/useMarkstreamVirtualAdapter'
export type {
  SmoothMarkdownStreamController,
  SmoothMarkdownStreamOptions,
} from './composables/useSmoothMarkdownStream'
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
  CodeBlockThemeProp,
  D2BlockNodeProps,
  ImageNodeProps,
  InfographicBlockNodeProps,
  LinkNodeProps,
  MarkdownCodeBlockPreviewPayload,
  MathBlockNodeProps,
  MathInlineNodeProps,
  MermaidBlockEvent,
  MermaidBlockNodeProps,
  PreCodeNodeProps,
  ShikiCodeBlockProps,
} from './types/component-props'
export type {
  MarkstreamCaptureVirtualStateOptions,
  MarkstreamHeightCache,
  MarkstreamHeightCacheEntry,
  MarkstreamMeasuredHeightCacheEntry,
  MarkstreamNodeLifecycle,
  MarkstreamRendererHandle,
  MarkstreamScrollRoot,
  MarkstreamScrollRootLike,
  MarkstreamScrollRootRef,
  MarkstreamScrollRootResolver,
  MarkstreamVirtualAnchor,
  MarkstreamVirtualConfidence,
  MarkstreamVirtualMetrics,
  MarkstreamVirtualPhase,
  MarkstreamVirtualReason,
  MarkstreamVirtualScrollHeightCacheOptions,
  MarkstreamVirtualScrollOptions,
  MarkstreamVirtualScrollSharedOptions,
  MarkstreamVirtualState,
  NodeRendererCodeRenderer,
  NodeRendererMode,
  NodeRendererProps,
} from './types/node-renderer-props'
// Export centralized props interfaces so they appear in package d.ts
export * from './utils'
export { MARKSTREAM_NODE_LIFECYCLE_KEY, useMarkstreamNodeLifecycle } from './utils/nodeLifecycle'
export * from './workers/katexCdnWorker'
export * from './workers/katexWorkerClient'
export * from './workers/mermaidCdnWorker'
export * from './workers/mermaidWorkerClient'
export { KATEX_COMMANDS, normalizeStandaloneBackslashT, setDefaultMathOptions } from 'stream-markdown-parser'
export type { MathOptions } from 'stream-markdown-parser'

export interface CustomComponents extends MarkstreamCustomComponents {}

export interface MarkstreamVuePluginOptions {
  /**
   * App-scoped custom components.
   */
  components?: Partial<MarkstreamCustomComponents>

  /**
   * App-scoped code language icon resolver. Prefer this in SSR/multi-tenant apps.
   */
  languageIconResolver?: LanguageIconResolver

  /**
   * @deprecated Prefer setLanguageIconResolver() before app.mount().
   *
   * Kept for 1.x compatibility. This still mutates process-global icon
   * resolution state, so avoid it in multi-tenant SSR apps.
   */
  getLanguageIcon?: LanguageIconResolver

  /**
   * @deprecated Prefer setIconTheme() before app.mount().
   *
   * Kept for 1.x compatibility. This still mutates process-global icon
   * theme state, so avoid it in multi-tenant SSR apps.
   */
  iconTheme?: string

  /**
   * @deprecated Prefer setInfographicLoader() before app.mount().
   *
   * Kept for 1.x compatibility.
   */
  infographicLoader?: InfographicLoader | null

  /**
   * @deprecated Prefer setDefaultMathOptions() before app.mount().
   *
   * Kept for 1.x compatibility.
   */
  mathOptions?: MathOptions
}

export {
  AdmonitionNode,
  BlockquoteNode,
  CheckboxNode,
  clearGlobalCustomComponents,
  CodeBlockNode,
  D2BlockNode,
  DefinitionListNode,
  disableD2,
  disableInfographic,
  disableKatex,
  disableMermaid,
  EmojiNode,
  EmphasisNode,
  enableD2,
  enableInfographic,
  enableKatex,
  enableMermaid,
  FootnoteAnchorNode,
  FootnoteNode,
  FootnoteReferenceNode,
  getCustomNodeComponents,
  HardBreakNode,
  HeadingNode,
  HighlightNode,
  HtmlBlockNode,
  HtmlInlineNode,
  ImageNode,
  InfographicBlockNode,
  InlineCodeNode,
  InsertNode,
  isD2Enabled,
  isInfographicEnabled,
  isKatexEnabled,
  isMermaidEnabled,
  LinkNode,
  ListItemNode,
  ListNode,
  MarkdownCodeBlockNode,
  MarkdownRender,
  MarkstreamVirtualTimeline,
  MathBlockNode,
  MathInlineNode,
  MermaidBlockNode,
  ParagraphNode,
  PreCodeNode,
  ReferenceNode,
  removeCustomComponents,
  setCustomComponents,
  setD2Loader,
  setDefaultI18nMap,
  setInfographicLoader,
  setKatexLoader,
  setMermaidLoader,
  StrikethroughNode,
  StrongNode,
  SubscriptNode,
  SuperscriptNode,
  TableNode,
  TextNode,
  ThematicBreakNode,
  Tooltip,
  useMarkstreamVirtualAdapter,
  useSmoothMarkdownStream,
  VmrContainerNode,
}

export default MarkdownRender

const componentMap: Record<string, Component> = {
  MarkdownRender,
  NodeRenderer: MarkdownRender,
  AdmonitionNode,
  BlockquoteNode,
  CheckboxNode,
  CodeBlockNode,
  DefinitionListNode,
  EmojiNode,
  EmphasisNode,
  FootnoteNode,
  FootnoteReferenceNode,
  FootnoteAnchorNode,
  HardBreakNode,
  HeadingNode,
  HtmlBlockNode,
  HtmlInlineNode,
  HighlightNode,
  ImageNode,
  D2BlockNode,
  InfographicBlockNode,
  InlineCodeNode,
  PreCodeNode,
  InsertNode,
  LinkNode,
  ListItemNode,
  ListNode,
  MathBlockNode,
  MathInlineNode,
  MermaidBlockNode,
  ParagraphNode,
  StrikethroughNode,
  StrongNode,
  SubscriptNode,
  SuperscriptNode,
  TableNode,
  TextNode,
  ThematicBreakNode,
  VmrContainerNode,
  ReferenceNode,
  MarkdownCodeBlockNode,
  MarkstreamVirtualTimeline,
  Tooltip,
}

export const VueRendererMarkdown: Plugin<[options?: MarkstreamVuePluginOptions]> = {
  install(app: App, options?: MarkstreamVuePluginOptions) {
    Object.entries(componentMap).forEach(([name, component]) => {
      app.component(name, component)
    })

    if (options?.iconTheme)
      setIconTheme(options.iconTheme)
    if (options?.getLanguageIcon)
      setLanguageIconResolver(options.getLanguageIcon)
    if (options?.mathOptions)
      setDefaultMathOptions(options.mathOptions)
    if (options && 'infographicLoader' in options)
      setInfographicLoader(options.infographicLoader ?? null)

    if (options?.languageIconResolver)
      app.provide(MARKSTREAM_LANGUAGE_ICON_RESOLVER_KEY, options.languageIconResolver)

    if (options?.components)
      app.provide(MARKSTREAM_CUSTOM_COMPONENTS_KEY, createCustomComponentsRef(options.components))
  },
}
