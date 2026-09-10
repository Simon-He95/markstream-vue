import type { SolidRenderableNode, SolidRenderContext } from '../node-helpers'
import { createEffect, createSignal, onCleanup } from 'solid-js'
import { clampPreviewHeight, estimateInfographicPreviewHeight, INFOGRAPHIC_PREVIEW_MIN_HEIGHT, parsePositiveNumber, resolveDiagramMinPreviewHeight } from '../diagramHeight'
import { getInfographic } from '../infographic'
import { getString } from '../node-helpers'

export interface InfographicBlockNodeProps {
  node: SolidRenderableNode
  context?: SolidRenderContext
  loading?: boolean
  isDark?: boolean
  maxHeight?: string | null
  estimatedPreviewHeightPx?: number
  /** Coalesce frequent in-progress source updates before asking the renderer to redraw. */
  progressiveRender?: boolean
  /** Minimum time between progressive redraws, in milliseconds. */
  progressiveIntervalMs?: number
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showCollapseButton?: boolean
  showExportButton?: boolean
  showFullscreenButton?: boolean
  showZoomControls?: boolean
}

export function InfographicBlockNode(props: InfographicBlockNodeProps) {
  const [host, setHost] = createSignal<HTMLDivElement>()
  const [error, setError] = createSignal('')
  const [showSource, setShowSource] = createSignal(false)
  const [collapsed, setCollapsed] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [sourceHost, setSourceHost] = createSignal<HTMLPreElement>()
  const [root, setRoot] = createSignal<HTMLDivElement>()
  const [zoom, setZoom] = createSignal(1)
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  let progressiveTimer: ReturnType<typeof setTimeout> | undefined
  let lastProgressiveRenderAt = 0
  const [progressiveTick, setProgressiveTick] = createSignal(0)
  let instance: { render?: (source: string) => unknown, destroy?: () => unknown } | undefined
  let generation = 0
  createEffect(() => {
    const target = host()
    const source = getString((props.node as any).code)
    const dark = props.isDark ?? props.context?.isDark ?? false
    const sourceMode = showSource()
    const isCollapsed = collapsed()
    if (!target)
      return
    const token = ++generation
    void progressiveTick()
    if (!source.trim() || sourceMode || isCollapsed) {
      try {
        instance?.destroy?.()
      }
      catch {}
      instance = undefined
      target.replaceChildren()
      setError('')
      return
    }
    const isStreaming = props.loading ?? Boolean((props.node as any).loading)
    const interval = Math.max(0, props.progressiveIntervalMs ?? 120)
    if (props.progressiveRender !== false && isStreaming && interval > 0) {
      const elapsed = Date.now() - lastProgressiveRenderAt
      if (elapsed < interval) {
        if (progressiveTimer)
          clearTimeout(progressiveTimer)
        progressiveTimer = setTimeout(() => {
          progressiveTimer = undefined
          setProgressiveTick(value => value + 1)
        }, interval - elapsed)
        return
      }
    }
    if (progressiveTimer) {
      clearTimeout(progressiveTimer)
      progressiveTimer = undefined
    }
    lastProgressiveRenderAt = Date.now()
    if (instance?.render) {
      try {
        instance.render(source)
        setError('')
      }
      catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
      return
    }
    target.replaceChildren()
    void getInfographic().then((Constructor) => {
      if (token !== generation || !Constructor)
        throw new Error('Infographic renderer is not available.')
      const next = new Constructor({ container: target, width: '100%', height: '100%' })
      next.on?.('error', (reason: unknown) => {
        if (token === generation)
          setError(reason instanceof Error ? reason.message : String(reason))
      })
      next.render(source)
      if (token !== generation) {
        next.destroy?.()
        return
      }
      instance = next
      setError('')
    }).catch((reason) => {
      if (token === generation)
        setError(reason instanceof Error ? reason.message : String(reason))
    })
    void dark
  })
  onCleanup(() => {
    generation += 1
    try {
      instance?.destroy?.()
    }
    catch {}
    if (copyTimer)
      clearTimeout(copyTimer)
    if (progressiveTimer)
      clearTimeout(progressiveTimer)
  })
  const source = () => getString((props.node as any).code)
  const previewStyle = () => {
    const maxHeight = props.maxHeight ?? '500px'
    const maxPreviewHeight = maxHeight === 'none' ? null : parsePositiveNumber(maxHeight)
    const estimatedHeight = parsePositiveNumber(props.estimatedPreviewHeightPx) ?? estimateInfographicPreviewHeight(source())
    const previewHeight = clampPreviewHeight(
      estimatedHeight,
      resolveDiagramMinPreviewHeight(root(), INFOGRAPHIC_PREVIEW_MIN_HEIGHT),
      maxPreviewHeight,
    )
    return {
      'max-height': maxHeight === 'none' ? undefined : maxHeight,
      'min-height': `${previewHeight}px`,
      'transform': `scale(${zoom()})`,
      'transform-origin': 'center center',
    }
  }
  const toggleCollapsed = () => {
    const next = !collapsed()
    setCollapsed(next)
    const sourceVisible = showSource() || !!error()
    const preview = host()
    const fallback = sourceHost()
    if (preview)
      preview.hidden = next || sourceVisible
    if (fallback)
      fallback.hidden = next || !sourceVisible
  }
  const downloadSvg = () => {
    const svg = host()?.querySelector('svg')?.outerHTML
    if (!svg)
      return
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `infographic-${Date.now()}.svg`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div ref={setRoot} class={`markstream-solid-enhanced-block markstream-solid-enhanced-block--infographic${(props.isDark ?? props.context?.isDark) ? ' dark' : ''}`} data-markstream-infographic="1">
      {(props.showHeader ?? true) && (
        <div class="markstream-solid-enhanced-block__header infographic-block-header">
          <span class="infographic-label">Infographic</span>
          <div class="markstream-solid-enhanced-block__actions infographic-header-actions">
            {(props.showModeToggle ?? true) && (
              <div class="infographic-mode-toggle">
                <button type="button" onClick={() => setShowSource(false)}>Preview</button>
                <button type="button" onClick={() => setShowSource(true)}>Source</button>
              </div>
            )}
            {(props.showCopyButton ?? true) && (
              <button
                type="button"
                aria-label={copied() ? 'Copied' : 'Copy'}
                onClick={() => {
                  void navigator.clipboard?.writeText(source())
                  props.context?.events.onCopy?.(source())
                  setCopied(true)
                  if (copyTimer)
                    clearTimeout(copyTimer)
                  copyTimer = setTimeout(() => setCopied(false), 1000)
                }}
              >
                {copied() ? 'Copied' : 'Copy'}
              </button>
            )}
            {(props.showExportButton ?? true) && <button type="button" aria-label="Export" onClick={downloadSvg}>Export</button>}
            {(props.showFullscreenButton ?? true) && <button type="button" aria-label="Fullscreen" onClick={() => void root()?.requestFullscreen?.()}>Fullscreen</button>}
            {(props.showCollapseButton ?? true) && <button type="button" aria-label="Collapse" onClick={toggleCollapsed}>Collapse</button>}
            {(props.showZoomControls ?? true) && (
              <div class="markstream-solid-zoom-controls">
                <button type="button" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(3, Math.round((value + 0.1) * 10) / 10))}>+</button>
                <button type="button" aria-label="Zoom out" onClick={() => setZoom(value => Math.max(0.5, Math.round((value - 0.1) * 10) / 10))}>−</button>
                <button type="button" aria-label="Reset zoom" onClick={() => setZoom(1)}>
                  {Math.round(zoom() * 100)}
                  %
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div ref={setHost} class="infographic-render" hidden={showSource() || !!error() || collapsed()} style={previewStyle()} />
      <pre ref={setSourceHost} class="infographic-source-fallback" hidden={!(showSource() || error()) || collapsed()}>
        {source()}
        {error() ? `\n${error()}` : ''}
      </pre>
    </div>
  )
}
