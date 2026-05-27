<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { resolveStreamingTextState } from 'markstream-core'
  import { getString } from './shared/node-helpers'

  interface Props {
    node: SvelteRenderableNode
    context?: SvelteRenderContext
    indexKey?: string | number
  }

  let {
    node,
    context = undefined,
    indexKey = undefined,
  }: Props = $props()

  let previousKey = ''
  let previousCode = ''
  let deltaClass = 'markstream-svelte-text__stream-delta--a'

  const code = $derived(getString((node as any)?.code ?? (node as any)?.content ?? (node as any)?.raw))
  const streamKey = $derived(
    `${String(context?.customId ?? 'global')}:${String(context?.streamRenderVersion ?? 0)}:${String(indexKey ?? 'inline-code')}`,
  )
  const fadeEnabled = $derived(context?.fade !== false)

  const streamInfo = $derived.by(() => {
    const state = context?.textStreamState
    const previous = streamKey === previousKey
      ? previousCode
      : (state?.get(streamKey) ?? '')

    const result = resolveStreamingTextState({
      nextContent: code,
      previousContent: previous,
      typewriterEnabled: fadeEnabled,
    })

    if (result.appended) {
      deltaClass = deltaClass.endsWith('--a')
        ? 'markstream-svelte-text__stream-delta--b'
        : 'markstream-svelte-text__stream-delta--a'
    }

    previousKey = streamKey
    previousCode = code
    state?.set(streamKey, code)

    return {
      stableCode: result.settledContent,
      deltaCode: result.streamedDelta,
      deltaClass,
    }
  })
</script>

<code class="inline-code-node">
  {streamInfo.stableCode}
  {#if streamInfo.deltaCode}
    <span class="markstream-svelte-text__stream-delta text-node-stream-delta {streamInfo.deltaClass}">
      {streamInfo.deltaCode}
    </span>
  {/if}
</code>
