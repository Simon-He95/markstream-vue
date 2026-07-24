<script setup lang="ts">
// Exported props interface for MermaidBlockNode
import type { MermaidBlockEvent, MermaidBlockNodeProps } from '../../types/component-props'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, useAttrs, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { useOffscreenHeavyNodeDeferral, useViewportPriority, useViewportPriorityOptions } from '../../composables/viewportPriority'
import mermaidIcon from '../../icon/mermaid.svg?raw'
import { clampMermaidPreviewHeight, estimateMermaidPreviewHeight, getMermaidDiagramKind, parsePositiveNumber } from '../../utils/diagramHeight'
import { resolveLifecycleIndexKey } from '../../utils/lifecycleIndexKey'
import { escapeSequenceTextSemicolons } from '../../utils/mermaidSequenceSemicolons'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../../utils/nodeLifecycle'
import { safeRaf } from '../../utils/safeRaf'
import { canParseOffthread as canParseOffthreadClient, findPrefixOffthread as findPrefixOffthreadClient } from '../../workers/mermaidWorkerClient'

import { getMermaid } from './mermaid'
import { toSafeSvgElement } from './mermaidSvgSanitizer'

const props = withDefaults(
  // 全屏按钮禁用状态
  defineProps<MermaidBlockNodeProps>(),
  {
    maxHeight: undefined,
    loading: true,
    workerTimeoutMs: 1400,
    parseTimeoutMs: 1800,
    renderTimeoutMs: 2500,
    fullRenderTimeoutMs: 4000,
    renderDebounceMs: 300,
    contentStableDelayMs: 500,
    previewPollDelayMs: 800,
    previewPollMaxDelayMs: 4000,
    previewPollMaxAttempts: 12,
    // header/button control defaults
    showHeader: true,
    showModeToggle: true,
    showCopyButton: true,
    showExportButton: true,
    showFullscreenButton: true,
    showCollapseButton: true,
    showZoomControls: true,
    enableWheelZoom: false,
    isStrict: true,
    enableMermaidInteractions: false,
    showTooltips: true,
  },
)

const emits = defineEmits(['copy', 'export', 'openModal', 'toggleMode'])

const DOMPURIFY_CONFIG = {
  USE_PROFILES: { svg: true },
  FORBID_TAGS: ['script'],
  FORBID_ATTR: [/^on/i],
  ADD_TAGS: ['style'],
  ADD_ATTR: ['style'],
  SAFE_FOR_TEMPLATES: true,
} as const

const mermaidAvailable = ref(false)
const mermaidAvailabilityResolved = ref(typeof window === 'undefined')
const deferOffscreenHeavyNodes = useOffscreenHeavyNodeDeferral()
const viewportPriorityOptions = useViewportPriorityOptions()
const mermaidSecurityLevel = computed(() => props.isStrict ? 'strict' : 'loose')
const mermaidInitConfig = computed(() => ({
  startOnLoad: false,
  securityLevel: mermaidSecurityLevel.value,
  dompurifyConfig: mermaidSecurityLevel.value === 'strict' ? DOMPURIFY_CONFIG : undefined,
  flowchart: mermaidSecurityLevel.value === 'strict' ? { htmlLabels: false } : undefined,
}))

type MermaidBindFunctions = (element: Element) => unknown

interface RenderedMermaidSvg {
  svg: string
  bindTarget: Element
}

interface CachedMermaidSvg {
  svg: string
  bindFunctions?: MermaidBindFunctions | null
}

function setSafeSvg(target: HTMLElement | null | undefined, svg: string | null | undefined): RenderedMermaidSvg | null {
  if (!target)
    return null
  const safeElement = toSafeSvgElement<SVGElement>(svg)
  if (!safeElement)
    return null
  const layer = appendBufferedSvgLayer(target, safeElement)
  return {
    svg: safeElement.outerHTML,
    bindTarget: layer,
  }
}

function removeNodesAfterNextPaint(nodes: ChildNode[]) {
  const remove = () => {
    for (const node of nodes)
      node.parentNode?.removeChild(node)
  }
  if (typeof requestAnimationFrame !== 'function') {
    setTimeout(remove, 32)
    return
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(remove)
  })
}

function appendBufferedSvgLayer(target: HTMLElement, svgElement: SVGElement) {
  const previousNodes = Array.from(target.childNodes)
  const layer = document.createElement('div')
  layer.dataset.mermaidSvgLayer = '1'
  layer.style.zIndex = '1'
  layer.appendChild(svgElement)
  target.insertBefore(layer, target.firstChild)
  if (previousNodes.length > 0)
    removeNodesAfterNextPaint(previousNodes)
  return layer
}

function clearElement(target: HTMLElement | null | undefined) {
  if (!target)
    return
  try {
    target.replaceChildren()
  }
  catch {
    target.innerHTML = ''
  }
}

function renderSvgToTarget(
  target: HTMLElement | null | undefined,
  svg: string | null | undefined,
  options: { keepPreviousOnFailure?: boolean } = {},
): RenderedMermaidSvg | null {
  if (!target)
    return null
  const rendered = setSafeSvg(target, svg)
  if (!rendered && !options.keepPreviousOnFailure)
    clearElement(target)
  return rendered
}

let lastMermaidBindFunctions: MermaidBindFunctions | null = null

function bindMermaidInteractions(element: Element | null | undefined) {
  if (!props.enableMermaidInteractions || !element?.querySelector('svg'))
    return
  try {
    lastMermaidBindFunctions?.(element)
  }
  catch {}
}

const { t } = useSafeI18n()
let unmounted = false
let lifecycleGeneration = 0

async function resolveMermaidInstance() {
  try {
    const instance = await getMermaid()
    if (unmounted)
      return null
    mermaidAvailable.value = !!instance
    return instance
  }
  catch (err) {
    if (!unmounted)
      mermaidAvailable.value = false
    throw err
  }
  finally {
    if (!unmounted)
      mermaidAvailabilityResolved.value = true
  }
}

const copyText = ref(false)
const isCollapsed = ref(false)
const blockContainer = ref<HTMLElement>()
const mermaidContainer = ref<HTMLElement>()
const mermaidContent = ref<HTMLElement>()
const modalContent = ref<HTMLElement>()
const modalCloneWrapper = ref<HTMLElement | null>(null)
const registerViewport = useViewportPriority()
const viewportHandle = ref<ReturnType<typeof registerViewport> | null>(null)
const viewportReady = ref(typeof window === 'undefined' || !deferOffscreenHeavyNodes.value)
const attrs = useAttrs()
const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY, null)
let lifecyclePendingIndexKey = ''
let lifecyclePendingCount = 0
let lifecycleSettleGeneration = 0
const lifecycleIndexKey = computed(() => {
  return resolveLifecycleIndexKey(props, attrs)
})

function reportLifecycleHeight(indexKey = lifecycleIndexKey.value) {
  if (!indexKey || !blockContainer.value)
    return
  lifecycle?.reportHeight(indexKey, blockContainer.value.offsetHeight)
}

function markLifecyclePending() {
  const indexKey = lifecycleIndexKey.value
  if (!indexKey)
    return

  if (lifecyclePendingIndexKey && lifecyclePendingIndexKey !== indexKey) {
    lifecycle?.markSettled(lifecyclePendingIndexKey)
    lifecyclePendingCount = 0
  }

  lifecyclePendingIndexKey = indexKey
  lifecyclePendingCount += 1
  lifecycleSettleGeneration += 1

  if (lifecyclePendingCount === 1)
    lifecycle?.markPending(indexKey)
}

async function markLifecycleSettled() {
  const indexKey = lifecyclePendingIndexKey
  if (!indexKey)
    return

  lifecyclePendingCount = Math.max(0, lifecyclePendingCount - 1)
  if (lifecyclePendingCount > 0)
    return

  lifecyclePendingIndexKey = ''
  const generation = ++lifecycleSettleGeneration
  await nextTick()
  if (generation !== lifecycleSettleGeneration)
    return

  reportLifecycleHeight(indexKey)
  lifecycle?.markSettled(indexKey)
}

function clearLifecyclePending() {
  const indexKey = lifecyclePendingIndexKey
  if (!indexKey)
    return

  lifecyclePendingIndexKey = ''
  lifecyclePendingCount = 0
  lifecycleSettleGeneration += 1
  lifecycle?.markSettled(indexKey)
}
// Mode container used to animate height between Source and Preview
const modeContainerRef = ref<HTMLElement>()
const baseFixedCode = computed(() => {
  return props.node.code
    .replace(/\]::([^:])/g, ']:::$1') // 将 :: 更改为 ::: 来应用类样式
    .replace(/:::subgraphNode$/gm, '::subgraphNode')
})

// get the code with the theme configuration
function getCodeWithTheme(theme: 'light' | 'dark', code = baseFixedCode.value) {
  const baseCode = code
  const themeValue = theme === 'dark' ? 'dark' : 'default'
  const initConfig: Record<string, unknown> = { theme: themeValue }
  if (mermaidSecurityLevel.value === 'strict')
    initConfig.flowchart = { htmlLabels: false }
  const themeConfig = `%%{init: ${JSON.stringify(initConfig)}}%%\n`
  if (baseCode.trim().startsWith('%%{')) {
    return baseCode
  }
  return themeConfig + baseCode
}

function resolveMinContainerHeight() {
  const raw = mermaidContainer.value
    ? getComputedStyle(mermaidContainer.value).getPropertyValue('--ms-size-diagram-min-height').trim()
    : ''
  return parsePositiveNumber(raw) ?? 360
}

function clampPreviewHeight(height: number) {
  const minHeight = resolveMinContainerHeight()
  const maxHeight = resolveMaxContainerHeight()
  return clampMermaidPreviewHeight(height, minHeight, maxHeight)
}

function resolveEstimatedPreviewHeight() {
  return clampPreviewHeight(
    parsePositiveNumber(props.estimatedPreviewHeightPx) ?? estimateMermaidPreviewHeight(baseFixedCode.value),
  )
}

function hasExternalPreviewHeightEstimate() {
  return parsePositiveNumber(props.estimatedPreviewHeightPx) != null
}

function resolveInitialContainerHeight() {
  return `${resolveEstimatedPreviewHeight()}px`
}

const lastSvgSnapshot = ref<string | null>(null)

function hasPreviewSvg() {
  return !!mermaidContent.value?.querySelector('svg')
}

function shouldFreezeStreamingPreviewHeight() {
  return props.loading !== false && hasPreviewSvg()
}

function shouldKeepPreviewForEmptyStreamingSource() {
  return props.loading !== false && (hasPreviewSvg() || !!lastSvgSnapshot.value)
}

