import type { JSX } from 'solid-js'
import type { SolidRenderableNode, SolidRenderContext } from './shared/node-helpers'
import { createEffect, createSignal, onCleanup, onMount, sharedConfig, Show } from 'solid-js'
import { isServer } from 'solid-js/web'
import { RenderNode } from './RenderNode'

export function NodeSlot(props: {
  node: SolidRenderableNode
  index: number
  indexKey: string
  context: SolidRenderContext
  defer: boolean
  margin: string
  estimatedHeight: number
}): JSX.Element {
  let slot!: HTMLDivElement
  const [ready, setReady] = createSignal(isServer || !!sharedConfig.context || !props.defer)
  onMount(() => {
    createEffect(() => {
      if (!props.defer || typeof IntersectionObserver === 'undefined') {
        setReady(true)
        return
      }
      if (ready())
        return
      const observer = new IntersectionObserver((entries) => {
        if (entries.some(entry => entry.isIntersecting)) {
          setReady(true)
          observer.disconnect()
        }
      }, { rootMargin: props.margin })
      observer.observe(slot)
      onCleanup(() => observer.disconnect())
    })
  })
  return <div ref={slot} class="node-slot" data-node-index={props.index} data-node-type={props.node.type} data-node-deferred={!ready() ? 'true' : undefined} style={{ 'min-height': ready() ? undefined : `${props.estimatedHeight}px` }}><Show when={ready()}><div class="node-content" classList={{ 'fade-node': props.context.fade !== false && props.node.type !== 'code_block' }}><RenderNode node={props.node} context={props.context} indexKey={props.indexKey} /></div></Show></div>
}
