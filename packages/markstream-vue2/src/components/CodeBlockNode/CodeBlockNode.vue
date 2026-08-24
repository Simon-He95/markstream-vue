<script setup lang="ts">
import type { CodeBlockNode as ParsedCodeBlockNode } from 'stream-markdown-parser'
import type { PropType } from 'vue-demi'
import type { CodeBlockOptions, CodeBlockPreviewPayload, CodeBlockThemeProp, CodeBlockThemes } from '../../types/component-props'
// Avoid static import of `stream-diffs` for types so the runtime bundle
// doesn't get a reference. Define minimal local types we need here.
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onUnmounted, ref, watch } from 'vue-demi'
import { useSafeI18n } from '../../composables/useSafeI18n'
// Tooltip is provided as a singleton via composable to avoid many DOM nodes
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { useViewportPriority } from '../../composables/viewportPriority'
import { getLanguageIcon, languageIconsRevision, languageMap, normalizeLanguageIdentifier, resolveLanguageId } from '../../utils'
import { safeCancelRaf, safeRaf } from '../../utils/safeRaf'
import PreCodeNode from '../PreCodeNode'
import HtmlPreviewFrame from './HtmlPreviewFrame.vue'
import { getStreamDiffsRuntime } from './streamDiffs'

const props = defineProps({
  node: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  loading: { type: Boolean, default: true },
  stream: { type: Boolean, default: true },
  codeBlockOptions: { type: Object as () => CodeBlockOptions | undefined, default: undefined },
  showLineNumbers: { type: Boolean, default: undefined },
  theme: { type: [Object, String] as PropType<CodeBlockThemeProp>, default: undefined },
  darkTheme: { type: String, default: undefined },
  lightTheme: { type: String, default: undefined },
  isShowPreview: { type: Boolean, default: true },
  enableFontSizeControl: { type: Boolean, default: true },
  minWidth: { type: [String, Number], default: undefined },
  maxWidth: { type: [String, Number], default: undefined },
  themes: { type: Array as unknown as PropType<CodeBlockThemes>, default: undefined },
  // Header configuration: allow consumers to toggle built-in buttons and header visibility
  showHeader: { type: Boolean, default: true },
  showCopyButton: { type: Boolean, default: true },
  showExpandButton: { type: Boolean, default: true },
  showPreviewButton: { type: Boolean, default: true },
  showCollapseButton: { type: Boolean, default: true },
  showFontSizeButtons: { type: Boolean, default: true },
  showTooltips: { type: Boolean, default: undefined },
  htmlPreviewAllowScripts: { type: Boolean, default: undefined },
  htmlPreviewSandbox: { type: String, default: undefined },
  customId: { type: String, default: undefined },
  estimatedHeightPx: { type: Number, default: undefined },
  estimatedContentHeightPx: { type: Number, default: undefined },
  estimatedDiffInline: { type: Boolean, default: undefined },
})

const emits = defineEmits<{
  (e: 'previewCode', payload: CodeBlockPreviewPayload): void
  (e: 'copy', code: string): void
}>()

const instance = getCurrentInstance() as any
const hasPreviewListener = computed(() => {
  const proxy = instance?.proxy as any
  const listeners = proxy?.$listeners ?? {}
  if (listeners.previewCode || listeners['preview-code'])
    return true
  const vnodeListeners = proxy?.$vnode?.data?.on ?? proxy?.$vnode?.componentOptions?.listeners ?? {}
  if (vnodeListeners.previewCode || vnodeListeners['preview-code'])
    return true
  const props = (proxy?.$vnode as any)?.props ?? instance?.vnode?.props
  return !!(props && (props.onPreviewCode || props.onPreviewcode))
})
const { t } = useSafeI18n()
// No mermaid-specific handling here; NodeRenderer routes mermaid blocks.
const codeEditor = ref<HTMLElement | null>(null)
const container = ref<HTMLElement | null>(null)
const copyText = ref(false)
// local tooltip logic removed; use shared `showTooltipForAnchor` / `hideTooltip`

const codeLanguage = ref(normalizeLanguageIdentifier(props.node.language))
const languageId = computed(() => resolveLanguageId(codeLanguage.value))
const isPlainTextLanguage = computed(() => languageId.value === 'plaintext')
const isExpanded = ref(false)
const isCollapsed = ref(false)
const editorCreated = ref(false)
const editorReady = ref(false)
const runtimeReady = ref(false)
let expandRafId: number | null = null
const heightBeforeCollapse = ref<number | null>(null)
let resumeGuardFrames = 0
const registerVisibility = useViewportPriority()
let viewportHandle: ReturnType<typeof registerVisibility> | null = null
const viewportReady = ref(typeof window === 'undefined')
if (typeof window !== 'undefined') {
  watch(
    () => container.value,
    (el) => {
      viewportHandle?.destroy()
      viewportHandle = null
      if (!el) {
        viewportReady.value = false
        return
      }
      const handle = registerVisibility(el, { rootMargin: '400px' })
      viewportHandle = handle
      viewportReady.value = handle.isVisible.value
      handle.whenVisible.then(() => {
        viewportReady.value = true
      })
    },
    { immediate: true },
  )
}
onBeforeUnmount(() => {
  viewportHandle?.destroy()
  viewportHandle = null
})

// Lazy-load the stream-diffs helpers at runtime so consumers who don't install
// `stream-diffs` won't have the editor code bundled. We provide safe no-op
// fallbacks for the minimal API we use.
let createEditor: ((el: HTMLElement, code: string, lang: string) => void) | null = null
let createDiffEditor: ((el: HTMLElement, original: string, modified: string, lang: string) => void) | null = null
let updateCode: (code: string, lang: string) => void = () => {}
let updateDiffCode: (original: string, modified: string, lang: string) => void = () => {}
let getEditor: () => any = () => null
let getEditorView: () => any = () => ({ getModel: () => ({ getLineCount: () => 1 }), getOption: () => 14, updateOptions: () => {} })
let getDiffEditorView: () => any = () => ({ getModel: () => ({ getLineCount: () => 1 }), getOption: () => 14, updateOptions: () => {} })
let cleanupEditor: () => void = () => {}
let safeClean = () => {}
let refreshDiffPresentation: () => void = () => {}
let createEditorPromise: Promise<void> | null = null
let editorCreationGeneration = 0
let detectLanguage: (code: string) => string = () => String(props.node.language ?? 'plaintext')
let setTheme: (theme: any) => Promise<void> = async () => {}
let whenRuntimeVisualReady: (() => Promise<boolean>) | null = null
let runtimeOptions: Record<string, any> | null = null
let createRuntimeHelpersFactory: ((options: Record<string, any>) => any) | null = null
let isUnmounted = false
let deferredEditorVisualSyncRafId: number | null = null
const isDiff = computed(() => props.node.diff)
const defaultPreFallbackFontFamily = '"SF Mono", Monaco, Consolas, "Ubuntu Mono", "Liberation Mono", "Courier New", monospace'
const defaultPreFallbackFontSize = 12
const defaultPreFallbackLineHeight = 18

function readPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function readPadding(value: unknown) {
  const padding = readPositiveNumber(value) ?? 0
  return { top: padding, bottom: padding }
}

const resolvedCodeBlockOptions = computed(() => props.codeBlockOptions ?? {})
const effectiveShowLineNumbers = computed(() => {
  return props.showLineNumbers ?? (resolvedCodeBlockOptions.value.disableLineNumbers !== true)
})
const resolvedRuntimeOptions = computed<Record<string, any>>(() => {
  const raw = { ...resolvedCodeBlockOptions.value } as Record<string, any>
  for (const key of [
    'maxHeight',
    'padding',
    'tabSize',
    'theme',
    'themes',
    'themeType',
    'language',
    'languages',
    'stream',
    'disableFileHeader',
    'onThemeChange',
    'renderCustomHeader',
    'renderHeaderMetadata',
    'renderHeaderPrefix',
  ])
    delete raw[key]
  if (!isDiff.value)
    return raw
  const parseDiffOptions = raw.parseDiffOptions && typeof raw.parseDiffOptions === 'object'
    ? raw.parseDiffOptions as Record<string, unknown>
    : {}
  return {
    diffStyle: 'split',
    expandUnchanged: false,
    collapsedContextThreshold: 5,
    hunkSeparators: 'line-info',
    ...raw,
    parseDiffOptions: { context: 2, ...parseDiffOptions },
  }
})

// In streaming scenarios, the opening fence info string can arrive in chunks
// (e.g. "```d" then "iff json:..."), which means a block may flip between
// single <-> diff after the component has mounted. The mounted surface cannot
// switch kind in place, so we recreate it when the kind changes.
const desiredEditorKind = computed<'diff' | 'single'>(() => (isDiff.value ? 'diff' : 'single'))
const currentEditorKind = ref<'diff' | 'single'>(desiredEditorKind.value)
const usePreCodeRender = ref(false)
const showInlinePreview = ref(false)
const isDevEnv = typeof import.meta !== 'undefined' && Boolean((import.meta as any).env?.DEV)

