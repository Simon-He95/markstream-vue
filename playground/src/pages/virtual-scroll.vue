<script setup lang="ts">
import type {
  MarkstreamHeightCache,
  MarkstreamRendererHandle,
  MarkstreamVirtualMetrics,
  MarkstreamVirtualScrollOptions,
  MarkstreamVirtualState,
} from '../../../src/exports'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import MarkdownRender from '../../../src/exports'
import '../../../src/index.css'

interface Message {
  threadId: ThreadId
  id: string
  role: 'user' | 'assistant'
  content: string
  final: boolean
  huge: boolean
  revision: number
}

type ThreadId = 'thread-a' | 'thread-b'

type LabProfile = 'smoke' | 'stress'

type ProbeKind = 'content' | 'placeholder' | 'chrome' | 'empty-card' | 'blank'

interface ProbeCounts {
  content: number
  placeholder: number
  chrome: number
  emptyCard: number
  blank: number
}

interface LabStats {
  visibleItemCount: number
  markdownRendererCount: number
  markdownSlotCount: number
  markdownContentCount: number
  maxHugeMessageSlotCount: number
  hugeMessageDomCount: number
  blankProbeCount: number
  placeholderProbeCount: number
  emptyCardProbeCount: number
  chromeOnlyProbeCount: number
  heightDriftPx: number
  maxItemHeightDriftPx: number
  maxCoverageGapPx: number
  maxItemOverflowPx: number
  domNodeCount: number
  messageDomCount: number
  visibleCoverageOk: boolean
  clippedMessageCount: number
  heightDriftMessageCount: number
  worstHeightDriftMessageId: string
}

interface LabHealth extends LabStats {
  eventCount: number
  layoutTransitionExpected: boolean
  maxObservedBlankProbes: number
  maxObservedPlaceholderProbes: number
  maxObservedEmptyCardProbes: number
  maxObservedMarkdownSlots: number
  maxObservedHeightDriftPx: number
  maxObservedCoverageGapPx: number
  maxObservedItemOverflowPx: number
  maxObservedScrollJumpPx: number
  scrollJitterOk: boolean
  strictClippingOk: boolean
  virtualDomWithinLimit: boolean
  hugeRendererDomWithinLimit: boolean
  hugeRendererSlotBudget: number
  domSlotBudget: number
  lastThreadRestoreDeltaPx: number
  lastThreadRestoreAnchorDeltaPx: number
  threadRestoreOk: boolean
  layoutIntegrityOk: boolean
}

interface VirtualScrollLabSnapshot {
  ready: boolean
  threadId: ThreadId
  streamingActive: boolean
  layoutWidth: number
  range: { start: number, end: number }
  firstVisibleMessageId: string
  outerAnchor: OuterAnchor | null
  stats: LabStats
  health: LabHealth
  events: LabEvent[]
  labStatus: string
  activeThreadId: ThreadId
  totalHeight: number
  scrollTop: number
  viewportHeight: number
  distanceFromBottomPx: number
  visibleRange: { start: number, end: number }
  messageDomCount: number
  domNodeCount: number
  markdownSlotCount: number
  markdownContentCount: number
  maxHugeMessageSlotCount: number
  hugeRendererSlotBudget: number
  maxDomNodeCount: number
  maxMarkdownSlotCount: number
  expectedMarkdownSlotCeiling: number
  expectedDomNodeCeiling: number
  maxExpectedMarkdownSlotCeiling: number
  maxExpectedDomNodeCeiling: number
  blankFrameCount: number
  clippedMessageCount: number
  heightDriftMessageCount: number
  maxItemHeightDriftPx: number
  maxItemOverflowPx: number
  visibleCoverageOk: boolean
  settledEvents: number
  heightCacheStateCount: number
  scrollCompensationCount: number
  lastThreadRestoreDeltaPx: number
  lastThreadRestoreAnchorDeltaPx: number
}

interface CollectStatsOptions {
  reconcile?: boolean
}

interface LabEvent {
  type: string
  at: number
  threadId: ThreadId
  scrollTop: number
  blankProbeCount?: number
  placeholderProbeCount?: number
  emptyCardProbeCount?: number
  chromeOnlyProbeCount?: number
  markdownSlotCount?: number
  heightDriftPx?: number
  maxItemHeightDriftPx?: number
  maxCoverageGapPx?: number
  maxItemOverflowPx?: number
  scrollJumpPx?: number
  expectedJump?: boolean
  expectedLayoutChange?: boolean
  fromThreadId?: ThreadId
  toThreadId?: ThreadId
}

interface ItemHeightRecord {
  height: number
  measurementKey: string
}

interface ChromeHeightRecord {
  height: number
  measurementKey: string
}

interface StreamLastMessageOptions {
  blocks?: number
  initialChars?: number
  chunkSize?: number
  intervalMs?: number
}

declare global {
  interface Window {
    __markstreamVirtualScrollLab?: {
      read: () => VirtualScrollLabSnapshot
      scrollToRatio: (ratio: number) => Promise<void>
      switchThread: (threadId: ThreadId) => Promise<void>
      rapidSwitchThreads: (threadIds: ThreadId[], count?: number) => Promise<void>
      startStressScroll: () => void
      stopStressScroll: () => void
      startStreamingLastMessage: (options?: StreamLastMessageOptions) => void
      toggleDensity: () => Promise<void>
      toggleFontScale: () => Promise<void>
      toggleSmallMessageCoordination: () => Promise<void>
      toggleNarrowMode: () => Promise<void>
      toggleReverseFlexMode: () => Promise<void>
      forceUnmountVisibleHugeMessage: () => Promise<void>
      replaceVisibleHugeMessageSameShape: () => Promise<void>
      settleVisibleRenderers: () => Promise<MarkstreamVirtualMetrics[]>
      nextFrame: () => Promise<void>
      clearEvents: () => void
    }
    __MARKSTREAM_VIRTUAL_SCROLL_LAB__?: {
      read: () => VirtualScrollLabSnapshot
      actions: {
        jumpToTop: () => void
        jumpToMiddle: () => void
        jumpToBottom: () => void
        startStressScroll: () => void
        stopStressScroll: () => void
        startStreamingLastMessage: () => void
        switchThread: (threadId: ThreadId) => Promise<void>
        toggleDensity: () => Promise<void>
        toggleFontScale: () => Promise<void>
        toggleSmallMessageCoordination: () => Promise<void>
        toggleNarrowMode: () => Promise<void>
        toggleReverseFlexMode: () => Promise<void>
        forceUnmountVisibleHugeMessage: () => Promise<void>
        replaceVisibleHugeMessageSameShape: () => Promise<void>
        settleVisibleRenderers: () => Promise<MarkstreamVirtualMetrics[]>
        resetHeights: () => void
      }
    }
  }
}

const scrollRoot = ref<HTMLElement | null>(null)
const activeThreadId = ref<ThreadId>('thread-a')
const viewportHeight = ref(720)
const scrollTop = ref(0)
const layoutWidth = ref(0)
const density = ref<'comfortable' | 'compact'>('comfortable')
const fontScale = ref(1)
const maxLiveNodes = ref(220)
const overscanPx = ref(1400)
const scrollVelocityPxPerFrame = ref(0)
const stressRunning = ref(false)
const coordinateSmallMessages = ref(false)
const narrowMode = ref(false)
const reverseFlexMode = ref(false)
const SCROLL_JITTER_BUDGET_PX = 32
const USER_SCROLL_COMPENSATION_GUARD_MS = 180
const USER_SCROLL_DIAGNOSTIC_GUARD_MS = 600
const PROGRAMMATIC_SCROLL_GUARD_MS = 160
const RESTORE_TARGET_RELEASE_DELAY_MS = 1200
const COORDINATED_RENDERER_SLOT_EXTRA = 24
const SMALL_RENDERER_SLOT_BUDGET = 140
const PAGE_CHROME_DOM_BUDGET = 2200
const MESSAGE_DOM_BUDGET = 96
const MARKDOWN_SLOT_DOM_MULTIPLIER = 5
const DIAGNOSTICS_READY_STABLE_FRAMES = 3
const DIAGNOSTICS_READY_TIMEOUT_MS = 8000

function readLabProfile(): LabProfile {
  if (typeof window === 'undefined')
    return 'stress'

  const raw = new URLSearchParams(window.location.search).get('profile')
  return raw === 'smoke' ? 'smoke' : 'stress'
}

const labProfile = readLabProfile()

const fixtureConfig = labProfile === 'smoke'
  ? {
      messageCount: 42,
      hugeModulo: 9,
      hugeOffset: 4,
      hugeBlocks: 180,
      lastHugeBlocks: 420,
    }
  : {
      messageCount: 80,
      hugeModulo: 9,
      hugeOffset: 4,
      hugeBlocks: 360,
      lastHugeBlocks: 900,
    }

const itemHeights = reactive(new Map<string, ItemHeightRecord>())
const chromeHeights = reactive(new Map<string, ChromeHeightRecord>())
const virtualStates = reactive(new Map<string, MarkstreamVirtualState>())
const logicalHeightDrifts = reactive(new Map<string, number>())
const threadScrollTops = reactive(new Map<ThreadId, number>())
const threadAnchors = reactive(new Map<ThreadId, OuterAnchor>())
const threadRestoreTargets = reactive(new Map<ThreadId, {
  messageKey: string
  token: number
}>())
const messageEls = new Map<string, HTMLElement>()
const messageCardEls = new Map<string, HTMLElement>()
const markdownHostEls = new Map<string, HTMLElement>()
const rendererRefs = new Map<string, MarkstreamRendererHandle>()
const forceHiddenMessageKeys = reactive(new Set<string>())
const threadRestoreTargetClearTimers = new Map<
  ThreadId,
  ReturnType<typeof setTimeout>
>()

const domNodeCount = ref(0)
const messageDomCount = ref(0)
const markdownSlotCount = ref(0)
const markdownContentCount = ref(0)
const blankFrameCount = ref(0)
const clippedMessageCount = ref(0)
const heightDriftMessageCount = ref(0)
const maxItemHeightDriftPx = ref(0)
const worstHeightDriftMessageId = ref('')
const visibleCoverageOk = ref(true)
const maxDomNodeCount = ref(0)
const maxMarkdownSlotCount = ref(0)
const maxExpectedMarkdownSlotCeiling = ref(0)
const maxExpectedDomNodeCeiling = ref(0)
const lastHeightEvent = ref<MarkstreamVirtualMetrics | null>(null)
const settledEvents = ref(0)
const scrollCompensationCount = ref(0)
const lastThreadRestoreDeltaPx = ref(0)
const lastThreadRestoreAnchorDeltaPx = ref(0)
const diagnosticsReady = ref(false)
const labEvents = reactive<LabEvent[]>([])

let statsRaf = 0
let diagnosticsWarmupSeq = 0
let stressRaf = 0
let streamTimer: ReturnType<typeof window.setInterval> | null = null
let resizeObserver: ResizeObserver | null = null
let streamBottomPinned = false
let streamingHeightChangeExpectedUntil = 0
let lastObservedScrollTop = 0
let expectedScrollTop: number | null = null
let restoreAnchorTokenSeq = 0
let lastUserScrollAt = 0
let programmaticScrollGuardUntil = 0
let lastVelocitySampleTop = 0
let lastVelocitySampleAt = 0
let previousScrollRestoration: ScrollRestoration | undefined

function nowMs() {
  return typeof performance !== 'undefined'
    ? performance.now()
    : Date.now()
}

function updateScrollVelocity(currentTop: number) {
  const at = nowMs()

  if (lastVelocitySampleAt > 0) {
    const dt = Math.max(16, at - lastVelocitySampleAt)
    const pxPerFrame = Math.abs(currentTop - lastVelocitySampleTop) / dt * 16
    scrollVelocityPxPerFrame.value = Math.min(4000, pxPerFrame)
  }

  lastVelocitySampleTop = currentTop
  lastVelocitySampleAt = at
}

const dynamicOverscanPx = computed(() => {
  return Math.ceil(Math.max(
    overscanPx.value,
    viewportHeight.value * 2.5,
    Math.min(8000, scrollVelocityPxPerFrame.value * 2.5),
  ))
})

function markProgrammaticScroll(durationMs = PROGRAMMATIC_SCROLL_GUARD_MS) {
  programmaticScrollGuardUntil = Math.max(
    programmaticScrollGuardUntil,
    nowMs() + durationMs,
  )
}

function isProgrammaticScroll() {
  return nowMs() <= programmaticScrollGuardUntil
}

function isRecentUserScroll() {
  return lastUserScrollAt > 0
    && nowMs() - lastUserScrollAt <= USER_SCROLL_DIAGNOSTIC_GUARD_MS
}

function isActiveViewportMotion() {
  return stressRunning.value || isRecentUserScroll()
}

function shouldReconcileVisibleDomDuringStats() {
  return !isActiveViewportMotion()
}

function clearThreadRestoreTargetTimer(threadId: ThreadId) {
  const timer = threadRestoreTargetClearTimers.get(threadId)
  if (!timer)
    return

  clearTimeout(timer)
  threadRestoreTargetClearTimers.delete(threadId)
}

function deferClearThreadRestoreTarget(
  threadId: ThreadId,
  delayMs = RESTORE_TARGET_RELEASE_DELAY_MS,
) {
  clearThreadRestoreTargetTimer(threadId)

  const timer = setTimeout(() => {
    threadRestoreTargetClearTimers.delete(threadId)
    threadRestoreTargets.delete(threadId)
  }, delayMs)

  threadRestoreTargetClearTimers.set(threadId, timer)
}

function shouldRestoreOuterAnchorAfterHeightChange(anchor: OuterAnchor | null) {
  if (!anchor)
    return false

  if (anchor.type === 'bottom')
    return true

  if (streamBottomPinned || streamTimer != null || isStreamingHeightChangeExpected())
    return true

  if (stressRunning.value)
    return false

  return nowMs() - lastUserScrollAt > USER_SCROLL_COMPENSATION_GUARD_MS
}

