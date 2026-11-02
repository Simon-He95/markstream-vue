<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import type { StreamingTextScope } from 'markstream-core'
  import { createStreamingTextDom, createStreamingTextScope } from 'markstream-core'
  import { getContext, onMount, untrack } from 'svelte'
  import { getString } from './shared/node-helpers'

  let { node, context, indexKey, typewriter }: { node: SvelteRenderableNode, context?: SvelteRenderContext, indexKey?: string | number, typewriter?: boolean } = $props()
  const scope = getContext<StreamingTextScope | undefined>('markstreamTextFinal')
  const localScope = createStreamingTextScope(work => work())
  const content = $derived(getString(node.code ?? node.content ?? node.raw))
  const initial = untrack(() => content)
  let host: HTMLElement
  let binding = $state<ReturnType<typeof createStreamingTextDom>>()
  onMount(() => {
    binding = createStreamingTextDom(host, initial, scope ?? localScope)
    return () => binding?.dispose()
  })
  $effect(() => {
    if (!scope)
      localScope.setFinal(context?.final === true)
    const key = indexKey == null ? '' : String(indexKey)
    binding?.update(content, context?.fade !== false, key ? context?.textStreamState?.get(key) : undefined)
    if (key)
      context?.textStreamState?.set(key, content)
  })
</script>

<code bind:this={host} class="inline-code-node"><span>{initial}</span></code>
