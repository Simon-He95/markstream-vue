import type { ParsedNode } from 'stream-markdown-parser'
import type { NodeComponentProps } from '../../types/node-component'
import React, { useCallback, useMemo } from 'react'
import { renderNodeChildren } from '../../renderers/renderChildren'
import { hideTooltip, showTooltipForAnchor } from '../../tooltip/singletonTooltip'

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
    return {
      ['--link-color' as any]: props.color ?? '#0366d6',
      ['--underline-height' as any]: `${props.underlineHeight ?? 2}px`,
      ['--underline-bottom' as any]: bottom,
      ['--underline-opacity' as any]: String(props.animationOpacity ?? 0.9),
      ['--underline-duration' as any]: `${props.animationDuration ?? 0.8}s`,
      ['--underline-timing' as any]: props.animationTiming ?? 'linear',
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

  const title = String(node.title ?? node.href ?? '')

  const onAnchorEnter = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!showTip)
      return
    const target = event.currentTarget as HTMLElement | null
    const txt = String(node.title || node.href || node.text || '')
    showTooltipForAnchor(target, txt, 'top', false, { x: event.clientX, y: event.clientY }, isDark)
  }, [isDark, node.href, node.text, node.title, showTip])

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
            <span className="leading-[normal] link-text">{node.text ?? ''}</span>
          </span>
          <span className="underline-anim" aria-hidden="true" />
        </span>
      </span>
    )
  }

  return (
    <a
      className="link-node"
      href={node.href}
      title={showTip ? '' : title}
      aria-label={`Link: ${title}`}
      target="_blank"
      rel="noopener noreferrer"
      style={cssVars}
      onMouseEnter={onAnchorEnter}
      onMouseLeave={onAnchorLeave}
    >
      {ctx && renderNode
        ? renderNodeChildren(node.children, ctx, String(indexKey ?? 'link'), renderNode)
        : (node.text ?? null)}
    </a>
  )
}

export default LinkNode