function initializeRuntimeHelpers(factory: (options: Record<string, any>) => any) {
  createRuntimeHelpersFactory = factory
  runtimeOptions = buildRuntimeOptions()
  const helpers = factory(runtimeOptions)
  createEditor = helpers.createEditor || createEditor
  createDiffEditor = helpers.createDiffEditor || createDiffEditor
  updateCode = helpers.updateCode || updateCode
  updateDiffCode = helpers.updateDiff || updateDiffCode
  getEditor = helpers.getEditor || getEditor
  getEditorView = helpers.getEditorView || getEditorView
  getDiffEditorView = helpers.getDiffEditorView || getDiffEditorView
  cleanupEditor = helpers.cleanupEditor || cleanupEditor
  safeClean = helpers.safeClean || helpers.cleanupEditor || safeClean
  refreshDiffPresentation = helpers.refreshDiffPresentation || refreshDiffPresentation
  setTheme = helpers.setTheme || setTheme
  whenRuntimeVisualReady = helpers.whenVisualReady || null
  runtimeReady.value = true
}

// Defer client-only editor initialization to the browser to avoid SSR errors
if (typeof window !== 'undefined') {
  ;(async () => {
    try {
      const mod = await getStreamDiffsRuntime()
      // If mod is null, stream-diffs is not available
      if (!mod) {
        // Only log warning in development mode
        if (isDevEnv) {
          console.warn('[markstream-vue2] stream-diffs is not installed. Code blocks will use basic rendering. Install stream-diffs for enhanced code editor features.')
        }
        usePreCodeRender.value = true
        return
      }
      const createRuntimeHelpers = (mod as any).createCodeBlockRuntime
      const det = (mod as any).detectLanguage
      if (typeof det === 'function')
        detectLanguage = det
      if (typeof createRuntimeHelpers === 'function') {
        initializeRuntimeHelpers(createRuntimeHelpers)

        if (codeEditor.value)
          await ensureEditorCreation(codeEditor.value as HTMLElement)
      }
    }
    catch (err) {
      // Only log warning in development mode
      if (isDevEnv) {
        console.warn('[markstream-vue2] Failed to initialize stream-diffs:', err)
      }
      // Use PreCodeNode for rendering
      usePreCodeRender.value = true
    }
  })()
}

const codeFontMin = 10
const codeFontMax = 36
const codeFontStep = 1
const defaultCodeFontSize = ref<number>(
  typeof resolvedRuntimeOptions.value?.fontSize === 'number' ? resolvedRuntimeOptions.value.fontSize : defaultPreFallbackFontSize,
)
const codeFontSize = ref<number>(defaultCodeFontSize.value)
const fontBaselineReady = computed(() => {
  const a = defaultCodeFontSize.value
  const b = codeFontSize.value
  return typeof a === 'number' && Number.isFinite(a) && a > 0 && typeof b === 'number' && Number.isFinite(b) && b > 0
})
// Keep computed height tight to content. Extra padding caused visible bottom gap.
const CONTENT_PADDING = 0
// Fine-tuned to avoid bottom gap at default font size
const LINE_EXTRA_PER_LINE = 1.5
const PIXEL_EPSILON = 1

// Use shared safeRaf / safeCancelRaf from utils to avoid duplication

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    let settled = false
    let rafId: number | null = null
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null
    const finish = () => {
      if (settled)
        return
      settled = true
      if (timeoutId != null)
        globalThis.clearTimeout(timeoutId)
      if (rafId != null)
        safeCancelRaf(rafId)
      resolve()
    }
    timeoutId = globalThis.setTimeout(finish, 50)
    rafId = safeRaf(finish)
  })
}

async function waitForEditorVisualReady() {
  if (whenRuntimeVisualReady) {
    try {
      const ready = await whenRuntimeVisualReady()
      if (!ready)
        return false
      await nextTick()
      await waitForAnimationFrame()
      return !isUnmounted
    }
    catch {
      return false
    }
  }
  // stream-diffs always exposes whenVisualReady; keep a lightweight DOM
  // fallback that only checks for the stream-diffs host element.
  const maxPasses = 30
  for (let pass = 0; pass < maxPasses; pass++) {
    if (isUnmounted)
      return false
    if (codeEditor.value?.querySelector('diffs-container, .stream-diffs-shell')) {
      await nextTick()
      await waitForAnimationFrame()
      return !isUnmounted
    }
    await nextTick()
    await waitForAnimationFrame()
  }
  return false
}

function readActualFontSizeFromEditor(): number | null {
  try {
    const ed = isDiff.value ? getDiffEditorView()?.getModifiedEditor?.() ?? getDiffEditorView() : getEditorView()
    const mon = getEditor()
    const key = mon?.EditorOption?.fontInfo
    if (ed && key != null) {
      const info = ed.getOption?.(key)
      const size = info?.fontSize
      if (typeof size === 'number' && Number.isFinite(size) && size > 0)
        return size
    }
  }
  catch {}
  return null
}

function getLineHeightSafe(editor: any): number {
  try {
    const editorModule = getEditor()
    const key = editorModule?.EditorOption?.lineHeight
    if (key != null) {
      const v = editor?.getOption?.(key)
      if (typeof v === 'number' && v > 0)
        return v
    }
  }
  catch {}

  const fs = Number.isFinite(codeFontSize.value) && codeFontSize.value! > 0 ? (codeFontSize.value as number) : 12
  // Conservative fallback close to the editor's default ratio
  return Math.max(12, Math.round(fs * 1.35))
}
function ensureFontBaseline() {
  if (Number.isFinite(codeFontSize.value) && (codeFontSize.value as number) > 0 && Number.isFinite(defaultCodeFontSize.value))
    return codeFontSize.value as number
  const actual = readActualFontSizeFromEditor()
  if (typeof resolvedRuntimeOptions.value?.fontSize === 'number') {
    defaultCodeFontSize.value = resolvedRuntimeOptions.value.fontSize
    codeFontSize.value = resolvedRuntimeOptions.value.fontSize
    return codeFontSize.value as number
  }
  if (actual && actual > 0) {
    defaultCodeFontSize.value = actual
    codeFontSize.value = actual
    return actual
  }
  // 极端兜底
  defaultCodeFontSize.value = 12
  codeFontSize.value = 12
  return 12
}

function increaseCodeFont() {
  const base = ensureFontBaseline()
  const after = Math.min(codeFontMax, base + codeFontStep)
  codeFontSize.value = after
}
function decreaseCodeFont() {
  const base = ensureFontBaseline()
  const after = Math.max(codeFontMin, base - codeFontStep)
  codeFontSize.value = after
}
function resetCodeFont() {
  ensureFontBaseline()
  if (Number.isFinite(defaultCodeFontSize.value))
    codeFontSize.value = defaultCodeFontSize.value as number
}

function measureRenderedStaticSurfaceHeight(): number | null {
  const host = codeEditor.value
  if (!host)
    return null

  const diffsContainer = host.querySelector('diffs-container') as HTMLElement | null
  const shadowRoot = diffsContainer?.shadowRoot
  const renderedSurface = shadowRoot?.querySelector<HTMLElement>('pre[data-file], [data-diff]')
    ?? host.querySelector<HTMLElement>('.stream-diffs-shell')
  const height = renderedSurface?.getBoundingClientRect().height ?? 0
  return Number.isFinite(height) && height > 0 ? Math.ceil(height) : null
}

function computeContentHeight(): number | null {
  // stream-diffs renders inside Shadow DOM, so its adapter model may not expose
  // a runtime-reported content height. Prefer the committed static surface itself.
  const staticSurfaceHeight = measureRenderedStaticSurfaceHeight()
  if (staticSurfaceHeight != null)
    return staticSurfaceHeight

  // Prefer the runtime contentHeight when available; fall back to lineCount * lineHeight.
  try {
    const ed = isDiff.value ? getDiffEditorView() : getEditorView()
    if (!ed)
      return null
    if (isDiff.value && ed?.getOriginalEditor && ed?.getModifiedEditor) {
      const o = ed.getOriginalEditor?.()
      const m = ed.getModifiedEditor?.()
      o?.layout?.()
      m?.layout?.()
      const oh = (o?.getContentHeight?.() as number) || 0
      const mh = (m?.getContentHeight?.() as number) || 0
      const h = Math.max(oh, mh)
      if (h > 0)
        return Math.ceil(h + PIXEL_EPSILON)
      // fallback per-editor line count
      const olc = o?.getModel?.()?.getLineCount?.() || 1
      const mlc = m?.getModel?.()?.getLineCount?.() || 1
      const lc = Math.max(olc, mlc)
      const lh = Math.max(getLineHeightSafe(o), getLineHeightSafe(m))
      return Math.ceil(lc * (lh + LINE_EXTRA_PER_LINE) + CONTENT_PADDING + PIXEL_EPSILON)
    }
    else if (ed?.getContentHeight) {
      ed?.layout?.()
      const h = ed.getContentHeight()
      if (h > 0)
        return Math.ceil(h + PIXEL_EPSILON)
    }
    // generic fallback
    const model = ed?.getModel?.()
    let lineCount = 1
    if (model && typeof model.getLineCount === 'function') {
      lineCount = model.getLineCount()
    }
    const lh = getLineHeightSafe(ed)
    return Math.ceil(lineCount * (lh + LINE_EXTRA_PER_LINE) + CONTENT_PADDING + PIXEL_EPSILON)
  }
  catch {
    return null
  }
}

