import type { NodeComponentProps } from '../customComponents'
import { createStreamingTextDom, createStreamingTextScope } from 'markstream-core'
import { createEffect, onCleanup, onMount, untrack, useContext } from 'solid-js'
import { getString } from './shared/node-helpers'
import { TextFinalContext } from './textFinal'

export function StreamingTextNode(props: NodeComponentProps & { inlineCode?: boolean }) {
  const scope = useContext(TextFinalContext)
  const localScope = createStreamingTextScope(work => work())
  const content = () => getString(props.inlineCode ? props.node.code ?? props.node.content ?? props.node.raw : props.node.content ?? props.node.raw)
  const initial = untrack(content)
  let host!: HTMLElement
  let binding: ReturnType<typeof createStreamingTextDom> | undefined
  const update = () => {
    if (!scope)
      localScope.setFinal(props.context?.final === true)
    binding?.update(content(), props.context?.fade !== false)
  }
  onMount(() => {
    binding = createStreamingTextDom(host, initial, scope ?? localScope)
    update()
  })
  createEffect(update)
  onCleanup(() => binding?.dispose())
  return props.inlineCode
    ? <code ref={host} class="inline-code"><span>{initial}</span></code>
    : <span ref={host} class="text-node markstream-solid-text-node" classList={{ 'markstream-solid-text--centered': !!props.node.center }} data-typewriter={props.context?.typewriter ? '1' : undefined}><span>{initial}</span></span>
}
