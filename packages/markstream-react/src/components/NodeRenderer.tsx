import type { ParsedNode } from 'stream-markdown-parser'
import type { StreamStateRef } from '../context/streamState'
import type { VisibilityHandle } from '../context/viewportPriority'
import type { NodeRendererProps, RenderContext } from '../types'
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  getMarkdown,
  mergeCustomHtmlTags,
  parseMarkdownToStructure,
} from 'stream-markdown-parser'
import { SmoothStreamingContext } from '../context/smoothStreaming'
import { StreamStateRefContext } from '../context/streamState'
import { useViewportPriority, ViewportPriorityProvider } from '../context/viewportPriority'
import { getCustomComponentsRevision, getCustomNodeComponents, subscribeCustomComponents } from '../customComponents'
import { useSmoothMarkdownStream } from '../hooks/useSmoothMarkdownStream'
import { renderNode } from '../renderers/renderNode'
import { normalizeLanguageIdentifier } from '../utils/languageIcon'
import { getUseMonaco } from './CodeBlockNode/monaco'
import { setDesiredMonacoTheme } from './CodeBlockNode/monacoThemeRegistry'

const DEFAULT_PROPS: Required<Pick<NodeRendererProps, 'codeBlockStream'
  | 'typewriter'
  | 'fade'
  | 'smoothStreaming'
  | 'batchRendering'
  | 'initialRenderBatchSize'
  | 'renderBatchSize'
  | 'renderBatchDelay'
  | 'renderBatchBudgetMs'
  | 'renderBatchIdleTimeoutMs'
  | 'deferNodesUntilVisible'
  | 'maxLiveNodes'
  | 'liveNodeBuffer'>> = {
  codeBlockStream: true,
  typewriter: false,
  fade: true,
  smoothStreaming: 'auto',
  batchRendering: true,
  initialRenderBatchSize: 40,
  renderBatchSize: 80,
  renderBatchDelay: 16,
  renderBatchBudgetMs: 6,
  renderBatchIdleTimeoutMs: 120,
  deferNodesUntilVisible: true,
  maxLiveNodes: 320,
  liveNodeBuffer: 60,
}

const fallbackMarkdown = getMarkdown()

type ResolvedProps = NodeRendererProps & typeof DEFAULT_PROPS

/**
 * Determine whether a parsed node is structurally identical to a previous
 * version at the same index.  When the content has not changed we reuse the
 * previous object reference so that React.memo checks (reference equality)
 * can skip re-rendering the node.
 *
 * Comparison is intentionally lightweight – we check the fields that affect
 * the visual output rather than doing a deep-equal walk.
 */
function isNodeStable(prev: ParsedNode, next: ParsedNode): boolean {
  if (prev.type !== next.type)
    return false
  // `raw` is the original markdown source for the node.  If it hasn't
  // changed the parsed output should be identical (parser is deterministic).
  if (prev.raw !== next.raw)
    return false
  // Loading state on code blocks can flip independently of `raw`.
  if (prev.type === 'code_block' || next.type === 'code_block') {
    if ((prev as any).loading !== (next as any).loading)
      return false
    if ((prev as any).diff !== (next as any).diff)
      return false
  }
  return true
}

/**
 * Given a freshly-parsed node array and the previous stabilized array,
 * return a new array where structurally-identical nodes keep their previous
 * object reference.  This enables React.memo on NodeSlotContent to skip
 * re-rendering unchanged nodes.
 */
function stabilizeParsedNodes(newNodes: ParsedNode[], prevNodes: ParsedNode[]): ParsedNode[] {
  if (!prevNodes.length)
    return newNodes
  const result: ParsedNode[] = new Array(newNodes.length)
  let identical = newNodes.length === prevNodes.length
  for (let i = 0; i < newNodes.length; i++) {
    const prev = i < prevNodes.length ? prevNodes[i] : null
    if (prev && isNodeStable(prev, newNodes[i])) {
      result[i] = prev
    }
    else {
      result[i] = newNodes[i]
      identical = false
    }
  }
  // Fast path: if every node kept its previous reference, return the
  // previous array directly so the outer reference is also stable.
  if (identical)
    return prevNodes
  return result
}

// ---------------------------------------------------------------------------
// NodeSlotContent – memoized wrapper around renderNode
// ---------------------------------------------------------------------------

interface NodeSlotContentProps {
  node: ParsedNode
  nodeKey: string
  renderCtx: RenderContext
}

/**
 * Memoized wrapper that calls `renderNode` for a single node.
 * Only re-renders when the node reference or renderCtx reference changes.
 *
 * Because `stabilizeParsedNodes` reuses previous object references for
 * unchanged nodes, the reference-equality check here is sufficient to skip
 * re-rendering stable nodes during streaming.
 */
const NodeSlotContent = React.memo(
  ({ node, nodeKey, renderCtx }: NodeSlotContentProps) => {
    return renderNode(node, nodeKey, renderCtx)
  },
  (prev: NodeSlotContentProps, next: NodeSlotContentProps) => {
    // Reference equality on node (stabilized) and renderCtx (stable during
    // streaming) is sufficient.  The nodeKey is derived from the index so it
    // is always the same for the same position.
    return prev.node === next.node && prev.renderCtx === next.renderCtx && prev.nodeKey === next.nodeKey
  },
)

interface IdleDeadlineLike {
  timeRemaining?: () => number
}

interface NodeRendererInnerProps {
  props: ResolvedProps
  parsedNodes: ParsedNode[]
  renderCtx: RenderContext
  indexPrefix: string
  containerRef: React.RefObject<HTMLDivElement | null>
  showTypewriterCursor: boolean
  typewriterCursorRef: React.RefObject<HTMLSpanElement | null>
}

const DEFAULT_NODE_HEIGHT = 32
const MAX_DEFERRED_NODE_COUNT = 900

