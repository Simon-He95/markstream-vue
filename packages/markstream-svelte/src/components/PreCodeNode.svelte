<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  import { encodeDataPayload, getString, sanitizeClassToken } from './shared/node-helpers'

  type Props = {
    node: SvelteRenderableNode
  };
  let {
    node
  }: Props = $props()

  let languageRaw = $derived(getString((node as any)?.language).trim())
  let language = $derived(sanitizeClassToken(languageRaw))
  let code = $derived(getString((node as any)?.code))
  let diff = $derived(Boolean((node as any)?.diff))
  let loading = $derived((node as any)?.loading === true)
</script>

{#if !(loading && !code.trim())}
  <pre data-markstream-code-block="1" data-markstream-language={languageRaw || undefined} data-markstream-loading={loading ? '1' : undefined} data-markstream-diff={diff ? '1' : undefined} data-markstream-original={diff ? encodeDataPayload(getString((node as any)?.originalCode)) : undefined} data-markstream-updated={diff ? encodeDataPayload(getString((node as any)?.updatedCode)) : undefined} aria-busy={loading ? 'true' : undefined}><code class={language ? `language-${language}` : undefined}>{code}</code></pre>
{/if}
