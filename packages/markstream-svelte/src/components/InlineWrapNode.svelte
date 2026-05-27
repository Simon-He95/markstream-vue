<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import RenderChildren from './RenderChildren.svelte'
  import { getNodeList } from './shared/node-helpers'

  type Props = {
    node: SvelteRenderableNode
    context?: SvelteRenderContext
    indexKey?: string | number
    tag?: string
  };
  let {
    node,
    context = undefined,
    indexKey = undefined,
    tag = 'span'
  }: Props = $props()
</script>

<svelte:element this={tag}><RenderChildren nodes={getNodeList((node as any)?.children)} {context} prefix={String(indexKey ?? tag) + '-' + tag} /></svelte:element>
