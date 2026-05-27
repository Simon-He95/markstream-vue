<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import RenderChildren from './RenderChildren.svelte'
  import NodeOutlet from './NodeOutlet.svelte'
  import { getNodeList, splitParagraphChildren } from './shared/node-helpers'

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

  let prefix = $derived(String(indexKey ?? 'p'))
  let parts = $derived(splitParagraphChildren(getNodeList((node as any)?.children)))
</script>

{#each parts as part, index (prefix + '-' + index)}
  {#if part.kind === 'inline'}
    <p class="paragraph-node"><RenderChildren nodes={part.nodes} {context} prefix={prefix + '-' + index} /></p>
  {:else}
    <NodeOutlet node={part.node} {context} indexKey={prefix + '-' + index} />
  {/if}
{/each}
