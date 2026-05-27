<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import InlineWrapNode from './InlineWrapNode.svelte'

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

<InlineWrapNode {node} {context} {indexKey} tag="sub" />
