<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import RenderChildren from './RenderChildren.svelte'
  import { getNodeList, getString } from './shared/node-helpers'

  interface Props {
    node: SvelteRenderableNode;
    context?: SvelteRenderContext | undefined;
    indexKey?: string | number | undefined;
  }

  let { node, context = undefined, indexKey = undefined }: Props = $props();

  let cite = $derived(getString((node as any)?.cite));
</script>
<blockquote class="blockquote blockquote-node" dir="auto" cite={cite || undefined}><RenderChildren nodes={getNodeList((node as any)?.children)} context={context} prefix={String(indexKey ?? 'blockquote') + '-blockquote'} /></blockquote>
