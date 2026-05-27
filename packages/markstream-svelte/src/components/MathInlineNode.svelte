<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  import { onDestroy } from 'svelte'
  import { getKatex } from '../optional/katex'
  import { normalizeKaTeXRenderInput } from '../utils/normalizeKaTeXRenderInput'
  import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../workers/katexWorkerClient'
  import { getString } from './shared/node-helpers'

  type Props = { node: SvelteRenderableNode }
  let { node }: Props = $props()

  let mathEl: HTMLSpanElement | null = $state(null)
  let loading = $state(true)
  let destroyed = false
  let renderVersion = 0
  let hasRenderedOnce = false

  let source = $derived(getString((node as any)?.content || (node as any)?.markup || (node as any)?.raw))
  let raw = $derived(getString((node as any)?.raw || source))
  let nodeLoading = $derived((node as any)?.loading === true)
  let displayMode = $derived(String((node as any)?.markup || '') === '$$')

  $effect(() => {
    if (mathEl) {
      void renderMath(source, raw, nodeLoading, displayMode)
    }
  })

  onDestroy(() => {
    destroyed = true
    renderVersion += 1
  })

  async function renderMath(currentSource: string, currentRaw: string, currentLoading: boolean, currentDisplayMode: boolean) {
    const target = mathEl
    if (!target)
      return

    const content = normalizeKaTeXRenderInput(currentSource)
    const version = ++renderVersion
    if (!content) {
      target.textContent = ''
      loading = false
      return
    }

    if (!hasRenderedOnce)
      loading = true

    const html = await resolveKatexMarkup(content, currentDisplayMode, currentLoading)
    if (destroyed || version !== renderVersion)
      return

    if (html) {
      target.innerHTML = html
      hasRenderedOnce = true
      loading = false
    }
    else if (!currentLoading) {
      target.textContent = currentRaw || content
      loading = false
    }
  }

  async function resolveKatexMarkup(content: string, currentDisplayMode: boolean, currentLoading: boolean) {
    try {
      return await renderKaTeXWithBackpressure(content, currentDisplayMode, {
        timeout: 1500,
        waitTimeout: 0,
        maxRetries: 0,
      })
    }
    catch (error: any) {
      const code = error?.code || error?.name
      const isWorkerInitFailure = code === 'WORKER_INIT_ERROR' || error?.fallbackToRenderer
      const isBusyOrTimeout = code === WORKER_BUSY_CODE || code === 'WORKER_TIMEOUT'
      if (!isWorkerInitFailure && !isBusyOrTimeout)
        return null
    }

    const katex = await getKatex()
    if (!katex)
      return null

    try {
      const html = katex.renderToString(content, {
        throwOnError: currentLoading,
        displayMode: currentDisplayMode,
      })
      setKaTeXCache(content, currentDisplayMode, html)
      return html
    }
    catch {
      return null
    }
  }
</script>

<span class="math-inline-wrapper markstream-nested-math" data-display="inline" data-markstream-katex-managed="1">
  <span bind:this={mathEl} class="math-inline" class:math-inline--hidden={loading}></span>
  {#if loading}
    <span class="math-inline__loading" role="status" aria-live="polite">
      <span class="math-inline__spinner" aria-hidden="true"></span>
      <span class="sr-only">Loading</span>
    </span>
  {/if}
</span>
