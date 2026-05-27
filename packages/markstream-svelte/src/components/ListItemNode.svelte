<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import RenderChildren from './RenderChildren.svelte'
  import { getNodeList } from './shared/node-helpers'

  type Props = {
    node: SvelteRenderableNode
    context?: SvelteRenderContext
    indexKey?: string | number
  };
  let {
    node,
    context = undefined,
    indexKey = undefined
  }: Props = $props()
</script>

<li><RenderChildren nodes={getNodeList((node as any)?.children)} {context} prefix={String(indexKey ?? 'li') + '-li'} /></li>
