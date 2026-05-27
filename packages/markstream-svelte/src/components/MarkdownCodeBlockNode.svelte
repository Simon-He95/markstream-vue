<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import CodeBlockNode from './CodeBlockNode.svelte'

  type Props = {
    node: SvelteRenderableNode
    context?: SvelteRenderContext
  };
  let {
    node,
    context = undefined
  }: Props = $props()
</script>

<CodeBlockNode {node} {context} />
