<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { renderNodeHtml } from './shared/renderNodeHtml'
  
  interface Props {
    node: SvelteRenderableNode;
    context?: SvelteRenderContext;
  }
  
  let { node, context }: Props = $props();
  
  let html = $derived(renderNodeHtml(node, context));
</script>
{@html html}
