<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { getLanguageIcon, languageMap } from '../../utils'
import MermaidBlockNode from '../MermaidBlockNode'

const props = withDefaults(
  defineProps<{
    node: {
      type: 'code_block'
      language: string
      code: string
      raw: string
      diff?: boolean
      originalCode?: string
      updatedCode?: string
    }
    loading?: boolean
    /**
     * If true, update and render code content as it streams in.
     * If false, keep a lightweight loading state and create the editor only when loading becomes false.
     */
    stream?: boolean
    darkTheme?: string
    lightTheme?: string
    isDark?: boolean
    isShowPreview?: boolean
    enableFontSizeControl?: boolean
    /** Minimum width for the code block container (px or CSS unit string) */
    minWidth?: string | number
    /** Maximum width for the code block container (px or CSS unit string) */
    maxWidth?: string | number
    themes?: string[]
    /** Header visibility and controls */
    showHeader?: boolean
    showCopyButton?: boolean
    showExpandButton?: boolean
    showPreviewButton?: boolean
    showFontSizeButtons?: boolean
  }>(),
  {
    isShowPreview: true,
    // Align defaults with CodeBlockNode behaviour: light first, explicit dark
    darkTheme: 'vitesse-dark',
    lightTheme: 'vitesse-light',
    isDark: false,
    loading: true,
    stream: true,
    enableFontSizeControl: true,
    minWidth: undefined,
    maxWidth: undefined,
    // Header configuration: allow consumers to toggle built-in buttons and header visibility
    showHeader: true,
    showCopyButton: true,
    showExpandButton: true,
    showPreviewButton: true,
    showFontSizeButtons: true,
  },
)

const emits = defineEmits(['previewCode', 'copy'])
const { t } = useSafeI18n()

const codeLanguage = ref<string>(String(props.node.language ?? ''))
const copyText = ref(false)
const isExpanded = ref(false)
const isCollapsed = ref(false)
const codeBlockContent = ref<HTMLElement | null>(null)
const rendererTarget = ref<HTMLElement | null>(null)
const fallbackHtml = ref('')
const rendererReady = ref(false)
let renderObserver: MutationObserver | undefined

// Auto-scroll state management
const autoScrollEnabled = ref(true) // Start with auto-scroll enabled
const lastScrollTop = ref(0) // Track last scroll position to detect scroll direction

// Font size control
const codeFontMin = 10
const codeFontMax = 36
const codeFontStep = 1
const defaultCodeFontSize = ref<number>(14)
const codeFontSize = ref<number>(defaultCodeFontSize.value)

const fontBaselineReady = computed(() => {
  const a = defaultCodeFontSize.value
  const b = codeFontSize.value
  return typeof a === 'number' && Number.isFinite(a) && a > 0 && typeof b === 'number' && Number.isFinite(b) && b > 0
})

// 计算用于显示的语言名称
const displayLanguage = computed(() => {
  const lang = codeLanguage.value.trim().toLowerCase()
  return languageMap[lang] || lang.charAt(0).toUpperCase() + lang.slice(1)
})

const isMermaid = computed(
  () => codeLanguage.value.trim().toLowerCase() === 'mermaid',
)

// Computed property for language icon
const languageIcon = computed(() => {
  const lang = codeLanguage.value.trim().toLowerCase()
  return getLanguageIcon(lang.split(':')[0])
})

// Check if the language is previewable (HTML or SVG)
const isPreviewable = computed(() => {
  const lang = codeLanguage.value.trim().toLowerCase()
  return props.isShowPreview && (lang === 'html' || lang === 'svg')
})

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

// Computed style for code block content with font size
const contentStyle = computed(() => {
  return {
    fontSize: `${codeFontSize.value}px`,
  }
})

