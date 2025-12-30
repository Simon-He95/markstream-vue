import type { NodeComponentProps } from '../../types/node-component'
import React from 'react'
import { renderInline } from '../../renderers/renderChildren'

export function DefinitionListNode(props: NodeComponentProps<{ type: 'definition_list', items?: any[] }>) {
  const { node, ctx, renderNode, indexKey } = props
  const items = Array.isArray(node.items) ? node.items : []
  return (
    <dl className="definition-list" data-index-key={indexKey}>
      {items.map((item: any, idx: number) => (
        <div key={`${String(indexKey ?? 'definition')}-${idx}`} className="mb-4">
          <dt className="definition-term font-semibold">
            {ctx && renderNode ? renderInline(item.term, ctx, `${String(indexKey ?? 'definition')}-term-${idx}`, renderNode) : null}
          </dt>
          <dd className="definition-desc ml-4">
            {ctx && renderNode ? renderInline(item.definition, ctx, `${String(indexKey ?? 'definition')}-desc-${idx}`, renderNode) : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default DefinitionListNode
