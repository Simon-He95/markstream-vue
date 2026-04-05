<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { useViewportPriority } from '../../composables/viewportPriority'
import { getLanguageIcon, languageIconsRevision, languageMap, normalizeLanguageIdentifier } from '../../utils'

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
    showCollapseButton?: boolean
    showFontSizeButtons?: boolean
    /** Toggle singleton tooltips for header action buttons */
    showTooltips?: boolean
    estimatedHeightPx?: number
    estimatedContentHeightPx?: number
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
    showCollapseButton: true,
    showFontSizeButtons: true,
  },
)

const emits = defineEmits(['previewCode', 'copy'])
const { t } = useSafeI18n()

const codeLanguage = ref<string>(normalizeLanguageIdentifier(props.node.language))
const copyText = ref(false)
const isExpanded = ref(false)
const isCollapsed = ref(false)
const container = ref<HTMLElement | null>(null)
const codeBlockContent = ref<HTMLElement | null>(null)
const rendererTarget = ref<HTMLElement | null>(null)
const fallbackHtml = ref('')
const rendererReady = ref(false)
let renderObserver: MutationObserver | undefined
const registerVisibility = useViewportPriority()
const viewportHandle = ref<ReturnType<typeof registerVisibility> | null>(null)
const viewportReady = ref(typeof window === 'undefined')

if (typeof window !== 'undefined') {
  watch(
    () => container.value,
    (el) => {
      viewportHandle.value?.destroy()
      viewportHandle.value = null
      if (!el) {
        viewportReady.value = false
        return
      }
      const handle = registerVisibility(el, { rootMargin: '400px' })
      viewportHandle.value = handle
      viewportReady.value = handle.isVisible.value
      handle.whenVisible.then(() => {
        viewportReady.value = true
      })
    },
    { immediate: true },
  )
}

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