// Zoom state
const zoom = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const showSource = ref(true)
const userToggledShowSource = ref(false)
const isRendering = ref(false)
const renderQueue = ref<Promise<boolean> | null>(null)
interface MermaidRenderRequest {
  code: string
  codeWithTheme: string
  final: boolean
  signature: string
  theme: 'light' | 'dark'
}
let activeRenderSignature = ''
let activeRenderIsFinal = false
let lastCompletedRenderSignature = ''
const lastContentLength = ref(0)
const isContentGenerating = ref(false)
const renderDebounceDelay = computed(() => Math.max(0, props.renderDebounceMs ?? 300))
const contentStableDelay = computed(() => Math.max(0, props.contentStableDelayMs ?? 500))
const previewPollInitialDelay = computed(() => Math.max(120, props.previewPollDelayMs ?? 800))
const previewPollMaxDelay = computed(() => Math.max(previewPollInitialDelay.value, props.previewPollMaxDelayMs ?? 4000))
const previewPollMaxAttempts = computed(() => Math.max(1, Math.trunc(props.previewPollMaxAttempts ?? 12)))
const usesProgressivePreview = computed(() => props.loading !== false)
let contentStableTimer: number | null = null
let renderRetryTimer: ReturnType<typeof setTimeout> | null = null
let progressiveRenderDebounceTimer: number | null = null
let progressiveRenderIdleId: number | null = null
let consecutiveRenderTimeouts = 0
const MAX_RENDER_TIMEOUT_RETRIES = 3
const MAX_FINAL_WORKER_BUSY_RETRIES = 8
const MAX_FINAL_WORKER_TIMEOUT_RETRIES = 2
const FINAL_WORKER_PARSE_RETRY_DELAY_MS = 50
// Schedule progressive work in idle time
const requestIdle
  = (globalThis as any).requestIdleCallback
    ?? ((cb: any, _opts?: any) => setTimeout(() => cb({ didTimeout: true }), 16))
const cancelIdle
  = (globalThis as any).cancelIdleCallback ?? ((id: any) => clearTimeout(id))

function isActiveGeneration(generation = lifecycleGeneration) {
  return !unmounted && generation === lifecycleGeneration
}

function canScheduleViewportWork() {
  return isActiveGeneration() && viewportReady.value && !isCollapsed.value
}

function clearProgressiveRenderDebounceTimer() {
  if (progressiveRenderDebounceTimer != null) {
    (globalThis as any).clearTimeout(progressiveRenderDebounceTimer)
    progressiveRenderDebounceTimer = null
  }
  if (progressiveRenderIdleId != null) {
    cancelIdle(progressiveRenderIdleId)
    progressiveRenderIdleId = null
  }
}

function debouncedProgressiveRender() {
  if (unmounted)
    return
  if (progressiveRenderDebounceTimer != null || progressiveRenderIdleId != null)
    return
  progressiveRenderDebounceTimer = (globalThis as any).setTimeout(() => {
    progressiveRenderDebounceTimer = null
    if (!canScheduleViewportWork())
      return
    progressiveRenderIdleId = requestIdle(() => {
      progressiveRenderIdleId = null
      if (!canScheduleViewportWork())
        return
      void progressiveRender()
    }, { timeout: 500 })
  }, renderDebounceDelay.value)
}

function clearRenderRetryTimer() {
  if (renderRetryTimer != null) {
    (globalThis as any).clearTimeout(renderRetryTimer)
    renderRetryTimer = null
  }
}

function scheduleRenderRetry(delayMs = 600) {
  if (typeof globalThis === 'undefined' || unmounted)
    return
  const safeDelay = Math.max(0, delayMs)
  clearRenderRetryTimer()
  const run = () => {
    renderRetryTimer = null
    if (unmounted)
      return
    if (props.loading || isRendering.value || !canScheduleViewportWork()) {
      const nextDelay = Math.min(1200, Math.max(300, safeDelay * 1.2))
      scheduleRenderRetry(nextDelay)
      return
    }
    debouncedProgressiveRender()
  }
  renderRetryTimer = (globalThis as any).setTimeout(run, safeDelay)
}

const containerHeight = ref<string>(resolveInitialContainerHeight())
const contentHeight = ref<string>(containerHeight.value)
let resizeObserver: ResizeObserver | null = null

// rendering state management
const hasRenderedOnce = ref(false)
const isThemeRendering = ref(false)
const svgCache = ref<{
  light?: CachedMermaidSvg
  dark?: CachedMermaidSvg
}>({})

const renderToken = ref(0)
// Abort/cancellation state for ongoing progressive work
let currentWorkController: AbortController | null = null
let finalWorkerParseController: AbortController | null = null
// Track whether an error is currently rendered to avoid being overwritten
const hasRenderError = ref(false)
const restoreVisualPending = computed(() => {
  if (isCollapsed.value)
    return false

  if (showSource.value)
    return false

  if (!mermaidAvailabilityResolved.value)
    return true

  if (isRendering.value || renderQueue.value)
    return true

  if (!hasRenderedOnce.value)
    return !(hasRenderError.value && Boolean(mermaidContent.value?.textContent?.trim()))

  return false
})
const savedTransformState = ref({
  zoom: 1,
  translateX: 0,
  translateY: 0,
  containerHeight: containerHeight.value,
})
const wheelListeners = computed(() => (props.enableWheelZoom ? { wheel: handleWheel } : {}))

// Timeouts (ms) - configurable via props and reactive
const timeouts = computed(() => ({
  worker: props.workerTimeoutMs ?? 1400,
  parse: props.parseTimeoutMs ?? 1800,
  render: props.renderTimeoutMs ?? 2500,
  fullRender: props.fullRenderTimeoutMs ?? 4000,
}))
// Background polling while in Preview to upgrade prefix -> full render automatically
let previewPollTimeoutId: number | null = null
let previewPollIdleId: number | null = null
let isPreviewPolling = false
let previewPollDelay = previewPollInitialDelay.value
let previewPollController: AbortController | null = null
let lastPreviewStopAt = 0
let allowPartialPreview = true
let previewPollAttempts = 0

if (typeof window !== 'undefined') {
  watch(
    [() => blockContainer.value, deferOffscreenHeavyNodes],
    ([el, shouldDefer]) => {
      viewportHandle.value?.destroy()
      viewportHandle.value = null
      if (!shouldDefer || viewportReady.value) {
        viewportReady.value = true
        return
      }
      if (!el) {
        viewportReady.value = false
        return
      }
      const handle = registerViewport(el, {
        rootMargin: viewportPriorityOptions?.value.heavyBlockMargin,
        allowIdle: false,
      })
      viewportHandle.value = handle
      viewportReady.value = handle.isVisible.value
      handle.whenVisible.then(() => {
        viewportReady.value = true
      })
    },
    { immediate: true },
  )
}

onBeforeUnmount(() => {
  unmounted = true
  lifecycleGeneration += 1
  renderToken.value += 1
  viewportHandle.value?.destroy()
  viewportHandle.value = null
  clearLifecyclePending()
  clearProgressiveRenderDebounceTimer()
})

// Helper: wrap an async operation with timeout and AbortSignal support
function withTimeoutSignal<T>(
  run: () => Promise<T>,
  opts?: { timeoutMs?: number, signal?: AbortSignal },
): Promise<T> {
  const timeoutMs = opts?.timeoutMs
  const signal = opts?.signal

  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'))
  }

  let timer: number | null = null
  let settled = false
  let abortHandler: ((this: AbortSignal, ev: Event) => any) | null = null

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      if (timer != null)
        clearTimeout(timer)
      if (abortHandler && signal)
        signal.removeEventListener('abort', abortHandler)
    }

    if (timeoutMs && timeoutMs > 0) {
      // use globalThis so this code doesn't assume `window` exists (SSR)
      timer = (globalThis as any).setTimeout(() => {
        if (settled)
          return
        settled = true
        cleanup()
        reject(new Error('Operation timed out'))
      }, timeoutMs)
    }

    if (signal) {
      abortHandler = () => {
        if (settled)
          return
        settled = true
        cleanup()
        reject(new DOMException('Aborted', 'AbortError'))
      }
      signal.addEventListener('abort', abortHandler)
    }

    run()
      .then((res) => {
        if (settled)
          return
        settled = true
        cleanup()
        resolve(res)
      })
      .catch((err) => {
        if (settled)
          return
        settled = true
        cleanup()
        reject(err)
      })
  })
}

// Unified error renderer (only used for final render requests)
function renderErrorToContainer(error: unknown) {
  if (typeof document === 'undefined')
    return
  if (!mermaidContent.value)
    return
  // Allow consumer to handle the error via onRenderError callback
  if (typeof props.onRenderError === 'function') {
    const handled = props.onRenderError(error, baseFixedCode.value, mermaidContent.value)
    if (handled === true) {
      hasRenderError.value = true
      stopPreviewPolling()
      return
    }
  }
  const errorDiv = document.createElement('div')
  errorDiv.style.padding = 'var(--ms-inset-panel-body)'
  errorDiv.style.color = 'hsl(var(--ms-destructive))'
  errorDiv.textContent = 'Failed to render diagram: '
  const errorSpan = document.createElement('span')
  errorSpan.textContent = error instanceof Error ? error.message : 'Unknown error'
  errorDiv.appendChild(errorSpan)
  clearElement(mermaidContent.value)
  mermaidContent.value.appendChild(errorDiv)
  // Reset height from CSS token (respects density theming)
  const tokenH = mermaidContent.value
    ? getComputedStyle(mermaidContent.value).getPropertyValue('--ms-size-diagram-min-height').trim()
    : ''
  containerHeight.value = tokenH || '360px'
  contentHeight.value = containerHeight.value
  hasRenderError.value = true
  // 在错误显示时，停止任何预览轮询，避免错误被覆盖
  stopPreviewPolling()
}

function isTimeoutError(error: unknown) {
  const message
    = typeof error === 'string'
      ? error
      : typeof (error as any)?.message === 'string'
        ? (error as any).message
        : ''
  return typeof message === 'string' && /timed out/i.test(message)
}

function isAbortError(error: unknown) {
  return (error as any)?.name === 'AbortError'
}

/**
 * Matches native module-resolution / dynamic-import errors that occur when a
 * worker (e.g. a Blob URL inline worker) cannot resolve mermaid's lazy-loaded
 * diagram chunks. The main thread has a proper URL context and can load them.
 */
const MODULE_RESOLUTION_ERROR_RE
  = /Failed to resolve module specifier|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to resolve module specifier/i

