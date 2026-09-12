import type { NodeRendererEvents, NodeRendererProps } from '../node-helpers'
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show, untrack, useContext } from 'solid-js'
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
  const nodes = createMemo(() => {
    const content = renderContent()
    const debug = props.debugPerformance
    const canLog = Boolean(debug)
      && typeof console !== 'undefined'
      && typeof console.info === 'function'
      && typeof performance !== 'undefined'
      && typeof performance.now === 'function'
    const startedAt = canLog ? performance.now() : 0
    const parsed = resolveParsedNodes({ ...props, content, final: effectiveFinal() })
    if (canLog) {
      console.info('[markstream-solid][perf] parse(sync)', {
        ms: Math.round(performance.now() - startedAt),
        nodes: parsed.length,
        contentLength: content.length,
      })
    }
    return parsed
  })
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
  const [typewriterCursorEl, setTypewriterCursorEl] = createSignal<HTMLSpanElement>()
  const [showTypewriterCursor, setShowTypewriterCursor] = createSignal(false)
  let typewriterCursorTimeout: ReturnType<typeof setTimeout> | undefined
  let lastTypewriterContentLength = 0
  const TYPEWRITER_CURSOR_EXCLUDED_NODE_TYPES = new Set(['code_block', 'admonition', 'table', 'math_block', 'html_block', 'image'])

  function hasLoadingNodes(list: readonly any[]): boolean {
    for (const node of list) {
      if ((node as any)?.loading === true)
        return true
      if (hasLoadingNodes(((node as any)?.children || []) as any))
        return true
      if (hasLoadingNodes(((node as any)?.items || []) as any))
        return true
    }
    return false
  }

  function shouldSkipTypewriterCursorForNode(node: unknown) {
    if (!node || typeof node !== 'object')
      return false
    const type = (node as Record<string, unknown>).type
    return typeof type === 'string' && TYPEWRITER_CURSOR_EXCLUDED_NODE_TYPES.has(type)
  }

  function getNodeTextLength(node: unknown): number {
    if (!node || typeof node !== 'object')
      return 0
    const record = node as Record<string, unknown>
    const direct = record.raw ?? record.content ?? record.code
    if (typeof direct === 'string')
      return direct.length
    const children = record.children
    if (Array.isArray(children))
      return children.reduce((total: number, child: unknown) => total + getNodeTextLength(child), 0)
    const items = record.items
    if (Array.isArray(items))
      return items.reduce((total: number, item: unknown) => total + getNodeTextLength(item), 0)
    return 0
  }

  function getTypewriterContentLength() {
    if (Array.isArray(props.nodes))
      return props.nodes.reduce((total: number, node: unknown) => total + getNodeTextLength(node), 0)
    return (props.content ?? '').length
  }

  function getLastTextNode(rootEl: HTMLElement) {
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.textContent ?? ''
        if (!text.trim())
          return NodeFilter.FILTER_REJECT
        const parent = node.parentElement
        if (!parent)
          return NodeFilter.FILTER_REJECT
        if (parent.closest('.typewriter-cursor, .height-estimation-probes, [data-node-type="code_block"], [data-node-type="admonition"], [data-node-type="table"], [data-node-type="math_block"], [data-node-type="html_block"], [data-node-type="image"], script, style'))
          return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })
    let last: Text | null = null
    let current = walker.nextNode()
    while (current) {
      last = current as Text
      current = walker.nextNode()
    }
    return last
  }

  function updateTypewriterCursorPosition() {
    const rootEl = root()
    const cursor = typewriterCursorEl()
    if (typeof window === 'undefined' || !showTypewriterCursor() || !rootEl || !cursor)
      return
    const lastText = getLastTextNode(rootEl)
    const rootRect = rootEl.getBoundingClientRect()
    let left = 0
    let top = 0
    let height = 20
    if (lastText?.textContent) {
      const range = document.createRange()
      const end = lastText.textContent.length
      range.setStart(lastText, Math.max(0, end - 1))
      range.setEnd(lastText, end)
      const rects = typeof range.getClientRects === 'function' ? range.getClientRects() : undefined
      const rect = rects?.[rects.length - 1] ?? lastText.parentElement?.getBoundingClientRect()
      if (rect) {
        left = rect.right - rootRect.left + rootEl.scrollLeft
        top = rect.top - rootRect.top + rootEl.scrollTop
        height = rect.height || height
      }
      range.detach()
    }
    cursor.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, top)}px)`
    cursor.style.height = `${height}px`
  }

  createEffect(() => {
    void renderContent()
    void props.nodes
    void props.typewriter
    void nodes().length
    void effectiveFinal()
    if (typeof window === 'undefined' || hasNodes())
      return
    if (effectiveFinal()) {
      setShowTypewriterCursor(false)
      if (typewriterCursorTimeout)
        clearTimeout(typewriterCursorTimeout)
      return
    }
    const nextLength = getTypewriterContentLength()
    const parsed = nodes()
    const cursorAllowed = !shouldSkipTypewriterCursorForNode(parsed[parsed.length - 1])
    if (props.typewriter !== true || !cursorAllowed || nextLength <= lastTypewriterContentLength) {
      if (props.typewriter !== true || !cursorAllowed)
        setShowTypewriterCursor(false)
      lastTypewriterContentLength = nextLength
      return
    }
    lastTypewriterContentLength = nextLength
    setShowTypewriterCursor(true)
    if (typewriterCursorTimeout)
      clearTimeout(typewriterCursorTimeout)
    queueMicrotask(() => updateTypewriterCursorPosition())
    typewriterCursorTimeout = setTimeout(() => setShowTypewriterCursor(false), 3000)
  })

  createEffect(() => {
    if (!showTypewriterCursor())
      return
    queueMicrotask(() => updateTypewriterCursorPosition())
  })

  onCleanup(() => {
    if (typewriterCursorTimeout)
      clearTimeout(typewriterCursorTimeout)
  })

  createEffect(() => {
    const element = root()
    const currentNodes = renderedNodes()
    const currentContext = context()
    const enhancementFinal = typeof effectiveFinal() === 'boolean' ? effectiveFinal() : !hasLoadingNodes(nodes())
    if (!element || enhancementFinal === false)
      return
    let cancelled = false
    let handle: { dispose: () => void } | undefined
    void enhanceRenderedHtml(element, {
      final: enhancementFinal,
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
      showTooltips: props.showTooltips,
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
      <div ref={setRoot} class={`markstream-solid markdown-renderer ${props.className || props.class || ''}`} onClick={props.onClick} onMouseOver={props.onMouseover} onMouseOut={props.onMouseout}>
        <RenderChildren nodes={renderedNodes()} context={context()} prefix="root" />
        <Show when={showTypewriterCursor()}>
          <span ref={setTypewriterCursorEl} class="typewriter-cursor" aria-hidden="true" />
        </Show>
      </div>
    </SMOOTH_STREAMING_CONTEXT.Provider>
  )
}

export const MarkdownRender = NodeRenderer
export default NodeRenderer
