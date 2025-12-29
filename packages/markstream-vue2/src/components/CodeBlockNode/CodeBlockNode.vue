<script setup lang="ts">
// Avoid static import of `stream-monaco` for types so the runtime bundle
// doesn't get a reference. Define minimal local types we need here.
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onUnmounted, ref, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
// Tooltip is provided as a singleton via composable to avoid many DOM nodes
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { useViewportPriority } from '../../composables/viewportPriority'
import { getLanguageIcon, languageMap, normalizeLanguageIdentifier, resolveMonacoLanguageId } from '../../utils'
import { safeCancelRaf, safeRaf } from '../../utils/safeRaf'
import PreCodeNode from '../PreCodeNode'
import HtmlPreviewFrame from './HtmlPreviewFrame.vue'
import { getUseMonaco } from './monaco'

const props = defineProps({
  node: { type: Object, required: true },
  isDark: { type: Boolean, default: false },
  loading: { type: Boolean, default: true },
  stream: { type: Boolean, default: true },
  darkTheme: { type: [Object, String], default: undefined },
  lightTheme: { type: [Object, String], default: undefined },
  isShowPreview: { type: Boolean, default: true },
  monacoOptions: { type: Object, default: undefined },
  enableFontSizeControl: { type: Boolean, default: true },
  minWidth: { type: [String, Number], default: undefined },
  maxWidth: { type: [String, Number], default: undefined },
  themes: { type: Array, default: undefined },
  // Header configuration: allow consumers to toggle built-in buttons and header visibility
  showHeader: { type: Boolean, default: true },
  showCopyButton: { type: Boolean, default: true },
  showExpandButton: { type: Boolean, default: true },
  showPreviewButton: { type: Boolean, default: true },
  showFontSizeButtons: { type: Boolean, default: true },
  customId: { type: String, default: undefined },
})

const emits = defineEmits(['previewCode', 'copy'])

// Chrome warns when Monaco registers non-passive touchstart listeners.
// Patch the editor host so touch handlers default to passive for Monaco roots.
const MONACO_TOUCH_PATCH_FLAG = '__markstreamMonacoPassiveTouch__'

if (typeof window !== 'undefined')
  ensureMonacoPassiveTouchListeners()

function ensureMonacoPassiveTouchListeners() {
  try {
    const globalObj = window as any
    if (globalObj[MONACO_TOUCH_PATCH_FLAG])
      return
    const proto = window.Element?.prototype
    const nativeAdd = proto?.addEventListener
    if (!proto || !nativeAdd)
      return
    proto.addEventListener = function patchedMonacoTouchStart(
      this: Element,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === 'touchstart' && shouldForcePassiveForMonaco(this, options))
        return nativeAdd.call(this, type, listener, withPassiveOptions(options))
      return nativeAdd.call(this, type, listener, options)
    }
    globalObj[MONACO_TOUCH_PATCH_FLAG] = true
  }
  catch {}
}

function shouldForcePassiveForMonaco(target: EventTarget | null, options?: boolean | AddEventListenerOptions) {
  if (!target)
    return false
  const el = target as Element
  if (typeof el.closest !== 'function')
    return false
  if (!el.closest('.monaco-editor, .monaco-diff-editor'))
    return false
  if (options && typeof options === 'object' && 'passive' in options)
    return false
  return true
}

function withPassiveOptions(options?: boolean | AddEventListenerOptions): AddEventListenerOptions {
  if (options == null)
    return { passive: true }
  if (typeof options === 'boolean')
    return { capture: options, passive: true }
  if (typeof options === 'object') {
    if ('passive' in options)
      return options
    return { ...options, passive: true }
  }
  return { passive: true }
}

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
const monacoLanguage = computed(() => resolveMonacoLanguageId(codeLanguage.value))
const isExpanded = ref(false)
const isCollapsed = ref(false)
const editorCreated = ref(false)
const monacoReady = ref(false)
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

