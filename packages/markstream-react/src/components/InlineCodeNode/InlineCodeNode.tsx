import type { NodeComponentProps } from '../../types/node-component'
import React from 'react'

export function InlineCodeNode(props: NodeComponentProps<{ type: 'inline_code', code: string }>) {
  const { node } = props
  return (
    <code className="inline-code inline text-[85%] px-1 py-0.5 rounded font-mono bg-secondary whitespace-normal break-words max-w-full">
      {node.code}
    </code>
  )
}

export default InlineCodeNode
