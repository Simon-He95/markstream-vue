import type { JSX } from 'solid-js'
import type { NodeComponentProps } from '../customComponents'
import type { SolidRenderableNode } from './shared/node-helpers'
import { createEffect, createMemo, createSignal, Index, Match, onCleanup, Show, Switch, untrack } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { isHtmlTagBlocked, NON_STRUCTURING_HTML_TAGS, sanitizeHtmlAttrs } from 'stream-markdown-parser'
import { getCustomNodeComponents } from '../customComponents'
import { enhanceRenderedHtml } from '../enhanceRenderedHtml'
import { renderMarkdownNodeToHtml } from '../renderMarkdownHtml'
import { AdmonitionNode, BlockquoteNode, CheckboxNode, DefinitionListNode, EmojiNode, EmphasisNode, FootnoteAnchorNode, FootnoteNode, FootnoteReferenceNode, HardBreakNode, HeadingNode, HighlightNode, ImageNode, InlineCodeNode, InsertNode, LinkNode, ListItemNode, ListNode, MathBlockNode, MathInlineNode, ParagraphNode, ReferenceNode, StrikethroughNode, StrongNode, SubscriptNode, SuperscriptNode, TableNode, ThematicBreakNode, VmrContainerNode } from './BuiltinNodes'
import { CodeBlockNode } from './CodeBlockNode'
import { D2BlockNode, InfographicBlockNode, MermaidBlockNode } from './DiagramBlockNode'
import { useNodeLifecycle } from './lifecycle'
import { PreCodeBlock } from './PreCodeBlock'
import { buildRenderContext, getNodeList, getString, resolveCodeBlockLanguage } from './shared/node-helpers'
import { coerceCustomHtmlNode, resolveHtmlTag, resolveNodeOutletCustomComponent, resolveNodeOutletCustomInputs } from './shared/node-outlet-helpers'
import { StreamingTextNode } from './StreamingTextNode'
import { useHeavyNodeVisibility } from './viewport'

