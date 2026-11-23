<script lang="ts">
  import type { CodeBlockOptions, SvelteCodeBlockNodeExposed } from '../../src/types/codeBlock'
  import type { SvelteRenderableNode } from '../../src/components/shared/node-helpers'
  import CodeBlockNode from '../../src/components/CodeBlockNode.svelte'

  let {
    node,
    loading = false,
    stream = true,
    codeBlockOptions = undefined,
  }: {
    node: SvelteRenderableNode
    loading?: boolean
    stream?: boolean
    codeBlockOptions?: CodeBlockOptions | undefined
  } = $props()

  let codeBlock: SvelteCodeBlockNodeExposed | undefined = $state()

  export function getHandle() {
    return codeBlock
  }
</script>

<CodeBlockNode bind:this={codeBlock} {node} {loading} {stream} {codeBlockOptions} />
