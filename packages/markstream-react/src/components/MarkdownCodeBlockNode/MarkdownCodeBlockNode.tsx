import type { RegisterHighlightOptions, ShikiRendererOptions } from 'markstream-core'
import type { VisibilityHandle } from '../../context/viewportPriority'
import type { ShikiCodeBlockProps } from '../../types/component-props'
import {
  getHighlightRegistrationKey,
  getRuntimeShikiRegistrationConfig,
  normalizeShikiLanguage,
  registerHighlightOnce,
} from 'markstream-core'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useViewportPriority } from '../../context/viewportPriority'
import { useSafeI18n } from '../../i18n/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../tooltip/singletonTooltip'
import { isDevEnvironment } from '../../utils/devEnv'
import { getLanguageIcon, languageMap, normalizeLanguageIdentifier, subscribeLanguageIconsRevision } from '../../utils/languageIcon'

export interface MarkdownCodeBlockNodeProps extends ShikiCodeBlockProps {
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
  showPreviewButton?: boolean
  showCollapseButton?: boolean
  showFontSizeButtons?: boolean
  showTooltips?: boolean
  onCopy?: (code: string) => void
  onPreviewCode?: (payload: { type: string, content: string, title: string }) => void
}

interface ShikiRenderer {
  updateCode: (code: string, lang?: string) => void | Promise<void>
  setTheme: (theme?: string) => void | Promise<void>
  dispose: () => void
}

type HighlightRegistrationStatus = 'ready' | 'failed' | 'stale'

const isDevEnv = isDevEnvironment()

interface HighlightRegistrationConfig {
  key: string
  registerOptions: RegisterHighlightOptions
  rendererOptions: Pick<ShikiRendererOptions, 'themes' | 'langs'>
}

interface HighlightRegistrationInput {
  themes?: readonly unknown[]
  langs?: readonly unknown[]
}

interface HighlightRegistrationSnapshot extends HighlightRegistrationInput {
  key: string
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeRendererLanguage(rawLang: string | null | undefined) {
  const normalized = normalizeShikiLanguage(rawLang)
  return normalized || 'plaintext'
}

function getRenderSignature(
  configKey: string | null | undefined,
  lang: string,
  code: string,
) {
  return `${configKey ?? ''}\u0000${lang}\u0000${code}`
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
    | 'showCollapseButton'
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
    showCollapseButton: true,
    showFontSizeButtons: true,
    ...rawProps,
  }

  const codeLanguage = useMemo(() => String(props.node.language ?? ''), [props.node.language])
  const canonicalLanguage = useMemo(() => normalizeLanguageIdentifier(codeLanguage), [codeLanguage])
  const [languageIconsRevision, setLanguageIconsRevision] = useState(0)

  useEffect(() => {
    return subscribeLanguageIconsRevision(() => {
      setLanguageIconsRevision(v => v + 1)
    })
  }, [])

  const displayLanguage = useMemo(() => {
    const label = languageMap[canonicalLanguage] || canonicalLanguage
    if (!label)
      return 'Text'
    return label.charAt(0).toUpperCase() + label.slice(1)
  }, [canonicalLanguage])
  const languageIcon = useMemo(
    () => getLanguageIcon(canonicalLanguage),
    [canonicalLanguage, languageIconsRevision],
  )

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
  const [fallbackHtml, setFallbackHtml] = useState(() =>
    props.node.code
      ? `<pre class="shiki shiki-fallback"><code>${escapeHtml(props.node.code)}</code></pre>`
      : '',
  )
  const [rendererReady, setRendererReady] = useState(false)

  const [defaultFontSize, setDefaultFontSize] = useState<number>(14)
  const [fontSize, setFontSize] = useState<number>(defaultFontSize)
  const tooltipsEnabled = useMemo(() => props.showTooltips !== false, [props.showTooltips])
  const registrationInputKey = getHighlightRegistrationKey(props.themes, props.langs)
  const registrationInputRef = useRef<HighlightRegistrationSnapshot | null>(null)
  if (!registrationInputRef.current || registrationInputRef.current.key !== registrationInputKey) {
    registrationInputRef.current = {
      key: registrationInputKey,
      themes: props.themes,
      langs: props.langs,
    }
  }

