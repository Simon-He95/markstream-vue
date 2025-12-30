import type { NodeComponentProps } from '../../types/node-component'
import clsx from 'clsx'
import React from 'react'

export function TextNode(props: NodeComponentProps<{ type: 'text', content: string, center?: boolean }>) {
  const { node, children } = props
  return (
    <span
      className={clsx(
        'text-node whitespace-pre-wrap break-words',
        node.center && 'text-node-center',
      )}
    >
      {children ?? node.content}
    </span>
  )
}

export default TextNode
