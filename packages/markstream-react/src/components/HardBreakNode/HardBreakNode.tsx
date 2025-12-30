import type { NodeComponentProps } from '../../types/node-component'
import React from 'react'

export function HardBreakNode(_props: NodeComponentProps<{ type: 'hardbreak' }>) {
  return <br className="hard-break" />
}

export default HardBreakNode
