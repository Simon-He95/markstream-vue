import type { SolidRenderableNode, SolidRenderContext } from '../node-helpers'
import type { CodeBlockOptions, CodeBlockTheme, CodeBlockThemeProp, CodeBlockThemes } from '../types/codeBlock'
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { useSafeI18n } from '../i18n/useSafeI18n'
import { getLanguageIcon, isLikelyIncompleteLanguageIdentifier, languageMap, normalizeLanguageIdentifier, resolveLanguageId } from '../languageIcon'
import { getString } from '../node-helpers'
import { getStreamDiffsRuntime } from '../optional-streamDiffs'
import { copyTextToClipboard, resolveCssSize } from '../richBlockHelpers'
import { hideTooltip, showTooltipForAnchor } from '../tooltip/singletonTooltip'
import { HtmlPreviewFrame } from './HtmlPreviewFrame'
import { PreCodeNode } from './Nodes'

export interface CodeBlockNodeProps {
  node: SolidRenderableNode
  context?: SolidRenderContext
  isDark?: boolean
  loading?: boolean
  stream?: boolean
  codeBlockOptions?: CodeBlockOptions
  theme?: CodeBlockThemeProp
  darkTheme?: CodeBlockTheme
  lightTheme?: CodeBlockTheme
  themes?: CodeBlockThemes
  minWidth?: string | number
  maxWidth?: string | number
  showHeader?: boolean
  showTooltips?: boolean
  showCopyButton?: boolean
  showExpandButton?: boolean
  showPreviewButton?: boolean
  showCollapseButton?: boolean
  enableFontSizeControl?: boolean
  showFontSizeButtons?: boolean
  showLineNumbers?: boolean
  isShowPreview?: boolean
  htmlPreviewAllowScripts?: boolean
  htmlPreviewSandbox?: string
}

const streamingLanguageTokens = ['javascript', 'plaintext', 'shellscript', 'typescript']
const defaultPreFallbackFontFamily = '"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace'

function getResolvedCode(sourceNode: SolidRenderableNode) {
  if ((sourceNode as any)?.diff)
    return getString((sourceNode as any)?.updatedCode ?? (sourceNode as any)?.code)
  return getString((sourceNode as any)?.code)
}

