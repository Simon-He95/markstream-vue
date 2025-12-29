import type { LanguageIconResolver } from './utils/languageIcon'
import { setDefaultMathOptions } from 'stream-markdown-parser'
import AdmonitionNode from './components/AdmonitionNode'
import BlockquoteNode from './components/BlockquoteNode'
import CheckboxNode from './components/CheckboxNode'
import CodeBlockNode from './components/CodeBlockNode'
import DefinitionListNode from './components/DefinitionListNode'
import EmojiNode from './components/EmojiNode'
import FootnoteAnchorNode from './components/FootnoteAnchorNode'
import FootnoteNode from './components/FootnoteNode'
import FootnoteReferenceNode from './components/FootnoteReferenceNode'
import HardBreakNode from './components/HardBreakNode'
import HeadingNode from './components/HeadingNode'
import HighlightNode from './components/HighlightNode'
import HtmlInlineNode from './components/HtmlInlineNode'
import ImageNode from './components/ImageNode'
import InlineCodeNode from './components/InlineCodeNode'
import InsertNode from './components/InsertNode'
import LinkNode from './components/LinkNode'
import ListItemNode from './components/ListItemNode'
import ListNode from './components/ListNode'
import MarkdownCodeBlockNode from './components/MarkdownCodeBlockNode'
import MathBlockNode from './components/MathBlockNode'
import MathInlineNode from './components/MathInlineNode'
import { disableKatex, enableKatex, isKatexEnabled, setKatexLoader } from './components/MathInlineNode/katex'
import MermaidBlockNode from './components/MermaidBlockNode'
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
import { setDefaultI18nMap } from './composables/useSafeI18n'
import { setLanguageIconResolver } from './utils/languageIcon'
import { clearGlobalCustomComponents, getCustomNodeComponents, removeCustomComponents, setCustomComponents } from './utils/nodeComponents'
import './workers/katexRenderer.worker?worker'
import './workers/mermaidParser.worker?worker'
import './index.css'

export type { KatexLoader } from './components/MathInlineNode/katex'
export type { MermaidLoader } from './components/MermaidBlockNode/mermaid'
export * from './utils'
export * from './workers/katexCdnWorker'
export * from './workers/katexWorkerClient'
export * from './workers/mermaidCdnWorker'
export * from './workers/mermaidWorkerClient'
export { KATEX_COMMANDS, normalizeStandaloneBackslashT, setDefaultMathOptions } from 'stream-markdown-parser'
export type { MathOptions } from 'stream-markdown-parser'

export {
  AdmonitionNode,
  BlockquoteNode,
  CheckboxNode,
  clearGlobalCustomComponents,
  CodeBlockNode,
  DefinitionListNode,
  disableKatex,
  disableMermaid,
  EmojiNode,
  enableKatex,
  enableMermaid,
  FootnoteAnchorNode,
  FootnoteNode,
  FootnoteReferenceNode,
  getCustomNodeComponents,
  HardBreakNode,
  HeadingNode,
  HighlightNode,
  HtmlInlineNode,
  ImageNode,
  InlineCodeNode,
  InsertNode,
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
  ParagraphNode,
  PreCodeNode,
  ReferenceNode,
  removeCustomComponents,
  setCustomComponents,
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
}

export default MarkdownRender

const componentMap: Record<string, any> = {
  AdmonitionNode,
  BlockquoteNode,
  CheckboxNode,
  CodeBlockNode,
  DefinitionListNode,
  EmojiNode,
  FootnoteNode,
  FootnoteReferenceNode,
  FootnoteAnchorNode,
  HardBreakNode,
  HeadingNode,
  HtmlInlineNode,
  HighlightNode,
  ImageNode,
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
  ParagraphNode,
  StrikethroughNode,
  StrongNode,
  SubscriptNode,
  SuperscriptNode,
  TableNode,
  TextNode,
  ThematicBreakNode,
  ReferenceNode,
}

export const VueRendererMarkdown = {
  install(Vue: any, options?: { getLanguageIcon?: LanguageIconResolver, mathOptions?: any }) {
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
