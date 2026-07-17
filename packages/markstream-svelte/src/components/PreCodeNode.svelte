<script lang="ts">
  import type { DiffPreviewCollapseOptions } from 'markstream-core'
  import type { SvelteRenderableNode } from './shared/node-helpers'
  import { buildDiffPreviewPanes } from 'markstream-core'
  import { encodeDataPayload, getString, sanitizeClassToken } from './shared/node-helpers'

  type Props = {
    node: SvelteRenderableNode
    class?: string
    diffHideUnchangedRegions?: boolean | DiffPreviewCollapseOptions
    diffInline?: boolean
    showLineNumbers?: boolean
  }

  let {
    node,
    class: className = '',
    diffHideUnchangedRegions = undefined,
    diffInline = false,
    showLineNumbers = false,
  }: Props = $props()

  let languageRaw = $derived(getString((node as any)?.language).trim())
  let language = $derived(sanitizeClassToken(languageRaw) || 'plaintext')
  let loading = $derived((node as any)?.loading === true)
  let diff = $derived(Boolean((node as any)?.diff))
  let code = $derived.by(() => {
    const value = getString((node as any)?.code)
    return loading ? value : value.replace(/\r\n$|\n$|\r$/, '')
  })
  let lineNumbers = $derived(code.split(/\r\n|\n|\r/).map((_, index) => index + 1).join('\n'))
  let isDiffPreview = $derived(showLineNumbers && diff)
  let diffPanes = $derived(isDiffPreview
    ? buildDiffPreviewPanes({
        code: (node as any)?.code,
        hideUnchangedRegions: diffHideUnchangedRegions,
        inline: diffInline,
        language: languageRaw,
        loading,
        originalCode: (node as any)?.originalCode,
        raw: (node as any)?.raw,
        updatedCode: (node as any)?.updatedCode,
      })
    : [])
  let hasCollapsedRows = $derived(diffPanes.some(pane => pane.lines.some(line => line.kind === 'collapsed')))
</script>

{#if !(loading && !code.trim())}
  <pre
    class={[`language-${language}`, className, showLineNumbers ? 'markstream-pre--line-numbers' : '', isDiffPreview ? 'markstream-pre--diff-preview' : '', isDiffPreview && diffInline ? 'markstream-pre--diff-inline' : '', hasCollapsedRows ? 'markstream-pre--diff-collapsed' : ''].filter(Boolean).join(' ')}
    data-markstream-code-block="1"
    data-markstream-language={languageRaw || undefined}
    data-markstream-loading={loading ? '1' : undefined}
    data-markstream-diff={diff ? '1' : undefined}
    data-markstream-original={diff ? encodeDataPayload(getString((node as any)?.originalCode)) : undefined}
    data-markstream-updated={diff ? encodeDataPayload(getString((node as any)?.updatedCode)) : undefined}
    data-markstream-line-numbers={showLineNumbers ? '1' : undefined}
    aria-busy={loading ? 'true' : undefined}
  >{#if isDiffPreview}<code translate="no" class="markstream-pre__diff-code">{#each diffPanes as pane (pane.key)}<span class={`markstream-pre__diff-pane ${pane.className}`}><span class="markstream-pre__diff-pane-content">{#each pane.lines as line (line.key)}<span class={`markstream-pre__diff-line markstream-pre__diff-line--${line.kind}${line.empty ? ' markstream-pre__diff-line--empty' : ''}`}><span class="markstream-pre__diff-rail" aria-hidden="true"></span><span class="markstream-pre__diff-number" aria-hidden="true">{line.number}</span><span class="markstream-pre__diff-content"><span class="markstream-pre__diff-content-inner">{line.code}</span></span></span>{/each}</span></span>{/each}</code>{:else}{#if showLineNumbers}<span class="markstream-pre__line-numbers" aria-hidden="true"><span class="markstream-pre__line-numbers-text">{lineNumbers}</span></span>{/if}<code translate="no" class="markstream-pre__code">{code}</code>{/if}</pre>
{/if}
