import type { NodeComponentProps } from '../../types/node-component'
import React from 'react'

export function HtmlInlineNode(props: NodeComponentProps<{
  type: 'html_inline'
  content: string
  loading?: boolean
  autoClosed?: boolean
}>) {
  const { node } = props
  const shouldRenderHtml = !(node.loading && !node.autoClosed)
  if (!shouldRenderHtml) {
    return (
      <span className="html-inline-node html-inline-node--loading">
        {node.content}
      </span>
    )
  }
  return (
    <span
      className="html-inline-node"
      dangerouslySetInnerHTML={{ __html: node.content ?? '' }}
    />
  )
}

export default HtmlInlineNode
