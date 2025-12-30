import type { ParsedNode } from 'stream-markdown-parser'
import type { NodeComponentProps } from '../../types/node-component'
import clsx from 'clsx'
import React from 'react'
import { renderNodeChildren } from '../../renderers/renderChildren'

export function HeadingNode(props: NodeComponentProps<{ type: 'heading', level?: number, children?: ParsedNode[] }>) {
  const { node, ctx, renderNode, indexKey, children } = props
  const level = Math.min(6, Math.max(1, Number(node.level) || 1))
  const Tag = (`h${level}`) as keyof JSX.IntrinsicElements

  return (
    <Tag
      dir="auto"
      className={clsx('heading-node font-semibold', `heading-${level}`)}
    >
      {children ?? (ctx && renderNode
        ? renderNodeChildren(node.children, ctx, String(indexKey ?? `heading-${level}`), renderNode)
        : null)}
    </Tag>
  )
}

export default HeadingNode