function requiresMainThreadMermaid(error: unknown) {
  const message = typeof (error as any)?.message === 'string'
    ? (error as any).message
    : String(error ?? '')
  // DOMPurify may be unavailable in certain worker contexts (e.g. inline
  // workers with restricted CSP). The main thread has full DOMPurify access.
  if (/(?:DOM)?purify\.(?:sanitize|addHook) is not a function/i.test(message))
    return true
  // Mermaid lazy-loads diagram-definition chunks via dynamic import(). In a
  // Blob URL worker (e.g. Vite `?worker&inline`) relative specifiers like
  // "./flowDiagram-XXX.js" cannot be resolved, producing errors such as
  // "Failed to resolve module specifier". The main thread has a proper URL
  // context and can load the chunks, so fall back to main-thread parsing.
  if (MODULE_RESOLUTION_ERROR_RE.test(message))
    return true
  return false
}

function shouldRetrySequenceSemicolonEscape(error: unknown) {
  return !isTimeoutError(error) && !isAbortError(error)
}

const tooltipsEnabled = computed(() => props.showTooltips !== false)

// Tooltip helpers (singleton)
type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'
function shouldSkipEventTarget(el: EventTarget | null) {
  const btn = el as HTMLButtonElement | null
  return !btn || (btn as HTMLButtonElement).disabled
}
function onBtnHover(e: Event, text: string, place: TooltipPlacement = 'top') {
  if (!tooltipsEnabled.value)
    return
  if (shouldSkipEventTarget(e.currentTarget))
    return
  const ev = e as MouseEvent
  const origin = ev?.clientX != null && ev?.clientY != null ? { x: ev.clientX, y: ev.clientY } : undefined
  showTooltipForAnchor(e.currentTarget as HTMLElement, text, place, false, origin, props.isDark)
}
function onBtnLeave() {
  if (!tooltipsEnabled.value)
    return
  hideTooltip()
}
function onCopyHover(e: Event) {
  if (!tooltipsEnabled.value)
    return
  if (shouldSkipEventTarget(e.currentTarget))
    return
  const txt = copyText.value ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')
  const ev = e as MouseEvent
  const origin = ev?.clientX != null && ev?.clientY != null ? { x: ev.clientX, y: ev.clientY } : undefined
  showTooltipForAnchor(e.currentTarget as HTMLElement, txt, 'top', false, origin, props.isDark)
}

// Worker-backed off-thread parsing is now provided by the centralized mermaidWorkerClient.

// Apply theme header to arbitrary code snippet
function applyThemeTo(code: string, theme: 'light' | 'dark') {
  const themeValue = theme === 'dark' ? 'dark' : 'default'
  const initConfig: Record<string, unknown> = { theme: themeValue }
  if (mermaidSecurityLevel.value === 'strict')
    initConfig.flowchart = { htmlLabels: false }
  const themeConfig = `%%{init: ${JSON.stringify(initConfig)}}%%\n`
  const trimmed = code.trimStart()
  if (trimmed.startsWith('%%{'))
    return code
  return themeConfig + code
}

// Whether we are allowed to apply a partial preview update safely
function canApplyPartialPreview() {
  // Only when:
  // - not showing source
  // - no previous successful full render (to avoid downgrading)
  // - not currently in an error display state
  return allowPartialPreview && !showSource.value && !hasRenderedOnce.value && !hasRenderError.value
}

function isGanttTaskLine(rawLine: string) {
  const line = rawLine.trim()
  if (!line || line.startsWith('%%'))
    return false
  if (/^(?:gantt|title|dateformat|axisformat|tickinterval|excludes|section|todaymarker|topaxis|weekday|weekend|acctitle|accdescr|accdescrmultiline)\b/i.test(line))
    return false
  return line.includes(':')
}

function getSafeGanttPreviewCandidate(code: string) {
  const lines = code.split(/\r?\n/)
  if (!/\r?\n$/.test(code) && lines.length > 0)
    lines.pop()
  while (lines.length > 0) {
    const last = lines[lines.length - 1]?.trim()
    if (!last || last.startsWith('%%')) {
      lines.pop()
      continue
    }
    if (isGanttTaskLine(last))
      break
    lines.pop()
  }
  return lines.some(isGanttTaskLine) ? lines.join('\n') : ''
}

// NEW: heuristically trim trailing incomplete lines for worker/preview usage
function getSafePrefixCandidate(code: string): string {
  if (getMermaidDiagramKind(code) === 'gantt')
    return getSafeGanttPreviewCandidate(code)
  const lines = code.split(/\r?\n/)
  // drop trailing empty or dangling edge lines
  while (lines.length > 0) {
    const lastRaw = lines[lines.length - 1]
    const last = lastRaw.trimEnd()
    if (last === '') {
      lines.pop()
      continue
    }
    // common mermaid "dangling/incomplete" patterns at line end
    const looksDangling = /^[-=~>|<\s]+$/.test(last.trim())
    // ends with typical edge operators
      || /(?:--|==|~~|->|<-|-\||-\)|-x|o-|\|-|\.-)\s*$/.test(last)
    // ends with a single connector char
      || /[-|><]$/.test(last)
    // diagram header started but incomplete
      || /(?:graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt)\s*$/i.test(last)

    if (looksDangling) {
      lines.pop()
      continue
    }
    break
  }
  return lines.join('\n')
}

// Main-thread fallback parse when worker not available
async function canParseOnMain(
  code: string,
  theme: 'light' | 'dark',
  opts?: { signal?: AbortSignal, timeoutMs?: number },
) {
  const mermaidInstance = await resolveMermaidInstance()
  if (!mermaidInstance)
    return
  const anyMermaid = mermaidInstance as any
  const themed = applyThemeTo(code, theme)
  if (typeof anyMermaid.parse === 'function') {
    try {
      await withTimeoutSignal(() => anyMermaid.parse(themed), {
        timeoutMs: opts?.timeoutMs ?? timeouts.value.parse,
        signal: opts?.signal,
      })
    }
    catch (error) {
      if (!shouldRetrySequenceSemicolonEscape(error))
        throw error
      const retryCode = escapeSequenceTextSemicolons(themed)
      if (retryCode === themed)
        throw error
      try {
        await withTimeoutSignal(() => anyMermaid.parse(retryCode), {
          timeoutMs: opts?.timeoutMs ?? timeouts.value.parse,
          signal: opts?.signal,
        })
      }
      catch {
        throw error
      }
    }
    return true
  }
  // Fallback: try a headless render (no target element) just to validate
  const id = `mermaid-parse-${Math.random().toString(36).slice(2, 9)}`
  try {
    await withTimeoutSignal(() => (mermaidInstance as any).render(id, themed), {
      timeoutMs: opts?.timeoutMs ?? timeouts.value.render,
      signal: opts?.signal,
    })
  }
  catch (error) {
    if (!shouldRetrySequenceSemicolonEscape(error))
      throw error
    const retryCode = escapeSequenceTextSemicolons(themed)
    if (retryCode === themed)
      throw error
    try {
      await withTimeoutSignal(() => (mermaidInstance as any).render(`${id}-retry`, retryCode), {
        timeoutMs: opts?.timeoutMs ?? timeouts.value.render,
        signal: opts?.signal,
      })
    }
    catch {
      throw error
    }
  }
  return true
}

async function renderMermaidWithSequenceRetry(mermaidInstance: any, id: string, code: string, timeoutMs: number) {
  try {
    return await withTimeoutSignal(
      () => mermaidInstance.render(id, code),
      { timeoutMs },
    )
  }
  catch (error) {
    if (!shouldRetrySequenceSemicolonEscape(error))
      throw error
    const retryCode = escapeSequenceTextSemicolons(code)
    if (retryCode === code)
      throw error
    try {
      return await withTimeoutSignal(
        () => mermaidInstance.render(`${id}-retry`, retryCode),
        { timeoutMs },
      )
    }
    catch {
      throw error
    }
  }
}

async function canParseOffthread(
  code: string,
  theme: 'light' | 'dark',
  opts?: { signal?: AbortSignal, timeoutMs?: number },
) {
  try {
    return await canParseOffthreadClient(code, theme, opts?.timeoutMs ?? timeouts.value.worker, opts?.signal)
  }
  catch (error: any) {
    if (error?.name === 'AbortError')
      throw error
    const errorCode = error?.code || error?.name
    if (errorCode === 'WORKER_INIT_ERROR' || error?.fallbackToRenderer || requiresMainThreadMermaid(error))
      return await canParseOnMain(code, theme, opts)
    throw error
  }
}

// Try full, then safe prefix. Report which one worked.
async function canParseOrPrefix(
  code: string,
  theme: 'light' | 'dark',
  opts?: { signal?: AbortSignal, timeoutMs?: number },
): Promise<{ fullOk: boolean, prefixOk: boolean, prefix?: string }> {
  const diagramKind = getMermaidDiagramKind(code)
  if (diagramKind === 'gantt') {
    const prefix = getSafePrefixCandidate(code)
    if (!prefix.trim())
      return { fullOk: false, prefixOk: false }
    try {
      const ok = await canParseOffthread(prefix, theme, opts)
      if (ok) {
        if (prefix === code)
          return { fullOk: true, prefixOk: false }
        return { fullOk: false, prefixOk: true, prefix }
      }
    }
    catch (e) {
      if ((e as any)?.name === 'AbortError')
        throw e
    }
    return { fullOk: false, prefixOk: false }
  }

  try {
    const fullOk = await canParseOffthread(code, theme, opts)
    if (fullOk)
      return { fullOk: true, prefixOk: false }
  }
  catch (e) {
    if ((e as any)?.name === 'AbortError')
      throw e
  }

  // compute a safe prefix locally; optionally try worker 'findPrefix' if available
  let prefix = getSafePrefixCandidate(code)
  if (prefix && prefix.trim() && prefix !== code) {
    try {
      // prefer worker to refine, if supported
      try {
        const found = await findPrefixOffthreadClient(code, theme, opts?.timeoutMs ?? timeouts.value.worker, opts?.signal)
        if (found && found.trim())
          prefix = found
      }
      catch {
        // ignore, use heuristic prefix
      }
      const ok = await canParseOffthread(prefix, theme, opts)
      if (ok)
        return { fullOk: false, prefixOk: true, prefix }
    }
    catch (e) {
      if ((e as any)?.name === 'AbortError')
        throw e
    }
  }

  return { fullOk: false, prefixOk: false }
}

const isFullscreenDisabled = computed(() => showSource.value || isRendering.value || isCollapsed.value)