  const viewportTargetRef = useRef<HTMLDivElement | null>(null)
  const codeBlockContentRef = useRef<HTMLDivElement | null>(null)
  const rendererTargetRef = useRef<HTMLDivElement | null>(null)
  const renderObserverRef = useRef<MutationObserver | null>(null)
  const rendererRef = useRef<ShikiRenderer | null>(null)
  const rendererConfigKeyRef = useRef('')
  const lastCommittedRenderSignatureRef = useRef('')
  const rendererMutationVersionRef = useRef(0)
  const pendingRenderSignatureRef = useRef<string | null>(null)
  const createRendererRef = useRef<null | ((el: HTMLElement, opts: ShikiRendererOptions) => ShikiRenderer)>(null)
  const streamMarkdownLoadPromiseRef = useRef<Promise<void> | null>(null)
  const streamMarkdownLoadFailedRef = useRef(false)
  const warnedStreamMarkdownUnavailableRef = useRef(false)
  const registerHighlightRef = useRef<((opts?: RegisterHighlightOptions) => Promise<unknown> | unknown) | null>(null)
  const warnedMissingRegisterHighlightForLangsRef = useRef(false)
  const failedRendererLanguagesRef = useRef<Set<string>>(new Set())
  const failedHighlightRegistrationKeysRef = useRef<Set<string>>(new Set())
  const registeredKeyRef = useRef<string>('')
  const highlightRegistrationSeqRef = useRef(0)
  const latestRegistrationKeyRef = useRef(registrationInputKey)
  const renderSeqRef = useRef(0)
  const mountedRef = useRef(true)
  const viewportHandleRef = useRef<VisibilityHandle | null>(null)
  const registerViewport = useViewportPriority()
  const [viewportReady, setViewportReady] = useState(() => typeof window === 'undefined')

  const getPreferredColorScheme = useCallback(() => {
    return props.isDark ? props.darkTheme : props.lightTheme
  }, [props.darkTheme, props.isDark, props.lightTheme])

  const disconnectRenderObserver = useCallback((observer?: MutationObserver | null) => {
    observer?.disconnect()
    if (!observer || renderObserverRef.current === observer)
      renderObserverRef.current = null
  }, [])

  const clearRendererTarget = useCallback(() => {
    if (rendererTargetRef.current)
      rendererTargetRef.current.innerHTML = ''
  }, [])

  const renderFallback = useCallback((code: string) => {
    pendingRenderSignatureRef.current = null
    disconnectRenderObserver()
    if (!code) {
      clearRendererTarget()
      lastCommittedRenderSignatureRef.current = ''
      setFallbackHtml('')
      setRendererReady(false)
      return
    }
    setFallbackHtml(`<pre class="shiki shiki-fallback"><code>${escapeHtml(code)}</code></pre>`)
    setRendererReady(false)
  }, [clearRendererTarget, disconnectRenderObserver])

  const clearFallback = useCallback(() => {
    disconnectRenderObserver()
    setFallbackHtml('')
    setRendererReady(true)
  }, [disconnectRenderObserver])

  const markRendererCommitted = useCallback((renderSignature: string) => {
    lastCommittedRenderSignatureRef.current = renderSignature
    clearFallback()
  }, [clearFallback])

  const hasRendererContent = useCallback(() => {
    const target = rendererTargetRef.current
    if (!target)
      return false
    if (target.childNodes.length > 0)
      return true
    return Boolean(target.textContent?.trim().length)
  }, [])

