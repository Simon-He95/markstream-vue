import type { NodeComponentProps } from '../../types/node-component'
import * as Octane from 'octane'
import { useCallback } from 'octane'
import { findFootnoteElement } from '../../utils/footnoteTarget'

export function FootnoteAnchorNode(props: NodeComponentProps<{ type: 'footnote_anchor', id: string }>) {
  const { node } = props
  const handleScroll = useCallback((event: MouseEvent) => {
    event.preventDefault()
    if (typeof document === 'undefined')
      return
    const target = findFootnoteElement(event.currentTarget, `fnref-${String(node.id ?? '')}`)
    if (target)
      target.scrollIntoView({ behavior: 'smooth' })
  }, [node.id])

  return (
    <a
      className="footnote-anchor text-sm hover:underline cursor-pointer"
      href={`#fnref-${node.id}`}
      title={`返回引用 ${node.id}`}
      onClick={handleScroll}
    >
      ↩︎
    </a>
  )
}

export default FootnoteAnchorNode
