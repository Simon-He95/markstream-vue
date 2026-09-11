import type { SolidRenderableNode, SolidRenderContext } from '../node-helpers'
import { resolveStreamingTextState } from 'markstream-core'
import { createEffect, createMemo, createSignal, on } from 'solid-js'
import { sanitizeHtmlAttrs, sanitizeImageSrc, shouldOpenLinkInNewTab } from 'stream-markdown-parser'
import { useSafeI18n } from '../i18n/useSafeI18n'
import { getNodeList, getString } from '../node-helpers'
import { renderNodeHtml } from '../renderNodeHtml'
import { hideTooltip, showTooltipForAnchor } from '../tooltip/singletonTooltip'
import { RenderChildren } from './RenderChildren'

export interface RichNodeProps { node: SolidRenderableNode, context?: SolidRenderContext, indexKey?: string | number }

function renderedHtml(node: SolidRenderableNode, context?: SolidRenderContext) {
  return renderNodeHtml(node, context)
}

export function HtmlBlockNode(props: RichNodeProps) {
  return <div innerHTML={renderedHtml(props.node, props.context)} />
}
export function HtmlInlineNode(props: RichNodeProps) {
  return <span innerHTML={renderedHtml(props.node, props.context)} />
}
export function TableNode(props: RichNodeProps) {
  return <div innerHTML={renderedHtml(props.node, props.context)} />
}
export function DefinitionListNode(props: RichNodeProps) {
  return <div innerHTML={renderedHtml(props.node, props.context)} />
}
export function AdmonitionNode(props: RichNodeProps) {
  return <div innerHTML={renderedHtml(props.node, props.context)} />
}
export function ReferenceNode(props: RichNodeProps) {
  return <span innerHTML={renderedHtml(props.node, props.context)} />
}
export function VmrContainerNode(props: RichNodeProps) {
  return <div innerHTML={renderedHtml(props.node, props.context)} />
}

export function LinkNode(props: RichNodeProps & { showTooltip?: boolean }) {
  const href = () => sanitizeHtmlAttrs({ href: getString((props.node as any).href) }, 'safe', 'a').href || ''
  const children = () => getNodeList((props.node as any).children)
  const title = () => getString((props.node as any).title || href())
  const scrollToHash = (event: MouseEvent) => {
    if (!href().startsWith('#') || href().length < 2 || typeof document === 'undefined')
      return
    event.preventDefault()
    const raw = href().slice(1)
    let decoded = raw
    try {
      decoded = decodeURIComponent(raw)
    }
    catch {}
    ;(document.getElementById(raw) || document.getElementById(decoded))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const tooltipEnabled = () => props.showTooltip ?? props.context?.showTooltips ?? true
  const showTooltip = (event: MouseEvent | FocusEvent) => {
    if (tooltipEnabled() && title())
      showTooltipForAnchor(event.currentTarget as HTMLElement, title(), 'top', false, undefined, props.context?.isDark)
  }
  return (
    <a class={`link-node${(props.node as any).loading ? ' link-loading' : ''}`} href={href() || undefined} title={!tooltipEnabled() ? title() : undefined} onClick={scrollToHash} onFocus={showTooltip} onMouseEnter={showTooltip} onBlur={() => hideTooltip()} onMouseLeave={() => hideTooltip()} target={shouldOpenLinkInNewTab(href()) ? '_blank' : undefined} rel={shouldOpenLinkInNewTab(href()) ? 'noreferrer noopener' : undefined}>
      <span class="link-text-wrapper">
        <span class="link-text">{children().length ? <RenderChildren nodes={children()} context={props.context} prefix={`${props.indexKey ?? 'link'}-link`} /> : getString((props.node as any).text || href())}</span>
        {(props.node as any).loading && <span class="link-loading-indicator" />}
      </span>
    </a>
  )
}

export function ImageNode(props: RichNodeProps & { fallbackSrc?: string, lazy?: boolean, usePlaceholder?: boolean }) {
  const { t } = useSafeI18n()
  const [src, setSrc] = createSignal('')
  const [failed, setFailed] = createSignal(false)
  const primary = () => sanitizeImageSrc((props.node as any).src)
  const fallback = () => sanitizeImageSrc(props.fallbackSrc || '')
  const isLoading = () => Boolean((props.node as any).loading)
  createEffect(on([primary, fallback, isLoading], () => {
    setSrc(primary() || fallback())
    setFailed(!isLoading() && !primary() && !fallback())
  }, { defer: false }))
  const onError = () => {
    if (isLoading())
      return
    if (src() === primary() && fallback() && fallback() !== src())
      setSrc(fallback())
    else setFailed(true)
  }
  return (
    <span class={`image-node-container${isLoading() ? ' is-rendering' : ''}`}>
      {!isLoading() && !failed() && src()
        ? <img class="image-node__img is-loaded" src={src()} alt={getString((props.node as any).alt)} title={getString((props.node as any).title) || undefined} loading={props.lazy ? 'lazy' : undefined} decoding={props.lazy ? 'async' : 'sync'} onError={onError} />
        : failed()
          ? <span class="image-error">{t('image.loadError')}</span>
          : (
              <span class="image-placeholder" data-markstream-image-loading="1">
                {props.usePlaceholder === false
                  ? <span class="image-node__raw-text">{getString((props.node as any).raw)}</span>
                  : (
                      <>
                        <span class="image-shimmer" />
                        <span class="image-loading">
                          <span class="mermaid-spinner" />
                          {t('image.loading')}
                        </span>
                      </>
                    )}
              </span>
            )}
    </span>
  )
}

export function InlineCodeNode(props: RichNodeProps) {
  let previousKey = ''
  let previousCode = ''
  const result = createMemo(() => {
    const code = getString((props.node as any).code ?? (props.node as any).content ?? (props.node as any).raw)
    const key = `${props.context?.customId ?? 'global'}:${props.context?.streamRenderVersion ?? 0}:${props.indexKey ?? 'inline-code'}`
    const state = resolveStreamingTextState({ nextContent: code, previousContent: key === previousKey ? previousCode : (props.context?.textStreamState?.get(key) ?? ''), typewriterEnabled: props.context?.fade !== false })
    previousKey = key
    previousCode = code
    props.context?.textStreamState?.set(key, code)
    return state
  })
  return (
    <code class="inline-code-node">
      {result().settledContent}
      {result().streamedDelta && <span class="markstream-solid-text__stream-delta text-node-stream-delta">{result().streamedDelta}</span>}
    </code>
  )
}

export function FootnoteNode(props: RichNodeProps) {
  const id = () => getString((props.node as any).id)
  return <div id={id() ? `fnref--${id()}` : undefined} class="footnote-node"><div class="footnote-node__content"><RenderChildren nodes={getNodeList((props.node as any).children)} context={props.context} prefix={`footnote-${props.indexKey ?? (id() || 'node')}`} /></div></div>
}
export function FootnoteReferenceNode(props: RichNodeProps) {
  const id = () => getString((props.node as any).id)
  return (
    <sup id={id() ? `fnref-${id()}` : undefined} class="footnote-reference">
      <a class="footnote-link cursor-pointer" href={id() ? `#fnref--${id()}` : undefined}>
        [
        {id()}
        ]
      </a>
    </sup>
  )
}
export function FootnoteAnchorNode(props: RichNodeProps) {
  const id = () => getString((props.node as any).id)
  return <a class="footnote-anchor" href={id() ? `#fnref-${id()}` : undefined}>↩︎</a>
}
