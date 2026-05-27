<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import RenderChildren from './RenderChildren.svelte'
  import { getNodeList, getString } from './shared/node-helpers'

  interface Props {
    node: SvelteRenderableNode
    context?: SvelteRenderContext
    indexKey?: string | number
  }

  let { node, context = undefined, indexKey = undefined }: Props = $props()

  let id = $derived(getString((node as any)?.id))
  let children = $derived(getNodeList((node as any)?.children))
  let prefix = $derived(`footnote-${indexKey ?? (id || 'node')}`)
</script>

<div id={id ? `fnref--${id}` : undefined} class="footnote-node">
  <div class="footnote-node__content">
    <RenderChildren nodes={children} {context} {prefix} />
  </div>
</div>
