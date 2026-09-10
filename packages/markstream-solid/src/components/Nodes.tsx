import type { JSX } from 'solid-js'
import type { SolidRenderableNode, SolidRenderContext } from '../node-helpers'
import { Index } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { clampHeadingLevel, getNodeList, getString, splitParagraphChildren } from '../node-helpers'
import { NodeOutlet } from './NodeOutlet'
import { RenderChildren } from './RenderChildren'

export interface NodeProps { node: SolidRenderableNode, context?: SolidRenderContext, indexKey?: string | number }

export function ParagraphNode(props: NodeProps) {
  const parts = () => splitParagraphChildren(getNodeList((props.node as any).children))
  return (
    <Index each={parts()}>
      {(part, index) => part().kind === 'inline'
        ? <p class="paragraph-node"><RenderChildren nodes={(part() as { kind: 'inline', nodes: SolidRenderableNode[] }).nodes} context={props.context} prefix={`${props.indexKey ?? 'p'}-${index}`} /></p>
        : <NodeOutlet node={(part() as { kind: 'block', node: SolidRenderableNode }).node} context={props.context} indexKey={`${props.indexKey ?? 'p'}-${index}`} />}
    </Index>
  )
}

export function HeadingNode(props: NodeProps) {
  const level = () => clampHeadingLevel((props.node as any).level)
  return <Dynamic component={`h${level()}` as keyof JSX.IntrinsicElements} class={`heading-node heading-${level()}`}><RenderChildren nodes={getNodeList((props.node as any).children)} context={props.context} prefix={`${props.indexKey ?? 'heading'}-heading`} /></Dynamic>
}
export function BlockquoteNode(props: NodeProps) {
  return <blockquote class="blockquote blockquote-node" dir="auto" cite={getString((props.node as any).cite) || undefined}><RenderChildren nodes={getNodeList((props.node as any).children)} context={props.context} prefix={`${props.indexKey ?? 'blockquote'}-blockquote`} /></blockquote>
}
export function ListNode(props: NodeProps) {
  return (props.node as any).ordered ? <ol start={Number.isFinite(Number((props.node as any).start)) ? Number((props.node as any).start) : undefined}><RenderChildren nodes={getNodeList((props.node as any).items)} context={props.context} prefix={`${props.indexKey ?? 'list'}-list`} /></ol> : <ul><RenderChildren nodes={getNodeList((props.node as any).items)} context={props.context} prefix={`${props.indexKey ?? 'list'}-list`} /></ul>
}
export function ListItemNode(props: NodeProps) {
  return <li><RenderChildren nodes={getNodeList((props.node as any).children)} context={props.context} prefix={`${props.indexKey ?? 'li'}-li`} /></li>
}
export function InlineWrapNode(props: NodeProps & { tag?: keyof JSX.IntrinsicElements }) {
  return <Dynamic component={props.tag || 'span'}><RenderChildren nodes={getNodeList((props.node as any).children)} context={props.context} prefix={`${props.indexKey ?? (props.tag || 'span')}-${props.tag || 'span'}`} /></Dynamic>
}
export const StrongNode = (props: NodeProps) => <InlineWrapNode {...props} tag="strong" />
export const EmphasisNode = (props: NodeProps) => <InlineWrapNode {...props} tag="em" />
export const StrikethroughNode = (props: NodeProps) => <InlineWrapNode {...props} tag="del" />
export const HighlightNode = (props: NodeProps) => <InlineWrapNode {...props} tag="mark" />
export const InsertNode = (props: NodeProps) => <InlineWrapNode {...props} tag="ins" />
export const SubscriptNode = (props: NodeProps) => <InlineWrapNode {...props} tag="sub" />
export const SuperscriptNode = (props: NodeProps) => <InlineWrapNode {...props} tag="sup" />
export const HardBreakNode = () => <br />
export const ThematicBreakNode = () => <hr />
export const CheckboxNode = (props: NodeProps) => <input class="checkbox-node" type="checkbox" disabled checked={Boolean((props.node as any).checked)} />
export const EmojiNode = (props: NodeProps) => <span class="emoji-node">{getString((props.node as any).raw || (props.node as any).markup || (props.node as any).content || (props.node as any).name)}</span>
export const FallbackComponent = (props: NodeProps) => <span>{getString((props.node as any).content ?? (props.node as any).raw)}</span>
export interface PreCodeNodeProps extends NodeProps {
  showLineNumbers?: boolean
}

export function PreCodeNode(props: PreCodeNodeProps) {
  const code = getString((props.node as any).code ?? (props.node as any).content ?? (props.node as any).raw)
  const isDiff = Boolean((props.node as any).diff)
  const lines = code.replace(/\r\n/g, '\n').split('\n')
  const showGutter = props.showLineNumbers === true && !isDiff
  const width = Math.max(2, String(lines.length).length)
  return (
    <pre class={`pre-code-node${showGutter ? ' pre-code-node--with-line-numbers' : ''}`} style={showGutter ? { '--markstream-pre-line-number-width': `${width}ch` } : undefined}>
      {showGutter && <span class="pre-code-node__line-numbers" aria-hidden="true">{lines.map((_, index) => `${index + 1}\n`)}</span>}
      <code>{code}</code>
    </pre>
  )
}
