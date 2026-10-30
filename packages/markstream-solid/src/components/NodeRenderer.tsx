import type { JSX } from 'solid-js'
import type { CodeBlockPreviewPayload } from '../types/component-props'
import type { MarkstreamRendererHandle, MarkstreamVirtualAnchor, MarkstreamVirtualMetrics, MarkstreamVirtualReason, MarkstreamVirtualState } from '../types/node-renderer-props'
import type { NodeRendererProps, SolidRenderableNode } from './shared/node-helpers'
import { createContext, createEffect, createMemo, createSignal, For, Index, mergeProps, onCleanup, onMount, sharedConfig, Show, untrack, useContext } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'
import { isServer } from 'solid-js/web'
import { normalizeCustomHtmlTagName } from 'stream-markdown-parser'
import { MarkstreamConfigContext } from '../configuration'
import { getCustomNodeComponents } from '../customComponents'
import { useSmoothMarkdownStream } from '../useSmoothMarkdownStream'
import { NodeLifecycleContext } from './lifecycle'
import { NodeSlot } from './NodeSlot'
import { normalizeRendererMode, RENDERER_MODE_DEFAULTS } from './rendererModeDefaults'
import { RenderNode } from './RenderNode'
import { buildRenderContext, resolveParsedNodes } from './shared/node-helpers'
import { computeLiveRange, resolveVirtualizationEnabled } from './shared/render-window'
import { reuseParsedNodes, sameParserValue } from './shared/reuseParsedNodes'
import { buildVirtualMeasurementKey, buildVirtualRendererLayoutKey } from './virtualLayoutKey'

