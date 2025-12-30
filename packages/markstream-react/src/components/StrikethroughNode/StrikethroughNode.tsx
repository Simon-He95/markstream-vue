import type { NodeComponentProps } from '../../types/node-component'
import React from 'react'

export function StrikethroughNode(props: NodeComponentProps<{ type: 'strikethrough' }>) {
  return <s className="strikethrough-node">{props.children}</s>
}

export default StrikethroughNode
