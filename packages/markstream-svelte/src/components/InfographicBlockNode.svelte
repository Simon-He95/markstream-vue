<script lang="ts">
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { createPanGesture } from 'markstream-core'
  import { onDestroy, onMount, tick, untrack } from 'svelte'
  import { useSafeI18n } from '../i18n/useSafeI18n'
  import { getInfographic } from '../optional/infographic'
  import { toSafeSvgMarkup } from '../sanitizeSvg'
  import { hideTooltip, showTooltipForAnchor } from '../tooltip/singletonTooltip'
  import { clampPreviewHeight, estimateInfographicPreviewHeight, INFOGRAPHIC_PREVIEW_MIN_HEIGHT, parsePositiveNumber, resolveDiagramMinPreviewHeight } from './shared/diagram-height'
  import { clearElement, copyTextToClipboard, downloadSvgMarkup } from './shared/rich-block-helpers'
  import { getString } from './shared/node-helpers'

  type Props = {
    node: SvelteRenderableNode
    context?: SvelteRenderContext | undefined
    maxHeight?: string | null | undefined
    estimatedPreviewHeightPx?: number | undefined
    loading?: boolean | undefined
    isDark?: boolean | undefined
    showHeader?: boolean
    showModeToggle?: boolean
    showCopyButton?: boolean
    showCollapseButton?: boolean
    showExportButton?: boolean
    showFullscreenButton?: boolean
    showZoomControls?: boolean
  }

  let {
    node,
    context = undefined,
    maxHeight = '500px',
    estimatedPreviewHeightPx = undefined,
    loading = undefined,
    isDark = undefined,
    showHeader = true,
    showModeToggle = true,
    showCopyButton = true,
    showCollapseButton = true,
    showExportButton = true,
    showFullscreenButton = true,
    showZoomControls = true
  }: Props = $props()

  const { t } = useSafeI18n()
  const infographicIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="#5b8ff9" d="M5 4.25A2.25 2.25 0 0 1 7.25 2h2.5A2.25 2.25 0 0 1 12 4.25v2.5A2.25 2.25 0 0 1 9.75 9h-2.5A2.25 2.25 0 0 1 5 6.75z"/><path fill="#61d9a6" d="M12 17.25A2.25 2.25 0 0 1 14.25 15h2.5A2.25 2.25 0 0 1 19 17.25v2.5A2.25 2.25 0 0 1 16.75 22h-2.5A2.25 2.25 0 0 1 12 19.75z"/><path fill="#f6bd16" d="M12 4.25A2.25 2.25 0 0 1 14.25 2h2.5A2.25 2.25 0 0 1 19 4.25v2.5A2.25 2.25 0 0 1 16.75 9h-2.5A2.25 2.25 0 0 1 12 6.75z"/><path fill="#5ad8a6" d="M7.5 10.75h1.75a6.25 6.25 0 0 1 6.25 6.25v.25h-2V17a4.25 4.25 0 0 0-4.25-4.25H7.5z"/><path fill="#7262fd" d="M15.5 11.1l3.75 2.16v4.33l-3.75 2.16l-3.75-2.16v-4.33z"/></svg>'

  let renderHost: HTMLDivElement | null = $state(null)
  let blockHost: HTMLElement | null = $state(null)
  let mounted = $state(false)
  let renderToken = $state(0)
  let lastCompletedRenderSignature = $state('')
  let activeRenderSignature = $state('')
  let lastSuppressedErrorSignature = $state('')
  let instance: any = $state(null)
  let renderError = $state('')
  let rendering = $state(false)
  let rerenderQueued = $state(false)
  let rerenderForce = $state(false)
  let renderScheduled = $state(false)
  let renderScheduledForce = $state(false)
  let hasPreview = $state(false)
  let copied = $state(false)
  let collapsed = $state(false)
  let showSource = $state(false)
  let modalOpen = $state(false)
  let modalMarkup = $state('')
  let zoom = $state(1)
  let translateX = $state(0)
  let translateY = $state(0)
  let isDragging = $state(false)
  let copyTimer: ReturnType<typeof setTimeout> | null = null

  let source = $derived(getString((node as any)?.code))
  let nodeLoading = $derived(typeof (node as any)?.loading === 'boolean' ? Boolean((node as any)?.loading) : true)
  let resolvedLoading = $derived(loading ?? nodeLoading)
  let final = $derived(context?.final ?? resolvedLoading === false)
  let progressivePreview = $derived(resolvedLoading !== false || final === false)
  let resolvedIsDark = $derived(isDark ?? context?.isDark ?? false)
  let maxPreviewHeight = $derived(maxHeight === 'none' ? null : parsePositiveNumber(maxHeight))
  let previewHeight = $derived(clampPreviewHeight(
    parsePositiveNumber(estimatedPreviewHeightPx) ?? estimateInfographicPreviewHeight(source),
    resolveDiagramMinPreviewHeight(blockHost, INFOGRAPHIC_PREVIEW_MIN_HEIGHT),
    maxPreviewHeight ?? undefined,
  ))
  let previewStyle = $derived([
    `min-height: ${previewHeight}px`,
    maxHeight && maxHeight !== 'none' ? `max-height: ${maxHeight}` : '',
    `cursor: ${isDragging ? 'grabbing' : 'grab'}`,
  ].filter(Boolean).join('; '))
  let transformStyle = $derived(`transform: translate(${translateX}px, ${translateY}px) scale(${zoom}); transform-origin: center center;`)
  let shouldRender = $derived(!(resolvedLoading && !source.trim()))

  // The diagram is scaled to fit the preview box, so at fit zoom nothing is
  // off-screen and panning only shifts it inside the box. Touch therefore keeps
  // scrolling the page at that zoom (a chat is mostly scrolling) and only claims
  // the gesture once the diagram is zoomed in and actually overflows the box.
  // The fullscreen modal always claims it.
  let panSurfaceClaimsTouch = $derived(modalOpen || zoom > 1)

  onMount(() => {
    mounted = true
    queueInfographicRender(true)
  })

  $effect(() => {
    if (mounted) {
      const _sig = `${source}\n${resolvedIsDark}\n${final}\n${progressivePreview}`
      const _collapsed = collapsed
      const _showSource = showSource
      untrack(() => {
        queueInfographicRender()
      })
    }
  })

  onDestroy(() => {
    mounted = false
    renderToken += 1
    destroyInstance()
    lastCompletedRenderSignature = ''
    // A drag in progress must not keep its window listeners after unmount.
    panGesture.stop()
    if (copyTimer)
      clearTimeout(copyTimer)
  })

  function queueInfographicRender(force = false) {
    if (!mounted || !renderHost || collapsed || showSource || !source.trim())
      return
    renderScheduledForce = renderScheduledForce || force
    if (renderScheduled)
      return
    renderScheduled = true
    void tick().then(() => {
      renderScheduled = false
      const forceNext = renderScheduledForce
      renderScheduledForce = false
      return renderInfographic(forceNext)
    })
  }

  async function renderInfographic(force = false) {
    if (!mounted || !renderHost || collapsed || showSource)
      return
    if (!source.trim()) {
      destroyInstance()
      if (renderHost)
        clearElement(renderHost)
      hasPreview = false
      renderError = ''
      lastCompletedRenderSignature = ''
      lastSuppressedErrorSignature = ''
      return
    }

    const renderSource = source
    const renderFinal = final
    const signature = `${renderSource}\n${resolvedIsDark}\n${renderFinal}\n${progressivePreview}`
    if (!force && signature === lastCompletedRenderSignature && hasPreview)
      return
    if (!force && signature === lastSuppressedErrorSignature)
      return

    if (rendering) {
      if (signature !== activeRenderSignature || force) {
        rerenderQueued = true
        rerenderForce = rerenderForce || force
      }
      return
    }

    const token = ++renderToken
    activeRenderSignature = signature
    const shouldShowError = !progressivePreview
    rendering = true
    if (shouldShowError)
      renderError = ''
    let nextInstance: any = null
    let previousChildren: ChildNode[] | null = null

    try {
      const InfographicClass = await getInfographic()
      if (!mounted || token !== renderToken || collapsed || showSource || !renderHost)
        return
      if (!InfographicClass)
        throw new Error('Infographic renderer is not available.')
      const currentSignature = `${source}\n${resolvedIsDark}\n${final}\n${progressivePreview}`
      const canRender = signature === currentSignature
        || (!renderFinal && resolvedLoading && source.startsWith(renderSource))
      if (!canRender)
        return

      previousChildren = Array.from(renderHost.childNodes)
      nextInstance = new InfographicClass({
        container: renderHost,
        width: '100%',
        height: '100%',
      })

      let renderErrorMessage = ''
      let renderCompleted = false
      nextInstance.on?.('error', (error: unknown) => {
        const errors = Array.isArray(error) ? error : [error]
        renderErrorMessage = errors
          .map((item) => {
            if (item instanceof Error)
              return item.message
            if (typeof item === 'string')
              return item
            if (item && typeof item === 'object' && 'message' in item)
              return String((item as { message?: unknown }).message ?? '')
            return String(item ?? '')
          })
          .filter(Boolean)
          .join('; ')
      })
      nextInstance.on?.('rendered', () => {
        renderCompleted = true
      })

      nextInstance.render(renderSource)
      if (renderErrorMessage)
        throw new Error(renderErrorMessage)
      const nextChildren = Array.from(renderHost.childNodes)
      const replacedChildren = nextChildren.length > 0 && (
        nextChildren.length !== previousChildren.length
        || nextChildren.some((child, index) => child !== previousChildren?.[index])
      )
      if (!renderCompleted && !replacedChildren)
        throw new Error('Infographic render returned empty output.')

      instance?.destroy?.()
      instance = nextInstance
      nextInstance = null
      hasPreview = true
      renderError = ''
      lastCompletedRenderSignature = signature
      lastSuppressedErrorSignature = ''
    }
    catch (error) {
      if (token === renderToken) {
        nextInstance?.destroy?.()
        nextInstance = null
        lastCompletedRenderSignature = ''
        const currentSignature = `${source}\n${resolvedIsDark}\n${final}\n${progressivePreview}`
        if (shouldShowError && signature === currentSignature) {
          lastSuppressedErrorSignature = ''
          destroyInstance()
          clearElement(renderHost)
          hasPreview = false
          renderError = error instanceof Error ? error.message : String(error)
        }
        else {
          if (previousChildren && renderHost)
            renderHost.replaceChildren(...previousChildren)
          if (signature === currentSignature)
            lastSuppressedErrorSignature = signature
        }
      }
    }
    finally {
      nextInstance?.destroy?.()
      if (token === renderToken) {
        rendering = false
        activeRenderSignature = ''
        if (rerenderQueued) {
          const forceNext = rerenderForce
          rerenderQueued = false
          rerenderForce = false
          queueInfographicRender(forceNext)
        }
      }
    }
  }

  function destroyInstance() {
    try {
      instance?.destroy?.()
    }
    catch {}
    instance = null
  }

  function resetPreviewRenderState() {
    renderToken += 1
    destroyInstance()
    if (renderHost)
      clearElement(renderHost)
    rendering = false
    rerenderQueued = false
    rerenderForce = false
    renderScheduled = false
    renderScheduledForce = false
    hasPreview = false
    renderError = ''
    activeRenderSignature = ''
    lastCompletedRenderSignature = ''
    lastSuppressedErrorSignature = ''
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

  function getRenderedSvg() {
    const svg = renderHost?.querySelector('svg')
    return svg ? toSafeSvgMarkup(svg.outerHTML) : ''
  }

  function exportSvg() {
    const svg = getRenderedSvg()
    if (svg)
      downloadSvgMarkup(svg, `infographic-${Date.now()}.svg`)
  }

  function openModal() {
    modalMarkup = renderHost?.innerHTML || ''
    if (modalMarkup)
      modalOpen = true
  }

  async function switchMode(mode: 'preview' | 'source') {
    const nextShowSource = mode === 'source'
    if (showSource === nextShowSource)
      return

    showSource = nextShowSource
    resetPreviewRenderState()
    if (!showSource) {
      await tick()
      queueInfographicRender(true)
    }
  }

  async function toggleCollapsed() {
    collapsed = !collapsed
    resetPreviewRenderState()
    if (!collapsed) {
      await tick()
      queueInfographicRender(true)
    }
  }

  function zoomIn() {
    zoom = Math.min(3, Math.round((zoom + 0.1) * 10) / 10)
  }

  function zoomOut() {
    zoom = Math.max(0.5, Math.round((zoom - 0.1) * 10) / 10)
  }

  function resetZoom() {
    zoom = 1
    translateX = 0
    translateY = 0
  }

  // Drag functionality. The gesture lifecycle (window listeners, pointer identity,
  // lost releases) lives in markstream-core so every package pans identically.
  const panGesture = createPanGesture({
    getTranslate: () => ({ x: translateX, y: translateY }),
    setTranslate: (next) => {
      translateX = next.x
      translateY = next.y
    },
    canStart: (event) => {
      // Nothing to pan until the diagram exists. Without this the pending/error
      // source panel the block renders in the preview would be claimed by the
      // gesture, and `preventDefault` would take text selection away from it.
      if (!hasPreview)
        return false

      // Touch pans only where the surface claims the gesture. Elsewhere the page
      // keeps the swipe for scrolling, and panning along with it would shift the
      // diagram by a few pixels before the browser takes the gesture over.
      return event.pointerType !== 'touch' || panSurfaceClaimsTouch
    },
    onActiveChange: active => (isDragging = active),
  })

  function startDrag(event: PointerEvent) {
    panGesture.start(event)
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

  function portal(node: HTMLElement) {
    document.body.appendChild(node)
    return {
      destroy() {
        node.remove()
      },
    }
  }

  function closeModal() {
    modalOpen = false
  }

  function onModalOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget)
      closeModal()
  }

  function onModalKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape')
      closeModal()
  }
