import type { VisibilityHandle } from '../../context/viewportPriority.tsrx'
import type { D2BlockNodeProps } from '../../types/component-props'
import clsx from 'clsx'
import * as Octane from 'octane'
import { useCallback, useEffect, useMemo, useRef, useState } from 'octane'
import { useViewportPriority } from '../../context/viewportPriority.tsrx'
import { useSafeI18n } from '../../i18n/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../tooltip/singletonTooltip'
import { createD2RenderSalt } from '../../utils/d2RenderSalt'
import { getD2 } from './d2'

const DEFAULTS = {
  loading: true,
  progressiveRender: true,
  progressiveIntervalMs: 700,
  showHeader: true,
  showModeToggle: true,
  showCopyButton: true,
  showExportButton: true,
  showCollapseButton: true,
}

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

const DISALLOWED_STYLE_PATTERNS = [/javascript:/i, /expression\s*\(/i, /url\s*\(\s*javascript:/i, /@import/i]
const SAFE_URL_PROTOCOLS = /^(?:https?:|mailto:|tel:|#|\/|data:image\/(?:png|gif|jpe?g|webp);)/i

function neutralizeScriptProtocols(raw: string) {
  return raw
    .replace(/["']\s*javascript:/gi, '#')
    .replace(/\bjavascript:/gi, '#')
    .replace(/["']\s*vbscript:/gi, '#')
    .replace(/\bvbscript:/gi, '#')
    .replace(/\bdata:text\/html/gi, '#')
}

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

function toSafeSvgMarkup(svg: string | null | undefined) {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined')
    return ''
  if (!svg)
    return ''
  const neutralized = neutralizeScriptProtocols(svg)
  const parsed = new DOMParser().parseFromString(neutralized, 'image/svg+xml')
  const svgEl = parsed.documentElement
  if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg')
    return ''
  const svgElement = svgEl as unknown as SVGElement
  scrubSvgElement(svgElement)
  svgElement.classList.add('markstream-d2-root-svg')
  return svgElement.outerHTML
}

function extractSvg(renderResult: any) {
  if (!renderResult)
    return ''
  if (typeof renderResult === 'string')
    return renderResult
  if (typeof renderResult.svg === 'string')
    return renderResult.svg
  if (typeof renderResult.data === 'string')
    return renderResult.data
  return ''
}

function shouldSkipEventTarget(target: EventTarget | null) {
  const btn = target as HTMLButtonElement | null
  return !btn || btn.disabled
}

export function D2BlockNode(rawProps: D2BlockNodeProps) {
  const props = { ...DEFAULTS, ...rawProps }
  const { t } = useSafeI18n()
  const [copying, setCopying] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const [d2Available, setD2Available] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [svgMarkup, setSvgMarkup] = useState('')
  const [bodyMinHeight, setBodyMinHeight] = useState<number | null>(null)
  const [isRendering, setIsRendering] = useState(false)
  const [viewportReady, setViewportReady] = useState(() => typeof window === 'undefined')

  const renderTokenRef = useRef(0)
  const d2InstanceRef = useRef<any | null>(null)
  const scheduledRef = useRef(false)
  const unmountedRef = useRef(false)
  const lastRenderAtRef = useRef(0)
  const throttleTimerRef = useRef<number | null>(null)
  const pendingRenderRef = useRef(false)
  const viewportTargetRef = useRef<HTMLDivElement | null>(null)
  const viewportHandleRef = useRef<VisibilityHandle | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const bodyObserverRef = useRef<ResizeObserver | null>(null)
  const isRenderingRef = useRef(false)
  const renderDiagramRef = useRef<() => void>(() => {})
  const registerViewport = useViewportPriority()

  const baseCode = props.node?.code ?? ''
  const showSourceFallback = showSource || !d2Available || !svgMarkup
  const hasPreview = !!svgMarkup

  const renderStyle = useMemo(() => {
    if (!props.maxHeight)
      return undefined
    const max = typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : String(props.maxHeight)
    // Expose the same cap to the stylesheet so the root svg can scale down
    // proportionally to the container's max-height (see .d2-svg svg rule).
    return { maxHeight: max, ['--ms-d2-render-max-height' as any]: max }
  }, [props.maxHeight])

  const bodyStyle = useMemo(() => {
    if (!showSourceFallback || !bodyMinHeight)
      return undefined
    return { minHeight: `${bodyMinHeight}px` }
  }, [bodyMinHeight, showSourceFallback])

  useEffect(() => {
    isRenderingRef.current = isRendering
  }, [isRendering])

  useEffect(() => {
    const el = viewportTargetRef.current
    if (!el)
      return
    const handle = registerViewport(el, { rootMargin: '160px' })
    viewportHandleRef.current = handle
    if (handle.isVisible())
      setViewportReady(true)
    handle.whenVisible.then(() => setViewportReady(true))
    return () => {
      handle.destroy()
      viewportHandleRef.current = null
    }
  }, [registerViewport])

  const updateBodyMinHeight = useCallback(() => {
    const el = bodyRef.current
    if (!el)
      return
    const height = el.getBoundingClientRect().height
    if (height > 0) {
      setBodyMinHeight(prev => (prev !== height ? height : prev))
    }
  }, [])

  const scheduleRender = useCallback((force = false) => {
    if (scheduledRef.current || typeof window === 'undefined')
      return
    if (unmountedRef.current)
      return
    if (!viewportReady)
      return
    if (isRenderingRef.current) {
      pendingRenderRef.current = true
      return
    }
    const interval = Math.max(120, Number(props.progressiveIntervalMs) || 0)
    const now = Date.now()
    const elapsed = now - lastRenderAtRef.current
    if (!force && elapsed < interval) {
      pendingRenderRef.current = true
      if (throttleTimerRef.current == null) {
        throttleTimerRef.current = window.setTimeout(() => {
          throttleTimerRef.current = null
          if (pendingRenderRef.current) {
            pendingRenderRef.current = false
            scheduleRender(true)
          }
        }, Math.max(0, interval - elapsed))
      }
      return
    }
    scheduledRef.current = true
    const runner = () => {
      scheduledRef.current = false
      lastRenderAtRef.current = Date.now()
      renderDiagramRef.current()
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
      window.requestAnimationFrame(runner)
    else
      setTimeout(runner, 0)
  }, [props.progressiveIntervalMs, viewportReady])

  const ensureD2Instance = useCallback(async () => {
    if (d2InstanceRef.current)
      return d2InstanceRef.current
    const D2Ctor = await getD2()
    if (!D2Ctor)
      return null
    if (typeof D2Ctor === 'function') {
      const inst = new D2Ctor()
      if (inst && typeof inst.compile === 'function')
        d2InstanceRef.current = inst
      else if (typeof (D2Ctor as any).compile === 'function')
        d2InstanceRef.current = D2Ctor
      return d2InstanceRef.current
    }
    if (D2Ctor?.D2 && typeof D2Ctor.D2 === 'function') {
      d2InstanceRef.current = new D2Ctor.D2()
      return d2InstanceRef.current
    }
    if (typeof D2Ctor.compile === 'function')
      d2InstanceRef.current = D2Ctor
    return d2InstanceRef.current
  }, [])

  const renderDiagram = useCallback(async () => {
    if (typeof window === 'undefined' || unmountedRef.current)
      return
    if (!viewportReady)
      return
    if (props.loading && !props.progressiveRender)
      return
    if (!baseCode) {
      setSvgMarkup('')
      setRenderError(null)
      return
    }

    const token = ++renderTokenRef.current
    setIsRendering(true)
    setRenderError(null)

    try {
      const instance = await ensureD2Instance()
      if (!instance) {
        setD2Available(false)
        setShowSource(true)
        setSvgMarkup('')
        setRenderError('D2 is not available.')
        return
      }
      if (typeof instance.compile !== 'function' || typeof instance.render !== 'function')
        throw new Error('D2 instance is missing compile/render methods.')

      setD2Available(true)

      const compileResult = await instance.compile(baseCode)
      if (token !== renderTokenRef.current)
        return

      const diagram = compileResult?.diagram ?? compileResult
      const baseRenderOptions = compileResult?.renderOptions ?? compileResult?.options ?? {}
      const resolvedThemeId = props.themeId ?? baseRenderOptions.themeID
      const resolvedDarkThemeId = props.darkThemeId ?? baseRenderOptions.darkThemeID
      const renderOptions: Record<string, any> = { ...baseRenderOptions }
      renderOptions.themeID = props.isDark && resolvedDarkThemeId != null
        ? resolvedDarkThemeId
        : resolvedThemeId
      renderOptions.darkThemeID = null
      renderOptions.darkThemeOverrides = null
      if (props.isDark) {
        const baseOverrides = baseRenderOptions.themeOverrides && typeof baseRenderOptions.themeOverrides === 'object'
          ? baseRenderOptions.themeOverrides
          : null
        renderOptions.themeOverrides = {
          ...DARK_THEME_OVERRIDES,
          ...(baseOverrides || {}),
        }
      }

      renderOptions.salt = renderOptions.salt ?? createD2RenderSalt()
      const renderResult = await instance.render(diagram, renderOptions)
      if (token !== renderTokenRef.current)
        return

      const svg = extractSvg(renderResult)
      if (!svg)
        throw new Error('D2 render returned empty output.')
      const safe = toSafeSvgMarkup(svg)
      setSvgMarkup(safe || '')
      if (props.loading)
        setShowSource(false)
      setRenderError(null)
    }
    catch (err: any) {
      if (token !== renderTokenRef.current)
        return
      const message = err?.message ? String(err.message) : 'D2 render failed.'
      if (!props.loading)
        setRenderError(message)
      if (message.includes('@terrastruct/d2')) {
        setD2Available(false)
        setShowSource(true)
      }
    }
    finally {
      if (token === renderTokenRef.current) {
        setIsRendering(false)
        if (pendingRenderRef.current) {
          pendingRenderRef.current = false
          scheduleRender()
        }
      }
    }
  }, [baseCode, ensureD2Instance, props.darkThemeId, props.isDark, props.loading, props.progressiveRender, props.themeId, scheduleRender, viewportReady])

  useEffect(() => {
    renderDiagramRef.current = renderDiagram
  }, [renderDiagram])

  const handleCopy = useCallback(async () => {
    try {
      if (navigator?.clipboard?.writeText)
        await navigator.clipboard.writeText(baseCode)
      setCopying(true)
      setTimeout(() => setCopying(false), 1000)
    }
    catch {}
  }, [baseCode])

  const handleExport = useCallback(() => {
    if (!svgMarkup)
      return
    try {
      const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `d2-diagram-${Date.now()}.svg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
    catch (error) {
      console.error('Failed to export SVG:', error)
    }
  }, [svgMarkup])

  const onBtnHover = useCallback((e: MouseEvent, text: string) => {
    if (shouldSkipEventTarget(e.currentTarget))
      return
    showTooltipForAnchor(e.currentTarget as HTMLElement, text, 'top', false, { x: e.clientX, y: e.clientY }, props.isDark)
  }, [props.isDark])

  const onBtnLeave = useCallback(() => {
    hideTooltip()
  }, [])

  useEffect(() => {
    scheduleRender()
  }, [baseCode, props.loading, props.isDark, scheduleRender])

  useEffect(() => {
    if (props.loading)
      return
    scheduleRender(true)
  }, [props.loading, scheduleRender])

  useEffect(() => {
    const raf = requestAnimationFrame(() => updateBodyMinHeight())
    return () => cancelAnimationFrame(raf)
  }, [showSourceFallback, svgMarkup, baseCode, updateBodyMinHeight])

  useEffect(() => {
    unmountedRef.current = false
    scheduleRender()
    const raf = requestAnimationFrame(() => updateBodyMinHeight())
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        updateBodyMinHeight()
      })
      bodyObserverRef.current = observer
      if (bodyRef.current)
        observer.observe(bodyRef.current)
    }
    return () => {
      unmountedRef.current = true
      if (throttleTimerRef.current != null) {
        clearTimeout(throttleTimerRef.current)
        throttleTimerRef.current = null
      }
      bodyObserverRef.current?.disconnect()
      bodyObserverRef.current = null
      cancelAnimationFrame(raf)
    }
  }, [scheduleRender, updateBodyMinHeight])

  return (
    <div
      ref={viewportTargetRef}
      className={clsx(
        'd2-block my-4 rounded-lg border overflow-hidden shadow-sm',
        props.isDark ? 'border-gray-700/30 bg-gray-900 text-gray-100' : 'border-gray-200 bg-white text-gray-900',
      )}
    >
      {props.showHeader && (
        <div
          className="d2-block-header flex justify-between items-center px-4 py-2.5 border-b border-gray-400/5"
          style={{ color: 'var(--vscode-editor-foreground)', backgroundColor: 'var(--vscode-editor-background)' }}
        >
          <div className="flex items-center gap-x-2">
            <span className="text-sm font-medium font-mono">D2</span>
          </div>
          <div className="flex items-center gap-x-2">
            {props.showModeToggle && (
              <div className={clsx('flex items-center gap-x-1 rounded-md p-0.5', props.isDark ? 'bg-gray-700' : 'bg-gray-100')}>
                <button
                  type="button"
                  className={clsx('mode-btn px-2 py-1 text-xs rounded', !showSource && 'is-active')}
                  onClick={() => setShowSource(false)}
                  onMouseEnter={e => onBtnHover(e, t('common.preview') || 'Preview')}
                  onFocus={e => onBtnHover(e as any, t('common.preview') || 'Preview')}
                  onMouseLeave={onBtnLeave}
                  onBlur={onBtnLeave}
                >
                  {t('common.preview') || 'Preview'}
                </button>
                <button
                  type="button"
                  className={clsx('mode-btn px-2 py-1 text-xs rounded', showSource && 'is-active')}
                  onClick={() => setShowSource(true)}
                  onMouseEnter={e => onBtnHover(e, t('common.source') || 'Source')}
                  onFocus={e => onBtnHover(e as any, t('common.source') || 'Source')}
                  onMouseLeave={onBtnLeave}
                  onBlur={onBtnLeave}
                >
                  {t('common.source') || 'Source'}
                </button>
              </div>
            )}

            {props.showCopyButton && (
              <button
                type="button"
                className="d2-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
                aria-label={copying ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')}
                onClick={handleCopy}
                onMouseEnter={e => onBtnHover(e, copying ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'))}
                onFocus={e => onBtnHover(e as any, copying ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'))}
                onMouseLeave={onBtnLeave}
                onBlur={onBtnLeave}
              >
                {!copying
                  ? (
                      <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3">
                        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                        </g>
                      </svg>
                    )
                  : (
                      <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 6L9 17l-5-5" /></svg>
                    )}
              </button>
            )}

            {props.showExportButton && svgMarkup && (
              <button
                type="button"
                className="d2-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
                aria-label={t('common.export') || 'Export'}
                onClick={handleExport}
                onMouseEnter={e => onBtnHover(e, t('common.export') || 'Export')}
                onFocus={e => onBtnHover(e as any, t('common.export') || 'Export')}
                onMouseLeave={onBtnLeave}
                onBlur={onBtnLeave}
              >
                <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v12m0-12l-4 4m4-4l4 4M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
              </button>
            )}

            {props.showCollapseButton && (
              <button
                type="button"
                className="d2-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
                aria-pressed={isCollapsed}
                onClick={() => setIsCollapsed(prev => !prev)}
                onMouseEnter={e => onBtnHover(e, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))}
                onFocus={e => onBtnHover(e as any, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))}
                onMouseLeave={onBtnLeave}
                onBlur={onBtnLeave}
              >
                <svg style={{ transform: `rotate(${isCollapsed ? 0 : 90}deg)` }} xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" className="w-3 h-3"><path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 18l6-6l-6-6" /></svg>
              </button>
            )}
          </div>
        </div>
      )}

      {!isCollapsed && (
        <div ref={bodyRef} className="d2-block-body" style={bodyStyle}>
          {props.loading && !hasPreview
            ? (
                <div className="d2-source px-4 py-4">
                  <pre className="d2-code"><code>{baseCode}</code></pre>
                  {renderError && <p className="d2-error mt-2 text-xs">{renderError}</p>}
                </div>
              )
            : (
                <>
                  {showSourceFallback
                    ? (
                        <div className="d2-source px-4 py-4">
                          <pre className="d2-code"><code>{baseCode}</code></pre>
                          {renderError && <p className="d2-error mt-2 text-xs">{renderError}</p>}
                        </div>
                      )
                    : (
                        <div className="d2-render" style={renderStyle}>
                          <div className="d2-svg" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
                          {renderError && <p className="d2-error px-4 pb-3 text-xs">{renderError}</p>}
                        </div>
                      )}
                </>
              )}
        </div>
      )}
    </div>
  )
}
