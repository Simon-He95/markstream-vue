<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { renderNodeHtml } from './shared/renderNodeHtml'

  interface Props {
    node: SvelteRenderableNode;
    context?: SvelteRenderContext | undefined;
  }

  let { node, context = undefined }: Props = $props();

  let html = $derived(renderNodeHtml(node, context));
</script>
{@html html}