function markThreadRestoreConsumedIfNeeded(
  message: Message,
  metrics: MarkstreamVirtualMetrics,
) {
  const key = messageKey(message)
  const target = threadRestoreTargets.get(message.threadId)

  if (!target || target.messageKey !== key)
    return

  if (metrics.reason === 'restore' || metrics.stable || metrics.phase === 'final')
    deferClearThreadRestoreTarget(message.threadId)
}

function readRootScrollTop() {
  return getNormalizedOuterScrollTop()
}

function markStreamingHeightChangeExpected(durationMs = 8000) {
  streamingHeightChangeExpectedUntil = Math.max(streamingHeightChangeExpectedUntil, nowMs() + durationMs)
}

function isStreamingHeightChangeExpected() {
  return nowMs() <= streamingHeightChangeExpectedUntil
}

function isExpectedScrollJump(currentScrollTop: number) {
  if (
    expectedScrollTop != null
    && Math.abs(currentScrollTop - expectedScrollTop) <= 2
  ) {
    return true
  }

  return isProgrammaticScroll()
    || isRecentUserScroll()
    || stressRunning.value
    || streamBottomPinned
    || streamTimer != null
    || isStreamingHeightChangeExpected()
    || threadRestoreTargets.has(activeThreadId.value)
}

function isExpectedLayoutChange() {
  return isProgrammaticScroll()
    || isRecentUserScroll()
    || stressRunning.value
    || streamTimer != null
    || isStreamingHeightChangeExpected()
    || threadRestoreTargets.has(activeThreadId.value)
}

function syncScrollStateFromRoot(
  options: {
    updateExpected?: boolean
  } = {},
) {
  const current = readRootScrollTop()

  scrollTop.value = current
  updateScrollVelocity(current)
  threadScrollTops.set(activeThreadId.value, current)

  if (options.updateExpected)
    expectedScrollTop = current

  return current
}

function repeatedText(seed: string, index: number) {
  return [
    `This is paragraph ${index} in a long virtual scroll transcript.`,
    `seed=${seed}; the text is intentionally wide enough to reflow when the container width changes.`,
    'The quick brown fox jumps over the lazy dog. '.repeat(4),
  ].join(' ')
}

function makeMarkdown(seed: string, blocks: number) {
  const parts: string[] = [
    `# Virtual Scroll Fixture ${seed}`,
    `This document contains ${blocks} blocks for DOM size, spacer height, scroll restore, and blank-frame checks.`,
  ]

  for (let i = 1; i <= blocks; i++) {
    parts.push(`## ${seed} Section ${i}`)
    parts.push(repeatedText(seed, i))

    if (i % 7 === 0) {
      parts.push([
        `> Quote block ${i}`,
        '> A second quote line verifies block margin and formatting-context measurement.',
      ].join('\n'))
    }

    if (i % 11 === 0) {
      parts.push([
        '| index | value | note |',
        '| --- | ---: | --- |',
        `| ${i} | ${i * 13} | table row for virtual scroll |`,
        `| ${i + 1} | ${(i + 1) * 13} | another row |`,
      ].join('\n'))
    }

    if (i % 17 === 0) {
      parts.push([
        '```ts',
        `export function fixture${i}(input: string) {`,
        `  return input.split('').reverse().join('')`,
        '}',
        '```',
      ].join('\n'))
    }

    if (i % 23 === 0) {
      parts.push([
        '- nested list item A',
        '  - child A1',
        '  - child A2',
        '- nested list item B',
      ].join('\n'))
    }
  }

  return parts.join('\n\n')
}

function makeMessages(threadId: ThreadId): Message[] {
  const prefix = threadId === 'thread-a' ? 'A' : 'B'
  const lastIndex = fixtureConfig.messageCount - 1

  return Array.from({ length: fixtureConfig.messageCount }, (_, index) => {
    const huge = index % fixtureConfig.hugeModulo === fixtureConfig.hugeOffset
      || index === lastIndex
    const blocks = huge
      ? (index === lastIndex ? fixtureConfig.lastHugeBlocks : fixtureConfig.hugeBlocks)
      : 6 + (index % 5)

    return {
      threadId,
      id: `${threadId}-msg-${index}`,
      role: index % 3 === 0 ? 'user' : 'assistant',
      huge,
      final: true,
      revision: 1,
      content: huge
        ? makeMarkdown(`${prefix}-${index}`, blocks)
        : [
            `### ${prefix} message ${index}`,
            repeatedText(prefix, index),
            index % 4 === 0 ? '`inline code` and **bold text**.' : '',
          ].join('\n\n'),
    }
  })
}

const threads = reactive({
  'thread-a': makeMessages('thread-a'),
  'thread-b': makeMessages('thread-b'),
})

const messages = computed(() => threads[activeThreadId.value])

const measurementKey = computed(() => [
  density.value,
  fontScale.value,
  Math.round(layoutWidth.value / 32) * 32,
].join(':'))

const domBudgetKey = computed(() => [
  maxLiveNodes.value,
  dynamicOverscanPx.value,
].join(':'))

function messageStateKey(message: Message) {
  return `${message.threadId}:${message.id}`
}

function messageRenderKey(message: Message) {
  return `${message.threadId}:${message.id}:${message.revision}`
}

function messageKey(message: Message) {
  return messageStateKey(message)
}

function setMessageEl(message: Message, el: Element | null) {
  const key = messageStateKey(message)
  if (el instanceof HTMLElement)
    messageEls.set(key, el)
  else
    messageEls.delete(key)
}

function setMessageCardEl(message: Message, el: Element | null) {
  const key = messageStateKey(message)
  if (el instanceof HTMLElement)
    messageCardEls.set(key, el)
  else
    messageCardEls.delete(key)
}

function setMarkdownHostEl(message: Message, el: Element | null) {
  const key = messageStateKey(message)
  if (el instanceof HTMLElement)
    markdownHostEls.set(key, el)
  else
    markdownHostEls.delete(key)
}

function setRendererRef(message: Message, instance: MarkstreamRendererHandle | null) {
  const key = messageStateKey(message)
  if (instance)
    rendererRefs.set(key, instance)
  else
    rendererRefs.delete(key)
}

function isForceHidden(message: Message) {
  return forceHiddenMessageKeys.has(messageStateKey(message))
}

function getEstimatedMessageHeight(message: Message) {
  return message.huge
    ? Math.max(2700, Math.ceil(message.content.length * 0.29))
    : 230
}

function getCachedItemHeight(key: string) {
  const record = itemHeights.get(key)
  if (!record)
    return null

  if (record.measurementKey !== measurementKey.value)
    return null

  return record.height
}

function getCachedChromeHeight(key: string) {
  const record = chromeHeights.get(key)
  if (!record)
    return null

  if (record.measurementKey !== measurementKey.value)
    return null

  return record.height
}

function setItemHeight(key: string, height: number) {
  if (!Number.isFinite(height) || height <= 0)
    return

  const next = Math.ceil(height)
  const previous = itemHeights.get(key)?.height

  if (previous == null || Math.abs(previous - next) > 1)
    markProgrammaticScroll(240)

  itemHeights.set(key, {
    height: next,
    measurementKey: measurementKey.value,
  })
}

function setChromeHeight(key: string, height: number) {
  if (!Number.isFinite(height) || height <= 0)
    return

  chromeHeights.set(key, {
    height: Math.ceil(height),
    measurementKey: measurementKey.value,
  })
}

function pruneStaleItemHeights() {
  for (const [key, record] of itemHeights) {
    if (record.measurementKey !== measurementKey.value)
      itemHeights.delete(key)
  }

  for (const [key, record] of chromeHeights) {
    if (record.measurementKey !== measurementKey.value)
      chromeHeights.delete(key)
  }
}

function getItemHeight(message: Message) {
  return getCachedItemHeight(messageKey(message)) ?? getEstimatedMessageHeight(message)
}

function isCoordinatedMessage(message: Message) {
  return message.huge || coordinateSmallMessages.value
}

const prefixTops = computed(() => {
  const tops: number[] = [0]
  let total = 0

  for (const message of messages.value) {
    total += getItemHeight(message)
    tops.push(total)
  }

  return tops
})

const totalHeight = computed(() => prefixTops.value[prefixTops.value.length - 1] ?? 0)

function isOuterReverseFlexRoot(root: HTMLElement | null = scrollRoot.value) {
  if (!root || typeof window === 'undefined')
    return false

  try {
    const style = window.getComputedStyle(root)
    const display = (style.display || '').toLowerCase()
    const direction = (style.flexDirection || '').toLowerCase()
    return display.includes('flex') && direction.endsWith('reverse')
  }
  catch {
    return false
  }
}

function getOuterScrollMax(root: HTMLElement | null = scrollRoot.value) {
  const viewport = root?.clientHeight || viewportHeight.value
  return Math.max(
    0,
    totalHeight.value - viewport,
    root ? (root.scrollHeight || 0) - (root.clientHeight || 0) : 0,
  )
}

function getNormalizedOuterScrollTop(root: HTMLElement | null = scrollRoot.value) {
  if (!root)
    return scrollTop.value

  if (!isOuterReverseFlexRoot(root))
    return Math.max(0, root.scrollTop || 0)

  const raw = root.scrollTop || 0
  const distanceFromBottom = raw < 0 ? -raw : raw
  return Math.max(0, getOuterScrollMax(root) - distanceFromBottom)
}

function setNormalizedOuterScrollTop(
  value: number,
  root: HTMLElement | null = scrollRoot.value,
) {
  const target = clampOuterScrollTop(value)
  scrollTop.value = target
  markProgrammaticScroll()

  if (!root)
    return

  if (!isOuterReverseFlexRoot(root)) {
    if (Math.abs((root.scrollTop || 0) - target) > 1)
      root.scrollTop = target
    scrollTop.value = getNormalizedOuterScrollTop(root)
    return
  }

  const distanceFromBottom = Math.max(0, getOuterScrollMax(root) - target)

  root.scrollTop = -distanceFromBottom
  if (Math.abs(getNormalizedOuterScrollTop(root) - target) > 2)
    root.scrollTop = distanceFromBottom

  scrollTop.value = getNormalizedOuterScrollTop(root)
}

function lowerBoundOffset(offset: number) {
  const tops = prefixTops.value
  let low = 0
  let high = Math.max(0, tops.length - 2)
  let answer = high

  while (low <= high) {
    const mid = (low + high) >> 1
    if ((tops[mid + 1] ?? 0) >= offset) {
      answer = mid
      high = mid - 1
    }
    else {
      low = mid + 1
    }
  }

  return answer
}

const visibleRange = computed(() => {
  const overscan = dynamicOverscanPx.value
  const startOffset = Math.max(0, scrollTop.value - overscan)
  const endOffset = Math.min(
    totalHeight.value,
    scrollTop.value + viewportHeight.value + overscan,
  )

  const start = lowerBoundOffset(startOffset)
  let end = lowerBoundOffset(endOffset) + 1

  end = Math.min(messages.value.length, Math.max(start + 1, end))

  return { start, end }
})

const visibleItems = computed(() => {
  const { start, end } = visibleRange.value

  return messages.value.slice(start, end).map((message, localIndex) => {
    const index = start + localIndex
    return {
      message,
      index,
      top: prefixTops.value[index] ?? 0,
      height: getItemHeight(message),
    }
  })
})

async function captureVisibleVirtualStates(options: { forceMeasure?: boolean } = {}) {
  for (const item of visibleItems.value) {
    const key = messageKey(item.message)
    const renderer = rendererRefs.get(key)
    if (!renderer)
      continue

    if (options.forceMeasure) {
      try {
        await renderer.forceMeasure('manual')
      }
      catch {
        // The lab should still capture the best available state.
      }
    }

    const state = renderer.captureVirtualState({
      requireViewport: true,
      includeEmptyState: true,
    })
    if (state) {
      virtualStates.set(key, mergeVirtualState(virtualStates.get(key), state))

      if (state.metrics.totalHeight > 0)
        setItemHeight(key, getLogicalMessageHeight(key, state.metrics.totalHeight))
    }
  }
}

const renderedCoordinatedMessageCount = computed(() => {
  return visibleItems.value.filter(item => isCoordinatedMessage(item.message)).length
})

const expectedMarkdownSlotCeiling = computed(() => {
  const coordinatedCount = renderedCoordinatedMessageCount.value
  const uncoordinatedCount = Math.max(0, visibleItems.value.length - coordinatedCount)

  return coordinatedCount * (maxLiveNodes.value + COORDINATED_RENDERER_SLOT_EXTRA)
    + uncoordinatedCount * SMALL_RENDERER_SLOT_BUDGET
})

const expectedDomNodeCeiling = computed(() => {
  return PAGE_CHROME_DOM_BUDGET
    + messageDomCount.value * MESSAGE_DOM_BUDGET
    + expectedMarkdownSlotCeiling.value * MARKDOWN_SLOT_DOM_MULTIPLIER
})

const labReady = computed(() => {
  return totalHeight.value > viewportHeight.value
    && messageDomCount.value > 0
    && markdownSlotCount.value > 0
})

