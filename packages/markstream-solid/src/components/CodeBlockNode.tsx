import type { JSX } from 'solid-js'
import type { NodeComponentProps } from '../customComponents'
import type { StreamDiffsRuntimeHelpers } from '../optional/streamDiffs'
import type { CodeBlockNodeProps, CodeBlockPreviewPayload } from '../types/component-props'
import { buildStreamDiffsSurfaceCSS, estimateDiffStats, isDiffCodeBlock, preCodeThemeLooksDark, resolveCodeBlockHeader, resolveDiffHideUnchangedRegionsOption, resolvePreCodeThemePalette, resolvePreCodeVisualOptions } from 'markstream-core'
import { createEffect, createMemo, createSignal, mergeProps, onCleanup, onMount, Show, useContext } from 'solid-js'
import { MarkstreamConfigContext } from '../configuration'
import { useSafeI18n } from '../i18n/useSafeI18n'
import { getStreamDiffsRuntime } from '../optional/streamDiffs'
import { getStreamDiffsWorkerPool, syncStreamDiffsWorkerTheme } from '../streamDiffsWorker'
import { hideTooltip, showTooltipForAnchor } from '../tooltip/singletonTooltip'
import { copyTextToClipboard } from '../utils/clipboard'
import { languageIconsRevision, languageMap, normalizeLanguageIdentifier, resolveLanguageId } from '../utils/languageIcon'
import { resolveLanguageIcon } from '../utils/resolveLanguageIcon'
import { HtmlPreviewFrame } from './HtmlPreviewFrame'
import { useNodeLifecycle } from './lifecycle'
import { PreCodeNode } from './PreCodeNode'
import { ToolbarButton } from './ToolbarButton'
import { useHeavyNodeVisibility } from './viewport'

