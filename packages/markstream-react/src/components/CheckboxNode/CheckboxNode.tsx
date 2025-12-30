import type { NodeComponentProps } from '../../types/node-component'
import React from 'react'

export function CheckboxNode(props: NodeComponentProps<{ type: 'checkbox' | 'checkbox_input', checked?: boolean }>) {
  const { node } = props
  return (
    <span className="checkbox-node">
      <input
        type="checkbox"
        checked={Boolean(node.checked)}
        disabled
        className="checkbox-input"
        readOnly
      />
    </span>
  )
}

export default CheckboxNode
