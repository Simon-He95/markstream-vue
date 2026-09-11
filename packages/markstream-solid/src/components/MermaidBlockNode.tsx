import type { SolidRenderableNode, SolidRenderContext } from '../node-helpers'
import { createEffect, createSignal, onCleanup } from 'solid-js'
import { toSafeMermaidSvgMarkup } from 'stream-markdown-parser'
import { clampPreviewHeight, estimateMermaidPreviewHeight, MERMAID_PREVIEW_MIN_HEIGHT, parsePositiveNumber, resolveDiagramMinPreviewHeight } from '../diagramHeight'
import { useSafeI18n } from '../i18n/useSafeI18n'
import { getString } from '../node-helpers'
import { getMermaid } from '../optional-mermaid'
import { canParseOffthread, findPrefixOffthread, hasMermaidWorker } from '../workers/mermaidWorkerClient'

export interface MermaidBlockNodeProps {
  node: SolidRenderableNode
  context?: SolidRenderContext
  loading?: boolean
  isDark?: boolean
  maxHeight?: string | null
  estimatedPreviewHeightPx?: number
  isStrict?: boolean
  workerTimeoutMs?: number
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showExportButton?: boolean
  showFullscreenButton?: boolean
  showCollapseButton?: boolean
  showZoomControls?: boolean
  enableMermaidInteractions?: boolean
  useWorkerPreparse?: boolean
  workerParseTimeoutMs?: number
  parseTimeoutMs?: number
  renderTimeoutMs?: number
  fullRenderTimeoutMs?: number
  renderDebounceMs?: number
  onRenderError?: (error: unknown, code: string, container: HTMLElement) => boolean | void
}