// Computed property for language icon
const languageIcon = computed(() => {
  void languageIconsRevision.value
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
const estimatedVisibleContentHeight = computed(() => {
  const value = props.estimatedContentHeightPx
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null
})

const shouldReserveEstimatedContentHeight = computed(() => {
  return estimatedVisibleContentHeight.value != null && !rendererReady.value
})

// Computed style for code block content with font size
const contentStyle = computed(() => {
  return {
    fontSize: `${codeFontSize.value}px`,
    ...(shouldReserveEstimatedContentHeight.value
      ? { minHeight: `${estimatedVisibleContentHeight.value}px` }
      : {}),
  }
})
const loadingPlaceholderStyle = computed(() => {
  if (estimatedVisibleContentHeight.value == null)
    return undefined
  return {
    minHeight: `${estimatedVisibleContentHeight.value}px`,
  }
})
const tooltipsEnabled = computed(() => props.showTooltips !== false)

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
let registeredHighlightLanguages: Set<string> | undefined
let registeredHighlightThemesKey: string | null = null
const warnedMissingLanguages = new Set<string>()
const warnedRendererErrors = new Set<string>()
const isDevEnv = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
let streamMarkdownLoadPromise: Promise<void> | null = null

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
  if (streamMarkdownLoadPromise)
    return streamMarkdownLoadPromise

  streamMarkdownLoadPromise = (async () => {
    try {
      const mod = await import('stream-markdown')
      createShikiRenderer = mod.createShikiStreamRenderer
      registerHighlight = mod.registerHighlight
      const defaultLangs = Array.isArray((mod as any).defaultLanguages) ? (mod as any).defaultLanguages : undefined
      registeredHighlightLanguages = defaultLangs ? new Set(defaultLangs.map((l: string) => l.toLowerCase())) : undefined
      ensureHighlightThemesRegistered(props.themes)
    }
    catch (e) {
      console.warn('[MarkdownCodeBlockNode] stream-markdown not available:', e)
    }
    finally {
      streamMarkdownLoadPromise = null
    }
  })()

  return streamMarkdownLoadPromise
}

function ensureHighlightThemesRegistered(themes?: string[]) {
  if (!registerHighlight)
    return
  const nextKey = Array.isArray(themes) ? themes.join('\u0000') : ''
  if (registeredHighlightThemesKey === nextKey)
    return
  registerHighlight({ themes })
  registeredHighlightThemesKey = nextKey
}

async function initRenderer() {
  if (!viewportReady.value) {
    renderFallback(props.node.code)
    return
  }

  await ensureStreamMarkdownLoaded()

  if (!codeBlockContent.value || !rendererTarget.value) {
    renderFallback(props.node.code)
    return
  }

  ensureHighlightThemesRegistered(props.themes)

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
onMounted(() => {
  if (!viewportReady.value) {
    renderFallback(props.node.code)
    return
  }
  initRenderer()
})
onBeforeUnmount(() => {
  viewportHandle.value?.destroy()
  viewportHandle.value = null
  renderObserver?.disconnect()
  renderObserver = undefined
})

watch(() => props.themes, async () => {
  ensureHighlightThemesRegistered(props.themes)
})

watch(() => props.loading, (loading) => {
  if (loading)
    return
  if (!viewportReady.value) {
    renderFallback(props.node.code)
    return
  }
  initRenderer()
})

watch(() => viewportReady.value, (ready) => {
  if (!ready)
    return
  initRenderer()
})

watch(tooltipsEnabled, (enabled) => {
  if (!enabled)
    hideTooltip()
})

watch(() => [props.node.code, props.node.language], async ([code, lang]) => {
  const normalizedLang = normalizeLanguageIdentifier(lang)
  if (normalizedLang !== codeLanguage.value)
    codeLanguage.value = normalizedLang
  if (!viewportReady.value) {
    renderFallback(code)
    return
  }
  if (!codeBlockContent.value || !rendererTarget.value) {
    renderFallback(code)
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

watch(
  () => [props.darkTheme, props.lightTheme],
  async () => {
    if (!viewportReady.value)
      return
    if (!codeBlockContent.value || !rendererTarget.value)
      return
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

// Expand/collapse functionality
function toggleExpand(e?: Event) {
  isExpanded.value = !isExpanded.value

  if (e && tooltipsEnabled.value) {
    const target = resolveTooltipTarget(e)
    if (target) {
      const txt = isExpanded.value ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand')
      showTooltipForAnchor(target, txt, 'top', false, undefined, props.isDark)
    }
  }

  const content = codeBlockContent.value
  if (!content)
    return

  if (isExpanded.value) {
    content.style.maxHeight = 'none'
    content.style['overflow-y'] = 'visible'
    content.style['overflow-x'] = 'auto'
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
  <div
    ref="container"
    :style="containerStyle"
    class="code-block-container my-4 rounded-lg border overflow-hidden shadow-sm"
  >
    <div
      v-if="props.showHeader"
      class="code-block-header flex justify-between items-center px-4 py-2.5 border-b"
    >
      <!-- left slot / fallback language label -->
      <slot name="header-left">
        <div class="flex items-center gap-x-2">
          <span class="icon-slot h-4 w-4 flex-shrink-0" v-html="languageIcon" />
          <span class="text-sm font-medium font-mono">{{ displayLanguage }}</span>
        </div>
      </slot>

      <!-- right slot / fallback action buttons -->
      <slot name="header-right">
        <div class="flex items-center gap-x-2">
          <button
            v-if="props.showCollapseButton"
            type="button"
            class="code-action-btn p-2 text-xs rounded-md"
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
              class="code-action-btn p-2 text-xs rounded-md"
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
              class="code-action-btn p-2 text-xs rounded-md"
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
              class="code-action-btn p-2 text-xs rounded-md"
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
            class="code-action-btn p-2 text-xs rounded-md"
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
            class="code-action-btn p-2 text-xs rounded-md"
            :aria-pressed="isExpanded"
            @click="toggleExpand($event)"
            @mouseenter="onBtnHover($event, isExpanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))"
            @focus="onBtnHover($event, isExpanded ? (t('common.collapse') || 'Collapse') : (t('common.expand') || 'Expand'))"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            <svg v-if="isExpanded" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="0.75rem" height="0.75rem" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14 10l7-7m-1 7h-6V4M3 21l7-7m-6 0h6v6" /></svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="0.75rem" height="0.75rem" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 3h6v6m0-6l-7 7M3 21l7-7m-1 7H3v-6" /></svg>
          </button>

          <button
            v-if="isPreviewable && props.showPreviewButton"
            type="button"
            class="code-action-btn p-2 text-xs rounded-md"
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
    <div v-show="!stream && loading" class="code-loading-placeholder" :style="loadingPlaceholderStyle">
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
/* ── Container ── */
.code-block-container {
  contain: content;
  background: var(--code-bg);
  border-color: var(--code-border);
  color: var(--code-fg);
}

/* ── Header ── */
.code-block-header {
  background: var(--code-header-bg);
  border-color: var(--code-border);
  color: var(--code-fg);
}

/* ── Action buttons ── */
.code-action-btn {
  cursor: pointer;
  color: var(--code-action-fg);
  opacity: 0.7;
  transition: opacity 0.2s, background-color 0.15s, color 0.15s;
}

.code-action-btn:hover {
  opacity: 1;
  background: var(--code-action-hover-bg);
  color: var(--code-action-hover-fg);
}

.code-action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ── Code content ── */
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

/* ── Loading placeholder ── */
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
  background: linear-gradient(90deg, var(--loading-shimmer) 25%, hsl(var(--ms-muted-foreground) / 0.12) 37%, var(--loading-shimmer) 63%);
  background-size: 400% 100%;
  animation: code-skeleton-shimmer 1.2s ease-in-out infinite;
  border-radius: 0.25rem;
}

.skeleton-line.short {
  width: 60%;
}

@keyframes code-skeleton-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}
</style>