// Keep runtime theme variables on the editor host. Writing them to the outer
// shell would restyle the still-visible pre fallback while the editor is hidden,
// producing an extra background-only state before the final handoff.
function syncEditorCssVars() {
  const editorEl = codeEditor.value as HTMLElement | null
  const rootEl = container.value as HTMLElement | null
  if (!editorEl || !rootEl)
    return

  // Align the enhanced surface with the pre-fallback geometry: stream-diffs/
  // pierre honor these CSS variables on the editor host (custom properties
  // inherit across the pierre shadow boundary).
  const targetEl = editorEl
  const codeOptions = resolvedCodeBlockOptions.value
  const tabSize = readPositiveNumber(codeOptions.tabSize) ?? 4
  targetEl.style.setProperty('--diffs-tab-size', String(tabSize))
  const configuredPadding = codeOptions.padding
  if (typeof configuredPadding === 'number') {
    targetEl.style.setProperty('--diffs-gap-block', `${configuredPadding}px`)
  }
  else {
    targetEl.style.removeProperty('--diffs-gap-block')
  }
}

let resizeSyncHandler: (() => void) | null = null
const SCROLL_PARENT_OVERFLOW_RE = /auto|scroll|overlay/i

function resolveScrollRootElement(node?: HTMLElement | null) {
  if (typeof window === 'undefined')
    return null
  const doc = node?.ownerDocument ?? document
  const scrollRoot = (doc.scrollingElement || doc.documentElement || doc.body) as HTMLElement | null
  let current = node?.parentElement ?? null
  while (current) {
    if (current === doc.body || current === scrollRoot)
      break
    const style = window.getComputedStyle(current)
    const overflowY = (style.overflowY || '').toLowerCase()
    const overflow = (style.overflow || '').toLowerCase()
    if (SCROLL_PARENT_OVERFLOW_RE.test(overflowY) || SCROLL_PARENT_OVERFLOW_RE.test(overflow))
      return current
    current = current.parentElement
  }
  return scrollRoot
}

function adjustScrollAfterHeightChange(container: HTMLElement, previousHeight: number, nextHeight: number) {
  if (typeof window === 'undefined')
    return
  const roundedPrev = Math.ceil(previousHeight)
  const roundedNext = Math.ceil(nextHeight)
  const delta = roundedNext - roundedPrev
  if (!delta)
    return

  const root = resolveScrollRootElement(container)
  if (!root)
    return

  const doc = container.ownerDocument ?? document
  const viewportRoot = root === doc.body || root === doc.documentElement || root === doc.scrollingElement
  const rootTop = viewportRoot ? 0 : root.getBoundingClientRect().top
  const containerTop = container.getBoundingClientRect().top - rootTop
  if (containerTop >= 0)
    return

  if (viewportRoot && typeof window.scrollBy === 'function') {
    window.scrollBy(0, delta)
    return
  }

  root.scrollTop += delta
}

function updateExpandedHeight() {
  try {
    const container = codeEditor.value
    if (!container)
      return

    const oldHeight = container.getBoundingClientRect().height
    const h = computeContentHeight()
    if (h != null && h > 0) {
      const nextHeight = Math.ceil(h)
      container.style.minHeight = '0px'
      container.style.height = `${nextHeight}px`
      container.style.maxHeight = 'none'
      container.style.overflow = 'visible'
      adjustScrollAfterHeightChange(container, oldHeight, nextHeight)
    }
  }
  catch {}
}

function scheduleEditorVisualSync() {
  if (deferredEditorVisualSyncRafId != null)
    return
  deferredEditorVisualSyncRafId = safeRaf(() => {
    deferredEditorVisualSyncRafId = null
    safeRaf(() => {
      if (isCollapsed.value)
        return
      if (isExpanded.value)
        updateExpandedHeight()
      else
        updateCollapsedHeight()
    })
  })
}

function applyCollapsedContainerHeight(container: HTMLElement, contentHeight: number, maxHeight: number) {
  const cappedHeight = Math.min(contentHeight, maxHeight)
  const shouldScroll = contentHeight > maxHeight + PIXEL_EPSILON
  container.style.minHeight = '0px'
  container.style.height = `${Math.ceil(cappedHeight)}px`
  container.style.maxHeight = `${Math.ceil(maxHeight)}px`
  container.style.overflow = shouldScroll ? 'auto' : 'hidden'
  return Math.ceil(cappedHeight)
}