function makeVirtualScrollOptions(message: Message): MarkstreamVirtualScrollOptions {
  const stateKey = messageStateKey(message)
  const sessionKey = messageRenderKey(message)
  const previousState = virtualStates.get(stateKey)
  const state = previousState?.sessionKey === sessionKey
    ? previousState
    : undefined
  const heightCache = state?.heightCache as MarkstreamHeightCache | undefined
  const enabled = message.huge || coordinateSmallMessages.value
  const restoreTarget = threadRestoreTargets.get(message.threadId)

  const options = {
    enabled,
    sessionKey,
    threadKey: message.threadId,
    scrollRoot: () => scrollRoot.value,
    restoreState: state ?? null,
    restoreAnchor: restoreTarget?.messageKey === stateKey
      ? restoreTarget.token
      : false,
    measurementKey: measurementKey.value,
    settleMode: 'manual',
    settledToken: message.final,
    emitIntervalMs: 32,
    heightDiffThresholdPx: 1,
  } satisfies MarkstreamVirtualScrollOptions

  const stateWidth = Number(state?.width)
  const canPassStandaloneHeightCache = Boolean(
    heightCache?.length
    && Number.isFinite(stateWidth)
    && stateWidth > 0,
  )

  if (canPassStandaloneHeightCache) {
    return {
      ...options,
      heightCache,
      heightCacheWidth: stateWidth,
    }
  }

  return {
    ...options,
    heightCache: null,
  }
}

function onHeightChange(message: Message, metrics: MarkstreamVirtualMetrics) {
  if (metrics.sessionKey !== messageRenderKey(message))
    return

  const key = messageKey(message)
  const isActiveThreadMessage = message.threadId === activeThreadId.value
  const restoreTargetAnchor = threadRestoreTargets.has(message.threadId)
    ? threadAnchors.get(message.threadId) ?? null
    : null
  const outerAnchor: OuterAnchor | null = isActiveThreadMessage
    ? streamBottomPinned
      ? { type: 'bottom', distanceFromBottomPx: 0 }
      : restoreTargetAnchor ?? captureOuterAnchor()
    : null

  const measuredContentHeight = getMeasuredMessageContentHeight(key)
  const logicalContentHeight = getLogicalMessageHeight(key, metrics.totalHeight)
  const coordinated = isCoordinatedMessage(message)
  const expectedLayoutChange = isExpectedLayoutChange()
  const nextHeight = coordinated
    ? Math.max(logicalContentHeight, measuredContentHeight)
    : (measuredContentHeight || logicalContentHeight)
  const previous = getCachedItemHeight(key)

  if (isActiveThreadMessage) {
    lastHeightEvent.value = metrics
    markThreadRestoreConsumedIfNeeded(message, metrics)
  }

  if (coordinated && !expectedLayoutChange) {
    const drift = getRendererMetricDrift(key, metrics.totalHeight)
    if (drift > 1)
      logicalHeightDrifts.set(key, drift)
    else
      logicalHeightDrifts.delete(key)
  }
  else {
    logicalHeightDrifts.delete(key)
  }

  if (previous == null || Math.abs(previous - nextHeight) > 1) {
    setItemHeight(key, nextHeight)

    if (isActiveThreadMessage && shouldRestoreOuterAnchorAfterHeightChange(outerAnchor))
      void restoreOuterAnchor(outerAnchor, { immediate: true })
  }

  if (isActiveThreadMessage && !isForceHidden(message)) {
    scheduleStats()
    scheduleLabEvent(
      'markdown-height-change',
      {
        heightDriftPx: coordinated
          ? getRendererMetricDrift(key, metrics.totalHeight)
          : previous == null
            ? 0
            : Math.abs(previous - nextHeight),
        expectedJump: outerAnchor?.type === 'bottom'
          || streamTimer != null
          || isStreamingHeightChangeExpected()
          || threadRestoreTargets.has(activeThreadId.value)
          || stressRunning.value
          ? true
          : undefined,
        expectedLayoutChange,
      },
      {
        reconcileBeforeRecord: true,
        shouldRecord: () => !isForceHidden(message),
      },
    )
  }
}

interface OuterAnchor {
  type: 'item' | 'bottom'
  messageKey?: string
  index?: number
  offsetPx?: number
  distanceFromBottomPx?: number
}

function captureOuterAnchor(): OuterAnchor | null {
  const root = scrollRoot.value
  if (!root)
    return null

  const currentScrollTop = getNormalizedOuterScrollTop(root)
  const distanceFromBottomPx = Math.max(
    0,
    totalHeight.value - currentScrollTop - root.clientHeight,
  )

  if (distanceFromBottomPx <= 8) {
    return {
      type: 'bottom',
      distanceFromBottomPx,
    }
  }

  const index = lowerBoundOffset(currentScrollTop + 1)
  const message = messages.value[index]
  return {
    type: 'item',
    messageKey: message ? messageKey(message) : undefined,
    index,
    offsetPx: currentScrollTop - (prefixTops.value[index] ?? 0),
  }
}

function resolveThreadAnchorMessageKey(threadId: ThreadId, anchor: OuterAnchor | null) {
  if (!anchor)
    return ''

  const list = threads[threadId]

  if (anchor.type === 'item') {
    if (anchor.messageKey)
      return anchor.messageKey

    const index = Math.min(
      Math.max(0, anchor.index ?? 0),
      Math.max(0, list.length - 1),
    )
    const message = list[index]
    return message ? messageKey(message) : ''
  }

  const message = list[list.length - 1]
  return message ? messageKey(message) : ''
}

function resolveOuterAnchorIndex(anchor: OuterAnchor) {
  if (anchor.type !== 'item')
    return 0

  if (anchor.messageKey) {
    const byKey = messages.value.findIndex(message => messageKey(message) === anchor.messageKey)
    if (byKey >= 0)
      return byKey
  }

  return Math.min(
    Math.max(0, anchor.index ?? 0),
    Math.max(0, messages.value.length - 1),
  )
}

function markThreadRestoreTarget(threadId: ThreadId, anchor: OuterAnchor | null) {
  const key = resolveThreadAnchorMessageKey(threadId, anchor)
  if (!key)
    return

  clearThreadRestoreTargetTimer(threadId)

  threadRestoreTargets.set(threadId, {
    messageKey: key,
    token: ++restoreAnchorTokenSeq,
  })
}

function getCurrentViewportHeight() {
  return scrollRoot.value?.clientHeight || viewportHeight.value
}

function clampOuterScrollTop(value: number) {
  const max = Math.max(0, totalHeight.value - getCurrentViewportHeight())
  return Math.max(0, Math.min(value, max))
}

function applyOuterScrollTop(value: number) {
  setNormalizedOuterScrollTop(value)
}

function resolveOuterAnchorScrollTop(anchor: OuterAnchor) {
  const currentViewportHeight = getCurrentViewportHeight()

  if (anchor.type === 'bottom') {
    return clampOuterScrollTop(
      totalHeight.value
      - currentViewportHeight
      - Math.max(0, anchor.distanceFromBottomPx ?? 0),
    )
  }

  const index = resolveOuterAnchorIndex(anchor)

  return clampOuterScrollTop(
    (prefixTops.value[index] ?? 0) + Math.max(0, anchor.offsetPx ?? 0),
  )
}

function getOuterAnchorDelta(before: OuterAnchor | null, after: OuterAnchor | null) {
  if (!before || !after || before.type !== after.type)
    return Number.POSITIVE_INFINITY

  if (before.type === 'bottom') {
    return Math.abs(
      Number(before.distanceFromBottomPx ?? 0)
      - Number(after.distanceFromBottomPx ?? 0),
    )
  }

  if (before.messageKey && after.messageKey && before.messageKey !== after.messageKey)
    return Number.POSITIVE_INFINITY

  if (before.messageKey == null && after.messageKey == null && before.index !== after.index)
    return Number.POSITIVE_INFINITY

  return Math.abs(Number(before.offsetPx ?? 0) - Number(after.offsetPx ?? 0))
}

async function restoreOuterAnchor(
  anchor: OuterAnchor | null,
  options: { immediate?: boolean, expectedJump?: boolean } = {},
) {
  if (!anchor)
    return

  const apply = () => {
    const previous = scrollTop.value
    applyOuterScrollTop(resolveOuterAnchorScrollTop(anchor))
    const jump = Math.abs(previous - scrollTop.value)

    if (jump > 1) {
      expectedScrollTop = scrollTop.value
      scrollCompensationCount.value += 1
      void nextTick(() => {
        requestAnimationFrame(() => {
          pushLabEvent('outer-anchor-compensation', {
            scrollJumpPx: jump,
            expectedJump: options.expectedJump
              ?? true,
          })
        })
      })
      scheduleStats()
    }
  }

  if (options.immediate) {
    apply()
    void nextTick(() => {
      apply()
      void waitFrame().then(apply)
    })
    return
  }

  await nextTick()
  apply()
}

function getCurrentDistanceFromBottom() {
  const root = scrollRoot.value
  if (!root)
    return 0

  return Math.max(
    0,
    totalHeight.value - getNormalizedOuterScrollTop(root) - root.clientHeight,
  )
}