function getPreferredColorScheme() {
  return props.isDark ? props.darkTheme : props.lightTheme
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderFallback(code: string) {
  renderObserver?.disconnect()
  renderObserver = undefined
  if (!code) {
    fallbackHtml.value = ''
    rendererReady.value = false
    return
  }
  fallbackHtml.value = `<pre class="shiki shiki-fallback"><code>${escapeHtml(code)}</code></pre>`
  rendererReady.value = false
}

function clearFallback() {
  fallbackHtml.value = ''
  rendererReady.value = true
}

function hasRendererContent() {
  const target = rendererTarget.value
  if (!target)
    return false
  if (target.childNodes.length > 0)
    return true
  return Boolean(target.textContent?.trim().length)
}

async function clearFallbackWhenRendererReady() {
  await nextTick()
  if (hasRendererContent()) {
    clearFallback()
    return
  }
  const target = rendererTarget.value
  if (!target)
    return
  renderObserver?.disconnect()
  renderObserver = new MutationObserver(() => {
    if (!hasRendererContent())
      return
    clearFallback()
    renderObserver?.disconnect()
    renderObserver = undefined
  })
  renderObserver.observe(target, { childList: true, subtree: true })
}
// Lazy-load stream-markdown (and thus shiki) only when needed
interface ShikiRenderer {
  updateCode: (code: string, lang?: string) => void | Promise<void>
  setTheme: (theme?: string) => void | Promise<void>
  dispose: () => void
}
let renderer: ShikiRenderer | undefined
let createShikiRenderer:
  | ((el: HTMLElement, opts: { theme?: string | undefined, themes?: string[] | undefined }) => ShikiRenderer)
  | undefined

let registerHighlight
let disposeHighlighter = () => {}
let registeredHighlightLanguages: Set<string> | undefined
const warnedMissingLanguages = new Set<string>()
const warnedRendererErrors = new Set<string>()
const isDevEnv = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)

function normalizeRendererLanguage(rawLang?: string | null, hasContent = false) {
  const [baseToken] = String(rawLang ?? '').split(':')
  const normalized = baseToken?.trim().toLowerCase() ?? ''
  if (!normalized)
    return 'plaintext'
  if (!registeredHighlightLanguages || registeredHighlightLanguages.has(normalized))
    return normalized
  if (hasContent && isDevEnv && !warnedMissingLanguages.has(normalized)) {
    warnedMissingLanguages.add(normalized)
    console.warn(`[MarkdownCodeBlockNode] Language "${normalized}" not preloaded in stream-markdown; falling back to plaintext.`)
  }
  return 'plaintext'
}

async function updateRendererWithFallback(code: string, rawLang?: string | null) {
  if (!renderer)
    return
  const normalized = normalizeRendererLanguage(rawLang, Boolean(code && code.length))
  try {
    await renderer.updateCode(code, normalized)
  }
  catch (err) {
    if (normalized !== 'plaintext') {
      if (isDevEnv && !warnedRendererErrors.has(normalized)) {
        warnedRendererErrors.add(normalized)
        console.warn(`[MarkdownCodeBlockNode] Failed to render language "${normalized}", retrying as plaintext.`, err)
      }
      await renderer.updateCode(code, 'plaintext')
    }
    else if (isDevEnv) {
      console.warn('[MarkdownCodeBlockNode] Failed to render code block even as plaintext.', err)
    }
  }
}
async function ensureStreamMarkdownLoaded() {
  if (createShikiRenderer)
    return
  try {
    const mod = await import('stream-markdown')
    createShikiRenderer = mod.createShikiStreamRenderer
    registerHighlight = mod.registerHighlight
    disposeHighlighter = mod.disposeHighlighter
    const defaultLangs = Array.isArray((mod as any).defaultLanguages) ? (mod as any).defaultLanguages : undefined
    registeredHighlightLanguages = defaultLangs ? new Set(defaultLangs.map((l: string) => l.toLowerCase())) : undefined
    registerHighlight?.({ themes: props.themes })
  }
  catch (e) {
    // stream-markdown is an optional peer; if missing, silently skip highlighting
    console.warn('[MarkdownCodeBlockNode] stream-markdown not available:', e)
  }
}

