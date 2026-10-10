<script lang="ts">
  import type { ClipboardHarnessOptions } from '../../../../test/setup/clipboard-contract'
  import { untrack } from 'svelte'
  import NodeRenderer from '../../src/components/NodeRenderer.svelte'
  import { clipboardNodes, clipboardRendererProps } from '../../../../test/setup/clipboard-contract'

  let { code, clipboardWriter, onCopy, nested }: ClipboardHarnessOptions = $props()
  let currentCode = $state(untrack(() => code))

  export function updateCode(text: string) {
    currentCode = text
  }
</script>

<NodeRenderer
  {...clipboardRendererProps}
  nodes={clipboardNodes(currentCode, nested)}
  codeBlockProps={{ clipboardWriter }}
  {onCopy}
/>
