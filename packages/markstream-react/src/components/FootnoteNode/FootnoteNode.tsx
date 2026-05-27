import type { ParsedNode } from 'stream-markdown-parser'
import type { NodeComponentProps } from '../../types/node-component'
import React from 'react'
import { renderNodeChildren } from '../../renderers/renderChildren'

export function FootnoteNode(props: NodeComponentProps<{ type: 'footnote', id: string, children?: ParsedNode[] }>) {
  const { node, ctx, renderNode, indexKey } = props
  return (
    <div id={`fnref--${node.id}`} className="footnote-node flex text-sm leading-relaxed border-t border-[var(--footnote-border,#eaecef)] pt-2">
      <div className="flex-1">
        {ctx && renderNode ? renderNodeChildren(node.children, ctx, String(indexKey ?? `footnote-${node.id}`), renderNode) : null}
      </div>
    </div>
  )
}

export default FootnoteNode