function resolveMaxContainerHeight() {
  if (props.maxHeight === 'none')
    return null

  // Explicit prop value takes priority
  if (props.maxHeight != null) {
    const maxHeight = Number.parseFloat(String(props.maxHeight))
    if (Number.isFinite(maxHeight))
      return maxHeight
  }

  // Fall back to CSS token (respects density theming)
  const el = mermaidContainer.value
  if (el) {
    const raw = getComputedStyle(el).getPropertyValue('--ms-size-code-max-height').trim()
    const num = Number.parseFloat(raw)
    if (Number.isFinite(num))
      return num
  }
  return 500 // ultimate fallback
}

/**
 * 健壮地计算并更新容器高度，优先使用viewBox，并提供getBBox作为后备
 * @param newContainerWidth - 可选的容器宽度，由ResizeObserver提供以确保精确
 */
function updateContainerHeight(newContainerWidth?: number, options?: { force?: boolean }) {
  if (!mermaidContainer.value || !mermaidContent.value)
    return
  const freezePreviewHeight = !options?.force && shouldFreezeStreamingPreviewHeight()

  const svgElement = mermaidContent.value.querySelector('svg')
  if (!svgElement)
    return

  let intrinsicWidth = 0
  let intrinsicHeight = 0

  // 1. 尝试从SVG属性解析尺寸
  const viewBox = svgElement.getAttribute('viewBox')
  const attrWidth = svgElement.getAttribute('width')
  const attrHeight = svgElement.getAttribute('height')

  // 优先使用 viewBox，因为它通常最能反映内容的真实比例
  if (viewBox) {
    const parts = viewBox.split(' ')
    if (parts.length === 4) {
      intrinsicWidth = Number.parseFloat(parts[2])
      intrinsicHeight = Number.parseFloat(parts[3])
    }
  }

  // 如果 viewBox 解析失败或不存在，尝试回退到 width/height 属性
  if (!intrinsicWidth || !intrinsicHeight) {
    if (attrWidth && attrHeight) {
      intrinsicWidth = Number.parseFloat(attrWidth)
      intrinsicHeight = Number.parseFloat(attrHeight)
    }
  }

  // 2. 如果从属性解析失败，使用 getBBox() 作为最终后备方案
  if (
    Number.isNaN(intrinsicWidth)
    || Number.isNaN(intrinsicHeight)
    || intrinsicWidth <= 0
    || intrinsicHeight <= 0
  ) {
    try {
      // getBBox() 可以精确测量SVG内容的实际渲染边界
      const bbox = svgElement.getBBox()
      if (bbox && bbox.width > 0 && bbox.height > 0) {
        intrinsicWidth = bbox.width
        intrinsicHeight = bbox.height
      }
    }
    catch (e) {
      // 在某些罕见情况下（如SVG display:none），getBBox可能会报错
      console.error('Failed to get SVG BBox:', e)
      // 在这里可以决定是否要回退到一个默认高度，或者什么都不做
      return
    }
  }

  // 3. 如果成功获取尺寸，则计算并应用高度
  if (intrinsicWidth > 0 && intrinsicHeight > 0) {
    const aspectRatio = intrinsicHeight / intrinsicWidth
    // 如果外部传入了宽度，则使用它，否则自己获取
    const containerWidth
      = newContainerWidth ?? mermaidContainer.value.clientWidth
    const renderedSvgWidth = svgElement.getBoundingClientRect().width
    const effectiveWidth = renderedSvgWidth > 0 ? renderedSvgWidth : containerWidth
    const maxHeight = resolveMaxContainerHeight()
    const newHeight = effectiveWidth * aspectRatio
    const resolvedHeight = maxHeight == null ? newHeight : Math.min(newHeight, maxHeight)
    const previewHeight = Math.max(resolvedHeight, resolveEstimatedPreviewHeight())
    contentHeight.value = `${Math.max(newHeight, previewHeight)}px`
    if (!freezePreviewHeight && !hasExternalPreviewHeightEstimate())
      containerHeight.value = `${previewHeight}px`
  }
}

// Modal pseudo-fullscreen state (fixed overlay)
const isModalOpen = ref(false)

const transformStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${zoom.value})`,
}))

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isModalOpen.value) {
    closeModal()
  }
}

function mountModalClone() {
  if (!mermaidContainer.value || !modalContent.value)
    return false
  if (modalContent.value.firstElementChild?.getAttribute('data-mermaid-modal-clone') === '1')
    return true

  // clone the container for modal and add fullscreen to the clone (not original)
  const clone = mermaidContainer.value.cloneNode(true) as HTMLElement
  clone.dataset.mermaidModalClone = '1'
  clone.classList.add('fullscreen')
  clone.style.height = '100%'
  clone.style.maxHeight = '100%'

  // find the wrapper inside the clone using the data attribute and keep a ref
  const wrapper = clone.querySelector(
    '[data-mermaid-wrapper]',
  ) as HTMLElement | null
  if (wrapper) {
    modalCloneWrapper.value = wrapper
    // apply current transform to the clone so it matches the original state
    wrapper.style.transform = (transformStyle.value as any).transform
  }

  // clear any previous content and append the clone
  clearElement(modalContent.value)
  modalContent.value.appendChild(clone)
  bindMermaidInteractions(clone)
  return true
}

function openModal() {
  isModalOpen.value = true
  if (typeof document !== 'undefined') {
    try {
      document.body.style.overflow = 'hidden'
    }
    catch {}
  }
  if (typeof window !== 'undefined') {
    try {
      window.addEventListener('keydown', handleKeydown)
    }
    catch {}
  }

  nextTick(() => {
    if (!mountModalClone())
      nextTick(mountModalClone)
  })
}

function closeModal() {
  isModalOpen.value = false
  // remove the cloned modal content and clear clone ref
  if (modalContent.value) {
    clearElement(modalContent.value)
  }
  modalCloneWrapper.value = null
  if (typeof document !== 'undefined') {
    try {
      document.body.style.overflow = ''
    }
    catch {}
  }
  if (typeof window !== 'undefined') {
    try {
      window.removeEventListener('keydown', handleKeydown)
    }
    catch {}
  }
}

watch(modalContent, (element) => {
  if (isModalOpen.value && element)
    mountModalClone()
})

function checkContentStability() {
  if (!usesProgressivePreview.value)
    return
  if (!showSource.value) {
    return
  }

  // 如果 mermaid 不可用，则不要在源码稳定后切换到预览
  if (!mermaidAvailable.value) {
    return
  }

  const currentLength = baseFixedCode.value.length

  // 只要长度不一致，就认为内容在变化
  if (currentLength !== lastContentLength.value) {
    isContentGenerating.value = true
    lastContentLength.value = currentLength

    if (contentStableTimer) {
      clearTimeout(contentStableTimer)
    }

    contentStableTimer = setTimeout(() => {
      if (
        isContentGenerating.value
        && showSource.value
        && baseFixedCode.value.trim()
      ) {
        isContentGenerating.value = false
        // Smoothly switch to Preview when content stabilizes
        switchMode('preview')
      }
    }, contentStableDelay.value)
  }
}

// keep modal clone in sync with transform changes
watch(
  transformStyle,
  (newStyle) => {
    if (isModalOpen.value && modalCloneWrapper.value) {
      modalCloneWrapper.value.style.transform = (newStyle as any).transform
    }
  },
  { immediate: true },
)

// Zoom controls
function zoomIn() {
  if (zoom.value < 3) {
    zoom.value += 0.1
  }
}

function zoomOut() {
  if (zoom.value > 0.5) {
    zoom.value -= 0.1
  }
}

function resetZoom() {
  zoom.value = 1
  translateX.value = 0
  translateY.value = 0
}

// Drag functionality
function startDrag(e: MouseEvent | TouchEvent) {
  isDragging.value = true
  if (e instanceof MouseEvent) {
    dragStart.value = {
      x: e.clientX - translateX.value,
      y: e.clientY - translateY.value,
    }
  }
  else {
    dragStart.value = {
      x: e.touches[0].clientX - translateX.value,
      y: e.touches[0].clientY - translateY.value,
    }
  }
}

function onDrag(e: MouseEvent | TouchEvent) {
  if (!isDragging.value)
    return

  let clientX: number
  let clientY: number

  if (e instanceof MouseEvent) {
    clientX = e.clientX
    clientY = e.clientY
  }
  else {
    clientX = e.touches[0].clientX
    clientY = e.touches[0].clientY
  }

  translateX.value = clientX - dragStart.value.x
  translateY.value = clientY - dragStart.value.y
}

function stopDrag() {
  isDragging.value = false
}

// Wheel zoom functionality
function handleWheel(event: WheelEvent) {
  if (!props.enableWheelZoom)
    return
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    if (!mermaidContainer.value)
      return

    const rect = mermaidContainer.value.getBoundingClientRect()
    const mouseX = event.clientX - rect.left
    const mouseY = event.clientY - rect.top
    const containerCenterX = rect.width / 2
    const containerCenterY = rect.height / 2
    const offsetX = mouseX - containerCenterX
    const offsetY = mouseY - containerCenterY
    const contentMouseX = (offsetX - translateX.value) / zoom.value
    const contentMouseY = (offsetY - translateY.value) / zoom.value
    const sensitivity = 0.01
    const delta = -event.deltaY * sensitivity
    const newZoom = Math.min(Math.max(zoom.value + delta, 0.5), 3)

    if (newZoom !== zoom.value) {
      translateX.value = offsetX - contentMouseX * newZoom
      translateY.value = offsetY - contentMouseY * newZoom
      zoom.value = newZoom
    }
  }
}

// Copy functionality
async function copy() {
  try {
    const text = baseFixedCode.value
    const ev: MermaidBlockEvent<{ type: 'copy', text: string }> = {
      payload: { type: 'copy', text },
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      },
    }
    emits('copy', ev)
    if (ev.defaultPrevented)
      return

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
    }

    copyText.value = true
    setTimeout(() => {
      copyText.value = false
    }, 1000)
  }
  catch (err) {
    console.error('Failed to copy:', err)
  }
}

watch(tooltipsEnabled, (enabled) => {
  if (!enabled)
    hideTooltip()
})

// Export SVG
async function exportSvg(svgElement, svgString = null) {
  try {
    const svgData = svgString ?? new XMLSerializer().serializeToString(svgElement)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    if (typeof document !== 'undefined') {
      const link = document.createElement('a')
      link.href = url
      link.download = `mermaid-diagram-${Date.now()}.svg`
      try {
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
      catch {}
      URL.revokeObjectURL(url)
    }
  }
  catch (error) {
    console.error('Failed to export SVG:', error)
  }
}

function handleExportClick() {
  const svgElement = mermaidContent.value?.querySelector('svg')
  if (!svgElement) {
    console.error('SVG element not found')
    return
  }
  const svgString = new XMLSerializer().serializeToString(svgElement)

  const ev: MermaidBlockEvent<{ type: 'export' }> = {
    payload: { type: 'export' },
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true
    },
    svgElement,
    svgString,
  }
  emits('export', ev)
  if (!ev.defaultPrevented) {
    exportSvg(svgElement, svgString)
  }
}

function handleOpenModalClick() {
  const svgElement = mermaidContent.value?.querySelector('svg') ?? null
  const svgString = svgElement ? new XMLSerializer().serializeToString(svgElement) : null

  const ev: MermaidBlockEvent<{ type: 'open-modal' }> = {
    payload: { type: 'open-modal' },
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true
    },
    svgElement,
    svgString,
  }
  emits('openModal', ev)
  if (!ev.defaultPrevented) {
    openModal()
  }
}

function handleSwitchMode(target: 'source' | 'preview') {
  const ev: MermaidBlockEvent<{ type: 'toggle-mode', target: 'source' | 'preview' }> = {
    payload: { type: 'toggle-mode', target },
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true
    },
  }
  emits('toggleMode', target, ev)
  if (!ev.defaultPrevented) {
    switchMode(target)
  }
}

// Smooth mode switch with animated height to avoid layout jump
async function switchMode(target: 'source' | 'preview') {
  const el = modeContainerRef.value
  if (!el) {
    userToggledShowSource.value = true
    showSource.value = (target === 'source')
    return
  }
  // Lock current height
  const from = el.getBoundingClientRect().height
  el.style.height = `${from}px`
  el.style.overflow = 'hidden'

  // Toggle mode
  userToggledShowSource.value = true
  showSource.value = (target === 'source')
  await nextTick()

  // Measure target content natural height
  const to = el.scrollHeight
  // Animate
  el.style.transition = 'height var(--ms-duration-standard) var(--ms-ease-standard)'
  // Force reflow
  void el.offsetHeight
  el.style.height = `${to}px`
  const cleanup = () => {
    el.style.transition = ''
    el.style.height = ''
    el.style.overflow = ''
    el.removeEventListener('transitionend', onEnd)
  }
  function onEnd() {
    cleanup()
  }
  el.addEventListener('transitionend', onEnd)
  // Fallback cleanup in case transitionend doesn't fire
  setTimeout(() => cleanup(), 220)
}

function createMermaidRenderRequest(
  code = baseFixedCode.value,
  theme: 'light' | 'dark' = props.isDark ? 'dark' : 'light',
  final = props.loading === false,
): MermaidRenderRequest {
  return {
    code,
    codeWithTheme: getCodeWithTheme(theme, code),
    final,
    signature: `${theme}\u0000${code}`,
    theme,
  }
}

function isCurrentRenderRequest(request: MermaidRenderRequest) {
  return request.signature === createMermaidRenderRequest().signature
}

function canCommitRenderRequest(request: MermaidRenderRequest) {
  return isCurrentRenderRequest(request)
    || (!request.final && props.loading !== false && baseFixedCode.value.startsWith(request.code))
}

// 优化的 mermaid 渲染函数
async function initMermaid(request = createMermaidRenderRequest()) {
  const generation = lifecycleGeneration
  if (!isActiveGeneration(generation) || !isCurrentRenderRequest(request))
    return false
  if (isRendering.value) {
    const activeQueue = renderQueue.value
    const activeIsFinal = activeRenderIsFinal
    const activeSignature = activeRenderSignature
    if (!activeQueue)
      return false
    const rendered = await activeQueue
    if (!isActiveGeneration(generation) || !isCurrentRenderRequest(request))
      return false
    if (activeSignature === request.signature) {
      if (rendered && lastCompletedRenderSignature === request.signature)
        return true
      if (request.final && props.loading === false && !activeIsFinal)
        return initMermaid(request)
      return false
    }
    return initMermaid(request)
  }

  if (!mermaidContent.value) {
    await nextTick()
    if (!isActiveGeneration(generation))
      return false
    if (!mermaidContent.value) {
      console.warn('Mermaid container not ready')
      return false
    }
  }
  if (!isActiveGeneration(generation) || !isCurrentRenderRequest(request))
    return false

  isRendering.value = true
  activeRenderIsFinal = request.final
  activeRenderSignature = request.signature
  markLifecyclePending()

  renderQueue.value = (async () => {
    try {
      const mermaidInstance = await resolveMermaidInstance()
      if (!isActiveGeneration(generation) || !mermaidInstance)
        return false
      const id = `mermaid-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 11)}`

      if (!hasRenderedOnce.value && !isThemeRendering.value) {
        mermaidInstance.initialize?.({
          ...mermaidInitConfig.value,
          dompurifyConfig: { ...DOMPURIFY_CONFIG },
        })
      }
      const res: any = await renderMermaidWithSequenceRetry(
        mermaidInstance,
        id,
        request.codeWithTheme,
        timeouts.value.fullRender,
      )

      if (!isActiveGeneration(generation) || !canCommitRenderRequest(request)) {
        if (isThemeRendering.value)
          isThemeRendering.value = false
        return false
      }

      if (!mermaidContent.value)
        return false
      const rendered = renderSvgToTarget(mermaidContent.value, res?.svg, {
        keepPreviousOnFailure: !request.final || props.loading !== false,
      })
      if (!rendered) {
        if (isThemeRendering.value)
          isThemeRendering.value = false
        return false
      }
      const bindFunctions = res?.bindFunctions ?? null
      lastMermaidBindFunctions = bindFunctions
      bindMermaidInteractions(rendered.bindTarget)
      // Successful full render clears Partial preview state
      if (!hasRenderedOnce.value && !isThemeRendering.value) {
        safeRaf(() => updateContainerHeight())
        hasRenderedOnce.value = true
        savedTransformState.value = {
          zoom: zoom.value,
          translateX: translateX.value,
          translateY: translateY.value,
          containerHeight: containerHeight.value,
        }
      }
      svgCache.value[request.theme] = { svg: rendered.svg, bindFunctions }
      if (isThemeRendering.value)
        isThemeRendering.value = false
      lastCompletedRenderSignature = request.signature
      lastSvgSnapshot.value = mermaidContent.value.innerHTML
      hasRenderError.value = false
      consecutiveRenderTimeouts = 0
      clearRenderRetryTimer()
      return true
    }
    catch (error) {
      if (!isActiveGeneration(generation) || !isCurrentRenderRequest(request)) {
        if (isThemeRendering.value)
          isThemeRendering.value = false
        return false
      }
      const timedOut = isTimeoutError(error)
      const nextAttempt = consecutiveRenderTimeouts + 1
      if (timedOut && nextAttempt <= MAX_RENDER_TIMEOUT_RETRIES) {
        consecutiveRenderTimeouts = nextAttempt
        const backoff = Math.min(1200, 600 * nextAttempt)
        scheduleRenderRetry(backoff)
        if (typeof import.meta !== 'undefined' && import.meta.env?.DEV)
          console.warn('[markstream-vue] Mermaid render timed out, retry scheduled:', nextAttempt)
      }
      else {
        consecutiveRenderTimeouts = 0
        clearRenderRetryTimer()
        if (request.final && props.loading === false)
          console.error('Failed to render mermaid diagram:', error)
        if (request.final && props.loading === false)
          renderErrorToContainer(error)
      }
      return false
    }
    finally {
      activeRenderIsFinal = false
      activeRenderSignature = ''
      isRendering.value = false
      renderQueue.value = null
      if (isActiveGeneration(generation))
        void markLifecycleSettled()
    }
  })()

  return renderQueue.value
}

async function renderStaticDiagram() {
  const base = baseFixedCode.value
  if (!base.trim()) {
    if (shouldKeepPreviewForEmptyStreamingSource())
      return
    if (mermaidContent.value)
      clearElement(mermaidContent.value)
    lastSvgSnapshot.value = null
    lastCompletedRenderSignature = ''
    hasRenderError.value = false
    return
  }
  if (!mermaidAvailable.value || !canScheduleViewportWork())
    return

  const request = createMermaidRenderRequest(base)
  if (
    hasRenderedOnce.value
    && request.signature === lastCompletedRenderSignature
    && mermaidContent.value?.querySelector('svg')
  ) {
    return
  }

  const rendered = await initMermaid(request)
  if (!rendered)
    return

  hasRenderError.value = false
}

// Note: debouncedInitMermaid is no longer needed; progressive path handles debouncing

// Lightweight partial render that does NOT flip hasRenderedOnce or cache
async function renderPartial(code: string, source: string, theme: 'light' | 'dark', token: number) {
  const generation = lifecycleGeneration
  if (!isActiveGeneration(generation) || !canApplyPartialPreview())
    return
  if (!mermaidContent.value) {
    await nextTick()
    if (!isActiveGeneration(generation) || !mermaidContent.value)
      return
  }
  if (isRendering.value)
    return

  isRendering.value = true
  markLifecyclePending()
  const request = createMermaidRenderRequest(source, theme)
  const partialQueue = (async () => {
    try {
      const mermaidInstance = await resolveMermaidInstance()
      if (!isActiveGeneration(generation) || !mermaidInstance)
        return false
      const id = `mermaid-partial-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      // 如果最后一行是不完整的（如以 |、-、> 等连接符结尾），则剪裁到上一行，
      // 提高在输入过程中可渲染出图像的概率
      const safePrefix = getSafePrefixCandidate(code)
      const codeForRender = safePrefix && safePrefix.trim() ? safePrefix : code
      const res: any = await renderMermaidWithSequenceRetry(
        mermaidInstance,
        id,
        applyThemeTo(codeForRender, theme),
        timeouts.value.render,
      )
      if (
        !isActiveGeneration(generation)
        || renderToken.value !== token
        || props.loading === false
        || !canApplyPartialPreview()
        || !isCurrentRenderRequest(request)
      ) {
        return false
      }
      const svg = res?.svg
      if (!mermaidContent.value || !svg)
        return false
      const rendered = renderSvgToTarget(mermaidContent.value, svg, { keepPreviousOnFailure: true })
      if (!rendered)
        return false
      lastMermaidBindFunctions = res?.bindFunctions ?? null
      bindMermaidInteractions(rendered.bindTarget)
      safeRaf(() => updateContainerHeight())
      return false
    }
    catch {
      // swallow partial errors to keep preview resilient
      return false
    }
    finally {
      if (renderQueue.value === partialQueue) {
        isRendering.value = false
        renderQueue.value = null
      }
      if (isActiveGeneration(generation))
        void markLifecycleSettled()
    }
  })()
  renderQueue.value = partialQueue
  return partialQueue
}

