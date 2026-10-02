<script lang="ts">
  import type { CodeBlockOptions, CodeBlockTheme, CodeBlockThemeProp, CodeBlockThemes } from '../types/codeBlock'
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { onDestroy, onMount, tick } from 'svelte'
  import { useSafeI18n } from '../i18n/useSafeI18n'
  import { getStreamDiffsRuntime } from '../optional/streamDiffs'
  import { hideTooltip, showTooltipForAnchor } from '../tooltip/singletonTooltip'
  import { getLanguageIcon, isLikelyIncompleteLanguageIdentifier, languageMap, normalizeLanguageIdentifier, resolveLanguageId } from '../utils/languageIcon'
  import HtmlPreviewFrame from './HtmlPreviewFrame.svelte'
  import PreCodeNode from './PreCodeNode.svelte'
  import { copyTextToClipboard, resolveCssSize } from './shared/rich-block-helpers'
  import { getString } from './shared/node-helpers'

  type Props = {
    node: SvelteRenderableNode
    context?: SvelteRenderContext | undefined
    isDark?: boolean | undefined
    loading?: boolean | undefined
    stream?: boolean | undefined
    codeBlockOptions?: CodeBlockOptions | undefined
    theme?: CodeBlockThemeProp | undefined
    darkTheme?: CodeBlockTheme | undefined
    lightTheme?: CodeBlockTheme | undefined
    themes?: CodeBlockThemes | undefined
    minWidth?: string | number | undefined
    maxWidth?: string | number | undefined
    isShowPreview?: boolean
    enableFontSizeControl?: boolean
    showHeader?: boolean
    showCopyButton?: boolean
    showExpandButton?: boolean
    showPreviewButton?: boolean
    showCollapseButton?: boolean
    showFontSizeButtons?: boolean
    showLineNumbers?: boolean
    htmlPreviewAllowScripts?: boolean
    htmlPreviewSandbox?: string | undefined
  }

  let {
    node,
    context = undefined,
    isDark = undefined,
    loading = undefined,
    stream = undefined,
    codeBlockOptions = undefined,
    theme = undefined,
    darkTheme = undefined,
    lightTheme = undefined,
    themes = undefined,
    minWidth = undefined,
    maxWidth = undefined,
    isShowPreview = true,
    enableFontSizeControl = true,
    showHeader = true,
    showCopyButton = true,
    showExpandButton = true,
    showPreviewButton = true,
    showCollapseButton = true,
    showFontSizeButtons = true,
    showLineNumbers = undefined,
    htmlPreviewAllowScripts = false,
    htmlPreviewSandbox = undefined
  }: Props = $props()

  const { t } = useSafeI18n()
  const streamingLanguageTokens = ['javascript', 'plaintext', 'shellscript', 'typescript']
  const defaultPreFallbackFontFamily = '"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace'

  function resolveRecoverableFallbackLanguage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? '')
    const missingLanguage = message.match(/Language `([^`]+)` is not included/)?.[1]
    return missingLanguage && isLikelyIncompleteLanguageIdentifier(missingLanguage)
      ? missingLanguage
      : ''
  }

  function markEditorFallback(error: unknown) {
    const recoverableLanguage = resolveRecoverableFallbackLanguage(error)
    if (recoverableLanguage) {
      fallbackLanguage = recoverableLanguage
      useFallback = false
      queueRecoverableLanguageRetry(recoverableLanguage)
      return
    }
    fallbackLanguage = rawLanguage
    useFallback = true
  }

  function isStreamingLanguagePrefix(lang: string) {
    const token = lang.trim().split(/\s+/)[0]?.split(':')[0]?.toLowerCase() || ''
    return token.length >= 3 && streamingLanguageTokens.some(candidate => candidate !== token && candidate.startsWith(token))
  }

  function queueRecoverableLanguageRetry(recoverableLanguage: string) {
    if (languageRetryTimer)
      return
    const retry = () => {
      languageRetryTimer = null
      if (!mounted)
        return
      if (
        rawLanguage !== recoverableLanguage
        && !isLikelyIncompleteLanguageIdentifier(rawLanguage)
        && !isStreamingLanguagePrefix(rawLanguage)
        && !shouldDelayEditor
        && !shouldDeferStreamingLanguage
      ) {
        fallbackLanguage = ''
        void syncEditor()
        return
      }
      languageRetryTimer = setTimeout(retry, 50)
    }
    languageRetryTimer = setTimeout(retry, 50)
  }

  let editorHost: HTMLDivElement | null = $state(null)
  let helpers: any = $state(null)
  let runtimeOptions: Record<string, any> | null = $state(null)
  let ensureRuntimePromise: Promise<void> | null = $state(null)
  let editorReady = $state(false)
  let useFallback = $state(false)
  let fallbackLanguage = $state('')
  let editorKind: 'single' | 'diff' | null = $state(null)
  let editorStreamMode: boolean | null = $state(null)
  let editorRevealed = $state(false)
  let fallbackRetired = $state(false)
  let createEditorPromise: Promise<void> | null = $state(null)
  let mounted = $state(false)
  let collapsed = $state(false)
  let expanded = $state(false)
  let copied = $state(false)
  let previewOpen = $state(false)
  let codeFontSize = $state(12)
  let copyTimer: ReturnType<typeof setTimeout> | null = $state(null)
  let lifecycleId = $state(0)
  let heightSyncRaf: number | null = $state(null)
  let heightSyncDisposables: Array<{ dispose?: () => void } | (() => void)> = $state([])
  let editorSurfaceResizeObserver: ResizeObserver | null = $state(null)
  let editorSurfaceResizeTarget: HTMLElement | null = $state(null)
  let lastLayoutWidth: number | null = $state(null)
  let lastLayoutHeight: number | null = $state(null)
  let lastThemeRequest = $state('')
  let lastRuntimeInstallationConfig: unknown
  let languageRetryTimer: ReturnType<typeof setTimeout> | null = $state(null)
  let loadingSettledRefreshPromise: Promise<void> | null = $state(null)
  let loadingSettledRefreshTimer: ReturnType<typeof setTimeout> | null = $state(null)
  let lastSettledRefreshSignature = $state('')
  let tokenizeTimer: ReturnType<typeof setTimeout> | null = $state(null)
  let tokenizeRaf: number | null = $state(null)
  let tokenizeShouldRefreshModelValue = $state(false)

  let rawLanguage = $derived(getString((node as any)?.language).trim())
  let canonicalLanguage = $derived(normalizeLanguageIdentifier(rawLanguage))
  let runtimeLanguage = $derived(resolveLanguageId(canonicalLanguage || rawLanguage || 'plaintext'))
  let code = $derived(getResolvedCode(node))
  let diff = $derived(Boolean((node as any)?.diff))
  let originalCode = $derived(getString((node as any)?.originalCode))
  let updatedCode = $derived(getString((node as any)?.updatedCode))
  let nodeLoading = $derived((node as any)?.loading === true)
  let resolvedLoading = $derived(loading ?? nodeLoading)
  let resolvedStream = $derived(stream ?? context?.codeBlockStream ?? true)
  let resolvedIsDark = $derived(isDark ?? context?.isDark ?? false)
  let resolvedThemes = $derived(context?.codeBlockThemes)
  let resolvedCodeBlockOptions = $derived(codeBlockOptions ?? context?.codeBlockOptions)
  let effectiveShowLineNumbers = $derived(showLineNumbers ?? resolvedCodeBlockOptions?.disableLineNumbers !== true)
  let runtimeInstallationConfig = $derived.by(() => {
    const parseDiffOptions = resolvedCodeBlockOptions?.parseDiffOptions
    return {
      options: { ...(resolvedCodeBlockOptions ?? {}) },
      parseDiffOptions: parseDiffOptions && typeof parseDiffOptions === 'object'
        ? { ...parseDiffOptions }
        : parseDiffOptions,
      showLineNumbers: effectiveShowLineNumbers,
    }
  })
  let resolvedRuntimeOptions = $derived(buildResolvedRuntimeOptions())
  let requestedTheme = $derived(resolveRequestedTheme())
  let defaultCodeFontSize = $derived(readPositiveMetric(resolvedCodeBlockOptions?.fontSize) ?? 12)
  let minWidthValue = $derived(resolveCssSize(minWidth ?? resolvedThemes?.minWidth))
  let maxWidthValue = $derived(resolveCssSize(maxWidth ?? resolvedThemes?.maxWidth))
  let containerStyle = $derived([
    minWidthValue ? `min-width: ${minWidthValue}` : '',
    maxWidthValue ? `max-width: ${maxWidthValue}` : '',
  ].filter(Boolean).join('; '))
  let languageIcon = $derived(getLanguageIcon(canonicalLanguage || rawLanguage || 'plain'))
  let displayLanguage = $derived(languageMap[canonicalLanguage] || (rawLanguage ? rawLanguage.toUpperCase() : languageMap['']))
  let isPreviewable = $derived(isShowPreview !== false && (canonicalLanguage === 'html' || canonicalLanguage === 'svg'))
  let previewTitle = $derived(canonicalLanguage === 'svg' ? t('artifacts.svgPreviewTitle') : t('artifacts.htmlPreviewTitle'))
  let shouldDelayEditor = $derived(resolvedStream === false && resolvedLoading)
  let documentStreaming = $derived(context?.final === false || resolvedLoading)
  let shouldDeferStreamingLanguage = $derived(resolvedStream !== false && documentStreaming && (isLikelyIncompleteLanguageIdentifier(rawLanguage) || isStreamingLanguagePrefix(rawLanguage)))
  let shouldRender = $derived(!(resolvedLoading && !code.trim()))
  let preFallbackNode = $derived({
    ...(node as any),
    code,
    loading: resolvedLoading,
  } as SvelteRenderableNode)
  let preFallbackStyle = $derived(buildPreFallbackStyle())
  let settledRefreshSignature = $derived(diff
    ? `${runtimeLanguage}\0${originalCode}\0${updatedCode || code}`
    : `${runtimeLanguage}\0${code}`)

  $effect(() => {
    if (useFallback && fallbackLanguage && rawLanguage !== fallbackLanguage && isLikelyIncompleteLanguageIdentifier(fallbackLanguage)) {
      useFallback = false
      fallbackLanguage = ''
    }
  })

  $effect(() => {
    void mounted
    void resolvedLoading
    void settledRefreshSignature
    void shouldDelayEditor
    void shouldDeferStreamingLanguage
    if (mounted && resolvedLoading === false && !shouldDelayEditor && !shouldDeferStreamingLanguage) {
      if (settledRefreshSignature !== lastSettledRefreshSignature) {
        lastSettledRefreshSignature = settledRefreshSignature
        queueLoadingSettledRefresh()
      }
    }
  })

  $effect(() => {
    void mounted
    void editorHost
    void shouldRender
    void collapsed
    void shouldDelayEditor
    void shouldDeferStreamingLanguage
    void diff
    void code
    void originalCode
    void updatedCode
    void runtimeLanguage
    void requestedTheme
    void resolvedRuntimeOptions
    void resolvedCodeBlockOptions
    void runtimeInstallationConfig
    void codeFontSize
    void expanded
    if (mounted) {
      if (lastRuntimeInstallationConfig !== runtimeInstallationConfig) {
        lastRuntimeInstallationConfig = runtimeInstallationConfig
        codeFontSize = defaultCodeFontSize
        cleanupEditor()
      }
      void syncEditor()
    }
  })

  onMount(() => {
    mounted = true
    codeFontSize = defaultCodeFontSize
  })

  onDestroy(() => {
    mounted = false
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

  function getResolvedCode(sourceNode: SvelteRenderableNode) {
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

  function getCodeLineHeight() {
    return readPositiveMetric(resolvedCodeBlockOptions?.lineHeight)
      ?? (codeFontSize === 12 ? 18 : Math.max(12, Math.round(codeFontSize * 1.5)))
  }

  function getCodePadding() {
    const padding = resolvedCodeBlockOptions?.padding
    const defaultPadding = diff ? 0 : 8
    const value = readNonNegativeMetric(padding) ?? defaultPadding
    return {
      top: value,
      bottom: value,
    }
  }

  function getCodeFontFamily() {
    return typeof resolvedCodeBlockOptions?.fontFamily === 'string' && resolvedCodeBlockOptions.fontFamily.trim()
      ? resolvedCodeBlockOptions.fontFamily.trim()
      : defaultPreFallbackFontFamily
  }

  function buildPreFallbackStyle() {
    const padding = getCodePadding()
    const fontFamily = getCodeFontFamily()
    const tabSize = readPositiveMetric(resolvedCodeBlockOptions?.tabSize) ?? 4
    const lineHeight = getCodeLineHeight()
    return [
      `--markstream-code-font-family: ${fontFamily}`,
      `--vscode-editor-font-size: ${codeFontSize}px`,
      `--vscode-editor-line-height: ${lineHeight}px`,
      `--markstream-code-padding-y: ${padding.top}px`,
      `--markstream-pre-line-number-top: ${padding.top}px`,
      `font-family: ${fontFamily}`,
      `font-size: ${codeFontSize}px`,
      `line-height: ${lineHeight}px`,
      `padding-top: ${padding.top}px`,
      `padding-right: var(--markstream-code-padding-x, 12px)`,
      `padding-bottom: ${padding.bottom}px`,
      `padding-left: var(--markstream-code-padding-left, 52px)`,
      `tab-size: ${tabSize}`,
      `max-height: ${getMaxHeightValue()}px`,
      'overflow: auto',
      `white-space: ${resolvedCodeBlockOptions?.overflow === 'scroll' ? 'pre' : 'pre-wrap'}`,
    ].join('; ')
  }

  function isThemePair(value: unknown): value is { dark: string, light: string } {
    return !!value && typeof value === 'object' && typeof (value as any).dark === 'string' && typeof (value as any).light === 'string'
  }

  function resolveRequestedTheme() {
    if (typeof theme === 'string' && theme)
      return theme
    if (isThemePair(theme))
      return resolvedIsDark ? theme.dark : theme.light
    const directTheme = resolvedIsDark ? darkTheme : lightTheme
    if (directTheme)
      return directTheme
    if (themes)
      return resolvedIsDark ? themes[0] : themes[1]
    const contextTheme = resolvedIsDark ? resolvedThemes?.darkTheme : resolvedThemes?.lightTheme
    if (contextTheme)
      return contextTheme
    if (resolvedThemes?.themes)
      return resolvedIsDark ? resolvedThemes.themes[0] : resolvedThemes.themes[1]
    return resolvedIsDark ? 'vitesse-dark' : 'vitesse-light'
  }

  function buildThemeList(): [dark: string, light: string] {
    return [
      darkTheme ?? themes?.[0] ?? resolvedThemes?.darkTheme ?? resolvedThemes?.themes?.[0] ?? 'vitesse-dark',
      lightTheme ?? themes?.[1] ?? resolvedThemes?.lightTheme ?? resolvedThemes?.themes?.[1] ?? 'vitesse-light',
    ]
  }

  function buildResolvedRuntimeOptions() {
    const userOptions = { ...(resolvedCodeBlockOptions ?? {}) } as Record<string, any>
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
    const nativeOptions = diff
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
      MAX_HEIGHT: expanded ? 900 : (resolvedCodeBlockOptions?.maxHeight ?? 500),
      fontFamily: getCodeFontFamily(),
      fontSize: codeFontSize,
      lineHeight: getCodeLineHeight(),
      disableLineNumbers: !effectiveShowLineNumbers,
      unsafeCSS: `[data-file], [data-diff] { --diffs-min-number-column-width-default: 2ch !important; }
