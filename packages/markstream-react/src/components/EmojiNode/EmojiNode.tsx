import type { NodeComponentProps } from '../../types/node-component'
import React from 'react'

export function EmojiNode(props: NodeComponentProps<{ type: 'emoji', name: string, markup?: string }>) {
  const { node } = props
  return (
    <span className="emoji-node">
      {node.name ?? node.markup}
    </span>
  )
}

export default EmojiNode