// Progressive render: if full parse passes -> run initMermaid; else restore last success (no prefix render)
// Progressive render: if full parse passes -> run initMermaid; else try safe prefix preview; else restore last success
async function progressiveRender() {
  if (!canScheduleViewportWork())
    return
  const generation = lifecycleGeneration
  const scheduledAt = Date.now()
  const token = ++renderToken.value

  markLifecyclePending()

  try {
    // cancel any previous ongoing progressive work
    if (currentWorkController) {
      currentWorkController.abort()
    }
    currentWorkController = new AbortController()
    const signal = currentWorkController.signal
    const theme = props.isDark ? 'dark' : 'light'
    const base = baseFixedCode.value
    if (!base.trim()) {
      if (shouldKeepPreviewForEmptyStreamingSource())
        return
      if (mermaidContent.value)
        clearElement(mermaidContent.value)
      lastSvgSnapshot.value = null
      lastCompletedRenderSignature = ''
      hasRenderError.value = false
      return
    }
    if (createMermaidRenderRequest(base, theme).signature === lastCompletedRenderSignature) {
      return
    }

    try {
      const res = await canParseOrPrefix(base, theme, { signal, timeoutMs: timeouts.value.worker })
      if (!isActiveGeneration(generation))
        return
      if (res.fullOk) {
        if (signal.aborted || renderToken.value !== token)
          return
        const rendered = await initMermaid(createMermaidRenderRequest(base, theme))
        if (!rendered)
          return
        // Guard against race: if a newer render started, skip flag changes
        if (isActiveGeneration(generation) && renderToken.value === token) {
          hasRenderError.value = false
        }
        return
      }
      // If stopPreviewPolling just happened after this work was queued, avoid partials
      const justStopped = lastPreviewStopAt && scheduledAt <= lastPreviewStopAt
      if (res.prefixOk && res.prefix && !signal.aborted && renderToken.value === token && canApplyPartialPreview() && !justStopped) {
        // render a best-effort partial preview
        await renderPartial(res.prefix, base, theme, token)
        return
      }
    }
    catch (e: any) {
      // aborted -> do nothing
      if (e?.name === 'AbortError')
        return
      // fallthrough to restore last success
    }

    // Worker/main parse failed -> restore last successful full SVG (if any), do not render prefix
    if (!isActiveGeneration(generation) || renderToken.value !== token)
      return
    // 若当前处于错误显示状态，避免用缓存覆盖错误，直到下一次成功渲染
    if (hasRenderError.value)
      return
    // If we cannot apply partial and also shouldn't restore cached (e.g., error state), bail
    const cached = svgCache.value[theme]
    if (cached && mermaidContent.value) {
      const rendered = renderSvgToTarget(mermaidContent.value, cached.svg)
      if (rendered) {
        lastMermaidBindFunctions = cached.bindFunctions ?? null
        bindMermaidInteractions(rendered.bindTarget)
      }
    }
    // else: keep current DOM (could be empty on very first run)
  }
  finally {
    if (isActiveGeneration(generation))
      void markLifecycleSettled()
  }
}

function stopPreviewPolling() {
  if (!isPreviewPolling)
    return
  isPreviewPolling = false
  previewPollDelay = previewPollInitialDelay.value
  allowPartialPreview = false
  if (previewPollController) {
    previewPollController.abort()
    previewPollController = null
  }
  if (previewPollTimeoutId) {
    ;(globalThis as any).clearTimeout(previewPollTimeoutId)
    previewPollTimeoutId = null
  }
  if (previewPollIdleId) {
    cancelIdle(previewPollIdleId)
    previewPollIdleId = null
  }
  // record when we stopped to help skip stale idle work
  lastPreviewStopAt = Date.now()
}

// Cleanup helpers when loading has settled and we no longer need background work
function cleanupAfterLoadingSettled() {
  // stop background upgrade/prefix polling
  stopPreviewPolling()
  clearProgressiveRenderDebounceTimer()
  // abort any in-flight progressive work
  if (currentWorkController) {
    try {
      currentWorkController.abort()
    }
    catch {}
    currentWorkController = null
  }
  // ensure any pending preview poll attempt is cancelled
  if (previewPollController) {
    try {
      previewPollController.abort()
    }
    catch {}
    previewPollController = null
  }
  clearRenderRetryTimer()
  consecutiveRenderTimeouts = 0
}

function cancelFinalWorkerParse() {
  finalWorkerParseController?.abort()
  finalWorkerParseController = null
}

function scheduleNextPreviewPoll(delay = previewPollInitialDelay.value) {
  if (!isPreviewPolling)
    return
  if (previewPollAttempts >= previewPollMaxAttempts.value) {
    stopPreviewPolling()
    return
  }
  if (previewPollTimeoutId)
    (globalThis as any).clearTimeout(previewPollTimeoutId)
  previewPollTimeoutId = (globalThis as any).setTimeout(() => {
    previewPollIdleId = requestIdle(async () => {
      if (!isPreviewPolling)
        return
      if (!canScheduleViewportWork()) {
        stopPreviewPolling()
        return
      }
      if (showSource.value || hasRenderedOnce.value) {
        stopPreviewPolling()
        return
      }
      const theme = props.isDark ? 'dark' : 'light'
      const base = baseFixedCode.value
      if (!base.trim()) {
        if (props.loading === false) {
          stopPreviewPolling()
          return
        }
        scheduleNextPreviewPoll(previewPollDelay)
        return
      }
      previewPollAttempts++
      if (previewPollAttempts > previewPollMaxAttempts.value) {
        stopPreviewPolling()
        return
      }
      // abort previous poll try
      if (previewPollController)
        previewPollController.abort()
      previewPollController = new AbortController()
      try {
        const res = await canParseOrPrefix(base, theme, {
          signal: previewPollController.signal,
          timeoutMs: timeouts.value.worker,
        })
        if (res.fullOk) {
          const rendered = await initMermaid(createMermaidRenderRequest(base, theme))
          if (rendered && hasRenderedOnce.value) {
            stopPreviewPolling()
            return
          }
        }
        else if (res.prefixOk && res.prefix && canApplyPartialPreview()) {
          await renderPartial(res.prefix, base, theme, renderToken.value)
        }
      }
      catch {
        // ignore and keep polling
      }
      previewPollDelay = Math.min(Math.floor(previewPollDelay * 1.5), previewPollMaxDelay.value)
      scheduleNextPreviewPoll(previewPollDelay)
    }, { timeout: 500 }) as unknown as number
  }, delay)
}

function startPreviewPolling() {
  if (isPreviewPolling)
    return
  if (!usesProgressivePreview.value)
    return
  if (!mermaidAvailable.value)
    return
  if (!canScheduleViewportWork())
    return
  if (showSource.value || hasRenderedOnce.value)
    return
  isPreviewPolling = true
  lastPreviewStopAt = 0
  allowPartialPreview = true
  previewPollAttempts = 0
  previewPollDelay = previewPollInitialDelay.value
  scheduleNextPreviewPoll(previewPollDelay)
}

// Watch for code changes (only base code, not theme changes)
watch(
  () => baseFixedCode.value,
  (code) => {
    if (code.trim() || props.loading === false) {
      hasRenderedOnce.value = false
      svgCache.value = {}
    }
    if (!usesProgressivePreview.value) {
      stopPreviewPolling()
      if (canScheduleViewportWork() && !showSource.value)
        void renderStaticDiagram()
      return
    }
    // Use idle progressive path; will call initMermaid when full code becomes valid
    if (canScheduleViewportWork())
      debouncedProgressiveRender()
    // Ensure background polling while previewing (to upgrade to full render when ready)
    if (!showSource.value && mermaidAvailable.value && canScheduleViewportWork())
      startPreviewPolling()
    else
      stopPreviewPolling()
    checkContentStability()
  },
)

// Watch for dark mode changes with smart caching
watch(() => props.isDark, async () => {
  // 如果当前是错误展示，则等待下一次有效内容渲染再切换主题，避免覆盖错误信息
  if (hasRenderError.value) {
    return
  }
  const targetTheme = props.isDark ? 'dark' : 'light'
  const cachedForTheme = svgCache.value[targetTheme]
  if (cachedForTheme) {
    if (mermaidContent.value) {
      const rendered = renderSvgToTarget(mermaidContent.value, cachedForTheme.svg)
      if (rendered) {
        lastMermaidBindFunctions = cachedForTheme.bindFunctions ?? null
        bindMermaidInteractions(rendered.bindTarget)
      }
    }
    return
  }
  const currentTransformState = {
    zoom: zoom.value,
    translateX: translateX.value,
    translateY: translateY.value,
    containerHeight: containerHeight.value,
  }
  const hasUserTransform = zoom.value !== 1 || translateX.value !== 0 || translateY.value !== 0
  isThemeRendering.value = true

  if (hasUserTransform) {
    zoom.value = 1
    translateX.value = 0
    translateY.value = 0
    await nextTick()
  }
  await initMermaid()
  if (hasUserTransform) {
    await nextTick()
    zoom.value = currentTransformState.zoom
    translateX.value = currentTransformState.translateX
    translateY.value = currentTransformState.translateY
    containerHeight.value = currentTransformState.containerHeight
    savedTransformState.value = currentTransformState
  }
})

// Watch for source toggle with proper timing
watch(
  () => showSource.value,
  async (newValue) => {
    if (!newValue) {
      if (hasRenderError.value) {
        // 如果当前展示错误，保持错误展示，不去恢复缓存
        return
      }
      const currentTheme = props.isDark ? 'dark' : 'light'
      if (hasRenderedOnce.value && svgCache.value[currentTheme]) {
        await nextTick()
        if (mermaidContent.value) {
          const cached = svgCache.value[currentTheme]!
          const rendered = renderSvgToTarget(mermaidContent.value, cached.svg)
          if (rendered) {
            lastMermaidBindFunctions = cached.bindFunctions ?? null
            bindMermaidInteractions(rendered.bindTarget)
          }
        }
        // Restoring full render from cache -> hide Partial badge
        zoom.value = savedTransformState.value.zoom
        translateX.value = savedTransformState.value.translateX
        translateY.value = savedTransformState.value.translateY
        containerHeight.value = savedTransformState.value.containerHeight
        return
      }
      await nextTick()
      // If mermaid is not available, do not attempt progressive render or start polling
      if (!mermaidAvailable.value || !canScheduleViewportWork())
        return
      if (!usesProgressivePreview.value) {
        stopPreviewPolling()
        await renderStaticDiagram()
        return
      }
      // Arm partial-preview eligibility before the immediate preview render runs.
      startPreviewPolling()
      // Use progressive path to avoid throwing on incomplete code
      await progressiveRender()
    }
    else {
      stopPreviewPolling()
      if (hasRenderedOnce.value) {
        savedTransformState.value = {
          zoom: zoom.value,
          translateX: translateX.value,
          translateY: translateY.value,
          containerHeight: containerHeight.value,
        }
      }
    }
  },
)

