import type { Component } from 'solid-js'
import type { SolidRenderableNode, SolidRenderContext } from '../node-helpers'
import { Dynamic } from 'solid-js/web'
import { STANDARD_HTML_TAGS } from 'stream-markdown-parser'
import { getCustomNodeComponents } from '../customComponents'
import { getString, hasCompleteHtmlTagContent } from '../node-helpers'
import { coerceBuiltinHtmlNode, coerceCustomHtmlNode, resolveHtmlTag, resolveNodeOutletCodeMode, resolveNodeOutletCustomComponent, resolveNodeOutletCustomInputs } from '../nodeOutletHelpers'
import { CodeBlockNode } from './CodeBlockNode'
import { D2BlockNode } from './D2BlockNode'
import { InfographicBlockNode } from './InfographicBlockNode'
import { MathBlockNode, MathInlineNode } from './MathNodes'
import { MermaidBlockNode } from './MermaidBlockNode'
import { BlockquoteNode, CheckboxNode, EmojiNode, EmphasisNode, FallbackComponent, HardBreakNode, HeadingNode, HighlightNode, InsertNode, ListItemNode, ListNode, ParagraphNode, PreCodeNode, StrikethroughNode, StrongNode, SubscriptNode, SuperscriptNode, ThematicBreakNode } from './Nodes'
import { AdmonitionNode, DefinitionListNode, FootnoteAnchorNode, FootnoteNode, FootnoteReferenceNode, HtmlBlockNode, HtmlInlineNode, ImageNode, InlineCodeNode, LinkNode, ReferenceNode, TableNode, VmrContainerNode } from './RichNodes'
import { TextNode } from './TextNode'

export interface NodeOutletProps { node: SolidRenderableNode, context?: SolidRenderContext, indexKey?: string | number }

export function NodeOutlet(props: NodeOutletProps) {
  const type = () => getString((props.node as any).type)
  const codeMode = () => resolveNodeOutletCodeMode(props.node, props.context)
  const custom = () => {
    const mapping = props.context?.customComponents || getCustomNodeComponents(props.context?.customId)
    return resolveNodeOutletCustomComponent(props.node, props.context, mapping)
  }
  const htmlTag = () => resolveHtmlTag(props.node)
  const escapeHtml = () => {
    const tag = htmlTag()
    return props.context?.htmlPolicy === 'escape' || (!!tag && !STANDARD_HTML_TAGS.has(tag) && !(props.context?.customHtmlTags || []).includes(tag) && !hasCompleteHtmlTagContent((props.node as any).content ?? (props.node as any).raw, tag))
  }
  const builtins: Record<string, Component<any>> = {
    text: TextNode,
    text_special: TextNode,
    paragraph: ParagraphNode,
    heading: HeadingNode,
    blockquote: BlockquoteNode,
    list: ListNode,
    list_item: ListItemNode,
    strong: StrongNode,
    emphasis: EmphasisNode,
    strikethrough: StrikethroughNode,
    highlight: HighlightNode,
    insert: InsertNode,
    subscript: SubscriptNode,
    superscript: SuperscriptNode,
    hardbreak: HardBreakNode,
    thematic_break: ThematicBreakNode,
    checkbox: CheckboxNode,
    checkbox_input: CheckboxNode,
    emoji: EmojiNode,
    code_block: codeMode() === 'pre' ? PreCodeNode : (codeMode() === 'infographic' ? InfographicBlockNode : (codeMode() === 'd2' ? D2BlockNode : (codeMode() === 'mermaid' ? MermaidBlockNode : CodeBlockNode))),
    link: LinkNode,
    image: ImageNode,
    inline_code: InlineCodeNode,
    table: TableNode,
    definition_list: DefinitionListNode,
    admonition: AdmonitionNode,
    reference: ReferenceNode,
    footnote: FootnoteNode,
    footnote_reference: FootnoteReferenceNode,
    footnote_anchor: FootnoteAnchorNode,
    vmr_container: VmrContainerNode,
    html_block: HtmlBlockNode,
    html_inline: HtmlInlineNode,
    math_inline: MathInlineNode,
    math_block: MathBlockNode,
  }
  return (
    <>
      {custom()
        ? <Dynamic component={custom()!} node={coerceCustomHtmlNode(props.node)} context={props.context} ctx={props.context} customId={props.context?.customId} indexKey={props.indexKey} isDark={props.context?.isDark} typewriter={props.context?.typewriter} fade={props.context?.fade} {...resolveNodeOutletCustomInputs(props.node, props.context)} codeBlockOptions={props.context?.codeBlockOptions} />
        : escapeHtml()
          ? <TextNode node={{ ...(props.node as any), type: 'text', content: getString((props.node as any).content ?? (props.node as any).raw) }} context={props.context} indexKey={props.indexKey} />
          : <Dynamic component={builtins[type()] || FallbackComponent} node={coerceBuiltinHtmlNode(props.node, type())} context={props.context} indexKey={props.indexKey} {...resolveNodeOutletCustomInputs(props.node, props.context)} />}
    </>
  )
}
