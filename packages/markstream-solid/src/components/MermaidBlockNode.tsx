import type { SolidRenderableNode, SolidRenderContext } from '../node-helpers'
import { createEffect, createSignal, onCleanup } from 'solid-js'
import { toSafeMermaidSvgMarkup } from 'stream-markdown-parser'
import { clampPreviewHeight, estimateMermaidPreviewHeight, getMermaidDiagramKind, MERMAID_PREVIEW_MIN_HEIGHT, parsePositiveNumber, resolveDiagramMinPreviewHeight } from '../diagramHeight'
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

type MermaidTheme = 'light' | 'dark'
type ProgressivePreview = { mode: 'full' | 'prefix' | 'miss', value: string }

function applyMermaidThemeTo(value: string, dark: boolean) {
  const trimmed = value.trimStart()
  if (trimmed.startsWith('%%{'))
    return value
  return `%%{init: {"theme": "${dark ? 'dark' : 'default'}"}}%%\n${value}`
}

function withTimeout<T>(run: () => Promise<T>, timeoutMs: number) {
  if (!timeoutMs || timeoutMs <= 0)
    return run()
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
    run().then((value) => {
      globalThis.clearTimeout(timer)
      resolve(value)
    }).catch((error) => {
      globalThis.clearTimeout(timer)
      reject(error)
    })
  })
}

function isGanttTaskLine(rawLine: string) {
  const line = rawLine.trim()
  if (!line || line.startsWith('%%'))
    return false
  if (/^(?:gantt|title|dateformat|axisformat|tickinterval|excludes|section|todaymarker|topaxis|weekday|weekend|acctitle|accdescr|accdescrmultiline)\b/i.test(line))
    return false
  return line.includes(':')
}

function getSafeGanttPreviewCandidate(value: string) {
  const lines = value.split(/\r?\n/)
  if (!/\r?\n$/.test(value) && lines.length > 0)
    lines.pop()
  while (lines.length > 0) {
    const last = lines[lines.length - 1]?.trim()
    if (!last || last.startsWith('%%')) {
      lines.pop()
      continue
    }
    if (isGanttTaskLine(last))
      break
    lines.pop()
  }
  return lines.some(isGanttTaskLine) ? lines.join('\n') : ''
}

function getSafeMermaidPrefixCandidate(value: string) {
  if (getMermaidDiagramKind(value) === 'gantt')
    return getSafeGanttPreviewCandidate(value)
  const lines = value.split('\n')
  while (lines.length > 0) {
    const last = (lines[lines.length - 1] || '').trimEnd()
    if (!last) {
      lines.pop()
      continue
    }
    const dangling = /^[-=~>|<\s]+$/.test(last.trim())
      || /(?:--|==|~~|->|<-|-\||-\)|-x|o-|\|-|\.-)\s*$/.test(last)
      || /[-|><]$/.test(last)
      || /(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt)\s*$/i.test(last)
    if (!dangling)
      break
    lines.pop()
  }
  return lines.join('\n').trim() || ''
}

function normalizeRenderedCode(value: string) {
  return value.replace(/\s+/g, '')
}