// 当外部 loading -> false：若已完整渲染则不再重复渲染；否则尝试一次最终完整解析，失败才展示错误
watch(
  () => props.loading,
  async (loaded, prev) => {
    if (loaded) {
      cancelFinalWorkerParse()
      return
    }
    if (prev === true) {
      cancelFinalWorkerParse()
      const source = baseFixedCode.value
      const base = source.trim()
      if (!base) {
        if (mermaidContent.value)
          clearElement(mermaidContent.value)
        lastSvgSnapshot.value = null
        lastCompletedRenderSignature = ''
        hasRenderError.value = false
        return cleanupAfterLoadingSettled()
      }
      if (!canScheduleViewportWork()) {
        cleanupAfterLoadingSettled()
        return
      }
      const theme = props.isDark ? 'dark' : 'light'
      const request = createMermaidRenderRequest(source, theme)

      if (hasRenderedOnce.value && request.signature === lastCompletedRenderSignature) {
        await nextTick()
        // 保险：如果 DOM 被清空但有缓存，恢复一次，不触发重新渲染
        if (mermaidContent.value && !mermaidContent.value.querySelector('svg') && svgCache.value[theme]) {
          const cached = svgCache.value[theme]!
          const rendered = renderSvgToTarget(mermaidContent.value, cached.svg)
          if (rendered) {
            lastMermaidBindFunctions = cached.bindFunctions ?? null
            bindMermaidInteractions(rendered.bindTarget)
          }
        }
        updateContainerHeight(undefined, { force: true })
        // 渲染已完成，清理后台任务
        cleanupAfterLoadingSettled()
        return
      }

      const finalParseController = new AbortController()
      finalWorkerParseController = finalParseController

      // 否则：进行一次最终完整解析，成功则完整渲染；失败才展示错误
      try {
        let workerRetryCount = 0
        for (;;) {
          try {
            await canParseOffthread(base, theme, {
              signal: finalParseController.signal,
              timeoutMs: timeouts.value.worker,
            })
            break
          }
          catch (error: any) {
            const transientWorkerError = error?.code === 'WORKER_BUSY' || error?.code === 'WORKER_TIMEOUT'
            const maxRetries = error?.code === 'WORKER_TIMEOUT'
              ? MAX_FINAL_WORKER_TIMEOUT_RETRIES
              : MAX_FINAL_WORKER_BUSY_RETRIES
            if (!transientWorkerError || workerRetryCount >= maxRetries)
              throw error
            const retryDelay = Math.min(
              FINAL_WORKER_PARSE_RETRY_DELAY_MS * 2 ** workerRetryCount,
              400,
            )
            workerRetryCount++
            await withTimeoutSignal(
              () => new Promise(resolve => setTimeout(resolve, retryDelay)),
              { signal: finalParseController.signal },
            )
          }
        }
        const rendered = await initMermaid(request)
        if (!rendered)
          return
        hasRenderError.value = false
        // 完整渲染成功后，停止轮询并中止未完成任务
        cleanupAfterLoadingSettled()
      }
      catch (err) {
        if (isAbortError(err))
          return
        // 出错时也清理后台任务，避免错误被后续任务覆盖
        cleanupAfterLoadingSettled()
        renderErrorToContainer(err)
      }
      finally {
        if (finalWorkerParseController === finalParseController)
          finalWorkerParseController = null
      }
    }
  },
)

// 监听容器元素的变化，并设置ResizeObserver
watch(
  mermaidContainer,
  (newEl) => {
    if (resizeObserver) {
      resizeObserver.disconnect()
    }

    if (newEl) {
      resizeObserver = new ResizeObserver((entries) => {
        if (entries && entries.length > 0 && !showSource.value && !isCollapsed.value) {
          // 使用 safeRaf 确保在 SSR 环境下不会抛错，同时在浏览器中使用 RAF
          safeRaf(() => {
            const newWidth = entries[0].contentRect.width
            updateContainerHeight(newWidth)
          })
        }
      })
      resizeObserver.observe(newEl)
    }
  },
  { immediate: true },
)

async function activateMermaid() {
  const generation = lifecycleGeneration
  if (!isActiveGeneration(generation))
    return
  await resolveMermaidInstance().catch((err) => {
    if (!isActiveGeneration(generation))
      return
    mermaidAvailable.value = false
    console.warn('[markstream-vue] Failed to initialize mermaid renderer. Call enableMermaid() to configure a loader.', err)
  })
  if (!isActiveGeneration(generation))
    return
  await nextTick()
  if (!isActiveGeneration(generation))
    return
  // Set initial default tab based on mermaid availability (unless user already toggled)
  if (!userToggledShowSource.value) {
    showSource.value = !mermaidAvailable.value
  }
  if (canScheduleViewportWork()) {
    if (usesProgressivePreview.value) {
      debouncedProgressiveRender()
      lastContentLength.value = baseFixedCode.value.length
    }
    else if (!showSource.value) {
      void renderStaticDiagram()
    }
  }
}

onMounted(() => {
  if (deferOffscreenHeavyNodes.value && !canScheduleViewportWork())
    return
  void activateMermaid()
})

// Auto-update default tab when mermaid availability changes, but don't override user actions
watch(
  () => mermaidAvailable.value,
  (available) => {
    if (userToggledShowSource.value)
      return
    showSource.value = !available
  },
)

watch(
  () => props.maxHeight,
  () => {
    nextTick(() => {
      updateContainerHeight()
    })
  },
)

watch(
  [() => props.estimatedPreviewHeightPx, () => baseFixedCode.value],
  () => {
    if (!hasRenderedOnce.value && !hasPreviewSvg() && !showSource.value) {
      containerHeight.value = resolveInitialContainerHeight()
      contentHeight.value = containerHeight.value
    }
  },
)

watch(
  () => viewportReady.value,
  async (visible) => {
    if (!visible)
      return
    if (!mermaidAvailabilityResolved.value) {
      await activateMermaid()
      return
    }
    if (!hasRenderedOnce.value) {
      if (usesProgressivePreview.value) {
        debouncedProgressiveRender()
        lastContentLength.value = baseFixedCode.value.length
      }
      else {
        void renderStaticDiagram()
      }
    }
    if (!props.loading && !hasRenderedOnce.value)
      void renderStaticDiagram()
    if (!showSource.value && mermaidAvailable.value && usesProgressivePreview.value)
      startPreviewPolling()
  },
  { immediate: false },
)

onUnmounted(() => {
  if (contentStableTimer) {
    clearTimeout(contentStableTimer)
  }
  clearProgressiveRenderDebounceTimer()
  // 在组件卸载时，确保观察者被彻底清理，防止内存泄漏
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (currentWorkController) {
    currentWorkController.abort()
    currentWorkController = null
  }
  cancelFinalWorkerParse()
  stopPreviewPolling()
  clearRenderRetryTimer()
  clearLifecyclePending()
})

watch(
  () => isCollapsed.value,
  async (collapsed) => {
    if (collapsed) {
      stopPreviewPolling()
      if (currentWorkController)
        currentWorkController.abort()
    }
    else {
      if (canScheduleViewportWork() && !hasRenderedOnce.value) {
        await nextTick()
        if (usesProgressivePreview.value) {
          debouncedProgressiveRender()
          startPreviewPolling()
        }
        else if (!showSource.value) {
          void renderStaticDiagram()
        }
      }
    }
  },
  { immediate: false },
)

const computedButtonStyle = 'mermaid-action-btn p-[var(--ms-action-btn-padding)] rounded'
</script>