function readPx(value: string | null | undefined) {
  const parsed = Number.parseFloat(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function getMeasuredMessageContentHeight(key: string) {
  const article = messageEls.get(key)
  const card = messageCardEls.get(key)
  if (!article || !card)
    return 0

  const articleStyle = window.getComputedStyle(article)
  const cardStyle = window.getComputedStyle(card)
  const articlePadding = readPx(articleStyle.paddingTop) + readPx(articleStyle.paddingBottom)
  const cardBorder = readPx(cardStyle.borderTopWidth) + readPx(cardStyle.borderBottomWidth)

  const cardRectHeight = card.getBoundingClientRect().height
  const cardOffsetHeight = card.offsetHeight
  const cardScrollHeight = card.scrollHeight + cardBorder

  return Math.ceil(
    Math.max(cardRectHeight, cardOffsetHeight, cardScrollHeight)
    + articlePadding,
  )
}

function getMessageChromeHeight(key: string) {
  const article = messageEls.get(key)
  const card = messageCardEls.get(key)
  const markdownHost = markdownHostEls.get(key)
  const meta = card?.querySelector<HTMLElement>(':scope > .message-meta')

  if (!article || !card || !markdownHost || !meta)
    return getCachedChromeHeight(key) ?? 72

  const articleStyle = window.getComputedStyle(article)
  const cardStyle = window.getComputedStyle(card)
  const metaStyle = window.getComputedStyle(meta)
  const articlePadding = readPx(articleStyle.paddingTop) + readPx(articleStyle.paddingBottom)
  const cardPadding = readPx(cardStyle.paddingTop) + readPx(cardStyle.paddingBottom)
  const cardBorder = readPx(cardStyle.borderTopWidth) + readPx(cardStyle.borderBottomWidth)
  const metaHeight = Math.max(
    meta.getBoundingClientRect().height,
    meta.offsetHeight,
  )
  const metaMargin = readPx(metaStyle.marginTop) + readPx(metaStyle.marginBottom)

  const chromeHeight = Math.max(
    0,
    Math.ceil(articlePadding + cardPadding + cardBorder + metaHeight + metaMargin),
  )

  setChromeHeight(key, chromeHeight)
  return chromeHeight
}

function getMarkdownRendererDomHeight(key: string) {
  const markdownHost = markdownHostEls.get(key)
  const renderer = markdownHost?.querySelector<HTMLElement>(
    ':scope > .markstream-vue.markdown-renderer',
  )

  if (!renderer)
    return 0

  return Math.ceil(Math.max(
    renderer.scrollHeight,
    renderer.offsetHeight,
    renderer.getBoundingClientRect().height,
  ))
}

function getLogicalMessageHeight(key: string, rendererHeight: number) {
  return Math.max(
    1,
    Math.ceil(rendererHeight + getMessageChromeHeight(key)),
  )
}

function getRendererMetricDrift(key: string, rendererHeight: number) {
  const rendererDomHeight = getMarkdownRendererDomHeight(key)

  if (!Number.isFinite(rendererDomHeight) || rendererDomHeight <= 0)
    return 0

  if (!Number.isFinite(rendererHeight) || rendererHeight <= 0)
    return rendererDomHeight

  return Math.abs(rendererDomHeight - rendererHeight)
}

function onVirtualStateChange(message: Message, state: MarkstreamVirtualState) {
  if (state.sessionKey !== messageRenderKey(message))
    return

  const key = messageKey(message)
  const previous = virtualStates.get(key)
  virtualStates.set(key, mergeVirtualState(previous, state))
}

function canCarryStateIdentity(
  previous: MarkstreamVirtualState | undefined,
  next: MarkstreamVirtualState,
) {
  if (!previous)
    return false

  return previous.sessionKey === next.sessionKey
    && (previous.threadKey ?? '') === (next.threadKey ?? '')
    && (previous.measurementKey ?? '') === (next.measurementKey ?? '')
    && (!previous.contentHash || !next.contentHash || previous.contentHash === next.contentHash)
}

function canCarryHeightCache(
  previous: MarkstreamVirtualState | undefined,
  next: MarkstreamVirtualState,
) {
  return Boolean(
    previous?.heightCache?.length
    && canCarryStateIdentity(previous, next),
  )
}

function mergeVirtualState(
  previous: MarkstreamVirtualState | undefined,
  next: MarkstreamVirtualState,
): MarkstreamVirtualState {
  const heightCache = next.heightCache?.length
    ? next.heightCache
    : canCarryHeightCache(previous, next)
      ? previous!.heightCache
      : undefined

  const nextExplicitlyCapturedNoAnchor = next.anchorCaptured === false
  const shouldCarryPreviousAnchor = next.anchor == null
    && !nextExplicitlyCapturedNoAnchor
    && canCarryStateIdentity(previous, next)

  const anchor = next.anchor
    ?? (shouldCarryPreviousAnchor ? previous?.anchor : undefined)

  const merged: MarkstreamVirtualState = {
    ...next,
    anchorCaptured: next.anchor
      ? next.anchorCaptured !== false
      : nextExplicitlyCapturedNoAnchor
        ? false
        : previous?.anchorCaptured,
    ...(heightCache?.length ? { heightCache } : {}),
    width: next.width || previous?.width || 0,
    contentHash: next.contentHash ?? previous?.contentHash,
    measurementKey: next.measurementKey ?? previous?.measurementKey,
  }

  if (anchor)
    merged.anchor = anchor
  else
    delete merged.anchor

  return merged
}

function isCurrentOuterAnchorOwner(message: Message) {
  const anchor = captureOuterAnchor()
  if (!anchor)
    return false

  return resolveThreadAnchorMessageKey(message.threadId, anchor) === messageKey(message)
}

function onAnchorChange(message: Message, anchor: MarkstreamVirtualState['anchor']) {
  if (!anchor)
    return

  if (message.threadId !== activeThreadId.value)
    return

  const key = messageKey(message)

  if (!isCurrentOuterAnchorOwner(message))
    return

  const previous = virtualStates.get(key)
  const base = previous
    ?? rendererRefs.get(key)?.captureVirtualState()
    ?? null

  if (!base)
    return

  virtualStates.set(key, {
    ...base,
    anchor,
    anchorCaptured: true,
  })
}

function onRenderSettled() {
  settledEvents.value += 1
  scheduleStats()
  scheduleLabEvent('render-settled', {
    expectedJump: isExpectedScrollJump(readRootScrollTop()),
    expectedLayoutChange: isExpectedLayoutChange(),
  })
}

function onScroll() {
  if (!scrollRoot.value)
    return

  const programmatic = isProgrammaticScroll()
  const previousExpectedScrollTop = expectedScrollTop

  const currentScrollTop = syncScrollStateFromRoot({ updateExpected: true })
  const expectedProgrammaticScroll = previousExpectedScrollTop != null
    && Math.abs(currentScrollTop - previousExpectedScrollTop) <= 2

  if (!programmatic || !expectedProgrammaticScroll)
    lastUserScrollAt = nowMs()

  if (streamBottomPinned && !streamTimer && getCurrentDistanceFromBottom() > 64)
    streamBottomPinned = false

  scheduleVisibleDomReconcile()
  scheduleLabEvent('scroll', { expectedJump: true })
}

function scheduleStats() {
  scheduleVisibleDomReconcile()
}

function scheduleVisibleDomReconcile() {
  if (statsRaf)
    return

  statsRaf = requestAnimationFrame(() => {
    statsRaf = 0
    syncScrollStateFromRoot()
    applyLabStats(collectStats({
      reconcile: shouldReconcileVisibleDomDuringStats(),
    }))
  })
}

function createEmptyProbeCounts(): ProbeCounts {
  return {
    content: 0,
    placeholder: 0,
    chrome: 0,
    emptyCard: 0,
    blank: 0,
  }
}

function hasVisibleRect(el: Element | null) {
  if (
    !(el instanceof HTMLElement)
    && !(typeof SVGElement !== 'undefined' && el instanceof SVGElement)
  ) {
    return false
  }

  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 1
}

function hasRenderableMarkdownContent(el: Element | null) {
  if (!el)
    return false

  const contentSelector = [
    'p',
    'pre',
    'code',
    'table',
    'blockquote',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'img',
    'svg',
    'canvas',
    '.paragraph-node',
    '.code-block-shell',
    '.math-block-node',
    '.mermaid-block',
    '.d2-block',
    '.infographic-block',
  ].join(',')

  const candidate = el.matches?.(contentSelector)
    ? el
    : el.querySelector(contentSelector)

  if (candidate && hasVisibleRect(candidate))
    return true

  return (el.textContent?.trim().length ?? 0) > 0 && hasVisibleRect(el)
}

function classifyProbePoint(probe: Element | null): ProbeKind {
  if (!probe)
    return 'blank'

  const element = probe instanceof Element ? probe : probe.parentElement
  if (!element)
    return 'blank'

  if (element.closest('.node-placeholder'))
    return 'placeholder'

  const content = element.closest('.node-content')
  if (content) {
    return hasRenderableMarkdownContent(content) || hasRenderableMarkdownContent(element)
      ? 'content'
      : 'blank'
  }

  const slot = element.closest('.node-slot')
  if (slot) {
    if (slot.querySelector(':scope > .node-placeholder'))
      return 'placeholder'

    const slotContent = slot.querySelector(':scope > .node-content')
    return hasRenderableMarkdownContent(slotContent) ? 'content' : 'blank'
  }

  if (element.closest('.message-meta'))
    return 'chrome'

  const card = element.closest('.message-card')
  if (card) {
    const markdownHost = card.querySelector('.markdown-host')
    return hasRenderableMarkdownContent(markdownHost) ? 'content' : 'empty-card'
  }

  const message = element.closest('.virtual-message')
  if (message) {
    const markdownHost = message.querySelector('.markdown-host')
    return hasRenderableMarkdownContent(markdownHost) ? 'content' : 'empty-card'
  }

  return 'blank'
}

function countProbePoints(root: HTMLElement) {
  const rootRect = root.getBoundingClientRect()
  const counts = createEmptyProbeCounts()

  if (rootRect.width <= 0 || rootRect.height <= 0)
    return counts

  const xRatios = [0.2, 0.5, 0.8]
  const yRatios = [0.08, 0.25, 0.5, 0.75, 0.92]

  for (const xRatio of xRatios) {
    for (const yRatio of yRatios) {
      const probe = document.elementFromPoint(
        rootRect.left + rootRect.width * xRatio,
        rootRect.top + rootRect.height * yRatio,
      )

      const kind = classifyProbePoint(probe)
      counts[kind] += 1
    }
  }

  return counts
}

function createEmptyLabStats(): LabStats {
  return {
    visibleItemCount: 0,
    markdownRendererCount: 0,
    markdownSlotCount: 0,
    markdownContentCount: 0,
    maxHugeMessageSlotCount: 0,
    hugeMessageDomCount: 0,
    blankProbeCount: 0,
    placeholderProbeCount: 0,
    emptyCardProbeCount: 0,
    chromeOnlyProbeCount: 0,
    heightDriftPx: 0,
    maxItemHeightDriftPx: 0,
    maxCoverageGapPx: 0,
    maxItemOverflowPx: 0,
    domNodeCount: 0,
    messageDomCount: 0,
    visibleCoverageOk: true,
    clippedMessageCount: 0,
    heightDriftMessageCount: 0,
    worstHeightDriftMessageId: '',
  }
}

function applyLabStats(stats: LabStats) {
  domNodeCount.value = stats.domNodeCount
  messageDomCount.value = stats.messageDomCount
  markdownSlotCount.value = stats.markdownSlotCount
  markdownContentCount.value = stats.markdownContentCount
  maxDomNodeCount.value = Math.max(maxDomNodeCount.value, stats.domNodeCount)
  maxMarkdownSlotCount.value = Math.max(maxMarkdownSlotCount.value, stats.markdownSlotCount)
  maxExpectedMarkdownSlotCeiling.value = Math.max(
    maxExpectedMarkdownSlotCeiling.value,
    expectedMarkdownSlotCeiling.value,
  )
  maxExpectedDomNodeCeiling.value = Math.max(
    maxExpectedDomNodeCeiling.value,
    expectedDomNodeCeiling.value,
  )
  clippedMessageCount.value = stats.clippedMessageCount
  heightDriftMessageCount.value = stats.heightDriftMessageCount
  maxItemHeightDriftPx.value = stats.maxItemHeightDriftPx
  worstHeightDriftMessageId.value = stats.worstHeightDriftMessageId
  visibleCoverageOk.value = stats.visibleCoverageOk

  blankFrameCount.value = stats.blankProbeCount > 0
    ? blankFrameCount.value + 1
    : 0

  refreshLabSnapshot(stats)
}

function measureViewportCoverageGaps(root: HTMLElement) {
  const viewport = root.getBoundingClientRect()
  const segments: Array<{ top: number, bottom: number }> = []

  for (const el of root.querySelectorAll('.virtual-message')) {
    if (!(el instanceof HTMLElement))
      continue

    const rect = el.getBoundingClientRect()
    const top = Math.max(viewport.top, rect.top)
    const bottom = Math.min(viewport.bottom, rect.bottom)

    if (bottom > top)
      segments.push({ top, bottom })
  }

  segments.sort((a, b) => a.top - b.top)

  let cursor = viewport.top
  let maxGap = 0

  for (const segment of segments) {
    if (segment.top > cursor)
      maxGap = Math.max(maxGap, segment.top - cursor)

    cursor = Math.max(cursor, segment.bottom)
  }

  if (cursor < viewport.bottom)
    maxGap = Math.max(maxGap, viewport.bottom - cursor)

  return maxGap
}

function measureItemOverflowPx(article: HTMLElement, card: HTMLElement) {
  const articleRect = article.getBoundingClientRect()
  const cardRect = card.getBoundingClientRect()

  return Math.max(
    0,
    cardRect.bottom - articleRect.bottom,
    articleRect.top - cardRect.top,
  )
}

function collectStats(options: CollectStatsOptions = {}) {
  const root = scrollRoot.value
  if (!root)
    return createEmptyLabStats()

  const reconcile = options.reconcile === true && shouldReconcileVisibleDomDuringStats()

  const domCount = root.querySelectorAll('*').length
  const messageCount = root.querySelectorAll('.virtual-message').length
  const slotCount = root.querySelectorAll('.node-slot').length
  const contentCount = root.querySelectorAll('.node-content').length
  const hugeMessages = Array.from(root.querySelectorAll<HTMLElement>('.virtual-message.huge'))
  const maxHugeMessageSlotCount = hugeMessages.reduce((max, el) => {
    const renderer = el.querySelector<HTMLElement>(
      ':scope > .message-card > .markdown-host > .markstream-vue.markdown-renderer',
    )
    return Math.max(max, renderer?.querySelectorAll(':scope > .node-slot').length ?? 0)
  }, 0)

  let drifted = 0
  let maxDrift = 0
  let worstId = ''
  let visibleItemCount = 0
  let blankProbeCount = 0
  let placeholderProbeCount = 0
  let emptyCardProbeCount = 0
  let chromeOnlyProbeCount = 0
  let heightDriftPx = 0
  let maxItemOverflowPx = 0
  let heightChanged = false
  const outerAnchor: OuterAnchor | null = reconcile && streamBottomPinned
    ? { type: 'bottom', distanceFromBottomPx: 0 }
    : reconcile && !stressRunning.value
      ? captureOuterAnchor()
      : null
  const viewportRect = root.getBoundingClientRect()
  const viewportTop = viewportRect.height > 0 ? viewportRect.top : 0
  const viewportBottom = viewportRect.height > 0 ? viewportRect.bottom : root.clientHeight
  const currentViewportHeight = getCurrentViewportHeight()

  for (const item of visibleItems.value) {
    const key = messageKey(item.message)
    const el = messageEls.get(key)
    if (!el)
      continue

    visibleItemCount++

    const expected = getItemHeight(item.message)
    const coordinated = isCoordinatedMessage(item.message)
    const measured = getMeasuredMessageContentHeight(key)
    const actual = Math.ceil(Math.max(
      measured,
      el.offsetHeight || 0,
      el.scrollHeight || 0,
      el.getBoundingClientRect().height || 0,
    ))
    const logicalDrift = logicalHeightDrifts.get(key) ?? 0
    const absDrift = actual > 0
      ? Math.max(Math.abs(actual - expected), logicalDrift)
      : logicalDrift

    heightDriftPx += absDrift

    if (reconcile && !coordinated && actual > 0 && absDrift > 1) {
      setItemHeight(key, Math.ceil(actual))
      heightChanged = true
    }

    if (actual > 0 && absDrift > 2) {
      drifted += 1
      if (absDrift > maxDrift) {
        maxDrift = absDrift
        worstId = item.message.id
      }
    }

    const rect = el.getBoundingClientRect()
    const intersects = rect.bottom > viewportTop && rect.top < viewportBottom
    if (intersects && actual <= 1)
      blankProbeCount++

    const card = messageCardEls.get(key)
    if (card) {
      maxItemOverflowPx = Math.max(
        maxItemOverflowPx,
        measureItemOverflowPx(el, card),
      )
    }
  }

  if (heightChanged && shouldRestoreOuterAnchorAfterHeightChange(outerAnchor))
    void restoreOuterAnchor(outerAnchor, { immediate: true })

  const probeCounts = totalHeight.value > currentViewportHeight
    ? countProbePoints(root)
    : createEmptyProbeCounts()

  blankProbeCount += probeCounts.blank
    + probeCounts.placeholder
    + probeCounts.emptyCard
  placeholderProbeCount += probeCounts.placeholder
  emptyCardProbeCount += probeCounts.emptyCard
  chromeOnlyProbeCount += probeCounts.chrome

  const covered = probeCounts.blank === 0
    && probeCounts.placeholder === 0
    && probeCounts.emptyCard === 0

  if (messageCount === 0 && totalHeight.value > currentViewportHeight)
    blankProbeCount++

  const maxCoverageGapPx = measureViewportCoverageGaps(root)
  const coverageGapOk = maxCoverageGapPx <= 24

  return {
    visibleItemCount,
    markdownRendererCount: root.querySelectorAll('.markstream-vue').length,
    markdownSlotCount: slotCount,
    markdownContentCount: contentCount,
    maxHugeMessageSlotCount,
    hugeMessageDomCount: hugeMessages.length,
    blankProbeCount,
    placeholderProbeCount,
    emptyCardProbeCount,
    chromeOnlyProbeCount,
    heightDriftPx,
    maxItemHeightDriftPx: maxDrift,
    maxCoverageGapPx,
    maxItemOverflowPx,
    domNodeCount: domCount,
    messageDomCount: messageCount,
    visibleCoverageOk: covered && coverageGapOk,
    clippedMessageCount: drifted,
    heightDriftMessageCount: drifted,
    worstHeightDriftMessageId: worstId,
  }
}

function pushLabEvent(
  type: string,
  payload: Partial<LabEvent> = {},
  stats: LabStats = collectStats({ reconcile: false }),
) {
  const now = typeof performance !== 'undefined'
    ? performance.now()
    : Date.now()
  const currentScrollTop = syncScrollStateFromRoot()
  const scrollJumpPx = Math.abs(currentScrollTop - lastObservedScrollTop)
  const expectedActiveScrollJump = isExpectedScrollJump(currentScrollTop)
  const expectedActiveLayoutChange = isExpectedLayoutChange()

  lastObservedScrollTop = currentScrollTop

  if (!diagnosticsReady.value) {
    refreshLabSnapshot(stats)
    return
  }

  const {
    expectedJump: payloadExpectedJump,
    expectedLayoutChange: payloadExpectedLayoutChange,
    ...eventPayload
  } = payload

  labEvents.push({
    type,
    at: now,
    threadId: activeThreadId.value,
    scrollTop: currentScrollTop,
    blankProbeCount: stats.blankProbeCount,
    placeholderProbeCount: stats.placeholderProbeCount,
    emptyCardProbeCount: stats.emptyCardProbeCount,
    chromeOnlyProbeCount: stats.chromeOnlyProbeCount,
    markdownSlotCount: stats.markdownSlotCount,
    heightDriftPx: stats.heightDriftPx,
    maxItemHeightDriftPx: stats.maxItemHeightDriftPx,
    maxCoverageGapPx: stats.maxCoverageGapPx,
    maxItemOverflowPx: stats.maxItemOverflowPx,
    scrollJumpPx,
    ...eventPayload,
    expectedJump: payloadExpectedJump ?? expectedActiveScrollJump,
    expectedLayoutChange: payloadExpectedLayoutChange ?? expectedActiveLayoutChange,
  })

  while (labEvents.length > 300)
    labEvents.shift()

  refreshLabSnapshot(stats)
}

function scheduleLabEvent(
  type: string,
  payload: Partial<LabEvent> = {},
  options: { reconcileBeforeRecord?: boolean, shouldRecord?: () => boolean } = {},
) {
  requestAnimationFrame(() => {
    if (options.shouldRecord && !options.shouldRecord())
      return

    syncScrollStateFromRoot()

    const canReconcile = shouldReconcileVisibleDomDuringStats()

    if (options.reconcileBeforeRecord && canReconcile)
      applyLabStats(collectStats({ reconcile: true }))

    const stats = collectStats({ reconcile: false })
    pushLabEvent(type, payload, stats)

    if (!options.reconcileBeforeRecord && canReconcile)
      applyLabStats(collectStats({ reconcile: true }))
  })
}

async function saveActiveThreadViewport(options: { forceMeasure?: boolean } = {}) {
  const threadId = activeThreadId.value
  const anchor = captureOuterAnchor()
  const top = syncScrollStateFromRoot()

  threadScrollTops.set(threadId, top)

  if (anchor) {
    threadAnchors.set(threadId, anchor)
    markThreadRestoreTarget(threadId, anchor)
  }

  await captureVisibleVirtualStates({
    forceMeasure: options.forceMeasure === true,
  })
}

async function switchThread(threadId: ThreadId) {
  if (threadId === activeThreadId.value)
    return

  const previousThreadId = activeThreadId.value
  const previousScrollTop = scrollTop.value

  await saveActiveThreadViewport({ forceMeasure: true })

  activeThreadId.value = threadId
  forceHiddenMessageKeys.clear()

  await nextTick()

  const anchor = threadAnchors.get(threadId) ?? null
  const savedTop = threadScrollTops.get(threadId) ?? 0

  if (anchor) {
    markThreadRestoreTarget(threadId, anchor)
    await restoreOuterAnchor(anchor, {
      immediate: true,
      expectedJump: true,
    })
  }
  else {
    applyOuterScrollTop(savedTop)
  }

  for (let i = 0; i < 4; i++) {
    await nextTick()
    await waitFrame()

    if (anchor) {
      await restoreOuterAnchor(anchor, {
        immediate: true,
        expectedJump: true,
      })
    }
  }

  const restored = getNormalizedOuterScrollTop()
  lastThreadRestoreDeltaPx.value = Math.abs(restored - savedTop)
  lastThreadRestoreAnchorDeltaPx.value = getOuterAnchorDelta(
    anchor,
    captureOuterAnchor(),
  )

  pushLabEvent('thread-switch', {
    fromThreadId: previousThreadId,
    toThreadId: threadId,
    expectedJump: true,
    scrollJumpPx: Math.abs(restored - previousScrollTop),
    heightDriftPx: lastThreadRestoreDeltaPx.value,
  })

  scheduleVisibleDomReconcile()

  if (anchor)
    deferClearThreadRestoreTarget(threadId)
}

function jumpToTop() {
  return scrollToRatio(0)
}

function jumpToMiddle() {
  return scrollToRatio(0.5)
}

function jumpToBottom() {
  return scrollToRatio(1)
}

async function mutateLayoutWithAnchor(mutator: () => void) {
  const threadId = activeThreadId.value
  const anchor = captureOuterAnchor()

  if (anchor) {
    threadAnchors.set(threadId, anchor)
    markThreadRestoreTarget(threadId, anchor)
  }

  mutator()
  pruneStaleItemHeights()

  for (let i = 0; i < 4; i++) {
    await nextTick()

    if (anchor)
      await restoreOuterAnchor(anchor, { immediate: true, expectedJump: true })

    await waitFrame()
    applyLabStats(collectStats({ reconcile: true }))
  }

  scheduleStats()

  if (anchor)
    deferClearThreadRestoreTarget(threadId)
}

function toggleDensity() {
  return mutateLayoutWithAnchor(() => {
    density.value = density.value === 'comfortable' ? 'compact' : 'comfortable'
  })
}

function toggleFontScale() {
  return mutateLayoutWithAnchor(() => {
    fontScale.value = fontScale.value === 1 ? 1.12 : 1
  })
}

function toggleSmallMessageCoordination() {
  return mutateLayoutWithAnchor(() => {
    coordinateSmallMessages.value = !coordinateSmallMessages.value
  })
}

function toggleNarrowMode() {
  return mutateLayoutWithAnchor(() => {
    narrowMode.value = !narrowMode.value
  })
}

function toggleReverseFlexMode() {
  return mutateLayoutWithAnchor(() => {
    reverseFlexMode.value = !reverseFlexMode.value
  })
}

function startStressScroll() {
  if (stressRunning.value)
    return

  stressRunning.value = true
  const startedAt = performance.now()

  const step = () => {
    if (!stressRunning.value || !scrollRoot.value)
      return

    const currentViewportHeight = getCurrentViewportHeight()
    const maxScroll = Math.max(0, totalHeight.value - currentViewportHeight)
    const t = performance.now() - startedAt
    const ratio = (Math.sin(t / 600) + 1) / 2
    const target = maxScroll * ratio
    const maxStep = Math.max(600, currentViewportHeight * 1.5)
    const current = getNormalizedOuterScrollTop(scrollRoot.value)
    const delta = Math.max(-maxStep, Math.min(maxStep, target - current))

    applyOuterScrollTop(current + delta)
    onScroll()

    stressRaf = requestAnimationFrame(step)
  }

  stressRaf = requestAnimationFrame(step)
}

function stopStressScroll() {
  stressRunning.value = false
  if (stressRaf) {
    cancelAnimationFrame(stressRaf)
    stressRaf = 0
  }
}

function startStreamingLastMessage(options: StreamLastMessageOptions = {}) {
  if (streamTimer)
    window.clearInterval(streamTimer)

  const target = messages.value[messages.value.length - 1]
  const full = makeMarkdown(`${activeThreadId.value}-streaming`, options.blocks ?? 1100)
  const chunkSize = Math.max(1, options.chunkSize ?? 2400)
  const intervalMs = Math.max(0, options.intervalMs ?? 80)
  let cursor = Math.max(0, options.initialChars ?? 1200)
  const key = messageKey(target)

  target.revision += 1
  virtualStates.delete(key)
  itemHeights.delete(key)
  logicalHeightDrifts.delete(key)

  streamBottomPinned = getCurrentDistanceFromBottom() <= 32
  markStreamingHeightChangeExpected()

  target.content = full.slice(0, cursor)
  target.final = false

  if (streamBottomPinned) {
    void restoreOuterAnchor(
      { type: 'bottom', distanceFromBottomPx: 0 },
      { immediate: true, expectedJump: true },
    )
  }

  streamTimer = window.setInterval(() => {
    markStreamingHeightChangeExpected()
    cursor += chunkSize
    target.content = full.slice(0, cursor)

    if (streamBottomPinned) {
      void restoreOuterAnchor(
        { type: 'bottom', distanceFromBottomPx: 0 },
        { immediate: true, expectedJump: true },
      )
    }

    if (cursor >= full.length) {
      target.content = full
      target.final = true
      void nextTick(() => {
        void rendererRefs.get(messageKey(target))?.settle({ reason: 'manual' })
      })

      if (streamBottomPinned) {
        void restoreOuterAnchor(
          { type: 'bottom', distanceFromBottomPx: 0 },
          { immediate: true, expectedJump: true },
        )
      }

      if (streamTimer)
        window.clearInterval(streamTimer)
      streamTimer = null
      markStreamingHeightChangeExpected()
    }
  }, intervalMs)
}

function resetHeights() {
  itemHeights.clear()
  chromeHeights.clear()
  virtualStates.clear()
  logicalHeightDrifts.clear()
  streamBottomPinned = false
  streamingHeightChangeExpectedUntil = 0
  blankFrameCount.value = 0
  clippedMessageCount.value = 0
  heightDriftMessageCount.value = 0
  maxItemHeightDriftPx.value = 0
  worstHeightDriftMessageId.value = ''
  visibleCoverageOk.value = true
  maxDomNodeCount.value = 0
  maxMarkdownSlotCount.value = 0
  maxExpectedMarkdownSlotCeiling.value = 0
  maxExpectedDomNodeCeiling.value = 0
  scrollCompensationCount.value = 0
  lastThreadRestoreDeltaPx.value = 0
  lastThreadRestoreAnchorDeltaPx.value = 0
  labEvents.splice(0)
  const currentScrollTop = syncScrollStateFromRoot()
  lastObservedScrollTop = currentScrollTop
  expectedScrollTop = currentScrollTop
  scheduleStats()
}

function clearDiagnosticsWarmupTimer() {
  diagnosticsWarmupSeq += 1
}

function resetObservedHealthState() {
  blankFrameCount.value = 0
  clippedMessageCount.value = 0
  heightDriftMessageCount.value = 0
  maxItemHeightDriftPx.value = 0
  worstHeightDriftMessageId.value = ''
  visibleCoverageOk.value = true
  scrollCompensationCount.value = 0
  lastThreadRestoreDeltaPx.value = 0
  lastThreadRestoreAnchorDeltaPx.value = 0
  labEvents.splice(0)

  const currentScrollTop = syncScrollStateFromRoot()
  lastObservedScrollTop = currentScrollTop
  expectedScrollTop = currentScrollTop
}

function startDiagnosticsWarmup() {
  diagnosticsReady.value = false
  clearDiagnosticsWarmupTimer()
  resetObservedHealthState()

  const seq = ++diagnosticsWarmupSeq

  if (typeof window === 'undefined') {
    diagnosticsReady.value = true
    return
  }

  void waitForDiagnosticsWarmupReady(seq)
}

function isStatsReadyForDiagnostics(stats: LabStats) {
  return labReady.value
    && stats.blankProbeCount === 0
    && stats.placeholderProbeCount === 0
    && stats.emptyCardProbeCount === 0
    && stats.visibleCoverageOk === true
    && stats.maxCoverageGapPx <= 24
    && stats.maxItemOverflowPx <= 2
    && stats.maxItemHeightDriftPx < 24
    && stats.markdownSlotCount > 0
    && stats.messageDomCount > 0
}

async function waitForDiagnosticsWarmupReady(seq: number) {
  const startedAt = nowMs()
  let stableFrames = 0

  for (;;) {
    if (seq !== diagnosticsWarmupSeq)
      return

    await nextTick()
    await waitFrame()

    if (seq !== diagnosticsWarmupSeq)
      return

    const stats = collectStats({ reconcile: true })
    applyLabStats(stats)

    if (isStatsReadyForDiagnostics(stats))
      stableFrames += 1
    else
      stableFrames = 0

    if (
      stableFrames >= DIAGNOSTICS_READY_STABLE_FRAMES
      || nowMs() - startedAt >= DIAGNOSTICS_READY_TIMEOUT_MS
    ) {
      if (seq !== diagnosticsWarmupSeq)
        return

      resetObservedHealthState()
      diagnosticsReady.value = true
      applyLabStats(collectStats({ reconcile: true }))
      return
    }
  }
}

function readLabHealth(stats = collectStats({ reconcile: false })): LabHealth {
  const observedEvents = diagnosticsReady.value ? labEvents : []
  const layoutTransitionExpected = isExpectedLayoutChange()
  const unexpectedLayoutEvents = observedEvents.filter(event => !event.expectedLayoutChange)

  const maxObservedBlankProbes = Math.max(
    diagnosticsReady.value ? stats.blankProbeCount : 0,
    0,
    ...observedEvents.map(event => event.blankProbeCount ?? 0),
  )
  const maxObservedPlaceholderProbes = Math.max(
    diagnosticsReady.value ? stats.placeholderProbeCount : 0,
    0,
    ...observedEvents.map(event => event.placeholderProbeCount ?? 0),
  )
  const maxObservedEmptyCardProbes = Math.max(
    diagnosticsReady.value ? stats.emptyCardProbeCount : 0,
    0,
    ...observedEvents.map(event => event.emptyCardProbeCount ?? 0),
  )
  const maxObservedMarkdownSlots = Math.max(
    stats.markdownSlotCount,
    0,
    ...observedEvents.map(event => event.markdownSlotCount ?? 0),
  )
  const maxObservedHeightDriftPx = Math.max(
    diagnosticsReady.value && !layoutTransitionExpected ? stats.maxItemHeightDriftPx : 0,
    0,
    ...unexpectedLayoutEvents.map(event => event.maxItemHeightDriftPx ?? 0),
  )
  const maxObservedCoverageGapPx = Math.max(
    diagnosticsReady.value ? stats.maxCoverageGapPx : 0,
    0,
    ...observedEvents.map(event => event.maxCoverageGapPx ?? 0),
  )
  const maxObservedItemOverflowPx = Math.max(
    diagnosticsReady.value && !layoutTransitionExpected ? stats.maxItemOverflowPx : 0,
    0,
    ...unexpectedLayoutEvents.map(event => event.maxItemOverflowPx ?? 0),
  )
  const maxObservedScrollJumpPx = Math.max(
    0,
    ...observedEvents
      .filter(event => !event.expectedJump)
      .map(event => event.scrollJumpPx ?? 0),
  )
  const domSlotBudget = Math.max(
    expectedMarkdownSlotCeiling.value,
    maxExpectedMarkdownSlotCeiling.value || 0,
  )
  const virtualDomWithinLimit = maxObservedMarkdownSlots <= domSlotBudget
  const hugeRendererSlotBudget = maxLiveNodes.value + COORDINATED_RENDERER_SLOT_EXTRA
  const hugeRendererDomWithinLimit = stats.maxHugeMessageSlotCount <= hugeRendererSlotBudget
  const scrollJitterOk = maxObservedScrollJumpPx <= SCROLL_JITTER_BUDGET_PX
  const strictClippingOk = layoutTransitionExpected || stats.maxItemOverflowPx <= 2
  const threadRestoreOk = lastThreadRestoreDeltaPx.value <= SCROLL_JITTER_BUDGET_PX
    || lastThreadRestoreAnchorDeltaPx.value <= SCROLL_JITTER_BUDGET_PX
  const layoutIntegrityOk = !diagnosticsReady.value || (
    stats.blankProbeCount === 0
    && stats.placeholderProbeCount === 0
    && stats.emptyCardProbeCount === 0
    && blankFrameCount.value === 0
    && stats.visibleCoverageOk
    && strictClippingOk
    && maxObservedBlankProbes === 0
    && maxObservedPlaceholderProbes === 0
    && maxObservedEmptyCardProbes === 0
    && maxObservedCoverageGapPx <= 24
    && virtualDomWithinLimit
    && hugeRendererDomWithinLimit
    && scrollJitterOk
    && threadRestoreOk
    && maxObservedHeightDriftPx < 24
  )

  return {
    ...stats,
    eventCount: labEvents.length,
    layoutTransitionExpected,
    maxObservedBlankProbes,
    maxObservedPlaceholderProbes,
    maxObservedEmptyCardProbes,
    maxObservedMarkdownSlots,
    maxObservedHeightDriftPx,
    maxObservedCoverageGapPx,
    maxObservedItemOverflowPx,
    maxObservedScrollJumpPx,
    scrollJitterOk,
    strictClippingOk,
    virtualDomWithinLimit,
    hugeRendererDomWithinLimit,
    hugeRendererSlotBudget,
    domSlotBudget,
    lastThreadRestoreDeltaPx: lastThreadRestoreDeltaPx.value,
    lastThreadRestoreAnchorDeltaPx: lastThreadRestoreAnchorDeltaPx.value,
    threadRestoreOk,
    layoutIntegrityOk,
  }
}

function assertVirtualScrollHealth(snapshot: VirtualScrollLabSnapshot) {
  const failures: string[] = []

  if (!snapshot.ready)
    failures.push('lab not ready')

  if (snapshot.stats.blankProbeCount !== 0)
    failures.push(`blank probes=${snapshot.stats.blankProbeCount}`)

  if (snapshot.blankFrameCount !== 0)
    failures.push(`blank frames=${snapshot.blankFrameCount}`)

  if (snapshot.health.maxObservedBlankProbes !== 0)
    failures.push(`observed blank probes=${snapshot.health.maxObservedBlankProbes}`)

  if (snapshot.stats.placeholderProbeCount !== 0)
    failures.push(`placeholder probes=${snapshot.stats.placeholderProbeCount}`)

  if (snapshot.health.maxObservedPlaceholderProbes !== 0)
    failures.push(`observed placeholder probes=${snapshot.health.maxObservedPlaceholderProbes}`)

  if (snapshot.stats.emptyCardProbeCount !== 0)
    failures.push(`empty card probes=${snapshot.stats.emptyCardProbeCount}`)

  if (snapshot.health.maxObservedEmptyCardProbes !== 0)
    failures.push(`observed empty card probes=${snapshot.health.maxObservedEmptyCardProbes}`)

  if (!snapshot.visibleCoverageOk)
    failures.push(`coverage gap=${snapshot.stats.maxCoverageGapPx}px`)

  if (snapshot.health.maxObservedCoverageGapPx > 24)
    failures.push(`observed coverage gap=${snapshot.health.maxObservedCoverageGapPx}px`)

  if (!snapshot.health.layoutTransitionExpected && snapshot.stats.maxItemOverflowPx > 2)
    failures.push(`item overflow=${snapshot.stats.maxItemOverflowPx}px`)

  if (!snapshot.health.virtualDomWithinLimit)
    failures.push(`markdown slots exceeded: ${snapshot.markdownSlotCount}/${snapshot.health.domSlotBudget}`)

  if (!snapshot.health.hugeRendererDomWithinLimit)
    failures.push(`huge renderer slots exceeded: ${snapshot.maxHugeMessageSlotCount}/${snapshot.hugeRendererSlotBudget}`)

  if (!snapshot.health.threadRestoreOk)
    failures.push(`thread restore failed: scrollDelta=${snapshot.lastThreadRestoreDeltaPx}, anchorDelta=${snapshot.lastThreadRestoreAnchorDeltaPx}`)

  if (!snapshot.health.scrollJitterOk)
    failures.push(`scroll jitter=${snapshot.health.maxObservedScrollJumpPx}px`)

  if (!snapshot.health.layoutTransitionExpected && snapshot.maxItemHeightDriftPx >= 24)
    failures.push(`height drift=${snapshot.maxItemHeightDriftPx}px`)

  if (snapshot.health.maxObservedHeightDriftPx >= 24)
    failures.push(`observed height drift=${snapshot.health.maxObservedHeightDriftPx}px`)

  return {
    ok: failures.length === 0,
    failures,
  }
}

function buildLabSnapshot(stats: LabStats): VirtualScrollLabSnapshot {
  const health = readLabHealth(stats)
  const firstVisibleMessageId = visibleItems.value[0]?.message.id ?? ''
  const outerAnchor = captureOuterAnchor()

  const root = scrollRoot.value
  const currentScrollTop = readRootScrollTop()
  const currentViewportHeight = root?.clientHeight ?? viewportHeight.value

  const snapshot: VirtualScrollLabSnapshot = {
    ready: labReady.value,
    threadId: activeThreadId.value,
    streamingActive: streamTimer != null,
    layoutWidth: layoutWidth.value,
    range: { ...visibleRange.value },
    firstVisibleMessageId,
    outerAnchor,
    stats,
    health,
    events: labEvents.slice(),
    labStatus: 'ok',
    activeThreadId: activeThreadId.value,
    totalHeight: totalHeight.value,
    scrollTop: currentScrollTop,
    viewportHeight: currentViewportHeight,
    distanceFromBottomPx: Math.max(0, totalHeight.value - currentScrollTop - currentViewportHeight),
    visibleRange: { ...visibleRange.value },
    messageDomCount: stats.messageDomCount,
    domNodeCount: stats.domNodeCount,
    markdownSlotCount: stats.markdownSlotCount,
    markdownContentCount: stats.markdownContentCount,
    maxHugeMessageSlotCount: stats.maxHugeMessageSlotCount,
    hugeRendererSlotBudget: health.hugeRendererSlotBudget,
    maxDomNodeCount: maxDomNodeCount.value,
    maxMarkdownSlotCount: maxMarkdownSlotCount.value,
    expectedMarkdownSlotCeiling: expectedMarkdownSlotCeiling.value,
    expectedDomNodeCeiling: expectedDomNodeCeiling.value,
    maxExpectedMarkdownSlotCeiling: maxExpectedMarkdownSlotCeiling.value || expectedMarkdownSlotCeiling.value,
    maxExpectedDomNodeCeiling: maxExpectedDomNodeCeiling.value || expectedDomNodeCeiling.value,
    blankFrameCount: blankFrameCount.value,
    clippedMessageCount: stats.clippedMessageCount,
    heightDriftMessageCount: stats.heightDriftMessageCount,
    maxItemHeightDriftPx: stats.maxItemHeightDriftPx,
    maxItemOverflowPx: stats.maxItemOverflowPx,
    visibleCoverageOk: stats.visibleCoverageOk,
    settledEvents: settledEvents.value,
    heightCacheStateCount: Array
      .from(virtualStates.values())
      .filter(state => state.heightCache?.length)
      .length,
    scrollCompensationCount: scrollCompensationCount.value,
    lastThreadRestoreDeltaPx: lastThreadRestoreDeltaPx.value,
    lastThreadRestoreAnchorDeltaPx: lastThreadRestoreAnchorDeltaPx.value,
  }
  const healthCheck = assertVirtualScrollHealth(snapshot)

  return {
    ...snapshot,
    labStatus: !diagnosticsReady.value
      ? 'warming'
      : healthCheck.ok
        ? 'ok'
        : `failed: ${healthCheck.failures.join('; ')}`,
  }
}

function readLabSnapshot(): VirtualScrollLabSnapshot {
  syncScrollStateFromRoot()
  return buildLabSnapshot(collectStats({ reconcile: false }))
}

const labSnapshot = shallowRef<VirtualScrollLabSnapshot>(
  buildLabSnapshot(createEmptyLabStats()),
)

const labStatusClass = computed(() => labSnapshot.value.labStatus.startsWith('failed') ? 'failed' : 'ok')

const debugSummary = computed(() => ({
  thread: activeThreadId.value,
  scrollTop: Math.round(scrollTop.value),
  totalHeight: Math.round(totalHeight.value),
  visibleRange: visibleRange.value,
  domNodeCount: domNodeCount.value,
  messageDomCount: messageDomCount.value,
  markdownSlotCount: markdownSlotCount.value,
  markdownContentCount: markdownContentCount.value,
  maxHugeMessageSlotCount: labSnapshot.value.maxHugeMessageSlotCount,
  blankFrameCount: blankFrameCount.value,
  visibleCoverageOk: visibleCoverageOk.value,
  clippedMessageCount: clippedMessageCount.value,
  heightDriftMessageCount: heightDriftMessageCount.value,
  maxItemHeightDriftPx: maxItemHeightDriftPx.value,
  lastThreadRestoreDeltaPx: lastThreadRestoreDeltaPx.value,
  lastThreadRestoreAnchorDeltaPx: lastThreadRestoreAnchorDeltaPx.value,
  virtualDomWithinLimit: labSnapshot.value.health.virtualDomWithinLimit,
  hugeRendererDomWithinLimit: labSnapshot.value.health.hugeRendererDomWithinLimit,
  threadRestoreOk: labSnapshot.value.health.threadRestoreOk,
  layoutIntegrityOk: labSnapshot.value.health.layoutIntegrityOk,
}))

function refreshLabSnapshot(stats: LabStats = collectStats({ reconcile: false })) {
  labSnapshot.value = buildLabSnapshot(stats)
}

const verificationGroups = computed(() => ({
  domSize: {
    ok: labSnapshot.value.health.virtualDomWithinLimit
      && labSnapshot.value.health.hugeRendererDomWithinLimit,
    domNodeCount: labSnapshot.value.domNodeCount,
    markdownSlotCount: labSnapshot.value.markdownSlotCount,
    maxHugeMessageSlotCount: labSnapshot.value.maxHugeMessageSlotCount,
    expectedDomNodeCeiling: labSnapshot.value.expectedDomNodeCeiling,
    expectedMarkdownSlotCeiling: labSnapshot.value.expectedMarkdownSlotCeiling,
  },
  blankFrame: {
    ok: labSnapshot.value.blankFrameCount === 0
      && labSnapshot.value.health.maxObservedBlankProbes === 0,
    blankFrameCount: labSnapshot.value.blankFrameCount,
    maxObservedBlankProbes: labSnapshot.value.health.maxObservedBlankProbes,
    maxCoverageGapPx: labSnapshot.value.health.maxObservedCoverageGapPx,
  },
  heightCorrectness: {
    ok: labSnapshot.value.maxItemHeightDriftPx < 24
      && labSnapshot.value.visibleCoverageOk
      && labSnapshot.value.health.strictClippingOk,
    maxItemHeightDriftPx: labSnapshot.value.maxItemHeightDriftPx,
    maxItemOverflowPx: labSnapshot.value.maxItemOverflowPx,
    maxObservedItemOverflowPx: labSnapshot.value.health.maxObservedItemOverflowPx,
    heightDriftMessageCount: labSnapshot.value.heightDriftMessageCount,
    clippedMessageCount: labSnapshot.value.clippedMessageCount,
  },
  threadRestore: {
    ok: labSnapshot.value.health.threadRestoreOk,
    lastThreadRestoreDeltaPx: labSnapshot.value.lastThreadRestoreDeltaPx,
    lastThreadRestoreAnchorDeltaPx: labSnapshot.value.lastThreadRestoreAnchorDeltaPx,
    firstVisibleMessageId: labSnapshot.value.firstVisibleMessageId,
    outerAnchor: labSnapshot.value.outerAnchor,
  },
  scrollJitter: {
    ok: labSnapshot.value.health.scrollJitterOk,
    maxObservedScrollJumpPx: labSnapshot.value.health.maxObservedScrollJumpPx,
    scrollCompensationCount: labSnapshot.value.scrollCompensationCount,
  },
  renderSettlement: {
    ok: labSnapshot.value.heightCacheStateCount > 0
      && (!labSnapshot.value.streamingActive || labSnapshot.value.settledEvents > 0),
    settledEvents: labSnapshot.value.settledEvents,
    heightCacheStateCount: labSnapshot.value.heightCacheStateCount,
    streamingActive: labSnapshot.value.streamingActive,
  },
}))

function waitFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

async function forceUnmountVisibleHugeMessage() {
  const target = visibleItems.value.find(item => item.message.huge)
  if (!target)
    return

  await captureVisibleVirtualStates({ forceMeasure: true })

  const key = messageStateKey(target.message)
  forceHiddenMessageKeys.add(key)

  await nextTick()
  scheduleStats()

  await waitFrame()

  forceHiddenMessageKeys.delete(key)

  await nextTick()
  scheduleStats()
}

async function replaceVisibleHugeMessageSameShape() {
  const item = visibleItems.value.find(item => item.message.huge)
  if (!item)
    return

  const anchor = captureOuterAnchor()
  const threadId = activeThreadId.value
  const message = item.message

  if (anchor) {
    threadAnchors.set(threadId, anchor)
    markThreadRestoreTarget(threadId, anchor)
  }

  const previousContent = message.content
  const approximateBlocks = Math.max(
    80,
    previousContent.split('\n## ').length,
  )

  message.content = makeMarkdown(
    `${message.id}-same-shape-replacement-${message.revision + 1}`,
    approximateBlocks,
  )
  message.revision += 1
  message.final = true

  await nextTick()

  if (anchor) {
    await restoreOuterAnchor(anchor, {
      immediate: true,
      expectedJump: true,
    })
  }

  for (let i = 0; i < 8; i++) {
    await nextTick()
    await waitFrame()

    if (anchor) {
      await restoreOuterAnchor(anchor, {
        immediate: true,
        expectedJump: true,
      })
    }

    applyLabStats(collectStats({ reconcile: true }))
  }

  scheduleLabEvent('same-shape-session-replace', {
    expectedJump: true,
  })

  deferClearThreadRestoreTarget(threadId)
}

async function scrollToRatio(ratio: number) {
  clearThreadRestoreTargetTimer(activeThreadId.value)
  threadRestoreTargets.delete(activeThreadId.value)
  await nextTick()

  const max = Math.max(0, totalHeight.value - viewportHeight.value)
  applyOuterScrollTop(max * Math.max(0, Math.min(1, ratio)))
  expectedScrollTop = scrollTop.value

  await nextTick()
  await waitFrame()
  let stats = collectStats({ reconcile: true })
  for (let i = 0; i < 8 && (stats.blankProbeCount > 0 || stats.maxItemHeightDriftPx >= 24); i++) {
    await waitFrame()
    await nextTick()
    stats = collectStats({ reconcile: true })
  }
  applyLabStats(stats)
  pushLabEvent('scroll-to-ratio', { expectedJump: true }, stats)
  scheduleVisibleDomReconcile()
}

async function rapidSwitchThreads(threadIds: ThreadId[], count = 9) {
  for (let i = 0; i < count; i++) {
    await switchThread(threadIds[i % threadIds.length])
    await waitFrame()
  }
}

async function settleVisibleRenderers() {
  const handles = visibleItems.value
    .map(item => rendererRefs.get(messageKey(item.message)))
    .filter((handle): handle is MarkstreamRendererHandle => Boolean(handle))

  let metrics: MarkstreamVirtualMetrics[] = []
  for (let attempt = 0; attempt < 3; attempt++) {
    metrics = await Promise.all(handles.map(handle =>
      handle.settle({
        reason: 'manual',
        frames: 8,
        timeoutMs: 1400,
        flushPendingTimers: true,
      }),
    ))

    if (metrics.every(metric => metric.stable))
      break

    await nextTick()
    await waitFrame()
  }

  await nextTick()
  await waitFrame()
  applyLabStats(collectStats({ reconcile: true }))
  return metrics
}

function clearLabEvents() {
  labEvents.splice(0)
  blankFrameCount.value = 0
  const currentScrollTop = syncScrollStateFromRoot()
  lastObservedScrollTop = currentScrollTop
  expectedScrollTop = currentScrollTop
}

function exposeLabApi() {
  if (typeof window === 'undefined')
    return

  window.__markstreamVirtualScrollLab = {
    read: readLabSnapshot,
    scrollToRatio,
    switchThread,
    rapidSwitchThreads,
    startStressScroll,
    stopStressScroll,
    startStreamingLastMessage,
    toggleDensity,
    toggleFontScale,
    toggleSmallMessageCoordination,
    toggleNarrowMode,
    toggleReverseFlexMode,
    forceUnmountVisibleHugeMessage,
    replaceVisibleHugeMessageSameShape,
    settleVisibleRenderers,
    nextFrame: waitFrame,
    clearEvents: clearLabEvents,
  }

  window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__ = {
    read: readLabSnapshot,
    actions: {
      jumpToTop,
      jumpToMiddle,
      jumpToBottom,
      startStressScroll,
      stopStressScroll,
      startStreamingLastMessage,
      switchThread,
      toggleDensity,
      toggleFontScale,
      toggleSmallMessageCoordination,
      toggleNarrowMode,
      toggleReverseFlexMode,
      forceUnmountVisibleHugeMessage,
      replaceVisibleHugeMessageSameShape,
      settleVisibleRenderers,
      resetHeights,
    },
  }
}

// Expose the API before mount so failing CI runs can still report route/module state.
exposeLabApi()

watch([totalHeight, visibleRange, viewportHeight], () => {
  scheduleStats()
}, { flush: 'post' })

let mountedRootInitialized = false
let mountedRootSetupActive = false

function setupMountedRoot() {
  if (!mountedRootSetupActive)
    return

  if (mountedRootInitialized)
    return

  const root = scrollRoot.value
  if (!root) {
    requestAnimationFrame(setupMountedRoot)
    return
  }

  mountedRootInitialized = true

  viewportHeight.value = root.clientHeight
  layoutWidth.value = root.clientWidth

  resizeObserver = new ResizeObserver(() => {
    viewportHeight.value = root.clientHeight
    layoutWidth.value = root.clientWidth
    scheduleStats()
  })
  resizeObserver.observe(root)

  scheduleStats()
}

onMounted(() => {
  if ('scrollRestoration' in window.history) {
    previousScrollRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
  }

  mountedRootSetupActive = true
  exposeLabApi()
  setupMountedRoot()
  startDiagnosticsWarmup()
})

onBeforeUnmount(() => {
  void saveActiveThreadViewport({ forceMeasure: true })
  stopStressScroll()
  streamBottomPinned = false
  mountedRootSetupActive = false
  mountedRootInitialized = false
  clearDiagnosticsWarmupTimer()

  if (
    previousScrollRestoration
    && typeof window !== 'undefined'
    && 'scrollRestoration' in window.history
  ) {
    window.history.scrollRestoration = previousScrollRestoration
  }

  for (const timer of threadRestoreTargetClearTimers.values())
    clearTimeout(timer)
  threadRestoreTargetClearTimers.clear()

  if (typeof window !== 'undefined')
    delete window.__markstreamVirtualScrollLab

  if (typeof window !== 'undefined')
    delete window.__MARKSTREAM_VIRTUAL_SCROLL_LAB__

  messageEls.clear()
  messageCardEls.clear()
  markdownHostEls.clear()
  rendererRefs.clear()

  if (streamTimer)
    window.clearInterval(streamTimer)

  if (statsRaf)
    cancelAnimationFrame(statsRaf)

  resizeObserver?.disconnect()
})
</script>

<template>
  <div
    class="virtual-scroll-page"
    :class="[
      `density-${density}`,
      { 'font-large': fontScale > 1 },
      { narrow: narrowMode },
    ]"
  >
    <header class="toolbar">
      <div class="toolbar-main">
        <strong>markstream-vue virtual-scroll coordination lab</strong>
        <span>thread: {{ activeThreadId }}</span>
        <span>messages: {{ messages.length }}</span>
        <span>outer rendered: {{ messageDomCount }}</span>
        <span data-testid="markdown-slots">markdown slots: {{ markdownSlotCount }}</span>
        <span data-testid="huge-max-slots">
          max huge slots: {{ labSnapshot.maxHugeMessageSlotCount }} / {{ labSnapshot.hugeRendererSlotBudget }}
        </span>
        <span>markdown content: {{ markdownContentCount }}</span>
        <span data-testid="dom-nodes">dom nodes: {{ domNodeCount }}</span>
        <span>max dom: {{ maxDomNodeCount }}</span>
        <span data-testid="blank-probes">blank probes: {{ blankFrameCount }}</span>
        <span>scroll compensations: {{ scrollCompensationCount }}</span>
      </div>

      <div class="toolbar-actions">
        <button @click="switchThread('thread-a')">
          Thread A
        </button>
        <button @click="switchThread('thread-b')">
          Thread B
        </button>
        <button @click="jumpToTop">
          Top
        </button>
        <button @click="jumpToMiddle">
          Middle
        </button>
        <button @click="jumpToBottom">
          Bottom
        </button>
        <button @click="toggleDensity">
          Density: {{ density }}
        </button>
        <button @click="toggleFontScale">
          Font: {{ fontScale }}
        </button>
        <button @click="toggleSmallMessageCoordination">
          Small coordination: {{ coordinateSmallMessages ? 'on' : 'off' }}
        </button>
        <button @click="toggleNarrowMode">
          Width: {{ narrowMode ? 'narrow' : 'normal' }}
        </button>
        <button @click="startStreamingLastMessage">
          Stream last huge message
        </button>
        <button v-if="!stressRunning" @click="startStressScroll">
          Stress scroll
        </button>
        <button v-else @click="stopStressScroll">
          Stop stress
        </button>
        <button @click="resetHeights">
          Reset caches
        </button>
      </div>
    </header>

    <section class="checklist">
      <strong>验收步骤</strong>
      <ol>
        <li>点击 Bottom，然后点击 Stream last huge message，观察 scrollTop 是否保持 pinned，不应向上跳。</li>
        <li>点击 Stress scroll，连续 10 秒，blank probes 必须保持 0，coverage 必须为 ok。</li>
        <li>切换 Thread A / Thread B，再切回来，scrollTop 和 visible range 应恢复。</li>
        <li>切换 Density / Font，max drift 应回落到 0 或接近 0，不能长期 clipped。</li>
        <li>markdown slots 应接近 coordinated message count × maxLiveNodes，而不是随全文节点数线性增长。</li>
      </ol>
    </section>

    <section class="metrics">
      <span data-testid="lab-status" class="status-chip" :class="labStatusClass">
        status: {{ labSnapshot.labStatus }}
      </span>
      <span>totalHeight: {{ Math.round(totalHeight) }}px</span>
      <span>scrollTop: {{ Math.round(scrollTop) }}px</span>
      <span>visible range: {{ visibleRange.start }} - {{ visibleRange.end }}</span>
      <span>maxLiveNodes: {{ maxLiveNodes }}</span>
      <span>dom budget key: {{ domBudgetKey }}</span>
      <span>settled events: {{ settledEvents }}</span>
      <span data-testid="slot-ceiling">slot ceiling: {{ expectedMarkdownSlotCeiling }}</span>
      <span data-testid="dom-ceiling">dom ceiling: {{ expectedDomNodeCeiling }}</span>
      <span>max slot ceiling: {{ maxExpectedMarkdownSlotCeiling }}</span>
      <span>clipped: {{ clippedMessageCount }}</span>
      <span>height drift items: {{ heightDriftMessageCount }}</span>
      <span data-testid="max-drift">max drift: {{ Math.round(maxItemHeightDriftPx) }}px</span>
      <span data-testid="item-overflow">item overflow: {{ Math.round(labSnapshot.maxItemOverflowPx) }}px</span>
      <span v-if="worstHeightDriftMessageId">
        worst drift: {{ worstHeightDriftMessageId }}
      </span>
      <span data-testid="coverage">coverage: {{ visibleCoverageOk ? 'ok' : 'risk' }}</span>
      <span v-if="lastHeightEvent">
        last markdown: {{ Math.round(lastHeightEvent.totalHeight) }}px /
        {{ lastHeightEvent.phase }} /
        measured {{ lastHeightEvent.measuredCount }}/{{ lastHeightEvent.nodeCount }}
      </span>
    </section>

    <section class="metrics-grid">
      <div>
        <strong>visible items</strong>
        <span>{{ labSnapshot.stats.visibleItemCount }}</span>
      </div>

      <div>
        <strong>markdown renderers</strong>
        <span>{{ labSnapshot.stats.markdownRendererCount }}</span>
      </div>

      <div>
        <strong>node-slot count</strong>
        <span>{{ labSnapshot.stats.markdownSlotCount }} / {{ labSnapshot.health.domSlotBudget }}</span>
      </div>

      <div>
        <strong>huge slots</strong>
        <span :class="{ ok: labSnapshot.health.hugeRendererDomWithinLimit, bad: !labSnapshot.health.hugeRendererDomWithinLimit }">
          {{ labSnapshot.stats.maxHugeMessageSlotCount }} / {{ labSnapshot.health.hugeRendererSlotBudget }}
        </span>
      </div>

      <div>
        <strong>blank probes</strong>
        <span :class="{ bad: labSnapshot.health.maxObservedBlankProbes > 0 }">
          {{ labSnapshot.health.maxObservedBlankProbes }}
        </span>
      </div>

      <div>
        <strong>height drift</strong>
        <span>{{ Math.round(labSnapshot.health.maxObservedHeightDriftPx) }}px</span>
      </div>

      <div>
        <strong>item overflow</strong>
        <span :class="{ ok: labSnapshot.health.strictClippingOk, bad: !labSnapshot.health.strictClippingOk }">
          {{ Math.round(labSnapshot.maxItemOverflowPx) }}px /
          {{ Math.round(labSnapshot.health.maxObservedItemOverflowPx) }}px
        </span>
      </div>

      <div>
        <strong>scroll jitter</strong>
        <span :class="{ ok: labSnapshot.health.scrollJitterOk, bad: !labSnapshot.health.scrollJitterOk }">
          {{ Math.round(labSnapshot.health.maxObservedScrollJumpPx) }}px
        </span>
      </div>

      <div>
        <strong>thread restore</strong>
        <span :class="{ ok: labSnapshot.health.threadRestoreOk, bad: !labSnapshot.health.threadRestoreOk }">
          {{ Math.round(labSnapshot.health.lastThreadRestoreDeltaPx) }}px /
          {{ Number.isFinite(labSnapshot.health.lastThreadRestoreAnchorDeltaPx)
            ? Math.round(labSnapshot.health.lastThreadRestoreAnchorDeltaPx)
            : '∞' }}px
        </span>
      </div>

      <div>
        <strong>layout</strong>
        <span :class="{ ok: labSnapshot.health.layoutIntegrityOk, bad: !labSnapshot.health.layoutIntegrityOk }">
          {{ labSnapshot.health.layoutIntegrityOk ? 'ok' : 'bad' }}
        </span>
      </div>
    </section>

    <section class="verification-grid">
      <article
        v-for="(group, name) in verificationGroups"
        :key="name"
        class="verification-card"
        :class="{ ok: group.ok, bad: !group.ok }"
      >
        <h3>{{ name }}</h3>
        <strong>{{ group.ok ? 'PASS' : 'CHECK' }}</strong>
        <pre>{{ JSON.stringify(group, null, 2) }}</pre>
      </article>
    </section>

    <section class="dom-budget">
      <h3>DOM budget</h3>
      <p>
        Markdown slots:
        <strong :class="{ danger: markdownSlotCount > expectedMarkdownSlotCeiling }">
          {{ markdownSlotCount }}
        </strong>
        /
        {{ expectedMarkdownSlotCeiling }}
      </p>
      <p>
        Huge renderer max slots:
        <strong :class="{ danger: labSnapshot.maxHugeMessageSlotCount > labSnapshot.hugeRendererSlotBudget }">
          {{ labSnapshot.maxHugeMessageSlotCount }}
        </strong>
        /
        {{ labSnapshot.hugeRendererSlotBudget }}
      </p>
      <p>
        Total DOM nodes:
        <strong :class="{ danger: domNodeCount > expectedDomNodeCeiling }">
          {{ domNodeCount }}
        </strong>
        /
        {{ expectedDomNodeCeiling }}
      </p>
    </section>

    <div class="virtual-workspace">
      <aside class="virtual-debug-panel" aria-label="Virtual Scroll Health">
        <h2>Virtual Scroll Health</h2>

        <dl>
          <div>
            <dt>Thread</dt>
            <dd>{{ debugSummary.thread }}</dd>
          </div>
          <div>
            <dt>ScrollTop</dt>
            <dd>{{ debugSummary.scrollTop }}</dd>
          </div>
          <div>
            <dt>Total height</dt>
            <dd>{{ debugSummary.totalHeight }}</dd>
          </div>
          <div>
            <dt>Visible range</dt>
            <dd>{{ debugSummary.visibleRange.start }} - {{ debugSummary.visibleRange.end }}</dd>
          </div>
          <div>
            <dt>DOM nodes</dt>
            <dd>{{ debugSummary.domNodeCount }}</dd>
          </div>
          <div>
            <dt>Markdown slots</dt>
            <dd>{{ debugSummary.markdownSlotCount }}</dd>
          </div>
          <div>
            <dt>Max huge slots</dt>
            <dd>{{ debugSummary.maxHugeMessageSlotCount }}</dd>
          </div>
          <div>
            <dt>Blank frames</dt>
            <dd>{{ debugSummary.blankFrameCount }}</dd>
          </div>
          <div>
            <dt>Thread restore delta</dt>
            <dd>{{ debugSummary.lastThreadRestoreDeltaPx }}px</dd>
          </div>
          <div>
            <dt>Anchor delta</dt>
            <dd>{{ debugSummary.lastThreadRestoreAnchorDeltaPx }}px</dd>
          </div>
        </dl>

        <div class="virtual-health-flags">
          <span :data-ok="debugSummary.virtualDomWithinLimit">DOM budget</span>
          <span :data-ok="debugSummary.hugeRendererDomWithinLimit">Huge DOM budget</span>
          <span :data-ok="debugSummary.threadRestoreOk">Thread restore</span>
          <span :data-ok="debugSummary.layoutIntegrityOk">Layout integrity</span>
          <span :data-ok="debugSummary.visibleCoverageOk">No blank viewport</span>
        </div>
      </aside>

      <main
        ref="scrollRoot"
        data-testid="virtual-scroll-root"
        class="scroller"
        :class="{ 'reverse-flex-mode': reverseFlexMode }"
        @scroll.passive="onScroll"
      >
        <div
          data-testid="virtual-canvas"
          class="virtual-canvas"
          :style="{ height: `${totalHeight}px` }"
        >
          <article
            v-for="{ message, top, height } in visibleItems"
            :key="messageRenderKey(message)"
            :ref="el => setMessageEl(message, el as Element | null)"
            class="virtual-message"
            :class="[message.role, { huge: message.huge }]"
            :data-message-id="message.id"
            :data-expected-height="Math.round(height)"
            :style="{
              transform: `translateY(${top}px)`,
              height: `${height}px`,
            }"
          >
            <div
              :ref="el => setMessageCardEl(message, el as Element | null)"
              class="message-card"
            >
              <div class="message-meta">
                <strong>{{ message.role }}</strong>
                <span>{{ message.id }}</span>
                <span v-if="message.huge">huge</span>
                <span>{{ message.final ? 'final' : 'streaming' }}</span>
                <span>estimated item height: {{ Math.round(height) }}px</span>
              </div>

              <div
                :ref="el => setMarkdownHostEl(message, el as Element | null)"
                class="markdown-host"
              >
                <MarkdownRender
                  v-if="!isForceHidden(message)"
                  :key="messageRenderKey(message)"
                  :ref="instance => setRendererRef(message, instance as MarkstreamRendererHandle | null)"
                  :content="message.content"
                  :final="message.final"
                  :custom-id="message.id"
                  :index-key="messageKey(message)"
                  :max-live-nodes="isCoordinatedMessage(message) ? maxLiveNodes : 0"
                  :live-node-buffer="60"
                  :batch-rendering="true"
                  :initial-render-batch-size="40"
                  :render-batch-size="80"
                  :render-code-blocks-as-pre="true"
                  :fade="false"
                  :virtual-scroll="makeVirtualScrollOptions(message)"
                  @height-change="onHeightChange(message, $event)"
                  @virtual-state-change="onVirtualStateChange(message, $event)"
                  @anchor-change="onAnchorChange(message, $event)"
                  @render-settled="onRenderSettled"
                />
              </div>
            </div>
          </article>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.virtual-scroll-page {
  --lab-bg: #f8fafc;
  --lab-panel: #ffffff;
  --lab-panel-subtle: #f1f5f9;
  --lab-text: #172033;
  --lab-muted: #64748b;
  --lab-border: #d7dee8;
  --lab-accent: #2563eb;

  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--lab-bg);
  color: var(--lab-text);
}

