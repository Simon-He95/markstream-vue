import type { ParsedNode } from 'stream-markdown-parser'
import type { NodeComponentProps } from '../../types/node-component'
import React, { useCallback, useMemo } from 'react'
import { sanitizeHtmlAttrs, shouldOpenLinkInNewTab } from 'stream-markdown-parser'
import { renderNodeChildren } from '../../renderers/renderChildren'
import { hideTooltip, showTooltipForAnchor } from '../../tooltip/singletonTooltip'
import { TextNode } from '../TextNode/TextNode'

export interface LinkNodeStyleProps {
  showTooltip?: boolean
  color?: string
  underlineHeight?: number
  underlineBottom?: number | string
  animationDuration?: number
  animationOpacity?: number
  animationTiming?: string
  animationIteration?: string | number
}

export function LinkNode(props: NodeComponentProps<{
  type: 'link'
  href: string
  title: string | null
  text: string
  children?: ParsedNode[]
  loading?: boolean
}> & LinkNodeStyleProps) {
  const { node, ctx, renderNode, indexKey } = props
  const showTip = props.showTooltip !== false
  const isDark = props.isDark ?? ctx?.isDark

  const cssVars = useMemo(() => {
    const bottom = props.underlineBottom !== undefined
      ? (typeof props.underlineBottom === 'number' ? `${props.underlineBottom}px` : String(props.underlineBottom))
      : '-3px'
    const activeOpacity = props.animationOpacity ?? 0.35
    const restingOpacity = Math.max(0.12, Math.min(activeOpacity * 0.5, activeOpacity))
    return {
      ['--link-color' as any]: props.color ?? '#0366d6',
      ['--underline-height' as any]: `${props.underlineHeight ?? 2}px`,
      ['--underline-bottom' as any]: bottom,
      ['--underline-opacity' as any]: String(activeOpacity),
      ['--underline-rest-opacity' as any]: String(restingOpacity),
      ['--underline-duration' as any]: `${props.animationDuration ?? 1.6}s`,
      ['--underline-timing' as any]: props.animationTiming ?? 'ease-in-out',
      ['--underline-iteration' as any]: typeof props.animationIteration === 'number'
        ? String(props.animationIteration)
        : (props.animationIteration ?? 'infinite'),
    } as React.CSSProperties
  }, [
    props.animationDuration,
    props.animationIteration,
    props.animationOpacity,
    props.animationTiming,
    props.color,
    props.underlineBottom,
    props.underlineHeight,
  ])

  const safeHref = useMemo(() => {
    return sanitizeHtmlAttrs({ href: String(node.href ?? '') }).href
  }, [node.href])

  const title = typeof node.title === 'string' && node.title.trim().length > 0
    ? node.title
    : String(safeHref ?? '')
  const openInNewTab = shouldOpenLinkInNewTab(safeHref)

  const onAnchorEnter = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!showTip)
      return
    const target = event.currentTarget as HTMLElement | null
    const txt = String(node.title || safeHref || node.text || '')
    showTooltipForAnchor(target, txt, 'top', false, { x: event.clientX, y: event.clientY }, isDark)
  }, [isDark, node.text, node.title, safeHref, showTip])

  const onAnchorLeave = useCallback(() => {
    if (!showTip)
      return
    hideTooltip()
  }, [showTip])

  if (node.loading) {
    return (
      <span
        className="link-loading inline-flex items-baseline gap-1.5"
        aria-hidden="false"
        style={cssVars}
      >
        <span className="link-text-wrapper relative inline-flex">
          <span className="leading-[normal] link-text">
            <TextNode
              node={{ type: 'text', content: String(node.text ?? '') }}
              ctx={ctx}
              indexKey={`${String(indexKey ?? 'link')}-loading`}
              typewriter={props.typewriter}
            />
          </span>
          <span className="link-loading-indicator" aria-hidden="true" />
        </span>
      </span>
    )
  }

  return (
    <a
      className="link-node"
      href={safeHref || undefined}
      title={showTip ? '' : title}
      aria-label={`Link: ${title}`}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      style={cssVars}
      onMouseEnter={onAnchorEnter}
      onMouseLeave={onAnchorLeave}
    >
      {ctx && renderNode
        ? renderNodeChildren(node.children, ctx, String(indexKey ?? 'link'), renderNode)
        : (
            <TextNode
              node={{ type: 'text', content: String(node.text ?? '') }}
              ctx={ctx}
              indexKey={`${String(indexKey ?? 'link')}-fallback`}
              typewriter={props.typewriter}
            />
          )}
    </a>
  )
}

export default LinkNode
