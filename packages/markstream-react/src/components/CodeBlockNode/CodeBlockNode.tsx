import type { VisibilityHandle } from '../../context/viewportPriority'
import type { CodeBlockNodeProps } from '../../types/component-props'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useViewportPriority } from '../../context/viewportPriority'
import { useSafeI18n } from '../../i18n/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../tooltip/singletonTooltip'
import { getLanguageIcon, languageMap, normalizeLanguageIdentifier, resolveMonacoLanguageId } from '../../utils/languageIcon'
import { HtmlPreviewFrame } from './HtmlPreviewFrame'
import { getUseMonaco } from './monaco'
import { PreCodeNode } from './PreCodeNode'

const STREAM_MONACO_DEFAULT_LANGUAGES: string[] = [
  'jsx',
  'tsx',
  'vue',
  'csharp',
  'python',
  'java',
  'c',
  'cpp',
  'rust',
  'go',
  'powershell',
  'sql',
  'json',
  'html',
  'javascript',
  'typescript',
  'css',
  'markdown',
  'xml',
  'yaml',
  'toml',
  'dockerfile',
  'kotlin',
  'objective-c',
  'objective-cpp',
  'php',
  'ruby',
  'scala',
  'svelte',
  'swift',
  'erlang',
  'angular-html',
  'angular-ts',
  'dart',
  'lua',
  'mermaid',
  'cmake',
  'nginx',
]

export interface CodeBlockPreviewPayload {
  node: CodeBlockNodeProps['node']
  artifactType: 'text/html' | 'image/svg+xml'
  artifactTitle: string
  id: string
}

export interface CodeBlockNodeReactEvents {
  onCopy?: (code: string) => void
  onPreviewCode?: (payload: CodeBlockPreviewPayload) => void
}

type ResolvedProps = Required<Pick<
  CodeBlockNodeProps,
  | 'isShowPreview'
  | 'loading'
  | 'stream'
  | 'enableFontSizeControl'
  | 'showHeader'
  | 'showCopyButton'
  | 'showExpandButton'
  | 'showPreviewButton'
  | 'showFontSizeButtons'
>> & CodeBlockNodeProps

const DEFAULTS: Required<Pick<
  CodeBlockNodeProps,
  | 'isShowPreview'
  | 'loading'
  | 'stream'
  | 'enableFontSizeControl'
  | 'showHeader'
  | 'showCopyButton'
  | 'showExpandButton'
  | 'showPreviewButton'
  | 'showFontSizeButtons'
>> = {
  isShowPreview: true,
  loading: true,
  stream: true,
  enableFontSizeControl: true,
  showHeader: true,
  showCopyButton: true,
  showExpandButton: true,
  showPreviewButton: true,
  showFontSizeButtons: true,
}