const NodeRendererInner: React.FC<NodeRendererInnerProps> = ({
  props,
  parsedNodes,
  renderCtx,
  indexPrefix,
  containerRef,
  showTypewriterCursor,
  typewriterCursorRef,
}) => {
  const registerNodeVisibility = useViewportPriority()
  const isClient = typeof window !== 'undefined'
  const hasIdleCallback = typeof window !== 'undefined' && typeof (window as any).requestIdleCallback === 'function'
  const resolvedBatchSize = Math.max(0, Math.trunc(props.renderBatchSize ?? 80))
  const resolvedInitialBatch = Math.max(
    0,
    Math.trunc(props.initialRenderBatchSize ?? (resolvedBatchSize || parsedNodes.length)),
  )
  const batchingEnabled = props.batchRendering !== false && resolvedBatchSize > 0 && isClient
  const liveNodeBufferResolved = Math.max(0, props.liveNodeBuffer ?? 60)
  const maxLiveNodesResolved = Math.max(1, props.maxLiveNodes ?? 320)
  const virtualizationEnabled = (props.maxLiveNodes ?? 0) > 0 && parsedNodes.length > maxLiveNodesResolved
  const viewportPriorityEnabled = props.viewportPriority !== false
  const incrementalRenderingActive = batchingEnabled && (props.maxLiveNodes ?? 0) <= 0
  const deferNodes = useMemo(() => {
    if (props.deferNodesUntilVisible === false)
      return false
    if ((props.maxLiveNodes ?? 0) <= 0)
      return false
    if (virtualizationEnabled)
      return false
    if (parsedNodes.length > MAX_DEFERRED_NODE_COUNT)
      return false
    return viewportPriorityEnabled
  }, [
    parsedNodes.length,
    props.deferNodesUntilVisible,
    props.maxLiveNodes,
    viewportPriorityEnabled,
    virtualizationEnabled,
  ])

  const [renderedCount, setRenderedCount] = useState(() => {
    if (!incrementalRenderingActive)
      return parsedNodes.length
    return Math.min(parsedNodes.length, resolvedInitialBatch)
  })
  const renderedCountRef = useRef(renderedCount)
  useEffect(() => {
    renderedCountRef.current = renderedCount
  }, [renderedCount])
  const cleanupLimit = incrementalRenderingActive ? renderedCount : parsedNodes.length

  const [focusIndex, setFocusIndex] = useState(0)
  const [liveRange, setLiveRange] = useState({ start: 0, end: parsedNodes.length })
  const nodeHeightsRef = useRef(new Map<number, number>())
  const [heightsVersion, setHeightsVersion] = useState(0)
  const nodeVisibilityStateRef = useRef<Record<number, boolean>>({})
  const nodeVisibilityHandlesRef = useRef(new Map<number, VisibilityHandle>())
  const nodeSlotElementsRef = useRef(new Map<number, HTMLElement | null>())
  const nodeSlotRefCallbacksRef = useRef(new Map<number, (el: HTMLElement | null) => void>())
  const nodeContentRefCallbacksRef = useRef(new Map<number, (el: HTMLDivElement | null) => void>())
  const nodeSeenRef = useRef(new Set<number>())
  const prevRenderedRef = useRef(renderedCount)
  const batchRafRef = useRef<number | null>(null)
  const batchTimeoutRef = useRef<number | null>(null)
  const batchIdleRef = useRef<number | null>(null)
  const batchPendingRef = useRef(false)
  const pendingIncrementRef = useRef<number | null>(null)
  const adaptiveBatchSizeRef = useRef(Math.max(1, resolvedBatchSize || 1))
  const desiredRenderedCountRef = useRef(parsedNodes.length)
  const previousDatasetRef = useRef<{ key: typeof props.indexKey, total: number }>({
    key: props.indexKey,
    total: parsedNodes.length,
  })
  const previousBatchConfigRef = useRef({
    batchSize: resolvedBatchSize,
    initial: resolvedInitialBatch,
    delay: props.renderBatchDelay ?? 16,
    enabled: incrementalRenderingActive,
  })

  const shouldObserveSlots = deferNodes || virtualizationEnabled

  const averageNodeHeight = useMemo(() => {
    const map = nodeHeightsRef.current
    if (!map.size)
      return DEFAULT_NODE_HEIGHT
    let total = 0
    for (const height of map.values())
      total += height
    return Math.max(16, total / map.size)
  }, [heightsVersion])

  const visibleNodes = useMemo(() => {
    if (!virtualizationEnabled)
      return parsedNodes.map((node, index) => ({ node, index }))
    const total = parsedNodes.length
    const start = Math.max(0, Math.min(liveRange.start, total))
    const end = Math.max(start, Math.min(liveRange.end, total))
    return parsedNodes.slice(start, end).map((node, idx) => ({
      node,
      index: start + idx,
    }))
  }, [parsedNodes, liveRange, virtualizationEnabled])

  const desiredRenderedCount = useMemo(() => {
    if (!virtualizationEnabled)
      return parsedNodes.length
    const overscanEnd = Math.max(liveRange.end + liveNodeBufferResolved, resolvedInitialBatch)
    const target = Math.min(parsedNodes.length, overscanEnd)
    return Math.max(renderedCount, target)
  }, [
    parsedNodes.length,
    virtualizationEnabled,
    liveRange.end,
    liveNodeBufferResolved,
    resolvedInitialBatch,
    renderedCount,
  ])
  desiredRenderedCountRef.current = desiredRenderedCount

  const estimateHeightRange = useCallback((start: number, end: number) => {
    if (start >= end)
      return 0
    const map = nodeHeightsRef.current
    let total = 0
    for (let i = start; i < end; i++)
      total += map.get(i) ?? averageNodeHeight
    return total
  }, [averageNodeHeight])

  const topSpacerHeight = virtualizationEnabled
    ? estimateHeightRange(0, Math.min(liveRange.start, parsedNodes.length))
    : 0
  const bottomSpacerHeight = virtualizationEnabled
    ? estimateHeightRange(Math.min(liveRange.end, parsedNodes.length), parsedNodes.length)
    : 0

  const cancelBatchTimers = useCallback(() => {
    if (batchRafRef.current != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(batchRafRef.current)
      batchRafRef.current = null
    }
    if (batchTimeoutRef.current != null) {
      window.clearTimeout(batchTimeoutRef.current)
      batchTimeoutRef.current = null
    }
    if (batchIdleRef.current != null && typeof (window as any).cancelIdleCallback === 'function') {
      ;(window as any).cancelIdleCallback(batchIdleRef.current)
      batchIdleRef.current = null
    }
    batchPendingRef.current = false
    pendingIncrementRef.current = null
  }, [])

  const adjustAdaptiveBatchSize = useCallback((elapsed: number) => {
    if (!incrementalRenderingActive)
      return
    const budget = Math.max(2, props.renderBatchBudgetMs ?? 6)
    const maxSize = Math.max(1, resolvedBatchSize || 1)
    const minSize = Math.max(1, Math.floor(maxSize / 4))
    if (elapsed > budget * 1.2)
      adaptiveBatchSizeRef.current = Math.max(minSize, Math.floor(adaptiveBatchSizeRef.current * 0.7))
    else if (elapsed < budget * 0.5 && adaptiveBatchSizeRef.current < maxSize)
      adaptiveBatchSizeRef.current = Math.min(maxSize, Math.ceil(adaptiveBatchSizeRef.current * 1.2))
  }, [incrementalRenderingActive, props.renderBatchBudgetMs, resolvedBatchSize])

  const scheduleBatch = useCallback((increment: number, opts: { immediate?: boolean } = {}) => {
    if (!incrementalRenderingActive)
      return
    const target = desiredRenderedCountRef.current
    if (renderedCountRef.current >= target)
      return
    const amount = Math.max(1, increment)
    const applyIncrement = (size: number) => {
      const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
      setRenderedCount((prev) => {
        const next = Math.min(desiredRenderedCountRef.current, prev + Math.max(1, size))
        renderedCountRef.current = next
        return next
      })
      const end = typeof performance !== 'undefined' ? performance.now() : Date.now()
      adjustAdaptiveBatchSize(end - start)
    }
    const queueNextBatch = () => {
      const dynamicSize = Math.max(1, Math.round(adaptiveBatchSizeRef.current))
      scheduleBatch(dynamicSize)
    }
    const run = (deadline?: IdleDeadlineLike) => {
      batchRafRef.current = null
      batchTimeoutRef.current = null
      batchIdleRef.current = null
      batchPendingRef.current = false
      const pending = pendingIncrementRef.current
      pendingIncrementRef.current = null
      const initialSize = pending != null ? pending : amount
      applyIncrement(initialSize)
      if (renderedCountRef.current >= desiredRenderedCountRef.current)
        return
      if (!deadline) {
        queueNextBatch()
        return
      }
      const budget = Math.max(2, props.renderBatchBudgetMs ?? 6)
      while (renderedCountRef.current < desiredRenderedCountRef.current) {
        const remaining = typeof deadline.timeRemaining === 'function' ? deadline.timeRemaining() : 0
        if (remaining <= budget * 0.5)
          break
        applyIncrement(Math.max(1, Math.round(adaptiveBatchSizeRef.current)))
      }
      if (renderedCountRef.current < desiredRenderedCountRef.current)
        queueNextBatch()
    }

    if (!isClient || opts.immediate) {
      run()
      return
    }
    const delay = Math.max(0, props.renderBatchDelay ?? 16)
    pendingIncrementRef.current = pendingIncrementRef.current != null
      ? Math.max(pendingIncrementRef.current, amount)
      : amount
    if (batchPendingRef.current)
      return
    batchPendingRef.current = true
    if (hasIdleCallback) {
      const timeout = Math.max(0, props.renderBatchIdleTimeoutMs ?? 120)
      batchIdleRef.current = (window as any).requestIdleCallback((deadline: IdleDeadlineLike) => run(deadline), { timeout })
      return
    }
    if (typeof requestAnimationFrame !== 'function') {
      batchTimeoutRef.current = window.setTimeout(() => run(), delay)
      return
    }
    batchRafRef.current = requestAnimationFrame(() => {
      if (delay === 0) {
        run()
        return
      }
      batchTimeoutRef.current = window.setTimeout(() => run(), delay)
    })
  }, [
    adjustAdaptiveBatchSize,
    hasIdleCallback,
    incrementalRenderingActive,
    isClient,
    props.renderBatchDelay,
    props.renderBatchBudgetMs,
    props.renderBatchIdleTimeoutMs,
  ])

  useEffect(() => {
    const datasetKey = props.indexKey
    const total = parsedNodes.length
    const prevCtx = previousDatasetRef.current
    const datasetChanged = datasetKey !== undefined
      ? datasetKey !== prevCtx.key
      : total !== prevCtx.total
    previousDatasetRef.current = { key: datasetKey, total }
    const prevBatch = previousBatchConfigRef.current
    const currentDelay = props.renderBatchDelay ?? 16
    const batchConfigChanged
      = prevBatch.batchSize !== resolvedBatchSize
        || prevBatch.initial !== resolvedInitialBatch
        || prevBatch.delay !== currentDelay
        || prevBatch.enabled !== incrementalRenderingActive
    previousBatchConfigRef.current = {
      batchSize: resolvedBatchSize,
      initial: resolvedInitialBatch,
      delay: currentDelay,
      enabled: incrementalRenderingActive,
    }

    if (datasetChanged || batchConfigChanged || !incrementalRenderingActive)
      cancelBatchTimers()
    if (datasetChanged || batchConfigChanged) {
      adaptiveBatchSizeRef.current = Math.max(1, resolvedBatchSize || 1)
      nodeSeenRef.current.clear()
    }

    if (!total) {
      renderedCountRef.current = 0
      setRenderedCount(0)
      return
    }

    const target = desiredRenderedCountRef.current

    if (!incrementalRenderingActive) {
      renderedCountRef.current = target
      setRenderedCount(target)
      return
    }

    if (datasetChanged || batchConfigChanged) {
      const initial = Math.min(target, resolvedInitialBatch)
      renderedCountRef.current = initial
      setRenderedCount(initial)
      if (initial < target)
        scheduleBatch(Math.max(1, resolvedInitialBatch), { immediate: !isClient })
      return
    }

    const capped = Math.min(renderedCountRef.current, target)
    if (capped !== renderedCountRef.current) {
      renderedCountRef.current = capped
      setRenderedCount(capped)
    }
    if (renderedCountRef.current < target)
      scheduleBatch(Math.max(1, resolvedBatchSize || 1))
  }, [
    cancelBatchTimers,
    incrementalRenderingActive,
    isClient,
    parsedNodes.length,
    props.indexKey,
    props.renderBatchDelay,
    resolvedBatchSize,
    resolvedInitialBatch,
    scheduleBatch,
  ])

  useEffect(() => {
    if (!virtualizationEnabled) {
      setLiveRange({ start: 0, end: parsedNodes.length })
      return
    }
    const total = parsedNodes.length
    if (!total) {
      setLiveRange({ start: 0, end: 0 })
      return
    }
    const focus = Math.max(0, Math.min(focusIndex, total - 1))
    let start = Math.max(0, focus - liveNodeBufferResolved)
    let end = Math.min(total, focus + liveNodeBufferResolved + 1)
    const size = end - start
    if (size > maxLiveNodesResolved) {
      const excess = size - maxLiveNodesResolved
      start += Math.ceil(excess / 2)
      end -= Math.floor(excess / 2)
    }
    else if (size < maxLiveNodesResolved) {
      const missing = maxLiveNodesResolved - size
      start = Math.max(0, start - Math.ceil(missing / 2))
      end = Math.min(total, end + Math.floor(missing / 2))
    }
    setLiveRange({ start, end })
  }, [focusIndex, liveNodeBufferResolved, maxLiveNodesResolved, parsedNodes.length, virtualizationEnabled])

  useEffect(() => {
    return () => {
      cancelBatchTimers()
      for (const handle of nodeVisibilityHandlesRef.current.values())
        handle.destroy()
      nodeVisibilityHandlesRef.current.clear()
    }
  }, [cancelBatchTimers])

  const cleanupAfterTruncate = useCallback((limit: number) => {
    for (const [index, handle] of nodeVisibilityHandlesRef.current.entries()) {
      if (index >= limit) {
        handle.destroy()
        nodeVisibilityHandlesRef.current.delete(index)
        delete nodeVisibilityStateRef.current[index]
        nodeSlotElementsRef.current.delete(index)
        nodeSlotRefCallbacksRef.current.delete(index)
        nodeContentRefCallbacksRef.current.delete(index)
      }
    }
  }, [])

  useEffect(() => {
    cleanupAfterTruncate(cleanupLimit)
  }, [cleanupAfterTruncate, cleanupLimit])

  useEffect(() => {
    const total = parsedNodes.length
    let changed = false
    for (const key of Array.from(nodeHeightsRef.current.keys())) {
      if (key >= total) {
        nodeHeightsRef.current.delete(key)
        changed = true
      }
    }
    if (changed)
      setHeightsVersion(v => v + 1)
    for (const key of Object.keys(nodeVisibilityStateRef.current)) {
      if (Number(key) >= total)
        delete nodeVisibilityStateRef.current[key]
    }
    for (const index of Array.from(nodeSeenRef.current)) {
      if (index >= total)
        nodeSeenRef.current.delete(index)
    }
  }, [parsedNodes.length])

  const markNodeVisible = useCallback((index: number, visible: boolean) => {
    if (deferNodes && visible)
      nodeVisibilityStateRef.current[index] = true
    if (visible && virtualizationEnabled) {
      setFocusIndex(prev => (index > prev ? index : prev))
    }
  }, [deferNodes, virtualizationEnabled])

  const destroyNodeHandle = useCallback((index: number) => {
    const handle = nodeVisibilityHandlesRef.current.get(index)
    if (handle) {
      handle.destroy()
      nodeVisibilityHandlesRef.current.delete(index)
    }
  }, [])

  const setNodeSlotElement = useCallback((index: number, el: HTMLElement | null) => {
    const slots = nodeSlotElementsRef.current
    if (el)
      slots.set(index, el)
    else
      slots.delete(index)

    if (!shouldObserveSlots || !el) {
      destroyNodeHandle(index)
      if (deferNodes && !el)
        delete nodeVisibilityStateRef.current[index]
      if (el)
        markNodeVisible(index, true)
      return
    }

    if (index < resolvedInitialBatch && !virtualizationEnabled) {
      destroyNodeHandle(index)
      markNodeVisible(index, true)
      return
    }

    destroyNodeHandle(index)
    const handle = registerNodeVisibility(el, { rootMargin: '400px' })
    nodeVisibilityHandlesRef.current.set(index, handle)
    if (handle.isVisible())
      markNodeVisible(index, true)
    handle.whenVisible.then(() => markNodeVisible(index, true)).catch(() => {})
  }, [
    deferNodes,
    destroyNodeHandle,
    markNodeVisible,
    registerNodeVisibility,
    resolvedInitialBatch,
    shouldObserveSlots,
    virtualizationEnabled,
  ])

  const getNodeSlotRef = useCallback((index: number) => {
    const existing = nodeSlotRefCallbacksRef.current.get(index)
    if (existing)
      return existing
    const cb = (el: HTMLElement | null) => setNodeSlotElement(index, el)
    nodeSlotRefCallbacksRef.current.set(index, cb)
    return cb
  }, [setNodeSlotElement])

  const setNodeContentRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (!el) {
      if (nodeHeightsRef.current.has(index)) {
        nodeHeightsRef.current.delete(index)
        setHeightsVersion(v => v + 1)
      }
      return
    }
    const measure = () => {
      const height = el.offsetHeight
      if (!height)
        return
      const prev = nodeHeightsRef.current.get(index)
      if (prev !== height) {
        nodeHeightsRef.current.set(index, height)
        setHeightsVersion(v => v + 1)
      }
    }
    if (typeof queueMicrotask === 'function')
      queueMicrotask(measure)
    else
      Promise.resolve().then(measure)
  }, [])

  const getNodeContentRef = useCallback((index: number) => {
    const existing = nodeContentRefCallbacksRef.current.get(index)
    if (existing)
      return existing
    const cb = (el: HTMLDivElement | null) => setNodeContentRef(index, el)
    nodeContentRefCallbacksRef.current.set(index, cb)
    return cb
  }, [setNodeContentRef])

  const shouldRenderNode = useCallback((index: number) => {
    if (incrementalRenderingActive && index >= renderedCountRef.current)
      return false
    if (!deferNodes)
      return true
    if (index < resolvedInitialBatch)
      return true
    return nodeVisibilityStateRef.current[index] === true
  }, [deferNodes, incrementalRenderingActive, resolvedInitialBatch])

  const handleMouseEvent = useCallback((cb?: (event: React.MouseEvent<HTMLElement>) => void) => {
    return (event: React.MouseEvent<HTMLElement>) => {
      if (!cb)
        return
      const target = event.target as HTMLElement | null
      if (!target?.closest('[data-node-index]'))
        return
      cb(event)
    }
  }, [])

  useEffect(() => {
    for (const [index, el] of nodeSlotElementsRef.current.entries()) {
      if (el)
        setNodeSlotElement(index, el)
    }
  }, [setNodeSlotElement])

  useEffect(() => {
    if (virtualizationEnabled && renderedCount > prevRenderedRef.current)
      setFocusIndex(renderedCount - 1)
    prevRenderedRef.current = renderedCount
  }, [renderedCount, virtualizationEnabled])

  const topSpacer = virtualizationEnabled
    ? <div className="node-spacer" style={{ height: `${topSpacerHeight}px` }} aria-hidden="true" />
    : null
  const bottomSpacer = virtualizationEnabled
    ? <div className="node-spacer" style={{ height: `${bottomSpacerHeight}px` }} aria-hidden="true" />
    : null

  return (
    <div
      ref={containerRef}
      className={`markstream-react markdown-renderer${props.isDark ? ' dark' : ''}${virtualizationEnabled ? ' virtualized' : ''}`}
      data-custom-id={props.customId}
      onClick={props.onClick}
      onMouseOver={handleMouseEvent(props.onMouseOver)}
      onMouseOut={handleMouseEvent(props.onMouseOut)}
    >
      {topSpacer}
      {visibleNodes.map(({ node, index }) => {
        const canRender = shouldRenderNode(index)
        const placeholderHeight = nodeHeightsRef.current.get(index) ?? averageNodeHeight
        const shouldAnimate = props.fade !== false
          && node.type !== 'code_block'
          && !nodeSeenRef.current.has(index)
          && canRender
        if (shouldAnimate)
          nodeSeenRef.current.add(index)
        return (
          <div
            key={`${indexPrefix}-${index}`}
            ref={getNodeSlotRef(index)}
            className="node-slot"
            data-node-index={index}
            data-node-type={node.type}
          >
            {canRender
              ? (
                  <div
                    ref={getNodeContentRef(index)}
                    className={`node-content${shouldAnimate ? ' fade-node typewriter-node' : ''}`}
                  >
                    <NodeSlotContent
                      node={node}
                      nodeKey={`${indexPrefix}-${index}`}
                      renderCtx={renderCtx}
                    />
                  </div>
                )
              : (
                  <div className="node-placeholder" style={{ height: `${placeholderHeight}px` }} />
                )}
          </div>
        )
      })}
      {bottomSpacer}
      {showTypewriterCursor && (
        <span ref={typewriterCursorRef} className="typewriter-cursor" aria-hidden="true" />
      )}
    </div>
  )
}