.toolbar {
  flex: 0 0 auto;
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--lab-border);
  background: var(--lab-panel);
}

.checklist {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--lab-border);
  background: #fffbeb;
  color: #78350f;
  font-size: 12px;
}

.checklist ol {
  margin: 0.25rem 0 0;
  padding-left: 1.25rem;
}

.toolbar-main,
.toolbar-actions,
.metrics {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.toolbar-main span,
.metrics span {
  padding: 0.18rem 0.45rem;
  border-radius: 999px;
  background: var(--lab-panel-subtle);
  color: var(--lab-muted);
  font-size: 12px;
}

button {
  padding: 0.3rem 0.55rem;
  border: 1px solid var(--lab-border);
  border-radius: 0.5rem;
  background: var(--lab-panel);
  color: inherit;
  cursor: pointer;
}

button:hover {
  background: var(--lab-panel-subtle);
}

.metrics {
  flex: 0 0 auto;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--lab-border);
  background: color-mix(in srgb, var(--lab-panel) 92%, var(--lab-bg));
}

.metrics-grid {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 1px;
  border-bottom: 1px solid var(--lab-border);
  background: var(--lab-border);
}

.metrics-grid div {
  min-width: 0;
  display: grid;
  gap: 0.25rem;
  padding: 0.55rem 0.75rem;
  background: var(--lab-panel);
}

