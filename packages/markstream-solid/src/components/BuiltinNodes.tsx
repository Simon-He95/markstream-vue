import type { JSX } from 'solid-js'
import type { NodeComponentProps } from '../customComponents'
import type { ImageNodeProps, LinkNodeProps, MathBlockNodeProps, MathInlineNodeProps } from '../types/component-props'
import { createEffect, createMemo, createSignal, Index, onCleanup, Show } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { isUnsafeHtmlUrl, sanitizeHtmlAttrs, sanitizeImageSrc, shouldOpenLinkInNewTab } from 'stream-markdown-parser'
import { getCustomComponentDisplay, getCustomNodeComponents } from '../customComponents'
import { useSafeI18n } from '../i18n/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../tooltip/singletonTooltip'
import { findFootnoteElement } from '../utils/footnoteTarget'
import { useNodeLifecycle } from './lifecycle'
import { RenderChildren, RichNode } from './RenderNode'
import { getNodeList, getString, splitParagraphChildren } from './shared/node-helpers'
import { useHeavyNodeVisibility } from './viewport'

export function ParagraphNode(props: NodeComponentProps): JSX.Element {
  const parts = createMemo(() => splitParagraphChildren(getNodeList(props.node.children), node => getCustomComponentDisplay((props.context?.customComponents ?? getCustomNodeComponents(props.customId))[String(node.tag ?? node.type)])))
  return <Index each={parts()}>{part => <Show when={part().kind === 'inline'} fallback={<RenderChildren {...props} nodes={[(part() as any).node]} />}><p class="paragraph-node"><RenderChildren {...props} nodes={(part() as any).nodes} /></p></Show>}</Index>
}
export function HeadingNode(props: NodeComponentProps): JSX.Element {
  const attrs = createMemo(() => sanitizeHtmlAttrs(Array.isArray(props.node.attrs) ? Object.fromEntries(props.node.attrs) : props.node.attrs ?? {}, props.context?.htmlPolicy ?? 'safe'))
  return <Dynamic component={`h${Math.min(6, Math.max(1, Number(props.node.level) || 1))}`} {...attrs()} class="heading-node"><RenderChildren {...props} /></Dynamic>
}
export function StrongNode(props: NodeComponentProps): JSX.Element {
  return <strong><RenderChildren {...props} /></strong>
}
export function EmphasisNode(props: NodeComponentProps): JSX.Element {
  return <em><RenderChildren {...props} /></em>
}
export function StrikethroughNode(props: NodeComponentProps): JSX.Element {
  return <del><RenderChildren {...props} /></del>
}
export function HighlightNode(props: NodeComponentProps): JSX.Element {
  return <mark><RenderChildren {...props} /></mark>
}
export function InsertNode(props: NodeComponentProps): JSX.Element {
  return <ins><RenderChildren {...props} /></ins>
}
export function SubscriptNode(props: NodeComponentProps): JSX.Element {
  return <sub><RenderChildren {...props} /></sub>
}
export function SuperscriptNode(props: NodeComponentProps): JSX.Element {
  return <sup><RenderChildren {...props} /></sup>
}
export function BlockquoteNode(props: NodeComponentProps): JSX.Element {
  return <blockquote><RenderChildren {...props} /></blockquote>
}
export function ListNode(props: NodeComponentProps): JSX.Element {
  return <Dynamic component={props.node.ordered ? 'ol' : 'ul'} start={props.node.ordered ? props.node.start : undefined}><RenderChildren {...props} nodes={getNodeList(props.node.items)} /></Dynamic>
}
export function ListItemNode(props: NodeComponentProps): JSX.Element {
  return <li><RenderChildren {...props} /></li>
}
export function HardBreakNode(): JSX.Element {
  return <br />
}
export function ThematicBreakNode(): JSX.Element {
  return <hr />
}
export function InlineCodeNode(props: NodeComponentProps): JSX.Element {
  return <code class="inline-code">{props.node.code ?? props.node.content}</code>
}
export function CheckboxNode(props: NodeComponentProps): JSX.Element {
  return <input type="checkbox" disabled checked={!!props.node.checked} />
}
export function EmojiNode(props: NodeComponentProps): JSX.Element {
  return <span class="emoji-node">{props.node.name ?? props.node.content}</span>
}
export function ReferenceNode(props: NodeComponentProps): JSX.Element {
  return <span class="reference-node" data-markstream-reference-id={String(props.node.id)}>{String(props.node.id)}</span>
}
export function HtmlInlineNode(props: NodeComponentProps): JSX.Element {
  return <RichNode {...props} />
}
export function HtmlBlockNode(props: NodeComponentProps): JSX.Element {
  return <RichNode {...props} />
}
export function MathInlineNode(props: MathInlineNodeProps & Omit<NodeComponentProps, 'node'>): JSX.Element {
  return <RichNode {...props} />
}
export function MathBlockNode(props: MathBlockNodeProps & Omit<NodeComponentProps, 'node'>): JSX.Element {
  return <RichNode {...props} />
}
export function FallbackComponent(props: NodeComponentProps): JSX.Element {
  return <RichNode {...props} />
}
export function VmrContainerNode(props: NodeComponentProps): JSX.Element {
  return <div class={`vmr-container vmr-container-${getString(props.node.name)}`} {...sanitizeHtmlAttrs(props.node.attrs ?? {}, props.context?.htmlPolicy ?? 'safe')}><RenderChildren {...props} /></div>
}
export function DefinitionListNode(props: NodeComponentProps): JSX.Element {
  return (
    <dl class="definition-list">
      <Index each={getNodeList(props.node.items)}>
        {item => (
          <>
            <dt><RenderChildren {...props} nodes={getNodeList(item().term)} /></dt>
            <dd><RenderChildren {...props} nodes={getNodeList(item().definition)} /></dd>
          </>
        )}
      </Index>
    </dl>
  )
}
export function AdmonitionNode(props: NodeComponentProps): JSX.Element {
  return (
    <div class={`admonition-node admonition-${String(props.node.kind ?? 'note')}`}>
      <div class="admonition-title">{props.node.title || props.node.kind || 'Note'}</div>
      <RenderChildren {...props} />
    </div>
  )
}
export function FootnoteNode(props: NodeComponentProps): JSX.Element {
  return <div class="footnote-node" id={`fnref--${props.node.id}`}><RenderChildren {...props} /></div>
}
function followFootnote(event: MouseEvent, id: string) {
  const target = findFootnoteElement(event.currentTarget, id)
  if (target) {
    event.preventDefault()
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}
export function FootnoteReferenceNode(props: NodeComponentProps): JSX.Element {
  return (
    <sup id={`fnref-${props.node.id}`} class="footnote-reference">
      <a class="footnote-link" href={`#fnref--${props.node.id}`} onClick={event => followFootnote(event, `fnref--${props.node.id}`)}>
        [
        {String(props.node.id)}
        ]
      </a>
    </sup>
  )
}
export function FootnoteAnchorNode(props: NodeComponentProps): JSX.Element {
  return <a class="footnote-anchor" href={`#fnref-${props.node.id}`} aria-label={`Return to reference ${props.node.id}`} onClick={event => followFootnote(event, `fnref-${props.node.id}`)}>↩︎</a>
}
export function LinkNode(props: LinkNodeProps & Omit<NodeComponentProps, 'node' | 'indexKey'>): JSX.Element {
  const href = createMemo(() => !props.node.loading && !isUnsafeHtmlUrl(props.node.href) ? props.node.href : undefined)
  const attrs = createMemo(() => sanitizeHtmlAttrs(Array.isArray(props.node.attrs) ? Object.fromEntries(props.node.attrs) : props.node.attrs ?? {}, props.context?.htmlPolicy ?? 'safe', 'a'))
  const target = createMemo(() => href() ? attrs().target || (shouldOpenLinkInNewTab(href()!) ? '_blank' : undefined) : undefined)
  const rel = createMemo(() => target() === '_blank' ? [...new Set(`${attrs().rel ?? ''} noopener noreferrer`.split(/\s+/).filter(Boolean))].join(' ') : attrs().rel)
  const enabled = createMemo(() => props.context?.showTooltips ?? props.showTooltip ?? true)
  const hover: JSX.EventHandler<HTMLAnchorElement, MouseEvent | FocusEvent> = (event) => {
    if (enabled() && href())
      showTooltipForAnchor(event.currentTarget, props.node.title || props.node.href, 'top', false, undefined, props.context?.isDark ?? props.isDark)
  }
  onCleanup(() => hideTooltip(true))
  return <a {...attrs()} class="link-node" href={href()} target={target()} rel={rel()} style={{ '--link-color': props.color, '--underline-height': `${props.underlineHeight ?? 2}px`, '--underline-bottom': typeof props.underlineBottom === 'number' ? `${props.underlineBottom}px` : props.underlineBottom ?? '-3px', '--underline-duration': `${props.animationDuration ?? 1.6}s`, '--underline-opacity': props.animationOpacity ?? 0.35, '--underline-timing': props.animationTiming ?? 'ease-in-out', '--underline-iteration': props.animationIteration ?? 'infinite' }} onMouseEnter={hover} onFocus={hover} onMouseLeave={() => hideTooltip()} onBlur={() => hideTooltip()}><Show when={props.node.children?.length} fallback={props.node.text || props.node.href}><RenderChildren {...props} /></Show></a>
}
export function ImageNode(props: ImageNodeProps & Omit<NodeComponentProps, 'node'> & {
  onLoad?: (src: string) => void
  onError?: (src: string) => void
  onClick?: (payload: [
    Event,
    string,
  ]) => void
}): JSX.Element {
  const { t } = useSafeI18n()
  let imageRoot!: HTMLSpanElement
  const inViewport = useHeavyNodeVisibility(props, () => imageRoot)
  const [src, setSrc] = createSignal('')
  const [loaded, setLoaded] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  let fallback = false
  const safeSrc = createMemo(() => sanitizeImageSrc(props.node.src))
  const safeFallback = createMemo(() => sanitizeImageSrc(props.fallbackSrc))
  createEffect(() => {
    setSrc(safeSrc() || safeFallback() || '')
    void props.node.loading
    fallback = !safeSrc()
    setLoaded(false)
    setFailed(!safeSrc() && !safeFallback())
  })
  useNodeLifecycle(props, () => inViewport() && !!src() && !loaded() && !failed() && !props.node.loading, () => imageRoot)
  createEffect(() => {
    if (!src() || loaded() || failed() || !inViewport())
      return
    const timer = setTimeout(() => setFailed(true), 8000)
    onCleanup(() => clearTimeout(timer))
  })
  function error() {
    if (!fallback && safeFallback() && safeFallback() !== src()) {
      fallback = true
      setSrc(safeFallback())
      return
    }
    setFailed(true)
    props.onError?.(src())
  }
  return (
    <span ref={imageRoot} class="image-node">
      <Show when={!failed()} fallback={<span role="status" class="image-error">{t('image.loadError')}</span>}>
        <Show when={props.usePlaceholder !== false && (!loaded() || props.node.loading)}><span class="image-placeholder" aria-hidden="true">{t('image.loading')}</span></Show>
        <Show when={!props.node.loading && src() && inViewport()}>
          <img
            src={src()}
            alt={props.node.alt}
            title={props.node.title ?? undefined}
            loading={props.lazy ? 'lazy' : 'eager'}
            onLoad={() => {
              setLoaded(true)
              props.onLoad?.(src())
            }}
            onError={error}
            onClick={(event) => {
              event.preventDefault()
              if (loaded())
                props.onClick?.([event, src()])
            }}
          />
        </Show>
      </Show>
    </span>
  )
}
export function TableNode(props: NodeComponentProps): JSX.Element {
  let table!: HTMLTableElement
  let resize: {
    index: number
    x: number
    widths: number[]
  } | undefined
  const [widths, setWidths] = createSignal<number[]>([])
  const headers = createMemo(() => getNodeList(props.node.header?.cells))
  const count = createMemo(() => headers().length)
  function move(event: PointerEvent) {
    if (!resize)
      return
    event.preventDefault()
    const total = resize.widths[resize.index] + resize.widths[resize.index + 1]
    const minimum = Math.min(48, Math.floor(total / 2))
    const width = Math.max(minimum, Math.min(total - minimum, resize.widths[resize.index] + event.clientX - resize.x))
    const next = [...resize.widths]
    next[resize.index] = width
    next[resize.index + 1] = total - width
    setWidths(next)
  }
  function stop() {
    resize = undefined
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
  }
  createEffect(() => {
    count()
    setWidths([])
  })
  onCleanup(() => {
    if (typeof window !== 'undefined')
      stop()
  })
  function start(index: number, event: PointerEvent) {
    if (event.button !== 0)
      return
    const current = [...table.querySelectorAll('thead th')].map(cell => cell.getBoundingClientRect().width)
    if (!current[index] || !current[index + 1])
      return
    event.preventDefault()
    resize = { index, x: event.clientX, widths: current }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }
  return (
    <div class="table-node-wrapper">
      <table ref={table} class="table-node" aria-busy={props.node.loading === true}>
        <Show when={widths().length}><colgroup><Index each={widths()}>{width => <col style={{ width: `${width()}px` }} />}</Index></colgroup></Show>
        <thead>
          <tr>
            <Index each={headers()}>
              {(cell, index) => (
                <th dir="auto" style={{ 'text-align': cell().align }}>
                  <RenderChildren {...props} node={cell()} />
                  <Show when={index < count() - 1}><span class="table-column-resize" role="separator" aria-label={`Resize column ${index + 1}`} aria-orientation="vertical" onPointerDown={event => start(index, event)} /></Show>
                </th>
              )}
            </Index>
          </tr>
        </thead>
        <tbody><Index each={getNodeList(props.node.rows)}>{row => <tr><Index each={getNodeList(row().cells)}>{cell => <td dir="auto" style={{ 'text-align': cell().align }}><RenderChildren {...props} node={cell()} /></td>}</Index></tr>}</Index></tbody>
      </table>
    </div>
  )
}