export function MermaidBlockNode(props: MermaidBlockNodeProps) {
  const { t } = useSafeI18n()
  const [host, setHost] = createSignal<HTMLDivElement>()
  const [error, setError] = createSignal('')
  const [svgMarkup, setSvgMarkup] = createSignal('')
  const [showSource, setShowSource] = createSignal(false)
  const [collapsed, setCollapsed] = createSignal(false)
  const [zoom, setZoom] = createSignal(1)
  const [copied, setCopied] = createSignal(false)
  const [root, setRoot] = createSignal<HTMLDivElement>()
  const [sourceHost, setSourceHost] = createSignal<HTMLPreElement>()
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  let renderTimer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let lastRenderKey = ''

  const normalizeMermaidSource = (value: string) => value
    .replace(/\]::([^:])/g, ']:::$1')
    .replace(/:::subgraphNode$/gm, '::subgraphNode')

  const resolvePreviewSource = async (source: string, dark: boolean) => {
    const isStreaming = props.loading ?? (props.node as any).loading ?? false
    if (!isStreaming || props.useWorkerPreparse === false || !hasMermaidWorker())
      return source

    const theme = dark ? 'dark' : 'light'
    const timeout = props.workerParseTimeoutMs ?? props.workerTimeoutMs ?? 1400
    try {
      if (await canParseOffthread(source, theme, timeout))
        return source
    }
    catch {
      // A worker is optional. Try its prefix operation before rendering the
      // current source on the main thread.
    }

    try {
      const prefix = await findPrefixOffthread(source, theme, timeout)
      if (prefix?.trim())
        return prefix
    }
    catch {
      // Rendering the full source retains the existing no-worker fallback.
    }

    return source
  }

  createEffect(() => {
    const target = host()
    const source = normalizeMermaidSource(getString((props.node as any).code))
    const dark = props.isDark ?? props.context?.isDark ?? false
    const strict = props.isStrict ?? true
    const sourceMode = showSource()
    const isCollapsed = collapsed()
    if (!target)
      return
    if (!source.trim() || sourceMode || isCollapsed) {
      lastRenderKey = ''
      if (renderTimer) {
        clearTimeout(renderTimer)
        renderTimer = undefined
      }
      generation += 1
      target.replaceChildren()
      setError('')
      if (!source.trim())
        setSvgMarkup('')
      return
    }
    const renderKey = `${dark ? 'd' : 'l'}:${strict ? '1' : '0'}:${source}`
    // Parser rebuilds the node object on every later token. Same source must
    // not bump generation or an in-flight mermaid.render is cancelled until
    // the whole stream stops.
    if (renderKey === lastRenderKey)
      return
    lastRenderKey = renderKey
    const token = ++generation
    if (renderTimer) {
      clearTimeout(renderTimer)
      renderTimer = undefined
    }
    const render = async () => {
      try {
        const mermaid = await getMermaid({ startOnLoad: false, securityLevel: strict ? 'strict' : 'loose', suppressErrorRendering: true, ...(strict ? { flowchart: { htmlLabels: false } } : {}) })
        if (token !== generation || !mermaid)
          throw new Error('Mermaid is not available.')
        const previewSource = await resolvePreviewSource(source, dark)
        if (token !== generation)
          return
        const themed = previewSource.trimStart().startsWith('%%{') ? previewSource : `%%{init: {"theme": "${dark ? 'dark' : 'default'}"}}%%\n${previewSource}`
        const timeout = props.loading ?? (props.node as any).loading
          ? props.renderTimeoutMs ?? 2500
          : props.fullRenderTimeoutMs ?? props.renderTimeoutMs ?? 4000
        const rendered = await new Promise<any>((resolve, reject) => {
          const timer = globalThis.setTimeout(() => reject(new Error('Mermaid render timed out')), timeout)
          Promise.resolve(mermaid.render(`markstream-solid-mermaid-${token}`, themed)).then(
            (value) => {
              globalThis.clearTimeout(timer)
              resolve(value)
            },
            (reason) => {
              globalThis.clearTimeout(timer)
              reject(reason)
            },
          )
        })
        if (token !== generation)
          return
        const svg = toSafeMermaidSvgMarkup(typeof rendered === 'string' ? rendered : rendered?.svg)
        if (!svg)
          throw new Error('Mermaid rendered empty SVG.')
        target.innerHTML = svg
        setSvgMarkup(svg)
        setError('')
        if (props.enableMermaidInteractions && typeof rendered !== 'string' && typeof rendered?.bindFunctions === 'function' && target.querySelector('svg'))
          rendered.bindFunctions(target)
      }
      catch (reason) {
        if (token !== generation)
          return
        target.replaceChildren()
        setSvgMarkup('')
        const message = reason instanceof Error ? reason.message : String(reason)
        setError(message)
        props.onRenderError?.(reason, 'MERMAID_RENDER_ERROR', target)
      }
    }
    const isStreaming = props.loading ?? (props.node as any).loading ?? false
    const delay = isStreaming ? Math.max(0, props.renderDebounceMs ?? 300) : 0
    if (delay > 0) {
      renderTimer = setTimeout(() => {
        renderTimer = undefined
        void render()
      }, delay)
    }
    else {
      void render()
    }
  })
  onCleanup(() => {
    generation += 1
    if (copyTimer)
      clearTimeout(copyTimer)
    if (renderTimer)
      clearTimeout(renderTimer)
  })
  const source = () => normalizeMermaidSource(getString((props.node as any).code))
  const previewStyle = () => {
    const maxHeight = props.maxHeight ?? '500px'
    const maxPreviewHeight = maxHeight === 'none' ? null : parsePositiveNumber(maxHeight)
    const estimatedHeight = parsePositiveNumber(props.estimatedPreviewHeightPx) ?? estimateMermaidPreviewHeight(source())
    const previewHeight = clampPreviewHeight(
      estimatedHeight,
      resolveDiagramMinPreviewHeight(root(), MERMAID_PREVIEW_MIN_HEIGHT),
      maxPreviewHeight,
    )
    return {
      'max-height': maxHeight === 'none' ? undefined : maxHeight,
      'min-height': `${previewHeight}px`,
      'transform': `scale(${zoom()})`,
      'transform-origin': 'center center',
    }
  }
  const showHeader = () => props.showHeader ?? true
  const showModeToggle = () => props.showModeToggle ?? true
  const showCopyButton = () => props.showCopyButton ?? true
  const showExportButton = () => props.showExportButton ?? true
  const showFullscreenButton = () => props.showFullscreenButton ?? true
  const showCollapseButton = () => props.showCollapseButton ?? true
  const showZoomControls = () => props.showZoomControls ?? true
  const downloadSvg = () => {
    const blob = new Blob([svgMarkup()], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `mermaid-diagram-${Date.now()}.svg`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const isStreaming = () => props.loading ?? Boolean((props.node as any).loading)
  const showLoading = () => !showSource() && !collapsed() && !svgMarkup() && !(error() && !isStreaming())
  const sourceVisible = () => !collapsed() && !showLoading() && (showSource() || (!!error() && !svgMarkup()))
  const previewHidden = () => collapsed() || showSource() || showLoading() || (!!error() && !svgMarkup())
  const toggleCollapsed = () => {
    const next = !collapsed()
    setCollapsed(next)
    const preview = host()
    const sourceFallback = sourceHost()
    if (preview)
      preview.hidden = next || showSource() || (!!error() && !svgMarkup())
    if (sourceFallback)
      sourceFallback.hidden = next || !(showSource() || (!!error() && !svgMarkup()))
  }
  return (
    <div ref={setRoot} class={`markstream-solid-enhanced-block markstream-solid-enhanced-block--mermaid${(props.isDark ?? props.context?.isDark) ? ' dark' : ''}${isStreaming() || showLoading() ? ' is-rendering' : ''}`} data-markstream-mermaid="1">
      {showHeader() && (
        <div class="markstream-solid-enhanced-block__header mermaid-block-header">
          <span class="mermaid-label">Mermaid</span>
          <div class="markstream-solid-enhanced-block__actions mermaid-header-actions">
            {showModeToggle() && (
              <div class="mermaid-mode-toggle">
                <button type="button" class={`mermaid-mode-btn${!showSource() ? ' is-active' : ''}`} onClick={() => setShowSource(false)}>Preview</button>
                <button type="button" class={`mermaid-mode-btn${showSource() ? ' is-active' : ''}`} onClick={() => setShowSource(true)}>Source</button>
              </div>
            )}
            {showCollapseButton() && <button type="button" class="mermaid-action-btn" aria-label="Collapse" onClick={toggleCollapsed}>Collapse</button>}
            {showCopyButton() && (
              <button
                type="button"
                class="mermaid-action-btn"
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
            {showExportButton() && <button type="button" class="mermaid-action-btn" aria-label="Export" disabled={!svgMarkup()} onClick={downloadSvg}>Export</button>}
            {showFullscreenButton() && <button type="button" class="mermaid-action-btn" aria-label="Fullscreen" disabled={!svgMarkup()} onClick={() => void root()?.requestFullscreen?.()}>Fullscreen</button>}
            {showZoomControls() && (
              <div class="markstream-solid-zoom-controls">
                <button type="button" class="mermaid-action-btn" aria-label="Zoom in" onClick={() => setZoom(value => Math.min(3, Math.round((value + 0.1) * 10) / 10))}>+</button>
                <button type="button" class="mermaid-action-btn" aria-label="Zoom out" onClick={() => setZoom(value => Math.max(0.5, Math.round((value - 0.1) * 10) / 10))}>−</button>
                <button type="button" class="mermaid-action-btn" aria-label="Reset zoom" onClick={() => setZoom(1)}>
                  {Math.round(zoom() * 100)}
                  %
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div ref={setHost} class="mermaid-render" hidden={previewHidden()} style={previewStyle()} />
      {showLoading() && (
        <div class="mermaid-loading" data-markstream-diagram-loading="mermaid">
          <span class="mermaid-spinner" />
          {t('common.preview')}
        </div>
      )}
      <pre ref={setSourceHost} class="mermaid-source-fallback" hidden={!sourceVisible()}>
        {source()}
        {error() && !isStreaming() ? `\n${error()}` : ''}
      </pre>
    </div>
  )
}
