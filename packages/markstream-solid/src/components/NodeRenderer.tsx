import type { NodeRendererEvents, NodeRendererProps } from '../node-helpers'
import { createEffect, createMemo, createSignal, onCleanup, onMount, untrack, useContext } from 'solid-js'
import { useSmoothMarkdownStream } from '../composables/useSmoothMarkdownStream'
import { SMOOTH_STREAMING_CONTEXT } from '../context/smoothStreaming'
import { getCustomComponentsRevision, subscribeCustomComponents } from '../customComponents'
import { enhanceRenderedHtml } from '../enhanceRenderedHtml'
import { buildRenderContext, resolveParsedNodes } from '../node-helpers'
import { RenderChildren } from './RenderChildren'

export type MarkdownRenderProps = NodeRendererProps & NodeRendererEvents & {
  class?: string
  className?: string
  onClick?: (event: MouseEvent) => void
  onMouseover?: (event: MouseEvent) => void
  onMouseout?: (event: MouseEvent) => void
}

export function NodeRenderer(props: MarkdownRenderProps) {
  const [mounted, setMounted] = createSignal(false)
  const [customComponentsRevision, setCustomComponentsRevision] = createSignal(getCustomComponentsRevision())
  const [renderVersion, setRenderVersion] = createSignal(0)
  const textStreamState = new Map<string, string>()
  const smooth = useSmoothMarkdownStream(props.smoothStreamingOptions)
  const hasNodes = () => Array.isArray(props.nodes)
  const parentSmoothStreaming = useContext(SMOOTH_STREAMING_CONTEXT)
  const smoothEligible = () => {
    if (hasNodes())
      return false
    if (props.smoothStreaming === false)
      return false
    // Nested auto (and the default) must not pace again when a parent renderer
    // is already smoothing. Explicit `smoothStreaming={true}` still opts in.
    if (props.smoothStreaming !== true && parentSmoothStreaming?.())
      return false
    if (props.smoothStreaming === true)
      return true
    // Svelte defaults maxLiveNodes to 320, so auto is off unless typewriter
    // is set or the caller explicitly disables the live-node window.
    return props.typewriter === true || (props.maxLiveNodes ?? 320) <= 0
  }
  const smoothEnabled = () => smoothEligible() && (props.smoothStreaming === true || mounted())
  const requestedFinal = () => props.final ?? props.parseOptions?.final

  createEffect(() => {
    const content = props.content ?? ''
    const enabled = smoothEnabled()
    const final = requestedFinal()
    untrack(() => {
      if (hasNodes()) {
        smooth.reset('')
      }
      else if (!enabled) {
        smooth.reset(content)
        if (final)
          smooth.finish({ flush: true })
      }
      else if (!content) {
        smooth.reset('')
      }
      else if (content.startsWith(smooth.source())) {
        smooth.enqueue(content.slice(smooth.source().length))
      }
      else {
        smooth.reset(content)
      }
      if (enabled && final)
        smooth.finish()
    })
  })

  let lastContent: string | undefined
  let lastNodes: readonly unknown[] | null | undefined
  createEffect(() => {
    const content = smoothEnabled() ? smooth.visible() : (props.content ?? '')
    const nodes = props.nodes
    if (content !== lastContent || nodes !== lastNodes) {
      lastContent = content
      lastNodes = nodes
      setRenderVersion(value => value + 1)
    }
  })

  onMount(() => {
    setMounted(true)
  })
  onCleanup(subscribeCustomComponents(() => setCustomComponentsRevision(getCustomComponentsRevision())))

  const renderContent = () => smoothEnabled() ? smooth.visible() : (props.content ?? '')
  const effectiveFinal = () => smoothEnabled() && requestedFinal() != null
    ? Boolean(requestedFinal() && smooth.source() === (props.content ?? '') && smooth.caughtUp())
    : requestedFinal()
  const context = createMemo(() => {
    customComponentsRevision()
    return buildRenderContext({ ...props, content: renderContent(), final: effectiveFinal() }, {
      onCopy: props.onCopy,
      onHandleArtifactClick: props.onHandleArtifactClick,
    }, textStreamState, renderVersion())
  })
  const nodes = createMemo(() => resolveParsedNodes({ ...props, content: renderContent(), final: effectiveFinal() }))
  const [renderedCount, setRenderedCount] = createSignal(0)

  createEffect(() => {
    const total = nodes().length
    const batch = props.batchRendering ?? true
    const initial = Math.max(1, props.initialRenderBatchSize ?? 40)
    const step = Math.max(1, props.renderBatchSize ?? 80)
    const delay = Math.max(0, props.renderBatchDelay ?? 16)
    // Match the Svelte renderer: an in-flight stream exposes all parsed nodes,
    // while a completed document may be mounted in idle-sized batches.
    const shouldBatch = effectiveFinal() !== false && batch && total > initial
    if (!shouldBatch) {
      setRenderedCount(total)
      return
    }
    setRenderedCount(Math.min(total, initial))
    let timer: number | undefined
    let frame: number | undefined
    let idle: number | undefined
    let cancelled = false
    const advance = (deadline?: { timeRemaining?: () => number }) => {
      if (cancelled)
        return
      setRenderedCount((count) => {
        let next = Math.min(total, count + step)
        while (next < total && deadline?.timeRemaining && deadline.timeRemaining() > Math.max(2, props.renderBatchBudgetMs ?? 6) / 2)
          next = Math.min(total, next + step)
        if (next < total)
          schedule()
        return next
      })
    }
    function schedule() {
      const requestIdle = (window as any).requestIdleCallback as ((callback: (deadline: { timeRemaining?: () => number }) => void, options?: { timeout?: number }) => number) | undefined
      if (requestIdle) {
        idle = requestIdle(advance, { timeout: Math.max(0, props.renderBatchIdleTimeoutMs ?? 120) })
        return
      }
      if (delay > 0) {
        timer = window.setTimeout(advance, delay)
        return
      }
      if (typeof window.requestAnimationFrame === 'function') {
        frame = window.requestAnimationFrame(() => {
          advance()
        })
        return
      }
      timer = window.setTimeout(advance, delay)
    }
    schedule()
    onCleanup(() => {
      cancelled = true
      if (timer)
        window.clearTimeout(timer)
      if (frame != null)
        window.cancelAnimationFrame(frame)
      const cancelIdle = (window as any).cancelIdleCallback as ((id: number) => void) | undefined
      if (idle != null)
        cancelIdle?.(idle)
    })
  })
  const renderedNodes = createMemo(() => nodes().slice(0, typeof window === 'undefined' ? nodes().length : renderedCount()))
  const [root, setRoot] = createSignal<HTMLDivElement>()

  createEffect(() => {
    const element = root()
    const currentNodes = renderedNodes()
    const currentContext = context()
    if (!element || effectiveFinal() === false)
      return
    let cancelled = false
    let handle: { dispose: () => void } | undefined
    void enhanceRenderedHtml(element, {
      final: effectiveFinal(),
      isDark: props.isDark,
      renderCodeBlocksAsPre: props.renderCodeBlocksAsPre,
      codeBlockOptions: props.codeBlockOptions,
      codeBlockProps: props.codeBlockProps,
      codeBlockDarkTheme: props.codeBlockDarkTheme,
      codeBlockLightTheme: props.codeBlockLightTheme,
      themes: props.themes,
      mermaidProps: props.mermaidProps,
      d2Props: props.d2Props,
      infographicProps: props.infographicProps,
      onCopy: props.onCopy,
      isCancelled: () => cancelled,
    }).then((next) => {
      if (cancelled) {
        next.dispose()
      }
      else {
        handle = next
      }
    })
    onCleanup(() => {
      cancelled = true
      handle?.dispose()
    })
    void currentNodes
    void currentContext
  })

  return (
    <SMOOTH_STREAMING_CONTEXT.Provider value={smoothEnabled}>
      <div ref={setRoot} class={`markstream-solid ${props.className || props.class || ''}`} onClick={props.onClick} onMouseOver={props.onMouseover} onMouseOut={props.onMouseout}>
        <RenderChildren nodes={renderedNodes()} context={context()} prefix="root" />
      </div>
    </SMOOTH_STREAMING_CONTEXT.Provider>
  )
}

export const MarkdownRender = NodeRenderer
export default NodeRenderer