// Lazy-load `stream-monaco` helpers at runtime so consumers who don't install
// `stream-monaco` won't have the editor code bundled. We provide safe no-op
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
let createEditorPromise: Promise<void> | null = null
let detectLanguage: (code: string) => string = () => String(props.node.language ?? 'plaintext')
let setTheme: (theme: any) => Promise<void> = async () => {}
const isDiff = computed(() => props.node.diff)
const usePreCodeRender = ref(false)
const showInlinePreview = ref(false)
const isDevEnv = typeof import.meta !== 'undefined' && Boolean((import.meta as any).env?.DEV)
// Defer client-only editor initialization to the browser to avoid SSR errors
if (typeof window !== 'undefined') {
  ;(async () => {
    try {
      const mod = await getUseMonaco()
      // If mod is null, stream-monaco is not available
      if (!mod) {
        // Only log warning in development mode
        if (isDevEnv) {
          console.warn('[markstream-vue] stream-monaco is not installed. Code blocks will use basic rendering. Install stream-monaco for enhanced code editor features.')
        }
        usePreCodeRender.value = true
        return
      }
      // `useMonaco` and `detectLanguage` should be available
      const useMonaco = (mod as any).useMonaco
      const det = (mod as any).detectLanguage
      if (typeof det === 'function')
        detectLanguage = det
      if (typeof useMonaco === 'function') {
        const theme = getPreferredColorScheme()
        if (theme && props.themes && Array.isArray(props.themes) && !props.themes.includes(theme)) {
          throw new Error('Preferred theme not in provided themes array')
        }
        const helpers = useMonaco({
          wordWrap: 'on',
          wrappingIndent: 'same',
          themes: props.themes,
          theme,
          ...(props.monacoOptions || {}),
          onThemeChange() {
            syncEditorCssVars()
          },
        })
        createEditor = helpers.createEditor || createEditor
        createDiffEditor = helpers.createDiffEditor || createDiffEditor
        updateCode = helpers.updateCode || updateCode
        updateDiffCode = helpers.updateDiff || updateDiffCode
        getEditor = helpers.getEditor || getEditor
        getEditorView = helpers.getEditorView || getEditorView
        getDiffEditorView = helpers.getDiffEditorView || getDiffEditorView
        cleanupEditor = helpers.cleanupEditor || cleanupEditor
        safeClean = helpers.safeClean || helpers.cleanupEditor || safeClean
        setTheme = helpers.setTheme || setTheme
        monacoReady.value = true

        if (codeEditor.value)
          await ensureEditorCreation(codeEditor.value as HTMLElement)
      }
    }
    catch (err) {
      // Only log warning in development mode
      if (isDevEnv) {
        console.warn('[markstream-vue] Failed to initialize Monaco editor:', err)
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
  typeof props.monacoOptions?.fontSize === 'number' ? props.monacoOptions!.fontSize : Number.NaN,
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

function measureLineHeightFromDom(): number | null {
  try {
    const root = codeEditor.value as HTMLElement | null
    if (!root)
      return null
    const lineEl = root.querySelector('.view-lines .view-line') as HTMLElement | null
    if (lineEl) {
      const h = Math.ceil(lineEl.getBoundingClientRect().height)
      if (h > 0)
        return h
    }
  }
  catch {}
  return null
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
  try {
    const root = codeEditor.value as HTMLElement | null
    if (root) {
      const lineEl = root.querySelector('.view-lines .view-line') as HTMLElement | null
      if (lineEl) {
        try {
          if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            const fs = window.getComputedStyle(lineEl).fontSize
            const m = fs && fs.match(/^(\d+(?:\.\d+)?)/)
            if (m)
              return Number.parseFloat(m[1])
          }
        }
        catch {}
      }
    }
  }
  catch {}
  return null
}

function getLineHeightSafe(editor: any): number {
  try {
    const monacoEditor = getEditor()
    const key = monacoEditor?.EditorOption?.lineHeight
    if (key != null) {
      const v = editor?.getOption?.(key)
      if (typeof v === 'number' && v > 0)
        return v
    }
  }
  catch {}

  const domH = measureLineHeightFromDom()
  if (domH && domH > 0)
    return domH
  const fs = Number.isFinite(codeFontSize.value) && codeFontSize.value! > 0 ? (codeFontSize.value as number) : 12
  // Conservative fallback close to Monaco's default ratio
  return Math.max(12, Math.round(fs * 1.35))
}
function ensureFontBaseline() {
  if (Number.isFinite(codeFontSize.value) && (codeFontSize.value as number) > 0 && Number.isFinite(defaultCodeFontSize.value))
    return codeFontSize.value as number
  const actual = readActualFontSizeFromEditor()
  if (typeof props.monacoOptions?.fontSize === 'number') {
    defaultCodeFontSize.value = props.monacoOptions.fontSize
    codeFontSize.value = props.monacoOptions.fontSize
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

function computeContentHeight(): number | null {
  // Prefer Monaco's contentHeight when available; fallback to lineCount * lineHeight
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

// Copy computed CSS variables from the editor DOM up to the component root so
// the header (which lives alongside the editor but outside its inner DOM)
// can use variables like --vscode-editor-foreground / --vscode-editor-background.
function syncEditorCssVars() {
  const editorEl = codeEditor.value as HTMLElement | null
  const rootEl = container.value as HTMLElement | null
  if (!editorEl || !rootEl)
    return
    // Monaco usually applies theme variables on an element with class
    // 'monaco-editor' or on the editor root; try to read from either.
  const src = editorEl.querySelector('.monaco-editor') || editorEl
  let styles: CSSStyleDeclaration | null = null
  try {
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      styles = window.getComputedStyle(src as Element)
    }
  }
  catch {
    styles = null
  }
  const fg = String(styles?.getPropertyValue('--vscode-editor-foreground') ?? '')
  const bg = String(styles?.getPropertyValue('--vscode-editor-background') ?? '')
  const hoverBg = String(styles?.getPropertyValue('--vscode-editor-hoverHighlightBackground') ?? '')
  if (fg && bg) {
    rootEl.style.setProperty('--vscode-editor-foreground', fg.trim())
    rootEl.style.setProperty('--vscode-editor-background', bg.trim())
    rootEl.style.setProperty('--vscode-editor-selectionBackground', hoverBg.trim())
    return true
  }
}

let resizeSyncHandler: (() => void) | null = null

function updateExpandedHeight() {
  try {
    const container = codeEditor.value
    if (!container)
      return

    // 保存当前滚动位置（相对于容器顶部的距离）
    const containerRect = container.getBoundingClientRect()
    const scrollAnchor = window.scrollY + containerRect.top

    const h = computeContentHeight()
    if (h != null && h > 0) {
      const oldHeight = containerRect.height
      container.style.height = `${Math.ceil(h)}px`
      container.style.maxHeight = 'none'

      // 恢复滚动位置：补偿高度变化
      const heightDelta = Math.ceil(h) - oldHeight
      if (heightDelta !== 0 && scrollAnchor < window.scrollY) {
        window.scrollBy(0, heightDelta)
      }
    }
  }
  catch {}
}

function updateCollapsedHeight() {
  try {
    const container = codeEditor.value
    if (!container)
      return

    // 保存当前滚动位置（相对于容器顶部的距离）
    const containerRect = container.getBoundingClientRect()
    const scrollAnchor = window.scrollY + containerRect.top
    const oldHeight = containerRect.height

    const max = getMaxHeightValue()
    if (resumeGuardFrames > 0) {
      resumeGuardFrames--
      if (heightBeforeCollapse.value != null) {
        const h = Math.min(heightBeforeCollapse.value, max)
        container.style.height = `${Math.ceil(h)}px`
        container.style.maxHeight = `${Math.ceil(max)}px`
        container.style.overflow = 'auto'

        // 恢复滚动位置
        const heightDelta = Math.ceil(h) - oldHeight
        if (heightDelta !== 0 && scrollAnchor < window.scrollY) {
          window.scrollBy(0, heightDelta)
        }
        return
      }
    }
    const h0 = computeContentHeight()
    // 1) 有实时内容高度 -> 采用并记忆原始内容高度（未裁剪前），用于下一次恢复
    if (h0 != null && h0 > 0) {
      const h = Math.min(h0, max)
      container.style.height = `${Math.ceil(h)}px`
      container.style.maxHeight = `${Math.ceil(max)}px`
      container.style.overflow = 'auto'

      // 恢复滚动位置
      const heightDelta = Math.ceil(h) - oldHeight
      if (heightDelta !== 0 && scrollAnchor < window.scrollY) {
        window.scrollBy(0, heightDelta)
      }
      return
    }

    // 2) 使用折叠前的内容高度（不更新记忆值）
    if (heightBeforeCollapse.value != null) {
      const h = Math.min(heightBeforeCollapse.value, max)
      container.style.height = `${Math.ceil(h)}px`
      container.style.maxHeight = `${Math.ceil(max)}px`
      container.style.overflow = 'auto'

      // 恢复滚动位置
      const heightDelta = Math.ceil(h) - oldHeight
      if (heightDelta !== 0 && scrollAnchor < window.scrollY) {
        window.scrollBy(0, heightDelta)
      }
      return
    }

    // 3) 使用当前 DOM 高度（不更新记忆值）
    const rectH = Math.ceil((container.getBoundingClientRect?.().height) || 0)
    if (rectH > 0) {
      const h = Math.min(rectH, max)
      container.style.height = `${Math.ceil(h)}px`
      container.style.maxHeight = `${Math.ceil(max)}px`
      container.style.overflow = 'auto'

      // 恢复滚动位置
      const heightDelta = Math.ceil(h) - oldHeight
      if (heightDelta !== 0 && scrollAnchor < window.scrollY) {
        window.scrollBy(0, heightDelta)
      }
      return
    }

    // 4) 兜底：若有先前行高/字体，可估一个最小高度；否则保持现状，避免强制跳到 MAX
    const prev = Number.parseFloat(container.style.height)
    if (!Number.isNaN(prev) && prev > 0) {
      const h = Math.ceil(Math.min(prev, max))
      container.style.height = `${h}px`

      // 恢复滚动位置
      const heightDelta = h - oldHeight
      if (heightDelta !== 0 && scrollAnchor < window.scrollY) {
        window.scrollBy(0, heightDelta)
      }
    }
    else {
      // 实在没有历史高度，才退到 max（极少数首次场景）
      const h = Math.ceil(max)
      container.style.height = `${h}px`

      // 恢复滚动位置
      const heightDelta = h - oldHeight
      if (heightDelta !== 0 && scrollAnchor < window.scrollY) {
        window.scrollBy(0, heightDelta)
      }
    }
    container.style.maxHeight = `${Math.ceil(max)}px`
    container.style.overflow = 'auto'
  }
  catch {}
}

function getMaxHeightValue(): number {
  const maxH = props.monacoOptions?.MAX_HEIGHT ?? 500
  if (typeof maxH === 'number')
    return maxH
  const m = String(maxH).match(/^(\d+(?:\.\d+)?)/)
  return m ? Number.parseFloat(m[1]) : 500
}

// Check if the language is previewable (HTML or SVG)
const isPreviewable = computed(() => props.isShowPreview && (codeLanguage.value === 'html' || codeLanguage.value === 'svg'))

// Check if the code block is a Mermaid diagram
const isMermaid = computed(() => codeLanguage.value === 'mermaid')

watch(
  () => props.node.language,
  (newLanguage) => {
    codeLanguage.value = normalizeLanguageIdentifier(newLanguage)
  },
)

watch(
  () => props.node.code,
  async (newCode) => {
    if (props.stream === false)
      return
    if (!codeLanguage.value)
      codeLanguage.value = normalizeLanguageIdentifier(detectLanguage(newCode))

    // If the editor helpers exist but the editor hasn't been created yet,
    // ensure creation first so update calls don't get lost.
    if (createEditor && !editorCreated.value && codeEditor.value) {
      try {
        await ensureEditorCreation(codeEditor.value as HTMLElement)
      }
      catch {}
    }

    if (isDiff.value)
      updateDiffCode(String(props.node.originalCode ?? ''), String(props.node.updatedCode ?? ''), monacoLanguage.value)
    else
      updateCode(newCode, monacoLanguage.value)

    if (isExpanded.value) {
      safeRaf(() => updateExpandedHeight())
    }
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
const languageIcon = computed(() => getLanguageIcon(codeLanguage.value || ''))

// Compute inline style for container to respect optional min/max width
const containerStyle = computed(() => {
  const s: Record<string, string> = {}
  const fmt = (v: string | number | undefined) => {
    if (v == null)
      return undefined
    return typeof v === 'number' ? `${v}px` : String(v)
  }
  const min = fmt(props.minWidth)
  const max = fmt(props.maxWidth)
  if (min)
    s.minWidth = min
  if (max)
    s.maxWidth = max
  return s
})

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
function shouldSkipEventTarget(el: EventTarget | null) {
  const btn = el as HTMLButtonElement | null
  return !btn || btn.disabled
}

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'
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

function toggleExpand() {
  isExpanded.value = !isExpanded.value
  const editor = isDiff.value
    ? getDiffEditorView()
    : getEditorView()
  const container = codeEditor.value
  if (!editor || !container)
    return

  if (isExpanded.value) {
    // Expanded: enable automaticLayout and explicitly size container by lines
    setAutomaticLayout(true)
    container.style.maxHeight = 'none'
    container.style.overflow = 'visible'
    updateExpandedHeight()
  }
  else {
    stopExpandAutoResize()
    setAutomaticLayout(false)
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
    setAutomaticLayout(false)
  }
  else {
    if (isExpanded.value)
      setAutomaticLayout(true)
    if (codeEditor.value && heightBeforeCollapse.value != null) {
      codeEditor.value.style.height = `${heightBeforeCollapse.value}px`
    }
    const ed = isDiff.value ? getDiffEditorView() : getEditorView()
    try {
      ed?.layout?.()
    }
    catch {}
    resumeGuardFrames = 2
    safeRaf(() => {
      if (isExpanded.value)
        updateExpandedHeight()
      else
        updateCollapsedHeight()
    })
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
    // In automaticLayout mode, no manual height updates are needed
    if (isExpanded.value && !isCollapsed.value)
      updateExpandedHeight()
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
      node: props.node,
      artifactType,
      artifactTitle,
      id: `temp-${lowerLang}-${Date.now()}`,
    })
    return
  }

  if (lowerLang === 'html')
    showInlinePreview.value = !showInlinePreview.value
}

function setAutomaticLayout(expanded: boolean) {
  try {
    if (isDiff.value) {
      const diff = getDiffEditorView()
      diff?.updateOptions?.({ automaticLayout: expanded })
    }
    else {
      const ed = getEditorView()
      ed?.updateOptions?.({ automaticLayout: expanded })
    }
  }
  catch {}
}

async function runEditorCreation(el: HTMLElement) {
  if (!createEditor)
    return

  if (isDiff.value) {
    safeClean()
    if (createDiffEditor)
      await createDiffEditor(el as HTMLElement, String(props.node.originalCode ?? ''), String(props.node.updatedCode ?? ''), monacoLanguage.value)
    else
      await createEditor(el as HTMLElement, props.node.code, monacoLanguage.value)
  }
  else {
    await createEditor(el as HTMLElement, props.node.code, monacoLanguage.value)
  }

  const editor = isDiff.value ? getDiffEditorView() : getEditorView()
  if (typeof props.monacoOptions?.fontSize === 'number') {
    editor?.updateOptions({ fontSize: props.monacoOptions.fontSize, automaticLayout: false })
    defaultCodeFontSize.value = props.monacoOptions.fontSize
    codeFontSize.value = props.monacoOptions.fontSize
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
    updateCollapsedHeight()

  if (props.loading === false) {
    await nextTick()
    safeRaf(() => {
      if (isExpanded.value && !isCollapsed.value)
        updateExpandedHeight()
      else if (!isCollapsed.value)
        updateCollapsedHeight()
    })
  }
}

function ensureEditorCreation(el: HTMLElement) {
  if (!createEditor)
    return null
  if (createEditorPromise)
    return createEditorPromise

  editorCreated.value = true
  const pending = (async () => {
    await runEditorCreation(el)
  })()

  createEditorPromise = pending.finally(() => {
    createEditorPromise = null
  })
  return createEditorPromise
}

// 延迟创建编辑器：仅当不是 Mermaid 时才创建，避免无意义的初始化
const stopCreateEditorWatch = watch(
  () => [codeEditor.value, isMermaid.value, isDiff.value, props.stream, props.loading, monacoReady.value, viewportReady.value] as const,
  async ([el, _isMermaid, _isDiff, stream, loading, _monacoReady, visible]) => {
    if (!el || !createEditor)
      return
    if (!visible)
      return

    // If streaming is disabled, defer editor creation until loading is finished
    if (stream === false && loading !== false)
      return

    if (isMermaid.value) {
      cleanupEditor()
      stopCreateEditorWatch()
      return
    }

    const creation = ensureEditorCreation(el as HTMLElement)
    if (!creation)
      return

    await creation

    stopCreateEditorWatch()
  },
)

const watchTheme = watch(
  () => [props.darkTheme, props.lightTheme, editorCreated.value, viewportReady.value],
  () => {
    if (!editorCreated.value || !viewportReady.value)
      return
    if (isMermaid.value) {
      return watchTheme()
    }

    themeUpdate()
  },
)

function getPreferredColorScheme() {
  return props.isDark ? props.darkTheme : props.lightTheme
}

function themeUpdate() {
  const themeToSet: any = getPreferredColorScheme()
  if (themeToSet)
    setTheme(themeToSet)
}

// Watch for monacoOptions changes (deep) and try to update editor options or
// recreate the editor when necessary.
const watchMonacoOptions = watch(
  () => [props.monacoOptions, viewportReady.value],
  () => {
    if (!createEditor || !viewportReady.value)
      return
    if (isMermaid.value) {
      return watchMonacoOptions()
    }

    const ed = isDiff.value ? getDiffEditorView() : getEditorView()
    const applying = typeof props.monacoOptions?.fontSize === 'number'
      ? props.monacoOptions.fontSize
      : (Number.isFinite(codeFontSize.value) ? (codeFontSize.value as number) : undefined)
    if (typeof applying === 'number' && Number.isFinite(applying) && applying > 0) {
      ed?.updateOptions?.({ fontSize: applying })
    }
    if (isExpanded.value && !isCollapsed.value)
      updateExpandedHeight()
    else if (!isCollapsed.value)
      updateCollapsedHeight()
  },
  { deep: true },
)

// 当 loading 变为 false 时：计算并缓存一次展开高度，随后停止观察

const stopLoadingWatch = watch(
  () => [props.loading, viewportReady.value],
  async ([loaded, visible]) => {
    if (!visible)
      return
    if (isMermaid.value) {
      nextTick(() => {
        stopLoadingWatch?.()
      })
      return
    }
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
  // Ensure any RAF loops are stopped and editor resources are released
  stopExpandAutoResize()
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
  <PreCodeNode v-if="usePreCodeRender" :node="node" :loading="props.loading" />
  <div
    v-else
    ref="container"
    :style="containerStyle"
    class="code-block-container my-4 rounded-lg border overflow-hidden shadow-sm"
    :class="[
      props.isDark ? 'border-gray-700/30 bg-gray-900' : 'border-gray-200 bg-white',
      { 'is-rendering': props.loading, 'is-dark': props.isDark },
    ]"
  >
    <!-- Configurable header area: consumers may override via named slots -->
    <div
      v-if="props.showHeader"
      class="code-block-header flex justify-between items-center px-4 py-2.5 border-b border-gray-400/5"
      style="color: var(--vscode-editor-foreground);background-color: var(--vscode-editor-background);"
    >
      <!-- left slot / fallback language label -->
      <slot name="header-left">
        <div class="flex items-center space-x-2 flex-1 overflow-hidden">
          <span class="icon-slot h-4 w-4 flex-shrink-0" v-html="languageIcon" />
          <span class="text-sm font-medium font-mono truncate">{{ displayLanguage }}</span>
        </div>
      </slot>

      <!-- right slot / fallback action buttons -->
      <slot name="header-right">
        <div class="flex items-center space-x-2">
          <button
            type="button"
            class="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
            :aria-pressed="isCollapsed"
            @click="toggleHeaderCollapse"
            @mouseenter="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
            @focus="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            <svg :style="{ rotate: isCollapsed ? '0deg' : '90deg' }" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6" /></svg>
          </button>
          <template v-if="props.showFontSizeButtons && props.enableFontSizeControl">
            <button
              type="button"
              class="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
              :disabled="Number.isFinite(codeFontSize) ? codeFontSize <= codeFontMin : false"
              @click="decreaseCodeFont()"
              @mouseenter="onBtnHover($event, t('common.decrease') || 'Decrease')"
              @focus="onBtnHover($event, t('common.decrease') || 'Decrease')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14" /></svg>
            </button>
            <button
              type="button"
              class="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
              :disabled="!fontBaselineReady || codeFontSize === defaultCodeFontSize"
              @click="resetCodeFont()"
              @mouseenter="onBtnHover($event, t('common.reset') || 'Reset')"
              @focus="onBtnHover($event, t('common.reset') || 'Reset')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></g></svg>
            </button>
            <button
              type="button"
              class="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
              :disabled="Number.isFinite(codeFontSize) ? codeFontSize >= codeFontMax : false"
              @click="increaseCodeFont()"
              @mouseenter="onBtnHover($event, t('common.increase') || 'Increase')"
              @focus="onBtnHover($event, t('common.increase') || 'Increase')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14m-7-7v14" /></svg>
            </button>
          </template>

          <button
            v-if="props.showCopyButton"
            type="button"
            class="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
            :aria-label="copyText ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')"
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
            v-if="props.showExpandButton"
            type="button"
            class="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
            :aria-pressed="isExpanded"
            @click="toggleExpand"
            @mouseenter="onBtnHover($event, isExpanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))"
            @focus="onBtnHover($event, isExpanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            <svg v-if="isExpanded" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6" /></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" /></svg>
          </button>

          <button
            v-if="isPreviewable && props.showPreviewButton"
            type="button"
            class="code-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
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
    <div v-show="!isCollapsed && (stream ? true : !loading)" ref="codeEditor" class="code-editor-container" :class="[stream ? '' : 'code-height-placeholder']" />
    <HtmlPreviewFrame
      v-if="showInlinePreview && !hasPreviewListener && isPreviewable && codeLanguage === 'html'"
      :code="node.code"
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
    /* 新增：显著减少离屏 codeblock 的布局/绘制与样式计算 */
  content-visibility: auto;
  contain-intrinsic-size: 320px 180px;
}

.code-editor-container {
  transition: height 180ms ease, max-height 180ms ease;
}

.code-block-container.is-rendering .code-height-placeholder{
  background-size: 400% 100%;
  animation: code-skeleton-shimmer 1.2s ease-in-out infinite;
  min-height: 120px;
  background: linear-gradient(90deg, rgba(0,0,0,0.04) 25%, rgba(0,0,0,0.08) 37%, rgba(0,0,0,0.04) 63%);
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
  height: 1rem;
  background: linear-gradient(90deg, rgba(0,0,0,0.06) 25%, rgba(0,0,0,0.12) 37%, rgba(0,0,0,0.06) 63%);
  background-size: 400% 100%;
  animation: code-skeleton-shimmer 1.2s ease-in-out infinite;
  border-radius: 0.25rem;
}

.code-block-container.is-dark .skeleton-line {
  background: linear-gradient(90deg, rgba(255,255,255,0.06) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.06) 63%);
  background-size: 400% 100%;
}

.skeleton-line.short {
  width: 60%;
}

@keyframes code-skeleton-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

.code-action-btn {
  font-family: inherit;
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
.icon-slot :deep(svg),
.icon-slot :deep(img) {
  display: block;
  width: 100%;
  height: 100%;
}
:deep(.monaco-diff-editor .diffOverview){
  background-color: var(--vscode-editor-background);
}
</style>