  const disposeCurrentRenderer = useCallback((updateReady = true) => {
    const current = rendererRef.current
    disconnectRenderObserver()
    rendererRef.current = null
    rendererConfigKeyRef.current = ''
    lastCommittedRenderSignatureRef.current = ''
    pendingRenderSignatureRef.current = null
    failedRendererLanguagesRef.current.clear()

    try {
      current?.dispose()
    }
    catch (err) {
      if (isDevEnv && typeof console !== 'undefined')
        console.warn('[MarkdownCodeBlockNode] Failed to dispose Shiki renderer.', err)
    }
    finally {
      clearRendererTarget()
      if (updateReady)
        setRendererReady(false)
    }
  }, [clearRendererTarget, disconnectRenderObserver])

  const nextRenderSeq = useCallback(() => {
    renderSeqRef.current += 1
    return renderSeqRef.current
  }, [])

  const isCurrentRenderSeq = useCallback((seq: number) => {
    return mountedRef.current && renderSeqRef.current === seq
  }, [])

  const startRendererReadyObserver = useCallback((seq: number, previousVersion: number) => {
    disconnectRenderObserver()

    const target = rendererTargetRef.current
    if (!target || typeof MutationObserver === 'undefined')
      return

    pendingRenderSignatureRef.current = null

    const observer = new MutationObserver(() => {
      rendererMutationVersionRef.current += 1

      const signature = pendingRenderSignatureRef.current
      if (!signature)
        return

      if (!isCurrentRenderSeq(seq)) {
        pendingRenderSignatureRef.current = null
        disconnectRenderObserver(observer)
        return
      }

      if (rendererMutationVersionRef.current === previousVersion || !hasRendererContent())
        return

      pendingRenderSignatureRef.current = null
      disconnectRenderObserver(observer)
      markRendererCommitted(signature)
    })

    renderObserverRef.current = observer
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    })
  }, [
    disconnectRenderObserver,
    hasRendererContent,
    isCurrentRenderSeq,
    markRendererCommitted,
  ])

  const clearFallbackWhenRendererReady = useCallback(async (
    seq: number,
    previousVersion: number,
    renderSignature: string,
    previousRendererHtml?: string,
  ) => {
    pendingRenderSignatureRef.current = renderSignature

    await Promise.resolve()
    if (!isCurrentRenderSeq(seq))
      return

    const rendererHasContent = hasRendererContent()
    const hasObservedMutation = rendererMutationVersionRef.current !== previousVersion
    const hasDomSnapshotChange = previousRendererHtml !== undefined
      && rendererTargetRef.current?.innerHTML !== previousRendererHtml
    if (
      rendererHasContent
      && (
        !lastCommittedRenderSignatureRef.current
        || hasObservedMutation
        || hasDomSnapshotChange
        || lastCommittedRenderSignatureRef.current === renderSignature
      )
    ) {
      pendingRenderSignatureRef.current = null
      disconnectRenderObserver()
      markRendererCommitted(renderSignature)
    }
  }, [
    disconnectRenderObserver,
    hasRendererContent,
    isCurrentRenderSeq,
    markRendererCommitted,
  ])

  const ensureStreamMarkdownLoaded = useCallback(async () => {
    if (createRendererRef.current || streamMarkdownLoadFailedRef.current)
      return
    if (streamMarkdownLoadPromiseRef.current)
      return streamMarkdownLoadPromiseRef.current

    streamMarkdownLoadPromiseRef.current = (async () => {
      try {
        const mod = await import('stream-markdown')
        const nextCreateRenderer = (mod as {
          createShikiStreamRenderer?: unknown
        }).createShikiStreamRenderer

        if (typeof nextCreateRenderer !== 'function')
          throw new TypeError('stream-markdown.createShikiStreamRenderer is not available')

        createRendererRef.current = nextCreateRenderer as NonNullable<typeof createRendererRef.current>

        const nextRegisterHighlight = (mod as {
          registerHighlight?: unknown
        }).registerHighlight

        registerHighlightRef.current = typeof nextRegisterHighlight === 'function'
          ? nextRegisterHighlight as NonNullable<typeof registerHighlightRef.current>
          : null

        streamMarkdownLoadFailedRef.current = false
        warnedStreamMarkdownUnavailableRef.current = false
      }
      catch (e) {
        streamMarkdownLoadFailedRef.current = true

        if (isDevEnv && !warnedStreamMarkdownUnavailableRef.current && typeof console !== 'undefined') {
          warnedStreamMarkdownUnavailableRef.current = true
          console.warn('[MarkdownCodeBlockNode] stream-markdown not available:', e)
        }
      }
      finally {
        streamMarkdownLoadPromiseRef.current = null
      }
    })()

    return streamMarkdownLoadPromiseRef.current
  }, [])

  const ensureHighlightRegistered = useCallback(async (
    config: HighlightRegistrationConfig,
  ): Promise<HighlightRegistrationStatus> => {
    const key = config.key

    if (latestRegistrationKeyRef.current !== key)
      return 'stale'

    if (!registerHighlightRef.current)
      return 'ready'

    if (registeredKeyRef.current === key)
      return 'ready'

    const seq = ++highlightRegistrationSeqRef.current

    try {
      await registerHighlightOnce(
        registerHighlightRef.current,
        config.registerOptions,
        key,
      )
    }
    catch {
      if (seq !== highlightRegistrationSeqRef.current || latestRegistrationKeyRef.current !== key)
        return 'stale'
      return 'failed'
    }

    if (seq !== highlightRegistrationSeqRef.current || latestRegistrationKeyRef.current !== key)
      return 'stale'

    registeredKeyRef.current = key
    return 'ready'
  }, [])

  const waitForCurrentHighlightRegistration = useCallback(async (config: HighlightRegistrationConfig) => {
    const status = await ensureHighlightRegistered(config)
    if (status !== 'failed')
      return status

    if (latestRegistrationKeyRef.current !== config.key)
      return 'stale'

    return ensureHighlightRegistered(config)
  }, [ensureHighlightRegistered])

  const createRuntimeHighlightRegistrationConfig = useCallback((
    input: HighlightRegistrationInput | null | undefined,
  ): HighlightRegistrationConfig => {
    const capabilities = {
      hasRegisterHighlight: Boolean(registerHighlightRef.current),
      hasCreateRenderer: Boolean(createRendererRef.current),
    }

    const runtimeConfig = getRuntimeShikiRegistrationConfig(input?.themes, input?.langs, capabilities)
    const effectiveRuntimeConfig = runtimeConfig.rendererOptions.langs?.length
      && failedHighlightRegistrationKeysRef.current.has(runtimeConfig.key)
      ? getRuntimeShikiRegistrationConfig(input?.themes, undefined, capabilities)
      : runtimeConfig

    if (runtimeConfig.ignoredLangs && isDevEnv && !warnedMissingRegisterHighlightForLangsRef.current && typeof console !== 'undefined') {
      warnedMissingRegisterHighlightForLangsRef.current = true
      console.warn(
        '[MarkdownCodeBlockNode] `langs` requires stream-markdown >=0.0.15 with registerHighlight(); '
        + 'ignoring `langs` and using stream-markdown default language preload.',
      )
    }

    return {
      key: effectiveRuntimeConfig.key,
      registerOptions: effectiveRuntimeConfig.registerOptions,
      rendererOptions: effectiveRuntimeConfig.rendererOptions,
    }
  }, [])

  const updateRendererWithFallback = useCallback(async (
    code: string,
    rawLang: string | null | undefined,
    seq: number,
  ) => {
    const renderer = rendererRef.current
    if (!renderer || !isCurrentRenderSeq(seq))
      return undefined

    const lang = normalizeRendererLanguage(rawLang)

    const renderPlaintext = async (originalError?: unknown) => {
      const currentRenderer = rendererRef.current
      if (!currentRenderer || !isCurrentRenderSeq(seq))
        return undefined

      if (originalError && lang !== 'plaintext')
        failedRendererLanguagesRef.current.add(lang)

      try {
        await currentRenderer.updateCode(code, 'plaintext')
        return isCurrentRenderSeq(seq) ? 'plaintext' : undefined
      }
      catch {
        return undefined
      }
    }

    if (lang !== 'plaintext' && failedRendererLanguagesRef.current.has(lang))
      return renderPlaintext()

    try {
      await renderer.updateCode(code, lang)
      return isCurrentRenderSeq(seq) ? lang : undefined
    }
    catch (err) {
      if (!isCurrentRenderSeq(seq) || lang === 'plaintext')
        return undefined

      return renderPlaintext(err)
    }
  }, [isCurrentRenderSeq])

  const initRenderer = useCallback(async () => {
    const seq = nextRenderSeq()
    const code = props.node.code
    const rawLang = props.node.language
    const registrationInput = registrationInputRef.current

    if (props.loading || !viewportReady) {
      renderFallback(code)
      return
    }

    await ensureStreamMarkdownLoaded()
    if (!isCurrentRenderSeq(seq))
      return

    let currentRegistrationConfig = createRuntimeHighlightRegistrationConfig(registrationInput)
    let key = currentRegistrationConfig.key
    latestRegistrationKeyRef.current = key

    let needsRendererReconfigure = Boolean(rendererRef.current && rendererConfigKeyRef.current !== key)
    if (needsRendererReconfigure)
      renderFallback(code)

    let highlightStatus = await waitForCurrentHighlightRegistration(currentRegistrationConfig)

    if (highlightStatus === 'failed' && currentRegistrationConfig.rendererOptions.langs?.length) {
      failedHighlightRegistrationKeysRef.current.add(currentRegistrationConfig.key)

      if (isDevEnv && typeof console !== 'undefined') {
        console.warn(
          '[MarkdownCodeBlockNode] Failed to register configured Shiki languages; retrying without `langs`.',
          { langs: currentRegistrationConfig.rendererOptions.langs },
        )
      }

      currentRegistrationConfig = createRuntimeHighlightRegistrationConfig({
        themes: registrationInput?.themes,
        langs: undefined,
      })
      key = currentRegistrationConfig.key
      latestRegistrationKeyRef.current = key

      highlightStatus = await waitForCurrentHighlightRegistration(currentRegistrationConfig)
    }

    if (!isCurrentRenderSeq(seq) || highlightStatus === 'stale')
      return

    needsRendererReconfigure = Boolean(rendererRef.current && rendererConfigKeyRef.current !== key)
    if (highlightStatus === 'failed') {
      if (needsRendererReconfigure && rendererRef.current && hasRendererContent())
        clearFallback()
      else
        renderFallback(code)
      return
    }

    if (needsRendererReconfigure)
      disposeCurrentRenderer()

    if (!codeBlockContentRef.current || !rendererTargetRef.current) {
      renderFallback(code)
      return
    }

    if (!rendererRef.current && createRendererRef.current) {
      rendererRef.current = createRendererRef.current(rendererTargetRef.current, {
        theme: getPreferredColorScheme(),
        themes: currentRegistrationConfig.rendererOptions.themes,
        langs: currentRegistrationConfig.rendererOptions.langs,
      })
      rendererConfigKeyRef.current = key
    }

    if (!rendererRef.current) {
      renderFallback(code)
      return
    }

    if (props.stream === false && props.loading) {
      renderFallback(code)
      return
    }

    renderFallback(code)
    const previousMutationVersion = rendererMutationVersionRef.current
    const previousRendererHtml = rendererTargetRef.current?.innerHTML
    startRendererReadyObserver(seq, previousMutationVersion)
    const renderedLang = await updateRendererWithFallback(code, rawLang, seq)
    if (!isCurrentRenderSeq(seq))
      return
    if (renderedLang) {
      await clearFallbackWhenRendererReady(
        seq,
        previousMutationVersion,
        getRenderSignature(key, renderedLang, code),
        previousRendererHtml,
      )
    }
    else {
      pendingRenderSignatureRef.current = null
      disconnectRenderObserver()
    }
  }, [
    nextRenderSeq,
    props.node.code,
    props.node.language,
    props.stream,
    props.loading,
    registrationInputKey,
    viewportReady,
    ensureStreamMarkdownLoaded,
    createRuntimeHighlightRegistrationConfig,
    waitForCurrentHighlightRegistration,
    disposeCurrentRenderer,
    clearFallback,
    getPreferredColorScheme,
    hasRendererContent,
    renderFallback,
    startRendererReadyObserver,
    updateRendererWithFallback,
    clearFallbackWhenRendererReady,
    disconnectRenderObserver,
    isCurrentRenderSeq,
  ])

  useEffect(() => {
    const el = viewportTargetRef.current
    if (!el)
      return
    let active = true
    const handle = registerViewport(el, { rootMargin: '400px' })
    viewportHandleRef.current = handle
    if (handle.isVisible())
      setViewportReady(true)
    handle.whenVisible.then(() => {
      if (active)
        setViewportReady(true)
    })
    return () => {
      active = false
      handle.destroy()
      viewportHandleRef.current = null
    }
  }, [registerViewport])

  useEffect(() => {
    void initRenderer().catch(() => {
      if (mountedRef.current && rendererTargetRef.current)
        renderFallback(props.node.code)
    })
  }, [initRenderer, props.node.code, renderFallback])

  // Dispose renderer on unmount only
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      renderSeqRef.current += 1
      disposeCurrentRenderer(false)
    }
  }, [disposeCurrentRenderer])

  useEffect(() => {
    if (!rendererRef.current)
      return
    if (!viewportReady)
      return
    void rendererRef.current.setTheme(getPreferredColorScheme())
  }, [getPreferredColorScheme, viewportReady])

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
    showTooltipForAnchor(btn, text, 'top', false, origin, props.isDark)
  }, [props.isDark, tooltipsEnabled])

  const onBtnLeave = useCallback(() => {
    if (!tooltipsEnabled)
      return
    hideTooltip()
  }, [tooltipsEnabled])

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
    const lowerLang = canonicalLanguage
    const artifactType = lowerLang === 'html' ? 'text/html' : 'image/svg+xml'
    const artifactTitle = lowerLang === 'html' ? 'HTML Preview' : 'SVG Preview'
    props.onPreviewCode?.({
      type: artifactType,
      content: props.node.code,
      title: artifactTitle,
    })
  }, [canonicalLanguage, isPreviewable, props])

  const contentStyle = useMemo(() => ({ fontSize: `${fontSize}px` }), [fontSize])

  const decreaseCodeFont = () => setFontSize(s => Math.max(10, s - 1))
  const increaseCodeFont = () => setFontSize(s => Math.min(36, s + 1))
  const resetCodeFont = () => setFontSize(defaultFontSize)

  useEffect(() => {
    const initial = 14
    setDefaultFontSize(initial)
    setFontSize(initial)
  }, [])

  return (
    <div
      ref={viewportTargetRef}
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
            {props.showCollapseButton && (
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
            )}

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
                onClick={(e) => {
                  setIsExpanded(v => !v)
                  onBtnHover(e, !isExpanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))
                }}
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
            overflowY: isExpanded ? 'visible' : 'auto',
            overflowX: 'auto',
          }}
        >
          <div className="code-block-render-layer">
            <div
              ref={rendererTargetRef}
              className={`code-block-render${rendererReady ? '' : ' is-staging'}`}
              style={{ visibility: rendererReady ? 'visible' : 'hidden' }}
              aria-hidden={!rendererReady}
            />
            {!rendererReady && fallbackHtml && (
              <div className="code-fallback-plain" dangerouslySetInnerHTML={{ __html: fallbackHtml }} />
            )}
          </div>
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
