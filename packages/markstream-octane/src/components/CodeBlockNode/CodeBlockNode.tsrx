import type { VisibilityHandle } from '../../context/viewportPriority.tsrx'
import type { CodeBlockNodeProps } from '../../types/component-props'
import type { OctaneRefObject, OctaneStyle } from '../../types/octane'
import * as Octane from 'octane'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'octane'
import { useViewportPriority } from '../../context/viewportPriority.tsrx'
import { useSafeI18n } from '../../i18n/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../tooltip/singletonTooltip'
import { getLanguageIcon, isLikelyIncompleteLanguageIdentifier, languageMap, normalizeLanguageIdentifier, resolveLanguageId, subscribeLanguageIconsRevision } from '../../utils/languageIcon'
import { HtmlPreviewFrame } from './HtmlPreviewFrame.tsrx'
import { getStreamDiffsRuntime } from './streamDiffs'
import { PreCodeNode } from './PreCodeNode.tsrx'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export interface CodeBlockPreviewPayload {
  node: CodeBlockNodeProps['node']
  artifactType: 'text/html' | 'image/svg+xml'
  artifactTitle: string
  id: string
}

export interface CodeBlockNodeOctaneEvents {
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

const defaultPreFallbackFontSize = 12
const defaultPreFallbackLineHeight = 18
const defaultCodeBlockMaxHeight = 500

type EditorLayerProps = {
  editorHostRef: OctaneRefObject<HTMLDivElement | null>
  editorReady: boolean
  node: CodeBlockNodeProps['node']
  preFallbackDiffInline: boolean
  preFallbackStyle: OctaneStyle & Record<string, string | number>
  showLineNumbers: boolean
  stream: boolean
}

function EditorLayer({
  editorHostRef,
  editorReady,
  node,
  preFallbackDiffInline,
  preFallbackStyle,
  showLineNumbers,
  stream,
}: EditorLayerProps) {
  return (
    <div className="code-editor-layer">
      <div
        ref={editorHostRef}
        className={`code-editor-container${stream ? '' : ' code-height-placeholder'}`}
        style={{ visibility: editorReady ? 'visible' : 'hidden' }}
        aria-hidden={!editorReady}
      />
      <div
        className="code-editor-fallback-surface"
        style={{ display: editorReady ? 'none' : 'block' }}
      >
        <PreCodeNode
          className="code-fallback-plain m-0"
          diffInline={preFallbackDiffInline}
          node={node}
          showLineNumbers={showLineNumbers}
          style={preFallbackStyle}
        />
      </div>
    </div>
  )
}

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function readEditorPadding(value: unknown, defaultPadding: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    return { top: defaultPadding, bottom: defaultPadding }
  return { top: value, bottom: value }
}

function measureRenderedDiffHeight(container: HTMLElement): number | null {
  if (typeof window === 'undefined')
    return null

  try {
    const hostRect = container.getBoundingClientRect()
    if (hostRect.width <= 0)
      return null

    const selectors = [
      '.stream-diffs-shell',
      '.stream-diffs-shell .diffs-container',
      '.stream-diffs-shell .diff-line',
      '.stream-diffs-shell .diff-hunk',
    ]

    let bottom = 0
    for (const node of Array.from(container.querySelectorAll(selectors.join(',')))) {
      if (!(node instanceof HTMLElement))
        continue
      const style = window.getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden')
        continue
      if (Number.parseFloat(style.opacity || '1') <= 0.01)
        continue
      const rect = node.getBoundingClientRect()
      if (rect.height <= 0 || rect.bottom <= hostRect.top)
        continue
      bottom = Math.max(bottom, rect.bottom - hostRect.top)
    }

    return bottom > 0 ? Math.ceil(bottom + 4) : null
  }
  catch {
    return null
  }
}

function resolveCodeBlockOptions(
  isDiff: boolean,
  codeBlockOptions: CodeBlockNodeProps['codeBlockOptions'],
): Record<string, any> {
  const raw = { ...(codeBlockOptions || {}) } as Record<string, any>
  for (const key of [
    'theme',
    'themes',
    'themeType',
    'language',
    'languages',
    'stream',
    'disableFileHeader',
    'onThemeChange',
    'renderCustomHeader',
    'renderHeaderMetadata',
    'renderHeaderPrefix',
  ])
    delete raw[key]

  if (!isDiff) {
    return {
      overflow: 'wrap',
      ...raw,
    }
  }

  const parseDiffOptions = raw.parseDiffOptions && typeof raw.parseDiffOptions === 'object'
    ? raw.parseDiffOptions as Record<string, unknown>
    : {}
  const defaults = {
    overflow: 'wrap',
    diffStyle: 'split',
    expandUnchanged: false,
    collapsedContextThreshold: 5,
    hunkSeparators: 'line-info',
    parseDiffOptions: { context: 2 },
  }
  return {
    ...defaults,
    ...raw,
    parseDiffOptions: {
      ...defaults.parseDiffOptions,
      ...parseDiffOptions,
    },
  }
}

function getDisplayCode(code: unknown) {
  return String(code ?? '').replace(/\r\n$|\n$|\r$/, '')
}

function getThemeName(theme: unknown): string | null {
  return typeof theme === 'string' ? theme : null
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

function isTransparentColor(color: string) {
  const normalized = String(color ?? '').trim().toLowerCase()
  if (!normalized || normalized === 'transparent')
    return true

  // Hex with an explicit alpha channel: #RRGGBBAA / #RGBA.
  const hex8 = normalized.match(/^#([0-9a-f]{8})$/)
  if (hex8)
    return Number.parseInt(hex8[1].slice(6), 16) === 0
  const hex4 = normalized.match(/^#([0-9a-f]{4})$/)
  if (hex4)
    return Number.parseInt(hex4[1][3] + hex4[1][3], 16) === 0

  // rgb()/rgba()/hsl()/hsla() with an explicit alpha channel (last value == 0).
  const channels = normalized.match(/^(?:rgba?|hsla?)\(([^)]+)\)/)?.[1]?.split(/[\s,/]+/).filter(Boolean)
  return channels?.length === 4 && Number(channels[3]) === 0
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

export function CodeBlockNode(rawProps: CodeBlockNodeProps & CodeBlockNodeOctaneEvents) {
  const props = { ...DEFAULTS, ...rawProps } as ResolvedProps & CodeBlockNodeOctaneEvents
  const {
    node,
    isDark,
    loading,
    stream,
    isShowPreview,
    enableFontSizeControl,
    darkTheme,
    lightTheme,
    codeBlockOptions,
    themes,
    minWidth,
    maxWidth,
    showHeader,
    showCopyButton,
    showExpandButton,
    showPreviewButton,
    showCollapseButton,
    showFontSizeButtons,
    showLineNumbers,
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
  const runtimeOptionsRef = useRef<Record<string, any> | null>(null)
  const runtimeFactoryRef = useRef<((options: Record<string, any>) => any) | null>(null)
  const codeBlockOptionsIdentityRef = useRef(codeBlockOptions)
  const structuralSignatureRef = useRef<string | null>(null)
  const editorHeightSyncDisposablesRef = useRef<any[]>([])
  const diffDomHeightObserverRef = useRef<MutationObserver | null>(null)
  const editorRevealFloorRef = useRef<number | null>(null)
  const expandedRef = useRef(false)
  const failedLanguageRef = useRef<string | undefined>(undefined)

  const [useFallback, setUseFallback] = useState(false)
  const [viewportReady, setViewportReady] = useState(() => typeof window === 'undefined')
  const [runtimeReady, setRuntimeReady] = useState(false)
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

  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])

  const resolvedOptions = useMemo(
    () => resolveCodeBlockOptions(Boolean(node.diff), codeBlockOptions),
    [codeBlockOptions, node.diff],
  )

  const [defaultFontSize, setDefaultFontSize] = useState<number>(() => {
    const initial = Number((resolveCodeBlockOptions(Boolean(node.diff), codeBlockOptions) as any)?.fontSize)
    return Number.isFinite(initial) && initial > 0 ? initial : defaultPreFallbackFontSize
  })
  const [fontSize, setFontSize] = useState(defaultFontSize)
  const tooltipsEnabled = useMemo(() => showTooltips !== false, [showTooltips])
  const resolvedShowLineNumbers = typeof showLineNumbers === 'boolean'
    ? showLineNumbers
    : resolvedOptions.disableLineNumbers !== true
  const showLineNumbersIdentityRef = useRef(resolvedShowLineNumbers)
  const previousConfiguredFontSize = Number(codeBlockOptionsIdentityRef.current?.fontSize)
  const configuredFontSize = Number(codeBlockOptions?.fontSize)
  const configuredFontSizeRemoved = codeBlockOptionsIdentityRef.current !== codeBlockOptions
    && Number.isFinite(previousConfiguredFontSize)
    && previousConfiguredFontSize > 0
    && (!Number.isFinite(configuredFontSize) || configuredFontSize <= 0)

  const getMaxHeightValue = useCallback((): number => {
    const raw = resolvedOptions.maxHeight ?? defaultCodeBlockMaxHeight
    if (typeof raw === 'number' && Number.isFinite(raw))
      return raw
    return defaultCodeBlockMaxHeight
  }, [resolvedOptions.maxHeight])

  useIsomorphicLayoutEffect(() => {
    const configured = Number(resolvedOptions.fontSize)
    const nextFontSize = Number.isFinite(configured) && configured > 0
      ? configured
      : defaultPreFallbackFontSize
    setDefaultFontSize(nextFontSize)
    setFontSize(nextFontSize)
  }, [resolvedOptions.fontSize])

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
    const isDiffEditor = editorKindRef.current === 'diff'
    const heightPriority = isDiffEditor ? 'important' : ''

    if (nextExpanded) {
      host.style.minHeight = '0px'
      host.style.setProperty('max-height', 'none', heightPriority)
      host.style.overflow = 'visible'
    }
    else {
      host.style.minHeight = '0px'
      host.style.setProperty('max-height', `${Math.ceil(maxHeight)}px`, heightPriority)
      host.style.overflow = isDiffEditor ? 'hidden' : 'auto'
    }

    try {
      const maybeGetContentHeight = () => {
        if (isDiffEditor) {
          const renderedHeight = measureRenderedDiffHeight(host)
          if (renderedHeight != null)
            return renderedHeight
        }
        if (typeof view.getContentHeight === 'function')
          return view.getContentHeight()
        if (isDiffEditor && typeof view.getModifiedEditor === 'function') {
          const modified = view.getModifiedEditor()
          if (modified && typeof modified.getContentHeight === 'function')
            return modified.getContentHeight()
        }
        return undefined
      }
      const contentHeight = Number(maybeGetContentHeight())
      if (Number.isFinite(contentHeight) && contentHeight > 0) {
        const height = nextExpanded ? contentHeight : Math.min(contentHeight, maxHeight)
        host.style.setProperty('height', `${Math.ceil(Math.max(1, height))}px`, heightPriority)
      }
      view.layout?.()
    }
    catch {}
  }, [getMaxHeightValue, useFallback])

  const scheduleEditorHeightSync = useCallback((nextExpanded: boolean) => {
    applyEditorHeight(nextExpanded)
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function')
      return

    const first = window.requestAnimationFrame(() => {
      applyEditorHeight(nextExpanded)
      window.requestAnimationFrame(() => {
        applyEditorHeight(nextExpanded)
        const host = editorHostRef.current
        if (host && editorRevealFloorRef.current != null) {
          host.style.minHeight = '0px'
          editorRevealFloorRef.current = null
        }
      })
    })
    window.setTimeout(() => applyEditorHeight(nextExpanded), 180)
    return () => window.cancelAnimationFrame(first)
  }, [applyEditorHeight])

  const prepareEditorReveal = useCallback(() => {
    const host = editorHostRef.current
    const fallback = containerRef.current?.querySelector('.code-editor-fallback-surface') as HTMLElement | null
    if (!host || !fallback)
      return
    const fallbackHeight = fallback.getBoundingClientRect().height
    if (!Number.isFinite(fallbackHeight) || fallbackHeight <= 0)
      return
    editorRevealFloorRef.current = fallbackHeight
    host.style.minHeight = `${Math.ceil(fallbackHeight)}px`
  }, [])

  const waitForAnimationFrame = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function')
      return Promise.resolve()
    return new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
  }, [])

  const clearEditorHeightSyncBindings = useCallback(() => {
    for (const disposable of editorHeightSyncDisposablesRef.current) {
      try {
        if (typeof disposable === 'function')
          disposable()
        else
          disposable?.dispose?.()
      }
      catch {}
    }
    editorHeightSyncDisposablesRef.current = []
    diffDomHeightObserverRef.current?.disconnect()
    diffDomHeightObserverRef.current = null
  }, [])

  const bindDiffEditorHeightSync = useCallback(() => {
    clearEditorHeightSyncBindings()
    const helpers = helpersRef.current
    const host = editorHostRef.current
    if (!helpers || !host || editorKindRef.current !== 'diff')
      return

    const syncHeight = () => scheduleEditorHeightSync(expandedRef.current)
    const bind = (source: any, eventName: string) => {
      try {
        const subscribe = source?.[eventName]
        if (typeof subscribe !== 'function')
          return
        const disposable = subscribe.call(source, syncHeight)
        if (disposable)
          editorHeightSyncDisposablesRef.current.push(disposable)
      }
      catch {}
    }

    const diffEditor = helpers.getDiffEditorView?.()
    const originalEditor = diffEditor?.getOriginalEditor?.()
    const modifiedEditor = diffEditor?.getModifiedEditor?.()
    bind(diffEditor, 'onDidUpdateDiff')
    bind(originalEditor, 'onDidContentSizeChange')
    bind(modifiedEditor, 'onDidContentSizeChange')
    bind(originalEditor, 'onDidLayoutChange')
    bind(modifiedEditor, 'onDidLayoutChange')

    if (typeof window !== 'undefined' && typeof window.MutationObserver === 'function') {
      const observer = new window.MutationObserver((records) => {
        if (!records.some(record =>
          record.type === 'childList'
          || (record.type === 'attributes' && record.target !== host),
        )) {
          return
        }
        syncHeight()
      })
      observer.observe(host, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      })
      diffDomHeightObserverRef.current = observer
    }
  }, [clearEditorHeightSyncBindings, scheduleEditorHeightSync])

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
    clearEditorHeightSyncBindings()
    createEditorPromiseRef.current = null
    editorKindRef.current = null
    editorMountElRef.current = null
    editorRevealFloorRef.current = null
    setEditorReady(false)
    setEditorCreated(false)
  }, [clearEditorHeightSyncBindings])

  const syncEditorCssVars = useCallback(() => {
    const editorEl = editorHostRef.current
    const rootEl = containerRef.current
    if (!editorEl || !rootEl)
      return

    rootEl.style.removeProperty('--vscode-editor-foreground')
    rootEl.style.removeProperty('--vscode-editor-background')
    rootEl.style.removeProperty('--vscode-editor-selectionBackground')
    const configuredTabSize = readPositiveNumber(resolvedOptions.tabSize) ?? 4
    const configuredPadding = readEditorPadding(resolvedOptions.padding, node.diff ? 0 : 8)
    editorEl.style.setProperty('--diffs-tab-size', String(configuredTabSize))
    if (typeof resolvedOptions.padding === 'number' && Number.isFinite(resolvedOptions.padding) && resolvedOptions.padding >= 0)
      editorEl.style.setProperty('--diffs-gap-block', `${configuredPadding.top}px`)
    else
      editorEl.style.removeProperty('--diffs-gap-block')
    if (node.diff) {
      editorEl.style.removeProperty('--vscode-editor-foreground')
      editorEl.style.removeProperty('--vscode-editor-background')
      editorEl.style.removeProperty('--vscode-editor-selectionBackground')
      return
    }
    const src = (editorEl.querySelector('.stream-diffs-shell') as HTMLElement | null) ?? editorEl
    try {
      const styles = typeof window !== 'undefined' && window.getComputedStyle
        ? window.getComputedStyle(src)
        : null
      const fg = String(styles?.getPropertyValue('--vscode-editor-foreground') ?? '').trim()
        || String((styles as any)?.color ?? '').trim()
      const themeBg = String(styles?.getPropertyValue('--vscode-editor-background') ?? '').trim()
      const computedBg = String((styles as any)?.backgroundColor ?? '').trim()
      const bg = !isTransparentColor(themeBg)
        ? themeBg
        : (!isTransparentColor(computedBg) ? computedBg : '')
      const sel = String(styles?.getPropertyValue('--vscode-editor-selectionBackground') ?? '').trim()
      const isPlainTextLanguage = resolveLanguageId(String(node.language || codeLanguage || detectedLanguage || 'plaintext')) === 'plaintext'
      if (shouldPreferPlainTextFallbackSurface(bg, fg, isPlainTextLanguage, rootEl.classList.contains('is-dark'))) {
        editorEl.style.removeProperty('--vscode-editor-foreground')
        editorEl.style.removeProperty('--vscode-editor-background')
        editorEl.style.removeProperty('--vscode-editor-selectionBackground')
        return
      }
      if (fg)
        editorEl.style.setProperty('--vscode-editor-foreground', fg)
      else
        editorEl.style.removeProperty('--vscode-editor-foreground')
      if (bg)
        editorEl.style.setProperty('--vscode-editor-background', bg)
      else
        editorEl.style.removeProperty('--vscode-editor-background')
      if (sel)
        editorEl.style.setProperty('--vscode-editor-selectionBackground', sel)
      else
        editorEl.style.removeProperty('--vscode-editor-selectionBackground')
    }
    catch {}
  }, [codeLanguage, detectedLanguage, node.diff, node.language, resolvedOptions])

  const preferredTheme = useMemo(() => {
    if (isDark)
      return darkTheme ?? themes?.[0] ?? 'vitesse-dark'
    return lightTheme ?? themes?.[1] ?? 'vitesse-light'
  }, [darkTheme, isDark, lightTheme, themes])

  const resolveRequestedTheme = useCallback(() => {
    return preferredTheme
  }, [preferredTheme])

  const requestedTheme = useMemo(() => resolveRequestedTheme(), [resolveRequestedTheme])

  const resolvedChromeIsDark = useMemo(
    () => themeLooksDark(requestedTheme, Boolean(isDark)),
    [isDark, requestedTheme],
  )

  const effectiveDiffAppearance = useMemo<'light' | 'dark'>(() => {
    if (!node.diff)
      return resolvedChromeIsDark ? 'dark' : 'light'
    return isDark ? 'dark' : 'light'
  }, [isDark, node.diff, resolvedChromeIsDark])

  const resolvedSurfaceIsDark = useMemo(
    () => (node.diff ? effectiveDiffAppearance === 'dark' : resolvedChromeIsDark),
    [effectiveDiffAppearance, node.diff, resolvedChromeIsDark],
  )
  const resolvedShellIsDark = useMemo(
    () => (node.diff ? effectiveDiffAppearance === 'dark' : Boolean(isDark)),
    [effectiveDiffAppearance, isDark, node.diff],
  )

  const preFallbackMetrics = useMemo(() => {
    const raw = resolvedOptions as Record<string, unknown> | null | undefined
    const resolvedFontSize = readPositiveNumber(raw?.fontSize)
      ?? (configuredFontSizeRemoved ? defaultPreFallbackFontSize : fontSize)
      ?? defaultPreFallbackFontSize
    const resolvedLineHeight = readPositiveNumber(raw?.lineHeight)
      ?? (resolvedFontSize === defaultPreFallbackFontSize
        ? defaultPreFallbackLineHeight
        : Math.max(12, Math.round(resolvedFontSize * 1.5)))
    const fontFamily = typeof raw?.fontFamily === 'string' && raw.fontFamily.trim()
      ? raw.fontFamily.trim()
      : 'Menlo, Monaco, "Courier New", monospace'
    const padding = readEditorPadding(raw?.padding, node.diff ? 0 : 8)
    const tabSize = readPositiveNumber(raw?.tabSize) ?? 4

    return {
      fontFamily,
      fontSize: resolvedFontSize,
      lineHeight: resolvedLineHeight,
      paddingBottom: padding.bottom,
      paddingTop: padding.top,
      tabSize,
    }
  }, [configuredFontSizeRemoved, fontSize, node.diff, resolvedOptions])

  const preFallbackDiffInline = useMemo(() => {
    if (!node.diff)
      return false
    return resolvedOptions.diffStyle === 'unified'
  }, [node.diff, resolvedOptions])

  const preFallbackStyle = useMemo(() => {
    const style: OctaneStyle & Record<string, string | number> = {
      '--markstream-code-padding-left': '62px',
      '--markstream-pre-diff-line-height': `${preFallbackMetrics.lineHeight}px`,
      '--markstream-pre-line-number-top': `${preFallbackMetrics.paddingTop}px`,
      '--markstream-pre-line-number-width': '36px',
      '--markstream-pre-line-number-gap': '0px',
      'fontSize': `${preFallbackMetrics.fontSize}px`,
      'lineHeight': `${preFallbackMetrics.lineHeight}px`,
      'maxHeight': `${getMaxHeightValue()}px`,
      'overflow': 'auto',
      'paddingBottom': `${preFallbackMetrics.paddingBottom}px`,
      'paddingTop': `${preFallbackMetrics.paddingTop}px`,
      'tabSize': preFallbackMetrics.tabSize,
      'whiteSpace': resolvedOptions.overflow === 'scroll' ? 'pre' : 'pre-wrap',
      '--markstream-code-font-family': preFallbackMetrics.fontFamily,
      'fontFamily': preFallbackMetrics.fontFamily,
    }
    return style
  }, [getMaxHeightValue, preFallbackMetrics, resolvedOptions.overflow])

  const buildRuntimeOptions = useCallback(() => {
    const configuredMaxHeight = resolvedOptions.maxHeight
    const nextOptions = {
      ...(resolvedOptions || {}),
      ...(configuredMaxHeight == null ? {} : { MAX_HEIGHT: configuredMaxHeight }),
      themes: themes ? [...themes] : undefined,
      stream: false,
      disableFileHeader: true,
      theme: requestedTheme,
      disableLineNumbers: !resolvedShowLineNumbers,
      fontSize: preFallbackMetrics.fontSize,
      lineHeight: preFallbackMetrics.lineHeight,
      fontFamily: preFallbackMetrics.fontFamily,
      onThemeChange() {
        syncEditorCssVars()
      },
      themeType: isDark ? 'dark' : 'light',
    } as Record<string, any>

    delete nextOptions.maxHeight
    delete nextOptions.padding
    delete nextOptions.tabSize

    const configuredUnsafeCSS = typeof nextOptions.unsafeCSS === 'string'
      ? nextOptions.unsafeCSS
      : ''
    nextOptions.unsafeCSS = [
      '[data-file], [data-diff] { --diffs-min-number-column-width-default: 2ch !important; }',
      configuredUnsafeCSS,
    ].filter(Boolean).join('\n')

    return nextOptions
  }, [isDark, preFallbackMetrics, requestedTheme, resolvedOptions, resolvedShowLineNumbers, syncEditorCssVars, themes])

  const syncRuntimeOptions = useCallback(() => {
    const nextOptions = buildRuntimeOptions()
    const current = runtimeOptionsRef.current
    if (!current) {
      runtimeOptionsRef.current = nextOptions
      return nextOptions
    }

    for (const key of Object.keys(current)) {
      if (!(key in nextOptions))
        delete current[key]
    }
    Object.assign(current, nextOptions)
    return current
  }, [buildRuntimeOptions])

  const installRuntimeHelpers = useCallback((factory: (options: Record<string, any>) => any) => {
    const helpers = factory(syncRuntimeOptions())
    helpersRef.current = helpers
    cleanupRef.current = typeof helpers.safeClean === 'function'
      ? () => helpers.safeClean()
      : (typeof helpers.cleanupEditor === 'function' ? () => helpers.cleanupEditor() : null)
    return helpers
  }, [syncRuntimeOptions])

  const diffStructuralSignature = useMemo(() => JSON.stringify({
    diffStyle: resolvedOptions.diffStyle,
    expandUnchanged: resolvedOptions.expandUnchanged,
    collapsedContextThreshold: resolvedOptions.collapsedContextThreshold,
    hunkSeparators: resolvedOptions.hunkSeparators,
    lineDiffType: resolvedOptions.lineDiffType,
    maxLineDiffLength: resolvedOptions.maxLineDiffLength,
    expansionLineCount: resolvedOptions.expansionLineCount,
    context: (resolvedOptions.parseDiffOptions as Record<string, unknown> | undefined)?.context,
  }), [resolvedOptions])

  useEffect(() => {
    syncRuntimeOptions()
  }, [resolvedOptions, syncRuntimeOptions])

  useEffect(() => {
    return () => {
      editorLifecycleIdRef.current += 1
      cleanupRef.current?.()
      clearEditorHeightSyncBindings()
      cleanupRef.current = null
      createEditorPromiseRef.current = null
      editorKindRef.current = null
      editorMountElRef.current = null
      helpersRef.current = null
      runtimeFactoryRef.current = null
      detectLanguageRef.current = null
      viewportHandleRef.current?.destroy?.()
      viewportHandleRef.current = null
    }
  }, [clearEditorHeightSyncBindings])

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
      syncRuntimeOptions()
      return () => {
        mounted = false
      }
    }
    void (async () => {
      try {
        const mod = await getStreamDiffsRuntime()
        if (!mounted)
          return
        if (!mod) {
          setUseFallback(true)
          return
        }
        const createRuntimeHelpers = (mod as any).createCodeBlockRuntime
        const detectLanguage = (mod as any).detectLanguage
        if (typeof detectLanguage === 'function')
          detectLanguageRef.current = detectLanguage
        if (typeof createRuntimeHelpers !== 'function') {
          setUseFallback(true)
          return
        }
        runtimeFactoryRef.current = createRuntimeHelpers
        installRuntimeHelpers(createRuntimeHelpers)
        setRuntimeReady(true)
      }
      catch {
        if (mounted)
          setUseFallback(true)
      }
    })()
    return () => {
      mounted = false
    }
  }, [installRuntimeHelpers, syncRuntimeOptions])

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
  const shouldUseStreamingPlaintext = useMemo(() => {
    if (!loading)
      return false
    return isLikelyIncompleteLanguageIdentifier(rawLanguage)
  }, [loading, rawLanguage])
  const languageId = useMemo(
    () => shouldUseStreamingPlaintext ? 'plaintext' : resolveLanguageId(canonicalLanguage),
    [canonicalLanguage, shouldUseStreamingPlaintext],
  )
  const isPlainTextLanguage = useMemo(() => languageId === 'plaintext', [languageId])
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
      style.color = 'var(--markstream-code-fallback-fg, var(--code-fg))'
      style.backgroundColor = 'var(--markstream-code-fallback-bg, var(--code-bg, #fff))'
      style.borderColor = resolvedShellIsDark ? 'rgb(55 65 81 / 0.3)' : 'rgb(229 231 235)'
    }
    return style
  }, [maxWidth, minWidth, node.diff, resolvedShellIsDark])

  const headerStyle = useMemo<OctaneStyle | undefined>(() => {
    if (node.diff)
      return undefined
    return {
      color: 'var(--markstream-code-fallback-fg, var(--code-fg))',
      backgroundColor: 'var(--markstream-code-fallback-bg, var(--code-bg, #fff))',
    }
  }, [node.diff])

  const hasStreamingCode = useMemo(() => {
    return node.code.length > 0
      || (node.originalCode?.length ?? 0) > 0
      || (node.updatedCode?.length ?? 0) > 0
  }, [node.code, node.originalCode, node.updatedCode])
  const shouldDelayEditor = (stream === false && loading)
    || (stream !== false && loading && !hasStreamingCode)

  // Vue parity: keep theme in sync without recreating the code-block surface.
  useEffect(() => {
    if (useFallback)
      return
    if (!runtimeReady)
      return
    if (!editorCreated || !viewportReady)
      return
    const helpers = helpersRef.current
    syncRuntimeOptions()
    const syncPresentation = () => {
      if (node.diff)
        helpers?.refreshDiffPresentation?.()
      syncEditorCssVars()
      if (collapsed)
        return
      const raf = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame(() => scheduleEditorHeightSync(expanded))
        : null
      if (raf == null)
        scheduleEditorHeightSync(expanded)
    }
    if (!helpers?.setTheme || !requestedTheme) {
      syncPresentation()
      return
    }
    void Promise.resolve(helpers.setTheme(requestedTheme))
      .then(syncPresentation)
      .catch(() => {})
  }, [
    collapsed,
    editorCreated,
    effectiveDiffAppearance,
    expanded,
    runtimeReady,
    node.diff,
    requestedTheme,
    scheduleEditorHeightSync,
    syncEditorCssVars,
    syncRuntimeOptions,
    useFallback,
    viewportReady,
  ])

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

    syncRuntimeOptions()

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

        const lang = languageId
        if (currentNode.diff) {
          if (typeof helpers.createDiffEditor === 'function') {
            editorKindRef.current = 'diff'
            await helpers.createDiffEditor(
              el,
              getDisplayCode(currentNode.originalCode),
              getDisplayCode(currentNode.updatedCode),
              lang,
            )
          }
          else {
            editorKindRef.current = 'single'
            await helpers.createEditor(el, getDisplayCode(currentNode.updatedCode ?? currentNode.code), lang)
          }
        }
        else {
          editorKindRef.current = 'single'
          await helpers.createEditor(el, getDisplayCode(currentNode.code), lang)
        }
        editorMountElRef.current = el

        if (editorLifecycleIdRef.current !== creationId)
          return

        const configuredFontSize = Number(resolvedOptions.fontSize)
        const initialFontSize = Number.isFinite(configuredFontSize) && configuredFontSize > 0
          ? configuredFontSize
          : defaultPreFallbackFontSize
        if (Number.isFinite(initialFontSize) && initialFontSize > 0) {
          setDefaultFontSize(initialFontSize)
          setFontSize(initialFontSize)
          try {
            const view = editorKindRef.current === 'diff'
              ? helpers.getDiffEditorView?.()
              : helpers.getEditorView?.()
            const initialLineHeight = readPositiveNumber(resolvedOptions.lineHeight)
              ?? (initialFontSize === defaultPreFallbackFontSize
                ? defaultPreFallbackLineHeight
                : Math.max(12, Math.round(initialFontSize * 1.5)))
            view?.updateOptions?.({ fontSize: initialFontSize, lineHeight: initialLineHeight })
          }
          catch {}
        }

        bindDiffEditorHeightSync()
        syncEditorCssVars()
        prepareEditorReveal()
        applyEditorHeight(expanded)
        await waitForAnimationFrame()
        if (editorLifecycleIdRef.current !== creationId)
          return
        applyEditorHeight(expanded)
        setEditorReady(true)
        scheduleEditorHeightSync(expanded)
      }
      catch {
        if (editorLifecycleIdRef.current === creationId) {
          failedLanguageRef.current = languageId
          setUseFallback(true)
        }
      }
    })()

    const tracked = pending.finally(() => {
      if (createEditorPromiseRef.current === tracked)
        createEditorPromiseRef.current = null
    })
    createEditorPromiseRef.current = tracked
    return tracked
  }, [applyEditorHeight, bindDiffEditorHeightSync, clearEditorHeightSyncBindings, collapsed, expanded, languageId, prepareEditorReveal, resolvedOptions.fontSize, scheduleEditorHeightSync, shouldDelayEditor, syncEditorCssVars, syncRuntimeOptions, useFallback, viewportReady, waitForAnimationFrame])

  useEffect(() => {
    syncRuntimeOptions()
    const optionsChanged = codeBlockOptionsIdentityRef.current !== codeBlockOptions
    codeBlockOptionsIdentityRef.current = codeBlockOptions
    const showLineNumbersChanged = showLineNumbersIdentityRef.current !== resolvedShowLineNumbers
    showLineNumbersIdentityRef.current = resolvedShowLineNumbers
    const previousSignature = structuralSignatureRef.current
    structuralSignatureRef.current = diffStructuralSignature

    if (useFallback)
      return
    if (!runtimeReady)
      return
    let runtimeRecreated = false
    if (optionsChanged || showLineNumbersChanged) {
      const factory = runtimeFactoryRef.current
      if (factory) {
        resetEditorInstance()
        helpersRef.current = null
        cleanupRef.current = null
        try {
          installRuntimeHelpers(factory)
          runtimeRecreated = true
        }
        catch {
          setUseFallback(true)
          return
        }
      }
    }
    const structuralChanged = Boolean(node.diff && previousSignature !== diffStructuralSignature)
    if (!runtimeRecreated && !structuralChanged)
      return
    if (!viewportReady || (!editorCreated && !runtimeRecreated))
      return
    if (collapsed || shouldDelayEditor)
      return

    let cancelled = false
    void (async () => {
      if (!runtimeRecreated)
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
    codeBlockOptions,
    editorCreated,
    resolvedShowLineNumbers,
    ensureEditorCreation,
    installRuntimeHelpers,
    runtimeReady,
    diffStructuralSignature,
    node.diff,
    resetEditorInstance,
    shouldDelayEditor,
    syncRuntimeOptions,
    useFallback,
    viewportReady,
  ])

  useEffect(() => {
    if (useFallback) {
      const failedLanguage = failedLanguageRef.current
      if (failedLanguage === undefined || failedLanguage === languageId)
        return
      failedLanguageRef.current = undefined
      resetEditorInstance()
      setUseFallback(false)
      return
    }
    if (!runtimeReady)
      return
    if (!viewportReady)
      return
    if (collapsed || shouldDelayEditor) {
      resetEditorInstance()
      return
    }
    void ensureEditorCreation()
  }, [collapsed, ensureEditorCreation, languageId, runtimeReady, resetEditorInstance, shouldDelayEditor, useFallback, viewportReady])

  useEffect(() => {
    if (useFallback)
      return
    if (!runtimeReady)
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

    const newCode = getDisplayCode(node.diff ? (node.updatedCode ?? node.code) : node.code)
    const run = async () => {
      let langToken = normalizeLanguageIdentifier(node.language) || codeLanguage
      if (!langToken && detectLanguageRef.current) {
        try {
          langToken = normalizeLanguageIdentifier(detectLanguageRef.current(newCode))
          if (langToken)
            setCodeLanguage(langToken)
        }
        catch {}
      }
      const lang = shouldUseStreamingPlaintext
        ? 'plaintext'
        : resolveLanguageId(langToken || canonicalLanguage)

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
          await Promise.resolve(helpers.updateDiff(getDisplayCode(node.originalCode), getDisplayCode(node.updatedCode), lang))
        }
        else if (helpers.updateCode) {
          await Promise.resolve(helpers.updateCode(newCode, lang))
        }
      }
      catch {}

      scheduleEditorHeightSync(expanded)
    }
    void run()
  }, [
    canonicalLanguage,
    codeLanguage,
    collapsed,
    editorCreated,
    ensureEditorCreation,
    expanded,
    runtimeReady,
    node.code,
    node.diff,
    node.language,
    node.originalCode,
    node.updatedCode,
    scheduleEditorHeightSync,
    shouldUseStreamingPlaintext,
    shouldDelayEditor,
    useFallback,
    viewportReady,
  ])

  // 2.0: finalize the stream-diffs controller once streaming completes so the
  // highlighted pierre/Shiki surface replaces the streaming plain-text view.
  // Streaming updates run in the effect above; React runs effects in
  // declaration order, so when `loading` flips to false the last updateCode
  // append has already been applied synchronously before this effect fires.
  // finalizeCode()/finalizeDiff() are idempotent (they early-return when the
  // controller is already finalized), so repeat calls are safe.
  useEffect(() => {
    if (loading)
      return
    if (!runtimeReady || !viewportReady || collapsed || useFallback)
      return
    const helpers = helpersRef.current
    if (!helpers)
      return
    const finalize = async () => {
      try {
        if (node.diff && helpers.finalizeDiff) {
          await Promise.resolve(helpers.finalizeDiff())
        }
        else if (helpers.finalizeCode) {
          await Promise.resolve(helpers.finalizeCode())
        }
      }
      catch {}
      scheduleEditorHeightSync(expanded)
    }
    void finalize()
  }, [collapsed, expanded, loading, node.diff, runtimeReady, scheduleEditorHeightSync, useFallback, viewportReady])

  useEffect(() => {
    if (useFallback)
      return
    if (!runtimeReady)
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
      ? window.requestAnimationFrame(() => scheduleEditorHeightSync(expanded))
      : null
    if (raf == null)
      scheduleEditorHeightSync(expanded)
    return () => {
      if (raf != null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function')
        window.cancelAnimationFrame(raf)
    }
  }, [collapsed, expanded, loading, runtimeReady, scheduleEditorHeightSync, shouldDelayEditor, useFallback, viewportReady])

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
    scheduleEditorHeightSync(expanded)
  }, [enableFontSizeControl, expanded, fontSize, node.diff, scheduleEditorHeightSync, useFallback])

  useEffect(() => {
    if (!tooltipsEnabled)
      hideTooltip(true)
  }, [tooltipsEnabled])

  const onBtnHover = useCallback((event: MouseEvent | FocusEvent, text: string) => {
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
    const code = String(resolvedCode)
    try {
      if (props.clipboardWriter)
        await props.clipboardWriter(code)
      else if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function')
        await navigator.clipboard.writeText(code)
      setCopied(true)
      props.onCopy?.(code)
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

  return (
    <div
      ref={containerRef}
      className={[
        'code-block-container my-4 rounded-lg border overflow-hidden shadow-sm',
        resolvedShellIsDark ? 'border-gray-700/30' : 'border-gray-200',
        loading ? 'is-rendering' : '',
        resolvedShellIsDark ? 'is-dark' : '',
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
            ? (
                <PreCodeNode
                  className="code-fallback-plain m-0"
                  diffInline={preFallbackDiffInline}
                  node={node}
                  showLineNumbers={resolvedShowLineNumbers}
                  style={preFallbackStyle}
                />
              )
            : (
                <EditorLayer
                  editorHostRef={editorHostRef}
                  editorReady={editorReady}
                  node={node}
                  preFallbackDiffInline={preFallbackDiffInline}
                  preFallbackStyle={preFallbackStyle}
                  showLineNumbers={resolvedShowLineNumbers}
                  stream={stream}
                />
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
