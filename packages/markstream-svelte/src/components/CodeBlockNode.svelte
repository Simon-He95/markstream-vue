<script lang="ts">
  import type { CodeBlockMonacoOptions, CodeBlockMonacoTheme } from '../types/monaco'
  import type { SvelteRenderableNode, SvelteRenderContext } from './shared/node-helpers'
  import { onDestroy, onMount, tick } from 'svelte'
  import { useSafeI18n } from '../i18n/useSafeI18n'
  import { getUseMonaco } from '../optional/monaco'
  import { hideTooltip, showTooltipForAnchor } from '../tooltip/singletonTooltip'
  import { getLanguageIcon, isLikelyIncompleteLanguageIdentifier, languageMap, normalizeLanguageIdentifier, resolveMonacoLanguageId } from '../utils/languageIcon'
  import HtmlPreviewFrame from './HtmlPreviewFrame.svelte'
  import { copyTextToClipboard, resolveCssSize } from './shared/rich-block-helpers'
  import { getString, sanitizeClassToken } from './shared/node-helpers'

  type Props = {
    node: SvelteRenderableNode
    context?: SvelteRenderContext | undefined
    isDark?: boolean | undefined
    loading?: boolean | undefined
    stream?: boolean | undefined
    darkTheme?: CodeBlockMonacoTheme | undefined
    lightTheme?: CodeBlockMonacoTheme | undefined
    themes?: CodeBlockMonacoTheme[] | undefined
    monacoOptions?: CodeBlockMonacoOptions | undefined
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
    htmlPreviewAllowScripts?: boolean
    htmlPreviewSandbox?: string | undefined
  }

  let {
    node,
    context = undefined,
    isDark = undefined,
    loading = undefined,
    stream = undefined,
    darkTheme = undefined,
    lightTheme = undefined,
    themes = undefined,
    monacoOptions = undefined,
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
    htmlPreviewAllowScripts = false,
    htmlPreviewSandbox = undefined
  }: Props = $props()

  const { t } = useSafeI18n()
  const defaultDiffHideUnchangedRegions = Object.freeze({
    enabled: true,
    contextLineCount: 2,
    minimumLineCount: 4,
    revealLineCount: 5,
  })
  const disabledDiffHideUnchangedRegions = Object.freeze({
    enabled: false,
    contextLineCount: 0,
    minimumLineCount: Number.POSITIVE_INFINITY,
    revealLineCount: 0,
  })
  const streamingLanguageTokens = ['javascript', 'plaintext', 'shellscript', 'typescript']

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
  let runtimeMonacoOptions: Record<string, any> | null = $state(null)
  let ensureMonacoPromise: Promise<void> | null = $state(null)
  let editorReady = $state(false)
  let useFallback = $state(false)
  let fallbackLanguage = $state('')
  let editorKind: 'single' | 'diff' | null = $state(null)
  let createEditorPromise: Promise<void> | null = $state(null)
  let mounted = $state(false)
  let collapsed = $state(false)
  let expanded = $state(false)
  let copied = $state(false)
  let previewOpen = $state(false)
  let codeFontSize = $state(13)
  let copyTimer: ReturnType<typeof setTimeout> | null = $state(null)
  let lifecycleId = $state(0)
  let heightSyncRaf: number | null = $state(null)
  let heightSyncDisposables: Array<{ dispose?: () => void } | (() => void)> = $state([])
  let lastLayoutWidth: number | null = $state(null)
  let lastLayoutHeight: number | null = $state(null)
  let lastThemeRequest = $state('')
  let languageRetryTimer: ReturnType<typeof setTimeout> | null = $state(null)
  let loadingSettledRefreshPromise: Promise<void> | null = $state(null)
  let loadingSettledRefreshTimer: ReturnType<typeof setTimeout> | null = $state(null)
  let lastSettledRefreshSignature = $state('')
  let tokenizeTimer: ReturnType<typeof setTimeout> | null = $state(null)
  let tokenizeRaf: number | null = $state(null)
  let tokenizeShouldRefreshModelValue = $state(false)

  let rawLanguage = $derived(getString((node as any)?.language).trim())
  let canonicalLanguage = $derived(normalizeLanguageIdentifier(rawLanguage))
  let monacoLanguage = $derived(resolveMonacoLanguageId(canonicalLanguage || rawLanguage || 'plaintext'))
  let code = $derived(getResolvedCode(node))
  let diff = $derived(Boolean((node as any)?.diff))
  let originalCode = $derived(getString((node as any)?.originalCode))
  let updatedCode = $derived(getString((node as any)?.updatedCode))
  let nodeLoading = $derived((node as any)?.loading === true)
  let resolvedLoading = $derived(loading ?? nodeLoading)
  let resolvedStream = $derived(stream ?? context?.codeBlockStream ?? true)
  let resolvedIsDark = $derived(isDark ?? context?.isDark ?? false)
  let resolvedThemes = $derived(context?.codeBlockThemes)
  let mergedMonacoOptions = $derived({ ...(resolvedThemes?.monacoOptions || {}), ...(monacoOptions || {}) })
  let resolvedMonacoOptions = $derived(buildResolvedMonacoOptions())
  let requestedTheme = $derived(getThemeName(
    resolvedIsDark
      ? darkTheme ?? resolvedThemes?.darkTheme
      : lightTheme ?? resolvedThemes?.lightTheme,
    resolvedIsDark ? 'vitesse-dark' : 'vitesse-light',
  ))
  let defaultCodeFontSize = $derived(Number(mergedMonacoOptions.fontSize) || 13)
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
  let preLanguageClass = $derived(sanitizeClassToken(rawLanguage || monacoLanguage))
  let showPreWhileMonacoLoads = $derived(!useFallback && !shouldDelayEditor && !shouldDeferStreamingLanguage && !editorReady)
  let showPreFallback = $derived(useFallback || shouldDelayEditor || shouldDeferStreamingLanguage || showPreWhileMonacoLoads)
  let settledRefreshSignature = $derived(diff
    ? `${monacoLanguage}\0${originalCode}\0${updatedCode || code}`
    : `${monacoLanguage}\0${code}`)

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
    void monacoLanguage
    void requestedTheme
    void resolvedMonacoOptions
    void codeFontSize
    void expanded
    if (mounted)
      void syncEditor()
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

  function getThemeName(theme: CodeBlockMonacoTheme | undefined, fallback: string) {
    if (typeof theme === 'string' && theme)
      return theme
    if (theme && typeof theme === 'object' && typeof (theme as any).name === 'string')
      return String((theme as any).name)
    return fallback
  }

  function buildThemeList() {
    const list: CodeBlockMonacoTheme[] = ['vitesse-dark', 'vitesse-light']
    const add = (item: CodeBlockMonacoTheme | undefined) => {
      if (item)
        list.push(item)
    }
    add(darkTheme ?? resolvedThemes?.darkTheme)
    add(lightTheme ?? resolvedThemes?.lightTheme)
    for (const item of resolvedThemes?.themes || [])
      add(item)
    for (const item of themes || [])
      add(item)
    return list
  }

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

  function buildResolvedMonacoOptions() {
    const raw = { ...mergedMonacoOptions } as Record<string, any>
    const maxHeight = expanded ? 900 : (raw.MAX_HEIGHT ?? 500)
    const baseOptions = {
      readOnly: true,
      minimap: { enabled: false },
      lineNumbers: 'on',
      wordWrap: 'on',
      wrappingIndent: 'same',
      revealDebounceMs: 75,
    }
    const finalOptions = {
      MAX_HEIGHT: maxHeight,
      fontSize: codeFontSize,
      themes: buildThemeList(),
    }

    if (!diff) {
      return {
        ...baseOptions,
        ...raw,
        ...finalOptions,
      }
    }

    const diffHideUnchangedRegions = raw.diffHideUnchangedRegions === undefined
      ? { ...defaultDiffHideUnchangedRegions }
      : resolveDiffHideUnchangedRegionsOption(raw.diffHideUnchangedRegions)
    const hideUnchangedRegions = raw.hideUnchangedRegions === undefined
      ? undefined
      : resolveDiffHideUnchangedRegionsOption(raw.hideUnchangedRegions)
    const streamPreviewDiff = resolvedStream !== false && resolvedLoading !== false
    const activeDiffHideUnchangedRegions = streamPreviewDiff
      ? { ...disabledDiffHideUnchangedRegions }
      : diffHideUnchangedRegions
    const activeHideUnchangedRegions = streamPreviewDiff
      ? { ...disabledDiffHideUnchangedRegions }
      : hideUnchangedRegions
    const experimental = {
      ...((raw.experimental as Record<string, unknown> | undefined) ?? {}),
    }
    const diffUnchangedRegionStyle = raw.diffUnchangedRegionStyle ?? 'line-info'
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
      lineDecorationsWidth: 4,
      lineNumbersMinChars: 2,
      glyphMargin: false,
      renderOverviewRuler: false,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      scrollBeyondLastLine: false,
      diffHideUnchangedRegions: activeDiffHideUnchangedRegions,
      useInlineViewWhenSpaceIsLimited: raw.useInlineViewWhenSpaceIsLimited ?? false,
      diffLineStyle: 'background',
      diffAppearance: 'auto',
      diffUnchangedRegionStyle,
      diffHunkActionsOnHover: false,
      experimental,
    }

    return {
      ...baseOptions,
      ...diffDefaults,
      ...raw,
      experimental,
      ...(activeHideUnchangedRegions === undefined ? {} : { hideUnchangedRegions: activeHideUnchangedRegions }),
      diffHideUnchangedRegions: activeDiffHideUnchangedRegions,
      ...finalOptions,
    }
  }

  function syncRuntimeMonacoOptions() {
    const nextOptions = {
      ...resolvedMonacoOptions,
      theme: requestedTheme,
    }
    if (!runtimeMonacoOptions) {
      runtimeMonacoOptions = nextOptions
      return runtimeMonacoOptions
    }
    for (const key of Object.keys(runtimeMonacoOptions)) {
      if (!(key in nextOptions))
        delete runtimeMonacoOptions[key]
    }
    Object.assign(runtimeMonacoOptions, nextOptions)
    return runtimeMonacoOptions
  }

  async function ensureMonaco() {
    if (helpers || useFallback || typeof window === 'undefined')
      return
    if (ensureMonacoPromise)
      return ensureMonacoPromise

    ensureMonacoPromise = (async () => {
      const mod = await getUseMonaco()
      if (!mounted)
        return
      if (!mod || typeof mod.useMonaco !== 'function') {
        useFallback = true
        return
      }

      helpers = mod.useMonaco(syncRuntimeMonacoOptions())
      lastThemeRequest = requestedTheme
    })().finally(() => {
      ensureMonacoPromise = null
    })
    return ensureMonacoPromise
  }

  function queueThemeSync() {
    if (!helpers || !requestedTheme || requestedTheme === lastThemeRequest)
      return
    lastThemeRequest = requestedTheme
    void Promise.resolve(helpers.setTheme?.(requestedTheme)).catch((error) => {
      if (typeof console !== 'undefined')
        console.warn('[markstream-svelte] Failed to apply Monaco theme:', error)
    })
  }

  async function syncEditor() {
    if (!mounted || !shouldRender || !editorHost || collapsed || shouldDelayEditor || shouldDeferStreamingLanguage)
      return

    await ensureMonaco()
    if (!mounted || useFallback || !helpers)
      return
    syncRuntimeMonacoOptions()

    const desiredKind: 'single' | 'diff' = diff ? 'diff' : 'single'
    const hasEditorView = desiredKind === 'diff'
      ? Boolean(helpers.getDiffEditorView?.())
      : Boolean(helpers.getEditorView?.())
    const hasEditor = hasEditorView && hasRenderedEditorDom(desiredKind)

    if (!hasEditor || editorKind !== desiredKind) {
      await recreateEditor(desiredKind)
      if (!mounted || useFallback || !helpers)
        return
      if (!hasRenderedEditorDom(desiredKind) || editorKind !== desiredKind)
        return
    }

    try {
      if (diff && typeof helpers.updateDiff === 'function')
        await Promise.resolve(helpers.updateDiff(originalCode, updatedCode || code, monacoLanguage))
      else if (typeof helpers.updateCode === 'function') {
        await Promise.resolve(helpers.updateCode(code, monacoLanguage))
        scheduleEditorTokenization()
      }
      queueThemeSync()
      applyEditorOptions()
      scheduleEditorHeightSync()
    }
    catch (error) {
      markEditorFallback(error)
    }
  }

  function hasRenderedEditorDom(kind: 'single' | 'diff') {
    if (!editorHost)
      return false
    return kind === 'diff'
      ? Boolean(editorHost.querySelector('.monaco-diff-editor'))
      : Boolean(editorHost.querySelector('.monaco-editor'))
  }

  async function recreateEditor(kind: 'single' | 'diff') {
    if (!editorHost || !helpers || createEditorPromise)
      return createEditorPromise

    const creationId = ++lifecycleId
    editorReady = false
    createEditorPromise = (async () => {
      try {
        cleanupEditor(false)
        if (!mounted || !editorHost || lifecycleId !== creationId)
          return
        editorHost.replaceChildren()
        lastLayoutWidth = null
        lastLayoutHeight = null

        if (kind === 'diff' && typeof helpers.createDiffEditor === 'function') {
          await helpers.createDiffEditor(editorHost, originalCode, updatedCode || code, monacoLanguage)
          await Promise.resolve(helpers.updateDiff?.(originalCode, updatedCode || code, monacoLanguage))
          editorKind = 'diff'
        }
        else {
          await helpers.createEditor(editorHost, code, monacoLanguage)
          await Promise.resolve(helpers.updateCode?.(code, monacoLanguage))
          editorKind = 'single'
        }
        applyEditorOptions()
        editorReady = true
        bindEditorHeightSync()
        scheduleEditorHeightSync()
        queueThemeSync()
      }
      catch (error) {
        if (mounted) {
          markEditorFallback(error)
        }
      }
    })().finally(() => {
      createEditorPromise = null
    })

    return createEditorPromise
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
      await ensureMonaco()
      if (!mounted || useFallback || !helpers)
        return
      syncRuntimeMonacoOptions()
      const desiredKind: 'single' | 'diff' = diff ? 'diff' : 'single'
      if (!hasRenderedEditorDom(desiredKind) || editorKind !== desiredKind)
        await recreateEditor(desiredKind)
      if (!mounted || useFallback || !helpers || !hasRenderedEditorDom(desiredKind) || editorKind !== desiredKind)
        return
      if (diff) {
        await Promise.resolve(helpers.updateDiff?.(originalCode, updatedCode || code, monacoLanguage))
        helpers.refreshDiffPresentation?.()
        applyEditorOptions()
        scheduleEditorHeightSync()
        return
      }
      await Promise.resolve(helpers.updateCode?.(code, monacoLanguage))
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
    return new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()))
  }

  function cleanupEditor(disposeHelpers = true) {
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
    editorReady = false
    lastLayoutWidth = null
    lastLayoutHeight = null
    if (disposeHelpers) {
      helpers = null
      runtimeMonacoOptions = null
      ensureMonacoPromise = null
      lastThemeRequest = ''
    }
  }

  function applyEditorOptions() {
    const target = diff ? helpers?.getDiffEditorView?.() : helpers?.getEditorView?.()
    target?.updateOptions?.({ fontSize: codeFontSize, automaticLayout: false })
    scheduleEditorHeightSync()
  }

  function getMaxHeightValue() {
    const raw = resolvedMonacoOptions.MAX_HEIGHT
    if (raw === 'none' || raw == null)
      return Number.POSITIVE_INFINITY
    const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw))
    return Number.isFinite(value) && value > 0 ? value : 500
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
      return
    }

    const editor = helpers?.getEditorView?.()
    bind(editor, 'onDidContentSizeChange')
    bind(editor, 'onDidLayoutChange')
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

  function syncEditorHostHeight() {
    if (!editorHost || !helpers || !editorReady || collapsed)
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
    editorHost.style.overflow = diff ? 'hidden' : (contentHeight > nextHeight ? 'auto' : 'hidden')
    layoutEditor(nextHeight)
  }

  function getEditorHostMinHeight() {
    if (!editorHost || typeof window === 'undefined')
      return 0
    const values = [
      window.getComputedStyle(editorHost.parentElement || editorHost).minHeight,
      window.getComputedStyle(editorHost).minHeight,
    ]
    for (const value of values) {
      const parsed = Number.parseFloat(value)
      if (Number.isFinite(parsed) && parsed > 0)
        return Math.ceil(parsed)
    }
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
        return Math.ceil(height + 1)
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

      const selectors = [
        '.editor.original .view-lines .view-line',
        '.editor.modified .view-lines .view-line',
        '.editor.original .view-zones > div',
        '.editor.modified .view-zones > div',
        '.editor.original .margin-view-zones > div',
        '.editor.modified .margin-view-zones > div',
        '.editor.original .diff-hidden-lines',
        '.editor.modified .diff-hidden-lines',
        '.stream-monaco-diff-unchanged-bridge',
      ]

      let bottom = 0
      for (const node of Array.from(container.querySelectorAll<HTMLElement>(selectors.join(',')))) {
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

      if (bottom > 0)
        return Math.ceil(bottom + 1)

      const diffRoot = container.querySelector<HTMLElement>('.monaco-diff-editor')
      const diffHeight = diffRoot?.getBoundingClientRect?.().height ?? 0
      return diffHeight > 0 ? Math.ceil(diffHeight + 1) : null
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
    class:is-plain-text={monacoLanguage === 'plaintext'}
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
          <div bind:this={editorHost} class:is-hidden={showPreFallback} class="code-editor-container"></div>
        {/if}
        {#if showPreFallback}
          <pre class="code-pre-fallback"><code class={preLanguageClass ? `language-${preLanguageClass}` : undefined}>{code}</code></pre>
        {/if}
      </div>
    {/if}

    {#if previewOpen && isPreviewable}
      <HtmlPreviewFrame code={code} title={previewTitle} isDark={resolvedIsDark} {htmlPreviewAllowScripts} {htmlPreviewSandbox} onClose={() => (previewOpen = false)} />
    {/if}
  </div>
{/if}