.metrics-grid strong {
  color: var(--lab-muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.metrics-grid span {
  color: var(--lab-text);
  font-size: 16px;
  font-weight: 700;
}

.metrics-grid .ok {
  color: #166534;
}

.metrics-grid .bad {
  color: #991b1b;
}

.verification-grid {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  max-height: 112px;
  overflow: auto;
  border-bottom: 1px solid var(--lab-border);
  background: var(--lab-bg);
}

.verification-card {
  min-width: 0;
  display: grid;
  gap: 0.18rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--lab-border);
  border-radius: 0.5rem;
  background: var(--lab-panel);
}

.verification-card.ok {
  border-color: #16a34a;
}

.verification-card.bad {
  border-color: #dc2626;
  background: #fff7f7;
}

.verification-card h3 {
  margin: 0;
  font-size: 12px;
}

.verification-card strong {
  color: var(--lab-muted);
  font-size: 11px;
}

.verification-card pre {
  max-height: 36px;
  margin: 0;
  overflow: auto;
  font-size: 11px;
  white-space: pre-wrap;
}

.dom-budget {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--lab-border);
  background: var(--lab-panel);
}

.dom-budget h3 {
  margin: 0;
  font-size: 13px;
}

.dom-budget p {
  margin: 0;
  color: var(--lab-muted);
  font-size: 12px;
}