async function initRenderer() {
  if (isMermaid.value) {
    disposeHighlighter()
    renderer?.dispose()
    renderer = undefined
    rendererReady.value = false
    return
  }

  await ensureStreamMarkdownLoaded()

  if (!codeBlockContent.value || !rendererTarget.value) {
    renderFallback(props.node.code)
    return
  }

  registerHighlight?.({ themes: props.themes })

  if (!renderer && createShikiRenderer) {
    renderer = createShikiRenderer(rendererTarget.value, {
      theme: getPreferredColorScheme(),
    })
    rendererReady.value = true
  }

  if (!renderer) {
    renderFallback(props.node.code)
    return
  }

  if (props.stream === false && props.loading) {
    renderFallback(props.node.code)
    return
  }

  renderFallback(props.node.code)
  await updateRendererWithFallback(props.node.code, codeLanguage.value)
  await clearFallbackWhenRendererReady()
}
initRenderer()
onMounted(() => {
  initRenderer()
})

watch(() => props.themes, async () => {
  if (registerHighlight)
    registerHighlight({ themes: props.themes })
})

watch(() => props.loading, (loading) => {
  if (loading)
    return
  initRenderer()
})

watch(() => [props.node.code, props.node.language], async ([code, lang]) => {
  if (lang !== codeLanguage.value)
    codeLanguage.value = lang.trim()
  if (!codeBlockContent.value || !rendererTarget.value) {
    renderFallback(code)
    return
  }
  if (isMermaid.value) {
    disposeHighlighter()
    renderer?.dispose()
    return
  }

  if (!renderer) {
    renderFallback(code)
    await initRenderer()
  }
  if (!renderer || !code)
    return

  if (props.stream === false && props.loading)
    return

  renderFallback(code)
  await updateRendererWithFallback(code, lang)
  await clearFallbackWhenRendererReady()
})

const watchTheme = watch(
  () => [props.darkTheme, props.lightTheme],
  async () => {
    if (!codeBlockContent.value || !rendererTarget.value)
      return
    if (isMermaid.value) {
      disposeHighlighter()
      renderer?.dispose()
      return watchTheme()
    }
    if (!renderer)
      await initRenderer()
    renderer?.setTheme(getPreferredColorScheme())
  },
)

// Auto-scroll to bottom when content changes (if not expanded and auto-scroll is enabled)
watch(() => props.node.code, async () => {
  if (isExpanded.value || !autoScrollEnabled.value)
    return

  await nextTick()
  const content = codeBlockContent.value
  if (!content)
    return

  // Check if content has scrollbar (scrollHeight > clientHeight)
  if (content.scrollHeight > content.clientHeight) {
    // Scroll to bottom
    content.scrollTop = content.scrollHeight
  }
})

// Check if user is at the bottom of scroll area
// Increased threshold to 50px to better detect "near bottom" state
function isAtBottom(element: HTMLElement, threshold = 50): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold
}

// Handle scroll event to detect user interaction
function handleScroll() {
  const content = codeBlockContent.value
  if (!content || isExpanded.value)
    return

  const currentScrollTop = content.scrollTop

  // Detect scroll direction: if user scrolls up (scrollTop decreased), disable auto-scroll immediately
  if (currentScrollTop < lastScrollTop.value) {
    // User is scrolling up - disable auto-scroll
    autoScrollEnabled.value = false
  }
  else if (isAtBottom(content)) {
    // User is scrolling down and near bottom - re-enable auto-scroll
    autoScrollEnabled.value = true
  }

  // Update last scroll position
  lastScrollTop.value = currentScrollTop
}

// Copy code functionality
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
    console.error('Copy failed:', err)
  }
}

// Tooltip helpers
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

// Expand/collapse functionality
function toggleExpand() {
  isExpanded.value = !isExpanded.value
  const content = codeBlockContent.value
  if (!content)
    return

  if (isExpanded.value) {
    content.style.maxHeight = 'none'
    content.style.overflow = 'visible'
  }
  else {
    content.style.maxHeight = '500px'
    content.style.overflow = 'auto'
    // When collapsing, re-enable auto-scroll and scroll to bottom
    autoScrollEnabled.value = true
    nextTick(() => {
      if (content.scrollHeight > content.clientHeight) {
        content.scrollTop = content.scrollHeight
      }
    })
  }
}

