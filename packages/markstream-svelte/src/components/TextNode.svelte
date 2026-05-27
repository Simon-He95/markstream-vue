<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { resolveStreamingTextState } from 'markstream-core'
  import { getString } from './shared/node-helpers'

  interface Props {
    node: SvelteRenderableNode
    context?: SvelteRenderContext
    indexKey?: string | number
    typewriter?: boolean
  }

  let {
    node,
    context = undefined,
    indexKey = undefined,
    typewriter = undefined
  }: Props = $props()

  let previousKey = ''
  let previousContent = ''
  let deltaClass = 'markstream-svelte-text__stream-delta--a'

  const content = $derived(getString((node as any)?.content ?? (node as any)?.raw))
  const centered = $derived(Boolean((node as any)?.center))
  const streamKey = $derived(String(context?.customId ?? 'global') + ':' + String(context?.streamRenderVersion ?? 0) + ':' + String(indexKey ?? 'node'))
  const fadeEnabled = $derived(context?.fade !== false)

  const streamInfo = $derived.by(() => {
    const state = context?.textStreamState
    const previous = streamKey === previousKey ? previousContent : (state?.get(streamKey) ?? '')

    const result = resolveStreamingTextState({
      nextContent: content,
      previousContent: previous,
      typewriterEnabled: fadeEnabled,
    })

    if (result.appended)
      deltaClass = deltaClass.endsWith('--a') ? 'markstream-svelte-text__stream-delta--b' : 'markstream-svelte-text__stream-delta--a'

    previousKey = streamKey
    previousContent = content
    state?.set(streamKey, content)

    return { stableContent: result.settledContent, deltaContent: result.streamedDelta, deltaClass }
  })
</script>

<span data-typewriter={context?.typewriter === true ? '1' : undefined} class:markstream-svelte-text--centered={centered} class="markstream-svelte-text-node text-node">{streamInfo.stableContent}{#if streamInfo.deltaContent}<span class="markstream-svelte-text__stream-delta text-node-stream-delta {streamInfo.deltaClass}">{streamInfo.deltaContent}</span>{/if}</span>