function restoreCachedSvg(target: HTMLElement, cached: string | undefined, setSvgMarkup: (value: string) => void) {
  if (!cached)
    return
  target.innerHTML = cached
  setSvgMarkup(cached)
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
  const [modalOpen, setModalOpen] = createSignal(false)
  const [modalHost, setModalHost] = createSignal<HTMLDivElement>()
  let svgCache: Partial<Record<MermaidTheme, string>> = {}
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  let renderTimer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let lastRenderKey = ''
  let lastProgressiveMissSignature = ''
  let lastRenderedCode = ''
  let hasRenderedOnce = false

  const normalizeMermaidSource = (value: string) => value
    .replace(/\]::([^:])/g, ']:::$1')
    .replace(/:::subgraphNode$/gm, '::subgraphNode')

  const isStreamingNode = () => props.loading ?? (props.node as any).loading ?? false
  const progressivePreview = () => isStreamingNode() || props.context?.final === false

  async function canParseMermaid(value: string, dark: boolean, mermaid: any) {
    const theme: MermaidTheme = dark ? 'dark' : 'light'
    const timeout = props.workerParseTimeoutMs ?? props.workerTimeoutMs ?? 1400
    if (props.useWorkerPreparse !== false && hasMermaidWorker()) {
      try {
        if (await canParseOffthread(value, theme, timeout))
          return true
      }
      catch {
        // Fall through to mermaid.parse / prefix.
      }
    }
    if (typeof mermaid?.parse !== 'function')
      return true
    await withTimeout(() => Promise.resolve(mermaid.parse(applyMermaidThemeTo(value, dark))), props.parseTimeoutMs ?? 1800)
    return true
  }

  async function resolveProgressivePreview(source: string, dark: boolean, mermaid: any): Promise<ProgressivePreview> {
    const theme: MermaidTheme = dark ? 'dark' : 'light'
    const timeout = props.workerParseTimeoutMs ?? props.workerTimeoutMs ?? 1400

    if (props.useWorkerPreparse !== false && hasMermaidWorker()) {
      try {
        if (await canParseOffthread(source, theme, timeout))
          return { mode: 'full', value: source }
      }
      catch {
        // Try prefix / mermaid.parse below.
      }
      try {
        const prefix = await findPrefixOffthread(source, theme, timeout)
        if (prefix?.trim()) {
          if (!hasRenderedOnce)
            return { mode: 'prefix', value: prefix }
          return { mode: 'miss', value: source }
        }
      }
      catch {
        // Continue to mermaid.parse / local prefix.
      }
    }

    if (typeof mermaid?.parse === 'function') {
      try {
        await canParseMermaid(source, dark, mermaid)
        return { mode: 'full', value: source }
      }
      catch {
        const prefix = getSafeMermaidPrefixCandidate(source)
        if (prefix && prefix !== source && !hasRenderedOnce) {
          try {
            await canParseMermaid(prefix, dark, mermaid)
            return { mode: 'prefix', value: prefix }
          }
          catch {
            return { mode: 'miss', value: source }
          }
        }
        return { mode: 'miss', value: source }
      }
    }

    return { mode: 'full', value: source }
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
      if (!source.trim()) {
        setSvgMarkup('')
        svgCache = {}
        lastRenderedCode = ''
        lastProgressiveMissSignature = ''
        hasRenderedOnce = false
      }
      return
    }
    const renderKey = `${dark ? 'd' : 'l'}:${strict ? '1' : '0'}:${source}`
    const streaming = progressivePreview()
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
      const theme: MermaidTheme = dark ? 'dark' : 'light'
      try {
        const mermaid = await getMermaid({ startOnLoad: false, securityLevel: strict ? 'strict' : 'loose', suppressErrorRendering: true, ...(strict ? { flowchart: { htmlLabels: false } } : {}) })
        if (token !== generation || !mermaid)
          throw new Error('Mermaid is not available.')
        let previewSource = source
        let fullRender = true
        if (streaming) {
          if (hasRenderedOnce && normalizeRenderedCode(source) === lastRenderedCode && svgMarkup()) {
            setError('')
            return
          }
          const parsed = await resolveProgressivePreview(source, dark, mermaid)
          if (token !== generation)
            return
          if (parsed.mode === 'full') {
            previewSource = source
          }
          else if (parsed.mode === 'prefix') {
            previewSource = parsed.value
            fullRender = false
          }
          else {
            setError('')
            lastProgressiveMissSignature = renderKey
            restoreCachedSvg(target, svgCache[theme], setSvgMarkup)
            return
          }
        }
        const themed = applyMermaidThemeTo(previewSource, dark)
        const timeout = streaming
          ? props.renderTimeoutMs ?? 2500
          : props.fullRenderTimeoutMs ?? props.renderTimeoutMs ?? 4000
        const rendered = await withTimeout(
          () => Promise.resolve(mermaid.render(`markstream-solid-mermaid-${token}`, themed)),
          timeout,
        )
        if (token !== generation)
          return
        const svg = toSafeMermaidSvgMarkup(typeof rendered === 'string' ? rendered : rendered?.svg)
        if (!svg)
          throw new Error('Mermaid rendered empty SVG.')
        target.innerHTML = svg
        setSvgMarkup(svg)
        setError('')
        lastProgressiveMissSignature = ''
        if (fullRender) {
          hasRenderedOnce = true
          lastRenderedCode = normalizeRenderedCode(source)
          svgCache[theme] = svg
        }
        if (props.enableMermaidInteractions && typeof rendered !== 'string' && typeof rendered?.bindFunctions === 'function' && target.querySelector('svg'))
          rendered.bindFunctions(target)
      }
      catch (reason) {
        if (token !== generation)
          return
        if (streaming) {
          setError('')
          lastProgressiveMissSignature = renderKey
          restoreCachedSvg(target, svgCache[theme], setSvgMarkup)
          return
        }
        target.replaceChildren()
        setSvgMarkup('')
        const message = reason instanceof Error ? reason.message : String(reason)
        setError(message)
        props.onRenderError?.(reason, 'MERMAID_RENDER_ERROR', target)
      }
    }
    const delay = streaming ? Math.max(0, props.renderDebounceMs ?? 300) : 0
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
    return [
      `min-height: ${previewHeight}px`,
      maxHeight && maxHeight !== 'none' ? `max-height: ${maxHeight}` : '',
      `transform: scale(${zoom()})`,
    ].filter(Boolean).join('; ')
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
            {showFullscreenButton() && <button type="button" class="mermaid-action-btn" data-markstream-mermaid-fullscreen aria-label={t('common.open') || 'Open'} disabled={!svgMarkup()} onClick={() => setModalOpen(true)}>Fullscreen</button>}
            {showZoomControls() && (
              <div class="markstream-solid-zoom-controls">
                <button type="button" class="mermaid-action-btn" data-markstream-mermaid-zoom-in aria-label={t('common.zoomIn') || 'Zoom in'} onClick={() => setZoom(value => Math.min(3, Math.round((value + 0.1) * 10) / 10))}>+</button>
                <button type="button" class="mermaid-action-btn" data-markstream-mermaid-zoom-out aria-label={t('common.zoomOut') || 'Zoom out'} onClick={() => setZoom(value => Math.max(0.5, Math.round((value - 0.1) * 10) / 10))}>−</button>
                <button type="button" class="mermaid-action-btn" data-markstream-mermaid-zoom-reset aria-label={t('common.resetZoom') || 'Reset zoom'} onClick={() => setZoom(1)}>
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
      {modalOpen() && (
        <div class={`markstream-solid markstream-solid-modal-root${(props.isDark ?? props.context?.isDark) ? ' dark' : ''}`}>
          <div
            class="mermaid-modal-overlay"
            role="dialog"
            aria-modal="true"
            tabindex="-1"
            onClick={(event) => {
              if (event.target === event.currentTarget)
                setModalOpen(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape')
                setModalOpen(false)
            }}
          >
            <div class="mermaid-modal-panel">
              <div class="mermaid-modal-controls">
                <button type="button" class="mermaid-action-btn" aria-label={t('common.zoomIn') || 'Zoom in'} onClick={() => setZoom(value => Math.min(3, Math.round((value + 0.1) * 10) / 10))}>+</button>
                <button type="button" class="mermaid-action-btn" aria-label={t('common.zoomOut') || 'Zoom out'} onClick={() => setZoom(value => Math.max(0.5, Math.round((value - 0.1) * 10) / 10))}>−</button>
                <button type="button" class="mermaid-action-btn" aria-label={t('common.resetZoom') || 'Reset zoom'} onClick={() => setZoom(1)}>
                  {Math.round(zoom() * 100)}
                  %
                </button>
                <button type="button" class="mermaid-action-btn" aria-label={t('common.close') || 'Close'} onClick={() => setModalOpen(false)}>Close</button>
              </div>
              <div class="mermaid-modal-body">
                <div ref={setModalHost} class="mermaid-modal-content" style={`transform: scale(${zoom()})`} innerHTML={svgMarkup()} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
