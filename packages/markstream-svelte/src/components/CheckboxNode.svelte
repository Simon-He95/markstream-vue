<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  
  type Props = { node: SvelteRenderableNode };
  let { node }: Props = $props()
</script>
<input class="checkbox-node" type="checkbox" disabled checked={Boolean((node as any)?.checked)} />
