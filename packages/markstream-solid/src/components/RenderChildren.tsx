import type { SolidRenderableNode, SolidRenderContext } from '../node-helpers'
import { Index } from 'solid-js'
import { NodeOutlet } from './NodeOutlet'

export interface RenderChildrenProps { nodes?: readonly SolidRenderableNode[] | null, context?: SolidRenderContext, prefix?: string }

export function RenderChildren(props: RenderChildrenProps) {
  // Parser output is recreated for each content update. Slots are position based
  // in the Svelte baseline, so Index preserves a component owner for append-only
  // streams while still updating its node prop.
  return (
    <Index each={props.nodes || []}>
      {(node, index) => (
        <div class="node-slot" data-node-index={index} data-node-type={String((node() as any)?.type || '')}>
          <NodeOutlet node={node()} context={props.context} indexKey={`${props.prefix || 'child'}-${index}`} />
        </div>
      )}
    </Index>
  )
}
