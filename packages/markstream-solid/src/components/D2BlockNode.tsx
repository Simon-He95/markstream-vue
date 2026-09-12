import type { SolidRenderableNode, SolidRenderContext } from '../node-helpers'
import { createEffect, createSignal, onCleanup } from 'solid-js'
import { getD2 } from '../d2'
import { useSafeI18n } from '../i18n/useSafeI18n'
import { getString } from '../node-helpers'
import { copyTextToClipboard, downloadSvgMarkup } from '../richBlockHelpers'
import { extractRenderedSvg, toSafeSvgMarkup } from '../sanitizeSvg'
import { hideTooltip, showTooltipForAnchor } from '../tooltip/singletonTooltip'

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

export interface D2BlockNodeProps {
  node: SolidRenderableNode
  context?: SolidRenderContext
  loading?: boolean
  isDark?: boolean
  maxHeight?: string | null
  themeId?: number | null
  darkThemeId?: number | null
  progressiveRender?: boolean
  progressiveIntervalMs?: number
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showExportButton?: boolean
  showCollapseButton?: boolean
}

function createD2Instance(ctor: any) {
  if (typeof ctor === 'function') {
    // D2 exposes a lower-case factory constructor in some builds.
    // eslint-disable-next-line new-cap
    const instance = new ctor()
    if (typeof instance?.compile === 'function')
      return instance
    if (typeof ctor.compile === 'function')
      return ctor
  }
  if (typeof ctor?.D2 === 'function')
    return new ctor.D2()
  return typeof ctor?.compile === 'function' ? ctor : null
}