export type SolidCodeBlockNodeProps = CodeBlockNodeProps & Omit<NodeComponentProps, 'node'> & {
  headerLeft?: JSX.Element | (() => JSX.Element)
  headerRight?: JSX.Element | (() => JSX.Element)
  onCopy?: (code: string) => void
  onPreviewCode?: (payload: CodeBlockPreviewPayload) => void
}
export function CodeBlockNode(input: SolidCodeBlockNodeProps): JSX.Element {
  const props = mergeProps({ isShowPreview: true, showHeader: true, showCopyButton: true, showCollapseButton: true, showExpandButton: true, showFontSizeButtons: true, enableFontSizeControl: true, showPreviewButton: true }, () => ({
    isDark: input.context?.isDark,
    stream: input.context?.codeBlockStream,
    showTooltips: input.context?.showTooltips,
    darkTheme: input.context?.codeBlockThemes?.darkTheme,
    lightTheme: input.context?.codeBlockThemes?.lightTheme,
    themes: input.context?.codeBlockThemes?.themes,
    minWidth: input.context?.codeBlockThemes?.minWidth,
    maxWidth: input.context?.codeBlockThemes?.maxWidth,
    ...input.context?.codeBlockProps,
    codeBlockOptions: input.context?.codeBlockOptions,
  }), input)
  const { t } = useSafeI18n()
  const configuration = useContext(MarkstreamConfigContext)
  let container!: HTMLDivElement
  let host!: HTMLDivElement
  let menu!: HTMLDivElement
  let moreButton!: HTMLButtonElement
  let helpers: StreamDiffsRuntimeHelpers | undefined
  let appliedTheme: string | undefined
  let appliedFontSize: number | undefined
  let disposed = false
  let version = 0
  let kind: boolean | undefined
  let work = Promise.resolve()
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  const runtimeOptions: Record<string, unknown> = {}
  const inViewport = useHeavyNodeVisibility(props, () => container)
  const [ready, setReady] = createSignal(false)
  const [resolved, setResolved] = createSignal(false)
  const [error, setError] = createSignal('')
  const [collapsed, setCollapsed] = createSignal(false)
  const [expanded, setExpanded] = createSignal(false)
  const [more, setMore] = createSignal(false)
  const [preview, setPreview] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [fontSize, setFontSize] = createSignal(props.codeBlockOptions?.fontSize ?? 12)
  const loading = createMemo(() => props.loading ?? props.node.loading === true)
  const language = createMemo(() => {
    const raw = props.node.raw ?? ''
    const incompleteInfo = /^(?:`{3,}|~{3,})/.test(raw.trimStart()) && !/[\r\n]/.test(raw)
    if (loading() && (incompleteInfo || !props.node.code))
      return 'plain'
    return normalizeLanguageIdentifier(String(props.node.language ?? ''))
  })
  const runtimeLanguage = createMemo(() => resolveLanguageId(language()) === 'plaintext' ? 'text' : resolveLanguageId(language()))
  const code = createMemo(() => loading() ? props.node.code : props.node.code.replace(/\r\n$|\n$|\r$/, ''))
  const diff = createMemo(() => isDiffCodeBlock(props.node))
  const original = createMemo(() => String(props.node.originalCode ?? ''))
  const updated = createMemo(() => String(props.node.updatedCode ?? '') || code())
  const stats = createMemo(() => diff() ? estimateDiffStats(original(), updated()) : undefined)
  const header = createMemo(() => resolveCodeBlockHeader(props.node.raw, languageMap[language()] || language() || 'Plain Text', diff()))
  const icon = createMemo(() => {
    languageIconsRevision()
    return resolveLanguageIcon(language(), configuration().languageIconResolver)
  })
  const theme = createMemo(() => typeof props.theme === 'string' ? props.theme : props.isDark ? props.theme?.dark ?? props.darkTheme ?? props.themes?.[0] ?? 'vitesse-dark' : props.theme?.light ?? props.lightTheme ?? props.themes?.[1] ?? 'vitesse-light')
  const surfaceDark = createMemo(() => preCodeThemeLooksDark(theme(), props.isDark === true))
  const visual = createMemo(() => resolvePreCodeVisualOptions({ ...props.codeBlockOptions, fontSize: fontSize() }))
  const palette = createMemo(() => resolvePreCodeThemePalette(props))
  const previewable = createMemo(() => props.isShowPreview && (language() === 'html' || language() === 'svg'))
  const showNumbers = createMemo(() => props.showLineNumbers ?? props.codeBlockOptions?.disableLineNumbers !== true)
  const cssSize = (value: string | number | undefined) => typeof value === 'number' ? `${value}px` : value
  const configuredFont = createMemo(() => props.codeBlockOptions?.fontSize ?? 12)
  createEffect(() => setFontSize(configuredFont()))
  createEffect(() => {
    const isLoading = loading()
    const source = code()
    const lang = runtimeLanguage()
    const isDiff = diff()
    const before = original()
    const after = updated()
    const options = props.codeBlockOptions
    const requestedTheme = theme()
    const themes = props.themes
    const dark = surfaceDark()
    const numbers = showNumbers()
    const font = fontSize()
    const delayed = !inViewport() || (loading() && (props.stream === false || !source.trim())) || collapsed()
    const token = ++version
    if (delayed) {
      if (loading() && props.stream === false)
        setReady(false)
      return
    }
    setResolved(false)
    const nextOptions: Record<string, unknown> = {
      ...(isDiff ? { diffStyle: 'split', expandUnchanged: false, collapsedContextThreshold: 5, hunkSeparators: 'line-info', parseDiffOptions: { context: 2, ...options?.parseDiffOptions } } : {}),
      ...options,
      theme: requestedTheme,
      themes: themes ?? [props.darkTheme ?? 'vitesse-dark', props.lightTheme ?? 'vitesse-light'],
      themeType: dark ? 'dark' : 'light',
      disableFileHeader: true,
      disableLineNumbers: !numbers,
      fontSize: font,
      fontFamily: visual().fontFamily,
      lineHeight: visual().lineHeight,
      wordWrap: visual().overflow === 'wrap' ? 'on' : 'off',
      overflow: visual().overflow,
      unsafeCSS: buildStreamDiffsSurfaceCSS(visual().overflow, options?.unsafeCSS),
      MAX_HEIGHT: expanded() ? Infinity : options?.maxHeight ?? 500,
      workerManager: options?.workerManager ?? getStreamDiffsWorkerPool() ?? undefined,
      stream: false,
    }
    for (const key of ['maxHeight', 'padding', 'tabSize', 'language', 'languages', 'onThemeChange', 'renderCustomHeader', 'renderHeaderMetadata', 'renderHeaderPrefix'])
      delete nextOptions[key]
    for (const key of Object.keys(runtimeOptions))
      delete runtimeOptions[key]
    Object.assign(runtimeOptions, nextOptions)
    work = work.then(async () => {
      if (disposed || token !== version)
        return
      const runtime = await getStreamDiffsRuntime()
      if (!runtime) {
        if (!disposed)
          setResolved(true)
        return
      }
      if (disposed || token !== version)
        return
      if (helpers && kind !== isDiff) {
        helpers.cleanupEditor?.()
        helpers = undefined
        appliedTheme = undefined
        appliedFontSize = undefined
        host.replaceChildren()
        setReady(false)
      }
      if (appliedTheme !== requestedTheme)
        await syncStreamDiffsWorkerTheme(requestedTheme)
      if (disposed || token !== version)
        return
      if (!helpers) {
        helpers = runtime.createCodeBlockRuntime(runtimeOptions)
        kind = isDiff
        if (isDiff)
          await helpers.createDiffEditor?.(host, before, after, lang)
        else
          await helpers.createEditor?.(host, source, lang)
      }
      else if (isDiff) {
        await helpers.updateDiff?.(before, after, lang)
      }
      else {
        await helpers.updateCode?.(source, lang)
      }
      if (disposed) {
        helpers.cleanupEditor?.()
        return
      }
      const view = isDiff ? helpers.getDiffEditorView?.() : helpers.getEditorView?.()
      if (view?.updateOptions && appliedFontSize !== font) {
        view.updateOptions({ fontSize: font })
        appliedFontSize = font
      }
      if (appliedTheme !== requestedTheme) {
        await helpers.setTheme?.(requestedTheme)
        appliedTheme = requestedTheme
      }
      if (!isLoading) {
        if (isDiff)
          await helpers.finalizeDiff?.()
        else
          await helpers.finalizeCode?.()
      }
      if (disposed || token !== version)
        return
      const visuallyReady = await helpers.whenVisualReady?.()
      if (!disposed && token === version && visuallyReady !== false) {
        setError('')
        setReady(true)
        setResolved(true)
      }
    }).catch((cause) => {
      if (!disposed) {
        helpers?.cleanupEditor?.()
        helpers = undefined
        appliedTheme = undefined
        appliedFontSize = undefined
        host.replaceChildren()
        setReady(false)
        setError(String(cause))
        setResolved(true)
      }
    })
  })
  createEffect(() => {
    if (!previewable())
      setPreview(false)
  })
  onMount(() => {
    const dismiss = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== 'Escape')
        return
      if (event instanceof KeyboardEvent || (!menu?.contains(event.target as Node) && !moreButton?.contains(event.target as Node)))
        setMore(false)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismiss)
    onCleanup(() => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismiss)
    })
  })
  onCleanup(() => {
    disposed = true
    version++
    clearTimeout(copyTimer)
    hideTooltip(true)
    helpers?.cleanupEditor?.()
  })
  useNodeLifecycle(props, () => inViewport() && !resolved() && !collapsed(), () => container)
  async function copy() {
    const source = props.node.code
    if (props.clipboardWriter) {
      try {
        await props.clipboardWriter(source)
      }
      catch {
        return
      }
    }
    else if (!await copyTextToClipboard(source)) {
      return
    }
    if (disposed)
      return
    setCopied(true)
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => setCopied(false), 1000)
    props.onCopy?.(source)
    props.context?.events.onCopy?.(source)
  }
  function openPreview() {
    setMore(false)
    const listener = props.onPreviewCode ?? props.context?.events.onHandleArtifactClick
    if (listener) {
      listener({ node: props.node, artifactType: language() === 'html' ? 'text/html' : 'image/svg+xml', artifactTitle: t(language() === 'html' ? 'artifacts.htmlPreviewTitle' : 'artifacts.svgPreviewTitle'), id: `temp-${language()}-${Date.now()}` })
    }
    else if (language() === 'html') {
      setPreview(value => !value)
    }
  }
  const buttonProps = () => ({ showTooltips: props.showTooltips, isDark: props.isDark })
  const moreHover: JSX.EventHandler<HTMLButtonElement, MouseEvent | FocusEvent> = (event) => {
    if (props.showTooltips !== false)
      showTooltipForAnchor(event.currentTarget, t('common.more'), 'top', false, undefined, props.isDark)
  }
  createEffect(() => {
    if (props.showTooltips === false)
      hideTooltip(true)
  })

  return (
    <div ref={container} class="code-block-container" classList={{ 'markstream-solid': !props.context, 'dark': !!props.isDark, 'is-collapsed': collapsed(), 'is-expanded': expanded() }} data-code-language={language()} data-runtime-error={error() || undefined} data-markstream-pending={!resolved() ? 'true' : undefined} aria-busy={loading()} style={{ 'min-width': cssSize(props.minWidth), 'max-width': cssSize(props.maxWidth), '--markstream-code-font-size': `${fontSize()}px`, '--markstream-code-fallback-bg': palette().background, '--markstream-code-fallback-fg': palette().foreground }}>
      <Show when={props.showHeader}>
        <div class="code-block-header">
          <Show
            when={props.headerLeft !== undefined}
            fallback={(
              <div class="code-block-title code-header-main">
                <span class="code-block-language-icon" innerHTML={icon()} />
                <span class="code-header-title">
                  {header().title}
                  <Show when={header().caption}><small>{header().caption}</small></Show>
                </span>
              </div>
            )}
          >
            {typeof props.headerLeft === 'function' ? props.headerLeft() : props.headerLeft}
          </Show>
          <Show
            when={props.headerRight !== undefined}
            fallback={(
              <div class="code-block-actions code-header-actions">
                <Show when={stats()}>
                  <span class="code-diff-stats" aria-label={`Added ${stats()!.added}, removed ${stats()!.removed}`}>
                    <span class="removed">
                      -
                      {stats()!.removed}
                    </span>
                    <span class="added">
                      +
                      {stats()!.added}
                    </span>
                  </span>
                </Show>
                <Show when={props.showCopyButton}>
                  <ToolbarButton {...buttonProps()} label={t(copied() ? 'common.copied' : 'common.copy')} onClick={() => void copy()}>
                    <svg viewBox="0 0 24 24" class="action-icon" aria-hidden="true">
                      <Show
                        when={copied()}
                        fallback={(
                          <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                            <rect width="14" height="14" x="8" y="8" rx="2" />
                            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                          </g>
                        )}
                      >
                        <path fill="none" stroke="currentColor" stroke-width="2" d="m5 12 4 4L19 6" />
                      </Show>
                    </svg>
                  </ToolbarButton>
                </Show>
                <Show when={props.showCollapseButton}><ToolbarButton {...buttonProps()} label={t(collapsed() ? 'common.expand' : 'common.collapse')} pressed={collapsed()} onClick={() => setCollapsed(value => !value)}><svg viewBox="0 0 24 24" class="action-icon" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d={collapsed() ? 'm9 5 7 7-7 7' : 'm5 9 7 7 7-7'} /></svg></ToolbarButton></Show>
                <Show when={(props.showFontSizeButtons && props.enableFontSizeControl) || props.showExpandButton || (previewable() && props.showPreviewButton)}>
                  <div class="code-more">
                    <button
                      ref={moreButton}
                      type="button"
                      class="code-action-btn"
                      aria-label={t('common.more')}
                      aria-haspopup="menu"
                      aria-expanded={more()}
                      onMouseEnter={moreHover}
                      onFocus={moreHover}
                      onMouseLeave={() => hideTooltip()}
                      onBlur={() => hideTooltip()}
                      onClick={() => {
                        hideTooltip(true)
                        setMore(value => !value)
                      }}
                    >
                      <svg viewBox="0 0 24 24" class="action-icon" aria-hidden="true">
                        <g fill="currentColor">
                          <circle cx="12" cy="5" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="19" r="2" />
                        </g>
                      </svg>
                    </button>
                    <Show when={more()}>
                      <div ref={menu} class="code-more-menu" role="menu">
                        <Show when={props.showFontSizeButtons && props.enableFontSizeControl}>
                          <ToolbarButton {...buttonProps()} menu label={t('common.fontSmaller')} disabled={fontSize() <= 10} onClick={() => setFontSize(size => Math.max(10, size - 1))} />
                          <ToolbarButton {...buttonProps()} menu label={t('common.fontReset')} disabled={fontSize() === (props.codeBlockOptions?.fontSize ?? 12)} onClick={() => setFontSize(props.codeBlockOptions?.fontSize ?? 12)} />
                          <ToolbarButton {...buttonProps()} menu label={t('common.fontLarger')} disabled={fontSize() >= 36} onClick={() => setFontSize(size => Math.min(36, size + 1))} />
                        </Show>
                        <Show when={props.showExpandButton}>
                          <ToolbarButton
                            {...buttonProps()}
                            menu
                            label={t(expanded() ? 'common.collapse' : 'common.expand')}
                            onClick={() => {
                              setExpanded(value => !value)
                              setMore(false)
                            }}
                          />
                        </Show>
                        <Show when={previewable() && props.showPreviewButton}><ToolbarButton {...buttonProps()} menu label={t('common.preview')} onClick={openPreview} /></Show>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            )}
          >
            {typeof props.headerRight === 'function' ? props.headerRight() : props.headerRight}
          </Show>
        </div>
      </Show>
      <div class="code-block-body" style={{ 'display': collapsed() ? 'none' : undefined, 'max-height': expanded() ? 'none' : `${props.codeBlockOptions?.maxHeight ?? 500}px`, 'overflow': expanded() ? 'visible' : 'auto' }}>
        <div ref={host} class="code-block-editor code-editor-container" style={{ 'position': ready() ? undefined : 'absolute', 'visibility': ready() ? undefined : 'hidden', 'pointer-events': ready() ? undefined : 'none', 'min-width': '0', 'width': '100%', 'top': '0', 'left': '0', '--diffs-font-family': visual().fontFamily, '--diffs-font-size': `${fontSize()}px`, '--diffs-line-height': `${visual().lineHeight}px`, '--diffs-tab-size': String(visual().tabSize), '--diffs-scrollbar-gutter-override': '0px', '--diffs-gap-block': props.codeBlockOptions?.padding != null ? `${visual().padding}px` : undefined }} />
        <Show when={!ready()}><Show when={props.stream === false && loading()} fallback={<PreCodeNode themeName={palette().name} node={props.node} context={props.context} loading={loading()} showLineNumbers={showNumbers()} diffInline={props.codeBlockOptions?.diffStyle === 'unified'} diffHideUnchangedRegions={resolveDiffHideUnchangedRegionsOption(props.codeBlockOptions)} codeBlockOptions={{ ...props.codeBlockOptions, fontSize: fontSize() }} />}><div class="code-block-loading" role="status">Loading code…</div></Show></Show>
      </div>
      <Show when={preview()}><HtmlPreviewFrame code={props.node.code} isDark={props.isDark} htmlPreviewAllowScripts={props.htmlPreviewAllowScripts} htmlPreviewSandbox={props.htmlPreviewSandbox} onClose={() => setPreview(false)} /></Show>
    </div>
  )
}
