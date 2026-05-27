<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  import { getString } from './shared/node-helpers'

  interface Props {
    node: SvelteRenderableNode;
  }

  let { node }: Props = $props();

  let value = $derived(getString((node as any)?.raw || (node as any)?.markup || (node as any)?.content || (node as any)?.name));
</script>
<span class="emoji-node">{value}</span>
