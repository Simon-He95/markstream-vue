import type { MathOptions } from 'stream-markdown-parser'
import type { Component } from 'vue-demi'
import type { CustomComponents as MarkstreamCustomComponents } from './types'
import type { LanguageIconResolver } from './utils/languageIcon'
import { setDefaultMathOptions } from 'stream-markdown-parser'
import AdmonitionNode from './components/AdmonitionNode'
import BlockquoteNode from './components/BlockquoteNode'
import CheckboxNode from './components/CheckboxNode'
import CodeBlockNode from './components/CodeBlockNode'
import D2BlockNode from './components/D2BlockNode'
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
import InfographicBlockNode from './components/InfographicBlockNode'
import InlineCodeNode from './components/InlineCodeNode'
import InsertNode from './components/InsertNode'
import LinkNode from './components/LinkNode'
import ListItemNode from './components/ListItemNode'
import ListNode from './components/ListNode'
import MarkdownCodeBlockNode from './components/MarkdownCodeBlockNode'
import MarkdownRender from './components/MarkdownRenderCompat.vue'
import MathBlockNode from './components/MathBlockNode'
import MathInlineNode from './components/MathInlineNode'
import { disableKatex, enableKatex, isKatexEnabled, setKatexLoader } from './components/MathInlineNode/katex'
import MermaidBlockNode from './components/MermaidBlockNode'
import { disableMermaid, enableMermaid, isMermaidEnabled, setMermaidLoader } from './components/MermaidBlockNode/mermaid'
import NestedRenderer from './components/NestedRenderer'
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
import Tooltip from './components/Tooltip'
import VmrContainerNode from './components/VmrContainerNode'
import { setDefaultI18nMap } from './composables/useSafeI18n'
import { useSmoothMarkdownStream } from './composables/useSmoothMarkdownStream'
import { setLanguageIconResolver } from './utils/languageIcon'
import { clearGlobalCustomComponents, getCustomNodeComponents, removeCustomComponents, setCustomComponents } from './utils/nodeComponents'
import './workers/katexRenderer.worker?worker'
import './workers/mermaidParser.worker?worker'
import './index.css'

export type { D2Loader } from './components/D2BlockNode/d2'
export type { KatexLoader } from './components/MathInlineNode/katex'
export type { MermaidLoader } from './components/MermaidBlockNode/mermaid'
export type { NodeRendererProps } from './components/NodeRenderer/NodeRenderer.vue'
export type {
  SmoothMarkdownStreamController,
  SmoothMarkdownStreamControllerVue2,
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
} from './types/component-props'
export * from './utils'
export * from './workers/katexCdnWorker'
export * from './workers/katexWorkerClient'
export * from './workers/mermaidCdnWorker'
export * from './workers/mermaidWorkerClient'
export { KATEX_COMMANDS, normalizeStandaloneBackslashT, setDefaultMathOptions } from 'stream-markdown-parser'
export type { MathOptions } from 'stream-markdown-parser'

export interface CustomComponents extends MarkstreamCustomComponents {}

export interface MarkstreamVue2PluginOptions {
  getLanguageIcon?: LanguageIconResolver
  mathOptions?: MathOptions
}

interface Vue2InstanceLike {
  _setupProxy?: unknown
}

interface Vue2ConstructorLike {
  version?: string
  prototype: Record<string, unknown>
  component: (name: string, component: Component) => void
  mixin: (mixin: { beforeCreate?: (this: Vue2InstanceLike) => void }) => void
  __composition_api_installed__?: boolean
  __compositionApiInstalled?: boolean
  __markstreamVue2SetupProxyPatched?: boolean
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
  disableKatex,
  disableMermaid,
  EmojiNode,
  EmphasisNode,
  enableD2,
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
  isKatexEnabled,
  isMermaidEnabled,
  LinkNode,
  ListItemNode,
  ListNode,
  MarkdownCodeBlockNode,
  MarkdownRender,
  MathBlockNode,
  MathInlineNode,
  MermaidBlockNode,
  NestedRenderer,
  ParagraphNode,
  PreCodeNode,
  ReferenceNode,
  removeCustomComponents,
  setCustomComponents,
  setD2Loader,
  setDefaultI18nMap,
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
  useSmoothMarkdownStream,
  VmrContainerNode,
}

export default MarkdownRender

function getVue2MinorVersion(Vue: Vue2ConstructorLike) {
  const version = typeof Vue?.version === 'string' ? Vue.version : ''
  const [major, minor] = version.split('.').map(Number)
  if (!Number.isFinite(major) || !Number.isFinite(minor) || major !== 2)
    return null
  return minor
}

function ensureVue2CompositionApi(Vue: Vue2ConstructorLike) {
  const minor = getVue2MinorVersion(Vue)
  if (minor == null || minor >= 7)
    return
  const compositionInstalled = Vue?.__composition_api_installed__ || Vue?.__compositionApiInstalled
  if (!compositionInstalled) {
    throw new Error(
      '[markstream-vue2] Vue 2.6.x requires @vue/composition-api. Install it and call Vue.use(VueCompositionAPI) before using markstream-vue2.',
    )
  }
}

function ensureVue2SetupProxy(Vue: Vue2ConstructorLike) {
  const minor = getVue2MinorVersion(Vue)
  if (minor == null || minor >= 7)
    return
  if (Vue?.__markstreamVue2SetupProxyPatched)
    return
  Vue.__markstreamVue2SetupProxyPatched = true
  // Provide a fallback _setupProxy for Vue 2.6 + composition-api
  // so <script setup> render helpers can access `props` and bindings.
  const proto = Vue.prototype
  if (!Object.prototype.hasOwnProperty.call(proto, '_setupProxy')) {
    Object.defineProperty(proto, '_setupProxy', {
      configurable: true,
      get() {
        return this
      },
      set(value) {
        Object.defineProperty(this, '_setupProxy', {
          value,
          configurable: true,
          writable: true,
        })
      },
    })
  }
  Vue.mixin({
    beforeCreate() {
      if (!this._setupProxy) {
        try {
          this._setupProxy = this
        }
        catch {}
      }
    },
  })
}

const componentMap: Record<string, Component> = {
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
  InlineCodeNode,
  PreCodeNode,
  InsertNode,
  LinkNode,
  ListItemNode,
  ListNode,
  MarkdownCodeBlockNode,
  MathBlockNode,
  MathInlineNode,
  MermaidBlockNode,
  NestedRenderer,
  InfographicBlockNode,
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
}

export const VueRendererMarkdown = {
  install(Vue: Vue2ConstructorLike, options?: MarkstreamVue2PluginOptions) {
    ensureVue2CompositionApi(Vue)
    ensureVue2SetupProxy(Vue)
    Object.entries(componentMap).forEach(([name, component]) => {
      Vue.component(name, component)
    })
    Vue.component('MarkdownRender', MarkdownRender)
    Vue.component('NodeRenderer', MarkdownRender)
    if (options?.getLanguageIcon)
      setLanguageIconResolver(options.getLanguageIcon)
    if (options?.mathOptions)
      setDefaultMathOptions(options.mathOptions)
  },
}