export function CodeBlockNode(rawProps: CodeBlockNodeProps & CodeBlockNodeReactEvents) {
  const props = { ...DEFAULTS, ...rawProps } as ResolvedProps & CodeBlockNodeReactEvents
  const {
    node,
    isDark,
    loading,
    stream,
    isShowPreview,
    enableFontSizeControl,
    darkTheme,
    lightTheme,
    monacoOptions,
    themes,
    minWidth,
    maxWidth,
    showHeader,
    showCopyButton,
    showExpandButton,
    showPreviewButton,
    showFontSizeButtons,
  } = props

  const editorHostRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const helpersRef = useRef<any>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const createEditorPromiseRef = useRef<Promise<void> | null>(null)
  const editorKindRef = useRef<'diff' | 'single' | null>(null)
  const detectLanguageRef = useRef<((code: string) => string) | null>(null)
  const viewportHandleRef = useRef<VisibilityHandle | null>(null)
  const registerViewport = useViewportPriority()
  const monacoOptionsRef = useRef(monacoOptions)
  const initThemesRef = useRef(themes)
  const initMonacoOptionsRef = useRef(monacoOptions)

  const [useFallback, setUseFallback] = useState(false)
  const [viewportReady, setViewportReady] = useState(() => typeof window === 'undefined')
  const [monacoReady, setMonacoReady] = useState(false)
  const [editorCreated, setEditorCreated] = useState(false)
  const [editorReady, setEditorReady] = useState(false)
  const [detectedLanguage, setDetectedLanguage] = useState(() => node.language || 'plaintext')
  const [codeLanguage, setCodeLanguage] = useState(() => normalizeLanguageIdentifier(node.language))
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [inlinePreviewOpen, setInlinePreviewOpen] = useState(false)

  const { t } = useSafeI18n()

  const [defaultFontSize, setDefaultFontSize] = useState<number>(() => {
    const initial = Number((monacoOptions as any)?.fontSize)
    return Number.isFinite(initial) && initial > 0 ? initial : 14
  })
  const [fontSize, setFontSize] = useState(defaultFontSize)

  const getMaxHeightValue = useCallback((): number => {
    const raw = (monacoOptionsRef.current as any)?.MAX_HEIGHT ?? 500
    if (typeof raw === 'number' && Number.isFinite(raw))
      return Math.max(80, raw)
    const m = String(raw).match(/^(\d+(?:\.\d+)?)/)
    const parsed = m ? Number.parseFloat(m[1]) : 500
    return Number.isFinite(parsed) ? Math.max(80, parsed) : 500
  }, [])

  const applyEditorHeight = useCallback((nextExpanded: boolean) => {
    if (useFallback)
      return
    const host = editorHostRef.current
    const helpers = helpersRef.current
    if (!host || !helpers)
      return
    const view = editorKindRef.current === 'diff'
      ? helpers.getDiffEditorView?.()
      : helpers.getEditorView?.()
    if (!view)
      return

    const maxHeight = getMaxHeightValue()
    try {
      view.updateOptions?.({ automaticLayout: nextExpanded })
    }
    catch {}

    if (nextExpanded) {
      host.style.maxHeight = 'none'
      host.style.overflow = 'visible'
    }
    else {
      host.style.maxHeight = `${Math.ceil(maxHeight)}px`
      host.style.overflow = 'auto'
    }

    try {
      const maybeGetContentHeight = () => {
        if (typeof view.getContentHeight === 'function')
          return view.getContentHeight()
        if (editorKindRef.current === 'diff' && typeof view.getModifiedEditor === 'function') {
          const modified = view.getModifiedEditor()
          if (modified && typeof modified.getContentHeight === 'function')
            return modified.getContentHeight()
        }
        return undefined
      }
      const contentHeight = Number(maybeGetContentHeight())
      if (Number.isFinite(contentHeight) && contentHeight > 0) {
        const height = nextExpanded ? contentHeight : Math.min(contentHeight, maxHeight)
        host.style.height = `${Math.ceil(Math.max(120, height))}px`
        view.layout?.()
      }
    }
    catch {}
  }, [getMaxHeightValue, useFallback])

  useEffect(() => {
    monacoOptionsRef.current = monacoOptions
  }, [monacoOptions])

  useEffect(() => {
    setCodeLanguage(normalizeLanguageIdentifier(node.language))
  }, [node.language])

  const latestNodeRef = useRef(node)
  latestNodeRef.current = node

  const syncEditorCssVars = useCallback(() => {
    const editorEl = editorHostRef.current
    const rootEl = containerRef.current
    if (!editorEl || !rootEl)
      return
    const src = (editorEl.querySelector('.monaco-editor') as HTMLElement | null) ?? editorEl
    try {
      const styles = typeof window !== 'undefined' && window.getComputedStyle
        ? window.getComputedStyle(src)
        : null
      const fg = String(styles?.getPropertyValue('--vscode-editor-foreground') ?? '').trim()
      const bg = String(styles?.getPropertyValue('--vscode-editor-background') ?? '').trim()
      const sel = String(styles?.getPropertyValue('--vscode-editor-selectionBackground') ?? '').trim()
      if (fg)
        rootEl.style.setProperty('--vscode-editor-foreground', fg)
      if (bg)
        rootEl.style.setProperty('--vscode-editor-background', bg)
      if (sel)
        rootEl.style.setProperty('--vscode-editor-selectionBackground', sel)
    }
    catch {}
  }, [])

  useEffect(() => {
    return () => {
      cleanupRef.current?.()
      cleanupRef.current = null
      createEditorPromiseRef.current = null
      editorKindRef.current = null
      detectLanguageRef.current = null
      viewportHandleRef.current?.destroy?.()
      viewportHandleRef.current = null
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    if (viewportReady)
      return
    const el = containerRef.current
    if (!el)
      return
    viewportHandleRef.current?.destroy?.()
    const handle = registerViewport(el, { rootMargin: '400px' })
    viewportHandleRef.current = handle
    if (handle.isVisible())
      setViewportReady(true)
    handle.whenVisible.then(() => setViewportReady(true))
    return () => {
      handle.destroy()
      if (viewportHandleRef.current === handle)
        viewportHandleRef.current = null
    }
  }, [registerViewport, viewportReady])

  useEffect(() => {
    let mounted = true
    if (typeof window === 'undefined') {
      return () => {
        mounted = false
      }
    }
    void (async () => {
      try {
        const mod = await getUseMonaco()
        if (!mounted)
          return
        if (!mod) {
          setUseFallback(true)
          return
        }
        const useMonaco = (mod as any).useMonaco
        const detectLanguage = (mod as any).detectLanguage
        if (typeof detectLanguage === 'function')
          detectLanguageRef.current = detectLanguage
        if (typeof useMonaco !== 'function') {
          setUseFallback(true)
          return
        }
        const themeToUse = isDark ? darkTheme : lightTheme
        const rawOptions = { ...(initMonacoOptionsRef.current || {}) } as any
        const normalizedInitialLanguage = normalizeLanguageIdentifier((node as any)?.language)
        if (normalizedInitialLanguage === 'shell') {
          const userLanguages = Array.isArray(rawOptions.languages) ? rawOptions.languages.map(String) : null
          const base = userLanguages ?? STREAM_MONACO_DEFAULT_LANGUAGES
          rawOptions.languages = Array.from(new Set([...base, 'shell']))
        }
        const helpers = useMonaco({
          wordWrap: 'on',
          wrappingIndent: 'same',
          themes: initThemesRef.current,
          theme: themeToUse,
          ...rawOptions,
          onThemeChange() {
            syncEditorCssVars()
          },
        })
        helpersRef.current = helpers
        cleanupRef.current = typeof helpers.safeClean === 'function'
          ? () => helpers.safeClean()
          : (typeof helpers.cleanupEditor === 'function' ? () => helpers.cleanupEditor() : null)
        setMonacoReady(true)
      }
      catch {
        if (mounted)
          setUseFallback(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Vue parity: if language is not provided, detect it from streaming code.
  useEffect(() => {
    if (node.language)
      return
    if (codeLanguage)
      return
    if (!detectLanguageRef.current)
      return
    try {
      const detected = detectLanguageRef.current(String(node.code ?? ''))
      if (detected)
        setDetectedLanguage(detected)
    }
    catch {}
  }, [codeLanguage, node.code, node.language])

  const rawLanguage = useMemo(() => {
    return String(node.language || codeLanguage || detectedLanguage || 'plaintext')
  }, [codeLanguage, detectedLanguage, node.language])
  const canonicalLanguage = useMemo(() => normalizeLanguageIdentifier(rawLanguage), [rawLanguage])
  const monacoLanguage = useMemo(() => resolveMonacoLanguageId(canonicalLanguage), [canonicalLanguage])
  const languageIcon = useMemo(() => getLanguageIcon(canonicalLanguage), [canonicalLanguage])
  const isPreviewable = useMemo(() => {
    if (!isShowPreview)
      return false
    return canonicalLanguage === 'html' || canonicalLanguage === 'svg'
  }, [canonicalLanguage, isShowPreview])

  const displayLanguage = useMemo(() => {
    const lang = canonicalLanguage
    if (!lang)
      return languageMap[''] || 'Plain Text'
    return languageMap[lang] || lang.charAt(0).toUpperCase() + lang.slice(1)
  }, [canonicalLanguage])

  const resolvedCode = useMemo(() => {
    if (node.diff)
      return node.updatedCode ?? node.code ?? ''
    return node.code ?? ''
  }, [node.code, node.diff, node.updatedCode])

  const containerStyle = useMemo(() => {
    const fmt = (v: string | number | undefined) => {
      if (v == null)
        return undefined
      return typeof v === 'number' ? `${v}px` : String(v)
    }
    const style: Record<string, string> = {}
    const min = fmt(minWidth)
    const max = fmt(maxWidth)
    if (min)
      style.minWidth = min
    if (max)
      style.maxWidth = max
    return style
  }, [minWidth, maxWidth])

  const shouldDelayEditor = stream === false && loading

  const preferredTheme = useMemo(() => (isDark ? darkTheme : lightTheme), [darkTheme, isDark, lightTheme])

  // Vue parity: keep theme in sync without recreating Monaco.
  useEffect(() => {
    if (useFallback)
      return
    if (!editorCreated || !viewportReady)
      return
    const helpers = helpersRef.current
    if (!helpers?.setTheme)
      return
    if (!preferredTheme)
      return
    void Promise.resolve(helpers.setTheme(preferredTheme))
      .then(() => syncEditorCssVars())
      .catch(() => {})
  }, [editorCreated, preferredTheme, syncEditorCssVars, useFallback, viewportReady])

  const ensureEditorCreation = useCallback(async (): Promise<void | null> => {
    if (useFallback)
      return null
    if (collapsed)
      return null
    if (shouldDelayEditor)
      return null
    const helpers = helpersRef.current
    const el = editorHostRef.current
    if (!helpers || !el || !helpers.createEditor)
      return null

    const currentNode = latestNodeRef.current
    const desiredKind: 'diff' | 'single' = currentNode.diff ? 'diff' : 'single'
    if (editorKindRef.current === desiredKind)
      return null
    if (createEditorPromiseRef.current)
      return createEditorPromiseRef.current

    setEditorCreated(true)
    const pending = (async () => {
      try {
        cleanupRef.current?.()
        editorKindRef.current = null
        setEditorReady(false)

        const lang = monacoLanguage
        if (currentNode.diff) {
          if (typeof helpers.createDiffEditor === 'function') {
            editorKindRef.current = 'diff'
            await helpers.createDiffEditor(
              el,
              String(currentNode.originalCode ?? ''),
              String(currentNode.updatedCode ?? ''),
              lang,
            )
          }
          else {
            editorKindRef.current = 'single'
            await helpers.createEditor(el, String(currentNode.updatedCode ?? currentNode.code ?? ''), lang)
          }
        }
        else {
          editorKindRef.current = 'single'
          await helpers.createEditor(el, String(currentNode.code ?? ''), lang)
        }

        const initialFontSize = Number((monacoOptionsRef.current as any)?.fontSize)
        if (Number.isFinite(initialFontSize) && initialFontSize > 0) {
          setDefaultFontSize(initialFontSize)
          setFontSize(initialFontSize)
          try {
            const view = editorKindRef.current === 'diff'
              ? helpers.getDiffEditorView?.()
              : helpers.getEditorView?.()
            view?.updateOptions?.({ fontSize: initialFontSize, automaticLayout: false })
          }
          catch {}
        }

        syncEditorCssVars()
        if (!expanded && !collapsed)
          applyEditorHeight(false)
        setEditorReady(true)
      }
      catch {
        setUseFallback(true)
      }
    })()

    createEditorPromiseRef.current = pending.finally(() => {
      createEditorPromiseRef.current = null
    })
    return createEditorPromiseRef.current
  }, [applyEditorHeight, collapsed, expanded, monacoLanguage, shouldDelayEditor, syncEditorCssVars, useFallback])

  const isMermaid = canonicalLanguage === 'mermaid'

  useEffect(() => {
    if (useFallback)
      return
    if (!monacoReady)
      return
    if (!viewportReady)
      return
    if (collapsed)
      return
    if (shouldDelayEditor)
      return
    if (isMermaid) {
      cleanupRef.current?.()
      return
    }
    void ensureEditorCreation()
  }, [collapsed, ensureEditorCreation, isMermaid, monacoReady, shouldDelayEditor, useFallback, viewportReady])

  useEffect(() => {
    if (props.stream === false)
      return
    if (useFallback)
      return
    if (!monacoReady)
      return
    if (collapsed)
      return
    if (isMermaid)
      return

    const helpers = helpersRef.current
    if (!helpers)
      return

    const newCode = String(node.code ?? '')
    const run = async () => {
      let langToken = codeLanguage
      if (!langToken && detectLanguageRef.current) {
        try {
          langToken = normalizeLanguageIdentifier(detectLanguageRef.current(newCode))
          if (langToken)
            setCodeLanguage(langToken)
        }
        catch {}
      }
      const lang = resolveMonacoLanguageId(langToken || canonicalLanguage)

      if (helpers.createEditor && !editorCreated && editorHostRef.current) {
        try {
          await ensureEditorCreation()
        }
        catch {}
      }

      try {
        if (node.diff && helpers.updateDiff) {
          await Promise.resolve(helpers.updateDiff(String(node.originalCode ?? ''), String(node.updatedCode ?? ''), lang))
        }
        else if (helpers.updateCode) {
          await Promise.resolve(helpers.updateCode(newCode, lang))
        }
      }
      catch {}

      if (expanded)
        applyEditorHeight(true)
    }
    void run()
  }, [
    applyEditorHeight,
    canonicalLanguage,
    codeLanguage,
    collapsed,
    editorCreated,
    ensureEditorCreation,
    expanded,
    isMermaid,
    monacoReady,
    node.code,
    node.diff,
    node.originalCode,
    node.updatedCode,
    props.stream,
    useFallback,
  ])

  useEffect(() => {
    if (useFallback)
      return
    if (!monacoReady)
      return
    if (!viewportReady)
      return
    if (collapsed)
      return
    if (shouldDelayEditor)
      return
    // Avoid doing expensive layouts on every streaming tick; adjust height when
    // expanded, and after streaming completes.
    if (!expanded && loading)
      return
    const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
      ? window.requestAnimationFrame(() => applyEditorHeight(expanded))
      : null
    if (raf == null)
      applyEditorHeight(expanded)
    return () => {
      if (raf != null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function')
        window.cancelAnimationFrame(raf)
    }
  }, [applyEditorHeight, collapsed, expanded, loading, monacoReady, shouldDelayEditor, useFallback, viewportReady])

  useEffect(() => {
    if (!enableFontSizeControl)
      return
    if (useFallback)
      return
    const helpers = helpersRef.current
    if (!helpers)
      return
    try {
      const view = editorKindRef.current === 'diff'
        ? helpers.getDiffEditorView?.()
        : helpers.getEditorView?.()
      view?.updateOptions?.({ fontSize })
    }
    catch {}
    applyEditorHeight(expanded)
  }, [applyEditorHeight, enableFontSizeControl, expanded, fontSize, node.diff, useFallback])

  const onBtnHover = useCallback((event: React.MouseEvent, text: string) => {
    const btn = event.currentTarget as unknown as HTMLElement
    showTooltipForAnchor(btn, text, 'top', false, { x: event.clientX, y: event.clientY }, isDark)
  }, [isDark])

  const onBtnLeave = useCallback(() => {
    hideTooltip()
  }, [])

  const copy = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function')
        await navigator.clipboard.writeText(String(resolvedCode))
      setCopied(true)
      props.onCopy?.(String(resolvedCode))
      setTimeout(() => setCopied(false), 1000)
    }
    catch {}
  }, [props, resolvedCode])

  const previewCode = useCallback(() => {
    if (!isPreviewable)
      return
    const artifactType = canonicalLanguage === 'html' ? 'text/html' : 'image/svg+xml'
    const artifactTitle = canonicalLanguage === 'html'
      ? t('artifacts.htmlPreviewTitle') || 'HTML Preview'
      : t('artifacts.svgPreviewTitle') || 'SVG Preview'
    if (typeof props.onPreviewCode === 'function') {
      props.onPreviewCode({
        node,
        artifactType,
        artifactTitle,
        id: `temp-${canonicalLanguage}-${Date.now()}`,
      })
      return
    }
    if (canonicalLanguage === 'html')
      setInlinePreviewOpen(v => !v)
  }, [canonicalLanguage, isPreviewable, node, props, t])

  if (useFallback)
    return <PreCodeNode node={node as any} />

  return (
    <div
      ref={containerRef}
      className={[
        'code-block-container my-4 rounded-lg border overflow-hidden shadow-sm',
        isDark ? 'border-gray-700/30 bg-gray-900' : 'border-gray-200 bg-white',
        loading ? 'is-rendering' : '',
        isDark ? 'is-dark' : '',
      ].join(' ')}
      style={containerStyle}
    >
      {showHeader && (
        <div
          className="code-block-header flex justify-between items-center px-4 py-2.5 border-b border-gray-400/5"
          style={{ color: 'var(--vscode-editor-foreground)', backgroundColor: 'var(--vscode-editor-background)' }}
        >
          <div className="flex items-center space-x-2 flex-1 overflow-hidden">
            <span
              className="icon-slot h-4 w-4 flex-shrink-0"
              // language icons are trusted internal assets or user-supplied via resolver
              dangerouslySetInnerHTML={{ __html: languageIcon }}
            />
            <span className="text-sm font-medium font-mono truncate">{displayLanguage}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              className="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
              aria-pressed={collapsed}
              onClick={() => setCollapsed(v => !v)}
              onMouseEnter={e => onBtnHover(e, collapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))}
              onFocus={e => onBtnHover(e as any, collapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))}
              onMouseLeave={onBtnLeave}
              onBlur={onBtnLeave}
            >
              <svg
                style={{ rotate: collapsed ? '0deg' : '90deg' }}
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

            {showFontSizeButtons && enableFontSizeControl && (
              <>
                <button
                  type="button"
                  className="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
                  disabled={fontSize <= 10}
                  onClick={() => setFontSize(v => Math.max(10, v - 1))}
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
                  onClick={() => setFontSize(defaultFontSize)}
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
                  onClick={() => setFontSize(v => Math.min(36, v + 1))}
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

            {showCopyButton && (
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

            {showExpandButton && (
              <button
                type="button"
                className="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
                aria-pressed={expanded}
                onClick={() => setExpanded(v => !v)}
                onMouseEnter={e => onBtnHover(e, expanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))}
                onFocus={e => onBtnHover(e as any, expanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))}
                onMouseLeave={onBtnLeave}
                onBlur={onBtnLeave}
              >
                {expanded
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

            {isPreviewable && showPreviewButton && (
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
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24">
                  <g fill="currentColor" fillRule="evenodd" clipRule="evenodd">
                    <path d="M23.628 7.41c-.12-1.172-.08-3.583-.9-4.233c-1.921-1.51-6.143-1.11-8.815-1.19c-3.481-.15-7.193.14-10.625.24a.34.34 0 0 0 0 .67c3.472-.05 7.074-.29 10.575-.09c2.471.15 6.653-.14 8.254 1.16c.4.33.41 2.732.49 3.582a42 42 0 0 1 .08 9.005a13.8 13.8 0 0 1-.45 3.001c-2.42 1.4-19.69 2.381-20.72.55a21 21 0 0 1-.65-4.632a41.5 41.5 0 0 1 .12-7.964c.08 0 7.334.33 12.586.24c2.331 0 4.682-.13 6.764-.21a.33.33 0 0 0 0-.66c-7.714-.16-12.897-.43-19.31.05c.11-1.38.48-3.922.38-4.002a.3.3 0 0 0-.42 0c-.37.41-.29 1.77-.36 2.251s-.14 1.07-.2 1.6a45 45 0 0 0-.36 8.645a21.8 21.8 0 0 0 .66 5.002c1.46 2.702 17.248 1.461 20.95.43c1.45-.4 1.69-.8 1.871-1.95c.575-3.809.602-7.68.08-11.496" />
                    <path d="M4.528 5.237a.84.84 0 0 0-.21-1c-.77-.41-1.71.39-1 1.1a.83.83 0 0 0 1.21-.1m2.632-.25c.14-.14.19-.84-.2-1c-.77-.41-1.71.39-1 1.09a.82.82 0 0 0 1.2-.09m2.88 0a.83.83 0 0 0-.21-1c-.77-.41-1.71.39-1 1.09a.82.82 0 0 0 1.21-.09m-4.29 8.735c0 .08.23 2.471.31 2.561a.371.371 0 0 0 .63-.14c0-.09 0 0 .15-1.72a10 10 0 0 0-.11-2.232a5.3 5.3 0 0 1-.26-1.37a.3.3 0 0 0-.54-.24a6.8 6.8 0 0 0-.2 2.33c-1.281-.38-1.121.13-1.131-.42a15 15 0 0 0-.19-1.93c-.16-.17-.36-.17-.51.14a20 20 0 0 0-.43 3.471c.04.773.18 1.536.42 2.272c.26.4.7.22.7-.1c0-.09-.16-.09 0-1.862c.06-1.18-.23-.3 1.16-.76m5.033-2.552c.32-.07.41-.28.39-.37c0-.55-3.322-.34-3.462-.24s-.2.18-.18.28s0 .11 0 .16a3.8 3.8 0 0 0 1.591.361v.82a15 15 0 0 0-.13 3.132c0 .2-.09.94.17 1.16a.34.34 0 0 0 .48 0c.125-.35.196-.718.21-1.09a8 8 0 0 0 .14-3.232c0-.13.05-.7-.1-.89a8 8 0 0 0 .89-.09m5.544-.181a.69.69 0 0 0-.89-.44a2.8 2.8 0 0 0-1.252 1.001a2.3 2.3 0 0 0-.41-.83a1 1 0 0 0-1.6.27a7 7 0 0 0-.35 2.07c0 .571 0 2.642.06 2.762c.14 1.09 1 .51.63.13a17.6 17.6 0 0 1 .38-3.962c.32-1.18.32.2.39.51s.11 1.081.73 1.081s.48-.93 1.401-1.78q.075 1.345 0 2.69a15 15 0 0 0 0 1.811a.34.34 0 0 0 .68 0q.112-.861.11-1.73a16.7 16.7 0 0 0 .12-3.582m1.441-.201c-.05.16-.3 3.002-.31 3.202a6.3 6.3 0 0 0 .21 1.741c.33 1 1.21 1.07 2.291.82a3.7 3.7 0 0 0 1.14-.23c.21-.22.10-.59-.41-.64q-.817.096-1.64.07c-.44-.07-.34 0-.67-4.442q.015-.185 0-.37a.316.316 0 0 0-.23-.38a.316.316 0 0 0-.38.23" />
                  </g>
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`code-block-body${expanded ? ' code-block-body--expanded' : ''}`}>
        {!collapsed && (stream ? true : !loading) && (
          useFallback
            ? <PreCodeNode node={node as any} />
            : (
                <>
                  <div
                    ref={editorHostRef}
                    className={`code-editor-container${stream ? '' : ' code-height-placeholder'}`}
                    style={{ visibility: editorReady ? 'visible' : 'hidden' }}
                    aria-hidden={!editorReady}
                  />
                  {!editorReady && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        overflow: 'auto',
                        padding: '1rem',
                      }}
                    >
                      <pre
                        className="code-fallback-plain m-0"
                        aria-busy={loading}
                        aria-label={`Code block: ${displayLanguage}`}
                        tabIndex={0}
                      >
                        <code translate="no">{String(resolvedCode)}</code>
                      </pre>
                    </div>
                  )}
                </>
              )
        )}

        {!stream && loading && (
          <div className="code-loading-placeholder">
            <div className="loading-skeleton">
              <div className="skeleton-line" />
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </div>
          </div>
        )}
      </div>

      {inlinePreviewOpen && !props.onPreviewCode && isPreviewable && canonicalLanguage === 'html' && (
        <HtmlPreviewFrame
          code={String(node.code ?? '')}
          isDark={isDark}
          onClose={() => setInlinePreviewOpen(false)}
        />
      )}
      <span className="sr-only" aria-live="polite" role="status">{copied ? (t('common.copied') || 'Copied') : ''}</span>
    </div>
  )
}

export default CodeBlockNode