function areNodeRendererInnerPropsEqual(prev: NodeRendererInnerProps, next: NodeRendererInnerProps) {
  if (prev.renderCtx !== next.renderCtx)
    return false
  if (prev.indexPrefix !== next.indexPrefix)
    return false
  if (prev.containerRef !== next.containerRef)
    return false
  if (prev.showTypewriterCursor !== next.showTypewriterCursor)
    return false

  // Compare parsedNodes by individual references (stabilized nodes keep
  // their previous reference when content has not changed).
  const prevNodes = prev.parsedNodes
  const nextNodes = next.parsedNodes
  if (prevNodes === nextNodes)
    return true
  if (prevNodes.length !== nextNodes.length)
    return false
  for (let i = 0; i < prevNodes.length; i++) {
    if (prevNodes[i] !== nextNodes[i])
      return false
  }

  const a = prev.props
  const b = next.props
  return a.isDark === b.isDark
    && a.typewriter === b.typewriter
    && a.fade === b.fade
    && a.batchRendering === b.batchRendering
    && a.initialRenderBatchSize === b.initialRenderBatchSize
    && a.renderBatchSize === b.renderBatchSize
    && a.renderBatchDelay === b.renderBatchDelay
    && a.renderBatchBudgetMs === b.renderBatchBudgetMs
    && a.renderBatchIdleTimeoutMs === b.renderBatchIdleTimeoutMs
    && a.deferNodesUntilVisible === b.deferNodesUntilVisible
    && a.maxLiveNodes === b.maxLiveNodes
    && a.liveNodeBuffer === b.liveNodeBuffer
    && a.viewportPriority === b.viewportPriority
    && a.indexKey === b.indexKey
    && a.onClick === b.onClick
    && a.onMouseOver === b.onMouseOver
    && a.onMouseOut === b.onMouseOut
}

