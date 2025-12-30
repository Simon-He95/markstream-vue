import type { VisibilityHandle } from '../../context/viewportPriority'
import type { MermaidBlockEvent, MermaidBlockNodeProps } from '../../types/component-props'
import clsx from 'clsx'
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useViewportPriority } from '../../context/viewportPriority'
import { useSafeI18n } from '../../i18n/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../tooltip/singletonTooltip'
import { getLanguageIcon } from '../../utils/languageIcon'
import { safeRaf } from '../../utils/safeRaf'
import { canParseOffthread, findPrefixOffthread, terminateWorker as terminateMermaidWorker } from '../../workers/mermaidWorkerClient'
import { getMermaid } from './mermaid'

type Theme = 'light' | 'dark'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const DOMPURIFY_CONFIG = {
  USE_PROFILES: { svg: true },
  FORBID_TAGS: ['script'],
  FORBID_ATTR: [/^on/i],
  ADD_TAGS: ['style'],
  ADD_ATTR: ['style'],
  SAFE_FOR_TEMPLATES: true,
} as const

function neutralizeScriptProtocols(raw: string) {
  return raw
    .replace(/["']\s*javascript:/gi, '#')
    .replace(/\bjavascript:/gi, '#')
    .replace(/["']\s*vbscript:/gi, '#')
    .replace(/\bvbscript:/gi, '#')
    .replace(/\bdata:text\/html/gi, '#')
}

const DISALLOWED_STYLE_PATTERNS = [/javascript:/i, /expression\s*\(/i, /url\s*\(\s*javascript:/i, /@import/i]
const SAFE_URL_PROTOCOLS = /^(?:https?:|mailto:|tel:|#|\/|data:image\/(?:png|gif|jpe?g|webp);)/i

function sanitizeUrl(value: string | null | undefined) {
  if (!value)
    return ''
  const trimmed = value.trim()
  if (SAFE_URL_PROTOCOLS.test(trimmed))
    return trimmed
  return ''
}

function scrubSvgElement(svgEl: SVGElement) {
  const forbiddenTags = new Set(['script'])
  const nodes = [svgEl, ...Array.from(svgEl.querySelectorAll<SVGElement>('*'))]
  for (const node of nodes) {
    if (forbiddenTags.has(node.tagName.toLowerCase())) {
      node.remove()
      continue
    }
    const attrs = Array.from(node.attributes)
    for (const attr of attrs) {
      const name = attr.name
      if (/^on/i.test(name)) {
        node.removeAttribute(name)
        continue
      }
      if (name === 'style' && attr.value) {
        const val = attr.value
        if (DISALLOWED_STYLE_PATTERNS.some(re => re.test(val))) {
          node.removeAttribute(name)
          continue
        }
      }
      if ((name === 'href' || name === 'xlink:href') && attr.value) {
        const safe = sanitizeUrl(attr.value)
        if (!safe) {
          node.removeAttribute(name)
          continue
        }
        if (safe !== attr.value)
          node.setAttribute(name, safe)
      }
    }
  }
}

function toSafeSvgElement(svg: string | null | undefined): SVGElement | null {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined')
    return null
  if (!svg)
    return null
  const neutralized = neutralizeScriptProtocols(svg)
  const parsed = new DOMParser().parseFromString(neutralized, 'image/svg+xml')
  const svgEl = parsed.documentElement
  if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg')
    return null
  const svgElement = svgEl as unknown as SVGElement
  scrubSvgElement(svgElement)
  return svgElement
}

function clearElement(target: HTMLElement | null | undefined) {
  if (!target)
    return
  try {
    target.replaceChildren()
  }
  catch {
    target.innerHTML = ''
  }
}

function setSafeSvg(target: HTMLElement | null | undefined, svg: string | null | undefined) {
  if (!target)
    return ''
  clearElement(target)
  const safeElement = toSafeSvgElement(svg)
  if (safeElement) {
    target.appendChild(safeElement)
    return target.innerHTML
  }
  return ''
}

function renderSvgToTarget(target: HTMLElement | null | undefined, svg: string | null | undefined, strict: boolean) {
  if (!target)
    return ''
  if (strict)
    return setSafeSvg(target, svg)
  clearElement(target)
  if (svg) {
    try {
      target.insertAdjacentHTML('afterbegin', svg)
    }
    catch {
      target.innerHTML = svg
    }
  }
  return target.innerHTML
}

const DEFAULTS = {
  maxHeight: '500px',
  loading: true,
  workerTimeoutMs: 1400,
  parseTimeoutMs: 1800,
  renderTimeoutMs: 2500,
  fullRenderTimeoutMs: 4000,
  showHeader: true,
  showModeToggle: true,
  showCopyButton: true,
  showExportButton: true,
  showFullscreenButton: true,
  showCollapseButton: true,
  showZoomControls: true,
  enableWheelZoom: false,
  isStrict: false,
}

export interface MermaidBlockNodeReactEvents {
  onCopy?: (code: string) => void
  onExport?: (event: MermaidBlockEvent<{ type: 'export' }>) => void
  onOpenModal?: (event: MermaidBlockEvent<{ type: 'open-modal' }>) => void
  onToggleMode?: (
    target: 'preview' | 'source',
    event: MermaidBlockEvent<{ type: 'toggle-mode', target: 'preview' | 'source' }>,
  ) => void
}

export function MermaidBlockNode(rawProps: MermaidBlockNodeProps & MermaidBlockNodeReactEvents) {
  const props = { ...DEFAULTS, ...rawProps } as (typeof DEFAULTS & MermaidBlockNodeProps & MermaidBlockNodeReactEvents)
  const { t } = useSafeI18n()
  const languageIcon = useMemo(() => getLanguageIcon('mermaid'), [])
  const baseCode = props.node?.code ?? ''
  const baseFixedCode = useMemo(() => {
    return baseCode
      .replace(/\]::([^:])/g, ']:::$1')
      .replace(/:::subgraphNode$/gm, '::subgraphNode')
  }, [baseCode])

  const workerTimeout = props.workerTimeoutMs ?? DEFAULTS.workerTimeoutMs
  const parseTimeout = props.parseTimeoutMs ?? DEFAULTS.parseTimeoutMs
  const renderTimeout = props.renderTimeoutMs ?? DEFAULTS.renderTimeoutMs
  const fullRenderTimeout = props.fullRenderTimeoutMs ?? DEFAULTS.fullRenderTimeoutMs

  const [mermaidAvailable, setMermaidAvailable] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [copying, setCopying] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [hasRenderedOnce, setHasRenderedOnce] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [containerHeight, setContainerHeight] = useState<string>(() => {
    if (props.maxHeight == null)
      return '360px'
    return props.maxHeight
  })
  const [viewportReady, setViewportReady] = useState(typeof window === 'undefined')

  const mermaidRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const modeContainerRef = useRef<HTMLDivElement | null>(null)
  const modalContentRef = useRef<HTMLDivElement | null>(null)
  const modalCloneWrapperRef = useRef<HTMLElement | null>(null)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const renderTokenRef = useRef(0)
  const svgCacheRef = useRef<{ light?: string, dark?: string }>({})
  const lastRenderedCodeRef = useRef('')
  const userToggledRef = useRef(false)
  const viewportHandleRef = useRef<VisibilityHandle | null>(null)
  const hasRenderedOnceRef = useRef(false)
  const savedTransformRef = useRef({
    zoom: 1,
    translateX: 0,
    translateY: 0,
    containerHeight: containerHeight || '360px',
  })

  const registerViewport = useViewportPriority()
  const streaming = Boolean(props.node?.loading ?? props.loading)
  const theme: Theme = props.isDark ? 'dark' : 'light'
  const strictMode = Boolean(props.isStrict)
  const mermaidInitConfig = useMemo(() => {
    if (!strictMode) {
      return {
        startOnLoad: false,
        securityLevel: 'loose',
      }
    }
    return {
      startOnLoad: false,
      securityLevel: 'strict',
      dompurifyConfig: DOMPURIFY_CONFIG,
      flowchart: { htmlLabels: false },
    }
  }, [strictMode])

  useEffect(() => {
    hasRenderedOnceRef.current = hasRenderedOnce
  }, [hasRenderedOnce])

  useEffect(() => {
    svgCacheRef.current = {}
  }, [theme, baseFixedCode, strictMode])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const instance = await getMermaid(mermaidInitConfig as any)
      if (cancelled)
        return
      mermaidRef.current = instance
      setMermaidAvailable(Boolean(instance))
      if (!userToggledRef.current)
        setShowSource(!instance)
    })()
    return () => {
      cancelled = true
    }
  }, [mermaidInitConfig])

  useEffect(() => {
    const el = containerRef.current
    if (!el)
      return
    const handle = registerViewport(el, { rootMargin: '400px' })
    viewportHandleRef.current = handle
    if (handle.isVisible())
      setViewportReady(true)
    handle.whenVisible.then(() => setViewportReady(true))
    return () => {
      handle.destroy()
      viewportHandleRef.current = null
    }
  }, [registerViewport])

  useEffect(() => {
    if (typeof document === 'undefined')
      return
    if (!modalOpen)
      return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [modalOpen])

  const updateContainerHeight = useCallback((newWidth?: number) => {
    const container = containerRef.current
    const content = contentRef.current
    if (!container || !content)
      return
    const svgElement = content.querySelector('svg')
    if (!svgElement)
      return
    let intrinsicWidth = 0
    let intrinsicHeight = 0
    const viewBox = svgElement.getAttribute('viewBox')
    if (viewBox) {
      const parts = viewBox.split(' ')
      if (parts.length === 4) {
        intrinsicWidth = Number.parseFloat(parts[2])
        intrinsicHeight = Number.parseFloat(parts[3])
      }
    }
    if ((!intrinsicWidth || !intrinsicHeight) && svgElement.hasAttribute('width') && svgElement.hasAttribute('height')) {
      intrinsicWidth = Number.parseFloat(svgElement.getAttribute('width') || '0')
      intrinsicHeight = Number.parseFloat(svgElement.getAttribute('height') || '0')
    }
    if (!intrinsicWidth || !intrinsicHeight || Number.isNaN(intrinsicWidth) || Number.isNaN(intrinsicHeight)) {
      try {
        const bbox = svgElement.getBBox()
        intrinsicWidth = bbox.width
        intrinsicHeight = bbox.height
      }
      catch {
        return
      }
    }
    if (!(intrinsicWidth > 0 && intrinsicHeight > 0))
      return
    const containerWidth = newWidth ?? container.clientWidth
    const aspect = intrinsicHeight / intrinsicWidth
    const target = containerWidth * aspect
    const resolved = Number.isFinite(target) && target > 0 ? target : intrinsicHeight
    setContainerHeight(`${Math.min(resolved, intrinsicHeight)}px`)
  }, [])

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined')
      return
    const observer = new ResizeObserver((entries) => {
      if (!entries.length)
        return
      const width = entries[0].contentRect.width
      safeRaf(() => updateContainerHeight(width))
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [updateContainerHeight])

  useEffect(() => {
    return () => {
      terminateMermaidWorker()
    }
  }, [])

  const renderFull = useCallback(async (code: string, t: Theme, signal?: AbortSignal) => {
    if (!mermaidRef.current || !contentRef.current)
      return false
    setRendering(true)
    try {
      const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const themed = applyThemeTo(code, t)
      const result = await withTimeoutSignal(
        () => (mermaidRef.current as any).render(id, themed),
        { timeoutMs: fullRenderTimeout, signal },
      ) as any
      if (!result?.svg)
        return false
      const rendered = renderSvgToTarget(contentRef.current, result.svg, strictMode)
      result.bindFunctions?.(contentRef.current)
      updateContainerHeight()
      svgCacheRef.current[t] = rendered
      setHasRenderedOnce(true)
      setError(null)
      return true
    }
    catch (err) {
      if (!streaming) {
        setError(err instanceof Error ? err.message : String(err))
      }
      return false
    }
    finally {
      setRendering(false)
    }
  }, [fullRenderTimeout, streaming, strictMode, updateContainerHeight])

  const renderPartial = useCallback(async (code: string, t: Theme, signal?: AbortSignal) => {
    if (!mermaidRef.current || !contentRef.current)
      return
    setRendering(true)
    try {
      const id = `mermaid-preview-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      const safePrefix = getSafePrefixCandidate(code)
      const themed = applyThemeTo(safePrefix || code, t)
      const res = await withTimeoutSignal(
        () => (mermaidRef.current as any).render(id, themed),
        { timeoutMs: renderTimeout, signal },
      ) as any
      if (res?.svg) {
        renderSvgToTarget(contentRef.current, res.svg, strictMode)
        res.bindFunctions?.(contentRef.current)
        updateContainerHeight()
      }
    }
    catch {
      // swallow partial errors
    }
    finally {
      setRendering(false)
    }
  }, [renderTimeout, streaming, strictMode, updateContainerHeight])

  const progressiveRender = useCallback(async (code: string, signal?: AbortSignal) => {
    if (!code.trim()) {
      clearElement(contentRef.current)
      setHasRenderedOnce(false)
      lastRenderedCodeRef.current = ''
      return
    }
    const normalized = code.replace(/\s+/g, '')
    if (normalized === lastRenderedCodeRef.current && hasRenderedOnceRef.current)
      return
    const token = ++renderTokenRef.current
    try {
      await canParseWithFallback(code, theme, {
        workerTimeout,
        parseTimeout,
        mermaid: mermaidRef.current,
        signal,
      })
      if (signal?.aborted || renderTokenRef.current !== token)
        return
      const ok = await renderFull(code, theme, signal)
      if (ok)
        lastRenderedCodeRef.current = normalized
      return
    }
    catch (err) {
      if ((err as any)?.name === 'AbortError')
        return
    }
    try {
      const prefix = await findPrefixCandidate(code, theme, { workerTimeout, signal })
      if (!prefix || signal?.aborted || renderTokenRef.current !== token)
        return
      await renderPartial(prefix, theme, signal)
    }
    catch {}
  }, [parseTimeout, renderFull, renderPartial, theme, workerTimeout])

  useEffect(() => {
    if (!viewportReady || showSource || isCollapsed)
      return
    const controller = new AbortController()
    progressiveRender(baseFixedCode, controller.signal)
    return () => controller.abort()
  }, [baseFixedCode, isCollapsed, progressiveRender, showSource, viewportReady])

  const handleTooltip = useCallback((event: React.MouseEvent<HTMLElement>, text: string) => {
    const origin = { x: event.clientX, y: event.clientY }
    showTooltipForAnchor(event.currentTarget, text, 'top', false, origin, props.isDark)
  }, [props.isDark])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(baseFixedCode)
      setCopying(true)
      props.onCopy?.(baseFixedCode)
      setTimeout(() => setCopying(false), 1000)
    }
    catch {}
  }, [baseFixedCode, props])

  const handleExport = useCallback(() => {
    const svgElement = contentRef.current?.querySelector('svg') ?? null
    if (!svgElement)
      return
    const svgString = serializeSvg(svgElement)
    const ev: MermaidBlockEvent<{ type: 'export' }> = {
      payload: { type: 'export' },
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      },
      svgElement,
      svgString,
    }
    props.onExport?.(ev)
    if (!ev.defaultPrevented)
      exportSvg(svgElement, svgString)
  }, [props])

  const clearModalContent = useCallback(() => {
    modalCloneWrapperRef.current = null
    clearElement(modalContentRef.current)
  }, [])

  const closeModal = useCallback(() => {
    setModalOpen(false)
    clearModalContent()
  }, [clearModalContent])

  const handleOpenModal = useCallback(() => {
    const svgElement = contentRef.current?.querySelector('svg') ?? null
    const svgString = svgElement ? serializeSvg(svgElement) : null
    const ev: MermaidBlockEvent<{ type: 'open-modal' }> = {
      payload: { type: 'open-modal' },
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      },
      svgElement,
      svgString,
    }
    props.onOpenModal?.(ev)
    if (ev.defaultPrevented)
      return
    setModalOpen(true)
  }, [props])

  useEffect(() => {
    if (!modalOpen)
      return
    if (typeof window === 'undefined')
      return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        closeModal()
    }
    try {
      window.addEventListener('keydown', onKeyDown)
    }
    catch {}
    return () => {
      try {
        window.removeEventListener('keydown', onKeyDown)
      }
      catch {}
    }
  }, [closeModal, modalOpen])

  useIsomorphicLayoutEffect(() => {
    if (!modalOpen)
      return
    const host = modalContentRef.current
    const original = containerRef.current
    if (!host || !original)
      return

    const transform = `translate(${translate.x}px, ${translate.y}px) scale(${zoom})`
    const clone = original.cloneNode(true) as HTMLElement
    clone.classList.add('fullscreen')
    const wrapper = clone.querySelector('[data-mermaid-wrapper]') as HTMLElement | null
    if (wrapper) {
      modalCloneWrapperRef.current = wrapper
      wrapper.style.transform = transform
    }
    clearElement(host)
    host.appendChild(clone)
  }, [modalOpen])

  useEffect(() => {
    if (!modalOpen)
      return
    if (!modalCloneWrapperRef.current)
      return
    modalCloneWrapperRef.current.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${zoom})`
  }, [modalOpen, translate.x, translate.y, zoom])

  const isFullscreenDisabled = showSource || rendering || isCollapsed
  const computedButtonClass = useMemo(() => {
    return props.isDark
      ? 'mermaid-action-btn p-2 text-xs rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200'
      : 'mermaid-action-btn p-2 text-xs rounded text-gray-600 hover:bg-gray-200 hover:text-gray-700'
  }, [props.isDark])

  const handleSwitchMode = useCallback((target: 'preview' | 'source') => {
    const ev: MermaidBlockEvent<{ type: 'toggle-mode', target: 'preview' | 'source' }> = {
      payload: { type: 'toggle-mode', target },
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      },
    }
    props.onToggleMode?.(target, ev)
    if (ev.defaultPrevented)
      return

    userToggledRef.current = true
    if (target === 'preview') {
      setShowSource(false)
      const saved = savedTransformRef.current
      setZoom(saved.zoom)
      setTranslate({ x: saved.translateX, y: saved.translateY })
      setContainerHeight(saved.containerHeight)
      if (hasRenderedOnceRef.current && svgCacheRef.current[theme] && contentRef.current) {
        contentRef.current.innerHTML = svgCacheRef.current[theme]!
        updateContainerHeight()
      }
      else {
        progressiveRender(baseFixedCode)
      }
    }
    else {
      savedTransformRef.current = {
        zoom,
        translateX: translate.x,
        translateY: translate.y,
        containerHeight,
      }
      setShowSource(true)
    }
  }, [
    baseFixedCode,
    containerHeight,
    progressiveRender,
    props,
    theme,
    translate.x,
    translate.y,
    updateContainerHeight,
    zoom,
  ])

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (props.enableWheelZoom === false)
      return
    if (!event.ctrlKey && !event.metaKey)
      return
    event.preventDefault()
    const container = containerRef.current
    if (!container)
      return
    const rect = container.getBoundingClientRect()
    const offsetX = event.clientX - rect.left - translate.x
    const offsetY = event.clientY - rect.top - translate.y
    const delta = -event.deltaY * 0.01
    const nextZoom = clamp(zoom + delta, 0.5, 3)
    if (nextZoom === zoom)
      return
    const scaleRatio = nextZoom / zoom
    setTranslate({
      x: translate.x - offsetX * (scaleRatio - 1),
      y: translate.y - offsetY * (scaleRatio - 1),
    })
    setZoom(nextZoom)
  }, [translate, zoom])

  const startDrag = useCallback((clientX: number, clientY: number) => {
    setIsDragging(true)
    dragStartRef.current = {
      x: clientX - translate.x,
      y: clientY - translate.y,
    }
  }, [translate.x, translate.y])

  const onDrag = useCallback((clientX: number, clientY: number) => {
    if (!isDragging)
      return
    setTranslate({
      x: clientX - dragStartRef.current.x,
      y: clientY - dragStartRef.current.y,
    })
  }, [isDragging])

  const stopDrag = useCallback(() => {
    setIsDragging(false)
  }, [])

  const previewContent = (
    <div className="relative">
      {props.showZoomControls && (
        <div className="absolute top-2 right-2 z-10 rounded-lg">
          <div className="flex items-center gap-2 backdrop-blur rounded-lg">
            <button
              type="button"
              className={clsx(
                'p-2 text-xs rounded transition-colors',
                props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200',
              )}
              onMouseEnter={event => handleTooltip(event, t('common.zoomIn'))}
              onMouseLeave={() => hideTooltip()}
              onClick={() => setZoom(clamp(zoom + 0.1, 0.5, 3))}
            >
              +
            </button>
            <button
              type="button"
              className={clsx(
                'p-2 text-xs rounded transition-colors',
                props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200',
              )}
              onMouseEnter={event => handleTooltip(event, t('common.zoomOut'))}
              onMouseLeave={() => hideTooltip()}
              onClick={() => setZoom(clamp(zoom - 0.1, 0.5, 3))}
            >
              −
            </button>
            <button
              type="button"
              className={clsx(
                'p-2 text-xs rounded transition-colors',
                props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200',
              )}
              onMouseEnter={event => handleTooltip(event, t('common.resetZoom'))}
              onMouseLeave={() => hideTooltip()}
              onClick={() => {
                setZoom(1)
                setTranslate({ x: 0, y: 0 })
              }}
            >
              {Math.round(zoom * 100)}
              %
            </button>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className={clsx(
          'min-h-[360px] relative transition-all duration-100 overflow-hidden block',
          props.isDark ? 'bg-gray-900' : 'bg-gray-50',
        )}
        style={{ height: containerHeight, maxHeight: props.maxHeight ?? undefined }}
        onWheel={handleWheel}
        onMouseDown={(event) => {
          if (event.button !== 0)
            return
          event.preventDefault()
          startDrag(event.clientX, event.clientY)
        }}
        onMouseMove={event => onDrag(event.clientX, event.clientY)}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onTouchStart={(event) => {
          const touch = event.touches[0]
          if (!touch)
            return
          startDrag(touch.clientX, touch.clientY)
        }}
        onTouchMove={(event) => {
          const touch = event.touches[0]
          if (!touch)
            return
          onDrag(touch.clientX, touch.clientY)
        }}
        onTouchEnd={stopDrag}
      >
        <div
          ref={wrapperRef}
          data-mermaid-wrapper
          className={clsx('absolute inset-0 cursor-grab', { 'cursor-grabbing': isDragging })}
          style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${zoom})` }}
        >
          <div
            ref={contentRef}
            className="_mermaid w-full text-center flex items-center justify-center min-h-full"
          />
        </div>
        {(rendering || streaming) && (
          <div className="mermaid-loading">
            <span className="mermaid-spinner" />
            <span>Rendering diagram…</span>
          </div>
        )}
      </div>
    </div>
  )

  const header = props.showHeader && (
    <div
      className={clsx(
        'mermaid-block-header flex justify-between items-center px-4 py-2.5 border-b',
        props.isDark ? 'bg-gray-800 border-gray-700/30' : 'bg-gray-50 border-gray-200',
      )}
    >
      <div className="flex items-center space-x-2 overflow-hidden">
        <span
          className="icon-slot h-4 w-4 flex-shrink-0"
          dangerouslySetInnerHTML={{ __html: languageIcon }}
        />
        <span className={clsx('text-sm font-medium font-mono truncate', props.isDark ? 'text-gray-400' : 'text-gray-600')}>
          Mermaid
        </span>
      </div>
      {props.showModeToggle && mermaidAvailable && (
        <div className={clsx('flex items-center space-x-1 rounded-md p-0.5', props.isDark ? 'bg-gray-700' : 'bg-gray-100')}>
          <button
            type="button"
            className={clsx(
              'px-2.5 py-1 text-xs rounded transition-colors',
              !showSource
                ? (props.isDark ? 'bg-gray-600 text-gray-200 shadow-sm' : 'bg-white text-gray-700 shadow-sm')
                : (props.isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'),
            )}
            onClick={() => handleSwitchMode('preview')}
            onMouseEnter={event => handleTooltip(event, t('common.preview'))}
            onFocus={event => handleTooltip(event as any, t('common.preview'))}
            onMouseLeave={() => hideTooltip()}
            onBlur={() => hideTooltip()}
          >
            <div className="flex items-center space-x-1">
              <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3">
                <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                  <path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0" />
                  <circle cx="12" cy="12" r="3" />
                </g>
              </svg>
              <span>{t('common.preview')}</span>
            </div>
          </button>
          <button
            type="button"
            className={clsx(
              'px-2.5 py-1 text-xs rounded transition-colors',
              showSource
                ? (props.isDark ? 'bg-gray-600 text-gray-200 shadow-sm' : 'bg-white text-gray-700 shadow-sm')
                : (props.isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'),
            )}
            onClick={() => handleSwitchMode('source')}
            onMouseEnter={event => handleTooltip(event, t('common.source'))}
            onFocus={event => handleTooltip(event as any, t('common.source'))}
            onMouseLeave={() => hideTooltip()}
            onBlur={() => hideTooltip()}
          >
            <div className="flex items-center space-x-1">
              <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3">
                <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m16 18l6-6l-6-6M8 6l-6 6l6 6" />
              </svg>
              <span>{t('common.source')}</span>
            </div>
          </button>
        </div>
      )}
      <div className="flex items-center space-x-1">
        {props.showCollapseButton && (
          <button
            type="button"
            className={computedButtonClass}
            aria-pressed={isCollapsed}
            onClick={() => setIsCollapsed(value => !value)}
            onMouseEnter={event => handleTooltip(event, isCollapsed ? t('common.expand') : t('common.collapse'))}
            onFocus={event => handleTooltip(event as any, isCollapsed ? t('common.expand') : t('common.collapse'))}
            onMouseLeave={() => hideTooltip()}
            onBlur={() => hideTooltip()}
          >
            <svg
              style={{ rotate: isCollapsed ? '0deg' : '90deg' }}
              xmlns="http://www.w3.org/2000/svg"
              xmlnsXlink="http://www.w3.org/1999/xlink"
              aria-hidden="true"
              role="img"
              width="1em"
              height="1em"
              viewBox="0 0 24 24"
              className="w-3 h-3"
            >
              <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 18l6-6l-6-6" />
            </svg>
          </button>
        )}
        {props.showCopyButton && (
          <button
            type="button"
            className={computedButtonClass}
            onClick={handleCopy}
            onMouseEnter={event => handleTooltip(event, copying ? t('common.copySuccess') : t('common.copy'))}
            onFocus={event => handleTooltip(event as any, copying ? t('common.copySuccess') : t('common.copy'))}
            onMouseLeave={() => hideTooltip()}
            onBlur={() => hideTooltip()}
          >
            {!copying
              ? (
                  <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3">
                    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </g>
                  </svg>
                )
              : (
                  <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3">
                    <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 6L9 17l-5-5" />
                  </svg>
                )}
          </button>
        )}
        {props.showExportButton && mermaidAvailable && (
          <button
            type="button"
            className={clsx(computedButtonClass, isFullscreenDisabled ? 'opacity-50 cursor-not-allowed' : '')}
            disabled={isFullscreenDisabled}
            onClick={handleExport}
            onMouseEnter={event => handleTooltip(event, t('common.export'))}
            onFocus={event => handleTooltip(event as any, t('common.export'))}
            onMouseLeave={() => hideTooltip()}
            onBlur={() => hideTooltip()}
          >
            <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3">
              <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                <path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="m7 10l5 5l5-5" />
              </g>
            </svg>
          </button>
        )}
        {props.showFullscreenButton && mermaidAvailable && (
          <button
            type="button"
            className={clsx(computedButtonClass, isFullscreenDisabled ? 'opacity-50 cursor-not-allowed' : '')}
            disabled={isFullscreenDisabled}
            onClick={modalOpen ? closeModal : handleOpenModal}
            onMouseEnter={event => handleTooltip(event, modalOpen ? t('common.minimize') : t('common.open'))}
            onFocus={event => handleTooltip(event as any, modalOpen ? t('common.minimize') : t('common.open'))}
            onMouseLeave={() => hideTooltip()}
            onBlur={() => hideTooltip()}
          >
            {!modalOpen
              ? (
                  <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3">
                    <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6" />
                  </svg>
                )
              : (
                  <svg xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3">
                    <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" />
                  </svg>
                )}
          </button>
        )}
      </div>
    </div>
  )

  const body = (
    <div>
      {showSource
        ? (
            <div className={clsx('p-4', props.isDark ? 'bg-gray-900 text-gray-300' : 'bg-gray-50 text-gray-700')}>
              <pre className="text-sm font-mono whitespace-pre-wrap">
                {baseFixedCode}
              </pre>
            </div>
          )
        : (
            previewContent
          )}
      {error && (
        <div className="mermaid-error">{error}</div>
      )}
    </div>
  )

  return (
    <>
      <div
        className={clsx(
          'my-4 rounded-lg border overflow-hidden shadow-sm mermaid-block',
          props.isDark ? 'border-gray-700/30' : 'border-gray-200',
          { 'is-rendering': streaming },
        )}
      >
        {header}
        {!isCollapsed && (
          <div ref={modeContainerRef}>
            {body}
          </div>
        )}
      </div>
      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="mermaid-modal-overlay"
          onClick={() => closeModal()}
        >
          <div
            className={clsx('mermaid-modal-panel', { 'is-dark': props.isDark })}
            role="dialog"
            aria-modal="true"
            onClick={event => event.stopPropagation()}
          >
            <div className="mermaid-modal-header">
              <span className="mermaid-modal-title">Mermaid Preview</span>
              <button type="button" className="mermaid-modal-close" onClick={closeModal}>Close</button>
            </div>
            <div className="mermaid-modal-body">
              <div ref={modalContentRef} className="mermaid-modal-content" />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

async function canParseWithFallback(
  code: string,
  theme: Theme,
  opts: { workerTimeout: number, parseTimeout: number, mermaid: any, signal?: AbortSignal },
) {
  try {
    const ok = await canParseOffthread(code, theme, opts.workerTimeout)
    if (ok)
      return true
  }
  catch (err) {
    if ((err as any)?.name === 'AbortError')
      throw err
  }
  if (!opts.mermaid)
    throw new Error('Mermaid not available')
  const themed = applyThemeTo(code, theme)
  const anyMermaid = opts.mermaid as any
  if (typeof anyMermaid.parse === 'function') {
    await withTimeoutSignal(() => anyMermaid.parse(themed), { timeoutMs: opts.parseTimeout, signal: opts.signal })
    return true
  }
  const id = `mermaid-parse-${Math.random().toString(36).slice(2, 9)}`
  await withTimeoutSignal(() => anyMermaid.render(id, themed), { timeoutMs: opts.parseTimeout, signal: opts.signal })
  return true
}

async function findPrefixCandidate(
  code: string,
  theme: Theme,
  opts: { workerTimeout: number, signal?: AbortSignal },
) {
  try {
    const workerPrefix = await findPrefixOffthread(code, theme, opts.workerTimeout)
    if (workerPrefix)
      return workerPrefix
  }
  catch (err) {
    if ((err as any)?.name === 'AbortError')
      throw err
  }
  return getSafePrefixCandidate(code)
}

function applyThemeTo(code: string, theme: Theme) {
  const trimmed = code.trimStart()
  if (trimmed.startsWith('%%{'))
    return code
  const themeValue = theme === 'dark' ? 'dark' : 'default'
  return `%%{init: {"theme": "${themeValue}"}}%%\n${code}`
}

function getSafePrefixCandidate(code: string) {
  const lines = code.split('\n')
  while (lines.length > 0) {
    const lastRaw = lines[lines.length - 1]
    const last = lastRaw.trimEnd()
    if (last === '') {
      lines.pop()
      continue
    }
    const looksDangling = /^[-=~>|<\s]+$/.test(last.trim())
      || /(?:--|==|~~|->|<-|-\||-\)|-x|o-|\|-|\.-)\s*$/.test(last)
      || /[-|><]$/.test(last)
      || /(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt)\s*$/i.test(last)
    if (looksDangling) {
      lines.pop()
      continue
    }
    break
  }
  return lines.join('\n')
}

async function withTimeoutSignal<T>(
  run: () => Promise<T>,
  opts: { timeoutMs?: number, signal?: AbortSignal } = {},
): Promise<T> {
  const { timeoutMs, signal } = opts
  if (signal?.aborted)
    return Promise.reject(new DOMException('Aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    function onAbort() {
      if (settled)
        return
      settled = true
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    function cleanup() {
      if (timer != null)
        clearTimeout(timer)
      if (signal)
        signal.removeEventListener('abort', onAbort)
    }

    if (signal)
      signal.addEventListener('abort', onAbort, { once: true })
    if (timeoutMs && timeoutMs > 0) {
      timer = setTimeout(() => {
        if (settled)
          return
        settled = true
        cleanup()
        reject(new Error('Operation timed out'))
      }, timeoutMs)
    }
    run()
      .then((res) => {
        if (settled)
          return
        settled = true
        cleanup()
        resolve(res)
      })
      .catch((err) => {
        if (settled)
          return
        settled = true
        cleanup()
        reject(err)
      })
  })
}

function serializeSvg(svg: SVGElement) {
  return new XMLSerializer().serializeToString(svg)
}

function exportSvg(svgElement: SVGElement, svgString: string | null) {
  const data = svgString ?? serializeSvg(svgElement)
  const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `mermaid-${Date.now()}.svg`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