export function D2BlockNode(props: D2BlockNodeProps) {
  const [host, setHost] = createSignal<HTMLDivElement>()
  const [error, setError] = createSignal('')
  const [svgMarkup, setSvgMarkup] = createSignal('')
  const [showSource, setShowSource] = createSignal(false)
  const [collapsed, setCollapsed] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  let progressiveTimer: ReturnType<typeof setTimeout> | undefined
  let lastProgressiveRenderAt = 0
  const [progressiveTick, setProgressiveTick] = createSignal(0)
  let generation = 0
  let lastRenderKey = ''
  createEffect(() => {
    const target = host()
    const source = getString((props.node as any).code)
    const dark = props.isDark ?? props.context?.isDark ?? false
    const themeId = props.themeId
    const darkThemeId = props.darkThemeId
    const sourceMode = showSource()
    const isCollapsed = collapsed()
    if (!target)
      return
    void progressiveTick()
    if (!source.trim() || sourceMode || isCollapsed) {
      lastRenderKey = ''
      generation += 1
      target.replaceChildren()
      setError('')
      if (!source.trim())
        setSvgMarkup('')
      return
    }
    const renderKey = `${dark ? 'd' : 'l'}:${String(themeId ?? '')}:${String(darkThemeId ?? '')}:${source}`
    if (renderKey === lastRenderKey)
      return
    const isStreaming = props.loading ?? Boolean((props.node as any).loading)
    const interval = Math.max(0, props.progressiveIntervalMs ?? 120)
    if (props.progressiveRender !== false && isStreaming && interval > 0) {
      const elapsed = Date.now() - lastProgressiveRenderAt
      if (elapsed < interval) {
        if (progressiveTimer)
          clearTimeout(progressiveTimer)
        progressiveTimer = setTimeout(() => {
          progressiveTimer = undefined
          setProgressiveTick(value => value + 1)
        }, interval - elapsed)
        return
      }
    }
    if (progressiveTimer) {
      clearTimeout(progressiveTimer)
      progressiveTimer = undefined
    }
    lastRenderKey = renderKey
    const token = ++generation
    lastProgressiveRenderAt = Date.now()
    void (async () => {
      try {
        const ctor = await getD2()
        const instance = createD2Instance(ctor)
        if (token !== generation || !instance?.compile || !instance?.render)
          throw new Error('D2 renderer is not available.')
        const compiled = await instance.compile(source)
        if (token !== generation)
          return
        const diagram = compiled?.diagram ?? compiled
        const options = { ...(compiled?.renderOptions ?? compiled?.options ?? {}) }
        options.themeID = dark && darkThemeId != null ? darkThemeId : themeId ?? options.themeID
        options.darkThemeID = null
        options.darkThemeOverrides = null
        if (dark) {
          options.themeOverrides = {
            ...DARK_THEME_OVERRIDES,
            ...(options.themeOverrides ?? {}),
          }
        }
        const rendered = await instance.render(diagram, options)
        if (token !== generation)
          return
        const svg = toSafeSvgMarkup(extractRenderedSvg(rendered))
        if (!svg)
          throw new Error('D2 rendered empty SVG.')
        const markup = svg.replace('<svg', '<svg class="markstream-d2-root-svg"')
        target.innerHTML = markup
        setSvgMarkup(markup)
        setError('')
      }
      catch (reason) {
        if (token !== generation)
          return
        target.replaceChildren()
        setSvgMarkup('')
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    })()
  })
  onCleanup(() => {
    generation += 1
    if (copyTimer)
      clearTimeout(copyTimer)
    if (progressiveTimer)
      clearTimeout(progressiveTimer)
  })
  const { t } = useSafeI18n()
  const resolvedShowHeader = () => props.showHeader ?? true
  const resolvedShowModeToggle = () => props.showModeToggle ?? true
  const resolvedShowCopyButton = () => props.showCopyButton ?? true
  const resolvedShowExportButton = () => props.showExportButton ?? true
  const resolvedShowCollapseButton = () => props.showCollapseButton ?? true
  const isStreaming = () => props.loading ?? Boolean((props.node as any).loading)
  const showLoading = () => !showSource() && !collapsed() && !svgMarkup() && isStreaming()
  const fallbackVisible = () => !showLoading() && (showSource() || !!error() || !svgMarkup())
  const resolvedIsDark = () => props.isDark ?? props.context?.isDark ?? false
  const showButtonTooltip = (event: MouseEvent | FocusEvent, text: string) => {
    const target = event.currentTarget as HTMLElement | null
    if (!target || (target instanceof HTMLButtonElement && target.disabled))
      return
    showTooltipForAnchor(target, text, 'top', false, undefined, resolvedIsDark())
  }
  const hideBtnTooltip = () => hideTooltip()
  return (
    <div class={`markstream-solid-enhanced-block markstream-solid-enhanced-block--d2${(props.isDark ?? props.context?.isDark) ? ' dark' : ''}${isStreaming() || showLoading() ? ' is-rendering' : ''}`} data-markstream-d2="1" data-markstream-mode={showLoading() ? 'loading' : fallbackVisible() ? 'fallback' : 'preview'}>
      {resolvedShowHeader() && (
        <div class="markstream-solid-enhanced-block__header d2-block-header">
          <span class="d2-label">D2</span>
          <div class="markstream-solid-enhanced-block__actions d2-header-actions">
            {resolvedShowModeToggle() && (
              <div class="d2-mode-toggle">
                <button type="button" class={`d2-mode-btn${!showSource() ? ' is-active' : ''}`} onBlur={hideBtnTooltip} onClick={() => setShowSource(false)} onFocus={event => showButtonTooltip(event, t('common.preview') || 'Preview')} onMouseLeave={hideBtnTooltip} onMouseEnter={event => showButtonTooltip(event, t('common.preview') || 'Preview')}>{t('common.preview')}</button>
                <button type="button" class={`d2-mode-btn${showSource() ? ' is-active' : ''}`} onBlur={hideBtnTooltip} onClick={() => setShowSource(true)} onFocus={event => showButtonTooltip(event, t('common.source') || 'Source')} onMouseLeave={hideBtnTooltip} onMouseEnter={event => showButtonTooltip(event, t('common.source') || 'Source')}>{t('common.source')}</button>
              </div>
            )}
            {resolvedShowCopyButton() && (
              <button
                type="button"
                class="d2-action-btn"
                aria-label={copied() ? t('common.copied') : t('common.copy')}
                onBlur={hideBtnTooltip}
                onClick={() => {
                  const source = getString((props.node as any).code)
                  void copyTextToClipboard(source)
                  props.context?.events?.onCopy?.(source)
                  setCopied(true)
                  if (copyTimer)
                    clearTimeout(copyTimer)
                  copyTimer = setTimeout(() => setCopied(false), 1000)
                }}
                onFocus={event => showButtonTooltip(event, copied() ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'))}
                onMouseLeave={hideBtnTooltip}
                onMouseEnter={event => showButtonTooltip(event, copied() ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy'))}
              >
                {copied() ? t('common.copied') : t('common.copy')}
              </button>
            )}
            {resolvedShowExportButton() && (
              <button
                type="button"
                class="d2-action-btn"
                aria-label={t('common.export')}
                disabled={!svgMarkup() || showSource() || collapsed()}
                onBlur={hideBtnTooltip}
                onClick={() => downloadSvgMarkup(svgMarkup(), `d2-diagram-${Date.now()}.svg`)}
                onFocus={event => showButtonTooltip(event, t('common.export') || 'Export')}
                onMouseLeave={hideBtnTooltip}
                onMouseEnter={event => showButtonTooltip(event, t('common.export') || 'Export')}
              >
                {t('common.export')}
              </button>
            )}
            {resolvedShowCollapseButton() && (
              <button
                type="button"
                class="d2-action-btn"
                aria-label={collapsed() ? t('common.expand') : t('common.collapse')}
                aria-pressed={collapsed() ? 'true' : 'false'}
                onBlur={hideBtnTooltip}
                onClick={() => setCollapsed(value => !value)}
                onFocus={event => showButtonTooltip(event, collapsed() ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))}
                onMouseLeave={hideBtnTooltip}
                onMouseEnter={event => showButtonTooltip(event, collapsed() ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))}
              >
                {collapsed() ? t('common.expand') : t('common.collapse')}
              </button>
            )}
          </div>
        </div>
      )}
      <div ref={setHost} class="d2-svg" hidden={fallbackVisible() || collapsed() || showLoading()} style={{ 'max-height': props.maxHeight || undefined, '--ms-d2-render-max-height': props.maxHeight || undefined }} />
      {showLoading() && (
        <div class="d2-loading mermaid-loading" data-markstream-diagram-loading="d2">
          <span class="mermaid-spinner" />
          {t('common.preview')}
        </div>
      )}
      <pre class="d2-source-fallback" hidden={!fallbackVisible() || collapsed()}>
        {getString((props.node as any).code)}
        {error() && !isStreaming() ? `\n${error()}` : ''}
      </pre>
    </div>
  )
}
