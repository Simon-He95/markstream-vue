import type { NodeComponentProps } from '../../types/node-component'
import React from 'react'

export function SuperscriptNode(props: NodeComponentProps<{ type: 'superscript' }>) {
  return <sup className="superscript-node">{props.children}</sup>
}

export default SuperscriptNode