.dom-budget strong {
  color: var(--lab-text);
}

.dom-budget .danger {
  color: #991b1b;
}

.virtual-workspace {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}

.virtual-debug-panel {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 20;
  width: min(320px, calc(100vw - 24px));
  max-height: min(420px, calc(100vh - 24px));
  overflow: auto;
  padding: 12px;
  border: 1px solid rgba(120, 120, 120, 0.25);
  border-radius: 12px;
  background: color-mix(in srgb, Canvas 94%, transparent);
  backdrop-filter: blur(8px);
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.14);
  font-size: 12px;
  pointer-events: none;
}

.virtual-debug-panel h2 {
  margin: 0 0 10px;
  font-size: 13px;
}

.virtual-debug-panel dl {
  display: grid;
  grid-template-columns: minmax(120px, auto) 1fr;
  gap: 6px 12px;
  margin: 0;
}

.virtual-debug-panel dl > div {
  display: contents;
}

.virtual-debug-panel dt {
  color: #64748b;
}

.virtual-debug-panel dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.virtual-health-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.virtual-health-flags span {
  padding: 3px 8px;
  border-radius: 999px;
  background: #fee2e2;
  color: #991b1b;
}

.virtual-health-flags span[data-ok='true'] {
  background: #dcfce7;
  color: #166534;
}

