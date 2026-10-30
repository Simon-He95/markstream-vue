import type { JSX } from 'solid-js'
import type { NodeComponentProps } from '../customComponents'
import type { D2BlockNodeProps, InfographicBlockNodeProps, MermaidBlockEvent, MermaidBlockNodeProps } from '../types/component-props'
import { createPanGesture } from 'markstream-core'
import { createEffect, createMemo, createSignal, mergeProps, onCleanup, onMount, Show } from 'solid-js'
import { isServer, Portal } from 'solid-js/web'
import { enhanceRenderedHtml } from '../enhanceRenderedHtml'
import { useSafeI18n } from '../i18n/useSafeI18n'
import { renderMarkdownNodeToHtml } from '../renderMarkdownHtml'
import { copyTextToClipboard } from '../utils/clipboard'
import { useNodeLifecycle } from './lifecycle'
import { PreCodeNode } from './PreCodeNode'
import { ToolbarButton } from './ToolbarButton'
import { useHeavyNodeVisibility } from './viewport'

interface DiagramEvents {
  onCopy?: (event: MermaidBlockEvent<{
    type: 'copy'
    text: string
  }>) => void
  onExport?: (event: MermaidBlockEvent<{
    type: 'export'
  }>) => void
  onOpenModal?: (event: MermaidBlockEvent<{
    type: 'open-modal'
  }>) => void
  onToggleMode?: (mode: 'source' | 'preview', event: MermaidBlockEvent<{
    type: 'toggle-mode'
    target: 'source' | 'preview'
  }>) => void
}
type DiagramProps = MermaidBlockNodeProps & D2BlockNodeProps & InfographicBlockNodeProps & Omit<NodeComponentProps, 'node'> & DiagramEvents & {
  kind: 'mermaid' | 'd2' | 'infographic'
}
export function DiagramBlockNode(input: DiagramProps): JSX.Element {
  const props = mergeProps({ showHeader: true, showModeToggle: true, showCopyButton: true, showExportButton: true, showCollapseButton: true, showFullscreenButton: true, showZoomControls: true, showTooltips: true }, () => ({ ...input.context?.[input.kind === 'mermaid' ? 'mermaidProps' : input.kind === 'd2' ? 'd2Props' : 'infographicProps'], isDark: input.context?.isDark, showTooltips: input.context?.showTooltips }), input)
  const { t } = useSafeI18n()
  let viewport!: HTMLDivElement
  let root!: HTMLDivElement
  const inViewport = useHeavyNodeVisibility(props, () => root)
  let disposed = false
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  const [pending, setPending] = createSignal(true)
  const [svg, setSvg] = createSignal('')
  const [renderError, setRenderError] = createSignal('')
  const [sourceMode, setSourceMode] = createSignal(true)
  const [collapsed, setCollapsed] = createSignal(false)
  const [fullscreen, setFullscreen] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  const [zoom, setZoom] = createSignal(1)
  const [translate, setTranslate] = createSignal({ x: 0, y: 0 })
  const [dragging, setDragging] = createSignal(false)
  const [overflowing, setOverflowing] = createSignal(false)
  let userMode = false
  const loading = createMemo(() => props.loading ?? props.node.loading === true)
  const code = createMemo(() => props.node.code)
  const pan = createPanGesture({ getTranslate: translate, setTranslate, canStart: () => !!svg() && (zoom() > 1 || fullscreen() || overflowing()), onActiveChange: setDragging })
  function resetZoom() {
    pan.stop()
    setZoom(1)
    setTranslate({ x: 0, y: 0 })
  }
  function changeZoom(delta: number) {
    setZoom(value => Math.min(5, Math.max(0.1, Math.round((value + delta) * 10) / 10)))
  }
  const settings = createMemo(() => ({
    isStrict: props.isStrict,
    enableMermaidInteractions: props.enableMermaidInteractions,
    workerTimeoutMs: props.workerTimeoutMs,
    parseTimeoutMs: props.parseTimeoutMs,
    renderTimeoutMs: props.renderTimeoutMs,
    fullRenderTimeoutMs: props.fullRenderTimeoutMs,
    themeId: props.themeId,
    darkThemeId: props.darkThemeId,
    progressiveRender: props.progressiveRender,
  }), undefined, { equals: (before, after) => Object.keys(after).every(key => before[key as keyof typeof before] === after[key as keyof typeof after]) })
  const delay = createMemo(() => loading() ? props.kind === 'd2' ? props.progressiveIntervalMs ?? 400 : props.renderDebounceMs ?? 300 : 0)
  useNodeLifecycle(props, () => inViewport() && pending(), () => root)
  createEffect(() => {
    if (!inViewport())
      return
    const content = code()
    const dark = props.isDark
    const isLoading = loading()
    const options = settings()
    const wait = delay()
    const captured = { type: 'code_block', code: content, language: props.kind, loading: isLoading, raw: '' }
    setPending(true)
    let cancelled = false
    let stage: HTMLDivElement | undefined
    let handle: {
      dispose: () => void
    } | undefined
    const render = async () => {
      stage = document.createElement('div')
      stage.style.cssText = `position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;width:${root.getBoundingClientRect().width || 800}px`
      stage.innerHTML = renderMarkdownNodeToHtml(captured as any)
      document.body.append(stage)
      try {
        handle = await enhanceRenderedHtml(stage, {
          final: props.kind === 'mermaid' ? !isLoading : props.kind === 'd2' ? !isLoading || options.progressiveRender === true : true,
          isDark: dark,
          d2ThemeId: options.themeId,
          d2DarkThemeId: options.darkThemeId,
          mermaidProps: { ...options, showHeader: false },
          d2Props: { ...options, showHeader: false },
          infographicProps: { ...options, showHeader: false },
          renderCodeBlocksAsPre: true,
          showTooltips: false,
          isCancelled: () => cancelled || disposed,
        })
        if (cancelled || disposed)
          return
        const rendered = stage.querySelector('svg')
        if (rendered) {
          viewport.replaceChildren(props.kind === 'infographic' ? rendered.cloneNode(true) : rendered)
          setSvg(new XMLSerializer().serializeToString(rendered))
          setRenderError('')
          if (!userMode)
            setSourceMode(false)
        }
        else if (!isLoading && content.trim()) {
          const failure = new Error(`${props.kind} preview could not be rendered`)
          if (props.onRenderError?.(failure, content, viewport) !== true)
            setRenderError(failure.message)
        }
      }
      catch (error) {
        if (!cancelled && !disposed && !isLoading && props.onRenderError?.(error, content, viewport) !== true)
          setRenderError(String(error))
      }
      finally {
        handle?.dispose()
        stage.remove()
        if (!cancelled && !disposed)
          setPending(false)
      }
    }
    const timer = setTimeout(() => void render(), wait)
    onCleanup(() => {
      cancelled = true
      clearTimeout(timer)
      handle?.dispose()
      stage?.remove()
    })
  })
  createEffect(() => {
    if (isServer || !fullscreen())
      return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    onCleanup(() => {
      document.body.style.overflow = previous
      pan.stop()
    })
  })
  onMount(() => {
    const measurePan = () => {
      const surface = viewport?.parentElement
      const content = viewport?.getBoundingClientRect()
      setOverflowing(!!surface && !!content && (content.width > surface.clientWidth + 1 || content.height > surface.clientHeight + 1))
    }
    const observer = new ResizeObserver(measurePan)
    observer.observe(root)
    createEffect(() => {
      svg()
      sourceMode()
      zoom()
      let cancelled = false
      queueMicrotask(() => {
        if (!cancelled)
          measurePan()
      })
      onCleanup(() => {
        cancelled = true
      })
    })
    onCleanup(() => observer.disconnect())
  })
  onMount(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFullscreen(false)
        pan.stop()
      }
    }
    window.addEventListener('keydown', escape)
    onCleanup(() => window.removeEventListener('keydown', escape))
  })
  onCleanup(() => {
    disposed = true
    clearTimeout(copyTimer)
    pan.stop()
  })
  function event<T>(payload: T): MermaidBlockEvent<T> {
    return { payload, defaultPrevented: false, preventDefault() {
      this.defaultPrevented = true
    }, svgElement: viewport?.querySelector('svg'), svgString: svg() || null }
  }
  async function copy() {
    const source = code()
    const copyEvent = event({ type: 'copy' as const, text: source })
    props.onCopy?.(copyEvent)
    if (copyEvent.defaultPrevented || !await copyTextToClipboard(source) || disposed)
      return
    setCopied(true)
    props.context?.events.onCopy?.(source)
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => setCopied(false), 1000)
  }
  function exportSvg() {
    const exportEvent = event({ type: 'export' as const })
    props.onExport?.(exportEvent)
    if (exportEvent.defaultPrevented || !svg())
      return
    const url = URL.createObjectURL(new Blob([svg()], { type: 'image/svg+xml;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${props.kind}-diagram-${Date.now()}.svg`
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }
  function openModal() {
    const modalEvent = event({ type: 'open-modal' as const })
    props.onOpenModal?.(modalEvent)
    if (!modalEvent.defaultPrevented)
      setFullscreen(true)
  }
  function switchMode(mode: 'source' | 'preview') {
    const modeEvent = event({ type: 'toggle-mode' as const, target: mode })
    props.onToggleMode?.(mode, modeEvent)
    if (!modeEvent.defaultPrevented) {
      userMode = true
      setSourceMode(mode === 'source')
    }
  }
  function wheel(event: WheelEvent) {
    if (props.enableWheelZoom !== true)
      return
    event.preventDefault()
    changeZoom(event.deltaY < 0 ? 0.1 : -0.1)
  }
  const transform = () => `translate(${translate().x}px, ${translate().y}px) scale(${zoom()})`
  const buttonProps = () => ({ isDark: props.isDark, showTooltips: props.showTooltips })
  const zoomControls = () => (
    <>
      <ToolbarButton {...buttonProps()} label={t('common.zoomIn')} onClick={() => changeZoom(0.1)}>＋</ToolbarButton>
      <ToolbarButton {...buttonProps()} label={t('common.zoomOut')} onClick={() => changeZoom(-0.1)}>−</ToolbarButton>
      <ToolbarButton {...buttonProps()} label={t('common.resetZoom')} onClick={resetZoom}>
        {Math.round(zoom() * 100)}
        %
      </ToolbarButton>
    </>
  )
  return (
    <div ref={root} class={`diagram-block-container ${props.kind}-block-container`} data-diagram-kind={props.kind} data-markstream-pending={pending() ? 'true' : undefined} data-markstream-mermaid={props.kind === 'mermaid' && svg() ? '1' : undefined} data-markstream-d2={props.kind === 'd2' && svg() ? '1' : undefined} data-markstream-infographic={props.kind === 'infographic' && svg() ? '1' : undefined} classList={{ 'dark': !!props.isDark, 'is-collapsed': collapsed() }} aria-busy={loading()}>
      <Show when={props.showHeader}>
        <div class="code-block-header">
          <span>{props.kind === 'd2' ? 'D2' : props.kind === 'mermaid' ? 'Mermaid' : 'Infographic'}</span>
          <div class="code-block-actions">
            <Show when={props.showModeToggle}>
              <ToolbarButton {...buttonProps()} label={t('common.source')} pressed={sourceMode()} onClick={() => switchMode('source')} />
              <ToolbarButton {...buttonProps()} label={t('common.preview')} pressed={!sourceMode()} onClick={() => switchMode('preview')} />
            </Show>
            <Show when={props.showCopyButton}><ToolbarButton {...buttonProps()} label={t(copied() ? 'common.copied' : 'common.copy')} onClick={() => void copy()} /></Show>
            <Show when={props.showExportButton}><ToolbarButton {...buttonProps()} label={t('common.export')} disabled={!svg()} onClick={exportSvg} /></Show>
            <Show when={props.showFullscreenButton && props.kind !== 'd2'}><ToolbarButton {...buttonProps()} label={t('common.open')} disabled={!svg()} onClick={openModal}>⛶</ToolbarButton></Show>
            <Show when={props.showCollapseButton}><ToolbarButton {...buttonProps()} label={t(collapsed() ? 'common.expand' : 'common.collapse')} pressed={collapsed()} onClick={() => setCollapsed(value => !value)} /></Show>
          </div>
        </div>
      </Show>
      <div class="diagram-body" style={{ display: collapsed() ? 'none' : undefined }}>
        <div style={{ display: sourceMode() ? undefined : 'none' }}><PreCodeNode context={props.context} node={props.node} loading={loading()} /></div>
        <div class="diagram-preview" style={{ 'display': sourceMode() ? 'none' : undefined, 'max-height': props.maxHeight === 'none' || props.maxHeight === null ? 'none' : props.maxHeight ?? '500px', 'min-height': !svg() || !props.fitPreviewHeight ? `${props.estimatedPreviewHeightPx ?? 180}px` : undefined, 'touch-action': zoom() > 1 || overflowing() ? 'none' : 'auto', 'cursor': dragging() ? 'grabbing' : zoom() > 1 ? 'grab' : undefined }} onPointerDown={pan.start} onWheel={wheel}>
          <div ref={viewport} class="diagram-content" style={{ transform: transform() }} />
          <Show when={renderError() && !svg()}><div class="diagram-error" role="status">{renderError()}</div></Show>
        </div>
        <Show when={props.showZoomControls && !sourceMode() && svg() && props.kind !== 'd2'}><div class="diagram-zoom-controls">{zoomControls()}</div></Show>
      </div>
      <Show when={!isServer && fullscreen()}>
        <Portal>
          <div class="markstream-solid" classList={{ dark: !!props.isDark }}>
            <div class="diagram-modal-backdrop" onClick={() => setFullscreen(false)}>
              <div class="diagram-modal" role="dialog" aria-modal="true" aria-label={`${props.kind} ${t('common.preview')}`} onClick={event => event.stopPropagation()}>
                <div class="code-block-header">
                  <span>{props.kind}</span>
                  <div>
                    {zoomControls()}
                    <ToolbarButton
                      {...buttonProps()}
                      label={t('common.close')}
                      onClick={() => {
                        setFullscreen(false)
                        pan.stop()
                      }}
                    >
                      ×
                    </ToolbarButton>
                  </div>
                </div>
                <div class="diagram-modal-surface" onPointerDown={pan.start} onWheel={wheel} style={{ 'touch-action': 'none' }}><div class="diagram-content" style={{ transform: transform() }} innerHTML={svg()} /></div>
              </div>
            </div>
          </div>
        </Portal>
      </Show>
    </div>
  )
}
export function MermaidBlockNode(props: MermaidBlockNodeProps & Omit<NodeComponentProps, 'node'> & DiagramEvents): JSX.Element {
  return <DiagramBlockNode {...props} kind="mermaid" />
}
export function D2BlockNode(props: D2BlockNodeProps & Omit<NodeComponentProps, 'node'> & DiagramEvents): JSX.Element {
  return <DiagramBlockNode {...props} kind="d2" />
}
export function InfographicBlockNode(props: InfographicBlockNodeProps & Omit<NodeComponentProps, 'node'> & DiagramEvents): JSX.Element {
  return <DiagramBlockNode {...props} kind="infographic" />
}
