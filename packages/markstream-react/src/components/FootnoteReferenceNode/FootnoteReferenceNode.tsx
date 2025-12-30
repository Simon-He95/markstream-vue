import type { NodeComponentProps } from '../../types/node-component'
import React, { useCallback, useMemo } from 'react'

export function FootnoteReferenceNode(props: NodeComponentProps<{ type: 'footnote_reference', id: string }>) {
  const { node } = props
  const href = useMemo(() => `#footnote-${node.id}`, [node.id])
  const handleScroll = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    if (typeof document === 'undefined')
      return
    const target = document.querySelector(href)
    if (target)
      target.scrollIntoView({ behavior: 'smooth' })
  }, [href])

  return (
    <sup id={`fnref-${node.id}`} className="footnote-reference" onClick={handleScroll}>
      <a href={href} title={`View footnote ${node.id}`} className="footnote-link cursor-pointer">
        [
        {node.id}
        ]
      </a>
    </sup>
  )
}

export default FootnoteReferenceNode
