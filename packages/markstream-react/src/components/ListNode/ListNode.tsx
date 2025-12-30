import type { NodeComponentProps } from '../../types/node-component'
import clsx from 'clsx'
import React from 'react'
import { ListItemNode } from '../ListItemNode/ListItemNode'

export function ListNode(props: NodeComponentProps<{ type: 'list', ordered?: boolean, start?: number, items?: any[] }>) {
  const { node, ctx, renderNode, indexKey } = props
  const Tag = node.ordered ? 'ol' : 'ul'
  const startAttr = node.ordered && node.start ? node.start : undefined
  return (
    <Tag
      className={clsx(
        'list-node my-5 pl-[calc(13/8*1em)]',
        node.ordered ? 'list-decimal' : 'list-disc max-lg:my-[calc(4/3*1em)] max-lg:pl-[calc(14/9*1em)]',
      )}
      start={startAttr}
    >
      {node.items?.map((item: any, idx: number) => (
        <ListItemNode
          key={`${String(indexKey ?? 'list')}-${idx}`}
          node={item}
          value={node.ordered ? (node.start ?? 1) + idx : undefined}
          ctx={ctx}
          renderNode={renderNode}
          indexKey={`${String(indexKey ?? 'list')}-${idx}`}
        />
      ))}
    </Tag>
  )
}

export default ListNode
