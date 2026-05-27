<script setup lang="ts">
import type { MarkdownCodeBlockPreviewPayload } from '../../types/component-props'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { useViewportPriority } from '../../composables/viewportPriority'
import { getLanguageIcon, languageIconsRevision, languageMap, normalizeLanguageIdentifier } from '../../utils'
import CodeBlockShell from '../CodeBlockNode/CodeBlockShell.vue'

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
    autoScrollOnUpdate?: boolean
    autoScrollInitial?: boolean
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
    autoScrollOnUpdate: true,
    autoScrollInitial: true,
  },
)

const emits = defineEmits<{
  (e: 'previewCode', payload: MarkdownCodeBlockPreviewPayload): void
  (e: 'copy', code: string): void
}>()
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
const autoScrollEnabled = ref(props.autoScrollInitial !== false)
const lastScrollTop = ref(0) // Track last scroll position to detect scroll direction
const shouldAutoScrollOnUpdate = computed(() => props.autoScrollOnUpdate !== false)

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
      const defaultLangs = Array.isArray((mod as { defaultLanguages?: unknown }).defaultLanguages)
        ? (mod as { defaultLanguages: unknown[] }).defaultLanguages
        : undefined
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

watch(() => props.autoScrollInitial, (enabled) => {
  autoScrollEnabled.value = enabled !== false
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
  () => [props.darkTheme, props.lightTheme, props.isDark],
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
  if (isExpanded.value || !shouldAutoScrollOnUpdate.value || !autoScrollEnabled.value)
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
  if (!content || isExpanded.value || !shouldAutoScrollOnUpdate.value)
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
    content.style.maxHeight = ''
    content.style.overflow = 'auto'
    if (shouldAutoScrollOnUpdate.value) {
      autoScrollEnabled.value = true
      nextTick(() => {
        if (content.scrollHeight > content.clientHeight) {
          content.scrollTop = content.scrollHeight
        }
      })
    }
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
    class="code-block-container rounded-lg border overflow-hidden"
    :class="{ dark: props.isDark }"
  >
    <CodeBlockShell
      :show-header="props.showHeader"
      :show-collapse-button="props.showCollapseButton"
      :show-font-size-buttons="props.showFontSizeButtons"
      :enable-font-size-control="props.enableFontSizeControl"
      :show-copy-button="props.showCopyButton"
      :show-expand-button="props.showExpandButton"
      :show-preview-button="props.showPreviewButton"
      :show-tooltips="props.showTooltips"
      :is-dark="props.isDark"
      :loading="props.loading"
      :stream="props.stream"
      :is-collapsed="isCollapsed"
      :is-expanded="isExpanded"
      :copy-text="copyText"
      :is-previewable="isPreviewable"
      :code-font-size="codeFontSize"
      :code-font-min="codeFontMin"
      :code-font-max="codeFontMax"
      :default-code-font-size="defaultCodeFontSize"
      :font-baseline-ready="fontBaselineReady"
      @toggle-collapse="toggleHeaderCollapse"
      @decrease-font="decreaseCodeFont"
      @reset-font="resetCodeFont"
      @increase-font="increaseCodeFont"
      @copy="copy"
      @toggle-expand="toggleExpand"
      @preview="previewCode"
    >
      <template #header-left>
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
      </template>
      <template v-if="$slots['header-right']" #header-right>
        <slot name="header-right" />
      </template>

      <!-- Content area -->
      <div
        ref="codeBlockContent"
        class="code-block-content"
        :style="contentStyle"
        @scroll="handleScroll"
      >
        <div ref="rendererTarget" class="code-block-render" />
        <div v-if="!rendererReady" class="code-fallback-plain" v-html="fallbackHtml" />
      </div>

      <template #loading>
        <slot name="loading" :loading="loading" :stream="stream">
          <div class="loading-skeleton">
            <div class="skeleton-line" />
            <div class="skeleton-line" />
            <div class="skeleton-line short" />
          </div>
        </slot>
      </template>
    </CodeBlockShell>
  </div>
</template>

<style scoped>
/* ── Code content ── */
.code-block-content {
  display: grid;
  max-height: min(70vh, var(--ms-size-code-max-height));
  overflow: auto;
  transition: max-height var(--ms-duration-slow) var(--ms-ease-standard);
  font-family: var(
    --markstream-code-font-family,
    ui-monospace,
    SFMono-Regular,
    SF Mono,
    Menlo,
    Monaco,
    Consolas,
    Liberation Mono,
    Courier New,
    monospace
  );
  font-size: var(--vscode-editor-font-size, 14px);
  line-height: var(--vscode-editor-line-height, 1.5);
}

.code-block-render,
.code-fallback-plain {
  grid-area: 1 / 1;
  min-width: 0;
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

:deep(.code-block-content pre) {
  box-sizing: border-box;
  margin: 0;
  padding: 1rem;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
}

:deep(.code-block-content .shiki-fallback) {
  background: transparent;
  color: inherit;
  white-space: pre;
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

/* ── Loading placeholder ── */
.code-loading-placeholder {
  padding: 1rem;
  min-height: var(--ms-size-skeleton-min-height);
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
  border-radius: calc(var(--ms-radius) * 0.5);
}

.skeleton-line.short {
  width: 60%;
}

@keyframes code-skeleton-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}
</style>
