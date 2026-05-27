<script lang="ts">
  import type { SvelteRenderableNode } from './shared/node-helpers'
  import { onDestroy } from 'svelte'
  import { getKatex } from '../optional/katex'
  import { normalizeKaTeXRenderInput } from '../utils/normalizeKaTeXRenderInput'
  import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../workers/katexWorkerClient'
  import { getString } from './shared/node-helpers'

  type Props = { node: SvelteRenderableNode }
  let { node }: Props = $props()

  let mathEl: HTMLDivElement | null = $state(null)
  let rendering = $state(true)
  let destroyed = false
  let renderVersion = 0
  let hasRenderedOnce = false

  let source = $derived(getString((node as any)?.content || (node as any)?.markup || (node as any)?.raw))
  let raw = $derived(getString((node as any)?.raw || source))
  let nodeLoading = $derived((node as any)?.loading === true)

  $effect(() => {
    if (mathEl) {
      void renderMath(source, raw, nodeLoading)
    }
  })

  onDestroy(() => {
    destroyed = true
    renderVersion += 1
  })

  async function renderMath(currentSource: string, currentRaw: string, currentLoading: boolean) {
    const target = mathEl
    if (!target)
      return

    const content = normalizeKaTeXRenderInput(currentSource)
    const version = ++renderVersion
    if (!content) {
      target.textContent = ''
      rendering = false
      return
    }

    if (!hasRenderedOnce)
      rendering = true

    const html = await resolveKatexMarkup(content, currentLoading)
    if (destroyed || version !== renderVersion)
      return

    if (html) {
      target.innerHTML = html
      hasRenderedOnce = true
      rendering = false
    }
    else if (!currentLoading) {
      target.textContent = currentRaw || content
      rendering = false
    }
  }

  async function resolveKatexMarkup(content: string, currentLoading: boolean) {
    try {
      return await renderKaTeXWithBackpressure(content, true, {
        timeout: 3000,
        waitTimeout: 2000,
        maxRetries: 1,
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
        displayMode: true,
      })
      setKaTeXCache(content, true, html)
      return html
    }
    catch {
      return null
    }
  }
</script>

<div class="math-block markstream-nested-math-block" data-markstream-katex-managed="1">
  <div bind:this={mathEl} class="markstream-nested-math-block__render" class:math-rendering={rendering}></div>
</div>
