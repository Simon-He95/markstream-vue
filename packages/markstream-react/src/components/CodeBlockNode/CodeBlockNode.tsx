import type { VisibilityHandle } from '../../context/viewportPriority'
import type { CodeBlockNodeProps } from '../../types/component-props'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useViewportPriority } from '../../context/viewportPriority'
import { useSafeI18n } from '../../i18n/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../tooltip/singletonTooltip'
import { getLanguageIcon, languageMap, normalizeLanguageIdentifier, resolveMonacoLanguageId, subscribeLanguageIconsRevision } from '../../utils/languageIcon'
import { HtmlPreviewFrame } from './HtmlPreviewFrame'
import { getUseMonaco } from './monaco'
import { getDesiredMonacoTheme, registerMonacoThemeSetter, subscribeMonacoThemeApplied } from './monacoThemeRegistry'
import { scheduleMonacoThemeUpdate } from './monacoThemeScheduler'
import { PreCodeNode } from './PreCodeNode'

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
  | 'showCollapseButton'
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
  | 'showCollapseButton'
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
  showCollapseButton: true,
  showFontSizeButtons: true,
}

const defaultDiffHideUnchangedRegions = Object.freeze({
  enabled: true,
  contextLineCount: 2,
  minimumLineCount: 4,
  revealLineCount: 5,
})

function resolveDiffHideUnchangedRegionsOption(value: unknown) {
  if (typeof value === 'boolean')
    return value
  if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>
    return {
      ...defaultDiffHideUnchangedRegions,
      ...raw,
      enabled: raw.enabled ?? true,
    }
  }
  return { ...defaultDiffHideUnchangedRegions }
}

function resolveCodeBlockMonacoOptions(isDiff: boolean, monacoOptions: CodeBlockNodeProps['monacoOptions']) {
  const raw = monacoOptions ? { ...(monacoOptions as Record<string, any>) } : {}
  if (!isDiff)
    return raw

  const diffHideUnchangedRegions = raw.diffHideUnchangedRegions === undefined
    ? { ...defaultDiffHideUnchangedRegions }
    : resolveDiffHideUnchangedRegionsOption(raw.diffHideUnchangedRegions)
  const hideUnchangedRegions = raw.hideUnchangedRegions === undefined
    ? undefined
    : resolveDiffHideUnchangedRegionsOption(raw.hideUnchangedRegions)
  const diffUnchangedRegionStyle = raw.diffUnchangedRegionStyle ?? 'line-info'
  const needsExtraBottomSpace
    = diffUnchangedRegionStyle === 'line-info'
      || diffUnchangedRegionStyle === 'line-info-basic'
      || diffUnchangedRegionStyle === 'metadata'
  const diffDefaults = {
    maxComputationTime: 0,
    diffAlgorithm: 'legacy',
    ignoreTrimWhitespace: false,
    renderIndicators: true,
    diffUpdateThrottleMs: 120,
    renderLineHighlight: 'none',
    renderLineHighlightOnlyWhenFocus: true,
    selectionHighlight: false,
    occurrencesHighlight: 'off',
    matchBrackets: 'never',
    lineDecorationsWidth: 12,
    lineNumbersMinChars: 2,
    glyphMargin: false,
    fontSize: 13,
    lineHeight: 30,
    renderOverviewRuler: false,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    scrollBeyondLastLine: false,
    padding: { top: 10, bottom: needsExtraBottomSpace ? 22 : 14 },
    diffHideUnchangedRegions,
    diffLineStyle: 'background',
    diffAppearance: 'auto',
    diffUnchangedRegionStyle,
    diffHunkActionsOnHover: true,
    diffHunkHoverHideDelayMs: 160,
  }

  return {
    ...diffDefaults,
    ...raw,
    ...(hideUnchangedRegions === undefined ? {} : { hideUnchangedRegions }),
    diffHideUnchangedRegions,
  }
}

function getThemeName(theme: any) {
  if (typeof theme === 'string')
    return theme
  if (theme && typeof theme === 'object' && 'name' in theme)
    return String((theme as any).name)
  return null
}

