<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { onDestroy, onMount, untrack } from 'svelte'
  import { useSafeI18n } from '../i18n/useSafeI18n'
  import { getD2 } from '../optional/d2'
  import { extractRenderedSvg, toSafeSvgMarkup } from '../sanitizeSvg'
  import { hideTooltip, showTooltipForAnchor } from '../tooltip/singletonTooltip'
  import { copyTextToClipboard, downloadSvgMarkup } from './shared/rich-block-helpers'
  import { getString } from './shared/node-helpers'

  const DARK_THEME_OVERRIDES: Record<string, string> = {
    N1: '#E5E7EB',
    N2: '#CBD5E1',
    N3: '#94A3B8',
    N4: '#64748B',
    N5: '#475569',
    N6: '#334155',
    N7: '#0B1220',
    B1: '#60A5FA',
    B2: '#3B82F6',
    B3: '#2563EB',
    B4: '#1D4ED8',
    B5: '#1E40AF',
    B6: '#111827',
    AA2: '#22D3EE',
    AA4: '#0EA5E9',
    AA5: '#0284C7',
    AB4: '#FBBF24',
    AB5: '#F59E0B',
  }

  type Props = {
    node: SvelteRenderableNode
    context?: SvelteRenderContext | undefined
    maxHeight?: string | null | undefined
    loading?: boolean | undefined
    isDark?: boolean | undefined
    themeId?: number | null | undefined
    darkThemeId?: number | null | undefined
    showHeader?: boolean
    showModeToggle?: boolean
    showCopyButton?: boolean
    showExportButton?: boolean
    showCollapseButton?: boolean
  }

  let {
    node,
    context = undefined,
    maxHeight = '500px',
    loading = undefined,
    isDark = undefined,
    themeId = undefined,
    darkThemeId = undefined,
    showHeader = true,
    showModeToggle = true,
    showCopyButton = true,
    showExportButton = true,
    showCollapseButton = true
  }: Props = $props()

  const { t } = useSafeI18n()

  let mounted = $state(false)
  let renderToken = $state(0)
  let lastSignature = $state('')
  let activeRenderSignature = $state('')
  let svgMarkup = $state('')
  let renderError = $state('')
  let rendering = $state(false)
  let rerenderQueued = $state(false)
  let rerenderForce = $state(false)
  let copied = $state(false)
  let collapsed = $state(false)
  let showSource = $state(false)
  let copyTimer: ReturnType<typeof setTimeout> | null = null

  let source = $derived(getString((node as any)?.code))
  let resolvedLoading = $derived(loading ?? (node as any)?.loading === true)
  let resolvedIsDark = $derived(isDark ?? context?.isDark ?? false)
  let shouldRender = $derived(!(resolvedLoading && !source.trim()))
  let showSourceFallback = $derived(showSource || !svgMarkup)
  let renderStyle = $derived(maxHeight && maxHeight !== 'none' ? `max-height: ${maxHeight}` : '')

  onMount(() => {
    mounted = true
    void renderD2(true)
  })

  $effect(() => {
    if (mounted) {
      const _sig = getRenderSignature()
      const _collapsed = collapsed
      const _showSource = showSource
      untrack(() => {
        void renderD2()
      })
    }
  })

  onDestroy(() => {
    mounted = false
    renderToken += 1
    if (copyTimer)
      clearTimeout(copyTimer)
  })

  async function renderD2(force = false) {
    if (!mounted || collapsed || showSource || !source.trim())
      return
    const signature = getRenderSignature()
    if (rendering) {
      if (signature !== activeRenderSignature || force) {
        rerenderQueued = true
        rerenderForce = rerenderForce || force
      }
      return
    }
    if (!force && signature === lastSignature && (svgMarkup || renderError))
      return

    const token = ++renderToken
    activeRenderSignature = signature
    lastSignature = signature
    rendering = true
    renderError = ''
    try {
      const D2Ctor = await getD2()
      if (!mounted || token !== renderToken)
        return
      const instance = createD2Instance(D2Ctor)
      if (!instance || typeof instance.compile !== 'function' || typeof instance.render !== 'function')
        throw new Error('D2 renderer is not available.')

      const compileResult = await instance.compile(source)
      const diagram = compileResult?.diagram ?? compileResult
      const baseRenderOptions = compileResult?.renderOptions ?? compileResult?.options ?? {}
      const renderOptions: Record<string, any> = { ...baseRenderOptions }
      renderOptions.themeID = resolvedIsDark && darkThemeId != null
        ? darkThemeId
        : themeId ?? baseRenderOptions.themeID
      renderOptions.darkThemeID = null
      renderOptions.darkThemeOverrides = null
      if (resolvedIsDark) {
        renderOptions.themeOverrides = {
          ...DARK_THEME_OVERRIDES,
          ...(baseRenderOptions.themeOverrides || {}),
        }
      }

      const rendered = await instance.render(diagram, renderOptions)
      if (!mounted || token !== renderToken)
        return
      const safeSvg = toSafeSvgMarkup(extractRenderedSvg(rendered))
      if (!safeSvg)
        throw new Error('D2 rendered empty SVG.')
      svgMarkup = safeSvg.replace('<svg', '<svg class="markstream-d2-root-svg"')
    }
    catch (error) {
      if (token === renderToken) {
        svgMarkup = ''
        renderError = error instanceof Error ? error.message : String(error)
      }
    }
    finally {
      if (token === renderToken) {
        rendering = false
        activeRenderSignature = ''
        if (rerenderQueued) {
          const forceNext = rerenderForce
          rerenderQueued = false
          rerenderForce = false
          void renderD2(forceNext)
        }
      }
    }
  }

  function getRenderSignature() {
    return `${source}\n${resolvedIsDark}\n${themeId}\n${darkThemeId}`
  }

  function createD2Instance(D2Ctor: any) {
    if (typeof D2Ctor === 'function') {
      const instance = new D2Ctor()
      if (instance && typeof instance.compile === 'function')
        return instance
      if (typeof D2Ctor.compile === 'function')
        return D2Ctor
    }
    if (D2Ctor?.D2 && typeof D2Ctor.D2 === 'function')
      return new D2Ctor.D2()
    if (typeof D2Ctor?.compile === 'function')
      return D2Ctor
    return null
  }

  async function copy() {
    await copyTextToClipboard(source)
    context?.events?.onCopy?.(source)
    copied = true
    if (copyTimer)
      clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied = false
    }, 1000)
  }

  function exportSvg() {
    if (svgMarkup)
      downloadSvgMarkup(svgMarkup, `d2-diagram-${Date.now()}.svg`)
  }

  function switchMode(mode: 'preview' | 'source') {
    showSource = mode === 'source'
    if (!showSource)
      void renderD2(true)
  }

  function showButtonTooltip(event: MouseEvent | FocusEvent, text: string) {
    const target = event.currentTarget as HTMLElement | null
    if (!target || (target instanceof HTMLButtonElement && target.disabled))
      return
    showTooltipForAnchor(target, text, 'top', false, undefined, resolvedIsDark)
  }

  function showCopyTooltip(event: MouseEvent | FocusEvent) {
    showButtonTooltip(event, copied ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'))
  }
</script>

{#if shouldRender}
  <div
    class:dark={resolvedIsDark}
    class:is-rendering={rendering || resolvedLoading}
    class="markstream-svelte-enhanced-block markstream-svelte-enhanced-block--d2"
    data-markstream-d2="1"
    data-markstream-mode={showSourceFallback ? 'fallback' : 'preview'}
  >
    {#if showHeader}
      <div class="markstream-svelte-enhanced-block__header d2-block-header">
        <div class="d2-header-title">
          <span class="d2-label">D2</span>
        </div>
        <div class="markstream-svelte-enhanced-block__actions d2-header-actions">
          {#if showModeToggle}
            <div class="d2-mode-toggle">
              <button type="button" class:is-active={!showSource} class="markstream-svelte-enhanced-block__action mode-btn d2-mode-btn" onblur={() => hideTooltip()} onclick={() => switchMode('preview')} onfocus={(event) => showButtonTooltip(event, t('common.preview') || 'Preview')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.preview') || 'Preview')}>{t('common.preview')}</button>
              <button type="button" class:is-active={showSource} class="markstream-svelte-enhanced-block__action mode-btn d2-mode-btn" onblur={() => hideTooltip()} onclick={() => switchMode('source')} onfocus={(event) => showButtonTooltip(event, t('common.source') || 'Source')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.source') || 'Source')}>{t('common.source')}</button>
            </div>
          {/if}
          {#if showCopyButton}
            <button type="button" class="markstream-svelte-enhanced-block__action markstream-svelte-enhanced-block__action--icon d2-action-btn" aria-label={copied ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')} onblur={() => hideTooltip()} onclick={copy} onfocus={showCopyTooltip} onmouseleave={() => hideTooltip()} onmouseenter={showCopyTooltip}>
              {#if copied}
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5"/></svg>
              {:else}
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></g></svg>
              {/if}
            </button>
          {/if}
          {#if showExportButton && svgMarkup}
            <button type="button" class="markstream-svelte-enhanced-block__action markstream-svelte-enhanced-block__action--icon d2-action-btn" aria-label={t('common.export') || 'Export'} onblur={() => hideTooltip()} onclick={exportSvg} onfocus={(event) => showButtonTooltip(event, t('common.export') || 'Export')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.export') || 'Export')}>
              <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v12m0-12l-4 4m4-4l4 4M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>
            </button>
          {/if}
          {#if showCollapseButton}
            <button type="button" class="markstream-svelte-enhanced-block__action markstream-svelte-enhanced-block__action--icon d2-action-btn" aria-label={collapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse')} aria-pressed={collapsed} onblur={() => hideTooltip()} onclick={() => (collapsed = !collapsed)} onfocus={(event) => showButtonTooltip(event, collapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, collapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))}>
              <svg aria-hidden="true" role="img" style:transform={collapsed ? 'rotate(0deg)' : 'rotate(90deg)'} viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6"/></svg>
            </button>
          {/if}
        </div>
      </div>
    {/if}

    {#if !collapsed}
      <div class="markstream-svelte-enhanced-block__body d2-block-body">
        {#if showSourceFallback}
          <div class="d2-source">
            <pre class="d2-code"><code>{source}</code></pre>
            {#if renderError}
              <p class="d2-error">{renderError}</p>
            {/if}
          </div>
        {:else}
          <div class="d2-render" style={renderStyle}>
            <div class="d2-svg">{@html svgMarkup}</div>
            {#if renderError}
              <p class="d2-error">{renderError}</p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
