<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import NodeOutlet from './NodeOutlet.svelte'

  type Props = {
    nodes?: readonly SvelteRenderableNode[] | null
    context?: SvelteRenderContext
    prefix?: string
  };
  let {
    nodes = [],
    context = undefined,
    prefix = 'child',
  }: Props = $props()
</script>

{#each nodes || [] as child, index (prefix + '-' + index)}
  <NodeOutlet node={child} context={context} indexKey={prefix + '-' + index} />
{/each}