function themeLooksDark(theme: any, fallback: boolean) {
  const themeName = getThemeName(theme) ?? ''
  const normalized = themeName.toLowerCase()
  if (!normalized)
    return fallback
  const darkTokens = [
    'dark',
    'night',
    'moon',
    'black',
    'dracula',
    'mocha',
    'frappe',
    'macchiato',
    'palenight',
    'ocean',
    'poimandres',
    'monokai',
    'laserwave',
    'tokyo',
    'slack-dark',
    'rose-pine',
    'github-dark',
    'material-theme',
    'one-dark',
    'catppuccin-mocha',
    'catppuccin-frappe',
    'catppuccin-macchiato',
  ]
  const lightTokens = ['light', 'latte', 'dawn', 'lotus']
  return darkTokens.some(token => normalized.includes(token))
    && !lightTokens.some(token => normalized.includes(token))
}

function getColorLuminance(color: string) {
  const channels = String(color ?? '').match(/\d+(?:\.\d+)?/g)
  if (!channels || channels.length < 3)
    return null
  const [r, g, b] = channels.slice(0, 3).map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function shouldPreferPlainTextFallbackSurface(bg: string, fg: string, isPlainTextLanguage: boolean, expectDark: boolean) {
  if (!isPlainTextLanguage)
    return false

  const bgLuminance = getColorLuminance(bg)
  const fgLuminance = getColorLuminance(fg)

  if (expectDark) {
    return (bgLuminance != null && bgLuminance > 170)
      || (fgLuminance != null && fgLuminance < 110)
  }

  return (bgLuminance != null && bgLuminance < 85)
    || (fgLuminance != null && fgLuminance > 190)
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
    showCollapseButton,
    showFontSizeButtons,
    showTooltips,
  } = props

  const editorHostRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const helpersRef = useRef<any>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const createEditorPromiseRef = useRef<Promise<void> | null>(null)
  const editorKindRef = useRef<'diff' | 'single' | null>(null)
  const editorMountElRef = useRef<HTMLElement | null>(null)
  const editorLifecycleIdRef = useRef(0)
  const detectLanguageRef = useRef<((code: string) => string) | null>(null)
  const viewportHandleRef = useRef<VisibilityHandle | null>(null)
  const registerViewport = useViewportPriority()
  const monacoOptionsRef = useRef(monacoOptions)
  const runtimeMonacoOptionsRef = useRef<Record<string, any> | null>(null)
  const structuralSignatureRef = useRef<string | null>(null)

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
  const [languageIconsRevision, setLanguageIconsRevision] = useState(0)

  const { t } = useSafeI18n()

  const resolvedMonacoOptions = useMemo(
    () => resolveCodeBlockMonacoOptions(Boolean(node.diff), monacoOptions),
    [monacoOptions, node.diff],
  )

  const [defaultFontSize, setDefaultFontSize] = useState<number>(() => {
    const initial = Number((resolveCodeBlockMonacoOptions(Boolean(node.diff), monacoOptions) as any)?.fontSize)
    return Number.isFinite(initial) && initial > 0 ? initial : 14
  })
  const [fontSize, setFontSize] = useState(defaultFontSize)
  const tooltipsEnabled = useMemo(() => showTooltips !== false, [showTooltips])

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
      host.style.minHeight = '0px'
      host.style.maxHeight = 'none'
      host.style.overflow = 'visible'
    }
    else {
      host.style.minHeight = '0px'
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
        host.style.height = `${Math.ceil(Math.max(1, height))}px`
      }
      view.layout?.()
    }
    catch {}
  }, [getMaxHeightValue, useFallback])

  useEffect(() => {
    return subscribeLanguageIconsRevision(() => {
      setLanguageIconsRevision(v => v + 1)
    })
  }, [])

  useEffect(() => {
    setCodeLanguage(normalizeLanguageIdentifier(node.language))
  }, [node.language])

  const latestNodeRef = useRef(node)
  latestNodeRef.current = node

  const resetEditorInstance = useCallback(() => {
    editorLifecycleIdRef.current += 1
    try {
      cleanupRef.current?.()
    }
    catch {}
    createEditorPromiseRef.current = null
    editorKindRef.current = null
    editorMountElRef.current = null
    setEditorReady(false)
    setEditorCreated(false)
  }, [])

  const syncEditorCssVars = useCallback(() => {
    const editorEl = editorHostRef.current
    const rootEl = containerRef.current
    if (!editorEl || !rootEl)
      return
    if (node.diff) {
      rootEl.style.removeProperty('--vscode-editor-foreground')
      rootEl.style.removeProperty('--vscode-editor-background')
      rootEl.style.removeProperty('--vscode-editor-selectionBackground')
      return
    }
    const src = (editorEl.querySelector('.monaco-editor') as HTMLElement | null) ?? editorEl
    try {
      const styles = typeof window !== 'undefined' && window.getComputedStyle
        ? window.getComputedStyle(src)
        : null
      const fg = String(styles?.getPropertyValue('--vscode-editor-foreground') ?? '').trim()
        || String((styles as any)?.color ?? '').trim()
      const bg = String(styles?.getPropertyValue('--vscode-editor-background') ?? '').trim()
        || String((styles as any)?.backgroundColor ?? '').trim()
      const sel = String(styles?.getPropertyValue('--vscode-editor-selectionBackground') ?? '').trim()
      const isPlainTextLanguage = resolveMonacoLanguageId(String(node.language || codeLanguage || detectedLanguage || 'plaintext')) === 'plaintext'
      if (shouldPreferPlainTextFallbackSurface(bg, fg, isPlainTextLanguage, rootEl.classList.contains('is-dark'))) {
        rootEl.style.removeProperty('--vscode-editor-foreground')
        rootEl.style.removeProperty('--vscode-editor-background')
        rootEl.style.removeProperty('--vscode-editor-selectionBackground')
        return
      }
      if (fg)
        rootEl.style.setProperty('--vscode-editor-foreground', fg)
      if (bg)
        rootEl.style.setProperty('--vscode-editor-background', bg)
      if (sel)
        rootEl.style.setProperty('--vscode-editor-selectionBackground', sel)
    }
    catch {}
  }, [codeLanguage, detectedLanguage, node.diff, node.language])

  const preferredTheme = useMemo(() => (isDark ? darkTheme : lightTheme), [darkTheme, isDark, lightTheme])

  const resolveRequestedTheme = useCallback(() => {
    const explicit = (resolvedMonacoOptions as any)?.theme
    const requested = preferredTheme ?? explicit ?? getDesiredMonacoTheme()
    const availableThemes = Array.isArray(themes) ? themes : []
    if (!availableThemes.length || requested == null)
      return requested

    const requestedName = getThemeName(requested)
    const availableNames = availableThemes
      .map(theme => getThemeName(theme))
      .filter((name): name is string => !!name)
    if (!requestedName || availableNames.includes(requestedName))
      return requested

    const explicitName = getThemeName(explicit)
    if (explicit != null && explicitName && availableNames.includes(explicitName))
      return explicit

    return availableThemes[0]
  }, [preferredTheme, resolvedMonacoOptions, themes])

  const requestedTheme = useMemo(() => resolveRequestedTheme(), [resolveRequestedTheme])

  const resolvedChromeIsDark = useMemo(
    () => themeLooksDark(requestedTheme, Boolean(isDark)),
    [isDark, requestedTheme],
  )

  const effectiveDiffAppearance = useMemo<'light' | 'dark'>(() => {
    if (!node.diff)
      return resolvedChromeIsDark ? 'dark' : 'light'

    const explicit = (resolvedMonacoOptions as any)?.diffAppearance
    if (explicit === 'light' || explicit === 'dark')
      return explicit

    return isDark ? 'dark' : 'light'
  }, [isDark, node.diff, resolvedChromeIsDark, resolvedMonacoOptions])

  const resolvedSurfaceIsDark = useMemo(
    () => (node.diff ? effectiveDiffAppearance === 'dark' : resolvedChromeIsDark),
    [effectiveDiffAppearance, node.diff, resolvedChromeIsDark],
  )

  const buildRuntimeMonacoOptions = useCallback(() => {
    return {
      wordWrap: 'on',
      wrappingIndent: 'same',
      themes,
      ...(resolvedMonacoOptions || {}),
      theme: requestedTheme,
      ...(node.diff ? { diffAppearance: effectiveDiffAppearance } : {}),
      onThemeChange() {
        syncEditorCssVars()
      },
    } as Record<string, any>
  }, [effectiveDiffAppearance, node.diff, requestedTheme, resolvedMonacoOptions, syncEditorCssVars, themes])

  const syncRuntimeMonacoOptions = useCallback(() => {
    const nextOptions = buildRuntimeMonacoOptions()
    const current = runtimeMonacoOptionsRef.current
    if (!current) {
      runtimeMonacoOptionsRef.current = nextOptions
      return nextOptions
    }

    for (const key of Object.keys(current)) {
      if (!(key in nextOptions))
        delete current[key]
    }
    Object.assign(current, nextOptions)
    return current
  }, [buildRuntimeMonacoOptions])

  const monacoStructuralSignature = useMemo(() => JSON.stringify({
    diffLineStyle: (resolvedMonacoOptions as any)?.diffLineStyle ?? 'background',
    diffUnchangedRegionStyle: (resolvedMonacoOptions as any)?.diffUnchangedRegionStyle ?? 'line-info',
    diffHideUnchangedRegions: (resolvedMonacoOptions as any)?.diffHideUnchangedRegions ?? true,
    renderSideBySide: (resolvedMonacoOptions as any)?.renderSideBySide ?? true,
    enableSplitViewResizing: (resolvedMonacoOptions as any)?.enableSplitViewResizing ?? true,
    ignoreTrimWhitespace: (resolvedMonacoOptions as any)?.ignoreTrimWhitespace ?? true,
    originalEditable: (resolvedMonacoOptions as any)?.originalEditable ?? false,
  }), [resolvedMonacoOptions])

  useEffect(() => {
    monacoOptionsRef.current = resolvedMonacoOptions
    syncRuntimeMonacoOptions()
  }, [resolvedMonacoOptions, syncRuntimeMonacoOptions])

  useEffect(() => {
    return () => {
      editorLifecycleIdRef.current += 1
      cleanupRef.current?.()
      cleanupRef.current = null
      createEditorPromiseRef.current = null
      editorKindRef.current = null
      editorMountElRef.current = null
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
    if (helpersRef.current) {
      syncRuntimeMonacoOptions()
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
        const runtimeMonacoOptions = syncRuntimeMonacoOptions()
        const helpers = useMonaco(runtimeMonacoOptions)
        helpersRef.current = helpers
        registerMonacoThemeSetter(helpers.setTheme)
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
  }, [syncRuntimeMonacoOptions])

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
  const isPlainTextLanguage = useMemo(() => monacoLanguage === 'plaintext', [monacoLanguage])
  const languageIcon = useMemo(
    () => getLanguageIcon(canonicalLanguage),
    [canonicalLanguage, languageIconsRevision],
  )
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
    if (node.diff) {
      style.color = 'var(--markstream-diff-shell-fg)'
      style.borderColor = 'var(--markstream-diff-shell-border)'
    }
    else {
      style.color = `var(--vscode-editor-foreground, ${resolvedSurfaceIsDark ? '#e5e7eb' : '#111827'})`
      style.backgroundColor = `var(--vscode-editor-background, ${resolvedSurfaceIsDark ? '#111827' : '#ffffff'})`
      style.borderColor = resolvedSurfaceIsDark ? 'rgb(55 65 81 / 0.3)' : 'rgb(229 231 235)'
    }
    return style
  }, [maxWidth, minWidth, node.diff, resolvedSurfaceIsDark])

  const headerStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (node.diff)
      return undefined
    return {
      color: `var(--vscode-editor-foreground, ${resolvedSurfaceIsDark ? '#e5e7eb' : '#111827'})`,
      backgroundColor: `var(--vscode-editor-background, ${resolvedSurfaceIsDark ? '#111827' : '#ffffff'})`,
    }
  }, [node.diff, resolvedSurfaceIsDark])

  const shouldDelayEditor = stream === false && loading

  // Vue parity: keep theme in sync without recreating Monaco.
  useEffect(() => {
    if (useFallback)
      return
    if (!monacoReady)
      return
    if (!editorCreated || !viewportReady)
      return
    const helpers = helpersRef.current
    syncRuntimeMonacoOptions()
    const syncPresentation = () => {
      if (node.diff)
        helpers?.refreshDiffPresentation?.()
      syncEditorCssVars()
      if (collapsed)
        return
      const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame(() => applyEditorHeight(expanded))
        : null
      if (raf == null)
        applyEditorHeight(expanded)
    }
    if (!helpers?.setTheme || !requestedTheme) {
      syncPresentation()
      return
    }
    void scheduleMonacoThemeUpdate(requestedTheme, helpers.setTheme)
      .then(syncPresentation)
      .catch(() => {})
  }, [
    applyEditorHeight,
    collapsed,
    editorCreated,
    effectiveDiffAppearance,
    expanded,
    monacoReady,
    node.diff,
    requestedTheme,
    syncEditorCssVars,
    syncRuntimeMonacoOptions,
    useFallback,
    viewportReady,
  ])

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    return subscribeMonacoThemeApplied(() => {
      syncEditorCssVars()
    })
  }, [syncEditorCssVars])

  const ensureEditorCreation = useCallback(async (): Promise<void | null> => {
    if (useFallback)
      return null
    if (!viewportReady)
      return null
    if (collapsed)
      return null
    if (shouldDelayEditor)
      return null
    const helpers = helpersRef.current
    const el = editorHostRef.current
    if (!helpers || !el || !helpers.createEditor)
      return null

    syncRuntimeMonacoOptions()

    const currentNode = latestNodeRef.current
    const desiredKind: 'diff' | 'single' = currentNode.diff ? 'diff' : 'single'
    const attachedEl = editorMountElRef.current
    const hasExpectedView = desiredKind === 'diff'
      ? Boolean(helpers.getDiffEditorView?.())
      : Boolean(helpers.getEditorView?.())
    const shouldRecreate = editorKindRef.current !== desiredKind || attachedEl !== el || !hasExpectedView
    if (!shouldRecreate)
      return null
    if (createEditorPromiseRef.current)
      return createEditorPromiseRef.current

    editorLifecycleIdRef.current += 1
    const creationId = editorLifecycleIdRef.current
    setEditorCreated(true)
    const pending = (async () => {
      try {
        cleanupRef.current?.()
        editorKindRef.current = null
        editorMountElRef.current = null
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
        editorMountElRef.current = el

        if (editorLifecycleIdRef.current !== creationId)
          return

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
        if (editorLifecycleIdRef.current === creationId)
          setUseFallback(true)
      }
    })()

    const tracked = pending.finally(() => {
      if (createEditorPromiseRef.current === tracked)
        createEditorPromiseRef.current = null
    })
    createEditorPromiseRef.current = tracked
    return tracked
  }, [applyEditorHeight, collapsed, expanded, monacoLanguage, shouldDelayEditor, syncEditorCssVars, syncRuntimeMonacoOptions, useFallback, viewportReady])

  useEffect(() => {
    syncRuntimeMonacoOptions()
    const previousSignature = structuralSignatureRef.current
    structuralSignatureRef.current = monacoStructuralSignature

    if (!node.diff)
      return
    if (useFallback)
      return
    if (!monacoReady || !viewportReady || !editorCreated)
      return
    if (collapsed || shouldDelayEditor)
      return
    if (previousSignature === monacoStructuralSignature)
      return

    let cancelled = false
    void (async () => {
      resetEditorInstance()
      if (cancelled)
        return
      try {
        await ensureEditorCreation()
      }
      catch {}
    })()
    return () => {
      cancelled = true
    }
  }, [
    collapsed,
    editorCreated,
    ensureEditorCreation,
    monacoReady,
    monacoStructuralSignature,
    node.diff,
    resetEditorInstance,
    shouldDelayEditor,
    syncRuntimeMonacoOptions,
    useFallback,
    viewportReady,
  ])

  useEffect(() => {
    if (useFallback)
      return
    if (!monacoReady)
      return
    if (!viewportReady)
      return
    if (collapsed || shouldDelayEditor) {
      resetEditorInstance()
      return
    }
    void ensureEditorCreation()
  }, [collapsed, ensureEditorCreation, monacoReady, resetEditorInstance, shouldDelayEditor, useFallback, viewportReady])

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

      if (helpers.createEditor && editorHostRef.current) {
        try {
          await Promise.resolve(ensureEditorCreation())
        }
        catch {}
        const pending = createEditorPromiseRef.current
        if (pending) {
          try {
            await pending
          }
          catch {}
        }
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
    monacoReady,
    node.code,
    node.diff,
    node.originalCode,
    node.updatedCode,
    shouldDelayEditor,
    useFallback,
    viewportReady,
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

  useEffect(() => {
    if (!tooltipsEnabled)
      hideTooltip(true)
  }, [tooltipsEnabled])

  const onBtnHover = useCallback((event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>, text: string) => {
    if (!tooltipsEnabled)
      return
    const btn = event.currentTarget as unknown as HTMLElement
    if (!btn || (btn as HTMLButtonElement).disabled)
      return
    const origin = 'clientX' in event
      ? { x: event.clientX, y: event.clientY }
      : undefined
    showTooltipForAnchor(btn, text, 'top', false, origin, resolvedSurfaceIsDark)
  }, [resolvedSurfaceIsDark, tooltipsEnabled])

  const onBtnLeave = useCallback(() => {
    if (!tooltipsEnabled)
      return
    hideTooltip()
  }, [tooltipsEnabled])

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
        resolvedSurfaceIsDark ? 'border-gray-700/30 bg-gray-900' : 'border-gray-200 bg-white',
        loading ? 'is-rendering' : '',
        resolvedSurfaceIsDark ? 'is-dark' : '',
        node.diff ? 'is-diff' : '',
        isPlainTextLanguage ? 'is-plain-text' : '',
      ].join(' ')}
      style={containerStyle}
    >
      {showHeader && (
        <div
          className="code-block-header flex justify-between items-center px-4 py-2.5 border-b border-gray-400/5"
          style={headerStyle}
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
            {showCollapseButton && (
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
            )}

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
                onClick={(e) => {
                  setExpanded(v => !v)
                  onBtnHover(e, !expanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))
                }}
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
                        <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" />
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
                        <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6" />
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

      <div className={`code-block-body${collapsed ? ' code-block-body--collapsed' : ''}${expanded ? ' code-block-body--expanded' : ''}`}>
        {!collapsed && (stream ? true : !loading) && (
          useFallback
            ? <PreCodeNode node={node as any} />
            : (
                <div className="code-editor-layer">
                  <div
                    ref={editorHostRef}
                    className={`code-editor-container${stream ? '' : ' code-height-placeholder'}`}
                    style={{ visibility: editorReady ? 'visible' : 'hidden' }}
                    aria-hidden={!editorReady}
                  />
                  {!editorReady && (
                    <div
                      className="code-editor-fallback-surface"
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
                </div>
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
          htmlPreviewAllowScripts={props.htmlPreviewAllowScripts}
          htmlPreviewSandbox={props.htmlPreviewSandbox}
          isDark={isDark}
          onClose={() => setInlinePreviewOpen(false)}
        />
      )}
      <span className="sr-only" aria-live="polite" role="status">{copied ? (t('common.copied') || 'Copied') : ''}</span>
    </div>
  )
}

export default CodeBlockNode