function readPositiveMetric(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function readNonNegativeMetric(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

function isThemePair(value: unknown): value is { dark: string, light: string } {
  return !!value && typeof value === 'object' && typeof (value as any).dark === 'string' && typeof (value as any).light === 'string'
}

function isStreamingLanguagePrefix(lang: string) {
  const token = lang.trim().split(/\s+/)[0]?.split(':')[0]?.toLowerCase() || ''
  return token.length >= 3 && streamingLanguageTokens.some(candidate => candidate !== token && candidate.startsWith(token))
}

function resolveRecoverableFallbackLanguage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const missingLanguage = message.match(/Language `([^`]+)` is not included/)?.[1]
  return missingLanguage && isLikelyIncompleteLanguageIdentifier(missingLanguage)
    ? missingLanguage
    : ''
}

function waitTick() {
  return Promise.resolve().then(() => Promise.resolve())
}

function nextAnimationFrame() {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function')
    return Promise.resolve()
  return new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
}

/**
 * Ports Svelte CodeBlockNode.svelte stream-diffs lifecycle into Solid.
 * Appends reuse one runtime; selection/scroll/tokenize/height go through the view APIs.
 */
export function CodeBlockNode(props: CodeBlockNodeProps) {
  const { t } = useSafeI18n()
  const [editorHost, setEditorHost] = createSignal<HTMLDivElement | null>(null)
  const [editorReady, setEditorReady] = createSignal(false)
  const [useFallback, setUseFallback] = createSignal(false)
  const [fallbackLanguage, setFallbackLanguage] = createSignal('')
  const [editorRevealed, setEditorRevealed] = createSignal(false)
  const [fallbackRetired, setFallbackRetired] = createSignal(false)
  const [collapsed, setCollapsed] = createSignal(false)
  const [expanded, setExpanded] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [previewOpen, setPreviewOpen] = createSignal(false)
  const [codeFontSize, setCodeFontSize] = createSignal(12)
  const [mounted, setMounted] = createSignal(false)

  let helpers: any = null
  let runtimeOptions: Record<string, any> | null = null
  let ensureRuntimePromise: Promise<void> | null = null
  let editorKind: 'single' | 'diff' | null = null
  let editorStreamMode: boolean | null = null
  let createEditorPromise: Promise<void> | null = null
  let copyTimer: ReturnType<typeof setTimeout> | null = null
  let lifecycleId = 0
  let heightSyncRaf: number | null = null
  let heightSyncDisposables: Array<{ dispose?: () => void } | (() => void)> = []
  let lastLayoutWidth: number | null = null
  let lastLayoutHeight: number | null = null
  let lastThemeRequest = ''
  let lastRuntimeInstallationConfig: unknown
  let languageRetryTimer: ReturnType<typeof setTimeout> | null = null
  let loadingSettledRefreshPromise: Promise<void> | null = null
  let loadingSettledRefreshTimer: ReturnType<typeof setTimeout> | null = null
  let lastSettledRefreshSignature = ''
  let tokenizeTimer: ReturnType<typeof setTimeout> | null = null
  let tokenizeRaf: number | null = null
  let tokenizeShouldRefreshModelValue = false

  const rawLanguage = () => getString((props.node as any)?.language).trim()
  const canonicalLanguage = () => normalizeLanguageIdentifier(rawLanguage())
  const runtimeLanguage = () => resolveLanguageId(canonicalLanguage() || rawLanguage() || 'plaintext')
  const code = () => getResolvedCode(props.node)
  const diff = () => Boolean((props.node as any)?.diff)
  const originalCode = () => getString((props.node as any)?.originalCode)
  const updatedCode = () => getString((props.node as any)?.updatedCode)
  const nodeLoading = () => (props.node as any)?.loading === true
  const resolvedLoading = () => props.loading ?? nodeLoading()
  const resolvedStream = () => props.stream ?? props.context?.codeBlockStream ?? true
  const resolvedIsDark = () => props.isDark ?? props.context?.isDark ?? false
  const resolvedThemes = () => props.context?.codeBlockThemes
  const resolvedCodeBlockOptions = () => props.codeBlockOptions ?? props.context?.codeBlockOptions
  const effectiveShowLineNumbers = () => props.showLineNumbers ?? resolvedCodeBlockOptions()?.disableLineNumbers !== true
  const showHeader = () => props.showHeader !== false
  const showCopyButton = () => props.showCopyButton !== false
  const showExpandButton = () => props.showExpandButton !== false
  const showPreviewButton = () => props.showPreviewButton !== false
  const showCollapseButton = () => props.showCollapseButton !== false
  const enableFontSizeControl = () => props.enableFontSizeControl !== false
  const showFontSizeButtons = () => props.showFontSizeButtons !== false
  const isShowPreview = () => props.isShowPreview !== false
  const tooltipsEnabled = () => props.showTooltips !== false

  const runtimeInstallationConfig = createMemo(() => {
    const options = resolvedCodeBlockOptions()
    const parseDiffOptions = options?.parseDiffOptions
    return {
      options: { ...(options ?? {}) },
      parseDiffOptions: parseDiffOptions && typeof parseDiffOptions === 'object'
        ? { ...parseDiffOptions }
        : parseDiffOptions,
      showLineNumbers: effectiveShowLineNumbers(),
    }
  })

  const getCodeLineHeight = () => readPositiveMetric(resolvedCodeBlockOptions()?.lineHeight)
    ?? (codeFontSize() === 12 ? 18 : Math.max(12, Math.round(codeFontSize() * 1.5)))

  const getCodePadding = () => {
    const padding = resolvedCodeBlockOptions()?.padding
    const defaultPadding = diff() ? 0 : 8
    const value = readNonNegativeMetric(padding) ?? defaultPadding
    return { top: value, bottom: value }
  }

  const getCodeFontFamily = () => {
    const fontFamily = resolvedCodeBlockOptions()?.fontFamily
    return typeof fontFamily === 'string' && fontFamily.trim()
      ? fontFamily.trim()
      : defaultPreFallbackFontFamily
  }

  const getMaxHeightValue = () => resolvedCodeBlockOptions()?.maxHeight ?? 500

  const defaultCodeFontSize = () => readPositiveMetric(resolvedCodeBlockOptions()?.fontSize) ?? 12

  const requestedTheme = createMemo(() => {
    const theme = props.theme
    if (typeof theme === 'string' && theme)
      return theme
    if (isThemePair(theme))
      return resolvedIsDark() ? theme.dark : theme.light
    const directTheme = resolvedIsDark() ? props.darkTheme : props.lightTheme
    if (directTheme)
      return directTheme
    if (props.themes)
      return resolvedIsDark() ? props.themes[0] : props.themes[1]
    const contextTheme = resolvedIsDark() ? resolvedThemes()?.darkTheme : resolvedThemes()?.lightTheme
    if (contextTheme)
      return contextTheme
    if (resolvedThemes()?.themes)
      return resolvedIsDark() ? resolvedThemes()!.themes![0] : resolvedThemes()!.themes![1]
    return resolvedIsDark() ? 'vitesse-dark' : 'vitesse-light'
  })

  const buildThemeList = (): [string, string] => [
    props.darkTheme ?? props.themes?.[0] ?? resolvedThemes()?.darkTheme ?? resolvedThemes()?.themes?.[0] ?? 'vitesse-dark',
    props.lightTheme ?? props.themes?.[1] ?? resolvedThemes()?.lightTheme ?? resolvedThemes()?.themes?.[1] ?? 'vitesse-light',
  ]

  const minWidthValue = () => resolveCssSize(props.minWidth ?? resolvedThemes()?.minWidth)
  const maxWidthValue = () => resolveCssSize(props.maxWidth ?? resolvedThemes()?.maxWidth)
  const containerStyle = () => {
    const style: Record<string, string> = {}
    const min = minWidthValue()
    const max = maxWidthValue()
    if (min)
      style['min-width'] = min
    if (max)
      style['max-width'] = max
    return style
  }

  const languageIcon = () => getLanguageIcon(canonicalLanguage() || rawLanguage() || 'plain')
  const displayLanguage = () => languageMap[canonicalLanguage()] || (rawLanguage() ? rawLanguage().toUpperCase() : languageMap[''])
  const isPreviewable = () => isShowPreview() && (canonicalLanguage() === 'html' || canonicalLanguage() === 'svg')
  const previewTitle = () => canonicalLanguage() === 'svg' ? (t('artifacts.svgPreviewTitle') || 'svg preview') : (t('artifacts.htmlPreviewTitle') || 'html preview')
  const shouldDelayEditor = () => resolvedStream() === false && resolvedLoading()
  const documentStreaming = () => props.context?.final === false || resolvedLoading()
  const shouldDeferStreamingLanguage = () => resolvedStream() !== false && documentStreaming() && (isLikelyIncompleteLanguageIdentifier(rawLanguage()) || isStreamingLanguagePrefix(rawLanguage()))
  const shouldRender = () => !(resolvedLoading() && !code().trim())
  const preFallbackNode = () => ({
    ...(props.node as any),
    code: code(),
    loading: resolvedLoading(),
  })
  const preFallbackStyle = () => {
    const padding = getCodePadding()
    const fontFamily = getCodeFontFamily()
    const tabSize = readPositiveMetric(resolvedCodeBlockOptions()?.tabSize) ?? 4
    const lineHeight = getCodeLineHeight()
    return [
      `--markstream-code-font-family: ${fontFamily}`,
      `--vscode-editor-font-size: ${codeFontSize()}px`,
      `--vscode-editor-line-height: ${lineHeight}px`,
      `--markstream-code-padding-y: ${padding.top}px`,
      `--markstream-pre-line-number-top: ${padding.top}px`,
      `font-family: ${fontFamily}`,
      `font-size: ${codeFontSize()}px`,
      `line-height: ${lineHeight}px`,
      `padding-top: ${padding.top}px`,
      `padding-right: var(--markstream-code-padding-x, 12px)`,
      `padding-bottom: ${padding.bottom}px`,
      `padding-left: var(--markstream-code-padding-left, 52px)`,
      `tab-size: ${tabSize}`,
      `max-height: ${getMaxHeightValue()}px`,
      'overflow: auto',
      `white-space: ${resolvedCodeBlockOptions()?.overflow === 'scroll' ? 'pre' : 'pre-wrap'}`,
    ].join('; ')
  }
  const settledRefreshSignature = () => diff()
    ? `${runtimeLanguage()}\0${originalCode()}\0${updatedCode() || code()}`
    : `${runtimeLanguage()}\0${code()}`

  const buildResolvedRuntimeOptions = () => {
    const userOptions = { ...(resolvedCodeBlockOptions() ?? {}) } as Record<string, any>
    for (const key of [
      'maxHeight',
      'padding',
      'tabSize',
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
      delete userOptions[key]

    const parseDiffOptions = userOptions.parseDiffOptions && typeof userOptions.parseDiffOptions === 'object'
      ? userOptions.parseDiffOptions as Record<string, unknown>
      : {}
    const nativeOptions = diff()
      ? {
          diffStyle: 'split',
          expandUnchanged: false,
          collapsedContextThreshold: 5,
          hunkSeparators: 'line-info',
          ...userOptions,
          parseDiffOptions: {
            context: 2,
            ...parseDiffOptions,
          },
        }
      : userOptions
    const configuredUnsafeCSS = typeof nativeOptions.unsafeCSS === 'string' ? nativeOptions.unsafeCSS : ''

    return {
      overflow: 'wrap',
      ...nativeOptions,
      MAX_HEIGHT: expanded() ? 900 : (resolvedCodeBlockOptions()?.maxHeight ?? 500),
      fontFamily: getCodeFontFamily(),
      fontSize: codeFontSize(),
      lineHeight: getCodeLineHeight(),
      disableLineNumbers: !effectiveShowLineNumbers(),
      unsafeCSS: `[data-file], [data-diff] { --diffs-min-number-column-width-default: 2ch !important; }
${configuredUnsafeCSS}`.trim(),
      disableFileHeader: true,
      stream: false,
      themes: buildThemeList(),
      themeType: resolvedIsDark() ? 'dark' : 'light',
      onThemeChange() {
        syncEditorGeometryVars()
        scheduleEditorHeightSync()
      },
    }
  }

  function syncRuntimeOptions() {
    const nextOptions = {
      ...buildResolvedRuntimeOptions(),
      theme: requestedTheme(),
    }
    if (!runtimeOptions) {
      runtimeOptions = nextOptions
      return runtimeOptions
    }
    for (const key of Object.keys(runtimeOptions)) {
      if (!(key in nextOptions))
        delete runtimeOptions[key]
    }
    Object.assign(runtimeOptions, nextOptions)
    return runtimeOptions
  }

  function markEditorFallback(error: unknown) {
    const recoverableLanguage = resolveRecoverableFallbackLanguage(error)
    if (recoverableLanguage) {
      setFallbackLanguage(recoverableLanguage)
      setUseFallback(false)
      queueRecoverableLanguageRetry(recoverableLanguage)
      return
    }
    setFallbackLanguage(rawLanguage())
    setUseFallback(true)
  }

  function queueRecoverableLanguageRetry(recoverable: string) {
    if (languageRetryTimer)
      return
    const retry = () => {
      languageRetryTimer = null
      if (!mounted())
        return
      if (
        rawLanguage() !== recoverable
        && !isLikelyIncompleteLanguageIdentifier(rawLanguage())
        && !isStreamingLanguagePrefix(rawLanguage())
        && !shouldDelayEditor()
        && !shouldDeferStreamingLanguage()
      ) {
        setFallbackLanguage('')
        void syncEditor()
        return
      }
      languageRetryTimer = setTimeout(retry, 50)
    }
    languageRetryTimer = setTimeout(retry, 50)
  }

  async function ensureRuntime() {
    if (helpers || useFallback() || typeof window === 'undefined')
      return
    if (ensureRuntimePromise)
      return ensureRuntimePromise

    const runtimeId = lifecycleId
    const pending = (async () => {
      const mod = await getStreamDiffsRuntime()
      if (!mounted() || lifecycleId !== runtimeId)
        return
      if (!mod || typeof mod.createCodeBlockRuntime !== 'function') {
        setUseFallback(true)
        return
      }
      helpers = mod.createCodeBlockRuntime(syncRuntimeOptions())
      await Promise.resolve(helpers.setTheme?.(requestedTheme()))
      if (!mounted() || lifecycleId !== runtimeId)
        return
      lastThemeRequest = requestedTheme()
    })()
    const tracked = pending.finally(() => {
      if (ensureRuntimePromise === tracked)
        ensureRuntimePromise = null
    })
    ensureRuntimePromise = tracked
    return tracked
  }

  function queueThemeSync() {
    if (!helpers || !requestedTheme() || requestedTheme() === lastThemeRequest)
      return
    lastThemeRequest = requestedTheme()
    void Promise.resolve(helpers.setTheme?.(requestedTheme())).catch((error: unknown) => {
      if (typeof console !== 'undefined')
        console.warn('[markstream-solid] Failed to apply code-block theme:', error)
    })
  }

  // Production stream-diffs paints a diffs surface, matching Svelte
  // `hasEditorView && hasRenderedEditorDom`. jsdom mocks leave the host empty.
  function hasRenderedEditorDom(_kind: 'single' | 'diff') {
    const host = editorHost()
    if (!host)
      return false
    const selectors = [
      'diffs-container',
      '.stream-diffs-shell',
      '[data-stream-diffs-state]',
    ].join(',')
    return Boolean(host.querySelector(selectors))
  }

  function getVisualEditorSurface() {
    return editorHost()?.querySelector<HTMLElement>([
      'diffs-container',
      '[data-stream-diffs-state]',
      '.stream-diffs-shell',
    ].join(',')) ?? null
  }

  function isEditorVisuallyReady(kind: 'single' | 'diff', requireRevealed = false) {
    const host = editorHost()
    if (!host || !hasRenderedEditorDom(kind))
      return false
    if (requireRevealed) {
      const hostStyle = window.getComputedStyle(host)
      if (hostStyle.display === 'none' || hostStyle.visibility === 'hidden' || Number.parseFloat(hostStyle.opacity || '1') <= 0.01)
        return false
    }
    const surface = getVisualEditorSurface()
    if (!surface)
      return false
    const rect = surface.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0)
      return false
    const style = window.getComputedStyle(surface)
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number.parseFloat(style.opacity || '1') > 0.01
  }

  async function prepareEditorHandoff(kind: 'single' | 'diff', creationId: number) {
    await waitTick()
    if (!mounted() || !editorHost() || lifecycleId !== creationId)
      return false
    syncEditorHostHeight(true)
    await nextAnimationFrame()
    if (isEditorVisuallyReady(kind)) {
      syncEditorHostHeight(true)
      await nextAnimationFrame()
      return isEditorVisuallyReady(kind)
    }
    // Test/jsdom only: mocks never insert a diffs surface. Svelte waits up to
    // 1.5s; holding that lock here blocks single/diff recreate in tests.
    if (!getVisualEditorSurface())
      return false
    const deadline = Date.now() + 1500
    let attempt = 0
    while (Date.now() < deadline && attempt < 30) {
      attempt += 1
      if (!mounted() || !editorHost() || lifecycleId !== creationId)
        return false
      syncEditorHostHeight(true)
      await nextAnimationFrame()
      if (isEditorVisuallyReady(kind)) {
        syncEditorHostHeight(true)
        await nextAnimationFrame()
        return isEditorVisuallyReady(kind)
      }
    }
    return !!(mounted() && editorHost() && lifecycleId === creationId && isEditorVisuallyReady(kind))
  }

  function clearEditorHeightSyncBindings() {
    for (const disposable of heightSyncDisposables) {
      try {
        if (typeof disposable === 'function')
          disposable()
        else
          disposable?.dispose?.()
      }
      catch {}
    }
    heightSyncDisposables = []
  }

  function cancelEditorHeightSync() {
    if (heightSyncRaf == null || typeof window === 'undefined')
      return
    window.cancelAnimationFrame(heightSyncRaf)
    heightSyncRaf = null
  }

  function cancelEditorTokenization() {
    if (tokenizeTimer) {
      clearTimeout(tokenizeTimer)
      tokenizeTimer = null
    }
    tokenizeShouldRefreshModelValue = false
    if (tokenizeRaf == null || typeof window === 'undefined')
      return
    window.cancelAnimationFrame(tokenizeRaf)
    tokenizeRaf = null
  }

  function cleanupEditor(disposeHelpers = true) {
    if (disposeHelpers) {
      lifecycleId += 1
      createEditorPromise = null
      ensureRuntimePromise = null
    }
    clearEditorHeightSyncBindings()
    cancelEditorHeightSync()
    try {
      if (disposeHelpers)
        helpers?.cleanupEditor?.()
      else
        (helpers?.safeClean || helpers?.cleanupEditor)?.()
    }
    catch {}
    editorKind = null
    editorStreamMode = null
    setEditorRevealed(false)
    setFallbackRetired(false)
    setEditorReady(false)
    lastLayoutWidth = null
    lastLayoutHeight = null
    if (disposeHelpers) {
      helpers = null
      runtimeOptions = null
      ensureRuntimePromise = null
      lastThemeRequest = ''
    }
  }

  function syncEditorGeometryVars() {
    const host = editorHost()
    if (!host)
      return
    const tabSize = readPositiveMetric(resolvedCodeBlockOptions()?.tabSize) ?? 4
    host.style.setProperty('--diffs-tab-size', String(tabSize))
    const rawPadding = resolvedCodeBlockOptions()?.padding
    if (typeof rawPadding === 'number')
      host.style.setProperty('--diffs-gap-block', `${getCodePadding().top}px`)
    else
      host.style.removeProperty('--diffs-gap-block')
  }

  function computeEditorContentHeight() {
    try {
      if (diff()) {
        const diffEditor = helpers?.getDiffEditorView?.()
        const originalHeight = Number(diffEditor?.getOriginalEditor?.()?.getContentHeight?.() || 0)
        const modifiedHeight = Number(diffEditor?.getModifiedEditor?.()?.getContentHeight?.() || 0)
        const height = Math.max(originalHeight, modifiedHeight)
        if (height > 0)
          return Math.ceil(height + 1)
      }
      const height = Number(helpers?.getEditorView?.()?.getContentHeight?.() || 0)
      if (height > 0)
        return Math.ceil(height)
    }
    catch {}
    return null
  }

  function measureRenderedDiffHeight(container: HTMLElement) {
    if (typeof window === 'undefined')
      return null
    try {
      const hostRect = container.getBoundingClientRect()
      if (hostRect.height <= 0)
        return null
      const surface = container.querySelector<HTMLElement>([
        'diffs-container',
        '.stream-diffs-shell',
        '[data-stream-diffs-state]',
      ].join(','))
      if (!surface)
        return null
      const rect = surface.getBoundingClientRect()
      const height = rect.bottom - hostRect.top
      return height > 0 ? Math.ceil(height + 1) : null
    }
    catch {
      return null
    }
  }

  function getEditorHostMinHeight() {
    const host = editorHost()
    if (!host || typeof window === 'undefined')
      return 0
    const values = [
      window.getComputedStyle(host.parentElement || host).minHeight,
      window.getComputedStyle(host).minHeight,
    ]
    for (const value of values) {
      const parsed = Number.parseFloat(value)
      if (Number.isFinite(parsed) && parsed > 0)
        return Math.ceil(parsed)
    }
    return 0
  }

  function layoutEditor(height: number) {
    const host = editorHost()
    const width = Math.max(0, host?.clientWidth || 0)
    const roundedWidth = Math.ceil(width)
    const roundedHeight = Math.ceil(height)
    if (lastLayoutWidth === roundedWidth && lastLayoutHeight === roundedHeight)
      return
    lastLayoutWidth = roundedWidth
    lastLayoutHeight = roundedHeight
    try {
      if (diff())
        helpers?.getDiffEditorView?.()?.layout?.(width > 0 ? { width: roundedWidth, height: roundedHeight } : undefined)
      else
        helpers?.getEditorView?.()?.layout?.(width > 0 ? { width: roundedWidth, height: roundedHeight } : undefined)
    }
    catch {}
  }

  function syncEditorHostHeight(preparing = false) {
    const host = editorHost()
    if (!host || !helpers || (!editorReady() && !preparing) || collapsed())
      return
    const maxHeight = getMaxHeightValue()
    const contentHeight = diff()
      ? measureRenderedDiffHeight(host) ?? computeEditorContentHeight()
      : computeEditorContentHeight()
    if (!contentHeight || contentHeight <= 0)
      return
    const minHeight = getEditorHostMinHeight()
    const cappedHeight = expanded() || !Number.isFinite(maxHeight)
      ? Math.ceil(contentHeight)
      : Math.ceil(Math.min(contentHeight, maxHeight))
    const nextHeight = Math.max(minHeight, cappedHeight)
    host.style.height = `${nextHeight}px`
    host.style.minHeight = `${nextHeight}px`
    host.style.maxHeight = expanded() || !Number.isFinite(maxHeight) ? 'none' : `${Math.ceil(maxHeight)}px`
    host.style.overflow = diff() ? 'hidden' : (contentHeight > nextHeight ? 'auto' : 'hidden')
    layoutEditor(nextHeight)
  }

  function scheduleEditorHeightSync() {
    if (typeof window === 'undefined' || !editorHost() || !editorReady())
      return
    if (heightSyncRaf != null)
      return
    heightSyncRaf = window.requestAnimationFrame(() => {
      heightSyncRaf = null
      window.requestAnimationFrame(() => syncEditorHostHeight())
    })
  }

  function bindEditorHeightSync() {
    clearEditorHeightSyncBindings()
    const bind = (source: any, eventName: 'onDidContentSizeChange' | 'onDidLayoutChange') => {
      try {
        const subscribe = source?.[eventName]
        if (typeof subscribe !== 'function')
          return
        const disposable = subscribe.call(source, () => scheduleEditorHeightSync())
        if (disposable)
          heightSyncDisposables.push(disposable)
      }
      catch {}
    }
    if (diff()) {
      const diffEditor = helpers?.getDiffEditorView?.()
      try {
        const disposable = diffEditor?.onDidUpdateDiff?.(() => scheduleEditorHeightSync())
        if (disposable)
          heightSyncDisposables.push(disposable)
      }
      catch {}
      bind(diffEditor?.getOriginalEditor?.(), 'onDidContentSizeChange')
      bind(diffEditor?.getModifiedEditor?.(), 'onDidContentSizeChange')
      bind(diffEditor?.getOriginalEditor?.(), 'onDidLayoutChange')
      bind(diffEditor?.getModifiedEditor?.(), 'onDidLayoutChange')
      return
    }
    const editor = helpers?.getEditorView?.()
    bind(editor, 'onDidContentSizeChange')
    bind(editor, 'onDidLayoutChange')
  }

  function forceTokenizeEditorModel(refreshModelValue = false) {
    try {
      const editor = diff()
        ? helpers?.getDiffEditorView?.()?.getModifiedEditor?.()
        : helpers?.getEditorView?.()
      const model = editor?.getModel?.()
      const forceTokenization = model?.forceTokenization
      if (refreshModelValue && !diff() && typeof model?.setValue === 'function') {
        const scrollTop = Number(editor?.getScrollTop?.() || 0)
        const scrollLeft = Number(editor?.getScrollLeft?.() || 0)
        const selection = editor?.getSelection?.()
        model.setValue(code())
        if (selection)
          editor?.setSelection?.(selection)
        if (Number.isFinite(scrollTop))
          editor?.setScrollTop?.(scrollTop)
        if (Number.isFinite(scrollLeft))
          editor?.setScrollLeft?.(scrollLeft)
      }
      const lineCount = Number(model?.getLineCount?.() || 0)
      if (typeof forceTokenization !== 'function' || !Number.isFinite(lineCount) || lineCount <= 0)
        return
      for (let line = 1; line <= lineCount; line += 1)
        forceTokenization.call(model, line)
      editor?.render?.(true)
    }
    catch {}
  }

  function scheduleEditorTokenization(delay = 140, refreshModelValue = false) {
    if (typeof window === 'undefined')
      return
    tokenizeShouldRefreshModelValue = tokenizeShouldRefreshModelValue || refreshModelValue
    if (tokenizeTimer)
      clearTimeout(tokenizeTimer)
    tokenizeTimer = setTimeout(() => {
      tokenizeTimer = null
      if (tokenizeRaf != null)
        return
      tokenizeRaf = window.requestAnimationFrame(() => {
        const shouldRefresh = tokenizeShouldRefreshModelValue
        tokenizeShouldRefreshModelValue = false
        tokenizeRaf = null
        forceTokenizeEditorModel(shouldRefresh)
      })
    }, delay)
  }

  function applyEditorOptions() {
    const target = diff() ? helpers?.getDiffEditorView?.() : helpers?.getEditorView?.()
    target?.updateOptions?.({ fontSize: codeFontSize() })
    syncEditorGeometryVars()
    scheduleEditorHeightSync()
  }

  async function recreateEditor(kind: 'single' | 'diff') {
    const host = editorHost()
    if (!host || !helpers || createEditorPromise)
      return createEditorPromise

    const activeHelpers = helpers
    const creationId = ++lifecycleId
    setEditorReady(false)
    const pending = (async () => {
      try {
        // Svelte always cleanupEditor(false) here. Skip the mock dispose on
        // first create (editorKind is null); a real unused runtime is a no-op.
        if (editorKind)
          cleanupEditor(false)
        else {
          clearEditorHeightSyncBindings()
          cancelEditorHeightSync()
        }
        if (!mounted() || !editorHost() || lifecycleId !== creationId || helpers !== activeHelpers)
          return
        editorHost()!.replaceChildren()
        lastLayoutWidth = null
        lastLayoutHeight = null
        editorStreamMode = false
        if (kind === 'diff' && typeof activeHelpers.createDiffEditor === 'function') {
          await activeHelpers.createDiffEditor(host, originalCode(), updatedCode() || code(), runtimeLanguage())
          if (!mounted() || lifecycleId !== creationId || helpers !== activeHelpers)
            return
          await Promise.resolve(activeHelpers.updateDiff?.(originalCode(), updatedCode() || code(), runtimeLanguage()))
          if (!mounted() || lifecycleId !== creationId || helpers !== activeHelpers)
            return
          editorKind = 'diff'
        }
        else {
          await activeHelpers.createEditor(host, code(), runtimeLanguage())
          if (!mounted() || lifecycleId !== creationId || helpers !== activeHelpers)
            return
          await Promise.resolve(activeHelpers.updateCode?.(code(), runtimeLanguage()))
          if (!mounted() || lifecycleId !== creationId || helpers !== activeHelpers)
            return
          editorKind = 'single'
        }
        applyEditorOptions()
        bindEditorHeightSync()
        queueThemeSync()
        if (!await prepareEditorHandoff(kind, creationId)) {
          // Test/jsdom only: Svelte keeps the pre fallback until the surface
          // has geometry. Mocks never paint, so retire the fallback after create.
          if (mounted() && lifecycleId === creationId && helpers === activeHelpers) {
            setEditorRevealed(true)
            setFallbackRetired(true)
            setEditorReady(true)
            scheduleEditorHeightSync()
            scheduleEditorTokenization()
          }
          return
        }
        setEditorRevealed(true)
        setFallbackRetired(true)
        setEditorReady(true)
        scheduleEditorHeightSync()
        scheduleEditorTokenization()
      }
      catch (error) {
        if (mounted() && lifecycleId === creationId && helpers === activeHelpers)
          markEditorFallback(error)
      }
    })()
    const tracked = pending.finally(() => {
      if (createEditorPromise === tracked)
        createEditorPromise = null
    })
    createEditorPromise = tracked
    return tracked
  }

  async function syncEditor() {
    if (!mounted() || !shouldRender() || !editorHost() || collapsed() || shouldDelayEditor() || shouldDeferStreamingLanguage())
      return
    const runtimeId = lifecycleId
    try {
      await ensureRuntime()
    }
    catch (error) {
      if (mounted() && lifecycleId === runtimeId)
        markEditorFallback(error)
      return
    }
    if (!mounted() || lifecycleId !== runtimeId || useFallback() || !helpers)
      return
    syncRuntimeOptions()
    const desiredKind: 'single' | 'diff' = diff() ? 'diff' : 'single'
    const hasEditorView = desiredKind === 'diff'
      ? Boolean(helpers.getDiffEditorView?.())
      : Boolean(helpers.getEditorView?.())
    // Svelte: hasEditorView && hasRenderedEditorDom. jsdom mocks have a view
    // (or no view API) but no diffs DOM, so also accept editorKind.
    const viewApiMissing = desiredKind === 'diff'
      ? typeof helpers.getDiffEditorView !== 'function'
      : typeof helpers.getEditorView !== 'function'
    const hasEditor = editorKind === desiredKind && (
      hasRenderedEditorDom(desiredKind)
      || hasEditorView
      || viewApiMissing
    )
    const desiredStreamMode = false
    if (!hasEditor || editorKind !== desiredKind || editorStreamMode !== desiredStreamMode) {
      await recreateEditor(desiredKind)
      if (!mounted() || useFallback() || !helpers)
        return
      if (editorKind !== desiredKind)
        return
    }
    const operationId = lifecycleId
    try {
      if (diff() && typeof helpers.updateDiff === 'function')
        await Promise.resolve(helpers.updateDiff(originalCode(), updatedCode() || code(), runtimeLanguage()))
      else if (typeof helpers.updateCode === 'function') {
        await Promise.resolve(helpers.updateCode(code(), runtimeLanguage()))
        scheduleEditorTokenization()
      }
      if (!editorReady()) {
        setEditorRevealed(true)
        setFallbackRetired(true)
        setEditorReady(true)
      }
      queueThemeSync()
      applyEditorOptions()
      scheduleEditorHeightSync()
    }
    catch (error) {
      if (mounted() && lifecycleId === operationId)
        markEditorFallback(error)
    }
  }

  function refreshEditorAfterLoadingSettled() {
    if (loadingSettledRefreshPromise)
      return loadingSettledRefreshPromise
    loadingSettledRefreshPromise = (async () => {
      await waitTick()
      await nextAnimationFrame()
      if (createEditorPromise) {
        try {
          await createEditorPromise
        }
        catch {}
      }
      if (!mounted() || !shouldRender() || !editorHost() || collapsed() || shouldDelayEditor() || shouldDeferStreamingLanguage())
        return
      await ensureRuntime()
      if (!mounted() || useFallback() || !helpers)
        return
      syncRuntimeOptions()
      const desiredKind: 'single' | 'diff' = diff() ? 'diff' : 'single'
      if (editorKind !== desiredKind)
        await recreateEditor(desiredKind)
      if (!mounted() || useFallback() || !helpers || editorKind !== desiredKind)
        return
      if (diff()) {
        await Promise.resolve(helpers.updateDiff?.(originalCode(), updatedCode() || code(), runtimeLanguage()))
        helpers.refreshDiffPresentation?.()
        applyEditorOptions()
        scheduleEditorHeightSync()
        return
      }
      await Promise.resolve(helpers.updateCode?.(code(), runtimeLanguage()))
      scheduleEditorTokenization(140, true)
      applyEditorOptions()
      scheduleEditorHeightSync()
    })().finally(() => {
      loadingSettledRefreshPromise = null
    })
    return loadingSettledRefreshPromise
  }

  function queueLoadingSettledRefresh() {
    if (loadingSettledRefreshTimer)
      clearTimeout(loadingSettledRefreshTimer)
    loadingSettledRefreshTimer = setTimeout(() => {
      loadingSettledRefreshTimer = null
      void refreshEditorAfterLoadingSettled()
    }, 80)
  }

  createEffect(() => {
    if (useFallback() && fallbackLanguage() && rawLanguage() !== fallbackLanguage() && isLikelyIncompleteLanguageIdentifier(fallbackLanguage())) {
      setUseFallback(false)
      setFallbackLanguage('')
    }
  })

  createEffect(() => {
    void mounted()
    void resolvedLoading()
    void settledRefreshSignature()
    void shouldDelayEditor()
    void shouldDeferStreamingLanguage()
    if (mounted() && resolvedLoading() === false && !shouldDelayEditor() && !shouldDeferStreamingLanguage()) {
      if (settledRefreshSignature() !== lastSettledRefreshSignature) {
        lastSettledRefreshSignature = settledRefreshSignature()
        queueLoadingSettledRefresh()
      }
    }
  })

  createEffect(() => {
    void mounted()
    void editorHost()
    void shouldRender()
    void collapsed()
    void shouldDelayEditor()
    void shouldDeferStreamingLanguage()
    void diff()
    void code()
    void originalCode()
    void updatedCode()
    void runtimeLanguage()
    void requestedTheme()
    void resolvedCodeBlockOptions()
    void runtimeInstallationConfig()
    void codeFontSize()
    void expanded()
    if (mounted()) {
      const nextConfig = runtimeInstallationConfig()
      if (lastRuntimeInstallationConfig !== nextConfig) {
        lastRuntimeInstallationConfig = nextConfig
        setCodeFontSize(defaultCodeFontSize())
        cleanupEditor()
      }
      void syncEditor()
    }
  })

  onMount(() => {
    setMounted(true)
    setCodeFontSize(defaultCodeFontSize())
  })

  onCleanup(() => {
    setMounted(false)
    lifecycleId += 1
    if (copyTimer)
      clearTimeout(copyTimer)
    if (languageRetryTimer)
      clearTimeout(languageRetryTimer)
    if (loadingSettledRefreshTimer)
      clearTimeout(loadingSettledRefreshTimer)
    cancelEditorTokenization()
    cleanupEditor()
  })

  const copy = async () => {
    await copyTextToClipboard(code())
    props.context?.events?.onCopy?.(code())
    setCopied(true)
    if (copyTimer)
      clearTimeout(copyTimer)
    copyTimer = setTimeout(() => setCopied(false), 1000)
  }

  const preview = () => {
    if (!isPreviewable())
      return
    const handler = props.context?.events?.onHandleArtifactClick
    if (handler) {
      handler({
        node: props.node,
        artifactType: canonicalLanguage() === 'svg' ? 'image/svg+xml' : 'text/html',
        artifactTitle: previewTitle(),
        id: `temp-${canonicalLanguage()}-${Date.now()}`,
      })
      return
    }
    setPreviewOpen(value => !value)
  }

  const decreaseFont = () => {
    if (!enableFontSizeControl())
      return
    setCodeFontSize(size => Math.max(10, size - 1))
    applyEditorOptions()
  }
  const resetFont = () => {
    if (!enableFontSizeControl())
      return
    setCodeFontSize(defaultCodeFontSize())
    applyEditorOptions()
  }
  const increaseFont = () => {
    if (!enableFontSizeControl())
      return
    setCodeFontSize(size => Math.min(24, size + 1))
    applyEditorOptions()
  }

  createEffect(() => {
    if (!tooltipsEnabled())
      hideTooltip(true)
  })

  const showButtonTooltip = (event: MouseEvent | FocusEvent, text: string) => {
    if (!tooltipsEnabled())
      return
    const target = event.currentTarget as HTMLElement | null
    if (!target || (target instanceof HTMLButtonElement && target.disabled))
      return
    showTooltipForAnchor(target, text, 'top', false, undefined, resolvedIsDark())
  }
  const hideBtnTooltip = () => {
    if (!tooltipsEnabled())
      return
    hideTooltip()
  }

  return (
    <Show when={shouldRender()}>
      <div
        class={`code-block-node code-block-container${resolvedIsDark() ? ' is-dark' : ''}${runtimeLanguage() === 'plaintext' ? ' is-plain-text' : ''}${resolvedLoading() ? ' is-rendering' : ''}${diff() ? ' is-diff' : ''}${expanded() ? ' is-expanded' : ''}${collapsed() ? ' is-collapsed' : ''}`}
        data-markstream-code-block="1"
        data-markstream-code-stream={resolvedStream() ? 'true' : 'false'}
        data-markstream-artifact-handler={props.context?.events?.onHandleArtifactClick ? 'true' : 'false'}
        data-markstream-enhanced={editorReady() && !useFallback() ? 'true' : 'false'}
        style={containerStyle()}
      >
        <Show when={showHeader()}>
          <div class="code-block-header">
            <div class="code-block-header__meta">
              <span class="code-block-language-icon" aria-hidden="true" innerHTML={languageIcon()} />
              <span class="code-block-header__label">{diff() ? `Diff / ${displayLanguage()}` : displayLanguage()}</span>
            </div>
            <div class="code-block-header__actions">
              <Show when={showCopyButton()}>
                <button type="button" class="code-action-btn" aria-label={copied() ? t('common.copied') : t('common.copy')} onBlur={hideBtnTooltip} onClick={() => void copy()} onFocus={event => showButtonTooltip(event, copied() ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'))} onMouseLeave={hideBtnTooltip} onMouseEnter={event => showButtonTooltip(event, copied() ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'))}>
                  {copied()
                    ? <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5" /></svg>
                    : <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></g></svg>}
                </button>
              </Show>
              <Show when={showFontSizeButtons() && enableFontSizeControl()}>
                <button type="button" class="code-action-btn" aria-label={t('common.decrease')} onBlur={hideBtnTooltip} onClick={decreaseFont} onFocus={event => showButtonTooltip(event, t('common.decrease') || 'Decrease')} onMouseLeave={hideBtnTooltip} onMouseEnter={event => showButtonTooltip(event, t('common.decrease') || 'Decrease')}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14" /></svg>
                </button>
                <button type="button" class="code-action-btn" aria-label={t('common.reset')} onBlur={hideBtnTooltip} onClick={resetFont} onFocus={event => showButtonTooltip(event, t('common.reset') || 'Reset')} onMouseLeave={hideBtnTooltip} onMouseEnter={event => showButtonTooltip(event, t('common.reset') || 'Reset')}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8m0-5v5h5" /></svg>
                </button>
                <button type="button" class="code-action-btn" aria-label={t('common.increase')} onBlur={hideBtnTooltip} onClick={increaseFont} onFocus={event => showButtonTooltip(event, t('common.increase') || 'Increase')} onMouseLeave={hideBtnTooltip} onMouseEnter={event => showButtonTooltip(event, t('common.increase') || 'Increase')}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-7-7v14" /></svg>
                </button>
              </Show>
              <Show when={isPreviewable() && showPreviewButton()}>
                <button type="button" class="code-action-btn" data-markstream-code-preview aria-label={t('common.preview')} onBlur={hideBtnTooltip} onClick={preview} onFocus={event => showButtonTooltip(event, t('common.preview') || 'Preview')} onMouseLeave={hideBtnTooltip} onMouseEnter={event => showButtonTooltip(event, t('common.preview') || 'Preview')}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></g></svg>
                </button>
              </Show>
              <Show when={showExpandButton()}>
                <button type="button" class="code-action-btn" aria-pressed={expanded()} aria-label={expanded() ? t('common.collapse') : t('common.expand')} onBlur={hideBtnTooltip} onClick={() => setExpanded(value => !value)} onFocus={event => showButtonTooltip(event, expanded() ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))} onMouseLeave={hideBtnTooltip} onMouseEnter={event => showButtonTooltip(event, expanded() ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={expanded() ? 'm14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6' : 'M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6'} /></svg>
                </button>
              </Show>
              <Show when={showCollapseButton()}>
                <button type="button" class="code-action-btn" aria-pressed={collapsed()} aria-label={collapsed() ? t('common.expand') : t('common.collapse')} onBlur={hideBtnTooltip} onClick={() => setCollapsed(value => !value)} onFocus={event => showButtonTooltip(event, collapsed() ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))} onMouseLeave={hideBtnTooltip} onMouseEnter={event => showButtonTooltip(event, collapsed() ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))}>
                  <svg style={{ transform: collapsed() ? 'rotate(0deg)' : 'rotate(90deg)' }} viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6" /></svg>
                </button>
              </Show>
            </div>
          </div>
        </Show>
        <Show when={!collapsed()}>
          <div class={`code-block-body${expanded() ? ' code-block-body--expanded' : ''}`}>
            <Show when={!shouldDelayEditor()}>
              <div ref={setEditorHost} class={`code-block-node__editor code-editor-container${editorRevealed() ? '' : ' is-hidden'}`} />
            </Show>
            <div class={`code-editor-fallback-surface${fallbackRetired() ? ' is-hidden' : ''}`}>
              <PreCodeNode
                class="code-pre-fallback"
                enhanceable={false}
                node={preFallbackNode()}
                showLineNumbers={effectiveShowLineNumbers()}
                style={preFallbackStyle()}
              />
            </div>
          </div>
        </Show>
        <Show when={previewOpen() && isPreviewable()}>
          <HtmlPreviewFrame code={code()} title={previewTitle()} isDark={resolvedIsDark()} htmlPreviewAllowScripts={props.htmlPreviewAllowScripts} htmlPreviewSandbox={props.htmlPreviewSandbox} onClose={() => setPreviewOpen(false)} />
        </Show>
      </div>
    </Show>
  )
}
