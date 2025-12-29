<script setup lang="ts">
// Exported props interface for MermaidBlockNode
import type { MermaidBlockEvent, MermaidBlockNodeProps } from '../../types/component-props'
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { useViewportPriority } from '../../composables/viewportPriority'
import mermaidIconUrl from '../../icon/mermaid.svg?url'
import { safeRaf } from '../../utils/safeRaf'
import { canParseOffthread as canParseOffthreadClient, findPrefixOffthread as findPrefixOffthreadClient, terminateWorker as terminateMermaidWorker } from '../../workers/mermaidWorkerClient'

import { getMermaid } from './mermaid'

const props = withDefaults(
  // 全屏按钮禁用状态
  defineProps<MermaidBlockNodeProps>(),
  {
    maxHeight: '500px',
    loading: true,
    workerTimeoutMs: 1400,
    parseTimeoutMs: 1800,
    renderTimeoutMs: 2500,
    fullRenderTimeoutMs: 4000,
    // header/button control defaults
    showHeader: true,
    showModeToggle: true,
    showCopyButton: true,
    showExportButton: true,
    showFullscreenButton: true,
    showCollapseButton: true,
    showZoomControls: true,
    enableWheelZoom: false,
    isStrict: false,
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
const mermaidSecurityLevel = computed(() => props.isStrict ? 'strict' : 'loose')
const mermaidInitConfig = computed(() => ({
  startOnLoad: false,
  securityLevel: mermaidSecurityLevel.value,
  dompurifyConfig: mermaidSecurityLevel.value === 'strict' ? DOMPURIFY_CONFIG : undefined,
  flowchart: mermaidSecurityLevel.value === 'strict' ? { htmlLabels: false } : undefined,
}))

function neutralizeScriptProtocols(raw: string) {
  return raw
    .replace(/["']\s*javascript:/gi, '#')
    .replace(/\bjavascript:/gi, '#')
    .replace(/["']\s*vbscript:/gi, '#')
    .replace(/\bvbscript:/gi, '#')
    .replace(/\bdata:text\/html/gi, '#')
}

const DISALLOWED_STYLE_PATTERNS = [/javascript:/i, /expression\s*\(/i, /url\s*\(\s*javascript:/i, /@import/i]
const SAFE_URL_PROTOCOLS = /^(?:https?:|mailto:|tel:|#|\/|data:image\/(?:png|gif|jpe?g|webp);)/i

function sanitizeUrl(value: string | null | undefined) {
  if (!value)
    return ''
  const trimmed = value.trim()
  if (SAFE_URL_PROTOCOLS.test(trimmed))
    return trimmed
  return ''
}

function scrubSvgElement(svgEl: SVGElement) {
  const forbiddenTags = new Set(['script'])
  const nodes = [svgEl, ...Array.from(svgEl.querySelectorAll<SVGElement>('*'))]
  for (const node of nodes) {
    if (forbiddenTags.has(node.tagName.toLowerCase())) {
      node.remove()
      continue
    }
    const attrs = Array.from(node.attributes)
    for (const attr of attrs) {
      const name = attr.name
      if (/^on/i.test(name)) {
        node.removeAttribute(name)
        continue
      }
      if (name === 'style' && attr.value) {
        const val = attr.value
        if (DISALLOWED_STYLE_PATTERNS.some(re => re.test(val))) {
          node.removeAttribute(name)
          continue
        }
      }
      if ((name === 'href' || name === 'xlink:href') && attr.value) {
        const safe = sanitizeUrl(attr.value)
        if (!safe) {
          node.removeAttribute(name)
          continue
        }
        // ensure sanitized value is applied
        if (safe !== attr.value)
          node.setAttribute(name, safe)
      }
    }
  }
}

function toSafeSvgElement(svg: string | null | undefined): SVGElement | null {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined')
    return null
  if (!svg)
    return null
  const neutralized = neutralizeScriptProtocols(svg)
  // DOMPurify may strip harmless label styles/text; rely on manual scrub after parse
  const parsed = new DOMParser().parseFromString(neutralized, 'image/svg+xml')
  const svgEl = parsed.documentElement
  if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg')
    return null
  const svgElement = svgEl as unknown as SVGElement
  scrubSvgElement(svgElement)
  return svgElement
}

function setSafeSvg(target: HTMLElement | null | undefined, svg: string | null | undefined) {
  if (!target)
    return ''
  try {
    target.replaceChildren()
  }
  catch {
    // fallback for older environments
    target.innerHTML = ''
  }
  const safeElement = toSafeSvgElement(svg)
  if (safeElement) {
    target.appendChild(safeElement)
    return target.innerHTML
  }
  return ''
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

function renderSvgToTarget(target: HTMLElement | null | undefined, svg: string | null | undefined) {
  if (!target)
    return ''
  if (mermaidSecurityLevel.value === 'strict') {
    return setSafeSvg(target, svg)
  }
  try {
    target.replaceChildren()
  }
  catch {
    target.innerHTML = ''
  }
  if (svg) {
    try {
      target.insertAdjacentHTML('afterbegin', svg)
    }
    catch {
      target.innerHTML = svg
    }
  }
  return target.innerHTML
}

const { t } = useSafeI18n()

async function resolveMermaidInstance() {
  try {
    const instance = await getMermaid()
    mermaidAvailable.value = !!instance
    return instance
  }
  catch (err) {
    mermaidAvailable.value = false
    throw err
  }
}

// Only initialize mermaid on the client to avoid SSR errors
if (typeof window !== 'undefined') {
  ;(async () => {
    try {
      const instance = await resolveMermaidInstance()
      if (!instance)
        return
      instance?.initialize?.({
        ...mermaidInitConfig.value,
        // dompurifyConfig: { ...DOMPURIFY_CONFIG },
      })
    }
    catch (err) {
      mermaidAvailable.value = false
      console.warn('[markstream-vue] Failed to initialize mermaid renderer. Call enableMermaid() to configure a loader.', err)
    }
  })()
}

const copyText = ref(false)
const isCollapsed = ref(false)
const mermaidContainer = ref<HTMLElement>()
const mermaidContent = ref<HTMLElement>()
const modalContent = ref<HTMLElement>()
const modalCloneWrapper = ref<HTMLElement | null>(null)
const registerViewport = useViewportPriority()
const viewportHandle = ref<ReturnType<typeof registerViewport> | null>(null)
const viewportReady = ref(typeof window === 'undefined')
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
  const themeConfig = `%%{init: {"theme": "${themeValue}"}}%%\n`
  if (baseCode.trim().startsWith('%%{')) {
    return baseCode
  }
  return themeConfig + baseCode
}

// Zoom state
const zoom = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const showSource = ref(false)
const userToggledShowSource = ref(false)
const isRendering = ref(false)
const renderQueue = ref<Promise<void> | null>(null)
const RENDER_DEBOUNCE_DELAY = 300
const CONTENT_STABLE_DELAY = 500
const lastContentLength = ref(0)
const isContentGenerating = ref(false)
let contentStableTimer: number | null = null
let renderRetryTimer: ReturnType<typeof setTimeout> | null = null
let consecutiveRenderTimeouts = 0
const MAX_RENDER_TIMEOUT_RETRIES = 3
// Schedule progressive work in idle time
const requestIdle
  = (globalThis as any).requestIdleCallback
    ?? ((cb: any, _opts?: any) => setTimeout(() => cb({ didTimeout: true }), 16))

const debouncedProgressiveRender = debounce(() => {
  requestIdle(() => {
    progressiveRender()
  }, { timeout: 500 })
}, RENDER_DEBOUNCE_DELAY)

function clearRenderRetryTimer() {
  if (renderRetryTimer != null) {
    (globalThis as any).clearTimeout(renderRetryTimer)
    renderRetryTimer = null
  }
}

function scheduleRenderRetry(delayMs = 600) {
  if (typeof globalThis === 'undefined')
    return
  const safeDelay = Math.max(0, delayMs)
  clearRenderRetryTimer()
  const run = () => {
    renderRetryTimer = null
    if (props.loading || isRendering.value || !viewportReady.value) {
      const nextDelay = Math.min(1200, Math.max(300, safeDelay * 1.2))
      scheduleRenderRetry(nextDelay)
      return
    }
    debouncedProgressiveRender()
  }
  renderRetryTimer = (globalThis as any).setTimeout(run, safeDelay)
}

const containerHeight = ref<string>('360px') // 初始值与 min-h 保持一致
let resizeObserver: ResizeObserver | null = null

// rendering state management
const hasRenderedOnce = ref(false)
const isThemeRendering = ref(false)
const svgCache = ref<{
  light?: string
  dark?: string
}>({})

const lastSvgSnapshot = ref<string | null>(null)
// 新增：记录上一次渲染的 code（去除所有空白字符）
const lastRenderedCode = ref<string>('')
const renderToken = ref(0)
// Abort/cancellation state for ongoing progressive work
let currentWorkController: AbortController | null = null
// Track whether an error is currently rendered to avoid being overwritten
const hasRenderError = ref(false)
const savedTransformState = ref({
  zoom: 1,
  translateX: 0,
  translateY: 0,
  containerHeight: '360px',
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
const cancelIdle
  = (globalThis as any).cancelIdleCallback ?? ((id: any) => clearTimeout(id))
let previewPollTimeoutId: number | null = null
let previewPollIdleId: number | null = null
let isPreviewPolling = false
let previewPollDelay = 800
let previewPollController: AbortController | null = null
let lastPreviewStopAt = 0
let allowPartialPreview = true

if (typeof window !== 'undefined') {
  watch(
    () => mermaidContainer.value,
    (el) => {
      viewportHandle.value?.destroy()
      viewportHandle.value = null
      if (!el) {
        viewportReady.value = false
        return
      }
      const handle = registerViewport(el, { rootMargin: '400px' })
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
  viewportHandle.value?.destroy()
  viewportHandle.value = null
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

// Unified error renderer (only used when props.loading === false)
function renderErrorToContainer(error: unknown) {
  if (typeof document === 'undefined')
    return
  if (!mermaidContent.value)
    return
  const errorDiv = document.createElement('div')
  errorDiv.className = 'text-red-500 p-4'
  errorDiv.textContent = 'Failed to render diagram: '
  const errorSpan = document.createElement('span')
  errorSpan.textContent = error instanceof Error ? error.message : 'Unknown error'
  errorDiv.appendChild(errorSpan)
  clearElement(mermaidContent.value)
  mermaidContent.value.appendChild(errorDiv)
  containerHeight.value = '360px'
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

// Tooltip helpers (singleton)
type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'
function shouldSkipEventTarget(el: EventTarget | null) {
  const btn = el as HTMLButtonElement | null
  return !btn || (btn as HTMLButtonElement).disabled
}
function onBtnHover(e: Event, text: string, place: TooltipPlacement = 'top') {
  if (shouldSkipEventTarget(e.currentTarget))
    return
  const ev = e as MouseEvent
  const origin = ev?.clientX != null && ev?.clientY != null ? { x: ev.clientX, y: ev.clientY } : undefined
  showTooltipForAnchor(e.currentTarget as HTMLElement, text, place, false, origin, props.isDark)
}
function onBtnLeave() {
  hideTooltip()
}
function onCopyHover(e: Event) {
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
  const themeConfig = `%%{init: {"theme": "${themeValue}"}}%%\n`
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

// NEW: heuristically trim trailing incomplete lines for worker/preview usage
function getSafePrefixCandidate(code: string): string {
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
    await withTimeoutSignal(() => anyMermaid.parse(themed), {
      timeoutMs: opts?.timeoutMs ?? timeouts.value.parse,
      signal: opts?.signal,
    })
    return true
  }
  // Fallback: try a headless render (no target element) just to validate
  const id = `mermaid-parse-${Math.random().toString(36).slice(2, 9)}`
  await withTimeoutSignal(() => (mermaidInstance as any).render(id, themed), {
    timeoutMs: opts?.timeoutMs ?? timeouts.value.render,
    signal: opts?.signal,
  })
  return true
}

async function canParseOffthread(
  code: string,
  theme: 'light' | 'dark',
  opts?: { signal?: AbortSignal, timeoutMs?: number },
) {
  try {
    // client call uses timeout param; if it rejects, fallback to main thread
    return await canParseOffthreadClient(code, theme, opts?.timeoutMs ?? timeouts.value.worker)
  }
  catch {
    return await canParseOnMain(code, theme, opts)
  }
}

// Try full, then safe prefix. Report which one worked.
async function canParseOrPrefix(
  code: string,
  theme: 'light' | 'dark',
  opts?: { signal?: AbortSignal, timeoutMs?: number },
): Promise<{ fullOk: boolean, prefixOk: boolean, prefix?: string }> {
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
        const found = await findPrefixOffthreadClient(code, theme, opts?.timeoutMs ?? timeouts.value.worker)
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

/**
 * 健壮地计算并更新容器高度，优先使用viewBox，并提供getBBox作为后备
 * @param newContainerWidth - 可选的容器宽度，由ResizeObserver提供以确保精确
 */
function updateContainerHeight(newContainerWidth?: number) {
  if (!mermaidContainer.value || !mermaidContent.value)
    return

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
    let newHeight = containerWidth * aspectRatio
    if (newHeight > intrinsicHeight)
      newHeight = intrinsicHeight // 高保真，不超过内容的固有高度
    containerHeight.value = `${newHeight}px`
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
    if (mermaidContainer.value && modalContent.value) {
      // clone the container for modal and add fullscreen to the clone (not original)
      const clone = mermaidContainer.value.cloneNode(true) as HTMLElement
      clone.classList.add('fullscreen')

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
    }
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

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: number | null = null

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => func(...args), wait)
  }
}

function checkContentStability() {
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
    }, CONTENT_STABLE_DELAY)
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
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(baseFixedCode.value)
    }
    copyText.value = true
    emits('copy', baseFixedCode.value)
    setTimeout(() => {
      copyText.value = false
    }, 1000)
  }
  catch (err) {
    console.error('Failed to copy:', err)
  }
}

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
  el.style.transition = 'height 180ms ease'
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

// 优化的 mermaid 渲染函数
async function initMermaid() {
  if (isRendering.value) {
    return renderQueue.value
  }

  if (!mermaidContent.value) {
    await nextTick()
    if (!mermaidContent.value) {
      console.warn('Mermaid container not ready')
      return
    }
  }

  isRendering.value = true

  renderQueue.value = (async () => {
    if (mermaidContent.value) {
      mermaidContent.value.style.opacity = '0'
    }

    try {
      const mermaidInstance = await resolveMermaidInstance()
      if (!mermaidInstance)
        return
      const id = `mermaid-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 11)}`

      if (!hasRenderedOnce.value && !isThemeRendering.value) {
        mermaidInstance.initialize?.({
          ...mermaidInitConfig.value,
          dompurifyConfig: { ...DOMPURIFY_CONFIG },
        })
      }
      const currentTheme = props.isDark ? 'dark' : 'light'
      const codeWithTheme = getCodeWithTheme(currentTheme)
      const res: any = await withTimeoutSignal(
        () => (mermaidInstance as any).render(
          id,
          codeWithTheme,
        ),
        { timeoutMs: timeouts.value.fullRender },
      )
      const svg = res?.svg

      if (mermaidContent.value) {
        const rendered = renderSvgToTarget(mermaidContent.value, svg)
        // Successful full render clears Partial preview state
        if (!hasRenderedOnce.value && !isThemeRendering.value) {
          updateContainerHeight()
          hasRenderedOnce.value = true
          savedTransformState.value = {
            zoom: zoom.value,
            translateX: translateX.value,
            translateY: translateY.value,
            containerHeight: containerHeight.value,
          }
        }
        const currentTheme = props.isDark ? 'dark' : 'light'
        if (rendered)
          svgCache.value[currentTheme] = rendered
        if (isThemeRendering.value) {
          isThemeRendering.value = false
        }
        // clear error state on successful render
        hasRenderError.value = false
        consecutiveRenderTimeouts = 0
        clearRenderRetryTimer()
      }
    }
    catch (error) {
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
        console.error('Failed to render mermaid diagram:', error)
        if (props.loading === false)
          renderErrorToContainer(error)
      }
    }
    finally {
      await nextTick()
      if (mermaidContent.value) {
        mermaidContent.value.style.opacity = '1'
      }
      isRendering.value = false
      renderQueue.value = null
    }
  })()

  return renderQueue.value
}

// Note: debouncedInitMermaid is no longer needed; progressive path handles debouncing

// Lightweight partial render that does NOT flip hasRenderedOnce or cache
async function renderPartial(code: string) {
  if (!canApplyPartialPreview())
    return
  if (!mermaidContent.value) {
    await nextTick()
    if (!mermaidContent.value)
      return
  }
  if (isRendering.value)
    return

  isRendering.value = true
  try {
    const mermaidInstance = await resolveMermaidInstance()
    if (!mermaidInstance)
      return
    const id = `mermaid-partial-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    const theme = props.isDark ? 'dark' : 'light'
    // 如果最后一行是不完整的（如以 |、-、> 等连接符结尾），则剪裁到上一行，
    // 提高在输入过程中可渲染出图像的概率
    const safePrefix = getSafePrefixCandidate(code)
    const codeForRender = safePrefix && safePrefix.trim() ? safePrefix : code
    const codeWithTheme = applyThemeTo(codeForRender, theme)
    if (mermaidContent.value)
      mermaidContent.value.style.opacity = '0'

    const res: any = await withTimeoutSignal(
      () => (mermaidInstance as any).render(id, codeWithTheme),
      { timeoutMs: timeouts.value.render },
    )
    const svg = res?.svg
    if (mermaidContent.value && svg) {
      renderSvgToTarget(mermaidContent.value, svg)
      updateContainerHeight()
    }
  }
  catch {
    // swallow partial errors to keep preview resilient
  }
  finally {
    await nextTick()
    if (mermaidContent.value)
      mermaidContent.value.style.opacity = '1'
    isRendering.value = false
  }
}

// Progressive render: if full parse passes -> run initMermaid; else restore last success (no prefix render)
// Progressive render: if full parse passes -> run initMermaid; else try safe prefix preview; else restore last success
async function progressiveRender() {
  const scheduledAt = Date.now()
  const token = ++renderToken.value
  // cancel any previous ongoing progressive work
  if (currentWorkController) {
    currentWorkController.abort()
  }
  currentWorkController = new AbortController()
  const signal = currentWorkController.signal
  const theme = props.isDark ? 'dark' : 'light'
  const base = baseFixedCode.value
  // 新增：去除所有空白字符后做比较
  const normalizedBase = base.replace(/\s+/g, '')
  if (!base.trim()) {
    if (mermaidContent.value)
      clearElement(mermaidContent.value)
    lastSvgSnapshot.value = null
    lastRenderedCode.value = ''
    hasRenderError.value = false
    return
  }
  // 如果和上一次渲染的 code（去除空白）一致，则跳过渲染
  if (normalizedBase === lastRenderedCode.value) {
    return
  }
  try {
    const res = await canParseOrPrefix(base, theme, { signal, timeoutMs: timeouts.value.worker })
    if (res.fullOk) {
      await initMermaid()
      // Guard against race: if a newer render started, skip flag changes
      if (renderToken.value === token) {
        lastSvgSnapshot.value = mermaidContent.value?.innerHTML ?? null
        // 记录本次渲染的 code（去除空白）
        lastRenderedCode.value = normalizedBase
        hasRenderError.value = false
      }
      return
    }
    // If stopPreviewPolling just happened after this work was queued, avoid partials
    const justStopped = lastPreviewStopAt && scheduledAt <= lastPreviewStopAt
    if (res.prefixOk && res.prefix && canApplyPartialPreview() && !justStopped) {
      // render a best-effort partial preview
      await renderPartial(res.prefix)
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
  if (renderToken.value !== token)
    return
  // 若当前处于错误显示状态，避免用缓存覆盖错误，直到下一次成功渲染
  if (hasRenderError.value)
    return
  // If we cannot apply partial and also shouldn't restore cached (e.g., error state), bail
  const cached = svgCache.value[theme]
  if (cached && mermaidContent.value) {
    renderSvgToTarget(mermaidContent.value, cached)
  }
  // else: keep current DOM (could be empty on very first run)
}

function stopPreviewPolling() {
  if (!isPreviewPolling)
    return
  isPreviewPolling = false
  previewPollDelay = 800
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
  // terminate parser worker to free resources; it will be recreated on demand
  terminateMermaidWorker()
  clearRenderRetryTimer()
  consecutiveRenderTimeouts = 0
}

function scheduleNextPreviewPoll(delay = 800) {
  if (!isPreviewPolling)
    return
  if (previewPollTimeoutId)
    (globalThis as any).clearTimeout(previewPollTimeoutId)
  previewPollTimeoutId = (globalThis as any).setTimeout(() => {
    previewPollIdleId = requestIdle(async () => {
      if (!isPreviewPolling)
        return
      if (showSource.value || hasRenderedOnce.value) {
        stopPreviewPolling()
        return
      }
      const theme = props.isDark ? 'dark' : 'light'
      const base = baseFixedCode.value
      if (!base.trim()) {
        scheduleNextPreviewPoll(previewPollDelay)
        return
      }
      // abort previous poll try
      if (previewPollController)
        previewPollController.abort()
      previewPollController = new AbortController()
      try {
        const ok = await canParseOffthread(base, theme, { signal: previewPollController.signal, timeoutMs: timeouts.value.worker })
        if (ok) {
          await initMermaid()
          if (hasRenderedOnce.value) {
            stopPreviewPolling()
            return
          }
        }
      }
      catch {
        // ignore and keep polling
      }
      previewPollDelay = Math.min(Math.floor(previewPollDelay * 1.5), 4000)
      scheduleNextPreviewPoll(previewPollDelay)
    }, { timeout: 500 }) as unknown as number
  }, delay)
}

function startPreviewPolling() {
  if (isPreviewPolling)
    return
  if (showSource.value || hasRenderedOnce.value)
    return
  isPreviewPolling = true
  lastPreviewStopAt = 0
  allowPartialPreview = true
  scheduleNextPreviewPoll(500)
}

// Watch for code changes (only base code, not theme changes)
watch(
  () => baseFixedCode.value,
  () => {
    hasRenderedOnce.value = false
    svgCache.value = {}
    // Use idle progressive path; will call initMermaid when full code becomes valid
    debouncedProgressiveRender()
    // Ensure background polling while previewing (to upgrade to full render when ready)
    if (!showSource.value && mermaidAvailable.value)
      startPreviewPolling()
    checkContentStability()
  },
)

// Watch for dark mode changes with smart caching
watch(() => props.isDark, async () => {
  if (!hasRenderedOnce.value) {
    return
  }
  // 如果当前是错误展示，则等待下一次有效内容渲染再切换主题，避免覆盖错误信息
  if (hasRenderError.value) {
    return
  }
  const targetTheme = props.isDark ? 'dark' : 'light'
  const cachedForTheme = svgCache.value[targetTheme]
  if (cachedForTheme) {
    if (mermaidContent.value) {
      renderSvgToTarget(mermaidContent.value, cachedForTheme)
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
          renderSvgToTarget(mermaidContent.value, svgCache.value[currentTheme]!)
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
      if (!mermaidAvailable.value)
        return
      // Use progressive path to avoid throwing on incomplete code
      await progressiveRender()
      // Start background polling to auto-upgrade to full render when ready
      startPreviewPolling()
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
    if (prev === true && loaded === false) {
      const base = baseFixedCode.value.trim()
      if (!base)
        return cleanupAfterLoadingSettled()
      const theme = props.isDark ? 'dark' : 'light'
      const normalizedBase = base.replace(/\s+/g, '')

      // 如果之前已完成一次完整渲染，且内容只有空格差异，避免重复渲染带来的闪烁
      if (hasRenderedOnce.value && normalizedBase === lastRenderedCode.value) {
        await nextTick()
        // 保险：如果 DOM 被清空但有缓存，恢复一次，不触发重新渲染
        if (mermaidContent.value && !mermaidContent.value.querySelector('svg') && svgCache.value[theme]) {
          renderSvgToTarget(mermaidContent.value, svgCache.value[theme]!)
        }
        // 渲染已完成，清理后台任务
        cleanupAfterLoadingSettled()
        return
      }

      // 否则：进行一次最终完整解析，成功则完整渲染；失败才展示错误
      try {
        await canParseOffthread(base, theme, { timeoutMs: timeouts.value.worker })
        await initMermaid()
        // 记录本次渲染的 code（去除空白）
        lastRenderedCode.value = normalizedBase
        hasRenderError.value = false
        // 完整渲染成功后，停止轮询并中止未完成任务
        cleanupAfterLoadingSettled()
      }
      catch (err) {
        // 出错时也清理后台任务，避免错误被后续任务覆盖
        cleanupAfterLoadingSettled()
        renderErrorToContainer(err)
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

    if (newEl && !hasRenderedOnce.value && !isThemeRendering.value) {
      // container resized; schedule height update

      resizeObserver = new ResizeObserver((entries) => {
        if (entries && entries.length > 0 && !hasRenderedOnce.value && !isThemeRendering.value) {
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

onMounted(async () => {
  await nextTick()
  // Set initial default tab based on mermaid availability (unless user already toggled)
  if (!userToggledShowSource.value) {
    showSource.value = !mermaidAvailable.value
  }
  if (viewportReady.value) {
    debouncedProgressiveRender()
    lastContentLength.value = baseFixedCode.value.length
  }
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
  () => viewportReady.value,
  (visible) => {
    if (!visible)
      return
    if (!hasRenderedOnce.value) {
      debouncedProgressiveRender()
      lastContentLength.value = baseFixedCode.value.length
    }
    if (!props.loading && !hasRenderedOnce.value)
      debouncedProgressiveRender()
  },
  { immediate: false },
)

onUnmounted(() => {
  if (contentStableTimer) {
    clearTimeout(contentStableTimer)
  }
  // 在组件卸载时，确保观察者被彻底清理，防止内存泄漏
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (currentWorkController) {
    currentWorkController.abort()
    currentWorkController = null
  }
  terminateMermaidWorker()
  stopPreviewPolling()
  clearRenderRetryTimer()
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
      if (!hasRenderedOnce.value) {
        await nextTick()
        debouncedProgressiveRender()
        if (!showSource.value)
          startPreviewPolling()
      }
    }
  },
  { immediate: false },
)

const computedButtonStyle = computed(() => {
  return props.isDark
    ? 'mermaid-action-btn p-2 text-xs rounded text-gray-400 hover:bg-gray-700 hover:text-gray-200'
    : 'mermaid-action-btn p-2 text-xs rounded text-gray-600 hover:bg-gray-200 hover:text-gray-700'
})
</script>

<template>
  <div
    class="my-4 rounded-lg border overflow-hidden shadow-sm"
    :class="[
      props.isDark ? 'border-gray-700/30' : 'border-gray-200',
      { 'is-rendering': props.loading },
    ]"
  >
    <!-- 重新设计的头部区域 -->
    <div
      v-if="props.showHeader"
      class="mermaid-block-header flex justify-between items-center px-4 py-2.5 border-b"
      :class="props.isDark ? 'bg-gray-800 border-gray-700/30' : 'bg-gray-50 border-gray-200'"
    >
      <!-- 左侧插槽（允许完全接管左侧显示） -->
      <div v-if="$slots['header-left']">
        <slot name="header-left" />
      </div>
      <div v-else class="flex items-center space-x-2 overflow-hidden">
        <img :src="mermaidIconUrl" class="w-4 h-4 my-0" alt="Mermaid">
        <span class="text-sm font-medium font-mono truncate" :class="props.isDark ? 'text-gray-400' : 'text-gray-600'">Mermaid</span>
      </div>

      <!-- 中间插槽或默认切换按钮 -->
      <div v-if="$slots['header-center']">
        <slot name="header-center" />
      </div>
      <div v-else-if="props.showModeToggle && mermaidAvailable" class="flex items-center space-x-1 rounded-md p-0.5" :class="props.isDark ? 'bg-gray-700' : 'bg-gray-100'">
        <button
          class="px-2.5 py-1 text-xs rounded transition-colors"
          :class="[
            !showSource
              ? (props.isDark ? 'bg-gray-600 text-gray-200 shadow-sm' : 'bg-white text-gray-700 shadow-sm')
              : (props.isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'),
          ]"
          @click="() => handleSwitchMode('preview')"
          @mouseenter="onBtnHover($event, t('common.preview') || 'Preview')"
          @focus="onBtnHover($event, t('common.preview') || 'Preview')"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <div class="flex items-center space-x-1">
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></g></svg>
            <span>{{ t('common.preview') || 'Preview' }}</span>
          </div>
        </button>
        <button
          class="px-2.5 py-1 text-xs rounded transition-colors"
          :class="[
            showSource
              ? (props.isDark ? 'bg-gray-600 text-gray-200 shadow-sm' : 'bg-white text-gray-700 shadow-sm')
              : (props.isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'),
          ]"
          @click="() => handleSwitchMode('source')"
          @mouseenter="onBtnHover($event, t('common.source') || 'Source')"
          @focus="onBtnHover($event, t('common.source') || 'Source')"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <div class="flex items-center space-x-1">
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16 18l6-6l-6-6M8 6l-6 6l6 6" /></svg>
            <span>{{ t('common.source') || 'Source' }}</span>
          </div>
        </button>
      </div>

      <!-- 右侧插槽或默认操作按钮（可通过 props 控制每个按钮显隐） -->
      <div v-if="$slots['header-right']">
        <slot name="header-right" />
      </div>
      <div v-else class="flex items-center space-x-1">
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
          <svg :style="{ rotate: isCollapsed ? '0deg' : '90deg' }" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6" /></svg>
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
          <svg v-if="!copyText" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></g></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5" /></svg>
        </button>
        <button
          v-if="props.showExportButton && mermaidAvailable"
          :class="`${computedButtonStyle} ${isFullscreenDisabled ? 'opacity-50 cursor-not-allowed' : ''}`"
          :disabled="isFullscreenDisabled"
          @click="handleExportClick"
          @mouseenter="onBtnHover($event, t('common.export') || 'Export')"
          @focus="onBtnHover($event, t('common.export') || 'Export')"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10l5 5l5-5" /></g></svg>
        </button>
        <button
          v-if="props.showFullscreenButton && mermaidAvailable"
          :class="`${computedButtonStyle} ${isFullscreenDisabled ? 'opacity-50 cursor-not-allowed' : ''}`"
          :disabled="isFullscreenDisabled"
          @click="handleOpenModalClick"
          @mouseenter="onBtnHover($event, isModalOpen ? (t('common.minimize') || 'Minimize') : (t('common.open') || 'Open'))"
          @focus="onBtnHover($event, isModalOpen ? (t('common.minimize') || 'Minimize') : (t('common.open') || 'Open'))"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg v-if="!isModalOpen" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="0.75rem" height="0.75rem" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6" /></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="0.75rem" height="0.75rem" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" /></svg>
        </button>
      </div>
    </div>

    <!-- 内容区域（带高度过渡的容器） -->
    <div v-show="!isCollapsed" ref="modeContainerRef">
      <div v-if="showSource" class="p-4" :class="props.isDark ? 'bg-gray-900' : 'bg-gray-50'">
        <pre class="text-sm font-mono whitespace-pre-wrap" :class="props.isDark ? 'text-gray-300' : 'text-gray-700'">{{ baseFixedCode }}</pre>
      </div>
      <div v-else class="relative">
        <!-- ...existing preview content... -->
        <div v-if="props.showZoomControls" class="absolute top-2 right-2 z-10 rounded-lg">
          <div class="flex items-center gap-2 backdrop-blur rounded-lg">
            <button
              class="p-2 text-xs rounded transition-colors" :class="[props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200']"
              @click="zoomIn"
              @mouseenter="onBtnHover($event, t('common.zoomIn') || 'Zoom in')"
              @focus="onBtnHover($event, t('common.zoomIn') || 'Zoom in')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M11 8v6m-3-3h6" /></g></svg>
            </button>
            <button
              class="p-2 text-xs rounded transition-colors" :class="[props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200']"
              @click="zoomOut"
              @mouseenter="onBtnHover($event, t('common.zoomOut') || 'Zoom out')"
              @focus="onBtnHover($event, t('common.zoomOut') || 'Zoom out')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M8 11h6" /></g></svg>
            </button>
            <button
              class="p-2 text-xs rounded transition-colors" :class="[props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200']"
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
          class="min-h-[360px] relative transition-all duration-100 overflow-hidden block"
          :class="props.isDark ? 'bg-gray-900' : 'bg-gray-50'"
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
            />
          </div>
        </div>
        <!-- Modal pseudo-fullscreen overlay (teleported to body) -->
        <teleport to="body">
          <div class="markstream-vue">
            <transition name="mermaid-dialog" appear>
              <div
                v-if="isModalOpen"
                class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                @click.self="closeModal"
              >
                <div
                  class="dialog-panel relative w-full h-full max-w-full max-h-full rounded shadow-lg overflow-hidden"
                  :class="props.isDark ? 'bg-gray-900' : 'bg-white'"
                >
                  <div class="absolute top-6 right-6 z-50 flex items-center gap-2">
                    <button
                      class="p-2 text-xs rounded transition-colors" :class="[props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200']"
                      @click="zoomIn"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M11 8v6m-3-3h6" /></g></svg>
                    </button>
                    <button
                      class="p-2 text-xs rounded transition-colors" :class="[props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200']"
                      @click="zoomOut"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M8 11h6" /></g></svg>
                    </button>
                    <button
                      class="p-2 text-xs rounded transition-colors" :class="[props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200']"
                      @click="resetZoom"
                    >
                      {{ Math.round(zoom * 100) }}%
                    </button>
                    <button
                      class="inline-flex items-center justify-center p-2 rounded transition-colors" :class="[props.isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-200']"
                      @click="closeModal"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12" /></svg>
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

<style scoped>
._mermaid {
  font-family: inherit;
  transition: opacity 0.2s ease-in-out;
  content-visibility: auto;
  contain: content;
  contain-intrinsic-size: 360px 240px;
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

.mermaid-action-btn {
  font-family: inherit;
}

.mermaid-action-btn:active {
  transform: scale(0.98);
}

/* Dialog transition inspired by shadcn (fade + zoom) */
.mermaid-dialog-enter-from,
.mermaid-dialog-leave-to {
  opacity: 0;
}
.mermaid-dialog-enter-active,
.mermaid-dialog-leave-active {
  transition: opacity 200ms ease;
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
  transition: transform 200ms ease, opacity 200ms ease;
}
</style>
