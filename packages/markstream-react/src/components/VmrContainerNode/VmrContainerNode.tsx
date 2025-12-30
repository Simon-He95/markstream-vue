import type { ParsedNode } from 'stream-markdown-parser'
import type { NodeComponentProps } from '../../types/node-component'
import React, { useMemo } from 'react'
import { tokenAttrsToProps } from '../../renderers/renderChildren'

export function VmrContainerNode(props: NodeComponentProps<{
  type: 'vmr_container'
  name: string
  attrs?: Record<string, string> | [string, string | null][] | null
  children?: ParsedNode[]
}>) {
  const { node, ctx, renderNode, indexKey } = props
  const containerClass = `vmr-container vmr-container-${node.name}`
  const boundAttrs = useMemo(() => {
    if (!node.attrs)
      return undefined
    if (Array.isArray(node.attrs))
      return tokenAttrsToProps(node.attrs as any)
    return node.attrs as any
  }, [node.attrs])

  return (
    <div className={containerClass} {...(boundAttrs as any)}>
      {(ctx && renderNode && Array.isArray(node.children))
        ? node.children.map((child, idx) => (
            <React.Fragment key={`${String(indexKey ?? 'vmr-container')}-${idx}`}>
              {renderNode(child, `${String(indexKey ?? 'vmr-container')}-${idx}`, ctx)}
            </React.Fragment>
          ))
        : null}
    </div>
  )
}

export default VmrContainerNode