function updateCollapsedHeight() {
  try {
    const container = codeEditor.value
    if (!container)
      return

    const oldHeight = container.getBoundingClientRect().height

    const max = getMaxHeightValue()
    if (resumeGuardFrames > 0) {
      resumeGuardFrames--
      if (heightBeforeCollapse.value != null) {
        const h = applyCollapsedContainerHeight(container, heightBeforeCollapse.value, max)
        adjustScrollAfterHeightChange(container, oldHeight, h)
        return
      }
    }
    const h0 = computeContentHeight()
    // 1) 有实时内容高度 -> 采用并记忆原始内容高度（未裁剪前），用于下一次恢复
    if (h0 != null && h0 > 0) {
      const h = applyCollapsedContainerHeight(container, h0, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    // 2) 使用折叠前的内容高度（不更新记忆值）
    if (heightBeforeCollapse.value != null) {
      const h = applyCollapsedContainerHeight(container, heightBeforeCollapse.value, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    // 3) 使用当前 DOM 高度（不更新记忆值）
    const rectH = Math.ceil((container.getBoundingClientRect?.().height) || 0)
    if (rectH > 0) {
      const h = applyCollapsedContainerHeight(container, rectH, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    // 4) 兜底：若有先前行高/字体，可估一个最小高度；否则保持现状，避免强制跳到 MAX
    const prev = Number.parseFloat(container.style.height)
    if (!Number.isNaN(prev) && prev > 0) {
      const h = applyCollapsedContainerHeight(container, prev, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
    }
    else {
      // 实在没有历史高度，才退到 max（极少数首次场景）
      const h = applyCollapsedContainerHeight(container, max, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
    }
  }
  catch {}
}

function getMaxHeightValue(): number {
  return resolvedCodeBlockOptions.value.maxHeight ?? 500
}

// Check if the language is previewable (HTML or SVG)
const isPreviewable = computed(() => props.isShowPreview && (codeLanguage.value === 'html' || codeLanguage.value === 'svg'))

watch(
  () => props.node.language,
  (newLanguage) => {
    codeLanguage.value = normalizeLanguageIdentifier(newLanguage)
  },
)

watch(
  () => [props.node.originalCode, props.node.updatedCode, languageId.value, isDiff.value] as const,
  async ([originalCode, updatedCode, _language, diff]) => {
    if (props.stream === false || !diff)
      return

    if (createEditor && !editorCreated.value && codeEditor.value) {
      try {
        await ensureEditorCreation(codeEditor.value as HTMLElement)
      }
      catch {}
    }

    updateDiffCode(
      String(originalCode ?? ''),
      String(updatedCode ?? ''),
      languageId.value,
    )

    scheduleEditorVisualSync()
  },
)

watch(
  () => props.node.code,
  async (newCode) => {
    if (props.stream === false)
      return
    if (!codeLanguage.value)
      codeLanguage.value = normalizeLanguageIdentifier(detectLanguage(newCode))
    if (isDiff.value)
      return

    // If the editor helpers exist but the editor hasn't been created yet,
    // ensure creation first so update calls don't get lost.
    if (createEditor && !editorCreated.value && codeEditor.value) {
      try {
        await ensureEditorCreation(codeEditor.value as HTMLElement)
      }
      catch {}
    }

    updateCode(newCode, languageId.value)

    if (isExpanded.value)
      scheduleEditorVisualSync()
  },
)

// 计算用于显示的语言名称
const displayLanguage = computed(() => {
  const lang = codeLanguage.value
  if (!lang)
    return languageMap[''] || 'Plain Text'
  return languageMap[lang] || lang.charAt(0).toUpperCase() + lang.slice(1)
})

// Computed property for language icon
const languageIcon = computed(() => {
  void languageIconsRevision.value
  return getLanguageIcon(codeLanguage.value || '')
})

const headerStyle = computed<Record<string, string> | undefined>(() => {
  if (isDiff.value)
    return undefined
  return {
    color: 'var(--code-fg, var(--markstream-code-fallback-fg))',
    backgroundColor: 'var(--code-header-bg, transparent)',
  }
})
const tooltipsEnabled = computed(() => props.showTooltips !== false)

// 复制代码
async function copy() {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(props.node.code)
    }
    copyText.value = true
    emits('copy', props.node.code)
    setTimeout(() => {
      copyText.value = false
    }, 1000)
  }
  catch (err) {
    console.error('复制失败:', err)
  }
}

// Tooltip helpers: use the global singleton tooltip so there's only one DOM node
watch(tooltipsEnabled, (enabled) => {
  if (!enabled)
    hideTooltip()
})

function resolveTooltipTarget(e: Event) {
  const btn = (e.currentTarget || e.target) as HTMLButtonElement | null
  if (!btn || btn.disabled)
    return null
  return btn
}

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'
function onBtnHover(e: Event, text: string, place: TooltipPlacement = 'top') {
  if (!tooltipsEnabled.value)
    return
  const target = resolveTooltipTarget(e)
  if (!target)
    return
  const ev = e as MouseEvent
  const origin = ev?.clientX != null && ev?.clientY != null ? { x: ev.clientX, y: ev.clientY } : undefined
  showTooltipForAnchor(target, text, place, false, origin, props.isDark)
}

function onBtnLeave() {
  if (!tooltipsEnabled.value)
    return
  hideTooltip()
}

function onCopyHover(e: Event) {
  if (!tooltipsEnabled.value)
    return
  const target = resolveTooltipTarget(e)
  if (!target)
    return
  const txt = copyText.value ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')
  const ev = e as MouseEvent
  const origin = ev?.clientX != null && ev?.clientY != null ? { x: ev.clientX, y: ev.clientY } : undefined
  showTooltipForAnchor(target, txt, 'top', false, origin, props.isDark)
}

function toggleExpand(e?: Event) {
  isExpanded.value = !isExpanded.value

  if (e && tooltipsEnabled.value) {
    const target = resolveTooltipTarget(e)
    if (target) {
      const txt = isExpanded.value ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand')
      showTooltipForAnchor(target, txt, 'top', false, undefined, props.isDark)
    }
  }

  const editor = isDiff.value
    ? getDiffEditorView()
    : getEditorView()
  const container = codeEditor.value
  if (!editor || !container)
    return

  if (isExpanded.value) {
    container.style.maxHeight = 'none'
    container.style.overflow = 'visible'
    updateExpandedHeight()
  }
  else {
    stopExpandAutoResize()
    container.style.overflow = 'auto'
    updateCollapsedHeight()
  }
}

function toggleHeaderCollapse() {
  isCollapsed.value = !isCollapsed.value
  if (isCollapsed.value) {
    if (codeEditor.value) {
      const rectH = Math.ceil((codeEditor.value.getBoundingClientRect?.().height) || 0)
      if (rectH > 0)
        heightBeforeCollapse.value = rectH
    }
    stopExpandAutoResize()
  }
  else {
    if (codeEditor.value && heightBeforeCollapse.value != null) {
      codeEditor.value.style.height = `${heightBeforeCollapse.value}px`
    }
    const ed = isDiff.value ? getDiffEditorView() : getEditorView()
    try {
      ed?.layout?.()
    }
    catch {}
    resumeGuardFrames = 2
    scheduleEditorVisualSync()
  }
}

watch(
  () => codeFontSize.value,
  (size, _prev) => {
    const editor = isDiff.value ? getDiffEditorView() : getEditorView()
    if (!editor)
      return
    if (!(typeof size === 'number' && Number.isFinite(size) && size > 0))
      return
    editor.updateOptions({ fontSize: size })
    if (isExpanded.value && !isCollapsed.value)
      scheduleEditorVisualSync()
  },
  { flush: 'post', immediate: false },
)

// 预览HTML/SVG代码
function previewCode() {
  if (!isPreviewable.value)
    return

  const lowerLang = codeLanguage.value
  if (hasPreviewListener.value) {
    const artifactType = lowerLang === 'html' ? 'text/html' : 'image/svg+xml'
    const artifactTitle
      = lowerLang === 'html'
        ? t('artifacts.htmlPreviewTitle') || 'HTML Preview'
        : t('artifacts.svgPreviewTitle') || 'SVG Preview'
    emits('previewCode', {
      node: props.node as ParsedCodeBlockNode,
      artifactType,
      artifactTitle,
      id: `temp-${lowerLang}-${Date.now()}`,
    })
    return
  }

  if (lowerLang === 'html')
    showInlinePreview.value = !showInlinePreview.value
}

async function runEditorCreation(el: HTMLElement, generation: number) {
  if (!createEditor || isUnmounted || generation !== editorCreationGeneration)
    return

  syncRuntimeOptions()

  if (isDiff.value) {
    safeClean()
    if (createDiffEditor)
      await createDiffEditor(el as HTMLElement, String(props.node.originalCode ?? ''), String(props.node.updatedCode ?? ''), languageId.value)
    else
      await createEditor(el as HTMLElement, props.node.code, languageId.value)
  }
  else {
    await createEditor(el as HTMLElement, props.node.code, languageId.value)
  }
  if (isUnmounted || generation !== editorCreationGeneration)
    return

  const editor = isDiff.value ? getDiffEditorView() : getEditorView()
  if (typeof resolvedRuntimeOptions.value?.fontSize === 'number') {
    editor?.updateOptions({ fontSize: resolvedRuntimeOptions.value.fontSize })
    defaultCodeFontSize.value = resolvedRuntimeOptions.value.fontSize
    codeFontSize.value = resolvedRuntimeOptions.value.fontSize
  }
  else {
    const actual = readActualFontSizeFromEditor()
    if (actual && actual > 0) {
      defaultCodeFontSize.value = actual
      codeFontSize.value = actual
    }
    else {
      defaultCodeFontSize.value = 12
      codeFontSize.value = 12
    }
  }

  if (!isExpanded.value && !isCollapsed.value)
    scheduleEditorVisualSync()

  if (props.loading === false) {
    await nextTick()
    if (isUnmounted || generation !== editorCreationGeneration)
      return
    safeRaf(() => {
      if (isUnmounted || generation !== editorCreationGeneration)
        return
      scheduleEditorVisualSync()
    })
  }

  const visuallyReady = await waitForEditorVisualReady()
  if (isUnmounted || generation !== editorCreationGeneration)
    return
  if (visuallyReady && !isCollapsed.value && !isExpanded.value) {
    // Lock the hidden host to the committed Shadow DOM surface before removing
    // the pre fallback. Height and visibility then change in one Vue update.
    updateCollapsedHeight()
  }
  editorReady.value = visuallyReady
}

function ensureEditorCreation(el: HTMLElement) {
  if (!createEditor)
    return null
  if (createEditorPromise)
    return createEditorPromise

  editorCreated.value = true
  editorReady.value = false
  const generation = editorCreationGeneration
  const pending = (async () => {
    await runEditorCreation(el, generation)
  })()

  const tracked = pending.finally(() => {
    if (createEditorPromise === tracked)
      createEditorPromise = null
  })
  createEditorPromise = tracked
  return tracked
}

// 延迟创建编辑器：仅在可见且准备就绪时创建，避免无意义的初始化
const stopCreateEditorWatch = watch(
  () => [codeEditor.value, isDiff.value, props.stream, props.loading, runtimeReady.value, viewportReady.value] as const,
  async ([el, _isDiff, stream, loading, _runtimeReady, visible]) => {
    if (!el || !createEditor)
      return
    if (!visible)
      return

    // If streaming is disabled, defer editor creation until loading is finished
    if (stream === false && loading !== false)
      return

    const creation = ensureEditorCreation(el as HTMLElement)
    if (!creation)
      return

    const generation = editorCreationGeneration
    try {
      await creation
    }
    catch (error) {
      if (!isUnmounted && generation === editorCreationGeneration)
        throw error
      return
    }
    if (isUnmounted || generation !== editorCreationGeneration)
      return

    stopCreateEditorWatch()
  },
)

watch(
  desiredEditorKind,
  async (nextKind, prevKind) => {
    if (nextKind === prevKind)
      return
    currentEditorKind.value = nextKind

    // If the enhanced surface is not mounted yet, let the normal
    // creation path pick up the latest kind.
    if (!createEditor || !codeEditor.value)
      return
    if (!editorCreated.value)
      return

    // If streaming is disabled, we still respect the "wait until loaded" rule.
    if (props.stream === false && props.loading !== false)
      return
    if (!viewportReady.value)
      return

    try {
      editorCreated.value = false
      editorCreationGeneration += 1
      createEditorPromise = null
      safeClean()
      await nextTick()
      await ensureEditorCreation(codeEditor.value as HTMLElement)
    }
    catch {
      // Keep fallback rendering if recreation fails.
      editorCreated.value = false
    }
  },
)

function getPreferredColorScheme() {
  if (typeof props.theme === 'string')
    return props.theme
  if (props.theme && typeof props.theme === 'object')
    return props.isDark ? (props.theme as any).dark : (props.theme as any).light
  return props.isDark ? props.darkTheme : props.lightTheme
}

function getThemeName(theme: any) {
  return typeof theme === 'string' ? theme : null
}

const runtimeThemes = computed(() => {
  if (Array.isArray(props.themes) && typeof props.themes[0] === 'string' && typeof props.themes[1] === 'string')
    return [props.themes[0], props.themes[1]]
  return [props.darkTheme ?? 'vitesse-dark', props.lightTheme ?? 'vitesse-light']
})

function resolveRequestedTheme() {
  return getPreferredColorScheme() ?? (props.isDark ? runtimeThemes.value[0] : runtimeThemes.value[1])
}

function themeUpdate() {
  syncRuntimeOptions()

  const themeToSet: any = resolveRequestedTheme()
  const syncPresentation = () => {
    if (isDiff.value)
      refreshDiffPresentation()
    safeRaf(() => {
      syncEditorCssVars()
      scheduleEditorVisualSync()
    })
  }

  if (!themeToSet) {
    syncPresentation()
    return
  }

  void Promise.resolve(setTheme(themeToSet))
    .then(syncPresentation)
    .catch(() => {})
}

function themeLooksDark(theme: any) {
  const themeName = getThemeName(theme) ?? ''
  const normalized = themeName.toLowerCase()
  if (!normalized)
    return !!props.isDark
  const darkTokens = [
    'dark',
    'night',
    'moon',
    'black',
    'dracula',
    'mocha',
    'frappe',
    'macchiato',
    'palenight',
    'ocean',
    'poimandres',
    'monokai',
    'laserwave',
    'tokyo',
    'slack-dark',
    'rose-pine',
    'github-dark',
    'material-theme',
    'one-dark',
    'catppuccin-mocha',
    'catppuccin-frappe',
    'catppuccin-macchiato',
  ]
  const lightTokens = ['light', 'latte', 'dawn', 'lotus']
  return darkTokens.some(token => normalized.includes(token))
    && !lightTokens.some(token => normalized.includes(token))
}

const resolvedChromeIsDark = computed(() => themeLooksDark(resolveRequestedTheme()))

const effectiveDiffAppearance = computed<'light' | 'dark'>(() => {
  return resolvedChromeIsDark.value ? 'dark' : 'light'
})

const resolvedSurfaceIsDark = computed(() =>
  isDiff.value ? effectiveDiffAppearance.value === 'dark' : resolvedChromeIsDark.value,
)

const preFallbackMetrics = computed(() => {
  const raw = resolvedCodeBlockOptions.value as Record<string, unknown>
  const fallbackFontSize = Number.isFinite(codeFontSize.value) && (codeFontSize.value as number) > 0
    ? (codeFontSize.value as number)
    : defaultPreFallbackFontSize
  const resolvedFontSize = readPositiveNumber(raw?.fontSize) ?? fallbackFontSize
  const resolvedLineHeight = readPositiveNumber(raw?.lineHeight)
    ?? (resolvedFontSize === defaultPreFallbackFontSize
      ? defaultPreFallbackLineHeight
      : Math.max(12, Math.round(resolvedFontSize * 1.5)))
  const fontFamily = typeof raw?.fontFamily === 'string' && raw.fontFamily.trim()
    ? raw.fontFamily.trim()
    : defaultPreFallbackFontFamily
  const padding = readPadding(raw?.padding)
  const defaultPadding = isDiff.value ? 0 : 8
  const hasConfiguredPadding = typeof raw.padding === 'number'
  const tabSize = readPositiveNumber(raw?.tabSize) ?? 4

  return {
    fontFamily,
    fontSize: resolvedFontSize,
    lineHeight: resolvedLineHeight,
    paddingBottom: hasConfiguredPadding ? padding.bottom : defaultPadding,
    paddingTop: hasConfiguredPadding ? padding.top : defaultPadding,
    tabSize,
  }
})

const preFallbackDiffInline = computed(() => {
  if (!isDiff.value)
    return false
  if (typeof props.estimatedDiffInline === 'boolean')
    return props.estimatedDiffInline
  return resolvedRuntimeOptions.value?.diffStyle === 'unified'
})

const preFallbackStyle = computed(() => {
  const metrics = preFallbackMetrics.value
  const style: Record<string, string | number> = {
    '--markstream-pre-line-number-top': `${metrics.paddingTop}px`,
    'fontSize': `${metrics.fontSize}px`,
    'lineHeight': `${metrics.lineHeight}px`,
    'paddingBottom': `${metrics.paddingBottom}px`,
    'paddingTop': `${metrics.paddingTop}px`,
    'tabSize': metrics.tabSize,
    'maxHeight': `${getMaxHeightValue()}px`,
    'overflow': 'auto',
    'whiteSpace': resolvedCodeBlockOptions.value.overflow === 'scroll' ? 'pre' : 'pre-wrap',
  }
  if (isDiff.value) {
    style['--markstream-code-padding-left'] = '62px'
    style['--markstream-pre-diff-line-height'] = `${metrics.lineHeight}px`
    style['--markstream-pre-line-number-width'] = '36px'
    style['--markstream-pre-line-number-gap'] = '0px'
  }
  if (metrics.fontFamily)
    style.fontFamily = metrics.fontFamily
  return style
})

// Compute inline style for container to respect optional min/max width.
const containerStyle = computed(() => {
  const style: Record<string, string> = {}
  const formatSize = (value: string | number | undefined) => {
    if (value == null)
      return undefined
    return typeof value === 'number' ? `${value}px` : String(value)
  }
  const minWidth = formatSize(props.minWidth)
  const maxWidth = formatSize(props.maxWidth)
  if (minWidth)
    style.minWidth = minWidth
  if (maxWidth)
    style.maxWidth = maxWidth

  // The async loading surface already occupies the full pre height. Preserve
  // that exact block floor while this component mounts so replacing the async
  // placeholder cannot collapse the page for a frame.
  if (!editorReady.value && !isCollapsed.value) {
    const estimatedHeight = readPositiveNumber(props.estimatedHeightPx)
    if (estimatedHeight != null) {
      style.minHeight = `${Math.ceil(estimatedHeight)}px`
    }
    else if (!isDiff.value) {
      const metrics = preFallbackMetrics.value
      const code = String(props.node.code ?? '').replace(/(?:\r\n|\n|\r)$/, '')
      const lineCount = code ? code.split(/\r\n|\n|\r/).length : 1
      const contentHeight = Math.min(
        getMaxHeightValue(),
        lineCount * metrics.lineHeight + metrics.paddingTop + metrics.paddingBottom,
      )
      const chromeHeight = (props.showHeader ? 41 : 0) + 2
      style.minHeight = `${Math.ceil(contentHeight + chromeHeight)}px`
    }
  }

  if (isDiff.value) {
    style.color = 'var(--markstream-diff-shell-fg)'
    style.borderColor = 'var(--markstream-diff-shell-border)'
  }
  else {
    style.color = 'var(--vscode-editor-foreground, var(--markstream-code-fallback-fg))'
    style.backgroundColor = 'var(--vscode-editor-background, var(--markstream-code-fallback-bg))'
    style.borderColor = 'var(--markstream-code-border-color)'
  }
  return style
})

const codeEditorContainerStyle = computed(() => {
  if (editorReady.value || isCollapsed.value)
    return undefined
  const estimatedContentHeight = readPositiveNumber(props.estimatedContentHeightPx)
  return estimatedContentHeight == null
    ? undefined
    : { minHeight: `${Math.ceil(Math.min(estimatedContentHeight, getMaxHeightValue()))}px` }
})

function buildRuntimeOptions() {
  const metrics = preFallbackMetrics.value
  const nextOptions = {
    overflow: 'wrap',
    ...(resolvedRuntimeOptions.value || {}),
    themes: [...runtimeThemes.value],
    stream: false,
    disableFileHeader: true,
    MAX_HEIGHT: resolvedCodeBlockOptions.value.maxHeight ?? 500,
    fontSize: metrics.fontSize,
    lineHeight: metrics.lineHeight,
    ...(metrics.fontFamily ? { fontFamily: metrics.fontFamily } : {}),
    disableLineNumbers: !effectiveShowLineNumbers.value,
    theme: resolveRequestedTheme(),
    themeType: props.isDark ? 'dark' : 'light',
    onThemeChange() {
      syncEditorCssVars()
    },
  } as Record<string, any>

  const configuredUnsafeCSS = typeof nextOptions.unsafeCSS === 'string'
    ? nextOptions.unsafeCSS
    : ''
  nextOptions.unsafeCSS = `[data-file], [data-diff] { --diffs-min-number-column-width-default: 2ch !important; }
${configuredUnsafeCSS}`.trim()

  return nextOptions
}

function syncRuntimeOptions() {
  const nextOptions = buildRuntimeOptions()
  if (!runtimeOptions) {
    runtimeOptions = nextOptions
    return runtimeOptions
  }

  for (const key of Object.keys(runtimeOptions)) {
    if (!(key in nextOptions))
      delete runtimeOptions[key]
  }
  Object.assign(runtimeOptions, nextOptions)
  return runtimeOptions
}

const runtimeOptionsRevision = ref(0)
const runtimeStructuralSignature = computed(() => String(runtimeOptionsRevision.value))
let deferredRuntimeOptionsRecreation = false

watch(
  () => [props.codeBlockOptions, props.showLineNumbers] as const,
  () => {
    runtimeOptionsRevision.value += 1
    if (props.stream === false && props.loading !== false)
      deferredRuntimeOptionsRecreation = true
    const configuredFontSize = resolvedCodeBlockOptions.value.fontSize
    if (typeof configuredFontSize === 'number') {
      defaultCodeFontSize.value = configuredFontSize
      codeFontSize.value = configuredFontSize
    }
    else {
      defaultCodeFontSize.value = defaultPreFallbackFontSize
      codeFontSize.value = defaultPreFallbackFontSize
    }
  },
  { deep: true },
)

// Runtime options are fixed in 2.0.0; the editor
// simply receives the latest computed defaults.
watch(
  () => [viewportReady.value],
  () => {
    syncRuntimeOptions()
    if (!createEditor || !viewportReady.value)
      return

    const ed = isDiff.value ? getDiffEditorView() : getEditorView()
    const applying = Number.isFinite(codeFontSize.value) ? (codeFontSize.value as number) : undefined
    if (typeof applying === 'number' && Number.isFinite(applying) && applying > 0) {
      ed?.updateOptions?.({ fontSize: applying })
    }
    scheduleEditorVisualSync()
  },
  { deep: true },
)

watch(
  () => [
    props.isDark,
    props.darkTheme,
    props.lightTheme,
    props.themes,
    props.theme,
    runtimeReady.value,
    editorCreated.value,
    viewportReady.value,
  ] as const,
  () => {
    if (!runtimeReady.value)
      return
    themeUpdate()
  },
  { flush: 'post' },
)

watch(
  () => [runtimeStructuralSignature.value, runtimeReady.value, viewportReady.value] as const,
  async ([nextSignature, ready, visible], [prevSignature]) => {
    syncRuntimeOptions()
    if (!ready || !visible)
      return
    if (!createEditor || !codeEditor.value)
      return
    if (!editorCreated.value)
      return
    if (nextSignature === prevSignature)
      return
    if (props.stream === false && props.loading !== false) {
      deferredRuntimeOptionsRecreation = true
      return
    }
    deferredRuntimeOptionsRecreation = false

    try {
      editorCreated.value = false
      editorCreationGeneration += 1
      createEditorPromise = null
      safeClean()
      if (createRuntimeHelpersFactory)
        initializeRuntimeHelpers(createRuntimeHelpersFactory)
      await nextTick()
      await ensureEditorCreation(codeEditor.value as HTMLElement)
    }
    catch {
      editorCreated.value = false
    }
  },
  { flush: 'post' },
)

watch(
  () => [props.loading, viewportReady.value] as const,
  async ([loading, visible]) => {
    if (loading !== false || !visible || !deferredRuntimeOptionsRecreation)
      return
    deferredRuntimeOptionsRecreation = false
    syncRuntimeOptions()
    await nextTick()
    if (!createEditor || !codeEditor.value || !editorCreated.value)
      return
    try {
      editorCreated.value = false
      editorCreationGeneration += 1
      createEditorPromise = null
      safeClean()
      if (createRuntimeHelpersFactory)
        initializeRuntimeHelpers(createRuntimeHelpersFactory)
      await nextTick()
      await ensureEditorCreation(codeEditor.value as HTMLElement)
    }
    catch {
      editorCreated.value = false
    }
  },
  { flush: 'post' },
)

// 当 loading 变为 false 时：计算并缓存一次展开高度，随后停止观察

const stopLoadingWatch = watch(
  () => [props.loading, viewportReady.value],
  async ([loaded, visible]) => {
    if (!visible)
      return
    if (loaded)
      return
    await nextTick()
    safeRaf(() => {
      if (!isCollapsed.value) {
        if (isExpanded.value)
          updateExpandedHeight()
        else
          updateCollapsedHeight()
      }
      stopLoadingWatch()
    })
    stopExpandAutoResize()
  },
  { immediate: true, flush: 'post' },
)

function stopExpandAutoResize() {
  if (expandRafId != null) {
    safeCancelRaf(expandRafId)
    expandRafId = null
  }
}

onUnmounted(() => {
  isUnmounted = true
  editorCreationGeneration += 1
  createEditorPromise = null
  // Ensure any RAF loops are stopped and editor resources are released
  stopExpandAutoResize()
  if (deferredEditorVisualSyncRafId != null) {
    safeCancelRaf(deferredEditorVisualSyncRafId)
    deferredEditorVisualSyncRafId = null
  }
  cleanupEditor()

  if (resizeSyncHandler) {
    try {
      if (typeof window !== 'undefined')
        window.removeEventListener('resize', resizeSyncHandler)
    }
    catch {}
    resizeSyncHandler = null
  }
})
</script>

<template>
  <PreCodeNode
    v-if="usePreCodeRender"
    class="code-pre-fallback"
    :node="node"
    :show-line-numbers="effectiveShowLineNumbers"
    :diff-inline="preFallbackDiffInline"
    :style="preFallbackStyle"
  />
  <div
    v-else
    ref="container"
    :style="containerStyle"
    data-markstream-code-block="1"
    :data-markstream-enhanced="editorReady ? 'true' : 'false'"
    :data-markstream-enhancement-state="editorReady ? 'ready' : 'pending'"
    class="code-block-container my-4 rounded-lg border overflow-hidden shadow-sm"
    :class="[
      resolvedSurfaceIsDark ? 'border-gray-700/30 bg-gray-900' : 'border-gray-200 bg-white',
      { 'is-rendering': props.loading, 'is-dark': resolvedSurfaceIsDark, 'is-diff': isDiff, 'is-plain-text': isPlainTextLanguage },
    ]"
  >
    <!-- Configurable header area: consumers may override via named slots -->
    <div
      v-if="props.showHeader"
      class="code-block-header flex justify-between items-center"
      :style="headerStyle"
    >
      <!-- left slot / fallback language label -->
      <slot name="header-left">
        <div class="code-header-main">
          <span class="icon-slot h-4 w-4 flex-shrink-0" v-html="languageIcon" />
          <div class="code-header-copy">
            <div class="code-header-title">
              {{ displayLanguage }}
            </div>
          </div>
        </div>
      </slot>

      <!-- right slot / fallback action buttons -->
      <slot name="header-right">
        <div class="code-header-actions">
          <button
            v-if="props.showCollapseButton"
            type="button"
            class="code-action-btn transition-colors"
            :aria-pressed="isCollapsed"
            @click="toggleHeaderCollapse"
            @mouseenter="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
            @focus="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            <svg :style="{ rotate: isCollapsed ? '0deg' : '90deg' }" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6" /></svg>
          </button>
          <template v-if="props.showFontSizeButtons && props.enableFontSizeControl">
            <button
              type="button"
              class="code-action-btn transition-colors"
              :disabled="Number.isFinite(codeFontSize) ? codeFontSize <= codeFontMin : false"
              @click="decreaseCodeFont()"
              @mouseenter="onBtnHover($event, t('common.decrease') || 'Decrease')"
              @focus="onBtnHover($event, t('common.decrease') || 'Decrease')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14" /></svg>
            </button>
            <button
              type="button"
              class="code-action-btn transition-colors"
              :disabled="!fontBaselineReady || codeFontSize === defaultCodeFontSize"
              @click="resetCodeFont()"
              @mouseenter="onBtnHover($event, t('common.reset') || 'Reset')"
              @focus="onBtnHover($event, t('common.reset') || 'Reset')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></g></svg>
            </button>
            <button
              type="button"
              class="code-action-btn transition-colors"
              :disabled="Number.isFinite(codeFontSize) ? codeFontSize >= codeFontMax : false"
              @click="increaseCodeFont()"
              @mouseenter="onBtnHover($event, t('common.increase') || 'Increase')"
              @focus="onBtnHover($event, t('common.increase') || 'Increase')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-7-7v14" /></svg>
            </button>
          </template>

          <button
            v-if="props.showCopyButton"
            type="button"
            class="code-action-btn transition-colors"
            :aria-label="copyText ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')"
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
            v-if="props.showExpandButton"
            type="button"
            class="code-action-btn transition-colors"
            :aria-pressed="isExpanded"
            @click="toggleExpand($event)"
            @mouseenter="onBtnHover($event, isExpanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))"
            @focus="onBtnHover($event, isExpanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            <svg v-if="isExpanded" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" /></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6" /></svg>
          </button>

          <button
            v-if="isPreviewable && props.showPreviewButton"
            type="button"
            class="code-action-btn transition-colors"
            :aria-label="t('common.preview') || 'Preview'"
            @click="previewCode"
            @mouseenter="onBtnHover($event, t('common.preview') || 'Preview')"
            @focus="onBtnHover($event, t('common.preview') || 'Preview')"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"><!-- Icon from Freehand free icons by Streamline - https://creativecommons.org/licenses/by/4.0/ --><g fill="currentColor" fill-rule="evenodd" clip-rule="evenodd"><path d="M23.628 7.41c-.12-1.172-.08-3.583-.9-4.233c-1.921-1.51-6.143-1.11-8.815-1.19c-3.481-.15-7.193.14-10.625.24a.34.34 0 0 0 0 .67c3.472-.05 7.074-.29 10.575-.09c2.471.15 6.653-.14 8.254 1.16c.4.33.41 2.732.49 3.582a42 42 0 0 1 .08 9.005a13.8 13.8 0 0 1-.45 3.001c-2.42 1.4-19.69 2.381-20.72.55a21 21 0 0 1-.65-4.632a41.5 41.5 0 0 1 .12-7.964c.08 0 7.334.33 12.586.24c2.331 0 4.682-.13 6.764-.21a.33.33 0 0 0 0-.66c-7.714-.16-12.897-.43-19.31.05c.11-1.38.48-3.922.38-4.002a.3.3 0 0 0-.42 0c-.37.41-.29 1.77-.36 2.251s-.14 1.07-.2 1.6a45 45 0 0 0-.36 8.645a21.8 21.8 0 0 0 .66 5.002c1.46 2.702 17.248 1.461 20.95.43c1.45-.4 1.69-.8 1.871-1.95c.575-3.809.602-7.68.08-11.496" /><path d="M4.528 5.237a.84.84 0 0 0-.21-1c-.77-.41-1.71.39-1 1.1a.83.83 0 0 0 1.21-.1m2.632-.25c.14-.14.19-.84-.2-1c-.77-.41-1.71.39-1 1.09a.82.82 0 0 0 1.2-.09m2.88 0a.83.83 0 0 0-.21-1c-.77-.41-1.71.39-1 1.09a.82.82 0 0 0 1.21-.09m-4.29 8.735c0 .08.23 2.471.31 2.561a.371.371 0 0 0 .63-.14c0-.09 0 0 .15-1.72a10 10 0 0 0-.11-2.232a5.3 5.3 0 0 1-.26-1.37a.3.3 0 0 0-.54-.24a6.8 6.8 0 0 0-.2 2.33c-1.281-.38-1.121.13-1.131-.42a15 15 0 0 0-.19-1.93c-.16-.17-.36-.17-.51.14a20 20 0 0 0-.43 3.471c.04.773.18 1.536.42 2.272c.26.4.7.22.7-.1c0-.09-.16-.09 0-1.862c.06-1.18-.23-.3 1.16-.76m5.033-2.552c.32-.07.41-.28.39-.37c0-.55-3.322-.34-3.462-.24s-.2.18-.18.28s0 .11 0 .16a3.8 3.8 0 0 0 1.591.361v.82a15 15 0 0 0-.13 3.132c0 .2-.09.94.17 1.16a.34.34 0 0 0 .48 0c.125-.35.196-.718.21-1.09a8 8 0 0 0 .14-3.232c0-.13.05-.7-.1-.89a8 8 0 0 0 .89-.09m5.544-.181a.69.69 0 0 0-.89-.44a2.8 2.8 0 0 0-1.252 1.001a2.3 2.3 0 0 0-.41-.83a1 1 0 0 0-1.6.27a7 7 0 0 0-.35 2.07c0 .571 0 2.642.06 2.762c.14 1.09 1 .51.63.13a17.6 17.6 0 0 1 .38-3.962c.32-1.18.32.2.39.51s.11 1.081.73 1.081s.48-.93 1.401-1.78q.075 1.345 0 2.69a15 15 0 0 0 0 1.811a.34.34 0 0 0 .68 0q.112-.861.11-1.73a16.7 16.7 0 0 0 .12-3.582m1.441-.201c-.05.16-.3 3.002-.31 3.202a6.3 6.3 0 0 0 .21 1.741c.33 1 1.21 1.07 2.291.82a3.7 3.7 0 0 0 1.14-.23c.21-.22.10-.59-.41-.64q-.817.096-1.64.07c-.44-.07-.34 0-.67-4.442q.015-.185 0-.37a.316.316 0 0 0-.23-.38a.316.316 0 0 0-.38.23" /></g></svg>
          </button>
        </div>
      </slot>
    </div>
    <div v-show="!isCollapsed && (stream ? true : !loading)" class="code-editor-layer">
      <div
        ref="codeEditor"
        class="code-editor-container"
        :class="[stream ? '' : 'code-height-placeholder']"
        :style="codeEditorContainerStyle"
        :data-markstream-host-hidden="!editorReady ? 'true' : undefined"
        :aria-hidden="editorReady ? undefined : 'true'"
      />
      <PreCodeNode
        v-if="!editorReady"
        class="code-pre-fallback"
        :node="node"
        :show-line-numbers="effectiveShowLineNumbers"
        :diff-inline="preFallbackDiffInline"
        :style="preFallbackStyle"
      />
    </div>
    <HtmlPreviewFrame
      v-if="showInlinePreview && !hasPreviewListener && isPreviewable && codeLanguage === 'html'"
      :code="node.code"
      :html-preview-allow-scripts="props.htmlPreviewAllowScripts"
      :html-preview-sandbox="props.htmlPreviewSandbox"
      :is-dark="props.isDark"
      :on-close="() => (showInlinePreview = false)"
    />
    <!-- Loading placeholder (non-streaming mode) can be overridden via slot -->
    <div v-show="!stream && loading" class="code-loading-placeholder">
      <slot name="loading" :loading="loading" :stream="stream">
        <div class="loading-skeleton">
          <div class="skeleton-line" />
          <div class="skeleton-line" />
          <div class="skeleton-line short" />
        </div>
      </slot>
    </div>
    <!-- Teleported tooltip removed: using singleton composable instead -->
    <!-- Copy status for screen readers -->
    <span class="sr-only" aria-live="polite" role="status">{{ copyText ? t('common.copied') || 'Copied' : '' }}</span>
  </div>
</template>

<style scoped>
.code-block-container {
  contain: content;
  /* A fixed intrinsic height briefly collapses visible code blocks to 180px on
     refresh before their Pre/editor geometry is measured. Keep code blocks in
     normal layout; outer node virtualization already handles offscreen cost. */
  content-visibility: visible;
  contain-intrinsic-size: auto;
  container-type: inline-size;
  --markstream-code-fallback-bg: var(--code-bg, #fff);
  --markstream-code-fallback-fg: var(--code-fg, hsl(0 0% 10%));
  --markstream-code-border-color: rgb(229 231 235);
  --vscode-editor-selectionBackground: var(--markstream-code-fallback-selection-bg);
  --markstream-code-fallback-selection-bg: rgba(0, 0, 0, 0.06);
  --markstream-diff-frame-border: rgb(203 213 225 / 0.56);
  --markstream-diff-frame-shadow: 0 16px 40px -32px rgb(15 23 42 / 0.18);
  --markstream-diff-shell-fg: #0f172a;
  --markstream-diff-shell-muted: #64748b;
  --markstream-diff-shell-border: rgb(148 163 184 / 0.18);
  --markstream-diff-shell-shadow: 0 30px 70px -48px rgb(15 23 42 / 0.42);
  --markstream-diff-shell-bg: radial-gradient(
      circle at top center,
      rgb(255 255 255 / 0.9),
      transparent 55%
    ),
    linear-gradient(180deg, #fffdfa 0%, #fbfcfe 100%);
  --markstream-diff-header-border: rgb(226 232 240 / 0.92);
  --markstream-diff-stage-bg: radial-gradient(
      circle at top center,
      rgb(255 255 255 / 0.95),
      transparent 60%
    ),
    linear-gradient(180deg, #fcfdff 0%, #f6f8fb 100%);
  --markstream-diff-editor-bg: #ffffff;
  --markstream-diff-editor-fg: #435266;
  --markstream-diff-unchanged-fg: lab(36.247 0.0071872 -0.000424832);
  --markstream-diff-unchanged-bg: lab(95.9989 0.0180531 -0.0010643);
  --markstream-diff-unchanged-divider: rgb(255 255 255 / 0.94);
  --markstream-diff-focus: rgb(14 165 233 / 0.42);
  --markstream-diff-widget-shadow: rgb(15 23 42 / 0.26);
  --markstream-diff-action-hover: rgb(15 23 42 / 0.06);
  --markstream-diff-panel-bg: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
  --markstream-diff-panel-bg-soft: #ffffff;
  --markstream-diff-panel-bg-strong: #ffffff;
  --markstream-diff-panel-border: rgb(226 232 240 / 0.3);
  --markstream-diff-pane-divider: rgb(226 232 240 / 0.42);
  --markstream-diff-gutter-bg: transparent;
  --markstream-diff-gutter-guide: transparent;
  --markstream-diff-gutter-gap: 16px;
  --markstream-diff-line-number: rgb(82 82 82 / 0.88);
  --markstream-diff-line-number-active: rgb(82 82 82 / 0.88);
  --markstream-diff-added-fg: #14b8a6;
  --markstream-diff-removed-fg: #ff3658;
  --markstream-diff-added-line: rgb(232 249 245 / 0.98);
  --markstream-diff-removed-line: rgb(255 241 241 / 0.98);
  --markstream-diff-added-inline: rgb(197 245 219 / 0.96);
  --markstream-diff-removed-inline: rgb(255 215 217 / 0.92);
  --markstream-diff-added-inline-border: transparent;
  --markstream-diff-removed-inline-border: transparent;
  --markstream-diff-added-gutter: linear-gradient(
    90deg,
    var(--markstream-diff-added-fg) 0 4px,
    rgb(20 184 166 / 0.08) 4px 100%
  );
  --markstream-diff-removed-gutter: repeating-linear-gradient(
        180deg,
        var(--markstream-diff-removed-fg) 0 2px,
        transparent 2px 4px
      )
      left / 4px 100% no-repeat,
    linear-gradient(90deg, rgb(255 54 88 / 0.08) 0 100%);
  --markstream-diff-added-line-fill: rgb(231 248 244 / 0.96);
  --markstream-diff-removed-line-fill: rgb(255 241 241 / 0.98);
}

.code-block-container.is-dark {
  --markstream-code-fallback-bg: #111827;
  --markstream-code-fallback-fg: var(--code-fg, hsl(0 0% 93%));
  --markstream-code-border-color: rgb(55 65 81 / 0.3);
  --markstream-code-fallback-selection-bg: rgba(255, 255, 255, 0.08);
  --markstream-diff-frame-border: rgb(82 82 91 / 0.56);
  --markstream-diff-frame-shadow: 0 18px 40px -30px rgb(0 0 0 / 0.84);
  --markstream-diff-shell-fg: #e2e8f0;
  --markstream-diff-shell-muted: #94a3b8;
  --markstream-diff-shell-border: rgb(82 82 91 / 0.56);
  --markstream-diff-shell-shadow: 0 34px 80px -52px rgb(0 0 0 / 0.72);
  --markstream-diff-shell-bg: rgb(10 10 11 / 0.99);
  --markstream-diff-header-border: rgb(63 63 70 / 0.82);
  --markstream-diff-stage-bg: rgb(10 10 11 / 0.99);
  --markstream-diff-editor-bg: rgb(12 12 14 / 0.99);
  --markstream-diff-editor-fg: #b6c2d3;
  --markstream-diff-unchanged-fg: #cbd5e1;
  --markstream-diff-unchanged-bg: rgb(24 24 27 / 0.92);
  --markstream-diff-unchanged-divider: rgb(255 255 255 / 0.18);
  --markstream-diff-focus: rgb(96 165 250 / 0.42);
  --markstream-diff-widget-shadow: rgb(0 0 0 / 0.72);
  --markstream-diff-action-hover: rgb(255 255 255 / 0.08);
  --markstream-diff-panel-bg: rgb(10 10 11 / 0.99);
  --markstream-diff-panel-bg-soft: rgb(10 10 11 / 0.99);
  --markstream-diff-panel-bg-strong: rgb(10 10 11 / 0.99);
  --markstream-diff-panel-border: rgb(82 82 91 / 0.3);
  --markstream-diff-pane-divider: rgb(82 82 91 / 0.34);
  --markstream-diff-gutter-bg: linear-gradient(
    180deg,
    rgb(13 13 15 / 0.94) 0%,
    rgb(9 9 10 / 0.98) 100%
  );
  --markstream-diff-gutter-guide: rgb(161 161 170 / 0.08);
  --markstream-diff-gutter-gap: 16px;
  --markstream-diff-line-number: rgb(161 161 170 / 0.68);
  --markstream-diff-line-number-active: rgb(228 228 231 / 0.82);
  --markstream-diff-added-fg: #5eead4;
  --markstream-diff-removed-fg: #fda4af;
  --markstream-diff-added-line: rgb(13 148 136 / 0.18);
  --markstream-diff-removed-line: rgb(225 29 72 / 0.18);
  --markstream-diff-added-inline: rgb(45 212 191 / 0.24);
  --markstream-diff-removed-inline: rgb(251 113 133 / 0.24);
  --markstream-diff-added-inline-border: transparent;
  --markstream-diff-removed-inline-border: transparent;
  --markstream-diff-added-gutter: linear-gradient(
    90deg,
    var(--markstream-diff-added-fg) 0 4px,
    rgb(94 234 212 / 0.2) 4px 100%
  );
  --markstream-diff-removed-gutter: repeating-linear-gradient(
        180deg,
        var(--markstream-diff-removed-fg) 0 2px,
        transparent 2px 4px
      )
      left / 4px 100% no-repeat,
    linear-gradient(90deg, rgb(253 164 175 / 0.18) 0 100%);
  --markstream-diff-added-line-fill: linear-gradient(
    90deg,
    rgb(15 118 110 / 0.38) 0%,
    rgb(13 148 136 / 0.28) 100%
  );
  --markstream-diff-removed-line-fill: linear-gradient(
    90deg,
    rgb(159 18 57 / 0.38) 0%,
    rgb(225 29 72 / 0.28) 100%
  );
}

.code-editor-container {
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  transition: none;
}

.code-block-header {
  box-sizing: content-box;
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ms-gap-header, 1rem);
  min-height: 1.75rem;
  padding: var(--ms-inset-panel-y, 0.375rem) var(--ms-inset-panel-x, 0.625rem);
  border-bottom: 1px solid var(--code-border, var(--markstream-code-border-color, rgb(229 231 235)));
  border-radius: var(--ms-radius, 0) var(--ms-radius, 0) 0 0;
  background: var(--code-header-bg, transparent);
  color: var(--code-fg, inherit);
  font-family: var(--ms-font-sans, ui-sans-serif, system-ui, sans-serif);
  line-height: 1.75;
}

.code-header-main {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: var(--ms-gap-header-main, 0.625rem);
  overflow: hidden;
}

.code-header-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.code-header-title {
  overflow: hidden;
  color: var(--code-action-fg, hsl(0 0% 43%));
  font-family: inherit;
  font-size: var(--ms-text-label, 0.75rem);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-header-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ms-gap-header-actions, 0.125rem);
  margin-left: auto;
}

.code-block-header .code-action-btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: var(--ms-action-btn-padding, 0.375rem);
  border-radius: 0.25rem;
  color: var(--code-action-fg, inherit);
  line-height: 1;
}

.code-block-header .code-action-btn:hover {
  background: var(--code-action-hover-bg);
  color: var(--code-action-hover-fg);
}

.code-block-header .action-icon {
  width: var(--ms-action-btn-icon, 0.875rem);
  height: var(--ms-action-btn-icon, 0.875rem);
  max-width: 1.25rem;
  max-height: 1.25rem;
}

.code-editor-layer {
  position: relative;
  display: grid;
  min-width: 0;
}

.code-editor-layer > .code-editor-container,
.code-editor-layer > pre.code-pre-fallback {
  grid-area: 1 / 1;
}

.code-editor-layer > pre.code-pre-fallback {
  position: relative;
  z-index: 2;
}

.code-editor-container[data-markstream-host-hidden="true"] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100% !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}

pre.code-pre-fallback,
.code-block-container ::v-deep pre.code-pre-fallback {
  box-sizing: border-box;
  width: 100%;
  position: relative;
  margin: 0;
  white-space: pre;
  overflow: auto;
  padding-left: var(--markstream-code-padding-left, 52px);
  background: var(--markstream-code-fallback-bg, #ffffff);
  color: var(--markstream-code-fallback-fg, #111827);
  font-size: var(--vscode-editor-font-size, 12px);
  line-height: var(--vscode-editor-line-height, 18px);
  font-family: var(
    --markstream-code-font-family,
    "SF Mono",
    Monaco,
    Consolas,
    "Ubuntu Mono",
    "Liberation Mono",
    "Courier New",
    monospace
  );
  font-weight: 400;
}

.code-block-container ::v-deep pre.code-pre-fallback.markstream-pre--line-numbers:not(.markstream-pre--diff-preview) > .markstream-pre__code {
  padding-left: 0;
}

pre.code-pre-fallback.markstream-pre--diff-preview,
.code-block-container ::v-deep pre.code-pre-fallback.markstream-pre--diff-preview {
  padding-left: 0;
  padding-right: 0;
  background: var(--markstream-diff-editor-bg);
  color: var(--markstream-diff-editor-fg);
}

.code-block-container.is-diff .code-block-header {
  padding: 18px 20px 14px;
  color: var(--markstream-diff-shell-fg);
  background: transparent;
  border-bottom-color: var(--markstream-diff-header-border);
}

.code-block-container.is-diff {
  background: var(--markstream-diff-shell-bg);
  box-shadow: var(--markstream-diff-shell-shadow);
  border-color: var(--markstream-diff-shell-border);
  --vscode-editor-selectionBackground: var(--markstream-diff-action-hover);
}

.code-block-container.is-diff .code-editor-layer {
  padding: 4px 4px 8px;
  background: var(--markstream-diff-stage-bg);
  --vscode-editor-background: var(--markstream-diff-editor-bg);
  --vscode-editor-foreground: var(--markstream-diff-editor-fg);
  --vscode-diffEditor-unchangedRegionForeground: var(--markstream-diff-unchanged-fg);
  --vscode-diffEditor-unchangedRegionBackground: var(--markstream-diff-unchanged-bg);
  --vscode-focusBorder: var(--markstream-diff-focus);
  --vscode-widget-shadow: var(--markstream-diff-widget-shadow);
  --vscode-editor-selectionBackground: color-mix(
    in srgb,
    var(--markstream-diff-editor-bg) 90%,
    var(--markstream-diff-editor-fg) 10%
  );
}

.code-block-container.is-rendering .code-height-placeholder {
  position: relative;
  overflow: hidden;
  min-height: 120px;
  background: rgba(0,0,0,0.04);
}

.code-block-container.is-rendering .code-height-placeholder::before {
  content: '';
  position: absolute;
  inset-block: 0;
  left: -300%;
  width: 400%;
  background: linear-gradient(90deg, rgba(0,0,0,0.04) 25%, rgba(0,0,0,0.08) 37%, rgba(0,0,0,0.04) 63%);
  animation: code-skeleton-shimmer 1.2s ease-in-out infinite;
}

/* Loading placeholder styles */
.code-loading-placeholder {
  padding: 1rem;
  min-height: 120px;
}

.loading-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.skeleton-line {
  position: relative;
  overflow: hidden;
  height: 1rem;
  border-radius: 0.25rem;
  background: rgba(0,0,0,0.06);
}

.skeleton-line::before {
  content: '';
  position: absolute;
  inset-block: 0;
  left: -300%;
  width: 400%;
  background: linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.12) 37%, rgba(0,0,0,0.06) 63%);
  animation: code-skeleton-shimmer 1.2s ease-in-out infinite;
}

.code-block-container.is-dark .skeleton-line {
  background: rgba(255,255,255,0.06);
}

.code-block-container.is-dark .skeleton-line::before {
  background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.06) 63%);
}

.skeleton-line.short {
  width: 60%;
}

@keyframes code-skeleton-shimmer {
  from { transform: translateX(0); }
  to { transform: translateX(75%); }
}

@media (prefers-reduced-motion: reduce) {
  .code-block-container.is-rendering .code-height-placeholder::before,
  .skeleton-line::before {
    animation: none !important;
  }
}

.code-action-btn {
  cursor: pointer;
  opacity: 1;
  font-family: inherit;
}

.code-block-container.is-diff .icon-slot {
  width: 28px;
  height: 28px;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.7);
  padding: 5px;
  color: var(--markstream-diff-added-fg);
}

.code-block-container.is-diff.is-dark .icon-slot {
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.08),
    0 12px 28px -20px rgb(56 189 248 / 0.45);
}

.code-action-btn:active {
  transform: scale(0.98);
}

.code-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.code-action-btn:disabled:hover {
  background-color: transparent;
}

/* Ensure injected icons align consistently whether img or inline svg */
.icon-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.icon-slot ::v-deep svg,
.icon-slot ::v-deep img {
  display: block;
  width: 100%;
  height: 100%;
}

@container (max-width: 640px) {
  .code-block-container.is-diff .code-block-header {
    padding: 16px 16px 12px;
  }

  .code-block-container.is-diff .code-editor-layer {
    padding: 4px 4px 8px;
  }
}
</style>