<template>
  <div
    ref="blockContainer"
    class="mermaid-block-container rounded-lg border overflow-hidden"
    data-markstream-mermaid="1"
    :data-markstream-mode="showSource ? 'fallback' : hasRenderedOnce ? 'preview' : 'pending'"
    :data-markstream-pending="restoreVisualPending ? 'true' : undefined"
    :class="[
      { 'is-rendering': props.loading, 'dark': props.isDark },
    ]"
  >
    <!-- 重新设计的头部区域 -->
    <div
      v-if="props.showHeader"
      class="mermaid-block-header flex items-center justify-between border-b px-[var(--ms-inset-panel-x)] py-[var(--ms-inset-panel-y)]"
    >
      <!-- 左侧插槽（允许完全接管左侧显示） -->
      <div v-if="$slots['header-left']">
        <slot name="header-left" />
      </div>
      <div v-else class="flex items-center gap-x-2 overflow-hidden">
        <span class="icon-slot action-icon shrink-0" v-html="mermaidIcon" />
        <span class="mermaid-label-text text-[length:var(--ms-text-label)] font-medium font-mono truncate">Mermaid</span>
      </div>

      <!-- 中间插槽或默认切换按钮 -->
      <div v-if="$slots['header-center']">
        <slot name="header-center" />
      </div>
      <div v-else-if="props.showModeToggle && mermaidAvailable" class="mermaid-mode-toggle-group flex items-center gap-0.5">
        <button
          class="mermaid-mode-btn px-2 py-0.5 rounded transition-colors"
          :class="[!showSource ? 'is-active' : '']"
          @click="() => handleSwitchMode('preview')"
          @mouseenter="onBtnHover($event, t('common.preview') || 'Preview')"
          @focus="onBtnHover($event, t('common.preview') || 'Preview')"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <div class="flex items-center gap-x-1">
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></g></svg>
            <span>{{ t('common.preview') || 'Preview' }}</span>
          </div>
        </button>
        <button
          class="mermaid-mode-btn px-2 py-0.5 rounded transition-colors"
          :class="[showSource ? 'is-active' : '']"
          @click="() => handleSwitchMode('source')"
          @mouseenter="onBtnHover($event, t('common.source') || 'Source')"
          @focus="onBtnHover($event, t('common.source') || 'Source')"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <div class="flex items-center gap-x-1">
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16 18l6-6l-6-6M8 6l-6 6l6 6" /></svg>
            <span>{{ t('common.source') || 'Source' }}</span>
          </div>
        </button>
      </div>

      <!-- 右侧插槽或默认操作按钮（可通过 props 控制每个按钮显隐） -->
      <div v-if="$slots['header-right']">
        <slot name="header-right" />
      </div>
      <div v-else class="mermaid-header-actions flex items-center">
        <button
          v-if="props.showCollapseButton"
          :class="computedButtonStyle"
          :aria-pressed="isCollapsed"
          @click="isCollapsed = !isCollapsed"
          @mouseenter="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
          @focus="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg :style="{ rotate: isCollapsed ? '0deg' : '90deg' }" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6" /></svg>
        </button>
        <button
          v-if="props.showCopyButton"
          :class="computedButtonStyle"
          @click="copy"
          @mouseenter="onCopyHover($event)"
          @focus="onCopyHover($event)"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg v-if="!copyText" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></g></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5" /></svg>
        </button>
        <button
          v-if="props.showExportButton && mermaidAvailable"
          :class="`${computedButtonStyle} ${isFullscreenDisabled ? 'opacity-50 cursor-not-allowed' : ''}`"
          :aria-label="t('common.export') || 'Export'"
          :disabled="isFullscreenDisabled"
          @click="handleExportClick"
          @mouseenter="onBtnHover($event, t('common.export') || 'Export')"
          @focus="onBtnHover($event, t('common.export') || 'Export')"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10l5 5l5-5" /></g></svg>
        </button>
        <button
          v-if="props.showFullscreenButton && mermaidAvailable"
          :class="`${computedButtonStyle} ${isFullscreenDisabled ? 'opacity-50 cursor-not-allowed' : ''}`"
          :aria-label="isModalOpen ? (t('common.minimize') || 'Minimize') : (t('common.open') || 'Open')"
          :disabled="isFullscreenDisabled"
          @click="handleOpenModalClick"
          @mouseenter="onBtnHover($event, isModalOpen ? (t('common.minimize') || 'Minimize') : (t('common.open') || 'Open'))"
          @focus="onBtnHover($event, isModalOpen ? (t('common.minimize') || 'Minimize') : (t('common.open') || 'Open'))"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg v-if="!isModalOpen" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6" /></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" /></svg>
        </button>
      </div>
    </div>

    <!-- 内容区域（带高度过渡的容器） -->
    <div v-show="!isCollapsed" ref="modeContainerRef">
      <div v-if="showSource" class="mermaid-source-panel">
        <pre class="mermaid-source-code text-sm font-mono whitespace-pre-wrap">{{ baseFixedCode }}</pre>
      </div>
      <div v-else class="relative">
        <!-- ...existing preview content... -->
        <div v-if="props.showZoomControls" class="absolute top-2 right-2 z-10 rounded-lg">
          <div class="flex items-center gap-2 backdrop-blur rounded-lg">
            <button
              class="mermaid-action-btn p-[var(--ms-action-btn-padding)] rounded transition-colors"
              @click="zoomIn"
              @mouseenter="onBtnHover($event, t('common.zoomIn') || 'Zoom in')"
              @focus="onBtnHover($event, t('common.zoomIn') || 'Zoom in')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M11 8v6m-3-3h6" /></g></svg>
            </button>
            <button
              class="mermaid-action-btn p-[var(--ms-action-btn-padding)] rounded transition-colors"
              @click="zoomOut"
              @mouseenter="onBtnHover($event, t('common.zoomOut') || 'Zoom out')"
              @focus="onBtnHover($event, t('common.zoomOut') || 'Zoom out')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M8 11h6" /></g></svg>
            </button>
            <button
              class="mermaid-action-btn p-[var(--ms-action-btn-padding)] text-[length:var(--ms-text-label)] rounded transition-colors"
              @click="resetZoom"
              @mouseenter="onBtnHover($event, t('common.resetZoom') || 'Reset zoom')"
              @focus="onBtnHover($event, t('common.resetZoom') || 'Reset zoom')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              {{ Math.round(zoom * 100) }}%
            </button>
          </div>
        </div>
        <div
          ref="mermaidContainer"
          class="mermaid-preview-area relative overflow-hidden block transition-[height] ease-out"
          :style="{ height: containerHeight }"
          v-on="wheelListeners"
          @mousedown="startDrag"
          @mousemove="onDrag"
          @mouseup="stopDrag"
          @mouseleave="stopDrag"
          @touchstart.passive="startDrag"
          @touchmove.passive="onDrag"
          @touchend.passive="stopDrag"
        >
          <div
            data-mermaid-wrapper
            class="absolute inset-0 cursor-grab"
            :class="{ 'cursor-grabbing': isDragging }"
            :style="transformStyle"
          >
            <div
              ref="mermaidContent"
              class="_mermaid w-full text-center flex items-center justify-center min-h-full"
              :style="{ height: contentHeight }"
            />
          </div>
        </div>
        <!-- Modal pseudo-fullscreen overlay (teleported to body) -->
        <teleport to="body">
          <div class="markstream-vue" :class="{ dark: props.isDark }">
            <transition name="mermaid-dialog" appear>
              <div
                v-if="isModalOpen"
                class="mermaid-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
                @click.self="closeModal"
              >
                <div
                  class="dialog-panel mermaid-modal-panel relative w-full h-full max-w-full max-h-full rounded overflow-hidden"
                >
                  <div class="absolute top-6 right-6 z-50 flex items-center gap-2">
                    <button
                      class="mermaid-action-btn p-[var(--ms-action-btn-padding)] rounded transition-colors"
                      @click="zoomIn"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M11 8v6m-3-3h6" /></g></svg>
                    </button>
                    <button
                      class="mermaid-action-btn p-[var(--ms-action-btn-padding)] rounded transition-colors"
                      @click="zoomOut"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M8 11h6" /></g></svg>
                    </button>
                    <button
                      class="mermaid-action-btn p-[var(--ms-action-btn-padding)] text-[length:var(--ms-text-label)] rounded transition-colors"
                      @click="resetZoom"
                    >
                      {{ Math.round(zoom * 100) }}%
                    </button>
                    <button
                      class="mermaid-action-btn inline-flex items-center justify-center p-[var(--ms-action-btn-padding)] rounded transition-colors"
                      @click="closeModal"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div
                    ref="modalContent"
                    class="w-full h-full flex items-center justify-center p-4 overflow-hidden"
                    v-on="wheelListeners"
                    @mousedown="startDrag"
                    @mousemove="onDrag"
                    @mouseup="stopDrag"
                    @mouseleave="stopDrag"
                    @touchstart.passive="startDrag"
                    @touchmove.passive="onDrag"
                    @touchend.passive="stopDrag"
                  />
                </div>
              </div>
            </transition>
          </div>
        </teleport>
      </div>
    </div>
  </div>
</template>

<style>
.action-icon {
  width: var(--ms-action-btn-icon);
  height: var(--ms-action-btn-icon);
}
.icon-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.icon-slot svg {
  display: block;
  width: 100%;
  height: 100%;
}
</style>

<style scoped>
/* ── Outer container ── */
.mermaid-block-container {
  margin: var(--ms-flow-diagram-y) 0;
  border-color: var(--diagram-border);
}

/* ── Header ── */
.mermaid-block-header {
  padding: var(--ms-inset-panel-y) var(--ms-inset-panel-x);
  background: var(--diagram-header-bg);
  border-color: var(--diagram-border);
}

/* ── Header label text ── */
.mermaid-label-text {
  color: var(--code-action-fg);
}

/* ── Mode toggle ── */
.mermaid-mode-toggle-group {
  background: transparent;
}

.mermaid-mode-btn {
  font-size: var(--ms-text-label);
  color: var(--code-action-fg);
  opacity: 0.6;
}

.mermaid-mode-btn:hover {
  opacity: 0.9;
}

.mermaid-mode-btn.is-active {
  background: hsl(var(--ms-foreground) / 0.08);
  color: var(--code-fg);
  opacity: 1;
}

/* ── Action buttons (copy, export, fullscreen, zoom, collapse, modal close) ── */
.mermaid-header-actions {
  gap: var(--ms-gap-header-actions);
}

.mermaid-action-btn {
  font-family: inherit;
  font-size: var(--ms-text-label);
  color: var(--code-action-fg);
}

.mermaid-action-btn:hover {
  background: var(--code-action-hover-bg);
  color: var(--code-action-hover-fg);
}

.mermaid-action-btn:active {
  transform: scale(0.98);
}

/* ── Source panel ── */
.mermaid-source-panel {
  padding: var(--ms-inset-panel-body);
  background: var(--diagram-bg);
}

.mermaid-source-code {
  color: hsl(var(--ms-foreground));
}

/* ── Preview area ── */
.mermaid-preview-area {
  background: var(--diagram-bg);
  min-height: var(--ms-size-diagram-min-height);
  transition-duration: var(--ms-duration-standard);
}

/* ── Modal overlay ── */
.mermaid-modal-overlay {
  background: var(--modal-overlay);
}

/* ── Modal panel ── */
.mermaid-modal-panel {
  background: var(--modal-bg);
  color: var(--modal-fg);
  box-shadow: var(--ms-shadow-modal);
}

/* ── Mermaid SVG content ── */
._mermaid {
  position: relative;
  font-family: inherit;
  content-visibility: auto;
  contain: content;
  contain-intrinsic-size: var(--ms-size-diagram-min-height) 240px;
}

._mermaid :deep([data-mermaid-svg-layer]) {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100%;
}

._mermaid :deep(svg) {
  width: 100%;
  height: auto;
  display: block;
}

.fullscreen {
  width: 100%;
  max-height: 100% !important;
  height: 100% !important;
}

/* Dialog transition inspired by shadcn (fade + zoom) */
.mermaid-dialog-enter-from,
.mermaid-dialog-leave-to {
  opacity: 0;
}
.mermaid-dialog-enter-active,
.mermaid-dialog-leave-active {
  transition: opacity var(--ms-duration-overlay) var(--ms-ease-standard);
}
.mermaid-dialog-enter-from .dialog-panel,
.mermaid-dialog-leave-to .dialog-panel {
  transform: translateY(8px) scale(0.98);
  opacity: 0.98;
}
.mermaid-dialog-enter-to .dialog-panel,
.mermaid-dialog-leave-from .dialog-panel {
  transform: translateY(0) scale(1);
  opacity: 1;
}
.mermaid-dialog-enter-active .dialog-panel,
.mermaid-dialog-leave-active .dialog-panel {
  transition: transform var(--ms-duration-overlay) var(--ms-ease-standard), opacity var(--ms-duration-overlay) var(--ms-ease-standard);
}
</style>
