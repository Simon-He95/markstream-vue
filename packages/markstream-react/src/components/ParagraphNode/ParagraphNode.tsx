import type { ParsedNode } from 'stream-markdown-parser'
import type { NodeComponentProps } from '../../types/node-component'
import React from 'react'
import { BLOCK_LEVEL_TYPES, renderNodeChildren } from '../../renderers/renderChildren'

export function ParagraphNode(props: NodeComponentProps<{ type: 'paragraph', children?: ParsedNode[] }>) {
  const { node, ctx, renderNode, indexKey, children } = props
  if (!ctx || !renderNode) {
    return (
      <p dir="auto" className="paragraph-node">
        {children}
      </p>
    )
  }

  const nodeChildren = node.children ?? []
  const parts: React.ReactNode[] = []
  const inlineBuffer: ParsedNode[] = []

  const flushInline = () => {
    if (!inlineBuffer.length)
      return
    const chunkIndex = parts.length
    parts.push(
      <p key={`${String(indexKey ?? 'paragraph')}-inline-${chunkIndex}`} dir="auto" className="paragraph-node">
        {renderNodeChildren(inlineBuffer.slice(), ctx, `${String(indexKey ?? 'paragraph')}-${chunkIndex}`, renderNode)}
      </p>,
    )
    inlineBuffer.length = 0
  }

  nodeChildren.forEach((child, childIndex) => {
    if (BLOCK_LEVEL_TYPES.has(child.type)) {
      flushInline()
      parts.push(
        <React.Fragment key={`${String(indexKey ?? 'paragraph')}-block-${childIndex}`}>
          {renderNode(child, `${String(indexKey ?? 'paragraph')}-block-${childIndex}`, ctx)}
        </React.Fragment>,
      )
    }
    else {
      inlineBuffer.push(child)
    }
  })
  flushInline()

  if (!parts.length) {
    return (
      <p dir="auto" className="paragraph-node">
        {renderNodeChildren(nodeChildren, ctx, String(indexKey ?? 'paragraph'), renderNode)}
      </p>
    )
  }

  return <>{parts}</>
}

export default ParagraphNode
