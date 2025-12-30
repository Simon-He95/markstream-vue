import type { ParsedNode } from 'stream-markdown-parser'
import type { NodeComponentProps } from '../../types/node-component'
import React from 'react'
import { renderNodeChildren } from '../../renderers/renderChildren'

export interface ListItemNodeData {
  type: 'list_item'
  children?: ParsedNode[]
  raw?: string
}

export interface ListItemNodeProps extends NodeComponentProps<ListItemNodeData> {
  value?: number
}

export function ListItemNode(props: ListItemNodeProps) {
  const { node, ctx, renderNode, value, indexKey, children } = props
  const valueAttr = value == null ? undefined : value
  return (
    <li className="list-item pl-1.5 my-2" dir="auto" value={valueAttr}>
      {children ?? (ctx && renderNode
        ? renderNodeChildren(node.children, ctx, String(indexKey ?? 'list-item'), renderNode)
        : null)}
    </li>
  )
}

export default ListItemNode