export interface MarkdownRenderProps extends NodeRendererProps {
  'data-theme'?: string
  'class'?: string
  'className'?: string
  'style'?: JSX.CSSProperties
  'onCopy'?: (code: string) => void
  'onCopyCode'?: (payload: {
    type: 'copy'
    text: string
  }) => void
  'onHandleArtifactClick'?: (payload: CodeBlockPreviewPayload) => void
  'ref'?: (handle: MarkstreamRendererHandle) => void
  'onHeightChange'?: (metrics: MarkstreamVirtualMetrics) => void
  'onVirtualStateChange'?: (state: MarkstreamVirtualState) => void
  'onAnchorChange'?: (anchor: MarkstreamVirtualAnchor) => void
  'onRenderSettled'?: (metrics: MarkstreamVirtualMetrics) => void
  'onRenderFinal'?: (metrics: MarkstreamVirtualMetrics) => void
  'onClick'?: JSX.EventHandlerUnion<HTMLDivElement, MouseEvent>
  'onMouseover'?: JSX.EventHandlerUnion<HTMLDivElement, MouseEvent>
  'onMouseout'?: JSX.EventHandlerUnion<HTMLDivElement, MouseEvent>
}
const SmoothScope = createContext<() => boolean>(() => false)
const RendererScope = createContext<() => NodeRendererProps>(() => ({}))
export function NodeRenderer(input: MarkdownRenderProps): JSX.Element {
  const inherited = useContext(RendererScope)
  const configuration = useContext(MarkstreamConfigContext)
  const defaults = createMemo(() => RENDERER_MODE_DEFAULTS[normalizeRendererMode(input.mode ?? inherited().mode)])
  const normalizedStreaming = createMemo(() => Object.fromEntries(Object.entries(input.streamingComponents ?? {}).map(([key, component]) => [normalizeCustomHtmlTagName(key), component])))
  const props = mergeProps(inherited, defaults, input, {
    get content() {
      return input.content
    },
    get nodes() {
      return input.nodes
    },
    get customHtmlTags() {
      return [...(input.customHtmlTags ?? inherited().customHtmlTags ?? []), ...Object.keys(normalizedStreaming())]
    },
  })
  let lastHeightEmission: {
    height: number
    width: number
    phase: string
    sessionKey: string
    threadKey?: string
  } | undefined
  let restoredBottom: number | undefined
  let lastEmission = 0
  let wasSettled = false
  let wasFinal = false
  let pendingRestore: {
    state: MarkstreamVirtualState
    options: Parameters<MarkstreamRendererHandle['restoreVirtualState']>[1]
  } | undefined
  let disposed = false
  let root!: HTMLDivElement
  const [hydrating, setHydrating] = createSignal(!isServer && !!sharedConfig.context)
  const parentSmooth = useContext(SmoothScope)
  const stream = useSmoothMarkdownStream(props.smoothStreamingOptions)
  if (hydrating())
    stream.reset(props.content ?? '')
  const enabled = createMemo(() => !isServer && !hydrating() && !props.nodes?.length && props.smoothStreaming !== false
    && (props.smoothStreaming === true || (!parentSmooth() && (!!props.typewriter || (props.maxLiveNodes ?? 220) <= 0))))
  const requestedFinal = createMemo(() => props.final ?? props.parseOptions?.final)
  createEffect(() => {
    const content = props.content ?? ''
    const final = requestedFinal()
    const pacing = enabled()
    const hasNodes = !!props.nodes?.length
    untrack(() => {
      if (hasNodes) {
        stream.reset('')
        return
      }
      if (!pacing) {
        stream.reset(content)
        if (final)
          stream.finish({ flush: true })
        return
      }
      const source = stream.snapshot().source
      if (!content || !content.startsWith(source))
        stream.reset(content)
      else if (content !== source)
        stream.enqueue(content.slice(source.length))
      if (final)
        stream.finish()
    })
  })
  const paced = createMemo(() => enabled() ? stream.snapshot().visible : props.content)
  const [content, setContent] = createSignal(paced())
  let lastParse = 0
  createEffect(() => {
    const next = paced()
    const coalesce = enabled() && !(requestedFinal() && stream.snapshot().caughtUp) ? Math.max(0, props.parseCoalesceMs ?? 80) : 0
    const wait = Math.max(0, coalesce - (Date.now() - lastParse))
    const commit = () => {
      lastParse = Date.now()
      setContent(next)
    }
    if (!wait) {
      commit()
      return
    }
    const timer = setTimeout(commit, wait)
    onCleanup(() => clearTimeout(timer))
  })
  const final = createMemo(() => enabled() && requestedFinal() != null
    ? !!requestedFinal() && stream.snapshot().source === (props.content ?? '') && stream.snapshot().caughtUp
    : requestedFinal())
  const parseConfiguration = createMemo(() => ({
    nodes: props.nodes,
    customId: props.customId,
    customHtmlTags: props.customHtmlTags,
    customMarkdownIt: props.customMarkdownIt,
    parseOptions: props.parseOptions,
  }), undefined, { equals: sameParserValue })
  const parserProps = mergeProps(parseConfiguration, {
    get content() {
      return content()
    },
    get final() {
      return final()
    },
  })
  const debugPerformance = createMemo(() => !!props.debugPerformance && !isServer)
  const nodes = createMemo<SolidRenderableNode[]>((previous) => {
    const start = debugPerformance() ? performance.now() : 0
    const parsed = resolveParsedNodes(parserProps)
    const stable = parseConfiguration().nodes?.length ? parsed : reuseParsedNodes(previous, parsed)
    if (debugPerformance())
      console.info('[markstream-solid][perf] parse', { ms: performance.now() - start, nodes: stable.length, characters: content()?.length ?? 0 })
    return stable
  })
  const customComponents = createMemo(() => ({ ...getCustomNodeComponents(props.customId), ...configuration().components, ...props.customComponents, ...normalizedStreaming() }), undefined, {
    equals: (previous, next) => Object.keys(previous).length === Object.keys(next).length && Object.keys(next).every(key => previous[key] === next[key]),
  })
  const contextProps = mergeProps(props, {
    get final() {
      return final()
    },
    get customComponents() {
      return customComponents()
    },
  })
  const events = {
    onCopy: (code: string) => {
      props.onCopy?.(code)
      props.onCopyCode?.({ type: 'copy', text: code })
    },
    get onHandleArtifactClick() {
      return props.onHandleArtifactClick
    },
  }
  const contextSnapshot = createMemo(() => buildRenderContext(contextProps, events), undefined, {
    equals: (previous, next) => Object.keys(next).every((key) => {
      const field = key as keyof typeof next
      if (field === 'codeBlockThemes')
        return Object.keys(next.codeBlockThemes ?? {}).every(theme => previous.codeBlockThemes?.[theme as keyof NonNullable<typeof next.codeBlockThemes>] === next.codeBlockThemes?.[theme as keyof NonNullable<typeof next.codeBlockThemes>])
      if (field === 'customHtmlTags')
        return previous.customHtmlTags?.join(',') === next.customHtmlTags?.join(',')
      return previous[field] === next[field]
    }),
  })
  const [renderContext, setRenderContext] = createStore(contextSnapshot())
  createEffect(() => setRenderContext(reconcile(contextSnapshot(), { merge: true, key: null })))
  const context = () => renderContext
  let previousBatchContent = content() ?? ''
  const continuousStreaming = createMemo((previous: boolean) => {
    const next = content() ?? ''
    const before = previousBatchContent
    previousBatchContent = next
    if (props.nodes?.length || final() === true || !next.startsWith(before))
      return false
    return previous || (!!before && next.length > before.length)
  }, false)
  let adaptiveBatchSize = 0
  const [renderedCount, setRenderedCount] = createSignal(isServer || hydrating() ? nodes().length : Math.min(nodes().length, props.initialRenderBatchSize ?? 40))
  createEffect(() => {
    const total = nodes().length
    const current = renderedCount()
    const initial = Math.max(1, props.initialRenderBatchSize ?? 40)
    const incremental = !props.renderAsFragment && props.batchRendering !== false && (props.renderBatchSize ?? 80) > 0
      && !continuousStreaming() && !(final() === true && !props.virtualScroll?.enabled) && (props.maxLiveNodes ?? 0) <= 0
    if (!incremental || isServer) {
      if (current !== total)
        setRenderedCount(total)
      return
    }
    if (current > total || current < Math.min(total, initial)) {
      setRenderedCount(Math.min(total, initial))
      return
    }
    if (current < total) {
      let timer: ReturnType<typeof setTimeout> | undefined
      let idle: number | undefined
      let frame: number | undefined
      const configuredSize = Math.max(1, props.renderBatchSize ?? 80)
      const size = Math.min(configuredSize, adaptiveBatchSize || configuredSize)
      const budget = Math.max(2, props.renderBatchBudgetMs ?? 6)
      const run = () => {
        const start = performance.now()
        setRenderedCount(Math.min(total, current + size))
        const elapsed = performance.now() - start
        if (elapsed > budget * 1.5)
          adaptiveBatchSize = Math.max(Math.max(1, Math.floor(configuredSize / 4)), Math.floor(size * 0.8))
        else if (elapsed < budget * 0.6)
          adaptiveBatchSize = Math.min(configuredSize, Math.ceil(size * 1.2))
      }
      const scheduledAt = performance.now()
      const begin = () => {
        const remainingDelay = Math.max(0, (props.renderBatchDelay ?? 16) - (performance.now() - scheduledAt))
        timer = setTimeout(run, remainingDelay)
      }
      if (document.visibilityState !== 'hidden' && typeof window.requestIdleCallback === 'function')
        idle = window.requestIdleCallback(run, { timeout: props.renderBatchIdleTimeoutMs ?? 120 })
      else if (document.visibilityState !== 'hidden' && typeof requestAnimationFrame === 'function')
        frame = requestAnimationFrame(begin)
      else
        begin()
      onCleanup(() => {
        clearTimeout(timer)
        if (idle != null)
          window.cancelIdleCallback(idle)
        if (frame != null)
          cancelAnimationFrame(frame)
      })
    }
  })
  const [focus, setFocus] = createSignal(0)
  const [heightsRevision, setHeightsRevision] = createSignal(0)
  const heights = new Map<number, number>()
  let observedStreaming = requestedFinal() === false
  createEffect(() => {
    if (requestedFinal() === false && props.content)
      observedStreaming = true
  })
  const autoRestoreWindow = createMemo(() => final() === true && !observedStreaming && !props.nodes?.length && !props.virtualScroll?.enabled && (props.mode === 'chat' || props.mode === 'minimal') && input.maxLiveNodes === undefined && input.liveNodeBuffer === undefined)
  const liveLimit = createMemo(() => autoRestoreWindow() ? 50 : props.maxLiveNodes ?? 220)
  const virtual = createMemo(() => !isServer && !hydrating() && !props.renderAsFragment && props.nodeVirtual !== false && liveLimit() > 0 && (props.nodeVirtual === true ? nodes().length > 0 : resolveVirtualizationEnabled(nodes().length, liveLimit())))
  const offsets = createMemo(() => {
    heightsRevision()
    const result = [0]
    for (let index = 0; index < nodes().length; index++) {
      const node = nodes()[index]
      const estimated = node.type === 'code_block'
        ? 80 + String(node.code ?? '').split('\n').length * 20
        : node.type === 'heading' ? 56 : 48 + Math.floor(String(node.raw ?? node.content ?? '').length / 90) * 24
      result.push(result[index] + (heights.get(index) ?? estimated))
    }
    return result
  })
  const range = createMemo(() => virtual()
    ? computeLiveRange(nodes().length, focus(), liveLimit(), autoRestoreWindow() ? 16 : props.liveNodeBuffer)
    : { start: 0, end: nodes().length })
  const visible = createMemo(() => nodes().slice(range().start, virtual() ? range().end : Math.min(range().end, renderedCount())))
  const visibleIndices = createMemo<number[]>((previous) => {
    const start = range().start
    const count = visible().length
    if (previous?.length === count && (!count || previous[0] === start))
      return previous
    return Array.from({ length: count }, (_, index) => start + index)
  }, [])
  let previousContent = props.content ?? ''
  let previousNodes = props.nodes
  createEffect(() => {
    const next = props.content ?? ''
    const ast = props.nodes
    if (!next.startsWith(previousContent) || ast !== previousNodes) {
      restoredBottom = undefined
      adaptiveBatchSize = 0
      wasSettled = false
      wasFinal = false
      lastEmission = 0
      heights.clear()
      setHeightsRevision(value => value + 1)
      setFocus(0)
      setRenderedCount(Math.min(nodes().length, props.initialRenderBatchSize ?? 40))
    }
    previousContent = next
    previousNodes = ast
  })
  let scheduleMeasurement = () => { }
  onMount(() => {
    setHydrating(false)
    if (!root)
      return
    let frame: number | undefined
    const measure = () => {
      frame = undefined
      let changed = false
      for (const slot of root.querySelectorAll<HTMLElement>(':scope > .node-slot')) {
        const index = Number(slot.dataset.nodeIndex)
        const height = slot.getBoundingClientRect().height
        if (height > 0 && heights.get(index) !== height) {
          heights.set(index, height)
          changed = true
        }
      }
      if (changed)
        setHeightsRevision(value => value + 1)
      const parent = getScrollRoot()
      const viewportTop = parent !== document.documentElement ? parent.getBoundingClientRect().top : 0
      const top = Math.max(0, viewportTop - root.getBoundingClientRect().top)
      const positions = offsets()
      let low = 0
      let high = positions.length - 1
      while (low < high) {
        const middle = Math.floor((low + high + 1) / 2)
        if (positions[middle] <= top)
          low = middle
        else
          high = middle - 1
      }
      setFocus(Math.max(0, Math.min(low, nodes().length - 1)))
      if (restoredBottom != null) {
        const view = viewportInfo()
        view.scrollRoot.scrollTop = view.base + (offsets()[nodes().length] ?? 0) - view.height - restoredBottom
      }
      emitMetrics('resize')
    }
    const schedule = () => {
      if (disposed)
        return
      if (frame == null)
        frame = requestAnimationFrame(measure)
    }
    scheduleMeasurement = schedule
    const scroll = () => {
      if (restoredBottom != null && frame == null) {
        const view = viewportInfo()
        if (Math.abs((offsets()[nodes().length] ?? 0) - view.offset - view.height - restoredBottom) > 32)
          restoredBottom = undefined
      }
      schedule()
    }
    const releaseBottom = (event: Event) => {
      if (event instanceof KeyboardEvent && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
        return
      if (event.target instanceof Node && getScrollRoot().contains(event.target))
        restoredBottom = undefined
    }
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('wheel', releaseBottom, true)
    window.addEventListener('touchstart', releaseBottom, true)
    window.addEventListener('keydown', releaseBottom, true)
    window.addEventListener('resize', schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(root)
    createEffect(() => {
      visible()
      let cancelled = false
      queueMicrotask(() => {
        if (cancelled || disposed)
          return
        observer.disconnect()
        observer.observe(root)
        for (const slot of root.querySelectorAll<HTMLElement>(':scope > .node-slot'))
          observer.observe(slot)
        schedule()
      })
      onCleanup(() => {
        cancelled = true
      })
    })
    schedule()
    onCleanup(() => {
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('wheel', releaseBottom, true)
      window.removeEventListener('touchstart', releaseBottom, true)
      window.removeEventListener('keydown', releaseBottom, true)
      window.removeEventListener('resize', schedule)
      observer.disconnect()
      if (frame != null)
        cancelAnimationFrame(frame)
    })
  })
  const pendingNodes = new Set<string | number>()
  const [pendingCount, setPendingCount] = createSignal(0)
  const lifecycle = {
    markPending(key: string | number) {
      pendingNodes.add(key)
      setPendingCount(pendingNodes.size)
    },
    markSettled(key: string | number) {
      pendingNodes.delete(key)
      setPendingCount(pendingNodes.size)
      scheduleMeasurement()
    },
    reportHeight(key: string | number, height: number) {
      if (height > 0)
        scheduleMeasurement()
    },
  }
  const frameWaiters = new Map<number, () => void>()
  function nextFrame() {
    return new Promise<void>((resolve) => {
      if (isServer || disposed) {
        resolve()
        return
      }
      const id = requestAnimationFrame(() => {
        frameWaiters.delete(id)
        resolve()
      })
      frameWaiters.set(id, resolve)
    })
  }
  function getScrollRoot(): HTMLElement {
    let provided = props.virtualScroll?.scrollRoot
    if (typeof provided === 'function')
      provided = provided()
    if (typeof provided === 'function')
      provided = provided()
    if (provided && '$el' in provided)
      provided = provided.$el
    if (provided instanceof HTMLElement)
      return provided
    let parent = root?.parentElement
    while (parent && parent !== document.body) {
      if (/auto|scroll/.test(getComputedStyle(parent).overflowY))
        return parent
      parent = parent.parentElement
    }
    return document.documentElement
  }
  function viewportInfo() {
    const scrollRoot = getScrollRoot()
    const windowRoot = scrollRoot === document.documentElement
    const viewportTop = windowRoot ? 0 : scrollRoot.getBoundingClientRect().top
    const height = windowRoot ? window.innerHeight : scrollRoot.clientHeight
    const scrollTop = windowRoot ? window.scrollY : scrollRoot.scrollTop
    const top = root?.getBoundingClientRect().top ?? viewportTop
    return { scrollRoot, viewportTop, height, scrollTop, base: top - viewportTop + scrollTop, offset: Math.max(0, viewportTop - top) }
  }
  function signature(index: number) {
    const node = nodes()[index]
    const source = JSON.stringify(node)
    let hash = 2166136261
    for (let index = 0; index < source.length; index++)
      hash = Math.imul(hash ^ source.charCodeAt(index), 16777619)
    return `${node?.type}:${source.length}:${hash >>> 0}`
  }
  const measurementKey = createMemo(() => buildVirtualMeasurementKey(props.virtualScroll?.measurementKey, buildVirtualRendererLayoutKey({ ...props, renderCodeBlocksAsPre: props.renderCodeBlocksAsPre === true })))
  const [measuredWidth, setMeasuredWidth] = createSignal(0)
  let previousMeasurementKey = measurementKey()
  createEffect(() => {
    const key = measurementKey()
    if (key !== previousMeasurementKey) {
      heights.clear()
      setHeightsRevision(value => value + 1)
      previousMeasurementKey = key
      scheduleMeasurement()
    }
  })
  const metrics = (reason: MarkstreamVirtualReason = 'manual'): MarkstreamVirtualMetrics => {
    const total = offsets()[nodes().length] ?? 0
    const complete = renderedCount() >= nodes().length && pendingCount() === 0 && !nodes().some(node => node.loading === true) && (props.virtualScroll?.settleMode !== 'manual' || props.virtualScroll?.settledToken != null)
    return {
      sessionKey: props.virtualScroll?.sessionKey ?? String(props.customId ?? props.indexKey ?? 'markdown'),
      threadKey: props.virtualScroll?.threadKey,
      phase: final() && complete ? 'final' : final() === false ? 'streaming' : complete ? 'settled' : 'estimating',
      nodeCount: nodes().length,
      liveRange: range(),
      renderedCount: visible().length,
      measuredCount: heights.size,
      estimatedCount: Math.max(0, nodes().length - heights.size),
      averageNodeHeight: nodes().length ? total / nodes().length : 0,
      topSpacerHeight: offsets()[range().start] ?? 0,
      bottomSpacerHeight: total - (offsets()[range().end] ?? 0),
      visibleDomHeight: (offsets()[range().end] ?? 0) - (offsets()[range().start] ?? 0),
      totalHeight: total,
      width: measuredWidth(),
      final: final() === true,
      stable: complete,
      confidence: heights.size === nodes().length && nodes().length > 0 ? complete && final() ? 'final' : 'measured' : heights.size ? 'mixed' : 'estimate',
      reason,
    }
  }
  function captureVirtualState(options: Parameters<MarkstreamRendererHandle['captureVirtualState']>[0] = {}): MarkstreamVirtualState | null {
    if (!nodes().length && options.includeEmptyState === false)
      return null
    const view = !isServer && root ? viewportInfo() : undefined
    const width = root?.clientWidth || measuredWidth()
    const near = !!view && width > 0 && root.getBoundingClientRect().height > 0 && root.getBoundingClientRect().bottom >= view.viewportTop && root.getBoundingClientRect().top <= view.viewportTop + view.height
    if (options.requireViewport && !near)
      return null
    const mayCapture = near || options.allowFallbackAnchor
    const remaining = view ? (offsets()[nodes().length] ?? 0) - view.offset - view.height : Infinity
    const anchor: MarkstreamVirtualAnchor | undefined = mayCapture && view ? remaining >= 0 && remaining <= 64 ? { type: 'bottom', distanceFromBottomPx: remaining } : { type: 'node', nodeIndex: focus(), offsetWithinNodePx: view.offset - (offsets()[focus()] ?? 0) } : undefined
    const limit = props.virtualScroll?.heightCacheLimit ?? 5000
    return { sessionKey: metrics().sessionKey, threadKey: props.virtualScroll?.threadKey, metrics: { ...metrics(), width }, width, measurementKey: measurementKey(), anchor, anchorCaptured: near, heightCache: [...heights].filter(([index]) => index < nodes().length).slice(0, limit > 0 ? limit : undefined).map(([index, height]) => ({ index, height, nodeType: nodes()[index].type, signature: signature(index) })) }
  }
  function restoreVirtualState(state: MarkstreamVirtualState, options: Parameters<MarkstreamRendererHandle['restoreVirtualState']>[1] = {}) {
    if (state.sessionKey !== metrics().sessionKey || state.threadKey !== props.virtualScroll?.threadKey || state.measurementKey !== measurementKey())
      return
    if (!(state.width > 0))
      return
    const width = root?.clientWidth ?? 0
    if (!width || !nodes().length) {
      pendingRestore = { state, options }
      return
    }
    pendingRestore = undefined
    if (Math.abs(state.width - width) > 1)
      return
    for (const entry of state.heightCache ?? []) {
      if (Number.isInteger(entry.index) && entry.index >= 0 && entry.index < nodes().length && Number.isFinite(entry.height) && entry.height > 0 && entry.signature === signature(entry.index))
        heights.set(entry.index, entry.height)
    }
    setHeightsRevision(value => value + 1)
    if (!options.restoreAnchor || !state.anchor || (!state.anchorCaptured && !options.allowUncapturedAnchor))
      return
    const view = viewportInfo()
    restoredBottom = state.anchor.type === 'bottom' ? state.anchor.distanceFromBottomPx : undefined
    if (state.anchor.type === 'node') {
      setFocus(state.anchor.nodeIndex)
      view.scrollRoot.scrollTop = view.base + (offsets()[state.anchor.nodeIndex] ?? 0) + state.anchor.offsetWithinNodePx
    }
    else {
      view.scrollRoot.scrollTop = view.base + (offsets()[nodes().length] ?? 0) - view.height - state.anchor.distanceFromBottomPx
    }
    scheduleMeasurement()
  }
  function emitMetrics(reason: MarkstreamVirtualReason) {
    if (!root || disposed)
      return
    const width = root.clientWidth
    if (measuredWidth() && width && Math.abs(width - measuredWidth()) > 1) {
      heights.clear()
      setHeightsRevision(value => value + 1)
    }
    setMeasuredWidth(width)
    if (pendingRestore && width > 0 && nodes().length) {
      const request = pendingRestore
      pendingRestore = undefined
      restoreVirtualState(request.state, request.options)
    }
    const value = metrics(reason)
    if (Date.now() - lastEmission >= (props.virtualScroll?.emitIntervalMs ?? 16) || reason === 'final' || reason === 'restore') {
      lastEmission = Date.now()
      const threshold = Math.max(0, props.virtualScroll?.heightDiffThresholdPx ?? 1)
      if (!lastHeightEmission || Math.abs(lastHeightEmission.height - value.totalHeight) >= threshold || lastHeightEmission.width !== width || lastHeightEmission.phase !== value.phase || lastHeightEmission.sessionKey !== value.sessionKey || lastHeightEmission.threadKey !== value.threadKey) {
        props.onHeightChange?.(value)
        lastHeightEmission = { height: value.totalHeight, width, phase: value.phase, sessionKey: value.sessionKey, threadKey: value.threadKey }
      }
      if (props.onVirtualStateChange || props.onAnchorChange) {
        const state = captureVirtualState()
        if (state) {
          props.onVirtualStateChange?.(state)
          if (state.anchor)
            props.onAnchorChange?.(state.anchor)
        }
      }
    }
    if (value.stable && !wasSettled)
      props.onRenderSettled?.(value)
    if (value.final && value.stable && !wasFinal)
      props.onRenderFinal?.(value)
    wasSettled = value.stable
    wasFinal = value.final && value.stable
  }
  const handle: MarkstreamRendererHandle = {
    getVirtualMetrics: metrics,
    captureVirtualState,
    restoreVirtualState,
    async forceMeasure(reason = 'manual') {
      await nextFrame()
      scheduleMeasurement()
      await nextFrame()
      return metrics(reason)
    },
    async settle(options = {}) {
      const deadline = Date.now() + (options.timeoutMs ?? 1000)
      let stable = 0
      let previous = -1
      do {
        await nextFrame()
        scheduleMeasurement()
        const height = offsets()[nodes().length] ?? 0
        stable = height === previous && renderedCount() >= nodes().length && pendingCount() === 0 ? stable + 1 : 0
        previous = height
        if (disposed)
          break
      } while (stable < (options.frames ?? 2) && Date.now() < deadline)
      emitMetrics(options.reason ?? 'manual')
      return metrics(options.reason)
    },
    scrollToNode(index, align = 'start') {
      restoredBottom = undefined
      const clamped = Math.max(0, Math.min(nodes().length - 1, Math.trunc(index)))
      setFocus(clamped)
      const view = viewportInfo()
      const start = offsets()[clamped] ?? 0
      const end = offsets()[clamped + 1] ?? start
      if (align === 'nearest' && start >= view.offset && end <= view.offset + view.height)
        return
      view.scrollRoot.scrollTop = view.base + start - (align === 'center' ? (view.height - (end - start)) / 2 : align === 'end' ? view.height - (end - start) : 0)
      scheduleMeasurement()
    },
  }
  onMount(() => {
    props.ref?.(handle)
    createEffect(() => {
      const state = props.virtualScroll?.restoreState
      const trigger = props.virtualScroll?.restoreAnchor
      if (state)
        untrack(() => restoreVirtualState(state, { restoreAnchor: !!trigger, restoreToken: trigger }))
    })
    createEffect(() => {
      const entries = props.virtualScroll?.heightCache
      const width = props.virtualScroll?.heightCacheWidth
      if (entries && width != null)
        untrack(() => restoreVirtualState({ ...captureVirtualState()!, width, heightCache: entries }))
    })
    createEffect(() => {
      nodes()
      renderedCount()
      final()
      pendingCount()
      void props.virtualScroll?.settledToken
      queueMicrotask(() => emitMetrics(final() ? 'final' : 'content'))
    })
  })
  onCleanup(() => {
    disposed = true
    pendingRestore = undefined
    for (const [id, resolve] of frameWaiters) {
      cancelAnimationFrame(id)
      resolve()
    }
    frameWaiters.clear()
  })
  const shellDeferral = createMemo(() => !props.renderAsFragment && props.deferNodesUntilVisible !== false && (props.maxLiveNodes ?? 220) > 0 && !virtual() && nodes().length <= Math.min(900, props.viewportPriorityOptions?.maxTargets ?? 640) && props.viewportPriority !== false)
  const minimalDom = createMemo(() => props.domMode === 'minimal' && props.fade === false && !props.typewriter && Object.keys(customComponents()).length === 0 && !virtual() && !shellDeferral() && !props.virtualScroll?.enabled)
  const nestedProps = createMemo(() => ({ ...context(), mode: props.mode, domMode: props.domMode, codeBlockMinWidth: props.codeBlockMinWidth, codeBlockMaxWidth: props.codeBlockMaxWidth, themes: props.themes }))
  const [cursor, setCursor] = createSignal<{
    x: number
    y: number
    height: number
  } | undefined>()
  const [simpleCursor, setSimpleCursor] = createSignal(false)
  let cursorLength = (props.content ?? '').length
  const cursorAllowed = createMemo(() => !!props.typewriter && !props.renderAsFragment && !props.nodes?.length && !['code_block', 'admonition', 'table', 'math_block', 'html_block', 'image'].includes(nodes().at(-1)?.type ?? ''))
  createEffect(() => {
    const current = content()?.length ?? 0
    const show = cursorAllowed() && !final() && current > cursorLength
    cursorLength = current
    if (!show) {
      setCursor(undefined)
      setSimpleCursor(false)
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let simpleTarget: HTMLElement | undefined
    const frame = requestAnimationFrame(() => {
      if (disposed || !root)
        return
      const rootRect = root.getBoundingClientRect()
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: node => node.textContent?.trim() && !node.parentElement?.closest('.typewriter-cursor, .code-block-container, .diagram-block-container') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT })
      let last: Node | null = null
      while (walker.nextNode())
        last = walker.currentNode
      if (props.typewriter === 'simple' && last?.parentElement) {
        simpleTarget = last.parentElement.closest<HTMLElement>('.text-node') ?? last.parentElement
        simpleTarget.classList.add('typewriter-simple-cursor-target')
        setSimpleCursor(true)
        setCursor(undefined)
        timer = setTimeout(() => {
          simpleTarget?.classList.remove('typewriter-simple-cursor-target')
          setSimpleCursor(false)
        }, 3000)
        return
      }
      let rect: DOMRect | undefined
      if (last?.textContent) {
        const range = document.createRange()
        range.setStart(last, Math.max(0, last.textContent.length - 1))
        range.setEnd(last, last.textContent.length)
        rect = range.getClientRects?.().item(0) ?? last.parentElement?.getBoundingClientRect()
      }
      setCursor({ x: (rect?.right ?? rootRect.left) - rootRect.left, y: (rect?.top ?? rootRect.top) - rootRect.top, height: rect?.height || 20 })
      timer = setTimeout(() => setCursor(undefined), 3000)
    })
    onCleanup(() => {
      if (frame != null)
        cancelAnimationFrame(frame)
      clearTimeout(timer)
      simpleTarget?.classList.remove('typewriter-simple-cursor-target')
      setSimpleCursor(false)
    })
  })
  const Content = () => (
    <div ref={root} class={`markstream-solid markdown-renderer ${props.class ?? props.className ?? ''}`} classList={{ 'dark': !!props.isDark, 'virtualized': virtual(), 'virtual-scroll-coordinated': props.virtualScroll?.enabled === true, 'typewriter-simple-cursor': simpleCursor() }} style={{ position: 'relative', ...props.style }} data-theme={props['data-theme']} data-custom-id={props.customId} data-rendered-nodes={visible().length} data-total-nodes={nodes().length} data-stream-caught-up={!enabled() || stream.snapshot().caughtUp ? 'true' : 'false'} onClick={props.onClick} onMouseOver={props.onMouseover} onMouseOut={props.onMouseout}>
      <Show when={range().start > 0}><div class="virtual-spacer" aria-hidden="true" style={{ height: `${offsets()[range().start]}px` }} /></Show>
      <Show
        when={minimalDom() || props.renderAsFragment}
        fallback={(
          <For each={visibleIndices()}>
            {(index) => {
              const node = createMemo(() => nodes()[index])
              return <NodeSlot node={node()} index={index} indexKey={`${props.indexKey ?? 'markdown'}-${index}`} context={context()} defer={shellDeferral() && index >= (props.initialRenderBatchSize ?? 40) && !(final() !== true && !props.nodes?.length && index >= nodes().length - (props.liveNodeBuffer ?? 60))} margin={props.viewportPriorityOptions?.rootMargin ?? '400px'} estimatedHeight={(offsets()[index + 1] ?? 48) - (offsets()[index] ?? 0)} />
            }}
          </For>
        )}
      >
        <Index each={visible()}>{(node, index) => <RenderNode node={node()} context={context()} indexKey={`${props.indexKey ?? 'markdown'}-${index}`} />}</Index>
      </Show>
      <Show when={cursor()}><span class="typewriter-cursor" aria-hidden="true" data-cursor-mode={props.typewriter === 'simple' ? 'simple' : 'precise'} style={{ position: 'absolute', transform: `translate(${cursor()?.x}px, ${cursor()?.y}px)`, height: `${cursor()?.height}px` }} /></Show>
      <Show when={virtual() && range().end < nodes().length}><div class="virtual-spacer" aria-hidden="true" style={{ height: `${offsets()[nodes().length] - offsets()[range().end]}px` }} /></Show>
    </div>
  )
  return <RendererScope.Provider value={nestedProps}><SmoothScope.Provider value={enabled}><NodeLifecycleContext.Provider value={lifecycle}><Show when={props.renderAsFragment} fallback={<Content />}><Index each={visible()}>{(node, index) => <RenderNode node={node()} context={context()} indexKey={`${props.indexKey ?? 'fragment'}-${index}`} />}</Index></Show></NodeLifecycleContext.Provider></SmoothScope.Provider></RendererScope.Provider>
}
export default NodeRenderer
