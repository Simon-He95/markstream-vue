import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSafeI18n } from '../../i18n/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../tooltip/singletonTooltip'
import { getLanguageIcon, languageMap, normalizeLanguageIdentifier } from '../../utils/languageIcon'
import { MermaidBlockNode } from '../MermaidBlockNode/MermaidBlockNode'

export interface MarkdownCodeBlockNodeProps {
  node: {
    type: 'code_block'
    language: string
    code: string
    raw: string
    diff?: boolean
    originalCode?: string
    updatedCode?: string
  }
  loading?: boolean
  stream?: boolean
  darkTheme?: string
  lightTheme?: string
  isDark?: boolean
  isShowPreview?: boolean
  enableFontSizeControl?: boolean
  minWidth?: string | number
  maxWidth?: string | number
  themes?: string[]
  showHeader?: boolean
  showCopyButton?: boolean
  showExpandButton?: boolean
  showPreviewButton?: boolean
  showFontSizeButtons?: boolean
  onCopy?: (code: string) => void
  onPreviewCode?: (payload: { type: string, content: string, title: string }) => void
}

interface ShikiRenderer {
  updateCode: (code: string, lang?: string) => void | Promise<void>
  setTheme: (theme?: string) => void | Promise<void>
  dispose: () => void
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeRendererLanguage(rawLang?: string | null) {
  const [baseToken] = String(rawLang ?? '').split(':')
  const normalized = baseToken?.trim().toLowerCase() ?? ''
  return normalized || 'plaintext'
}

export function MarkdownCodeBlockNode(rawProps: MarkdownCodeBlockNodeProps) {
  const props: Required<Pick<
    MarkdownCodeBlockNodeProps,
    | 'loading'
    | 'stream'
    | 'darkTheme'
    | 'lightTheme'
    | 'isDark'
    | 'isShowPreview'
    | 'enableFontSizeControl'
    | 'showHeader'
    | 'showCopyButton'
    | 'showExpandButton'
    | 'showPreviewButton'
    | 'showFontSizeButtons'
  >> & MarkdownCodeBlockNodeProps = {
    loading: true,
    stream: true,
    darkTheme: 'vitesse-dark',
    lightTheme: 'vitesse-light',
    isDark: false,
    isShowPreview: true,
    enableFontSizeControl: true,
    showHeader: true,
    showCopyButton: true,
    showExpandButton: true,
    showPreviewButton: true,
    showFontSizeButtons: true,
    ...rawProps,
  }

  const codeLanguage = useMemo(() => String(props.node.language ?? ''), [props.node.language])
  const normalizedLanguage = useMemo(() => normalizeRendererLanguage(codeLanguage), [codeLanguage])
  const canonicalLanguage = useMemo(() => normalizeLanguageIdentifier(codeLanguage), [codeLanguage])
  const isMermaid = canonicalLanguage === 'mermaid'
  const displayLanguage = useMemo(() => {
    const label = languageMap[canonicalLanguage] || canonicalLanguage
    if (!label)
      return 'Text'
    return label.charAt(0).toUpperCase() + label.slice(1)
  }, [canonicalLanguage])
  const languageIcon = useMemo(() => getLanguageIcon(canonicalLanguage), [canonicalLanguage])

  const { t } = useSafeI18n()

  const isPreviewable = useMemo(() => {
    if (!props.isShowPreview)
      return false
    return canonicalLanguage === 'html' || canonicalLanguage === 'svg'
  }, [canonicalLanguage, props.isShowPreview])

  const containerStyle = useMemo(() => {
    const style: Record<string, string> = {}
    const fmt = (v: string | number | undefined) => {
      if (v == null)
        return undefined
      return typeof v === 'number' ? `${v}px` : String(v)
    }
    const min = fmt(props.minWidth)
    const max = fmt(props.maxWidth)
    if (min)
      style.minWidth = min
    if (max)
      style.maxWidth = max
    return style
  }, [props.maxWidth, props.minWidth])

  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [fallbackHtml, setFallbackHtml] = useState('')
  const [rendererReady, setRendererReady] = useState(false)

  const [defaultFontSize, setDefaultFontSize] = useState<number>(14)
  const [fontSize, setFontSize] = useState<number>(defaultFontSize)

  const codeBlockContentRef = useRef<HTMLDivElement | null>(null)
  const rendererTargetRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<ShikiRenderer | null>(null)
  const createRendererRef = useRef<null | ((el: HTMLElement, opts: { theme?: string | undefined, themes?: string[] | undefined }) => ShikiRenderer)>(null)
  const importAttemptedRef = useRef(false)

  const getPreferredColorScheme = useCallback(() => {
    return props.isDark ? props.darkTheme : props.lightTheme
  }, [props.darkTheme, props.isDark, props.lightTheme])

  const renderFallback = useCallback((code: string) => {
    if (!code) {
      setFallbackHtml('')
      setRendererReady(false)
      return
    }
    setFallbackHtml(`<pre class="shiki shiki-fallback"><code>${escapeHtml(code)}</code></pre>`)
    setRendererReady(false)
  }, [])

  const clearFallback = useCallback(() => {
    setFallbackHtml('')
    setRendererReady(true)
  }, [])

  const ensureStreamMarkdownLoaded = useCallback(async () => {
    if (createRendererRef.current || importAttemptedRef.current)
      return
    importAttemptedRef.current = true
    try {
      const mod: any = await import('stream-markdown')
      createRendererRef.current = mod.createShikiStreamRenderer
    }
    catch {
      // optional peer
    }
  }, [])

  const initRenderer = useCallback(async () => {
    if (isMermaid) {
      rendererRef.current?.dispose()
      rendererRef.current = null
      setRendererReady(false)
      return
    }

    await ensureStreamMarkdownLoaded()

    if (!codeBlockContentRef.current || !rendererTargetRef.current) {
      renderFallback(props.node.code)
      return
    }

    if (!rendererRef.current && createRendererRef.current) {
      rendererRef.current = createRendererRef.current(rendererTargetRef.current, {
        theme: getPreferredColorScheme(),
        themes: props.themes,
      })
      setRendererReady(true)
    }

    if (!rendererRef.current) {
      renderFallback(props.node.code)
      return
    }

    if (props.stream === false && props.loading) {
      renderFallback(props.node.code)
      return
    }

    renderFallback(props.node.code)
    try {
      await rendererRef.current.updateCode(props.node.code, normalizedLanguage)
      clearFallback()
    }
    catch {
      // keep fallback
    }
  }, [clearFallback, ensureStreamMarkdownLoaded, getPreferredColorScheme, isMermaid, normalizedLanguage, props.loading, props.node.code, props.stream, props.themes, renderFallback])

  useEffect(() => {
    void initRenderer()
    return () => {
      rendererRef.current?.dispose()
      rendererRef.current = null
    }
  }, [initRenderer])

  useEffect(() => {
    if (!rendererRef.current)
      return
    void rendererRef.current.setTheme(getPreferredColorScheme())
  }, [getPreferredColorScheme])

  useEffect(() => {
    if (!rendererRef.current)
      return
    if (props.stream === false && props.loading)
      return
    renderFallback(props.node.code)
    Promise.resolve(rendererRef.current.updateCode(props.node.code, normalizedLanguage))
      .then(() => clearFallback())
      .catch(() => {})
  }, [clearFallback, normalizedLanguage, props.loading, props.node.code, props.stream, renderFallback])

  const onBtnHover = useCallback((event: React.MouseEvent, text: string) => {
    const btn = event.currentTarget as unknown as HTMLElement
    showTooltipForAnchor(btn, text, 'top', false, { x: event.clientX, y: event.clientY }, props.isDark)
  }, [props.isDark])

  const onBtnLeave = useCallback(() => hideTooltip(), [])

  const copy = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function')
        await navigator.clipboard.writeText(props.node.code)
      setCopied(true)
      props.onCopy?.(props.node.code)
      setTimeout(() => setCopied(false), 1000)
    }
    catch {}
  }, [props])

  const previewCode = useCallback(() => {
    if (!isPreviewable)
      return
    const lowerLang = normalizedLanguage
    const artifactType = lowerLang === 'html' ? 'text/html' : 'image/svg+xml'
    const artifactTitle = lowerLang === 'html' ? 'HTML Preview' : 'SVG Preview'
    props.onPreviewCode?.({
      type: artifactType,
      content: props.node.code,
      title: artifactTitle,
    })
  }, [isPreviewable, normalizedLanguage, props])

  const contentStyle = useMemo(() => ({ fontSize: `${fontSize}px` }), [fontSize])

  const decreaseCodeFont = () => setFontSize(s => Math.max(10, s - 1))
  const increaseCodeFont = () => setFontSize(s => Math.min(36, s + 1))
  const resetCodeFont = () => setFontSize(defaultFontSize)

  useEffect(() => {
    const initial = 14
    setDefaultFontSize(initial)
    setFontSize(initial)
  }, [])

  if (isMermaid) {
    return (
      <MermaidBlockNode
        node={props.node as any}
        isDark={props.isDark}
        loading={props.loading}
      />
    )
  }

  return (
    <div
      className={[
        'code-block-container my-4 rounded-lg border overflow-hidden shadow-sm',
        props.isDark ? 'border-gray-700/30 bg-gray-900 is-dark' : 'border-gray-200 bg-white',
      ].join(' ')}
      style={containerStyle}
    >
      {props.showHeader && (
        <div
          className="code-block-header flex justify-between items-center px-4 py-2.5 border-b border-gray-400/5"
          style={{ color: 'var(--vscode-editor-foreground)', backgroundColor: 'var(--vscode-editor-background)' }}
        >
          <div className="flex items-center space-x-2">
            <span
              className="icon-slot h-4 w-4 flex-shrink-0"
              // language icons are trusted internal assets or user-supplied via resolver
              dangerouslySetInnerHTML={{ __html: languageIcon }}
            />
            <span className="text-sm font-medium font-mono">{displayLanguage}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              className="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
              aria-pressed={isCollapsed}
              onClick={() => setIsCollapsed(v => !v)}
              onMouseEnter={e => onBtnHover(e, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))}
              onFocus={e => onBtnHover(e as any, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))}
              onMouseLeave={onBtnLeave}
              onBlur={onBtnLeave}
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

            {props.showFontSizeButtons && props.enableFontSizeControl && (
              <>
                <button
                  type="button"
                  className="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
                  disabled={fontSize <= 10}
                  onClick={decreaseCodeFont}
                  onMouseEnter={e => onBtnHover(e, t('common.decrease') || 'Decrease')}
                  onFocus={e => onBtnHover(e as any, t('common.decrease') || 'Decrease')}
                  onMouseLeave={onBtnLeave}
                  onBlur={onBtnLeave}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    xmlnsXlink="http://www.w3.org/1999/xlink"
                    aria-hidden="true"
                    role="img"
                    width="1em"
                    height="1em"
                    viewBox="0 0 24 24"
                    className="w-3 h-3"
                  >
                    <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
                  disabled={fontSize === defaultFontSize}
                  onClick={resetCodeFont}
                  onMouseEnter={e => onBtnHover(e, t('common.reset') || 'Reset')}
                  onFocus={e => onBtnHover(e as any, t('common.reset') || 'Reset')}
                  onMouseLeave={onBtnLeave}
                  onBlur={onBtnLeave}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    xmlnsXlink="http://www.w3.org/1999/xlink"
                    aria-hidden="true"
                    role="img"
                    width="1em"
                    height="1em"
                    viewBox="0 0 24 24"
                    className="w-3 h-3"
                  >
                    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                      <path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </g>
                  </svg>
                </button>
                <button
                  type="button"
                  className="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
                  disabled={fontSize >= 36}
                  onClick={increaseCodeFont}
                  onMouseEnter={e => onBtnHover(e, t('common.increase') || 'Increase')}
                  onFocus={e => onBtnHover(e as any, t('common.increase') || 'Increase')}
                  onMouseLeave={onBtnLeave}
                  onBlur={onBtnLeave}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    xmlnsXlink="http://www.w3.org/1999/xlink"
                    aria-hidden="true"
                    role="img"
                    width="1em"
                    height="1em"
                    viewBox="0 0 24 24"
                    className="w-3 h-3"
                  >
                    <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14m-7-7v14" />
                  </svg>
                </button>
              </>
            )}

            {props.showCopyButton && (
              <button
                type="button"
                className="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
                aria-label={copied ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')}
                onClick={copy}
                onMouseEnter={e => onBtnHover(e, copied ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'))}
                onFocus={e => onBtnHover(e as any, copied ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'))}
                onMouseLeave={onBtnLeave}
                onBlur={onBtnLeave}
              >
                {!copied
                  ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        xmlnsXlink="http://www.w3.org/1999/xlink"
                        aria-hidden="true"
                        role="img"
                        width="1em"
                        height="1em"
                        viewBox="0 0 24 24"
                        className="w-3 h-3"
                      >
                        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                        </g>
                      </svg>
                    )
                  : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        xmlnsXlink="http://www.w3.org/1999/xlink"
                        aria-hidden="true"
                        role="img"
                        width="1em"
                        height="1em"
                        viewBox="0 0 24 24"
                        className="w-3 h-3"
                      >
                        <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
              </button>
            )}

            {props.showExpandButton && (
              <button
                type="button"
                className="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
                aria-pressed={isExpanded}
                onClick={() => setIsExpanded(v => !v)}
                onMouseEnter={e => onBtnHover(e, isExpanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))}
                onFocus={e => onBtnHover(e as any, isExpanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))}
                onMouseLeave={onBtnLeave}
                onBlur={onBtnLeave}
              >
                {isExpanded
                  ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        xmlnsXlink="http://www.w3.org/1999/xlink"
                        aria-hidden="true"
                        role="img"
                        width="1em"
                        height="1em"
                        viewBox="0 0 24 24"
                        className="w-3 h-3"
                      >
                        <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6" />
                      </svg>
                    )
                  : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        xmlnsXlink="http://www.w3.org/1999/xlink"
                        aria-hidden="true"
                        role="img"
                        width="1em"
                        height="1em"
                        viewBox="0 0 24 24"
                        className="w-3 h-3"
                      >
                        <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" />
                      </svg>
                    )}
              </button>
            )}

            {isPreviewable && props.showPreviewButton && (
              <button
                type="button"
                className="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
                aria-label={t('common.preview') || 'Preview'}
                onClick={previewCode}
                onMouseEnter={e => onBtnHover(e, t('common.preview') || 'Preview')}
                onFocus={e => onBtnHover(e as any, t('common.preview') || 'Preview')}
                onMouseLeave={onBtnLeave}
                onBlur={onBtnLeave}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  xmlnsXlink="http://www.w3.org/1999/xlink"
                  aria-hidden="true"
                  role="img"
                  width="1em"
                  height="1em"
                  viewBox="0 0 24 24"
                  className="w-3 h-3"
                >
                  <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
                    <path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0" />
                    <circle cx="12" cy="12" r="3" />
                  </g>
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {!isCollapsed && (props.stream ? true : !props.loading) && (
        <div
          ref={codeBlockContentRef}
          className="code-block-content"
          style={{
            ...contentStyle,
            maxHeight: isExpanded ? 'none' : '500px',
            overflow: isExpanded ? 'visible' : 'auto',
          }}
        >
          <div ref={rendererTargetRef} className="code-block-render" />
          {!rendererReady && fallbackHtml && (
            <div className="code-fallback-plain" dangerouslySetInnerHTML={{ __html: fallbackHtml }} />
          )}
        </div>
      )}

      {!props.stream && props.loading && (
        <div className="code-loading-placeholder">
          <div className="loading-skeleton">
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
          </div>
        </div>
      )}
      <span className="sr-only" aria-live="polite" role="status">{copied ? (t('common.copied') || 'Copied') : ''}</span>
    </div>
  )
}

export default MarkdownCodeBlockNode