@media (max-width: 900px) {
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .virtual-debug-panel {
    display: none;
  }
}

.status-chip.ok {
  background: #dcfce7;
  color: #166534;
}

.status-chip.layout-drift-risk {
  background: #fef3c7;
  color: #92400e;
}

.status-chip.blank-frame-risk,
.status-chip.dom-size-risk,
.status-chip.failed {
  background: #fee2e2;
  color: #991b1b;
}

.scroller {
  grid-column: 1;
  grid-row: 1;
  min-height: 0;
  overflow: auto;
  overflow-anchor: none;
  contain: strict;
  position: relative;
}

.scroller.reverse-flex-mode {
  display: flex;
  flex-direction: column-reverse;
}

.scroller.reverse-flex-mode .virtual-canvas {
  flex: 0 0 auto;
}

.virtual-scroll-page.narrow .scroller {
  width: min(100%, 300px);
  align-self: stretch;
  justify-self: center;
  border-inline: 1px solid var(--lab-border);
}

.virtual-canvas {
  position: relative;
  width: 100%;
  min-height: 100%;
  overflow-anchor: none;
}

.virtual-message {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  box-sizing: border-box;
  padding: 0.75rem 1rem;
  will-change: transform;
  overflow: hidden;
  overflow-anchor: none;
  contain: layout paint style;
}

.message-card {
  box-sizing: border-box;
  border: 1px solid var(--lab-border);
  border-radius: 0.5rem;
  background: var(--lab-panel);
  padding: 0.85rem;
  overflow: hidden;
  overflow-anchor: none;
}

.markdown-host {
  min-width: 0;
  overflow-anchor: none;
}

.virtual-message.user .message-card {
  background: color-mix(in srgb, var(--lab-panel) 88%, var(--lab-accent) 12%);
}

.virtual-message.huge .message-card {
  border-color: color-mix(in srgb, var(--lab-accent) 45%, var(--lab-border));
}

.message-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.65rem;
  font-size: 12px;
  color: var(--lab-muted);
}

.message-meta span,
.message-meta strong {
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
  background: var(--lab-panel-subtle);
}

.density-compact .message-card {
  padding: 0.55rem;
}

.density-compact .virtual-message {
  padding-block: 0.45rem;
}

.font-large {
  font-size: 112%;
}
</style>