export function RenderChildren(props: NodeComponentProps & {
  nodes?: readonly SolidRenderableNode[]
}): JSX.Element {
  const context = createMemo(() => props.context ?? buildRenderContext({ ...props, customComponents: getCustomNodeComponents(props.customId) }, { onCopy: props.onCopy, onHandleArtifactClick: props.onHandleArtifactClick }))
  return (
    <Index each={props.nodes ?? getNodeList(props.node.children)}>
      {(node, index) => <RenderNode node={node()} context={context()} indexKey={`${props.indexKey ?? 'node'}-${index}`} />}
    </Index>
  )
}
export function TextNode(props: NodeComponentProps): JSX.Element {
  return <StreamingTextNode {...props} />
}
export function RichNode(props: NodeComponentProps): JSX.Element {
  let host!: HTMLSpanElement
  const [pending, setPending] = createSignal(true)
  const inViewport = useHeavyNodeVisibility(props, () => host?.firstElementChild ?? undefined)
  useNodeLifecycle(props, () => inViewport() && pending(), () => host)
  const html = createMemo(() => renderMarkdownNodeToHtml(props.node, {
    customHtmlTags: props.context?.customHtmlTags,
    htmlPolicy: props.context?.htmlPolicy,
    allowHtml: props.context?.allowHtml,
  }))
  const initialMarkup = untrack(html)
  const final = createMemo(() => props.context?.final !== false && props.node.loading !== true)
  createEffect(() => {
    const markup = html()
    if (!inViewport())
      return
    setPending(true)
    const context = props.context
    const isFinal = final()
    let cancelled = false
    let handle: {
      dispose: () => void
    } | undefined
    if (host.innerHTML !== markup)
      host.innerHTML = markup
    void enhanceRenderedHtml(host, {
      ...context,
      final: isFinal,
      onCopy: context?.events.onCopy,
      isCancelled: () => cancelled,
    }).then((next) => {
      if (cancelled) {
        next.dispose()
      }
      else {
        handle = next
        setPending(false)
      }
    }, () => {
      if (!cancelled)
        setPending(false)
    })
    onCleanup(() => {
      cancelled = true
      handle?.dispose()
    })
  })
  return <span ref={host} class="rich-node" style={{ display: 'contents' }} innerHTML={initialMarkup} />
}
const builtinComponents = {
  math_block: MathBlockNode,
  math_inline: MathInlineNode,
  paragraph: ParagraphNode,
  heading: HeadingNode,
  strong: StrongNode,
  emphasis: EmphasisNode,
  strikethrough: StrikethroughNode,
  highlight: HighlightNode,
  insert: InsertNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  blockquote: BlockquoteNode,
  list: ListNode,
  list_item: ListItemNode,
  hardbreak: HardBreakNode,
  thematic_break: ThematicBreakNode,
  inline_code: InlineCodeNode,
  checkbox: CheckboxNode,
  checkbox_input: CheckboxNode,
  emoji: EmojiNode,
  reference: ReferenceNode,
  image: ImageNode,
  link: LinkNode,
  table: TableNode,
  definition_list: DefinitionListNode,
  admonition: AdmonitionNode,
  footnote: FootnoteNode,
  footnote_reference: FootnoteReferenceNode,
  footnote_anchor: FootnoteAnchorNode,
  vmr_container: VmrContainerNode,
} as Record<string, (props: any) => JSX.Element>
const htmlTags: Record<string, string> = { paragraph: 'p', heading: 'h', strong: 'strong', emphasis: 'em', strikethrough: 'del', highlight: 'mark', insert: 'ins', subscript: 'sub', superscript: 'sup', blockquote: 'blockquote', list_item: 'li', inline_code: 'code', hardbreak: 'br', thematic_break: 'hr', image: 'img', link: 'a', table: 'table' }
export function RenderNode(props: NodeComponentProps): JSX.Element {
  const type = createMemo(() => getString(props.node.type))
  const custom = createMemo(() => resolveNodeOutletCustomComponent(props.node, props.context))
  const builtin = createMemo(() => type() === 'text' || type() === 'text_special' ? TextNode : builtinComponents[type()])
  const htmlTag = createMemo(() => type() === 'heading' ? `h${props.node.level}` : type() === 'list' ? props.node.ordered ? 'ol' : 'ul' : htmlTags[type()] || resolveHtmlTag(props.node))
  const htmlComponent = createMemo(() => type().startsWith('html_') && (props.context?.htmlPolicy === 'escape' || props.context?.allowHtml === false) ? undefined : props.context?.htmlComponents?.[htmlTag()])
  const safeAttrs = createMemo(() => sanitizeHtmlAttrs(Array.isArray(props.node.attrs) ? Object.fromEntries(props.node.attrs) : props.node.attrs ?? {}, props.context?.htmlPolicy ?? 'safe', htmlTag() || undefined))
  return (
    <Show
      when={custom()}
      fallback={(
        <Show
          when={htmlComponent()}
          fallback={(
            <Switch fallback={<RichNode {...props} />}>
              <Match when={builtin()}><Dynamic component={builtin()} {...props} /></Match>
              <Match when={type() === 'code_block'}>
                <Show when={!props.context?.renderCodeBlocksAsPre} fallback={<PreCodeBlock {...props} node={props.node as any} />}>
                  <Switch fallback={<CodeBlockNode {...props} node={props.node as any} />}>
                    <Match when={resolveCodeBlockLanguage(props.node) === 'mermaid'}><MermaidBlockNode {...props} node={props.node as any} /></Match>
                    <Match when={['d2', 'd2lang'].includes(resolveCodeBlockLanguage(props.node))}><D2BlockNode {...props} node={props.node as any} /></Match>
                    <Match when={resolveCodeBlockLanguage(props.node) === 'infographic'}><InfographicBlockNode {...props} node={props.node as any} /></Match>
                  </Switch>
                </Show>
              </Match>
              <Match when={(type() === 'html_block' || type() === 'html_inline') && htmlTag() && getNodeList(props.node.children).length > 0 && props.context?.allowHtml !== false && props.context?.htmlPolicy !== 'escape' && !NON_STRUCTURING_HTML_TAGS.has(htmlTag()) && !isHtmlTagBlocked(htmlTag(), props.context?.htmlPolicy ?? 'safe')}><Dynamic component={htmlTag()} {...safeAttrs()}><RenderChildren {...props} /></Dynamic></Match>
            </Switch>
          )}
        >
          <Dynamic component={htmlComponent()} {...safeAttrs()}><Show when={getNodeList(props.node.children).length} fallback={props.node.code ?? props.node.text ?? props.node.content ?? ''}><RenderChildren {...props} /></Show></Dynamic>
        </Show>
      )}
    >
      <Dynamic component={custom()} {...resolveNodeOutletCustomInputs(props.node, props.context)} node={coerceCustomHtmlNode(props.node)} context={props.context} ctx={props.context} indexKey={props.indexKey} isDark={props.context?.isDark} customId={props.context?.customId} typewriter={props.context?.typewriter} fade={props.context?.fade} codeBlockOptions={props.context?.codeBlockOptions} />
    </Show>
  )
}
export { CodeBlockNode } from './CodeBlockNode'
export { PreCodeNode } from './PreCodeNode'
