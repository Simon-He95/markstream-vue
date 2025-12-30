import type { NodeComponentProps } from '../../types/node-component'
import React from 'react'

export function SubscriptNode(props: NodeComponentProps<{ type: 'subscript' }>) {
  return <sub className="subscript-node">{props.children}</sub>
}

export default SubscriptNode
