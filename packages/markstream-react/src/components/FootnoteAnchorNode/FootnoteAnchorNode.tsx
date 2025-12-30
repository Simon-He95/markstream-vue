import type { NodeComponentProps } from '../../types/node-component'
import React, { useCallback } from 'react'

export function FootnoteAnchorNode(props: NodeComponentProps<{ type: 'footnote_anchor', id: string }>) {
  const { node } = props
  const handleScroll = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    if (typeof document === 'undefined')
      return
    const target = document.getElementById(`fnref-${String(node.id ?? '')}`)
    if (target)
      target.scrollIntoView({ behavior: 'smooth' })
  }, [node.id])

  return (
    <a
      className="footnote-anchor text-sm text-[#0366d6] hover:underline cursor-pointer"
      href={`#fnref-${node.id}`}
      title={`Back to reference ${node.id}`}
      onClick={handleScroll}
    >
      ↩︎
    </a>
  )
}

export default FootnoteAnchorNode
