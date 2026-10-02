import type { NodeComponentProps } from '../../types/node-component'
import React, { useCallback, useMemo } from 'react'
import { findFootnoteElement } from '../../utils/footnoteTarget'

export function FootnoteReferenceNode(props: NodeComponentProps<{ type: 'footnote_reference', id: string }>) {
  const { node } = props
  const href = useMemo(() => `#fnref--${node.id}`, [node.id])
  const linkAttrs = useMemo(() => ({ href }) as React.HTMLAttributes<HTMLSpanElement> & { href: string }, [href])
  const handleScroll = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    if (typeof document === 'undefined')
      return
    const target = findFootnoteElement(event.currentTarget, `fnref--${node.id}`)
    if (target)
      target.scrollIntoView({ behavior: 'smooth' })
  }, [node.id])

  return (
    <sup id={`fnref-${node.id}`} className="footnote-reference" onClick={handleScroll}>
      <span {...linkAttrs} title={`查看脚注 ${node.id}`} className="footnote-link cursor-pointer">
        [
        {node.id}
        ]
      </span>
    </sup>
  )
}

export default FootnoteReferenceNode