${configuredUnsafeCSS}`.trim(),
      disableFileHeader: true,
      stream: false,
      themes: buildThemeList(),
      themeType: resolvedIsDark ? 'dark' : 'light',
      onThemeChange() {
        syncEditorGeometryVars()
        scheduleEditorHeightSync()
      },
    }
  }

  function syncRuntimeOptions() {
    const nextOptions = {
      ...resolvedRuntimeOptions,
      theme: requestedTheme,
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

  async function ensureRuntime() {
    if (helpers || useFallback || typeof window === 'undefined')
      return
    if (ensureRuntimePromise)
      return ensureRuntimePromise

    const runtimeId = lifecycleId
    const pending = (async () => {
      const mod = await getStreamDiffsRuntime()
      if (!mounted || lifecycleId !== runtimeId)
        return
      if (!mod || typeof mod.createCodeBlockRuntime !== 'function') {
        useFallback = true
        return
      }

      helpers = mod.createCodeBlockRuntime(syncRuntimeOptions())
      await Promise.resolve(helpers.setTheme?.(requestedTheme))
      if (!mounted || lifecycleId !== runtimeId)
        return
      lastThemeRequest = requestedTheme
    })()
    const tracked = pending.finally(() => {
      if (ensureRuntimePromise === tracked)
        ensureRuntimePromise = null
    })
    ensureRuntimePromise = tracked
    return tracked
  }

  function queueThemeSync() {
    if (!helpers || !requestedTheme || requestedTheme === lastThemeRequest)
      return
    lastThemeRequest = requestedTheme
    void Promise.resolve(helpers.setTheme?.(requestedTheme)).catch((error) => {
      if (typeof console !== 'undefined')
        console.warn('[markstream-svelte] Failed to apply code-block theme:', error)
    })
  }

  async function syncEditor() {
    if (!mounted || !shouldRender || !editorHost || collapsed || shouldDelayEditor || shouldDeferStreamingLanguage)
      return

    const runtimeId = lifecycleId
    try {
      await ensureRuntime()
    }
    catch (error) {
      if (mounted && lifecycleId === runtimeId)
        markEditorFallback(error)
      return
    }
    if (!mounted || lifecycleId !== runtimeId || useFallback || !helpers)
      return
    syncRuntimeOptions()

    const desiredKind: 'single' | 'diff' = diff ? 'diff' : 'single'
    const hasEditorView = desiredKind === 'diff'
      ? Boolean(helpers.getDiffEditorView?.())
      : Boolean(helpers.getEditorView?.())
    const hasEditor = hasEditorView && hasRenderedEditorDom(desiredKind)
    const desiredStreamMode = false

    if (!hasEditor || editorKind !== desiredKind || editorStreamMode !== desiredStreamMode) {
      await recreateEditor(desiredKind)
      if (!mounted || useFallback || !helpers)
        return
      if (!hasRenderedEditorDom(desiredKind) || editorKind !== desiredKind)
        return
    }

    const operationId = lifecycleId
    try {
      if (diff && typeof helpers.updateDiff === 'function')
        await Promise.resolve(helpers.updateDiff(originalCode, updatedCode || code, runtimeLanguage))
      else if (typeof helpers.updateCode === 'function') {
        await Promise.resolve(helpers.updateCode(code, runtimeLanguage))
        scheduleEditorTokenization()
      }
      if (!editorReady && await prepareEditorHandoff(desiredKind, lifecycleId)) {
        editorRevealed = true
        fallbackRetired = true
        editorReady = true
      }
      queueThemeSync()
      applyEditorOptions()
      scheduleEditorHeightSync()
    }
    catch (error) {
      if (mounted && lifecycleId === operationId)
        markEditorFallback(error)
    }
  }

  function hasRenderedEditorDom(kind: 'single' | 'diff') {
    if (!editorHost)
      return false
    // stream-diffs renders its surface inside these containers.
    const selectors = [
      'diffs-container',
      '.stream-diffs-shell',
      '[data-stream-diffs-state]',
    ].join(',')
    return Boolean(editorHost.querySelector(selectors))
  }

  function getVisualEditorSurface() {
    return editorHost?.querySelector<HTMLElement>([
      'diffs-container',
      '[data-stream-diffs-state]',
      '.stream-diffs-shell',
    ].join(',')) ?? null
  }

  function isEditorVisuallyReady(kind: 'single' | 'diff', requireRevealed = false) {
    if (!editorHost || !hasRenderedEditorDom(kind))
      return false
    if (requireRevealed) {
      const hostStyle = window.getComputedStyle(editorHost)
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
    await tick()
    // Streaming updates retry this gate, so keep the fallback until the live
    // surface has positive geometry.
    const deadline = Date.now() + 1500
    let attempt = 0
    while (Date.now() < deadline && attempt < 30) {
      attempt += 1
      if (!mounted || !editorHost || lifecycleId !== creationId)
        return false
      syncEditorHostHeight(true)
      await nextAnimationFrame()
      if (isEditorVisuallyReady(kind)) {
        syncEditorHostHeight(true)
        await nextAnimationFrame()
        return isEditorVisuallyReady(kind)
      }
    }
    return !!(mounted && editorHost && lifecycleId === creationId && isEditorVisuallyReady(kind))
  }

  async function recreateEditor(kind: 'single' | 'diff') {
    if (!editorHost || !helpers || createEditorPromise)
      return createEditorPromise

    const activeHelpers = helpers
    const creationId = ++lifecycleId
    editorReady = false
    const pending = (async () => {
      try {
        cleanupEditor(false)
        if (!mounted || !editorHost || lifecycleId !== creationId || helpers !== activeHelpers)
          return
        editorHost.replaceChildren()
        lastLayoutWidth = null
        lastLayoutHeight = null

        editorStreamMode = false
        if (kind === 'diff' && typeof activeHelpers.createDiffEditor === 'function') {
          await activeHelpers.createDiffEditor(editorHost, originalCode, updatedCode || code, runtimeLanguage)
          if (!mounted || lifecycleId !== creationId || helpers !== activeHelpers)
            return
          await Promise.resolve(activeHelpers.updateDiff?.(originalCode, updatedCode || code, runtimeLanguage))
          if (!mounted || lifecycleId !== creationId || helpers !== activeHelpers)
            return
          editorKind = 'diff'
        }
        else {
          await activeHelpers.createEditor(editorHost, code, runtimeLanguage)
          if (!mounted || lifecycleId !== creationId || helpers !== activeHelpers)
            return
          await Promise.resolve(activeHelpers.updateCode?.(code, runtimeLanguage))
          if (!mounted || lifecycleId !== creationId || helpers !== activeHelpers)
            return
          editorKind = 'single'
        }
        applyEditorOptions()
        bindEditorHeightSync()
        queueThemeSync()
        if (!await prepareEditorHandoff(kind, creationId))
          return
        // Apply the reveal and fallback retirement in one Svelte render. The
        // editor surface has already passed the hidden-host readiness check, so
        // the browser never paints an intermediate frame with neither layer.
        editorRevealed = true
        fallbackRetired = true
        editorReady = true
        scheduleEditorHeightSync()
      }
      catch (error) {
        if (mounted && lifecycleId === creationId && helpers === activeHelpers) {
          markEditorFallback(error)
        }
      }
    })()
    const tracked = pending.finally(() => {
      if (createEditorPromise === tracked)
        createEditorPromise = null
    })
    createEditorPromise = tracked
    return tracked
  }

  function refreshEditorAfterLoadingSettled() {
    if (loadingSettledRefreshPromise)
      return loadingSettledRefreshPromise

    loadingSettledRefreshPromise = (async () => {
      await tick()
      await nextAnimationFrame()
      if (createEditorPromise) {
        try {
          await createEditorPromise
        }
        catch {}
      }
      if (!mounted || !shouldRender || !editorHost || collapsed || shouldDelayEditor || shouldDeferStreamingLanguage)
        return
      await ensureRuntime()
      if (!mounted || useFallback || !helpers)
        return
      syncRuntimeOptions()
      const desiredKind: 'single' | 'diff' = diff ? 'diff' : 'single'
      if (!hasRenderedEditorDom(desiredKind) || editorKind !== desiredKind)
        await recreateEditor(desiredKind)
      if (!mounted || useFallback || !helpers || !hasRenderedEditorDom(desiredKind) || editorKind !== desiredKind)
        return
      if (diff) {
        await Promise.resolve(helpers.updateDiff?.(originalCode, updatedCode || code, runtimeLanguage))
        helpers.refreshDiffPresentation?.()
        applyEditorOptions()
        scheduleEditorHeightSync()
        return
      }
      await Promise.resolve(helpers.updateCode?.(code, runtimeLanguage))
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

  function nextAnimationFrame() {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function')
      return Promise.resolve()
    // Animation frames never run in hidden tabs; fall back to a timer so the
    // editor handoff loop cannot stall indefinitely while the page is hidden.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden')
      return new Promise<void>(resolve => setTimeout(() => resolve(), 0))
    return new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
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
    editorRevealed = false
    fallbackRetired = false
    editorReady = false
    lastLayoutWidth = null
    lastLayoutHeight = null
    if (disposeHelpers) {
      helpers = null
      runtimeOptions = null
      ensureRuntimePromise = null
      lastThemeRequest = ''
    }
  }

  function applyEditorOptions() {
    const target = diff ? helpers?.getDiffEditorView?.() : helpers?.getEditorView?.()
    target?.updateOptions?.({ fontSize: codeFontSize })
    syncEditorGeometryVars()
    scheduleEditorHeightSync()
  }

  // Align the enhanced surface with the pre-fallback geometry (see vue3):
  // stream-diffs/pierre honor these CSS variables on the editor host.
  function syncEditorGeometryVars() {
    if (!editorHost)
      return
    const tabSize = readPositiveMetric(resolvedCodeBlockOptions?.tabSize) ?? 4
    editorHost.style.setProperty('--diffs-tab-size', String(tabSize))
    const rawPadding = resolvedCodeBlockOptions?.padding
    const hasConfiguredPadding = typeof rawPadding === 'number'
    if (hasConfiguredPadding)
      editorHost.style.setProperty('--diffs-gap-block', `${getCodePadding().top}px`)
    else
      editorHost.style.removeProperty('--diffs-gap-block')
  }

  function getMaxHeightValue() {
    return resolvedCodeBlockOptions?.maxHeight ?? 500
  }

  function scheduleEditorHeightSync() {
    if (typeof window === 'undefined' || !editorHost || !editorReady)
      return
    if (heightSyncRaf != null)
      return
    heightSyncRaf = window.requestAnimationFrame(() => {
      heightSyncRaf = null
      window.requestAnimationFrame(() => syncEditorHostHeight())
    })
  }

  function cancelEditorHeightSync() {
    if (heightSyncRaf == null || typeof window === 'undefined')
      return
    window.cancelAnimationFrame(heightSyncRaf)
    heightSyncRaf = null
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
        const shouldRefreshModelValue = tokenizeShouldRefreshModelValue
        tokenizeShouldRefreshModelValue = false
        tokenizeRaf = null
        forceTokenizeEditorModel(shouldRefreshModelValue)
      })
    }, delay)
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

  function forceTokenizeEditorModel(refreshModelValue = false) {
    try {
      const editor = diff
        ? helpers?.getDiffEditorView?.()?.getModifiedEditor?.()
        : helpers?.getEditorView?.()
      const model = editor?.getModel?.()
      const forceTokenization = model?.forceTokenization
      if (refreshModelValue && !diff && typeof model?.setValue === 'function') {
        const scrollTop = Number(editor?.getScrollTop?.() || 0)
        const scrollLeft = Number(editor?.getScrollLeft?.() || 0)
        const selection = editor?.getSelection?.()
        model.setValue(code)
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

  function bindEditorSurfaceResizeSync() {
    if (typeof ResizeObserver === 'undefined' || !editorHost)
      return
    const surface = getVisualEditorSurface()
    if (editorSurfaceResizeObserver && surface === editorSurfaceResizeTarget)
      return
    unbindEditorSurfaceResizeSync()
    if (!surface)
      return
    // The diff surface re-renders at a different height when unchanged regions
    // collapse/expand and when a settled stream replaces the partial layout.
    // Those changes do not always surface through the editor events bound
    // above, so observe the rendered surface and re-sync the host height when
    // the rendered height no longer matches the host.
    editorSurfaceResizeObserver = new ResizeObserver(() => {
      if (!editorHost || collapsed)
        return
      const renderedHeight = measureRenderedDiffHeight(editorHost)
      const hostHeight = Math.ceil(editorHost.getBoundingClientRect().height || 0)
      if (renderedHeight == null || Math.abs(renderedHeight - hostHeight) <= 1)
        return
      scheduleEditorHeightSync()
    })
    editorSurfaceResizeObserver.observe(surface)
    editorSurfaceResizeTarget = surface
  }

  function unbindEditorSurfaceResizeSync() {
    editorSurfaceResizeObserver?.disconnect()
    editorSurfaceResizeObserver = null
    editorSurfaceResizeTarget = null
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

    if (diff) {
      const diffEditor = helpers?.getDiffEditorView?.()
      const originalEditor = diffEditor?.getOriginalEditor?.()
      const modifiedEditor = diffEditor?.getModifiedEditor?.()
      try {
        const disposable = diffEditor?.onDidUpdateDiff?.(() => scheduleEditorHeightSync())
        if (disposable)
          heightSyncDisposables.push(disposable)
      }
      catch {}
      bind(originalEditor, 'onDidContentSizeChange')
      bind(modifiedEditor, 'onDidContentSizeChange')
      bind(originalEditor, 'onDidLayoutChange')
      bind(modifiedEditor, 'onDidLayoutChange')
      bindEditorSurfaceResizeSync()
      return
    }

    const editor = helpers?.getEditorView?.()
    bind(editor, 'onDidContentSizeChange')
    bind(editor, 'onDidLayoutChange')
  }

  function clearEditorHeightSyncBindings() {
    unbindEditorSurfaceResizeSync()
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

  function syncEditorHostHeight(preparing = false) {
    if (!editorHost || !helpers || (!editorReady && !preparing) || collapsed)
      return

    const maxHeight = getMaxHeightValue()
    const contentHeight = diff
      ? measureRenderedDiffHeight(editorHost) ?? computeEditorContentHeight()
      : computeEditorContentHeight()
    if (!contentHeight || contentHeight <= 0)
      return

    const minHeight = getEditorHostMinHeight()
    const cappedHeight = expanded || !Number.isFinite(maxHeight)
      ? Math.ceil(contentHeight)
      : Math.ceil(Math.min(contentHeight, maxHeight))
    const nextHeight = Math.max(minHeight, cappedHeight)
    editorHost.style.height = `${nextHeight}px`
    editorHost.style.minHeight = `${nextHeight}px`
    editorHost.style.maxHeight = expanded || !Number.isFinite(maxHeight) ? 'none' : `${Math.ceil(maxHeight)}px`
    editorHost.style.overflow = contentHeight > nextHeight ? 'auto' : 'hidden'
    layoutEditor(nextHeight)
    if (diff)
      bindEditorSurfaceResizeSync()
  }

  function getEditorHostMinHeight() {
    if (!editorHost || typeof window === 'undefined')
      return 0
    // A consumer-configured min-height on the body element is a real floor.
    const parentMinHeight = window.getComputedStyle(editorHost.parentElement || editorHost).minHeight
    const parsedParentMinHeight = Number.parseFloat(parentMinHeight)
    if (Number.isFinite(parsedParentMinHeight) && parsedParentMinHeight > 0)
      return Math.ceil(parsedParentMinHeight)
    // `syncEditorHostHeight` writes the host's inline min-height, so reading the
    // computed value back would pin the host at its largest historical height
    // and stop the container from shrinking when the diff surface collapses
    // unchanged regions. Temporarily drop the inline value so the computed
    // min-height reflects only a consumer/CSS-configured floor.
    const inlineMinHeight = editorHost.style.minHeight
    if (inlineMinHeight)
      editorHost.style.minHeight = ''
    const configuredMinHeight = Number.parseFloat(window.getComputedStyle(editorHost).minHeight)
    if (inlineMinHeight)
      editorHost.style.minHeight = inlineMinHeight
    if (Number.isFinite(configuredMinHeight) && configuredMinHeight > 0)
      return Math.ceil(configuredMinHeight)
    return 0
  }

  function layoutEditor(height: number) {
    const width = Math.max(0, editorHost?.clientWidth || 0)
    const roundedWidth = Math.ceil(width)
    const roundedHeight = Math.ceil(height)
    if (lastLayoutWidth === roundedWidth && lastLayoutHeight === roundedHeight)
      return
    lastLayoutWidth = roundedWidth
    lastLayoutHeight = roundedHeight
    try {
      if (diff)
        helpers?.getDiffEditorView?.()?.layout?.(width > 0 ? { width: roundedWidth, height: roundedHeight } : undefined)
      else
        helpers?.getEditorView?.()?.layout?.(width > 0 ? { width: roundedWidth, height: roundedHeight } : undefined)
    }
    catch {}
  }

  function computeEditorContentHeight() {
    try {
      if (diff) {
        const diffEditor = helpers?.getDiffEditorView?.()
        const originalEditor = diffEditor?.getOriginalEditor?.()
        const modifiedEditor = diffEditor?.getModifiedEditor?.()
        const originalHeight = Number(originalEditor?.getContentHeight?.() || 0)
        const modifiedHeight = Number(modifiedEditor?.getContentHeight?.() || 0)
        const height = Math.max(originalHeight, modifiedHeight)
        if (height > 0)
          return Math.ceil(height + 1)
      }
      const editor = helpers?.getEditorView?.()
      const height = Number(editor?.getContentHeight?.() || 0)
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

      // stream-diffs renders its surface inside these containers. Measure the
      // rendered shell so a diff block fills its real content height even when
      // the adapter's getContentHeight isn't available yet.
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

  async function copy() {
    await copyTextToClipboard(code)
    context?.events?.onCopy?.(code)
    copied = true
    if (copyTimer)
      clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copied = false
    }, 1000)
  }

  function decreaseFont() {
    if (!enableFontSizeControl)
      return
    codeFontSize = Math.max(10, codeFontSize - 1)
    applyEditorOptions()
  }

  function resetFont() {
    if (!enableFontSizeControl)
      return
    codeFontSize = defaultCodeFontSize
    applyEditorOptions()
  }

  function increaseFont() {
    if (!enableFontSizeControl)
      return
    codeFontSize = Math.min(24, codeFontSize + 1)
    applyEditorOptions()
  }

  function showButtonTooltip(event: MouseEvent | FocusEvent, text: string) {
    const target = event.currentTarget as HTMLElement | null
    if (!target || (target instanceof HTMLButtonElement && target.disabled))
      return
    showTooltipForAnchor(target, text, 'top', false, undefined, resolvedIsDark)
  }

  function showCopyTooltip(event: MouseEvent | FocusEvent) {
    showButtonTooltip(event, copied ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'))
  }
</script>

{#if shouldRender}
  <div
    class:is-dark={resolvedIsDark}
    class:is-plain-text={runtimeLanguage === 'plaintext'}
    class:is-rendering={resolvedLoading}
    class:is-diff={diff}
    class="code-block-container"
    data-markstream-code-block="1"
    data-markstream-enhanced={editorReady && !useFallback ? 'true' : 'false'}
    style={containerStyle}
  >
    {#if showHeader}
      <div class="code-block-header">
        <div class="code-block-header__meta">
          <span class="code-block-language-icon" aria-hidden="true">{@html languageIcon}</span>
          <span class="code-block-header__label">{diff ? `Diff / ${displayLanguage}` : displayLanguage}</span>
        </div>
        <div class="code-block-header__actions">
          {#if showCopyButton}
            <button type="button" class="code-action-btn" aria-label={copied ? t('common.copied') : t('common.copy')} onblur={() => hideTooltip()} onclick={copy} onfocus={showCopyTooltip} onmouseleave={() => hideTooltip()} onmouseenter={showCopyTooltip}>
              {#if copied}
                <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5" /></svg>
              {:else}
                <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></g></svg>
              {/if}
            </button>
          {/if}
          {#if showFontSizeButtons && enableFontSizeControl}
            <button type="button" class="code-action-btn" aria-label={t('common.decrease')} onblur={() => hideTooltip()} onclick={decreaseFont} onfocus={(event) => showButtonTooltip(event, t('common.decrease') || 'Decrease')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.decrease') || 'Decrease')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14" /></svg>
            </button>
            <button type="button" class="code-action-btn" aria-label={t('common.reset')} onblur={() => hideTooltip()} onclick={resetFont} onfocus={(event) => showButtonTooltip(event, t('common.reset') || 'Reset')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.reset') || 'Reset')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8m0-5v5h5" /></svg>
            </button>
            <button type="button" class="code-action-btn" aria-label={t('common.increase')} onblur={() => hideTooltip()} onclick={increaseFont} onfocus={(event) => showButtonTooltip(event, t('common.increase') || 'Increase')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.increase') || 'Increase')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-7-7v14" /></svg>
            </button>
          {/if}
          {#if isPreviewable && showPreviewButton}
            <button type="button" class="code-action-btn" aria-label={t('common.preview')} onblur={() => hideTooltip()} onclick={() => (previewOpen = !previewOpen)} onfocus={(event) => showButtonTooltip(event, t('common.preview') || 'Preview')} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, t('common.preview') || 'Preview')}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></g></svg>
            </button>
          {/if}
          {#if showExpandButton}
            <button type="button" class="code-action-btn" aria-pressed={expanded} aria-label={expanded ? t('common.collapse') : t('common.expand')} onblur={() => hideTooltip()} onclick={() => (expanded = !expanded)} onfocus={(event) => showButtonTooltip(event, expanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, expanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={expanded ? 'm14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6' : 'M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6'} /></svg>
            </button>
          {/if}
          {#if showCollapseButton}
            <button type="button" class="code-action-btn" aria-pressed={collapsed} aria-label={collapsed ? t('common.expand') : t('common.collapse')} onblur={() => hideTooltip()} onclick={() => (collapsed = !collapsed)} onfocus={(event) => showButtonTooltip(event, collapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))} onmouseleave={() => hideTooltip()} onmouseenter={(event) => showButtonTooltip(event, collapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))}>
              <svg style:rotate={collapsed ? '0deg' : '90deg'} viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6" /></svg>
            </button>
          {/if}
        </div>
      </div>
    {/if}

    {#if !collapsed}
      <div class:code-block-body--expanded={expanded} class="code-block-body">
        {#if !shouldDelayEditor}
          <div bind:this={editorHost} class:is-hidden={!editorRevealed} class="code-editor-container"></div>
        {/if}
        <div class:is-retired={fallbackRetired} class="code-editor-fallback-surface">
          <PreCodeNode
            class="code-pre-fallback"
            enhanceable={false}
            node={preFallbackNode}
            showLineNumbers={effectiveShowLineNumbers}
            style={preFallbackStyle}
          />
        </div>
      </div>
    {/if}

    {#if previewOpen && isPreviewable}
      <HtmlPreviewFrame code={code} title={previewTitle} isDark={resolvedIsDark} {htmlPreviewAllowScripts} {htmlPreviewSandbox} onClose={() => (previewOpen = false)} />
    {/if}
  </div>
{/if}