// Header collapse/fold functionality
function toggleHeaderCollapse() {
  isCollapsed.value = !isCollapsed.value
}

// Font size controls
function increaseCodeFont() {
  const after = Math.min(codeFontMax, codeFontSize.value + codeFontStep)
  codeFontSize.value = after
}

function decreaseCodeFont() {
  const after = Math.max(codeFontMin, codeFontSize.value - codeFontStep)
  codeFontSize.value = after
}

function resetCodeFont() {
  codeFontSize.value = defaultCodeFontSize.value
}

// Preview functionality
function previewCode() {
  if (!isPreviewable.value)
    return

  const lowerLang = (codeLanguage.value || props.node.language).toLowerCase()
  const artifactType = lowerLang === 'html' ? 'text/html' : 'image/svg+xml'
  const artifactTitle
    = lowerLang === 'html'
      ? 'HTML Preview'
      : 'SVG Preview'

  emits('previewCode', {
    type: artifactType,
    content: props.node.code,
    title: artifactTitle,
  })
}
</script>

<template>
  <MermaidBlockNode v-if="isMermaid" :node="(node as any)" :is-dark="props.isDark" :loading="props.loading" />
  <div
    v-else
    :style="containerStyle"
    class="code-block-container my-4 rounded-lg border overflow-hidden shadow-sm"
    :class="[props.isDark ? 'border-gray-700/30 bg-gray-900' : 'border-gray-200 bg-white', props.isDark ? 'is-dark' : '']"
  >
    <div
      v-if="props.showHeader"
      class="code-block-header flex justify-between items-center px-4 py-2.5 border-b border-gray-400/5"
      style="color: var(--vscode-editor-foreground);background-color: var(--vscode-editor-background);"
    >
      <!-- left slot / fallback language label -->
      <slot name="header-left">
        <div class="flex items-center space-x-2">
          <span class="icon-slot h-4 w-4 flex-shrink-0" v-html="languageIcon" />
          <span class="text-sm font-medium font-mono">{{ displayLanguage }}</span>
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
            <svg v-if="isExpanded" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="0.75rem" height="0.75rem" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6" /></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="0.75rem" height="0.75rem" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" /></svg>
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
            <svg data-v-3d59cc65="" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></g></svg>
          </button>
        </div>
      </slot>
    </div>
    <div
      v-show="!isCollapsed && (stream ? true : !loading)"
      ref="codeBlockContent"
      class="code-block-content"
      :style="contentStyle"
      @scroll="handleScroll"
    >
      <div ref="rendererTarget" class="code-block-render" />
      <div v-if="!rendererReady" class="code-fallback-plain" v-html="fallbackHtml" />
    </div>
    <!-- Loading placeholder can be overridden via slot -->
    <div v-show="!stream && loading" class="code-loading-placeholder">
      <slot name="loading" :loading="loading" :stream="stream">
        <div class="loading-skeleton">
          <div class="skeleton-line" />
          <div class="skeleton-line" />
          <div class="skeleton-line short" />
        </div>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.code-block-container {
  contain: content;
  /* 新增：显著减少离屏 codeblock 的布局/绘制与样式计算 */
  content-visibility: auto;
  contain-intrinsic-size: 320px 180px;
}

.code-block-content {
  max-height: min(70vh, 500px);
  overflow: auto;
  transition: max-height 0.3s ease;
  font-family: var(--vscode-editor-font-family, 'Fira Code', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace);
  line-height: var(--vscode-editor-line-height, 1.5);
}

.code-block-render {
  min-height: 1px;
}

:deep(.code-block-render pre),
:deep(.code-block-content .shiki) {
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

:deep(.code-block-content .shiki-fallback) {
  padding: 1rem;
  margin: 0;
  background: transparent;
  color: inherit;
  white-space: pre;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

.code-fallback-plain {
  white-space: pre;
  overflow: auto;
  background: transparent;
  color: inherit;
  font-size: inherit;
  line-height: inherit;
  font-family: inherit;
}

:deep(.code-block-content pre){
  padding: 1rem;
}

.code-action-btn {
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.code-action-btn:hover {
  opacity: 1;
}

.code-action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
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
</style>