</script>

{#if shouldRender}
  <div
    bind:this={blockHost}
    class:dark={resolvedIsDark}
    class:is-rendering={rendering || resolvedLoading}
    class="markstream-svelte-enhanced-block markstream-svelte-enhanced-block--infographic"
    data-markstream-infographic="1"
    data-markstream-mode={showSource ? 'source' : hasPreview ? 'preview' : 'fallback'}
  >
    {#if showHeader}
      <div class="markstream-svelte-enhanced-block__header infographic-block-header">
        <div class="markstream-svelte-enhanced-block__title">
          <span class="markstream-svelte-enhanced-block__title-icon icon-slot action-icon" aria-hidden="true">{@html infographicIcon}</span>
          <span class="markstream-svelte-enhanced-block__title-text infographic-label">Infographic</span>
        </div>
        {#if showModeToggle}
          <div class="infographic-mode-toggle">
            <button type="button" class:is-active={!showSource} class="markstream-svelte-enhanced-block__action mode-btn infographic-mode-btn" onblur={() => hideTooltip()} onclick={() => switchMode('preview')} onfocus={(event) => showButtonTooltip(event, t('common.preview') || 'Preview')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.preview') || 'Preview')}>
              <span class="markstream-svelte-enhanced-block__action-content">
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></g></svg>
                <span>{t('common.preview')}</span>
              </span>
            </button>
            <button type="button" class:is-active={showSource} class="markstream-svelte-enhanced-block__action mode-btn infographic-mode-btn" onblur={() => hideTooltip()} onclick={() => switchMode('source')} onfocus={(event) => showButtonTooltip(event, t('common.source') || 'Source')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.source') || 'Source')}>
              <span class="markstream-svelte-enhanced-block__action-content">
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16 18l6-6l-6-6M8 6l-6 6l6 6"/></svg>
                <span>{t('common.source')}</span>
              </span>
            </button>
          </div>
        {/if}
        <div class="markstream-svelte-enhanced-block__actions infographic-header-actions">
          {#if showCollapseButton}
            <button type="button" class="markstream-svelte-enhanced-block__action markstream-svelte-enhanced-block__action--icon infographic-action-btn" aria-label={collapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse')} aria-pressed={collapsed} onblur={() => hideTooltip()} onclick={toggleCollapsed} onfocus={(event) => showButtonTooltip(event, collapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, collapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))}>
              <svg aria-hidden="true" role="img" style:transform={collapsed ? 'rotate(0deg)' : 'rotate(90deg)'} viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6"/></svg>
            </button>
          {/if}
          {#if showCopyButton}
            <button type="button" class="markstream-svelte-enhanced-block__action markstream-svelte-enhanced-block__action--icon infographic-action-btn" aria-label={copied ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')} onblur={() => hideTooltip()} onclick={copy} onfocus={showCopyTooltip} onmouseleave={() => hideTooltip()} onmouseenter={showCopyTooltip}>
              {#if copied}
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5"/></svg>
              {:else}
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></g></svg>
              {/if}
            </button>
          {/if}
          {#if showExportButton}
            <button type="button" class="markstream-svelte-enhanced-block__action markstream-svelte-enhanced-block__action--icon infographic-action-btn" aria-label={t('common.export') || 'Export'} disabled={!hasPreview || showSource || collapsed} onblur={() => hideTooltip()} onclick={exportSvg} onfocus={(event) => showButtonTooltip(event, t('common.export') || 'Export')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.export') || 'Export')}>
              <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10l5 5l5-5"/></g></svg>
            </button>
          {/if}
          {#if showFullscreenButton}
            <button type="button" class="markstream-svelte-enhanced-block__action markstream-svelte-enhanced-block__action--icon infographic-action-btn" aria-label={t('common.open') || 'Open'} disabled={!hasPreview || showSource || collapsed} onblur={() => hideTooltip()} onclick={openModal} onfocus={(event) => showButtonTooltip(event, t('common.open') || 'Open')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.open') || 'Open')}>
              <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6"/></svg>
            </button>
          {/if}
        </div>
      </div>
    {/if}

    {#if !collapsed}
      <div class="markstream-svelte-enhanced-block__body infographic-block-body">
        {#if showSource}
          <div class="infographic-source">
            <pre class="infographic-source-code"><code>{source}</code></pre>
          </div>
        {:else}
          {#if showZoomControls}
            <div class="markstream-svelte-zoom-controls">
              <button type="button" class="markstream-svelte-enhanced-block__action markstream-svelte-enhanced-block__action--icon infographic-action-btn" aria-label={t('common.zoomIn') || 'Zoom in'} onblur={() => hideTooltip()} onclick={zoomIn} onfocus={(event) => showButtonTooltip(event, t('common.zoomIn') || 'Zoom in')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.zoomIn') || 'Zoom in')}>
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21l-4.35-4.35M11 8v6m-3-3h6"/></g></svg>
              </button>
              <button type="button" class="markstream-svelte-enhanced-block__action markstream-svelte-enhanced-block__action--icon infographic-action-btn" aria-label={t('common.zoomOut') || 'Zoom out'} onblur={() => hideTooltip()} onclick={zoomOut} onfocus={(event) => showButtonTooltip(event, t('common.zoomOut') || 'Zoom out')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.zoomOut') || 'Zoom out')}>
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21l-4.35-4.35M8 11h6"/></g></svg>
              </button>
              <button type="button" class="markstream-svelte-enhanced-block__action infographic-action-btn infographic-zoom-reset" onblur={() => hideTooltip()} onclick={resetZoom} onfocus={(event) => showButtonTooltip(event, t('common.resetZoom') || 'Reset zoom')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.resetZoom') || 'Reset zoom')}>{Math.round(zoom * 100)}%</button>
            </div>
          {/if}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="infographic-render" class:markstream-svelte-pan-touch={panSurfaceClaimsTouch} style={previewStyle} onpointerdown={startDrag}>
            {#if !hasPreview && !renderError}
              <pre class="infographic-source-code infographic-pending-source"><code>{source}</code></pre>
            {/if}
            <div bind:this={renderHost} style={transformStyle}></div>
            {#if renderError}
              <p class="d2-error">{renderError}</p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if modalOpen}
      <div use:portal class:dark={resolvedIsDark} class="markstream-svelte markstream-svelte-modal-root">
        <div class="mermaid-modal-overlay infographic-modal-overlay" role="dialog" aria-modal="true" tabindex="-1" onclick={onModalOverlayClick} onkeydown={onModalKeydown}>
          <div class="mermaid-modal-panel infographic-modal-panel">
            <div class="mermaid-modal-controls">
              <button type="button" class="markstream-svelte-enhanced-block__action markstream-svelte-enhanced-block__action--icon infographic-action-btn" aria-label={t('common.zoomIn') || 'Zoom in'} onclick={zoomIn}>
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21l-4.35-4.35M11 8v6m-3-3h6"/></g></svg>
              </button>
              <button type="button" class="markstream-svelte-enhanced-block__action markstream-svelte-enhanced-block__action--icon infographic-action-btn" aria-label={t('common.zoomOut') || 'Zoom out'} onclick={zoomOut}>
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21l-4.35-4.35M8 11h6"/></g></svg>
              </button>
              <button type="button" class="markstream-svelte-enhanced-block__action infographic-action-btn infographic-zoom-reset" aria-label={t('common.resetZoom') || 'Reset zoom'} onclick={resetZoom}>{Math.round(zoom * 100)}%</button>
              <button type="button" class="markstream-svelte-enhanced-block__action markstream-svelte-enhanced-block__action--icon infographic-action-btn" aria-label={t('common.close') || 'Close'} onclick={closeModal}>
                <svg aria-hidden="true" role="img" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="mermaid-modal-body" class:markstream-svelte-pan-touch={panSurfaceClaimsTouch} style={`cursor: ${isDragging ? 'grabbing' : 'grab'}`} onpointerdown={startDrag}>
              <div class="mermaid-modal-content infographic-modal-content" style={`transform: translate(${translateX}px, ${translateY}px) scale(${zoom});`}>{@html modalMarkup}</div>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
