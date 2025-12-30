import type { NodeComponentProps } from '../../types/node-component'
import React, { useCallback } from 'react'

export interface ReferenceNodeHandlers {
  onClick?: (event: React.MouseEvent, id: string, messageId?: string, threadId?: string) => void
  onMouseEnter?: (event: React.MouseEvent, id: string, messageId?: string, threadId?: string) => void
  onMouseLeave?: (event: React.MouseEvent, id: string, messageId?: string, threadId?: string) => void
}

export function ReferenceNode(
  props: NodeComponentProps<{ type: 'reference', id: string }>
    & { messageId?: string, threadId?: string }
    & ReferenceNodeHandlers,
) {
  const { node } = props
  const handleClick = useCallback((event: React.MouseEvent) => {
    props.onClick?.(event, node.id, props.messageId, props.threadId)
  }, [node.id, props])

  return (
    <span
      className="reference-node cursor-pointer bg-accent text-xs rounded-md px-1.5 mx-0.5 hover:bg-secondary"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onMouseEnter={(event) => {
        props.onMouseEnter?.(event, node.id, props.messageId, props.threadId)
      }}
      onMouseLeave={(event) => {
        props.onMouseLeave?.(event, node.id, props.messageId, props.threadId)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ')
          handleClick(event as any)
      }}
    >
      {node.id}
    </span>
  )
}

export default ReferenceNode