const MemoNodeRendererInner = React.memo(NodeRendererInner, areNodeRendererInnerPropsEqual)

export const NodeRenderer: React.FC<NodeRendererProps> = (rawProps) => {
  const props = { ...DEFAULT_PROPS, ...rawProps } as ResolvedProps
  const containerRef = useRef<HTMLDivElement | null>(null)
  const desiredThemeKeyRef = useRef<string | null>(null)
  const textStreamStateRef = useRef(new Map<string, string>())
  const streamRenderVersionRef = useRef(0)
  const previousRenderVersionSourceRef = useRef<unknown>(null)
  const smoothStream = useSmoothMarkdownStream(props.smoothStreamingOptions)
  const parentSmoothStreaming = React.useContext(SmoothStreamingContext)
  const [hasMountedForSmoothStreaming, setHasMountedForSmoothStreaming] = useState(
    () => props.smoothStreaming === true,
  )

  useEffect(() => {
    setHasMountedForSmoothStreaming(true)
  }, [])

  const hasNodes = Array.isArray(props.nodes) && props.nodes.length > 0
  const smoothStreamingEligible = useMemo(() => {
    if (props.smoothStreaming === false)
      return false
    if (hasNodes)
      return false
    if (props.smoothStreaming !== true && parentSmoothStreaming)
      return false
    if (props.smoothStreaming === true)
      return true
    return props.typewriter === true || (props.maxLiveNodes ?? 0) <= 0
  }, [
    hasNodes,
    parentSmoothStreaming,
    props.maxLiveNodes,
    props.smoothStreaming,
    props.typewriter,
  ])
  const smoothStreamingEnabled = hasMountedForSmoothStreaming && smoothStreamingEligible

  const renderContent = smoothStreamingEnabled
    ? smoothStream.visible
    : (props.content ?? '')

  const requestedFinal = useMemo(() => {
    const base = props.parseOptions ?? {}
    return props.final ?? (base as any).final
  }, [props.final, props.parseOptions])

  const rawContent = props.content ?? ''
  const smoothSourceSynced = hasNodes || smoothStream.source === rawContent

  const effectiveFinal = useMemo(() => {
    if (smoothStreamingEnabled && requestedFinal != null) {
      return Boolean(
        requestedFinal
        && smoothSourceSynced
        && smoothStream.caughtUp,
      )
    }
    return requestedFinal
  }, [
    requestedFinal,
    smoothSourceSynced,
    smoothStream.caughtUp,
    smoothStreamingEnabled,
  ])

  // ── Typewriter cursor ──
  const typewriterCursorRef = useRef<HTMLSpanElement | null>(null)
  const [showTypewriterCursor, setShowTypewriterCursor] = useState(false)
  const typewriterCursorTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastTypewriterContentLengthRef = useRef(0)

  const TYPEWRITER_CURSOR_EXCLUDED_NODE_TYPES = useMemo(
    () => new Set(['code_block', 'admonition', 'table', 'math_block', 'html_block', 'image']),
    [],
  )

  const shouldSkipTypewriterCursorForNode = useCallback((node: unknown) => {
    if (!node || typeof node !== 'object')
      return false
    const type = (node as Record<string, unknown>).type
    return typeof type === 'string' && TYPEWRITER_CURSOR_EXCLUDED_NODE_TYPES.has(type)
  }, [TYPEWRITER_CURSOR_EXCLUDED_NODE_TYPES])

  const getNodeTextLength = useCallback((node: unknown): number => {
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
  }, [])

  const getTypewriterContentLength = useCallback((): number => {
    if (props.nodes?.length)
      return (props.nodes as unknown[]).reduce<number>((total, node) => total + getNodeTextLength(node), 0)
    // Use raw content length, not renderContent (which may be the paced-out
    // visible portion when smooth streaming is active).  The cursor should
    // appear as long as the source content is growing, even if the visible
    // stream hasn't caught up yet.
    return (props.content ?? '').length
  }, [props.nodes, props.content, getNodeTextLength])

  const clearTypewriterCursorTimeout = useCallback(() => {
    if (!typewriterCursorTimeoutRef.current)
      return
    clearTimeout(typewriterCursorTimeoutRef.current)
    typewriterCursorTimeoutRef.current = undefined
  }, [])

  const getLastTextNode = useCallback((root: HTMLElement) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
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
  }, [])

  const updateTypewriterCursorPosition = useCallback(() => {
    if (typeof window === 'undefined' || !showTypewriterCursor || !containerRef.current || !typewriterCursorRef.current)
      return
    const root = containerRef.current
    const cursor = typewriterCursorRef.current
    const lastText = getLastTextNode(root)
    const rootRect = root.getBoundingClientRect()
    let left = 0
    let top = 0
    let height = 20

    if (lastText?.textContent) {
      const range = document.createRange()
      const end = lastText.textContent.length
      range.setStart(lastText, Math.max(0, end - 1))
      range.setEnd(lastText, end)
      const rects = typeof range.getClientRects === 'function'
        ? range.getClientRects()
        : undefined
      const rect = rects?.[rects.length - 1] ?? lastText.parentElement?.getBoundingClientRect()
      if (rect) {
        left = rect.right - rootRect.left + root.scrollLeft
        top = rect.top - rootRect.top + root.scrollTop
        height = rect.height || height
      }
      range.detach()
    }

    cursor.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, top)}px)`
    cursor.style.height = `${height}px`
  }, [showTypewriterCursor, containerRef, getLastTextNode])

  useEffect(() => {
    if (!showTypewriterCursor)
      return
    requestAnimationFrame(() => {
      updateTypewriterCursorPosition()
    })
  }, [showTypewriterCursor, updateTypewriterCursorPosition])

  useEffect(() => {
    return () => {
      clearTypewriterCursorTimeout()
    }
  }, [clearTypewriterCursorTimeout])

  const renderVersionSource = hasNodes ? props.nodes : renderContent
  if (previousRenderVersionSourceRef.current !== renderVersionSource) {
    streamRenderVersionRef.current += 1
    previousRenderVersionSourceRef.current = renderVersionSource
  }

  const customComponentsRevision = useSyncExternalStore(
    subscribeCustomComponents,
    getCustomComponentsRevision,
    getCustomComponentsRevision,
  )
  const customComponents = useMemo(() => {
    return getCustomNodeComponents(props.customId)
  }, [props.customId, customComponentsRevision])

  const instanceMsgId = useMemo(() => {
    return props.customId
      ? `renderer-${props.customId}`
      : `renderer-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }, [props.customId])

  const effectiveCustomHtmlTags = useMemo(() => {
    const base = props.parseOptions ?? {}
    const optionTags = (base as any).customHtmlTags ?? []
    return mergeCustomHtmlTags(
      props.customHtmlTags,
      Array.isArray(optionTags) ? optionTags : [],
    )
  }, [
    props.customId,
    props.customHtmlTags,
    props.parseOptions,
    customComponentsRevision,
  ])

  const mdBase = useMemo(() => {
    const tags = effectiveCustomHtmlTags
    if (!tags || tags.length === 0)
      return getMarkdown(instanceMsgId)
    return getMarkdown(instanceMsgId, { customHtmlTags: tags })
  }, [instanceMsgId, effectiveCustomHtmlTags])

  const mdInstance = useMemo(() => {
    const base = mdBase
    return props.customMarkdownIt ? props.customMarkdownIt(base) : base
  }, [mdBase, props.customMarkdownIt])

  const mergedParseOptions = useMemo(() => {
    const base = props.parseOptions ?? {}
    const resolvedFinal = effectiveFinal
    const hasFinal = resolvedFinal != null
    const hasCustom = effectiveCustomHtmlTags.length > 0

    if (!hasFinal && !hasCustom)
      return base

    return {
      ...(base as any),
      ...(hasFinal ? { final: resolvedFinal } : {}),
      ...(hasCustom ? { customHtmlTags: effectiveCustomHtmlTags } : {}),
    } as any
  }, [effectiveCustomHtmlTags, effectiveFinal, props.parseOptions])

  const rawParsedNodes = useMemo<ParsedNode[]>(() => {
    const debugEnabled = Boolean(props.debugPerformance)
      && typeof console !== 'undefined'
      && typeof performance !== 'undefined'
    const parseStart = debugEnabled ? performance.now() : 0

    let result: ParsedNode[] = []
    if (hasNodes) {
      result = (props.nodes as ParsedNode[]).map(node => ({ ...node }))
    }
    else if (renderContent) {
      result = parseMarkdownToStructure(renderContent, mdInstance ?? fallbackMarkdown, mergedParseOptions)
    }

    if (debugEnabled) {
      console.info('[markstream-react][perf] parse(sync)', {
        ms: Math.round(performance.now() - parseStart),
        nodes: result.length,
        contentLength: renderContent.length,
      })
    }

    return result
  }, [
    props.debugPerformance,
    renderContent,
    hasNodes,
    props.nodes,
    mergedParseOptions,
    mdInstance,
    props.customId,
    customComponentsRevision,
    effectiveCustomHtmlTags,
  ])

  // ── Typewriter cursor (depends on rawParsedNodes) ──
  const shouldShowTypewriterCursorForCurrentNodes = useCallback(() => {
    const lastNode = rawParsedNodes[rawParsedNodes.length - 1]
    return !shouldSkipTypewriterCursorForNode(lastNode)
  }, [rawParsedNodes, shouldSkipTypewriterCursorForNode])

  useEffect(() => {
    if (typeof window === 'undefined' || hasNodes)
      return

    // When the stream is final (and effective — smooth streaming has caught up),
    // hide the cursor immediately.
    if (effectiveFinal) {
      setShowTypewriterCursor(false)
      clearTypewriterCursorTimeout()
      return
    }

    const nextLength = getTypewriterContentLength()
    const cursorAllowed = shouldShowTypewriterCursorForCurrentNodes()
    if (props.typewriter === false || !cursorAllowed || nextLength <= lastTypewriterContentLengthRef.current) {
      if (props.typewriter === false || !cursorAllowed)
        setShowTypewriterCursor(false)
      lastTypewriterContentLengthRef.current = nextLength
      return
    }

    lastTypewriterContentLengthRef.current = nextLength
    setShowTypewriterCursor(true)
    clearTypewriterCursorTimeout()
    requestAnimationFrame(() => {
      updateTypewriterCursorPosition()
    })
    typewriterCursorTimeoutRef.current = setTimeout(() => {
      setShowTypewriterCursor(false)
    }, 3000)

    return () => {
      clearTypewriterCursorTimeout()
    }
  }, [
    renderContent,
    props.nodes,
    props.typewriter,
    props.content,
    effectiveFinal,
    rawParsedNodes.length,
    hasNodes,
    getTypewriterContentLength,
    shouldShowTypewriterCursorForCurrentNodes,
    clearTypewriterCursorTimeout,
    updateTypewriterCursorPosition,
  ])

  // Stabilize node references so that structurally-identical nodes keep
  // their previous object reference.  This is the key enabler for
  // NodeSlotContent's React.memo to skip re-rendering unchanged nodes.
  const prevStableNodesRef = useRef<ParsedNode[]>([])
  const parsedNodes = stabilizeParsedNodes(rawParsedNodes, prevStableNodesRef.current)
  prevStableNodesRef.current = parsedNodes

  useEffect(() => {
    if (hasNodes) {
      smoothStream.reset('')
      return
    }

    const nextContent = props.content ?? ''

    if (!smoothStreamingEnabled) {
      smoothStream.reset(nextContent)
      if (requestedFinal)
        smoothStream.finish({ flush: true })
      return
    }

    const source = smoothStream.getSnapshot().source

    if (!nextContent) {
      smoothStream.reset('')
    }
    else if (nextContent === source) {
      // no-op
    }
    else if (nextContent.startsWith(source)) {
      smoothStream.enqueue(nextContent.slice(source.length))
    }
    else {
      smoothStream.reset(nextContent)
    }

    if (requestedFinal)
      smoothStream.finish()
  }, [hasNodes, props.content, requestedFinal, smoothStreamingEnabled])

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    if (props.renderCodeBlocksAsPre)
      return
    // React parity improvement: prefetch Monaco (and preload workers) in idle time
    // so the first visible code block doesn't pay the full dynamic import cost.
    const hasCodeBlock = parsedNodes.some((node) => {
      if ((node as any)?.type !== 'code_block')
        return false
      const lang = normalizeLanguageIdentifier(String((node as any)?.language ?? ''))
      return lang !== 'mermaid'
    })
    if (!hasCodeBlock)
      return

    const requestIdle = (window as any).requestIdleCallback
      ?? ((cb: (deadline: { didTimeout?: boolean, timeRemaining?: () => number }) => void, opts?: { timeout?: number }) => {
        return window.setTimeout(() => cb({ didTimeout: true, timeRemaining: () => 0 }), opts?.timeout ?? 600)
      })
    const cancelIdle = (window as any).cancelIdleCallback
      ?? ((id: number) => window.clearTimeout(id))

    const id = requestIdle(() => {
      void getUseMonaco()
    }, { timeout: 900 })

    return () => cancelIdle(id)
  }, [parsedNodes, props.renderCodeBlocksAsPre])

  useEffect(() => {
    if (typeof window === 'undefined')
      return
    if (props.renderCodeBlocksAsPre)
      return
    const theme = props.isDark ? props.codeBlockDarkTheme : props.codeBlockLightTheme
    const nextKey = typeof theme === 'string'
      ? theme
      : (typeof theme === 'object' && theme && 'name' in (theme as any) ? String((theme as any).name) : null)
    if (nextKey && desiredThemeKeyRef.current !== nextKey) {
      desiredThemeKeyRef.current = nextKey
      setDesiredMonacoTheme(theme)
    }
  }, [props.codeBlockDarkTheme, props.codeBlockLightTheme, props.isDark, props.renderCodeBlocksAsPre])

  const indexPrefix = useMemo(() => {
    return props.indexKey != null ? String(props.indexKey) : 'markdown-renderer'
  }, [props.indexKey])

  const mergedCodeBlockProps = useMemo(() => {
    return {
      ...(typeof props.showTooltips === 'boolean' ? { showTooltips: props.showTooltips } : {}),
      ...(props.codeBlockProps || {}),
    }
  }, [props.codeBlockProps, props.showTooltips])

  const mergedMermaidProps = useMemo(() => {
    return {
      ...(props.mermaidProps || {}),
    }
  }, [props.mermaidProps])

  const mergedD2Props = useMemo(() => {
    return {
      ...(props.d2Props || {}),
    }
  }, [props.d2Props])

  const mergedInfographicProps = useMemo(() => {
    return {
      ...(props.infographicProps || {}),
    }
  }, [props.infographicProps])

  const renderCtx = useMemo<RenderContext>(() => ({
    customId: props.customId,
    isDark: props.isDark,
    indexKey: indexPrefix,
    typewriter: props.typewriter,
    fade: props.fade,
    textStreamState: textStreamStateRef.current,
    streamRenderVersion: streamRenderVersionRef.current,
    customComponents,
    customHtmlTags: effectiveCustomHtmlTags,
    htmlPolicy: props.htmlPolicy ?? 'safe',
    showTooltips: props.showTooltips,
    renderCodeBlocksAsPre: props.renderCodeBlocksAsPre,
    codeBlockStream: props.codeBlockStream,
    codeBlockProps: mergedCodeBlockProps,
    mermaidProps: mergedMermaidProps,
    d2Props: mergedD2Props,
    infographicProps: mergedInfographicProps,
    codeBlockThemes: {
      themes: props.themes,
      monacoOptions: props.codeBlockMonacoOptions,
      minWidth: props.codeBlockMinWidth,
      maxWidth: props.codeBlockMaxWidth,
    },
    events: {
      onCopy: props.onCopy,
      onHandleArtifactClick: props.onHandleArtifactClick,
    },
  }), [
    props.customId,
    props.isDark,
    indexPrefix,
    props.typewriter,
    props.fade,
    props.showTooltips,
    props.htmlPolicy,
    props.renderCodeBlocksAsPre,
    props.codeBlockStream,
    effectiveCustomHtmlTags,
    mergedCodeBlockProps,
    mergedMermaidProps,
    mergedD2Props,
    mergedInfographicProps,
    props.themes,
    props.codeBlockMonacoOptions,
    props.codeBlockMinWidth,
    props.codeBlockMaxWidth,
    props.onCopy,
    props.onHandleArtifactClick,
    customComponents,
  ])

  // Keep stream version and text state up-to-date via mutation so the
  // renderCtx object reference stays stable during streaming.  TextNode and
  // InlineCodeNode read the latest values from the StreamStateRefContext
  // (which never triggers a React re-render) or from renderCtx when they
  // re-render for other reasons (e.g. their own content changed).
  renderCtx.streamRenderVersion = streamRenderVersionRef.current
  renderCtx.textStreamState = textStreamStateRef.current

  // Create a stable StreamStateRef that provides mutable access to
  // stream version and text state without causing re-renders.
  const streamStateRef = useRef<StreamStateRef | null>(null)
  if (!streamStateRef.current) {
    streamStateRef.current = {
      textStreamState: textStreamStateRef.current,
      getStreamRenderVersion: () => streamRenderVersionRef.current,
    }
  }

  return (
    <StreamStateRefContext.Provider value={streamStateRef.current}>
      <SmoothStreamingContext.Provider value={smoothStreamingEnabled}>
        <ViewportPriorityProvider
          getRoot={() => containerRef.current}
          enabled={props.viewportPriority !== false}
        >
          <MemoNodeRendererInner
            props={props}
            parsedNodes={parsedNodes}
            renderCtx={renderCtx}
            indexPrefix={indexPrefix}
            containerRef={containerRef}
            showTypewriterCursor={showTypewriterCursor}
            typewriterCursorRef={typewriterCursorRef}
          />
        </ViewportPriorityProvider>
      </SmoothStreamingContext.Provider>
    </StreamStateRefContext.Provider>
  )
}

export default NodeRenderer
