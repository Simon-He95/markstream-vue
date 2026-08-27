<script setup lang="ts">
import type { CodeBlockNodeProps, CodeBlockPreviewPayload, CodeBlockTheme, CodeBlockThemeProp } from '../../types/component-props'
import type { StreamDiffsDiffEditorViewLike, StreamDiffsDisposableLike, StreamDiffsEditorViewLike, StreamDiffsModule, StreamDiffsNamespaceLike, StreamDiffsRuntimeOptions } from './streamDiffs'
import { computed, getCurrentInstance, inject, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, shallowRef, useAttrs, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
// Tooltip is provided as a singleton via composable to avoid many DOM nodes
import { hideTooltip } from '../../composables/useSingletonTooltip'
import { useOffscreenHeavyNodeDeferral, useViewportPriority, useViewportPriorityOptions } from '../../composables/viewportPriority'
import { languageIconsRevision, languageMap, normalizeLanguageIdentifier, resolveLanguageId } from '../../utils'
import { MARKSTREAM_LANGUAGE_ICON_RESOLVER_KEY } from '../../utils/languageIconContext'
import { resolveLifecycleIndexKey } from '../../utils/lifecycleIndexKey'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../../utils/nodeLifecycle'
import { resolveLanguageIcon } from '../../utils/resolveLanguageIcon'
import { safeCancelRaf, safeRaf } from '../../utils/safeRaf'
import PreCodeBlock from '../PreCodeNode/PreCodeBlock.vue'
import { resolvePreCodeThemePalette } from '../PreCodeNode/preCodeTheme'
import { preCodeThemeLooksDark, resolvePreCodeThemeName } from '../PreCodeNode/preCodeThemeName'
import {
  DEFAULT_PRE_CODE_FONT_SIZE,
  DEFAULT_PRE_CODE_LINE_HEIGHT,
  resolvePreCodeVisualOptions,
} from '../PreCodeNode/preCodeVisual'
import { estimateDiffStats, isDiffCodeBlock, resolveCodeBlockHeader, resolveDiffHideUnchangedRegionsOption } from './codeBlockHeader'
import CodeBlockShell from './CodeBlockShell.vue'
import HtmlPreviewFrame from './HtmlPreviewFrame.vue'
import {
  getStreamDiffsRuntime,
} from './streamDiffs'
import {
  getStreamDiffsWorkerPool,
  syncStreamDiffsWorkerTheme,
} from './streamDiffsWorker'

const props = withDefaults(
  defineProps<CodeBlockNodeProps & {
    estimatedHeightPx?: number
    estimatedContentHeightPx?: number
    estimatedDiffInline?: boolean
  }>(),
  {
    isShowPreview: true,
    darkTheme: undefined,
    lightTheme: undefined,
    isDark: false,
    loading: true,
    stream: true,
    showLineNumbers: undefined,
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

const emits = defineEmits<{
  (e: 'previewCode', payload: CodeBlockPreviewPayload): void
  (e: 'copy', code: string): void
}>()

const effectiveShowLineNumbers = computed(() => {
  return props.showLineNumbers ?? (props.codeBlockOptions?.disableLineNumbers !== true)
})

const attrs = useAttrs()
const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY, null)
const hostScrollManaged = inject<{ value: boolean } | null>('markstreamHostScrollManaged', null)
const appLanguageIconResolver = inject(MARKSTREAM_LANGUAGE_ICON_RESOLVER_KEY, undefined)
const lifecycleIndexKey = computed(() => {
  return resolveLifecycleIndexKey(props, attrs)
})

function warnCodeBlockDev(context: string, error: unknown) {
  if (import.meta.env?.DEV)
    console.warn(`[markstream-vue] ${context}:`, error)
}

const instance = getCurrentInstance()
const hasPreviewListener = computed(() => {
  const props = instance?.vnode.props as Record<string, unknown> | null | undefined
  return !!(props && (props.onPreviewCode || props['onPreview-code']))
})
const { t } = useSafeI18n()
// No mermaid-specific handling here; NodeRenderer routes mermaid blocks.
const codeEditor = ref<HTMLElement | null>(null)
const container = ref<HTMLElement | null>(null)
const copyText = ref(false)

const codeLanguage = ref(resolveStreamingCodeLanguage(props.node.language, props.node.code, isCodeBlockLoading()))
const editorLanguage = computed(() => resolveLanguageId(codeLanguage.value))
const runtimeLanguage = computed(() => editorLanguage.value === 'plaintext' ? 'text' : editorLanguage.value)
const isPlainTextLanguage = computed(() => editorLanguage.value === 'plaintext')
const isExpanded = ref(false)
const isCollapsed = ref(false)
const editorCreated = ref(false)
const editorRuntimeCreated = ref(false)
const editorMounted = ref(false)
const runtimeReady = ref(false)
let isUnmounted = false
let pendingThemeUpdate = false
let expandRafId: number | null = null
let deferredHeightSyncRafId: number | null = null
let deferredHeightSyncFollowUpRafId: number | null = null
let streamingDiffHeightChaseRafId: number | null = null
let streamingDiffHeightChaseFrames = 0
let streamingDiffHeightChaseAllowSettled = false
let lifecyclePendingIndexKey = ''
const heightBeforeCollapse = ref<number | null>(null)
let resumeGuardFrames = 0
// Visible height alone cannot reveal overflow after the container is clipped by its maximum height.
let wasScrollableBeforeCollapse = false
const registerVisibility = useViewportPriority()
const viewportPriorityOptions = useViewportPriorityOptions()
const offscreenHeavyNodeDeferral = useOffscreenHeavyNodeDeferral()
const viewportHandle = shallowRef<ReturnType<typeof registerVisibility> | null>(null)
const viewportReady = ref(typeof window === 'undefined' || !offscreenHeavyNodeDeferral.value)
const existingCode = getCurrentInstance()?.vnode.el?.textContent ?? ''
const hydratedFromServer = typeof window !== 'undefined'
  && String(props.node.code ?? '').length > 0
  && existingCode.includes(String(props.node.code))
const viewportPendingMarkerReady = ref(!hydratedFromServer)
onMounted(() => {
  viewportPendingMarkerReady.value = true
})
if (typeof window !== 'undefined') {
  watch(
    [() => container.value, offscreenHeavyNodeDeferral],
    ([el, shouldDefer], _oldValue, onCleanup) => {
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

      let active = true
      const rootMargin = viewportPriorityOptions?.value.heavyBlockMargin
        ?? viewportPriorityOptions?.value.rootMargin
        ?? '0px'
      const handle = registerVisibility(el, {
        rootMargin,
        allowIdle: false,
      })

      viewportHandle.value = handle
      // Latch readiness once visible so observer reconfiguration does not hide an enhanced block.
      viewportReady.value = viewportReady.value || handle.isVisible.value

      handle.whenVisible
        .then(() => {
          if (active && viewportHandle.value === handle)
            viewportReady.value = true
        })
        .catch(() => {})

      onCleanup(() => {
        active = false
        handle.destroy()

        if (viewportHandle.value === handle)
          viewportHandle.value = null
      })
    },
    { immediate: true },
  )
}
function markLifecyclePending() {
  const indexKey = lifecycleIndexKey.value
  if (!lifecycle || !indexKey)
    return

  if (lifecyclePendingIndexKey === indexKey)
    return

  if (lifecyclePendingIndexKey)
    lifecycle.markSettled(lifecyclePendingIndexKey)

  lifecyclePendingIndexKey = indexKey
  lifecycle.markPending(indexKey)
}

function markLifecycleSettled() {
  const indexKey = lifecyclePendingIndexKey
  if (!lifecycle || !indexKey)
    return

  lifecyclePendingIndexKey = ''
  nextTick(() => {
    if (!isUnmounted) {
      const height = container.value?.offsetHeight ?? 0
      if (height > 0)
        lifecycle.reportHeight(indexKey, height)
    }
    lifecycle.markSettled(indexKey)
  })
}

function clearLifecyclePending() {
  const indexKey = lifecyclePendingIndexKey
  if (!lifecycle || !indexKey)
    return

  lifecyclePendingIndexKey = ''
  lifecycle.markSettled(indexKey)
}

onBeforeUnmount(() => {
  isUnmounted = true
  clearLifecyclePending()
  viewportHandle.value?.destroy()
  viewportHandle.value = null
})

// Lazy-load `stream-diffs` helpers at runtime so consumers who don't install
// `stream-diffs` won't have the editor code bundled. We provide safe no-op
// fallbacks for the minimal API we use.
let createEditor: ((el: HTMLElement, code: string, lang: string) => Promise<unknown> | unknown) | null = null
let createDiffEditor: ((el: HTMLElement, original: string, modified: string, lang: string) => Promise<unknown> | unknown) | null = null
let updateCode: (code: string, lang: string) => Promise<unknown> | unknown = () => {}
let updateDiffCode: (original: string, modified: string, lang: string) => Promise<unknown> | unknown = () => {}
let finalizeCode: () => Promise<unknown> | unknown = () => {}
let finalizeDiff: () => Promise<unknown> | unknown = () => {}
let getEditor: () => StreamDiffsNamespaceLike | null = () => null
let getEditorView: () => StreamDiffsEditorViewLike | null = () => ({ getModel: () => ({ getLineCount: () => 1 }), getOption: () => 14, updateOptions: () => {} })
let getDiffEditorView: () => StreamDiffsDiffEditorViewLike | null = () => ({ getModel: () => ({ getLineCount: () => 1 }), getOption: () => 14, updateOptions: () => {} })
let cleanupEditor: () => void = () => {}
let safeClean = () => {}
let refreshDiffPresentation: () => Promise<unknown> | unknown = () => {}
let whenRuntimeVisualReady: (() => Promise<boolean>) | null = null
let createEditorPromise: Promise<void> | null = null
let editorRuntimeCreationPromise: Promise<void> | null = null
let streamDiffsRuntimePromise: Promise<void> | null = null
let detectLanguage: (code: string) => string = () => String(props.node.language ?? 'plaintext')
let setTheme: (theme: CodeBlockThemeProp | undefined) => Promise<void> | void = async () => {}
let pendingDiffResultErrorFilterInstalled = false
let pendingDiffResultErrorFilterCleanup: (() => void) | null = null
const editorHeightSyncDisposables: StreamDiffsDisposableLike[] = []
const inlineFoldProxyCleanups: Array<() => void> = []
let streamDiffsRuntimeOptions: StreamDiffsRuntimeOptions | null = null
let streamDiffsModule: StreamDiffsModule | null = null
const isDiff = computed(() => isDiffCodeBlock(props.node))
const diffStats = ref({ removed: 0, added: 0 })
const diffStatsAriaLabel = computed(() => `-${diffStats.value.removed} +${diffStats.value.added}`)
function resolveDiffRenderPair(original: string, updated: string) {
  return {
    original,
    updated,
  }
}

function getDisplayCode(code: unknown) {
  const value = String(code ?? '')
  return value.replace(/\r\n$|\n$|\r$/, '')
}

function isPendingDiffResultError(error: unknown) {
  return String((error as { message?: unknown } | null | undefined)?.message ?? error)
    .includes('no diff result available')
}

function installPendingDiffResultErrorFilter() {
  if (pendingDiffResultErrorFilterInstalled || typeof window === 'undefined')
    return

  pendingDiffResultErrorFilterInstalled = true

  const handleError = (event: ErrorEvent | PromiseRejectionEvent) => {
    const error = 'reason' in event
      ? event.reason
      : event.error ?? event.message

    if (!isPendingDiffResultError(error))
      return

    event.preventDefault()
    event.stopImmediatePropagation()
  }

  window.addEventListener('error', handleError, true)
  window.addEventListener('unhandledrejection', handleError, true)
  pendingDiffResultErrorFilterCleanup = () => {
    window.removeEventListener('error', handleError, true)
    window.removeEventListener('unhandledrejection', handleError, true)
    pendingDiffResultErrorFilterInstalled = false
    pendingDiffResultErrorFilterCleanup = null
  }
}

function refreshDiffPresentationSafely() {
  if (hasRenderedDiffsDom())
    return

  try {
    const result = refreshDiffPresentation()
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      void (result as Promise<unknown>).catch((error) => {
        if (!isPendingDiffResultError(error))
          warnCodeBlockDev('Failed to refresh stream-diffs presentation', error)
      })
    }
  }
  catch (error) {
    if (!isPendingDiffResultError(error))
      warnCodeBlockDev('Failed to refresh stream-diffs presentation', error)
  }
}

const resolvedEditorOptions = computed(() => {
  const raw = { ...(props.codeBlockOptions || {}) } as Record<string, unknown>
  for (const key of [
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
    'maxHeight',
    'padding',
    'tabSize',
  ])
    delete raw[key]

  if (!isDiff.value) {
    return raw
  }
  const parseDiffOptions = raw.parseDiffOptions && typeof raw.parseDiffOptions === 'object'
    ? raw.parseDiffOptions as Record<string, unknown>
    : {}
  const diffDefaults = {
    diffStyle: 'split',
    expandUnchanged: false,
    collapsedContextThreshold: 5,
    hunkSeparators: 'line-info',
    parseDiffOptions: { context: 2 },
  }
  return {
    ...diffDefaults,
    ...raw,
    parseDiffOptions: {
      ...diffDefaults.parseDiffOptions,
      ...parseDiffOptions,
    },
  } as Record<string, unknown>
})

/**
 * Whether the editor surface (stream-diffs area) is dark.
 * For fixed themes: detected from theme name or object luminance.
 * For paired themes: follows page isDark.
 */
const editorSurfaceIsDark = computed(() => {
  if (isFixedTheme())
    return themeLooksDark(resolveRequestedTheme())
  // Paired or default: follow page theme
  return !!props.isDark
})

const effectiveDiffAppearance = computed<'light' | 'dark'>(() => {
  if (!isDiff.value)
    return editorSurfaceIsDark.value ? 'dark' : 'light'

  return editorSurfaceIsDark.value ? 'dark' : 'light'
})

const resolvedSurfaceIsDark = computed(() =>
  isDiff.value ? effectiveDiffAppearance.value === 'dark' : editorSurfaceIsDark.value,
)
const preFallbackThemePalette = computed(() => resolvePreCodeThemePalette({
  darkTheme: props.darkTheme,
  isDark: props.isDark,
  lightTheme: props.lightTheme,
  theme: props.theme,
  themes: props.themes,
}))

// In streaming scenarios, the opening fence info string can arrive in chunks
// (e.g. "```d" then "iff json:..."), which means a block may flip between
// single <-> diff after the component has mounted. Runtime surfaces cannot
// switch kind in-place, so we recreate the surface when the kind changes.
const desiredEditorKind = computed<'diff' | 'single'>(() => (isDiff.value ? 'diff' : 'single'))
const currentEditorKind = ref<'diff' | 'single'>(desiredEditorKind.value)
const usePreCodeRender = ref(false)
const editorDisplayReady = ref(false)
const editorHandoffPrepared = ref(false)
const editorCreationFailed = ref(false)
const failedEditorCreationKey = ref<string | null>(null)
const editorCreationContentRevision = ref(0)
const editorCreationSettledContentGeneration = ref(0)
const plainEditorContentMeasured = ref(false)
let staleContentRetryFailureKey: string | null = null
let editorCreationFailureRetryInProgress = false
let editorCreationFailureKeyRetriedKey: string | null = null
let diffEditorCreatedWhileStreaming = false
const preFallbackDiffInline = computed(() => {
  if (!isDiff.value)
    return false

  return resolvedEditorOptions.value?.diffStyle === 'unified'
})
const preFallbackDiffHideUnchangedRegions = computed(() => {
  return resolveDiffHideUnchangedRegionsOption(resolvedEditorOptions.value)
})
function isHostScrollManagedCodeBlockElement(el?: HTMLElement | null) {
  if (hostScrollManaged?.value === true)
    return true

  if (!el)
    return false

  // Built-in zero-config timeline.
  if (el.closest('[data-markstream-virtual-timeline="1"], .markstream-virtual-timeline'))
    return true

  // Common external virtualizer wrappers own scroll reconciliation and item height.
  return Boolean(el.closest('.vue-recycle-scroller, [data-virtualizer], [data-virtual-scroll-root]'))
}
const codeBlockHostScrollManaged = computed(() => isHostScrollManagedCodeBlockElement(container.value))
const showPreWhileRuntimeLoads = computed(() => {
  // If the enhanced runtime is unavailable, render a standalone PreCodeNode.
  if (usePreCodeRender.value)
    return false
  if (editorCreationFailed.value)
    return true
  // A warm runtime still needs at least one paint before its editor is visible.
  // Keeping one fallback rule for single and diff blocks also prevents parser
  // kind changes from producing a blank third state during the handoff.
  return !editorDisplayReady.value
})
const renderPreFallback = computed(() => showPreWhileRuntimeLoads.value)
const hideCodeEditorContainer = computed(() =>
  showPreWhileRuntimeLoads.value && !editorHandoffPrepared.value,
)
const restoreVisualPending = computed(() =>
  !usePreCodeRender.value
  && !editorCreationFailed.value
  && showPreWhileRuntimeLoads.value,
)
const codeBlockEnhancementState = computed(() => {
  if (editorDisplayReady.value && !usePreCodeRender.value)
    return 'ready'
  return editorCreationFailed.value ? 'fallback' : 'pending'
})
const showInlinePreview = ref(false)
const displayCode = computed(() => getDisplayCode(props.node.code))
const preCodeNode = computed(() => {
  if (!isDiff.value) {
    if (displayCode.value === props.node.code)
      return props.node
    return {
      ...props.node,
      code: displayCode.value,
    }
  }
  if (props.node.diff === true)
    return props.node
  return {
    ...props.node,
    diff: true,
  }
})

function initializeStreamDiffsHelpers(mod: StreamDiffsModule) {
  const det = mod.detectLanguage
  if (typeof det === 'function')
    detectLanguage = det
  streamDiffsModule = mod
  streamDiffsRuntimeOptions = buildStreamDiffsRuntimeOptions()
  const helpers = mod.createCodeBlockRuntime(streamDiffsRuntimeOptions)
  if (!helpers)
    return false

  createEditor = helpers.createEditor || createEditor
  createDiffEditor = helpers.createDiffEditor || createDiffEditor
  updateCode = helpers.updateCode || updateCode
  updateDiffCode = helpers.updateDiff || updateDiffCode
  finalizeCode = helpers.finalizeCode || finalizeCode
  finalizeDiff = helpers.finalizeDiff || finalizeDiff
  getEditor = helpers.getEditor || getEditor
  getEditorView = helpers.getEditorView || getEditorView
  getDiffEditorView = helpers.getDiffEditorView || getDiffEditorView
  cleanupEditor = helpers.cleanupEditor || cleanupEditor
  safeClean = helpers.safeClean || helpers.cleanupEditor || safeClean
  refreshDiffPresentation = helpers.refreshDiffPresentation || refreshDiffPresentation
  setTheme = helpers.setTheme || setTheme
  whenRuntimeVisualReady = helpers.whenVisualReady || null
  runtimeReady.value = true
  return true
}

async function ensureCodeBlockRuntime() {
  if (typeof window === 'undefined' || isUnmounted)
    return
  if (runtimeReady.value || usePreCodeRender.value)
    return
  if (streamDiffsRuntimePromise)
    return streamDiffsRuntimePromise

  const pending = (async () => {
    try {
      const mod = await getStreamDiffsRuntime()
      if (isUnmounted)
        return
      if (!mod) {
        if (import.meta.env?.DEV) {
          console.warn('[markstream-vue] stream-diffs is not installed. Code blocks will use basic rendering. Install stream-diffs for enhanced code block rendering.')
        }
        usePreCodeRender.value = true
        return
      }
      initializeStreamDiffsHelpers(mod)
    }
    catch (err) {
      if (isUnmounted)
        return
      if (import.meta.env?.DEV)
        console.warn('[markstream-vue] Failed to initialize stream-diffs editor:', err)
      usePreCodeRender.value = true
    }
  })()

  const currentPromise = pending.finally(() => {
    if (streamDiffsRuntimePromise === currentPromise)
      streamDiffsRuntimePromise = null
  })
  streamDiffsRuntimePromise = currentPromise
  return currentPromise
}

const codeFontMin = 10
const codeFontMax = 36
const codeFontStep = 1
const defaultPreFallbackFontSize = DEFAULT_PRE_CODE_FONT_SIZE
const defaultPreFallbackLineHeight = DEFAULT_PRE_CODE_LINE_HEIGHT
const defaultCodeFontSize = ref<number>(
  typeof props.codeBlockOptions?.fontSize === 'number' ? props.codeBlockOptions.fontSize : Number.NaN,
)
const codeFontSize = ref<number>(defaultCodeFontSize.value)
// Set after the enhanced surface renders; drives the pre-fallback metrics.
const measuredEditorFontSize = ref<number | null>(null)
const measuredEditorLineHeight = ref<number | null>(null)
const measuredEditorCharacterWidth = ref<number | null>(null)
// Set only during the diff fallback → finalized surface handoff. The fallback
// and finalized surface use different folding DOMs, so the measured finalized
// height must be kept in the Vue style contract rather than a one-off DOM write.
const diffFallbackHandoffHeight = ref<number | null>(null)
const fontBaselineReady = computed(() => {
  const a = defaultCodeFontSize.value
  const b = codeFontSize.value
  return typeof a === 'number' && Number.isFinite(a) && a > 0 && typeof b === 'number' && Number.isFinite(b) && b > 0
})
const preFallbackFontSize = computed(() => {
  const fromOptions = props.codeBlockOptions?.fontSize
  if (typeof fromOptions === 'number' && Number.isFinite(fromOptions) && fromOptions > 0)
    return fromOptions
  const fromState = codeFontSize.value
  if (typeof fromState === 'number' && Number.isFinite(fromState) && fromState > 0)
    return fromState
  return defaultPreFallbackFontSize
})
const preFallbackLineHeight = computed(() => {
  const fromOptions = props.codeBlockOptions?.lineHeight
  if (typeof fromOptions === 'number' && Number.isFinite(fromOptions) && fromOptions > 0)
    return fromOptions
  if (preFallbackFontSize.value === defaultPreFallbackFontSize)
    return defaultPreFallbackLineHeight
  return Math.max(12, Math.round(preFallbackFontSize.value * 1.5))
})
// Unified line height for both diff and non-diff fallback; uses measured values first.
const preFallbackEffectiveLineHeight = computed(() => preFallbackLineHeight.value)
const preFallbackTabSize = computed(() => {
  const fromOptions = props.codeBlockOptions?.tabSize
  if (typeof fromOptions === 'number' && Number.isFinite(fromOptions) && fromOptions > 0)
    return fromOptions
  return 4
})
const preFallbackVerticalPadding = computed(() => {
  const padding = props.codeBlockOptions?.padding
  const defaultPadding = 8
  const value = typeof padding === 'number' && Number.isFinite(padding) && padding >= 0
    ? padding
    : defaultPadding
  return { top: value, bottom: value }
})
const preFallbackVisualOptions = computed(() => {
  const base = resolvePreCodeVisualOptions(props.codeBlockOptions)
  return {
    ...base,
    fontSize: preFallbackFontSize.value,
    lineHeight: preFallbackEffectiveLineHeight.value,
    maxHeight: getMaxHeightValue(),
    padding: preFallbackVerticalPadding.value.top,
    paddingBottom: preFallbackVerticalPadding.value.bottom,
    tabSize: preFallbackTabSize.value,
  }
})
// Keep computed height tight to content. Extra padding caused visible bottom gap.
const CONTENT_PADDING = 0
const SIDE_BY_SIDE_DIFF_PREVIEW_BOTTOM_PADDING = 0
const LINE_EXTRA_PER_LINE = 1.5
const PIXEL_EPSILON = 1
const estimatedVisibleContentHeight = computed(() => {
  const value = props.estimatedContentHeightPx
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null
})
function capEditorContentHeight(height: number | null) {
  if (height == null)
    return null

  const nextHeight = Math.ceil(height)
  if (!Number.isFinite(nextHeight) || nextHeight <= 0)
    return null

  return Math.min(nextHeight, Math.ceil(getMaxHeightValue()))
}

function shouldUseStreamingLocalPreFallbackHeight() {
  return !isDiff.value && props.stream !== false && props.loading !== false
}

const streamingLocalPreFallbackHeightActive = ref(shouldUseStreamingLocalPreFallbackHeight())
function shouldIgnoreEstimatedPlainHeight() {
  return shouldUseStreamingLocalPreFallbackHeight()
    || streamingLocalPreFallbackHeightActive.value
}

const preFallbackLocalMinHeight = computed(() => {
  const countLines = (source: unknown) => {
    const value = String(source ?? '')
    if (!value)
      return 1
    let count = 1
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '\n') {
        count++
      }
      else if (value[i] === '\r') {
        count++
        if (value[i + 1] === '\n') {
          i++
        }
      }
    }
    return count
  }

  if (isDiff.value)
    return null

  if (
    estimatedVisibleContentHeight.value != null
    && !shouldIgnoreEstimatedPlainHeight()
  ) {
    return null
  }

  return Math.ceil(
    countLines(displayCode.value) * preFallbackEffectiveLineHeight.value
    + PIXEL_EPSILON,
  )
})
const preFallbackReservedContentHeight = computed(() => {
  // Diff fallback height belongs to its visible rows. A retained floor keeps
  // space after unchanged rows collapse.
  if (isDiff.value)
    return null

  const estimated = estimatedVisibleContentHeight.value
  if (estimated != null && !shouldIgnoreEstimatedPlainHeight())
    return capEditorContentHeight(estimated)

  const local = preFallbackLocalMinHeight.value
  return capEditorContentHeight(local)
})
const estimatedVisibleBlockHeight = computed(() => {
  const value = props.estimatedHeightPx
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null
})
const pendingEstimatedEditorHeightFloor = ref<number | null>(null)

function getPendingEstimatedEditorHeightFloor() {
  const value = pendingEstimatedEditorHeightFloor.value
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : null
}

const reservedEditorContentHeight = computed(() => {
  const floor = getPendingEstimatedEditorHeightFloor()
  if (floor != null)
    return floor

  if (!isDiff.value && plainEditorContentMeasured.value)
    return null

  // While the fallback pre is visible, keep the hidden editor host at the same
  // content height. When the enhanced surface becomes visible, the grid row will not collapse
  // by a browser rounding pixel.
  if (showPreWhileRuntimeLoads.value || !editorDisplayReady.value)
    return preFallbackReservedContentHeight.value

  return null
})

function getDiffVisualVars(isDark: boolean) {
  const addedFg = isDark ? 'hsl(152 42% 60%)' : 'var(--diff-added-fg)'
  const removedFg = isDark ? 'hsl(0 58% 58%)' : 'var(--diff-removed-fg)'
  const addedLine = isDark
    ? 'color-mix(in lab, #121212 80%, #4d9375)'
    : 'color-mix(in lab, #ffffff 88%, #1e754f)'
  const addedNumber = isDark
    ? 'color-mix(in lab, #121212 85%, #4d9375)'
    : 'color-mix(in lab, #ffffff 91%, #1e754f)'
  const removedLine = isDark
    ? 'color-mix(in lab, #121212 80%, #cb7676)'
    : 'color-mix(in lab, #ffffff 88%, #ab5959)'
  const removedNumber = isDark
    ? 'color-mix(in lab, #121212 85%, #cb7676)'
    : 'color-mix(in lab, #ffffff 91%, #ab5959)'
  const addedInline = isDark ? 'hsl(152 42% 60% / 0.28)' : 'var(--diff-added-inline-bg)'
  const removedInline = isDark ? 'hsl(0 58% 58% / 0.28)' : 'var(--diff-removed-inline-bg)'
  const addedGutter = `linear-gradient(90deg, ${addedFg} 0 4px, transparent 4px 100%)`
  const removedGutter = `linear-gradient(90deg, ${removedFg} 0 4px, transparent 4px 100%)`
  return {
    '--markstream-diff-line-number-bg': 'var(--markstream-diff-editor-bg)',
    '--markstream-diff-added-fg': addedFg,
    '--markstream-diff-removed-fg': removedFg,
    '--markstream-diff-added-line': addedLine,
    '--markstream-diff-removed-line': removedLine,
    '--markstream-diff-added-line-fill': addedLine,
    '--markstream-diff-added-number-fill': addedNumber,
    '--markstream-diff-removed-line-fill': removedLine,
    '--markstream-diff-removed-number-fill': removedNumber,
    '--markstream-diff-added-gutter': addedGutter,
    '--markstream-diff-removed-gutter': removedGutter,
    '--markstream-diff-added-inline': addedInline,
    '--markstream-diff-removed-inline': removedInline,
  }
}

const preFallbackStyle = computed(() => {
  const cappedEstimatedContentHeight = capEditorContentHeight(estimatedVisibleContentHeight.value)
  const cappedLocalMinHeight = capEditorContentHeight(preFallbackLocalMinHeight.value)
  const useStreamingLocalHeight = shouldIgnoreEstimatedPlainHeight()
  const style = {
    ...(!isDiff.value && cappedEstimatedContentHeight != null && !useStreamingLocalHeight
      ? {
          height: `${cappedEstimatedContentHeight}px`,
          minHeight: `${cappedEstimatedContentHeight}px`,
        }
      : !isDiff.value && cappedLocalMinHeight != null
          ? {
              minHeight: `${cappedLocalMinHeight}px`,
            }
          : {}),
  } as Record<string, string | number>

  style['--markstream-code-fallback-bg'] = preFallbackThemePalette.value.background
  style['--markstream-code-fallback-fg'] = preFallbackThemePalette.value.foreground
  if (preFallbackThemePalette.value.builtin) {
    style['--markstream-code-theme-bg'] = preFallbackThemePalette.value.background
    style['--markstream-code-theme-fg'] = preFallbackThemePalette.value.foreground
    style['--markstream-code-theme-line-number'] = preFallbackThemePalette.value.lineNumber
  }
  style['--markstream-pre-line-number-top'] = `${preFallbackVerticalPadding.value.top}px`
  style['--markstream-pre-line-number-left'] = '0px'
  style['--markstream-pre-line-number-padding-left'] = '2ch'
  style['--markstream-pre-line-number-padding-right'] = '1ch'
  style['--markstream-pre-line-number-separator-width'] = '2px'

  if (isDiff.value) {
    // Keep the pre diff fallback visually close to stream-diffs' diff line box.
    style['--markstream-pre-diff-line-height'] = `${preFallbackEffectiveLineHeight.value}px`
    // The collapsed "unmodified lines" row defaults to pierre's 32px pill +
    // 8px gap rhythm in PreCodeNode, so no row-height override is needed here.
    style['--markstream-pre-diff-pane-bottom-padding'] = preFallbackDiffInline.value
      ? '0px'
      : `${SIDE_BY_SIDE_DIFF_PREVIEW_BOTTOM_PADDING}px`
    const handoffHeight = diffFallbackHandoffHeight.value
    if (handoffHeight != null && handoffHeight > 0) {
      style.height = `${handoffHeight}px`
      style.minHeight = `${handoffHeight}px`
      style.maxHeight = `${handoffHeight}px`
    }
    Object.assign(style, getDiffVisualVars(resolvedSurfaceIsDark.value))
  }

  return style
})
const shouldReserveEstimatedEditorHeight = computed(() => {
  return reservedEditorContentHeight.value != null
    && (!editorDisplayReady.value || getPendingEstimatedEditorHeightFloor() != null)
})
const reservedOuterBlockHeight = computed(() => {
  const reserved = reservedEditorContentHeight.value
  if (reserved == null)
    return null

  if (isDiff.value)
    return Math.ceil(reserved)

  const estimatedBlockHeight = estimatedVisibleBlockHeight.value
  const estimatedContentHeight = estimatedVisibleContentHeight.value
  if (estimatedBlockHeight == null || estimatedContentHeight == null)
    return Math.ceil(reserved)

  const estimatedChromeHeight = Math.max(0, Math.ceil(estimatedBlockHeight) - Math.ceil(estimatedContentHeight))
  return Math.ceil(reserved + estimatedChromeHeight)
})

const codeEditorContainerStyle = computed(() => {
  // While the diff fallback pre is visible, the hidden runtime host must not
  // participate in layout. The fallback pre owns the row height.
  if (isDiff.value && showPreWhileRuntimeLoads.value)
    return {}

  const reserved = reservedEditorContentHeight.value
  if (!shouldReserveEstimatedEditorHeight.value || reserved == null)
    return {}
  return {
    minHeight: `${reserved}px`,
  }
})

function armEstimatedEditorHeightFloor() {
  plainEditorContentMeasured.value = false
  if (shouldIgnoreEstimatedPlainHeight()) {
    pendingEstimatedEditorHeightFloor.value = null
    return
  }

  const estimate = preFallbackReservedContentHeight.value
  pendingEstimatedEditorHeightFloor.value = !editorMounted.value && estimate != null
    ? estimate
    : null
}

function clearEstimatedEditorHeightFloor() {
  pendingEstimatedEditorHeightFloor.value = null
}

watch(
  () => [props.stream, props.loading, props.node.loading, isDiff.value] as const,
  ([stream, loading, _nodeLoading, diff]) => {
    const shouldActivate = !diff && stream !== false && loading !== false
    if (shouldActivate && !streamingLocalPreFallbackHeightActive.value) {
      streamingLocalPreFallbackHeightActive.value = true
      clearEstimatedEditorHeightFloor()
    }
    else if ((diff || stream === false) && streamingLocalPreFallbackHeightActive.value) {
      streamingLocalPreFallbackHeightActive.value = false
    }
  },
  { immediate: true },
)

function syncDiffScrollFromFallback() {
  const fallback = container.value?.querySelector('pre.code-pre-fallback') as HTMLElement | null
  const diffEditor = getDiffEditorView()
  const scrollTop = fallback?.scrollTop ?? 0
  diffEditor?.getOriginalEditor?.()?.setScrollTop?.(scrollTop)
  diffEditor?.getModifiedEditor?.()?.setScrollTop?.(scrollTop)
}

async function revealEditorDisplay() {
  if (!isDiff.value) {
    if (whenRuntimeVisualReady && !await whenRuntimeVisualReady())
      return false
    // Hold the grid row at the fallback <pre>'s full height (content + vertical
    // padding) while the stream-diffs surface is revealed, then settle on a
    // later frame. Without this pin, removing the fallback collapses the row by
    // its padding and any content-estimation delta in the same patch the surface
    // mounts, producing a CLS. Mirror the diff handoff below.
    syncEditorHostToFallbackHeight()
    layoutEditorToHost(true)
    editorHandoffPrepared.value = true
    await nextTick()
    syncEditorHostToFallbackHeight()
    layoutEditorToHost(true)
    await waitForAnimationFrame()
    syncEditorHostToFallbackHeight()
    layoutEditorToHost(true)
    editorDisplayReady.value = true
    await nextTick()
    // Keep the removal frame at the pinned fallback height; schedule the settle
    // on a subsequent frame instead of collapsing synchronously.
    scheduleEditorHeightSync()
    return true
  }

  // The editor is fully prepared while hidden. Flip the two layers in one Vue
  // patch so there is no visible pre-reveal or post-reveal validation state.
  syncEditorHostToFallbackHeight()
  syncDiffRevealHostHeight()
  layoutEditorToHost(true)
  syncDiffScrollFromFallback()
  syncInlineFoldProxies()
  // Let the runtime host enter its final grid position underneath the visible
  // fallback before removing that fallback. This avoids a second layout pass
  // shifting the first highlighted frame after it becomes visible.
  editorHandoffPrepared.value = true
  await nextTick()
  layoutEditorToHost(true)
  await waitForAnimationFrame()
  layoutEditorToHost(true)
  // `runEditorCreation()` already waited for the runtime's highlighted visual
  // commit. Do not invoke the same readiness gate again after moving the hidden
  // host into its final grid position: the runtime may start a new internal
  // revision during layout, which would leave the fallback visible indefinitely.
  syncFallbackFontMetricsFromEditor()
  syncDiffRevealHostHeight()
  // Commit the measured runtime height to the fallback while it is still
  // visible. The fallback and runtime use different diff row models; removing
  // the fallback before the browser has laid out this reactive pin exposes the
  // old folded-row height for one frame.
  if (!await stabilizeDiffHandoffHeight())
    return false
  editorDisplayReady.value = true
  await nextTick()
  syncDiffRevealHostHeight()
  layoutEditorToHost(true)
  syncFallbackFontMetricsFromEditor()
  syncInlineFoldProxies()
  // Keep the handoff row pin through the removal frame. Clearing it
  // synchronously after `nextTick()` can race the E2E/browser paint and expose
  // the old folded row before the finalized surface owns the row.
  // Keep the shell row pinned for two paint frames. The first frame is the
  // actual fallback-removal patch; clearing it there lets the old folded row
  // win the grid track before the finalized surface becomes the sole child.
  safeRaf(() => {
    if (isUnmounted)
      return
    safeRaf(() => {
      if (isUnmounted)
        return
      clearDiffShellContentHeight()
      scheduleEditorHeightSync(true)
    })
  })
  scheduleEditorHeightSync()
  return true
}

async function stabilizeDiffHandoffHeight() {
  if (!isDiff.value)
    return true

  for (let frame = 0; frame < 4; frame++) {
    const targetHeight = syncDiffRevealHostHeight()
    layoutEditorToHost(true)
    pinDiffFallbackToEditorHeight(targetHeight)
    syncDiffShellContentHeight(targetHeight)
    await nextTick()
    await waitForAnimationFrame()

    const fallback = container.value?.querySelector('pre.code-pre-fallback') as HTMLElement | null
    if (!fallback)
      return false

    // jsdom and other layout-less renderers report zero-sized boxes. The
    // enhanced DOM itself is sufficient there; real browsers must prove that
    // the visible fallback has adopted the measured runtime height.
    if (targetHeight == null)
      return hasRenderedDiffEditorDom()

    const fallbackHeight = fallback.getBoundingClientRect().height
    if (fallbackHeight > 0 && Math.abs(fallbackHeight - targetHeight) <= 2)
      return true
  }

  return false
}

function pinDiffFallbackToEditorHeight(targetHeight?: number | null) {
  if (!isDiff.value)
    return

  const editorHost = codeEditor.value
  const fallback = container.value?.querySelector('pre.code-pre-fallback') as HTMLElement | null
  if (!editorHost || !fallback)
    return

  const editorHeight = targetHeight ?? Number.parseFloat(editorHost.style.height || '')
  if (!Number.isFinite(editorHeight) || editorHeight <= 0)
    return

  const heightPx = Math.ceil(editorHeight)
  const height = `${heightPx}px`
  // Keep the pin in the reactive style contract as well as on the current DOM
  // node. Vue may patch the fallback after this function returns; the computed
  // style must reapply the same height instead of removing the direct pin.
  diffFallbackHandoffHeight.value = heightPx
  const handoffContainer = container.value
  if (handoffContainer)
    handoffContainer.dataset.markstreamDiffHandoffHeight = height
  fallback.dataset.markstreamDiffHandoffHeight = height
  fallback.style.setProperty('height', height)
  fallback.style.setProperty('min-height', height)
}

function syncDiffShellContentHeight(height?: number | null) {
  if (!isDiff.value)
    return

  const content = container.value?.querySelector('.code-block-shell-content') as HTMLElement | null
  const layer = container.value?.querySelector('.code-editor-layer') as HTMLElement | null
  if (!content || !layer)
    return

  const nextHeight = typeof height === 'number' && Number.isFinite(height) && height > 0
    ? Math.ceil(height)
    : Number.parseFloat(codeEditor.value?.style.height || '')
  if (!Number.isFinite(nextHeight) || nextHeight <= 0)
    return

  const value = `${nextHeight}px`
  // The editor layer is the actual grid-row owner. Keep both the layer and its
  // shell content explicit during handoff; setting only the child editor height
  // leaves the row at the previous folded fallback height until the next layout.
  layer.style.height = value
  layer.style.minHeight = value
  content.style.height = value
  content.style.minHeight = value
}

function clearDiffShellContentHeight() {
  const content = container.value?.querySelector('.code-block-shell-content') as HTMLElement | null
  const layer = container.value?.querySelector('.code-editor-layer') as HTMLElement | null
  if (!content || !layer)
    return

  layer.style.removeProperty('height')
  layer.style.removeProperty('min-height')
  content.style.removeProperty('height')
  content.style.removeProperty('min-height')
}

function syncDiffRevealHostHeight() {
  const editorHost = codeEditor.value
  if (editorHost && hasRenderedDiffEditorDom(editorHost)) {
    syncInlineFoldProxies()

    // Read the finalized surface before the generic model-height path can size
    // the hidden host back to the shorter fallback row. Unified Pierre diffs use
    // separator DOM that is not represented by the fallback's source rows.
    const renderedHeight = measureRenderedDiffHeight(editorHost)
    if (renderedHeight != null && renderedHeight > 0) {
      const contentHeight = Math.ceil(renderedHeight)
      const maxHeight = Math.ceil(getMaxHeightValue())
      const height = Math.min(contentHeight, maxHeight)
      const value = `${height}px`
      editorHost.style.height = value
      editorHost.style.minHeight = '0px'
      editorHost.style.maxHeight = `${maxHeight}px`
      editorHost.style.overflow = contentHeight > maxHeight + PIXEL_EPSILON ? 'auto' : 'hidden'

      if (showPreWhileRuntimeLoads.value) {
        diffFallbackHandoffHeight.value = height
        pinDiffFallbackToEditorHeight(height)
      }
      scheduleStreamingDiffHeightChase()
      return height
    }

    syncEditorHostHeight({ preferModelDiffHeight: true })
    pinDiffFallbackToEditorHeight()
    scheduleStreamingDiffHeightChase()
    return Number.parseFloat(editorHost.style.height || '') || null
  }
  return syncEditorHostToFallbackHeight()
}

function resolveHeightWithEstimatedEditorFloor(
  height: number,
  clearWhenSatisfied = false,
  options: { allowBelowEstimatedFloor?: boolean } = {},
) {
  const roundedHeight = Math.ceil(height)
  const floor = getPendingEstimatedEditorHeightFloor()

  if (floor == null)
    return roundedHeight

  const allowBelowFloor = options.allowBelowEstimatedFloor === true

  if (roundedHeight >= floor || allowBelowFloor) {
    if ((clearWhenSatisfied || allowBelowFloor) && editorMounted.value)
      clearEstimatedEditorHeightFloor()

    return roundedHeight
  }

  return floor
}

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

function measureLineHeightFromDom(): number | null {
  try {
    const root = codeEditor.value as HTMLElement | null
    if (!root)
      return null
    const surface = root.querySelector<HTMLElement>('.stream-diffs-shell .stream-diffs-surface')
      ?? root.querySelector<HTMLElement>('.stream-diffs-shell')
    if (surface) {
      const h = Math.ceil(surface.getBoundingClientRect().height)
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
      const info = ed.getOption?.(key) as { fontSize?: unknown } | undefined
      const size = info?.fontSize
      if (typeof size === 'number' && Number.isFinite(size) && size > 0)
        return size
    }
  }
  catch {}
  try {
    const root = codeEditor.value as HTMLElement | null
    if (root) {
      const surface = root.querySelector<HTMLElement>('.stream-diffs-shell .stream-diffs-surface')
        ?? root.querySelector<HTMLElement>('.stream-diffs-shell')
      if (surface) {
        try {
          if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
            const fs = window.getComputedStyle(surface).fontSize
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

function readActualCharacterWidthFromEditor(): number | null {
  try {
    const ed = isDiff.value ? getDiffEditorView()?.getModifiedEditor?.() ?? getDiffEditorView() : getEditorView()
    const mon = getEditor()
    const key = mon?.EditorOption?.fontInfo
    if (ed && key != null) {
      const info = ed.getOption?.(key) as { typicalHalfwidthCharacterWidth?: unknown } | undefined
      const width = info?.typicalHalfwidthCharacterWidth
      if (typeof width === 'number' && Number.isFinite(width) && width > 0)
        return width
    }
  }
  catch {}
  return null
}

function getLineHeightSafe(editor: StreamDiffsEditorViewLike | null | undefined): number {
  try {
    const editorNamespace = getEditor()
    const key = editorNamespace?.EditorOption?.lineHeight
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
  const fs = Number.isFinite(codeFontSize.value) && codeFontSize.value! > 0 ? (codeFontSize.value as number) : 14
  // Conservative fallback close to the runtime's default ratio.
  return Math.max(12, Math.round(fs * 1.35))
}

function getVerticalPaddingSafe(): number {
  const configuredPadding = props.codeBlockOptions?.padding
  if (typeof configuredPadding === 'number' && Number.isFinite(configuredPadding))
    return Math.max(0, configuredPadding) * 2

  return isDiff.value ? 24 : 0
}

function hasLanguageHighlightReady(root: HTMLElement | null | undefined) {
  if (isPlainTextLanguage.value)
    return true
  if (!root)
    return false
  // stream-diffs owns its highlight commit; the surface is ready once the
  // diffs-container exists and `whenVisualReady` confirms it.
  return hasRenderedDiffsDom(root) || whenRuntimeVisualReady != null
}

function syncEstimatedDiffStats() {
  if (!isDiff.value) {
    diffStats.value = { removed: 0, added: 0 }
    return
  }

  // Use the same source-line diff model as the fallback. The enhanced runtime
  // exposes hunk ranges, but those ranges describe the rendered diff surface
  // and can include visual rows that do not represent additional source lines.
  // Header counts are a source contract: one changed logical line is `-1 +1`.
  diffStats.value = estimateDiffStats(
    String(props.node.originalCode ?? ''),
    String(props.node.updatedCode ?? ''),
  )
}

function refreshDiffStats() {
  // The runtime hunk ranges include the hunk's context rows in stream-diffs
  // 0.0.2. They are useful for presentation, but not for the header contract:
  // header counts must describe changed logical source lines, never visual
  // wrapped rows or unchanged context inside a hunk.
  syncEstimatedDiffStats()
}

function ensureFontBaseline() {
  if (Number.isFinite(codeFontSize.value) && (codeFontSize.value as number) > 0 && Number.isFinite(defaultCodeFontSize.value))
    return codeFontSize.value as number
  if (typeof props.codeBlockOptions?.fontSize === 'number') {
    defaultCodeFontSize.value = props.codeBlockOptions.fontSize
    codeFontSize.value = props.codeBlockOptions.fontSize
    return props.codeBlockOptions.fontSize
  }
  const actual = readActualFontSizeFromEditor()
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
  // Prefer the runtime content height; fall back to line count times line height.
  try {
    const diffEditor = isDiff.value ? getDiffEditorView() : null
    const editor = isDiff.value ? diffEditor : getEditorView()
    if (!editor)
      return null
    if (diffEditor?.getOriginalEditor && diffEditor?.getModifiedEditor) {
      const o = diffEditor.getOriginalEditor?.()
      const m = diffEditor.getModifiedEditor?.()
      o?.layout?.()
      m?.layout?.()
      const oh = (o?.getContentHeight?.() as number) || 0
      const mh = (m?.getContentHeight?.() as number) || 0
      const h = Math.max(oh, mh)
      if (h > 0)
        return Math.ceil(h)
      // fallback per-editor line count
      const olc = o?.getModel?.()?.getLineCount?.() || 1
      const mlc = m?.getModel?.()?.getLineCount?.() || 1
      const lc = Math.max(olc, mlc)
      const lh = Math.max(getLineHeightSafe(o), getLineHeightSafe(m))
      const verticalPadding = getVerticalPaddingSafe()
      return Math.ceil(lc * lh + verticalPadding + CONTENT_PADDING)
    }
    else if (editor?.getContentHeight) {
      editor?.layout?.()
      const h = editor.getContentHeight()
      if (h > 0) {
        if (!isDiff.value)
          plainEditorContentMeasured.value = true
        return Math.ceil(h)
      }
    }
    // generic fallback
    const model = editor?.getModel?.()
    let lineCount = 1
    if (model && typeof model.getLineCount === 'function') {
      lineCount = model.getLineCount()
    }
    const lh = getLineHeightSafe(editor)
    return Math.ceil(lineCount * (lh + LINE_EXTRA_PER_LINE) + CONTENT_PADDING)
  }
  catch {
    return null
  }
}

function hasMeasuredPlainEditorContentHeight() {
  if (isDiff.value)
    return false
  try {
    const height = getEditorView()?.getContentHeight?.()
    const hasHeight = typeof height === 'number' && Number.isFinite(height) && height > 0
    if (hasHeight)
      plainEditorContentMeasured.value = true
    return hasHeight
  }
  catch {
    return false
  }
}

function measureRenderedDiffHeight(container: HTMLElement): number | null {
  if (typeof window === 'undefined')
    return null
  try {
    const hostStyle = window.getComputedStyle(container)
    // The enhanced host is intentionally visibility-hidden during handoff.
    // Hidden elements still have layout boxes; rejecting them here prevents
    // measuring the finalized surface before the fallback is removed.
    if (hostStyle.display === 'none')
      return null

    const diffsRoot = container.querySelector('diffs-container')
    if (diffsRoot instanceof HTMLElement) {
      const diffsRect = diffsRoot.getBoundingClientRect()
      if (diffsRect.height > 0)
        return Math.ceil(diffsRect.height)
    }

    const shell = container.querySelector<HTMLElement>('.stream-diffs-shell')
    if (shell) {
      const shellRect = shell.getBoundingClientRect()
      if (shellRect.height > 0)
        return Math.ceil(shellRect.height)
    }

    return null
  }
  catch {
    return null
  }
}

function estimateDiffEditorContentHeight(): number | null {
  if (hasRenderedDiffsDom())
    return null

  try {
    const diffEditor = getDiffEditorView()
    const originalEditor = diffEditor?.getOriginalEditor?.()
    const modifiedEditor = diffEditor?.getModifiedEditor?.()
    if (!originalEditor || !modifiedEditor)
      return null
    const originalLines = originalEditor.getModel?.()?.getLineCount?.() || 1
    const modifiedLines = modifiedEditor.getModel?.()?.getLineCount?.() || 1
    const lineCount = Math.max(originalLines, modifiedLines)
    const lineHeight = Math.max(
      getLineHeightSafe(originalEditor),
      getLineHeightSafe(modifiedEditor),
    )
    const verticalPadding = getVerticalPaddingSafe()
    const contentHeight = Math.max(
      originalEditor.getContentHeight?.() ?? 0,
      modifiedEditor.getContentHeight?.() ?? 0,
    )
    return Math.ceil(Math.max(
      contentHeight,
      lineCount * lineHeight + verticalPadding + CONTENT_PADDING,
    ))
  }
  catch {
    return null
  }
}

function getColorLuminance(color: string) {
  const normalized = String(color ?? '').trim()
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (hex) {
    const full = hex.length === 3
      ? hex.split('').map(char => `${char}${char}`).join('')
      : hex
    const r = Number.parseInt(full.slice(0, 2), 16)
    const g = Number.parseInt(full.slice(2, 4), 16)
    const b = Number.parseInt(full.slice(4, 6), 16)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  const channels = normalized.match(/\d+(?:\.\d+)?/g)
  if (!channels || channels.length < 3)
    return null
  const [r, g, b] = channels.slice(0, 3).map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function shouldPreferPlainTextFallbackSurface(bg: string, fg: string, expectDark: boolean) {
  if (!isPlainTextLanguage.value)
    return false

  const bgLuminance = getColorLuminance(bg)
  const fgLuminance = getColorLuminance(fg)

  if (expectDark) {
    return (bgLuminance != null && bgLuminance > 170)
      || (fgLuminance != null && fgLuminance < 110)
  }

  return (bgLuminance != null && bgLuminance < 85)
    || (fgLuminance != null && fgLuminance > 190)
}

// Copy computed CSS variables from the editor DOM up to the component root so
// the header (which lives alongside the editor but outside its inner DOM)
// can use variables like --vscode-editor-foreground / --vscode-editor-background.
function clearLayerMeasuredVars() {
  // No-op: stream-diffs owns its surface layout variables.
}

function syncFallbackFontMetricsFromEditor() {
  if (shouldFreezeVisibleDiffFallbackMetrics())
    return

  const fontSize = readActualFontSizeFromEditor()
  if (fontSize && fontSize > 0) {
    measuredEditorFontSize.value = fontSize
    codeFontSize.value = fontSize
    defaultCodeFontSize.value = fontSize
  }
  try {
    const editor = isDiff.value
      ? getDiffEditorView()?.getModifiedEditor?.() ?? getDiffEditorView()
      : getEditorView()
    const lineHeight = getLineHeightSafe(editor)
    if (lineHeight && lineHeight > 0)
      measuredEditorLineHeight.value = lineHeight
  }
  catch {}
  try {
    const domLineHeight = measureLineHeightFromDom()
    if (domLineHeight && domLineHeight > 0)
      measuredEditorLineHeight.value = domLineHeight
  }
  catch {}
}

function shouldFreezeVisibleDiffFallbackMetrics() {
  return isDiff.value && renderPreFallback.value
}

// Sync the editor host to the fallback pre height while the fallback is visible,
// so the transition from fallback → editor has no height jump. Covers both diff
// and single-editor surfaces: the fallback <pre> owns the grid row height in its
// full form (content + vertical padding), and the host must match that exact
// height before the fallback is removed, otherwise removing it collapses the row.
function syncEditorHostToFallbackHeight() {
  if (
    !showPreWhileRuntimeLoads.value
  ) {
    return null
  }

  const editorHost = codeEditor.value
  const fallback = container.value?.querySelector('pre.code-pre-fallback') as HTMLElement | null

  if (!editorHost || !fallback)
    return null

  const fallbackHeight = Math.ceil(fallback.getBoundingClientRect().height)
  const renderedDiffHeight = isDiff.value ? measureRenderedDiffHeight(editorHost) : null
  const contentHeight = Math.max(
    fallbackHeight,
    renderedDiffHeight != null && renderedDiffHeight > 0 ? Math.ceil(renderedDiffHeight) : 0,
  )
  const maxHeight = Math.ceil(getMaxHeightValue())
  const height = Math.min(contentHeight, maxHeight)
  if (!Number.isFinite(height) || height <= 0)
    return null

  if (isDiff.value && height > fallbackHeight)
    diffFallbackHandoffHeight.value = height

  editorHost.style.height = `${height}px`
  editorHost.style.minHeight = `${height}px`
  editorHost.style.maxHeight = `${maxHeight}px`
  editorHost.style.overflow = contentHeight > maxHeight + PIXEL_EPSILON ? 'auto' : 'hidden'
  return height
}

function syncEditorCssVars() {
  const editorEl = codeEditor.value as HTMLElement | null
  const rootEl = container.value as HTMLElement | null
  if (!editorEl || !rootEl)
    return
  // Runtime theme variables belong to the editor container, not the shell.
  const targetEl = editorEl
  targetEl.style.setProperty('--markstream-diff-metadata-bg', preFallbackThemePalette.value.background)
  targetEl.style.setProperty('--markstream-diff-metadata-fg', preFallbackThemePalette.value.lineNumber)
  // Align the enhanced surface with the pre-fallback geometry. stream-diffs /
  // pierre honor these CSS variables on the editor host (custom properties
  // inherit across the pierre shadow boundary):
  // - `--diffs-tab-size`: fallback defaults to 4, pierre defaults to 2.
  // - `--diffs-gap-block`: only set when the consumer explicitly configures
  //   padding — the default 8px gap already matches the fallback.
  targetEl.style.setProperty('--diffs-tab-size', String(preFallbackTabSize.value))
  // stream-diffs reserves a transparent 6px horizontal scrollbar track by
  // default and subtracts it from computed bottom padding. The shared pre
  // surface already owns that space in its padding, so keep the runtime's
  // computed four-edge padding identical and preserve the same total height.
  targetEl.style.setProperty('--diffs-scrollbar-gutter-override', '0px')
  const configuredPadding = props.codeBlockOptions?.padding
  if (typeof configuredPadding === 'number')
    targetEl.style.setProperty('--diffs-gap-block', `${preFallbackVerticalPadding.value.top}px`)
  else
    targetEl.style.removeProperty('--diffs-gap-block')
  // stream-diffs usually applies theme variables on the shell / editor surface;
  // try to read from there, falling back to the editor host element.
  const editorRoot = (editorEl.querySelector('.stream-diffs-shell') || editorEl) as HTMLElement
  const bgEl = editorRoot
  const fgEl = editorRoot

  let rootStyles: CSSStyleDeclaration | null = null
  let bgStyles: CSSStyleDeclaration | null = null
  let fgStyles: CSSStyleDeclaration | null = null
  try {
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      rootStyles = window.getComputedStyle(editorRoot)
      bgStyles = bgEl === editorRoot ? rootStyles : window.getComputedStyle(bgEl)
      fgStyles = fgEl === editorRoot ? rootStyles : window.getComputedStyle(fgEl)
    }
  }
  catch {
    rootStyles = null
    bgStyles = null
    fgStyles = null
  }
  const fgVar = String(rootStyles?.getPropertyValue('--vscode-editor-foreground') ?? '').trim()
  const bgVar = String(rootStyles?.getPropertyValue('--vscode-editor-background') ?? '').trim()
  const selVar = String(
    rootStyles?.getPropertyValue('--vscode-editor-selectionBackground')
    ?? rootStyles?.getPropertyValue('--vscode-editor-hoverHighlightBackground')
    ?? '',
  ).trim()

  const fg = fgVar || String(fgStyles?.color ?? rootStyles?.color ?? '').trim()
  const bg = bgVar || String(bgStyles?.backgroundColor ?? rootStyles?.backgroundColor ?? '').trim()
  const characterWidth = readActualCharacterWidthFromEditor()
  if (characterWidth != null)
    measuredEditorCharacterWidth.value = characterWidth

  if (isDiff.value) {
    const setDiffVar = (name: string, value: string) => {
      if (value) {
        rootEl.style.setProperty(name, value)
        targetEl.style.setProperty(name, value)
      }
      else {
        rootEl.style.removeProperty(name)
        targetEl.style.removeProperty(name)
      }
    }

    for (const [name, value] of Object.entries(getDiffVisualVars(rootEl.classList.contains('is-dark'))))
      setDiffVar(name, value)

    if (fg) {
      rootEl.style.setProperty('--markstream-diff-editor-fg', fg)
      targetEl.style.setProperty('--vscode-editor-foreground', fg)
    }
    else {
      rootEl.style.removeProperty('--markstream-diff-editor-fg')
      targetEl.style.removeProperty('--vscode-editor-foreground')
    }

    if (bg) {
      rootEl.style.setProperty('--markstream-diff-editor-bg', bg)
      rootEl.style.setProperty('--markstream-diff-panel-bg', bg)
      rootEl.style.setProperty('--markstream-diff-panel-bg-soft', bg)
      rootEl.style.setProperty('--markstream-diff-panel-bg-strong', bg)
      targetEl.style.setProperty('--vscode-editor-background', bg)
      targetEl.style.backgroundColor = bg
    }
    else {
      rootEl.style.removeProperty('--markstream-diff-editor-bg')
      rootEl.style.removeProperty('--markstream-diff-panel-bg')
      rootEl.style.removeProperty('--markstream-diff-panel-bg-soft')
      rootEl.style.removeProperty('--markstream-diff-panel-bg-strong')
      targetEl.style.removeProperty('--vscode-editor-background')
      targetEl.style.backgroundColor = ''
    }

    if (selVar)
      targetEl.style.setProperty('--vscode-editor-selectionBackground', selVar)
    else
      targetEl.style.removeProperty('--vscode-editor-selectionBackground')
    return
  }

  if (shouldPreferPlainTextFallbackSurface(bg, fg, rootEl.classList.contains('is-dark'))) {
    targetEl.style.removeProperty('--vscode-editor-foreground')
    targetEl.style.removeProperty('--vscode-editor-background')
    targetEl.style.removeProperty('--vscode-editor-selectionBackground')
    return
  }

  if (fg)
    targetEl.style.setProperty('--vscode-editor-foreground', fg)
  if (bg)
    targetEl.style.setProperty('--vscode-editor-background', bg)
  if (selVar)
    targetEl.style.setProperty('--vscode-editor-selectionBackground', selVar)
}

let resizeSyncHandler: (() => void) | null = null
let lastEditorLayoutWidth = 0
let lastEditorLayoutHeight = 0
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

function isExternallyManagedScroll(container: HTMLElement) {
  return codeBlockHostScrollManaged.value || isHostScrollManagedCodeBlockElement(container)
}

function adjustScrollAfterHeightChange(container: HTMLElement, previousHeight: number, nextHeight: number) {
  if (typeof window === 'undefined')
    return
  if (isDiff.value)
    return
  if (isExternallyManagedScroll(container))
    return

  const roundedPrev = Math.ceil(previousHeight)
  const roundedNext = Math.ceil(nextHeight)
  const delta = roundedNext - roundedPrev

  // 1px is usually runtime/pre/browser rounding noise. Never mutate scrollTop
  // for it, even outside a virtualizer.
  if (Math.abs(delta) <= 1)
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
      const allowBelowEstimatedFloor = !isDiff.value
        && editorMounted.value
        && hasMeasuredPlainEditorContentHeight()
      const nextHeight = resolveHeightWithEstimatedEditorFloor(h, true, { allowBelowEstimatedFloor })
      const floor = getPendingEstimatedEditorHeightFloor()
      container.style.minHeight = floor != null ? `${floor}px` : '0px'
      container.style.height = `${nextHeight}px`
      container.style.maxHeight = 'none'
      container.style.overflow = 'visible'
      adjustScrollAfterHeightChange(container, oldHeight, nextHeight)
      return
    }
    const floor = getPendingEstimatedEditorHeightFloor()
    if (floor != null) {
      container.style.minHeight = `${floor}px`
      container.style.height = `${floor}px`
      container.style.maxHeight = 'none'
      container.style.overflow = 'visible'
      adjustScrollAfterHeightChange(container, oldHeight, floor)
    }
  }
  catch {}
}

function clearEditorHeightSyncBindings() {
  while (editorHeightSyncDisposables.length > 0) {
    try {
      editorHeightSyncDisposables.pop()?.dispose?.()
    }
    catch {}
  }
  if (deferredHeightSyncRafId != null) {
    safeCancelRaf(deferredHeightSyncRafId)
    deferredHeightSyncRafId = null
  }
  if (deferredHeightSyncFollowUpRafId != null) {
    safeCancelRaf(deferredHeightSyncFollowUpRafId)
    deferredHeightSyncFollowUpRafId = null
  }
  if (streamingDiffHeightChaseRafId != null) {
    safeCancelRaf(streamingDiffHeightChaseRafId)
    streamingDiffHeightChaseRafId = null
  }
  streamingDiffHeightChaseFrames = 0
  streamingDiffHeightChaseAllowSettled = false
}

function clearInlineFoldProxies() {
  while (inlineFoldProxyCleanups.length > 0) {
    try {
      inlineFoldProxyCleanups.pop()?.()
    }
    catch {}
  }
}

function syncEditorHostHeight(options: boolean | EditorHostHeightSyncOptions = false) {
  if (isCollapsed.value)
    return
  if (isExpanded.value)
    updateExpandedHeight()
  else
    updateCollapsedHeight(typeof options === 'object' ? options : {})
}

function resetEditorLayoutCache() {
  lastEditorLayoutWidth = 0
  lastEditorLayoutHeight = 0
}

function layoutEditorToHost(force = false) {
  if (isCollapsed.value)
    return

  const host = codeEditor.value
  if (!host)
    return

  const editor = isDiff.value ? getDiffEditorView() : getEditorView()
  if (!editor || typeof editor.layout !== 'function')
    return

  try {
    const rect = host.getBoundingClientRect?.()
    const width = Math.ceil((rect?.width ?? 0) || host.clientWidth || 0)
    const height = Math.ceil(
      (rect?.height ?? 0)
      || host.clientHeight
      || Number.parseFloat(host.style.height || '')
      || 0,
    )

    if (width > 0 && height > 0) {
      if (!force && width === lastEditorLayoutWidth && height === lastEditorLayoutHeight)
        return
      lastEditorLayoutWidth = width
      lastEditorLayoutHeight = height
      editor.layout({ width, height })
    }
    else {
      resetEditorLayoutCache()
      editor.layout()
    }
  }
  catch {}
}

function syncInlineFoldProxies() {
  // stream-diffs owns unchanged-region controls inside its surface.
  clearInlineFoldProxies()
}

function scheduleEditorHeightSync(allowDuringStreamingDiff = false) {
  if (isUnmounted || deferredHeightSyncRafId != null)
    return
  const sync = () => {
    if (isUnmounted)
      return
    syncInlineFoldProxies()
    syncEditorHostHeight(allowDuringStreamingDiff)
    layoutEditorToHost()
  }
  deferredHeightSyncRafId = safeRaf(() => {
    deferredHeightSyncRafId = null
    sync()
    deferredHeightSyncFollowUpRafId = safeRaf(() => {
      deferredHeightSyncFollowUpRafId = null
      sync()
    })
  })
  scheduleStreamingDiffHeightChase()
}

function scheduleStreamingDiffHeightChase(allowSettled = false) {
  if (!isDiff.value || isUnmounted || (!allowSettled && props.loading === false))
    return

  streamingDiffHeightChaseAllowSettled = streamingDiffHeightChaseAllowSettled || allowSettled
  streamingDiffHeightChaseFrames = Math.max(streamingDiffHeightChaseFrames, allowSettled ? 18 : 6)
  if (streamingDiffHeightChaseRafId != null)
    return

  const tick = () => {
    streamingDiffHeightChaseRafId = null
    if (
      !isDiff.value
      || isUnmounted
      || streamingDiffHeightChaseFrames <= 0
      || (!streamingDiffHeightChaseAllowSettled && props.loading === false)
    ) {
      streamingDiffHeightChaseFrames = 0
      streamingDiffHeightChaseAllowSettled = false
      return
    }

    streamingDiffHeightChaseFrames--
    syncInlineFoldProxies()
    syncEditorHostHeight({
      preferModelDiffHeight: true,
      holdCurrentDiffHeight: streamingDiffHeightChaseAllowSettled,
    })
    layoutEditorToHost()
    if (streamingDiffHeightChaseFrames > 0) {
      streamingDiffHeightChaseRafId = safeRaf(tick)
    }
    else {
      streamingDiffHeightChaseAllowSettled = false
    }
  }

  streamingDiffHeightChaseRafId = safeRaf(tick)
}

function applyCollapsedContainerHeight(
  container: HTMLElement,
  contentHeight: number,
  maxHeight: number,
  options: {
    clearEstimatedFloor?: boolean
    allowBelowEstimatedFloor?: boolean
    preserveScrollableOverflow?: boolean
    renderedStreamingDiffHeight?: number | null
  } = {},
) {
  const streamingGuardActive = isDiff.value && props.loading !== false
  const renderedStreamingDiffHeight = 'renderedStreamingDiffHeight' in options
    ? (streamingGuardActive ? (options.renderedStreamingDiffHeight ?? null) : null)
    : (streamingGuardActive ? measureRenderedDiffHeight(container) : null)
  const resolvedContentHeight = renderedStreamingDiffHeight != null
    && renderedStreamingDiffHeight > contentHeight + PIXEL_EPSILON
    ? renderedStreamingDiffHeight
    : contentHeight
  const cappedHeight = Math.min(resolvedContentHeight, maxHeight)
  const allowBelowEstimatedFloor = options.allowBelowEstimatedFloor === true

  const nextHeight = resolveHeightWithEstimatedEditorFloor(
    cappedHeight,
    options.clearEstimatedFloor === true,
    { allowBelowEstimatedFloor },
  )
  const floor = getPendingEstimatedEditorHeightFloor()

  container.style.minHeight = floor != null && !allowBelowEstimatedFloor
    ? `${Math.min(floor, Math.ceil(maxHeight))}px`
    : '0px'

  container.style.height = `${nextHeight}px`
  container.style.maxHeight = `${Math.ceil(maxHeight)}px`
  const shouldScroll = options.preserveScrollableOverflow === true
    || resolvedContentHeight > maxHeight + PIXEL_EPSILON
    || hasScrollableOverflow(container, nextHeight)
  container.style.overflow = shouldScroll ? 'auto' : 'hidden'

  return nextHeight
}

function hasScrollableOverflow(container: HTMLElement, visibleHeight = 0) {
  const rectHeight = Math.ceil(container.getBoundingClientRect?.().height || 0)
  const viewportHeight = Math.max(visibleHeight, container.clientHeight || 0, rectHeight)
  return viewportHeight > 0
    && container.scrollHeight > viewportHeight + PIXEL_EPSILON
}

function shouldRestoreScrollableOverflow(container: HTMLElement) {
  return wasScrollableBeforeCollapse
    || hasScrollableOverflow(container, heightBeforeCollapse.value ?? 0)
}

function bindEditorHeightSync() {
  clearEditorHeightSyncBindings()

  if (isDiff.value) {
    const diff = getDiffEditorView()
    const originalEditor = diff?.getOriginalEditor?.()
    const modifiedEditor = diff?.getModifiedEditor?.()

    const bind = (
      source: StreamDiffsEditorViewLike | null | undefined,
      eventName: 'onDidContentSizeChange' | 'onDidLayoutChange',
    ) => {
      try {
        const subscribe = source?.[eventName]
        if (typeof subscribe !== 'function')
          return
        const disposable = subscribe.call(source, () => scheduleEditorHeightSync())
        if (disposable)
          editorHeightSyncDisposables.push(disposable)
      }
      catch {}
    }

    try {
      const disposable = diff?.onDidUpdateDiff?.(() => {
        scheduleEditorHeightSync()
        safeRaf(() => refreshDiffStats())
      })
      if (disposable)
        editorHeightSyncDisposables.push(disposable)
    }
    catch {}
    bind(originalEditor, 'onDidContentSizeChange')
    bind(modifiedEditor, 'onDidContentSizeChange')
    const host = codeEditor.value
    if (host && typeof MutationObserver !== 'undefined') {
      const syncMutationSelector = [
        'diffs-container',
        '.stream-diffs-shell',
        '.stream-diffs-surface',
      ].join(',')
      const isRelevantMutationTarget = (node: Node) => {
        const el = node instanceof HTMLElement ? node : node.parentElement
        return Boolean(el?.closest?.(syncMutationSelector))
      }
      const hasRelevantMutationSubtree = (node: Node) => {
        const el = node instanceof HTMLElement ? node : node.parentElement
        return Boolean(el?.closest?.(syncMutationSelector) || el?.querySelector?.(syncMutationSelector))
      }
      const observer = new MutationObserver((mutations) => {
        if (!isDiff.value)
          return
        if (!shouldAllowDiffDomHeightShrink())
          return
        const shouldSync = mutations.some(mutation =>
          isRelevantMutationTarget(mutation.target)
          || Array.from(mutation.addedNodes).some(hasRelevantMutationSubtree)
          || Array.from(mutation.removedNodes).some(isRelevantMutationTarget),
        )
        if (!shouldSync)
          return
        syncInlineFoldProxies()
        syncEditorHostHeight({ preferModelDiffHeight: true })
        layoutEditorToHost()
        scheduleStreamingDiffHeightChase()
      })
      observer.observe(host, {
        attributeFilter: ['class'],
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      })
      editorHeightSyncDisposables.push({ dispose: () => observer.disconnect() })
    }
    if (host && typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        if (!isDiff.value)
          return
        layoutEditorToHost()
        if (!shouldAllowDiffDomHeightShrink())
          return
        const renderedHeight = measureRenderedDiffHeight(host)
        if (renderedHeight == null)
          return
        const hostHeight = Math.ceil(host.getBoundingClientRect().height || 0)
        if (hostHeight <= renderedHeight + PIXEL_EPSILON)
          return
        syncInlineFoldProxies()
        syncEditorHostHeight({ preferModelDiffHeight: true })
        layoutEditorToHost()
      })
      resizeObserver.observe(host)
      editorHeightSyncDisposables.push({ dispose: () => resizeObserver.disconnect() })
    }
    return
  }

  const editor = getEditorView()
  try {
    const disposable = editor?.onDidContentSizeChange?.(() => scheduleEditorHeightSync())
    if (disposable)
      editorHeightSyncDisposables.push(disposable)
  }
  catch {}
  try {
    const disposable = editor?.onDidLayoutChange?.(() => scheduleEditorHeightSync())
    if (disposable)
      editorHeightSyncDisposables.push(disposable)
  }
  catch {}
}

interface EditorHostHeightSyncOptions {
  preferModelDiffHeight?: boolean
  holdCurrentDiffHeight?: boolean
}

function updateCollapsedHeight(options: EditorHostHeightSyncOptions = {}) {
  try {
    const container = codeEditor.value
    if (!container)
      return

    const oldHeight = container.getBoundingClientRect().height
    const currentRectHeight = Math.ceil(oldHeight || 0)

    const max = getMaxHeightValue()
    const rectH = currentRectHeight
    const styleH = Number.parseFloat(container.style.height || '')
    const currentHostHeight = rectH > 0
      ? rectH
      : Number.isFinite(styleH) && styleH > 0 ? Math.ceil(styleH) : 0
    const estimatedDiffHeight = isDiff.value ? estimateDiffEditorContentHeight() : null
    const hasRenderedDiffDom = isDiff.value && hasRenderedDiffEditorDom(container)
    if (resumeGuardFrames > 0) {
      resumeGuardFrames--
      if (heightBeforeCollapse.value != null) {
        const h = applyCollapsedContainerHeight(container, heightBeforeCollapse.value, max, {
          preserveScrollableOverflow: shouldRestoreScrollableOverflow(container),
        })
        adjustScrollAfterHeightChange(container, oldHeight, h)
        return
      }
    }
    if (isDiff.value && !hasRenderedDiffDom && showPreWhileRuntimeLoads.value) {
      const fallbackHeight = syncEditorHostToFallbackHeight()
      if (fallbackHeight != null) {
        const h = applyCollapsedContainerHeight(container, fallbackHeight, max, {
          allowBelowEstimatedFloor: true,
        })
        layoutEditorToHost(true)
        adjustScrollAfterHeightChange(container, oldHeight, h)
        return
      }
    }
    const preferModelDiffHeight = isDiff.value && options.preferModelDiffHeight === true
    const renderedDiffHeight = isDiff.value ? measureRenderedDiffHeight(container) : null
    const measuredDiffHeight = renderedDiffHeight
    const allowBelowPlainEstimatedFloor = !isDiff.value
      && editorMounted.value
      && hasMeasuredPlainEditorContentHeight()
    const allowBelowStreamingDiffEstimatedFloor = isDiff.value
      && props.loading !== false
      && (
        measuredDiffHeight != null
        || (
          estimatedDiffHeight != null
          && rectH > 0
          && estimatedDiffHeight < rectH - PIXEL_EPSILON
        )
      )
    const shouldKeepDiffEstimatedFloor = estimatedDiffHeight != null
    let h0: number | null
    if (!isDiff.value) {
      h0 = computeContentHeight()
    }
    else if (preferModelDiffHeight) {
      const shouldShrinkToModel = estimatedDiffHeight != null
        && props.loading === false
        && currentHostHeight > 0
        && estimatedDiffHeight < currentHostHeight - PIXEL_EPSILON
      if (props.loading === false && measuredDiffHeight != null) {
        h0 = estimatedDiffHeight == null
          ? measuredDiffHeight
          : Math.max(measuredDiffHeight, estimatedDiffHeight)
      }
      else {
        h0 = shouldShrinkToModel
          ? estimatedDiffHeight
          : measuredDiffHeight != null && estimatedDiffHeight != null
            ? Math.max(measuredDiffHeight, estimatedDiffHeight, props.loading !== false ? currentHostHeight : 0)
            : Math.max(
              measuredDiffHeight ?? 0,
              estimatedDiffHeight ?? 0,
              props.loading !== false ? currentHostHeight : 0,
            ) || null
      }
    }
    else if (preFallbackDiffInline.value && measuredDiffHeight != null) {
      h0 = shouldKeepDiffEstimatedFloor
        ? Math.max(measuredDiffHeight, estimatedDiffHeight)
        : measuredDiffHeight
    }
    else if (measuredDiffHeight != null) {
      h0 = shouldKeepDiffEstimatedFloor
        ? Math.max(measuredDiffHeight, estimatedDiffHeight)
        : measuredDiffHeight
    }
    else {
      if (isDiff.value && props.loading !== false) {
        h0 = estimatedDiffHeight != null
          && currentHostHeight > 0
          && estimatedDiffHeight < currentHostHeight - PIXEL_EPSILON
          ? estimatedDiffHeight
          : currentHostHeight > 0 ? currentHostHeight : null
      }
      else {
        h0 = estimatedDiffHeight
      }
    }
    if (
      isDiff.value
      && h0 != null
      && currentHostHeight > 0
      && (
        props.loading !== false
        || options.holdCurrentDiffHeight === true
      )
    ) {
      h0 = Math.max(h0, currentHostHeight)
    }
    // 1) 有实时内容高度 -> 采用原始内容高度（未裁剪前）
    if (h0 != null && h0 > 0) {
      const h = applyCollapsedContainerHeight(container, h0, max, {
        clearEstimatedFloor: true,
        allowBelowEstimatedFloor: allowBelowPlainEstimatedFloor || allowBelowStreamingDiffEstimatedFloor,
        preserveScrollableOverflow: shouldRestoreScrollableOverflow(container),
        renderedStreamingDiffHeight: measuredDiffHeight,
      })
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    // 2) 使用折叠前的内容高度（不更新记忆值）
    if (heightBeforeCollapse.value != null) {
      const h = applyCollapsedContainerHeight(container, heightBeforeCollapse.value, max, {
        preserveScrollableOverflow: shouldRestoreScrollableOverflow(container),
      })
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    const stableFallbackHeight = isDiff.value && props.loading !== false
      ? rectH
      : Math.max(
          rectH,
          estimatedDiffHeight != null && estimatedDiffHeight > 0 ? estimatedDiffHeight : 0,
        )
    // 3) 使用当前 DOM 高度或保守估算高度（不更新记忆值）
    if (stableFallbackHeight > 0) {
      const h = applyCollapsedContainerHeight(container, stableFallbackHeight, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    const floor = getPendingEstimatedEditorHeightFloor()
    if (floor != null && !(isDiff.value && props.loading !== false && hasRenderedDiffDom)) {
      const h = applyCollapsedContainerHeight(container, floor, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    // 4) 兜底：若有先前行高/字体，可估一个最小高度；否则保持现状，避免强制跳到 MAX
    const prev = Number.parseFloat(container.style.height)
    if (!Number.isNaN(prev) && prev > 0) {
      const h = applyCollapsedContainerHeight(container, prev, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
    }
    else if (!isDiff.value) {
      // 实在没有历史高度，才退到 max（极少数首次场景）
      const h = applyCollapsedContainerHeight(container, max, max)
      adjustScrollAfterHeightChange(container, oldHeight, h)
    }
  }
  catch {}
}

function hasRenderedDiffEditorDom(root = codeEditor.value) {
  return hasRenderedDiffsDom(root)
}

function hasRenderedSingleEditorDom(root = codeEditor.value) {
  return hasRenderedDiffsDom(root)
}

function hasCurrentSingleEditorContent() {
  if (hasRenderedDiffsDom())
    return true
  const model = getEditorView()?.getModel?.()
  return typeof model?.getValue === 'function'
    && model.getValue() === displayCode.value
}

function hasRenderedDiffsDom(root = codeEditor.value) {
  return Boolean(root?.querySelector('diffs-container'))
}

function shouldAllowDiffDomHeightShrink() {
  return props.loading !== false
    || editorDisplayReady.value
}

function hasRuntimeDiffEditorView() {
  const diffEditor = getDiffEditorView()
  return Boolean(
    typeof diffEditor?.getOriginalEditor === 'function'
    || typeof diffEditor?.getModifiedEditor === 'function'
    || typeof diffEditor?.getLineChanges === 'function',
  )
}

async function waitForEditorRuntimeCreation(currentRuntimeCreation: Promise<void>) {
  if (!isDiff.value) {
    await currentRuntimeCreation
    return
  }

  let settled = false
  let settledError: unknown
  currentRuntimeCreation.then(
    () => {
      settled = true
    },
    (error) => {
      settled = true
      settledError = error
    },
  )

  for (;;) {
    if (isUnmounted)
      return

    if (settled) {
      if (settledError)
        throw settledError
      return
    }

    if (hasRenderedDiffEditorDom() && hasRuntimeDiffEditorView())
      return

    await nextTick()
    await waitForAnimationFrame()
  }
}

async function waitForDiffEditorVisualReady() {
  if (!isDiff.value)
    return true

  const maxPasses = 30
  for (let pass = 0; pass < maxPasses; pass++) {
    if (isUnmounted)
      return false
    if (hasRenderedDiffsDom()) {
      await nextTick()
      await waitForAnimationFrame()
      return !isUnmounted && hasRenderedDiffsDom()
    }
    await nextTick()
    await waitForAnimationFrame()
  }
  return false
}

async function waitForSingleEditorVisualReady() {
  if (hasRenderedDiffsDom()) {
    await nextTick()
    await waitForAnimationFrame()
    return hasRenderedDiffsDom()
  }

  const maxPasses = 30
  for (let pass = 0; pass < maxPasses; pass++) {
    if (isUnmounted || isDiff.value)
      return false

    const root = codeEditor.value
    const contentReady = hasCurrentSingleEditorContent()
    const domReady = hasRenderedSingleEditorDom(root)
    const highlightReady = !displayCode.value.trim() || hasLanguageHighlightReady(root)
    if (contentReady && domReady && highlightReady) {
      await nextTick()
      await waitForAnimationFrame()
      if (
        !isUnmounted
        && !isDiff.value
        && hasCurrentSingleEditorContent()
        && hasRenderedSingleEditorDom(codeEditor.value)
        && (!displayCode.value.trim() || hasLanguageHighlightReady(codeEditor.value))
      ) {
        return true
      }
    }

    await nextTick()
    await waitForAnimationFrame()
  }

  return false
}

// Settle-time dedupe: the diff-update watch and the loading->false watch both
// run on settle and may call this with the same input pair (stream-diffs is
// only fed after loading ends, so both watches observe the same final code).
// updateDiffCode is a full diff hand-off; running it twice for an identical
// pair is wasted work (double diff computation + surface update). Content is
// unchanged, so skipping the duplicate is semantically identical.
let lastSettledDiffPair = ''

async function updateDiffCodeWithSettledResult(original: string, updated: string, language: string) {
  const pairKey = `${original}\u0000${updated}\u0000${language}`
  if (lastSettledDiffPair === pairKey)
    return

  try {
    await updateDiffCode(original, updated, language)
    lastSettledDiffPair = pairKey
    return
  }
  catch (error) {
    if (!isPendingDiffResultError(error))
      throw error
  }

  await nextTick()
  await waitForAnimationFrame()

  if (isUnmounted || !isDiff.value)
    return

  try {
    await updateDiffCode(original, updated, language)
    lastSettledDiffPair = pairKey
  }
  catch (error) {
    if (!isPendingDiffResultError(error))
      throw error
  }
}

function getMaxHeightValue(): number {
  return props.codeBlockOptions?.maxHeight ?? 500
}

// Check if the language is previewable (HTML or SVG)
const isPreviewable = computed(() => props.isShowPreview && (codeLanguage.value === 'html' || codeLanguage.value === 'svg'))

function isCodeBlockLoading() {
  return typeof props.node.loading === 'boolean' ? props.node.loading : props.loading === true
}

function hasCompletedStreamingFenceInfo() {
  if (!isCodeBlockLoading())
    return true

  const raw = String(props.node.raw ?? '')
  const openingLine = raw.split(/\r\n|\n|\r/, 1)[0]?.trimStart() ?? ''
  if (!/^(?:`{3,}|~{3,})/.test(openingLine))
    return true

  return /\r\n|\n|\r/.test(raw)
}

function resolveStreamingCodeLanguage(language: unknown, code: unknown, loading: boolean) {
  if (loading && (!hasCompletedStreamingFenceInfo() || !String(code ?? '')))
    return 'plain'
  return normalizeLanguageIdentifier(String(language ?? ''))
}

function shouldDeferStreamingEditorCreation() {
  return isCodeBlockLoading()
}

let pendingPlainCodeUpdate: { code: string, language: string } | null = null
let plainCodeUpdateRunning = false
let plainCodeUpdateGeneration = 0

function clearPlainCodeUpdateQueue() {
  pendingPlainCodeUpdate = null
  plainCodeUpdateGeneration++
}

async function flushPlainCodeUpdateQueue(generation = plainCodeUpdateGeneration) {
  if (plainCodeUpdateRunning)
    return

  plainCodeUpdateRunning = true
  try {
    for (;;) {
      if (!pendingPlainCodeUpdate || isUnmounted || isDiff.value || generation !== plainCodeUpdateGeneration)
        break
      const next = pendingPlainCodeUpdate
      pendingPlainCodeUpdate = null
      try {
        await Promise.resolve(updateCode(next.code, next.language))
        await nextTick()
        if (!isUnmounted && !isDiff.value) {
          syncEditorHostHeight(false)
          layoutEditorToHost()
        }
      }
      catch (error) {
        warnCodeBlockDev('Failed to update stream-diffs code surface', error)
      }
    }
  }
  finally {
    plainCodeUpdateRunning = false
    if (pendingPlainCodeUpdate && !isUnmounted && !isDiff.value)
      void flushPlainCodeUpdateQueue()
  }
}

function queuePlainCodeUpdate(code: string, language: string) {
  pendingPlainCodeUpdate = { code, language }
  void flushPlainCodeUpdateQueue(plainCodeUpdateGeneration)
}

// Resolves once the plain-code update queue has drained (or is already idle).
// Used after the stream settles to finalize the stream-diffs controller only
// after the final content append has been applied.
function waitForPlainCodeQueueSettled(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (isUnmounted) {
        resolve()
        return
      }
      if (!plainCodeUpdateRunning && !pendingPlainCodeUpdate) {
        resolve()
        return
      }
      setTimeout(check, 16)
    }
    check()
  })
}

watch(
  () => [props.node.language, props.node.code, props.node.raw, props.node.loading, props.loading] as const,
  ([newLanguage, code, _raw, nodeLoading, propLoading]) => {
    codeLanguage.value = resolveStreamingCodeLanguage(
      newLanguage,
      code,
      typeof nodeLoading === 'boolean' ? nodeLoading : propLoading === true,
    )
  },
)

watch(
  () => [props.node.originalCode, props.node.updatedCode, isDiff.value] as const,
  () => {
    // Only the rAF-throttled refresh runs the (potentially expensive) diff
    // LCS once per frame. Calling syncEstimatedDiffStats() here too would run
    // the full DP synchronously on every streaming commit and again in the
    // rAF callback for the same input pair.
    safeRaf(() => refreshDiffStats())
  },
  { immediate: true },
)

let diffCodeUpdateGeneration = 0

watch(
  () => [props.node.originalCode, props.node.updatedCode, runtimeLanguage.value, isDiff.value, props.stream] as const,
  async ([, , , diff, stream]) => {
    const generation = ++diffCodeUpdateGeneration
    if (!diff)
      return
    if (isCodeBlockLoading())
      return
    if (stream === false && !editorCreated.value)
      return
    // If the editor helpers exist but the editor hasn't been created yet,
    // ensure creation first so update calls don't get lost.
    if (stream !== false && createEditor && !editorCreated.value && codeEditor.value) {
      try {
        await ensureEditorCreation(codeEditor.value as HTMLElement)
      }
      catch {}
    }

    const pendingCreation = editorRuntimeCreationPromise
    if (pendingCreation && !editorRuntimeCreated.value) {
      try {
        await pendingCreation
      }
      catch {}
      if (isUnmounted || !isDiff.value || generation !== diffCodeUpdateGeneration)
        return
    }

    if (generation !== diffCodeUpdateGeneration)
      return

    const pair = resolveDiffRenderPair(
      String(props.node.originalCode ?? ''),
      String(props.node.updatedCode ?? ''),
    )
    const shouldRefreshSettledDiff = props.loading === false
    if (shouldRefreshSettledDiff)
      syncStreamDiffsRuntimeOptions()

    try {
      await updateDiffCodeWithSettledResult(
        pair.original,
        pair.updated,
        runtimeLanguage.value,
      )
      if (isUnmounted || !isDiff.value || generation !== diffCodeUpdateGeneration)
        return
      await nextTick()
      layoutEditorToHost(true)
      syncInlineFoldProxies()
      syncEditorHostHeight(props.loading !== false ? { preferModelDiffHeight: true } : true)
      layoutEditorToHost(true)
      scheduleEditorHeightSync(true)
    }
    catch (error) {
      warnCodeBlockDev('Failed to update stream-diffs diff surface', error)
      return
    }

    if (shouldRefreshSettledDiff) {
      if (isUnmounted || !isDiff.value)
        return
      refreshDiffPresentationSafely()
      syncInlineFoldProxies()
      refreshDiffStats()
      scheduleEditorHeightSync()
      scheduleStreamingDiffHeightChase(true)
    }

    if (isExpanded.value) {
      safeRaf(() => updateExpandedHeight())
    }
  },
)

watch(
  () => props.node.code,
  async (newCode) => {
    if (isCodeBlockLoading())
      return
    if (props.stream === false)
      return
    if (!codeLanguage.value)
      codeLanguage.value = normalizeLanguageIdentifier(detectLanguage(newCode))
    if (isDiff.value)
      return

    const pendingCreation = editorRuntimeCreationPromise
    if (pendingCreation && !editorRuntimeCreated.value) {
      try {
        await pendingCreation
      }
      catch {}
      if (isUnmounted || isDiff.value)
        return
    }

    // If the editor helpers exist but the editor hasn't been created yet,
    // ensure creation first so update calls don't get lost.
    if (createEditor && !editorCreated.value && codeEditor.value) {
      try {
        await ensureEditorCreation(codeEditor.value as HTMLElement)
      }
      catch {}
    }

    queuePlainCodeUpdate(getDisplayCode(props.node.code), runtimeLanguage.value)

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

const codeBlockHeader = computed(() => resolveCodeBlockHeader(
  String(props.node.raw ?? ''),
  displayLanguage.value,
  isDiff.value,
))
const headerTitle = computed(() => codeBlockHeader.value.title)
const headerCaption = computed(() => codeBlockHeader.value.caption)

// Computed property for language icon
const languageIcon = computed(() => {
  void languageIconsRevision.value
  return resolveLanguageIcon(codeLanguage.value || '', appLanguageIconResolver)
})

// Compute inline style for container to respect optional min/max width
const containerStyle = computed(() => {
  const s: Record<string, string> = {}
  s['--markstream-code-layout-character-width'] = measuredEditorCharacterWidth.value == null
    ? '1ch'
    : `${measuredEditorCharacterWidth.value}px`
  s['--markstream-code-fallback-bg'] = preFallbackThemePalette.value.background
  s['--markstream-code-fallback-fg'] = preFallbackThemePalette.value.foreground
  if (preFallbackThemePalette.value.builtin) {
    s['--markstream-code-theme-bg'] = preFallbackThemePalette.value.background
    s['--markstream-code-theme-fg'] = preFallbackThemePalette.value.foreground
    s['--markstream-code-theme-line-number'] = preFallbackThemePalette.value.lineNumber
  }
  s['--markstream-diff-added-line-fill'] = preFallbackThemePalette.value.diffAddedLine
  s['--markstream-diff-added-number-fill'] = preFallbackThemePalette.value.diffAddedNumber
  s['--markstream-diff-editor-bg'] = preFallbackThemePalette.value.background
  s['--markstream-diff-removed-line-fill'] = preFallbackThemePalette.value.diffRemovedLine
  s['--markstream-diff-removed-number-fill'] = preFallbackThemePalette.value.diffRemovedNumber
  s['--markstream-diff-shell-bg'] = preFallbackThemePalette.value.background
  s['--markstream-pre-resolved-theme-bg'] = preFallbackThemePalette.value.background
  s['--markstream-pre-resolved-theme-fg'] = preFallbackThemePalette.value.foreground
  s['--markstream-pre-resolved-theme-line-number'] = preFallbackThemePalette.value.lineNumber
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
  // For diff blocks, do not apply estimatedVisibleBlockHeight to the outer
  // shell. The diff fallback pre and the hidden editor host already reserve the
  // content row height. Applying a block-level estimate here leaves extra blank
  // space under the runtime layer until rendering finishes.
  if (shouldReserveEstimatedEditorHeight.value && !isDiff.value && !isCollapsed.value) {
    const reserved = reservedOuterBlockHeight.value
    if (reserved != null)
      s.minHeight = `${reserved}px`
  }
  s.color = 'var(--markstream-code-fallback-fg, var(--markstream-code-theme-fg, var(--markstream-pre-resolved-theme-fg)))'
  s.backgroundColor = 'var(--markstream-code-fallback-bg, var(--markstream-code-theme-bg, var(--markstream-pre-resolved-theme-bg)))'
  if (!isDiff.value)
    s.borderColor = 'var(--markstream-code-border-color, var(--code-border))'
  return s
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

function toggleExpand() {
  isExpanded.value = !isExpanded.value

  const editor = isDiff.value
    ? getDiffEditorView()
    : getEditorView()
  const container = codeEditor.value
  if (!editor || !container)
    return

  if (isExpanded.value) {
    container.style.maxHeight = 'none'
    container.style.overflow = 'visible'
    syncEditorHostHeight(true)
  }
  else {
    stopExpandAutoResize()
    container.style.overflow = 'auto'
    syncEditorHostHeight(true)
  }
}

function toggleHeaderCollapse() {
  isCollapsed.value = !isCollapsed.value
  if (isCollapsed.value) {
    wasScrollableBeforeCollapse = false
    if (codeEditor.value) {
      const rectH = Math.ceil((codeEditor.value.getBoundingClientRect?.().height) || 0)
      wasScrollableBeforeCollapse = hasScrollableOverflow(codeEditor.value, rectH)
        || codeEditor.value.style.overflow === 'auto'
        || codeEditor.value.style.overflowY === 'auto'
      if (rectH > 0)
        heightBeforeCollapse.value = rectH
    }
    stopExpandAutoResize()
  }
  else {
    if (codeEditor.value && heightBeforeCollapse.value != null) {
      codeEditor.value.style.height = `${heightBeforeCollapse.value}px`
    }
    resumeGuardFrames = 2
    void nextTick(() => {
      if (isCollapsed.value || isUnmounted)
        return
      syncEditorHostHeight(true)
      layoutEditorToHost(true)
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
    editor.updateOptions?.({ fontSize: size })
    if (!isCollapsed.value)
      syncEditorHostHeight(true)
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

function resetEditorHost(el: HTMLElement) {
  // Enhanced diff/single surfaces should own the host exclusively. Clearing the
  // host before each creation prevents stale roots from stacking when a block
  // is recreated at the end of a streaming session.
  el.replaceChildren()
}

async function runEditorCreation(el: HTMLElement) {
  if (!createEditor || isUnmounted)
    return

  pendingThemeUpdate = false
  const creationKind = desiredEditorKind.value
  diffEditorCreatedWhileStreaming = false
  editorCreationFailed.value = false
  failedEditorCreationKey.value = null
  editorRuntimeCreated.value = false
  editorDisplayReady.value = false
  editorHandoffPrepared.value = false
  measuredEditorFontSize.value = null
  measuredEditorLineHeight.value = null
  measuredEditorCharacterWidth.value = null
  diffFallbackHandoffHeight.value = null
  clearLayerMeasuredVars()
  resetEditorLayoutCache()
  armEstimatedEditorHeightFloor()
  clearEditorHeightSyncBindings()
  clearInlineFoldProxies()
  resetEditorHost(el)
  syncStreamDiffsRuntimeOptions()
  await syncStreamDiffsWorkerTheme(resolveWorkerPoolTheme())
  if (isUnmounted)
    return

  const runtimeCreation = (async () => {
    if (creationKind === 'diff') {
      installPendingDiffResultErrorFilter()
      safeClean()
      const pair = resolveDiffRenderPair(
        String(props.node.originalCode ?? ''),
        String(props.node.updatedCode ?? ''),
      )
      if (createDiffEditor) {
        await createDiffEditor!(el as HTMLElement, pair.original, pair.updated, runtimeLanguage.value)
      }
      else {
        await createEditor!(el as HTMLElement, props.node.code, runtimeLanguage.value)
      }
    }
    else {
      await createEditor!(el as HTMLElement, displayCode.value, runtimeLanguage.value)
    }
    editorRuntimeCreated.value = true
  })()
  const currentRuntimeCreation = runtimeCreation.finally(() => {
    if (editorRuntimeCreationPromise === currentRuntimeCreation)
      editorRuntimeCreationPromise = null
  })
  editorRuntimeCreationPromise = currentRuntimeCreation
  await waitForEditorRuntimeCreation(currentRuntimeCreation)
  if (isUnmounted)
    return
  if (desiredEditorKind.value !== creationKind)
    return
  editorRuntimeCreated.value = true

  const configuredFontSize = props.codeBlockOptions?.fontSize
  if (typeof configuredFontSize === 'number' && Number.isFinite(configuredFontSize) && configuredFontSize > 0) {
    const editor = creationKind === 'diff' ? getDiffEditorView() : getEditorView()
    editor?.updateOptions?.({ fontSize: configuredFontSize })
    defaultCodeFontSize.value = configuredFontSize
    codeFontSize.value = configuredFontSize
  }
  else if (!shouldFreezeVisibleDiffFallbackMetrics()) {
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

  syncFallbackFontMetricsFromEditor()

  while (pendingThemeUpdate) {
    pendingThemeUpdate = false
    await themeUpdate()
    if (isUnmounted)
      return
  }

  if (!isExpanded.value && !isCollapsed.value)
    syncEditorHostHeight(false)

  editorMounted.value = true
  currentEditorKind.value = creationKind
  bindEditorHeightSync()
  syncEditorCssVars()
  syncFallbackFontMetricsFromEditor()
  syncInlineFoldProxies()
  refreshDiffStats()
  scheduleEditorHeightSync()
  await nextTick()
  // stream-diffs owns its asynchronous highlight commit. Keep the fallback
  // visible until that runtime confirms the first visual frame is complete.
  let runtimeVisualReady: boolean | null = null
  if (whenRuntimeVisualReady) {
    runtimeVisualReady = await whenRuntimeVisualReady()
    if (runtimeVisualReady) {
      await nextTick()
      await waitForAnimationFrame()
    }
  }
  const diffVisualReady = runtimeVisualReady == null
    ? creationKind === 'diff'
      ? await waitForDiffEditorVisualReady()
      : await waitForSingleEditorVisualReady()
    : runtimeVisualReady
  if (isUnmounted)
    return
  if (!diffVisualReady) {
    markEditorCreationFailed()
    return
  }
  syncFallbackFontMetricsFromEditor()
  syncDiffRevealHostHeight()
  if (!await revealEditorDisplay())
    markEditorCreationFailed()
}

function ensureEditorCreation(el: HTMLElement, options: { allowStaleContentRetry?: boolean } = {}) {
  if (!createEditor || isUnmounted)
    return null
  if (props.stream === false && props.loading !== false)
    return null
  clearEditorCreationFailureIfKeyChanged()
  if (isEditorCreationBlocked())
    return null
  if (usePreCodeRender.value || codeEditor.value !== el)
    return null
  if (shouldDeferStreamingEditorCreation())
    return null
  if (createEditorPromise)
    return createEditorPromise
  if (editorCreated.value && editorMounted.value)
    return Promise.resolve()

  const attemptFailureKey = getEditorCreationFailureKey()
  const attemptContentRevision = editorCreationContentRevision.value
  let retryCurrentSignature = false
  editorCreated.value = true
  markLifecyclePending()
  const pending = (async () => {
    try {
      await runEditorCreation(el)
      staleContentRetryFailureKey = null
    }
    catch (error) {
      const currentFailureKey = getEditorCreationFailureKey()
      const contentChangedDuringCreation = attemptContentRevision !== editorCreationContentRevision.value
      const canRetryStaleContent = options.allowStaleContentRetry !== false
        && contentChangedDuringCreation
        && staleContentRetryFailureKey !== currentFailureKey
      if (attemptFailureKey !== currentFailureKey || canRetryStaleContent) {
        if (canRetryStaleContent)
          staleContentRetryFailureKey = currentFailureKey
        retryCurrentSignature = true
        editorCreated.value = false
        editorMounted.value = false
        editorRuntimeCreated.value = false
        editorDisplayReady.value = false
        return
      }
      markEditorCreationFailed(attemptFailureKey)
      throw error
    }
  })()

  const currentPromise = pending.finally(() => {
    if (createEditorPromise === currentPromise)
      createEditorPromise = null
    markLifecycleSettled()
    if (retryCurrentSignature && !isUnmounted) {
      queueMicrotask(() => {
        const currentEl = codeEditor.value
        if (!currentEl || isUnmounted)
          return
        ensureEditorCreation(currentEl as HTMLElement)?.catch((error) => {
          warnCodeBlockDev('Failed to mount stream-diffs after stale creation failed', error)
          editorMounted.value = false
          editorDisplayReady.value = false
          markEditorCreationFailed()
        })
      })
    }
  })
  createEditorPromise = currentPromise
  return currentPromise
}

let createEditorWatchEpoch = 0

// 延迟创建编辑器：仅在可见且准备就绪时创建，避免无意义的初始化
const stopCreateEditorWatch = watch(
  () => [
    codeEditor.value,
    isDiff.value,
    props.stream,
    props.loading,
    runtimeReady.value,
    viewportReady.value,
    props.node.language,
    props.node.raw,
    props.node.code,
    props.node.loading,
  ] as const,
  async ([el, _isDiff, stream, loading, _runtimeReady, visible]) => {
    const watchEpoch = ++createEditorWatchEpoch
    if (!el)
      return
    if (!visible)
      return
    if (isCodeBlockLoading())
      return
    if (editorCreationFailureRetryInProgress)
      return

    // If streaming is disabled, defer editor creation until loading is finished
    if (stream === false && loading !== false)
      return
    if (!createEditor) {
      await ensureCodeBlockRuntime()
      if (watchEpoch !== createEditorWatchEpoch)
        return
      if (props.stream === false && props.loading !== false)
        return
      if (shouldDeferStreamingEditorCreation())
        return
      if (!viewportReady.value)
        return
      if (
        !createEditor
        || usePreCodeRender.value
        || editorCreated.value
        || isEditorCreationBlocked()
        || isUnmounted
        || codeEditor.value !== el
      ) {
        return
      }
    }
    if (shouldDeferStreamingEditorCreation())
      return

    const creation = ensureEditorCreation(el as HTMLElement)
    if (!creation)
      return

    try {
      await creation
    }
    catch (error) {
      // Keep the `<pre>` fallback if the enhanced surface fails to mount.
      warnCodeBlockDev('Failed to mount stream-diffs surface', error)
      editorMounted.value = false
      editorDisplayReady.value = false
      markEditorCreationFailed()
    }

    if (editorMounted.value && editorDisplayReady.value)
      stopCreateEditorWatch()
  },
)

watch(
  desiredEditorKind,
  async (nextKind, prevKind) => {
    if (nextKind === prevKind)
      return
    if (editorCreationFailed.value || editorCreationFailureRetryInProgress)
      return
    clearPlainCodeUpdateQueue()

    // If the runtime is not mounted yet (or unavailable), let the normal
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
    const pendingCreation = createEditorPromise
    if (pendingCreation) {
      try {
        await pendingCreation
      }
      catch {}
      if (isUnmounted || !codeEditor.value)
        return
    }
    if (currentEditorKind.value === nextKind && editorCreated.value && editorMounted.value)
      return

    try {
      editorMounted.value = false
      editorDisplayReady.value = false
      editorCreated.value = false
      editorRuntimeCreated.value = false
      clearEditorHeightSyncBindings()
      clearInlineFoldProxies()
      safeClean()
      await nextTick()
      await ensureEditorCreation(codeEditor.value as HTMLElement)
    }
    catch (error) {
      warnCodeBlockDev('Failed to recreate stream-diffs after code block kind changed', error)
      // Keep fallback rendering if recreation fails.
      editorMounted.value = false
      editorDisplayReady.value = false
      markEditorCreationFailed()
    }
  },
)

function isPairedTheme(t: unknown): t is { light: CodeBlockTheme, dark: CodeBlockTheme } {
  return !!t && typeof t === 'object' && 'light' in t && 'dark' in t
}

function getPreferredColorScheme(): CodeBlockTheme | undefined {
  return resolvePreCodeThemeName({
    darkTheme: props.darkTheme,
    isDark: props.isDark,
    lightTheme: props.lightTheme,
    theme: props.theme,
    themes: props.themes,
  })
}

function getThemeName(theme: CodeBlockTheme | null | undefined) {
  return typeof theme === 'string' ? theme : null
}

function isSameRequestedTheme(a: CodeBlockTheme | null | undefined, b: CodeBlockTheme | null | undefined) {
  if (a === b)
    return true
  const aName = getThemeName(a)
  const bName = getThemeName(b)
  return !!aName && aName === bName
}

function isFixedTheme(): boolean {
  if (props.theme !== undefined)
    return !isPairedTheme(props.theme)
  return isSameRequestedTheme(props.darkTheme, props.lightTheme)
}

function resolveRequestedTheme() {
  return getPreferredColorScheme()
}

async function themeUpdate(options: { appearanceOnly?: boolean } = {}) {
  syncStreamDiffsRuntimeOptions()

  const syncPresentation = () => {
    if (isDiff.value)
      refreshDiffPresentationSafely()
    safeRaf(() => {
      syncEditorCssVars()
      scheduleEditorHeightSync()
    })
  }

  if (options.appearanceOnly) {
    syncPresentation()
    return
  }

  const themeToSet = resolveRequestedTheme()
  if (!themeToSet) {
    syncPresentation()
    return
  }

  try {
    // Keep worker-generated tokens in sync with the requested theme before the
    // surface re-renders. No-op unless a worker pool was injected.
    await syncStreamDiffsWorkerTheme(resolveWorkerPoolTheme())
    await setTheme(themeToSet)
    syncPresentation()
  }
  catch (error) {
    warnCodeBlockDev('Failed to apply code-block theme', error)
  }
}

/**
 * Resolves the theme value forwarded to the injected worker pool. Mirrors the
 * runtime's `resolveTheme`: a paired `themes` prop maps to a `{ dark, light }`
 * object, otherwise the single resolved theme name.
 */
function resolveWorkerPoolTheme() {
  const themes = props.themes
  if (themes && typeof themes[0] === 'string' && typeof themes[1] === 'string')
    return { dark: themes[0], light: themes[1] }
  return resolveRequestedTheme()
}

function themeLooksDark(theme: CodeBlockTheme | null | undefined) {
  const themeName = getThemeName(theme) ?? ''
  return preCodeThemeLooksDark(themeName, props.isDark === true)
}

function buildStreamDiffsOverflowCSS(overflow: 'scroll' | 'wrap') {
  const whiteSpace = overflow === 'wrap' ? 'pre-wrap' : 'pre'
  const overflowWrap = overflow === 'wrap' ? 'anywhere' : 'normal'
  return `
[data-file] [data-line],
[data-diff] [data-line] {
  white-space: ${whiteSpace} !important;
  overflow-wrap: ${overflowWrap} !important;
  word-break: normal !important;
}`
}

function buildStreamDiffsMetadataCSS() {
  return `
[data-no-newline],
[data-gutter-buffer="metadata"] {
  --diffs-computed-decoration-bg: var(--markstream-diff-metadata-bg) !important;
  --diffs-computed-diff-line-bg: var(--markstream-diff-metadata-bg) !important;
  --diffs-computed-selected-line-bg: var(--markstream-diff-metadata-bg) !important;
  --diffs-line-bg: var(--markstream-diff-metadata-bg) !important;
  color: var(--markstream-diff-metadata-fg) !important;
  background-color: var(--markstream-diff-metadata-bg) !important;
}`
}

function buildStreamDiffsRuntimeOptions() {
  const visualOptions = preFallbackVisualOptions.value
  const nextOptions = {
    ...(resolvedEditorOptions.value || {}),
    // stream-diffs@0.0.2 reads wordWrap in its compatibility adapter and
    // derives the actual surface overflow from it. Keep this mapping next to
    // the fallback resolver so both surfaces always use the same value.
    wordWrap: visualOptions.overflow === 'wrap' ? 'on' : 'off',
    overflow: visualOptions.overflow,
    themes: props.themes,
    stream: false,
    MAX_HEIGHT: props.codeBlockOptions?.maxHeight ?? 500,
    fontSize: preFallbackFontSize.value,
    lineHeight: preFallbackEffectiveLineHeight.value,
    theme: resolveRequestedTheme(),
    themeType: props.isDark ? 'dark' : 'light',
    disableLineNumbers: !effectiveShowLineNumbers.value,
    // CodeBlockShell owns the file header for every enhanced code block.
    // Pierre's header would otherwise duplicate that chrome for File surfaces.
    disableFileHeader: true,
    // A host-injected WorkerPoolManager moves Shiki tokenization off the main
    // thread. A per-block `codeBlockOptions.workerManager` (if any) wins over
    // the shared injected pool; when neither exists we stay on the main thread.
    workerManager: (resolvedEditorOptions.value as Record<string, unknown> | undefined)?.workerManager
      ?? getStreamDiffsWorkerPool()
      ?? undefined,
    onThemeChange() {
      syncEditorCssVars()
    },
  } as StreamDiffsRuntimeOptions

  const fontFamily = resolveRuntimeFontFamily()
  if (fontFamily)
    nextOptions.fontFamily ??= fontFamily

  const configuredUnsafeCSS = typeof nextOptions.unsafeCSS === 'string'
    ? nextOptions.unsafeCSS
    : ''
  const overflowCSS = buildStreamDiffsOverflowCSS(visualOptions.overflow)
  const metadataCSS = buildStreamDiffsMetadataCSS()
  nextOptions.unsafeCSS = `[data-file], [data-diff] { --diffs-min-number-column-width-default: 2ch !important; }
${overflowCSS}
${metadataCSS}
${configuredUnsafeCSS}`.trim()

  return nextOptions
}

function syncStreamDiffsRuntimeOptions() {
  const nextOptions = buildStreamDiffsRuntimeOptions()
  if (!streamDiffsRuntimeOptions) {
    streamDiffsRuntimeOptions = nextOptions
    return streamDiffsRuntimeOptions
  }

  for (const key of Object.keys(streamDiffsRuntimeOptions)) {
    if (!(key in nextOptions))
      delete streamDiffsRuntimeOptions[key]
  }
  Object.assign(streamDiffsRuntimeOptions, nextOptions)
  return streamDiffsRuntimeOptions
}

function readVisiblePreFallbackFontFamily() {
  if (typeof window === 'undefined')
    return undefined

  const fallback = container.value?.querySelector('pre.code-pre-fallback') as HTMLElement | null
  if (!fallback)
    return undefined

  const fontFamily = window.getComputedStyle(fallback).fontFamily.trim()
  return fontFamily || undefined
}

function resolveRuntimeFontFamily() {
  const configured = resolvedEditorOptions.value?.fontFamily
  if (typeof configured === 'string' && configured.trim())
    return configured.trim()

  if (!isDiff.value)
    return undefined

  return readVisiblePreFallbackFontFamily()
}

const editorCreationOptionsRevision = ref(0)
const runtimeStructuralSignature = computed(() => String(editorCreationOptionsRevision.value))
let deferredRuntimeOptionsRecreation = false

watch(
  () => props.codeBlockOptions?.fontSize,
  (fontSize) => {
    const nextFontSize = typeof fontSize === 'number' && Number.isFinite(fontSize) && fontSize > 0
      ? fontSize
      : defaultPreFallbackFontSize
    defaultCodeFontSize.value = nextFontSize
    codeFontSize.value = nextFontSize
    measuredEditorFontSize.value = null
    measuredEditorLineHeight.value = null
    measuredEditorCharacterWidth.value = null
  },
)

watch(
  () => [props.codeBlockOptions, props.showLineNumbers] as const,
  () => {
    editorCreationOptionsRevision.value += 1
    if (props.stream === false && props.loading !== false)
      deferredRuntimeOptionsRecreation = true
  },
  { deep: true },
)

watch(
  () => [
    displayCode.value,
    props.node.originalCode,
    props.node.updatedCode,
  ] as const,
  () => {
    editorCreationContentRevision.value += 1
    if (!isCodeBlockLoading())
      editorCreationSettledContentGeneration.value += 1
  },
)

function getEditorCreationFailureKey() {
  const requestedTheme = resolveRequestedTheme()
  return JSON.stringify({
    kind: desiredEditorKind.value,
    language: runtimeLanguage.value,
    structural: runtimeStructuralSignature.value,
    optionsRevision: editorCreationOptionsRevision.value,
    settledContentGeneration: editorCreationSettledContentGeneration.value,
    theme: getThemeName(requestedTheme) ?? (requestedTheme == null ? null : 'custom'),
    isDark: props.isDark,
  })
}

const editorCreationFailureKey = computed(() => getEditorCreationFailureKey())

function clearEditorCreationFailureIfKeyChanged() {
  if (!editorCreationFailed.value)
    return
  if (failedEditorCreationKey.value === editorCreationFailureKey.value)
    return

  editorCreationFailed.value = false
  failedEditorCreationKey.value = null
  staleContentRetryFailureKey = null
  editorCreationFailureKeyRetriedKey = null
  editorCreated.value = false
  editorMounted.value = false
  editorRuntimeCreated.value = false
  editorDisplayReady.value = false
  editorHandoffPrepared.value = false
}

function isEditorCreationBlocked() {
  clearEditorCreationFailureIfKeyChanged()
  return editorCreationFailed.value
    && failedEditorCreationKey.value === editorCreationFailureKey.value
}

function markEditorCreationFailed(key = editorCreationFailureKey.value) {
  failedEditorCreationKey.value = key
  editorCreationFailed.value = true
  editorHandoffPrepared.value = false
}

watch(editorCreationFailureKey, async () => {
  if (editorCreationFailureRetryInProgress)
    return
  if (!editorCreationFailed.value)
    return
  if (failedEditorCreationKey.value === editorCreationFailureKey.value)
    return
  if (!createEditor || !codeEditor.value || usePreCodeRender.value || isUnmounted || !viewportReady.value)
    return
  if (props.stream === false && props.loading !== false)
    return
  if (shouldDeferStreamingEditorCreation())
    return

  const retryKey = editorCreationFailureKey.value
  editorCreationFailureRetryInProgress = true
  try {
    clearEditorCreationFailureIfKeyChanged()
    if (editorCreationFailed.value)
      return
    await ensureEditorCreation(codeEditor.value as HTMLElement)
  }
  catch (error) {
    warnCodeBlockDev('Failed to mount stream-diffs after code block identity changed', error)
    editorMounted.value = false
    editorDisplayReady.value = false
    markEditorCreationFailed()
  }
  finally {
    editorCreationFailureKeyRetriedKey = retryKey
    await nextTick()
    editorCreationFailureRetryInProgress = false
  }
})

// Watch for viewport readiness and try to keep the stream-diffs editor options
// in sync with the current font size.
watch(
  () => [props.codeBlockOptions, viewportReady.value],
  () => {
    syncStreamDiffsRuntimeOptions()
    if (!createEditor || !viewportReady.value)
      return

    const ed = isDiff.value ? getDiffEditorView() : getEditorView()
    const applying = typeof props.codeBlockOptions?.fontSize === 'number'
      ? props.codeBlockOptions.fontSize
      : (Number.isFinite(codeFontSize.value) ? (codeFontSize.value as number) : undefined)
    if (typeof applying === 'number' && Number.isFinite(applying) && applying > 0) {
      ed?.updateOptions?.({ fontSize: applying })
    }
    syncEditorHostHeight(false)
  },
  { deep: true },
)

watch(
  () => [resolveRequestedTheme(), effectiveDiffAppearance.value, runtimeReady.value, editorCreated.value, viewportReady.value] as const,
  ([theme, appearance], previous) => {
    if (!runtimeReady.value || !viewportReady.value)
      return
    const sameRequestedTheme = previous != null && isSameRequestedTheme(theme, previous[0])
    const appearanceChanged = previous != null && appearance !== previous[1]
    if (!editorMounted.value) {
      if (!sameRequestedTheme || appearanceChanged)
        pendingThemeUpdate = true
      return
    }
    pendingThemeUpdate = false
    void themeUpdate({ appearanceOnly: sameRequestedTheme })
  },
  { flush: 'post' },
)

watch(
  () => [runtimeStructuralSignature.value, runtimeReady.value, viewportReady.value] as const,
  async ([nextSignature, ready, visible], [prevSignature]) => {
    syncStreamDiffsRuntimeOptions()
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
    const pendingCreation = createEditorPromise
    if (pendingCreation) {
      try {
        await pendingCreation
      }
      catch {}
      if (isUnmounted || !codeEditor.value)
        return
    }
    try {
      editorMounted.value = false
      editorDisplayReady.value = false
      editorCreated.value = false
      editorRuntimeCreated.value = false
      clearEditorHeightSyncBindings()
      clearInlineFoldProxies()
      safeClean()
      if (streamDiffsModule)
        initializeStreamDiffsHelpers(streamDiffsModule)
      await nextTick()
      await ensureEditorCreation(codeEditor.value as HTMLElement, { allowStaleContentRetry: false })
    }
    catch (error) {
      warnCodeBlockDev('Failed to recreate stream-diffs after code-block options changed', error)
      editorMounted.value = false
      editorDisplayReady.value = false
      markEditorCreationFailed()
    }
  },
  { flush: 'post' },
)

watch(
  () => [props.loading, viewportReady.value] as const,
  ([loading, visible]) => {
    if (loading !== false || !visible || !deferredRuntimeOptionsRecreation)
      return
    deferredRuntimeOptionsRecreation = false
    editorCreationOptionsRevision.value += 1
  },
  { flush: 'post' },
)

async function retryFailedEditorCreationAfterStreamingSettled() {
  if (!editorCreationFailed.value)
    return false
  if (!createEditor || !codeEditor.value || usePreCodeRender.value || isUnmounted || !viewportReady.value)
    return false
  if (editorCreationFailureKeyRetriedKey === editorCreationFailureKey.value)
    return true

  editorCreationFailureRetryInProgress = true
  try {
    editorCreationFailed.value = false
    failedEditorCreationKey.value = null
    staleContentRetryFailureKey = null
    editorCreated.value = false
    editorMounted.value = false
    editorRuntimeCreated.value = false
    editorDisplayReady.value = false
    clearEditorHeightSyncBindings()
    clearInlineFoldProxies()
    safeClean()
    if (streamDiffsModule)
      initializeStreamDiffsHelpers(streamDiffsModule)
    await nextTick()

    try {
      await ensureEditorCreation(codeEditor.value as HTMLElement)
    }
    catch (error) {
      warnCodeBlockDev('Failed to mount stream-diffs after streaming settled', error)
      editorMounted.value = false
      editorDisplayReady.value = false
      markEditorCreationFailed()
    }
  }
  finally {
    await nextTick()
    editorCreationFailureRetryInProgress = false
  }

  return true
}

// 当 loading 变为 false 时：计算并缓存一次展开高度
watch(
  () => [props.loading, viewportReady.value],
  async ([loaded, visible], previous) => {
    if (!visible)
      return
    const prevLoaded = previous?.[0]
    if (prevLoaded === false && loaded !== false && isDiff.value && editorCreated.value) {
      await nextTick()
      safeRaf(() => {
        void (async () => {
          const pendingCreation = createEditorPromise
          if (pendingCreation) {
            try {
              await pendingCreation
            }
            catch {}
          }
          if (isUnmounted || !isDiff.value || props.loading === false)
            return
          syncStreamDiffsRuntimeOptions()
          refreshDiffPresentationSafely()
          scheduleEditorHeightSync()
        })()
      })
    }
    if (loaded)
      return
    const loadingJustFinished = prevLoaded !== undefined && prevLoaded !== false
    await nextTick()
    safeRaf(() => {
      void (async () => {
        try {
          if (loadingJustFinished && await retryFailedEditorCreationAfterStreamingSettled()) {
            syncEditorHostHeight(false)
            return
          }
          if (
            loadingJustFinished
            && isDiff.value
            && editorCreated.value
            && diffEditorCreatedWhileStreaming
            && codeEditor.value
          ) {
            diffEditorCreatedWhileStreaming = false
            editorMounted.value = false
            editorDisplayReady.value = false
            editorCreated.value = false
            editorRuntimeCreated.value = false
            clearEditorHeightSyncBindings()
            clearInlineFoldProxies()
            safeClean()
            await nextTick()
            await ensureEditorCreation(codeEditor.value as HTMLElement, { allowStaleContentRetry: false })
            scheduleStreamingDiffHeightChase(true)
            return
          }
          if (loadingJustFinished && editorCreated.value) {
            if (isDiff.value && codeEditor.value) {
              const pendingCreation = createEditorPromise
              if (pendingCreation) {
                try {
                  await pendingCreation
                }
                catch {}
              }
              syncStreamDiffsRuntimeOptions()
              const pair = resolveDiffRenderPair(
                String(props.node.originalCode ?? ''),
                String(props.node.updatedCode ?? ''),
              )
              await updateDiffCodeWithSettledResult(
                pair.original,
                pair.updated,
                runtimeLanguage.value,
              )
              if (isUnmounted || !isDiff.value)
                return
              // 2.0: finalize the stream-diffs diff controller so the
              // highlighted surface replaces the streaming plain-text view.
              await Promise.resolve(finalizeDiff())
              refreshDiffPresentationSafely()
              layoutEditorToHost(true)
              syncDiffScrollFromFallback()
              syncInlineFoldProxies()
              refreshDiffStats()
              const visualReady = await waitForDiffEditorVisualReady()
              if (!isUnmounted && visualReady && !editorDisplayReady.value)
                await revealEditorDisplay()
              scheduleEditorHeightSync()
              scheduleStreamingDiffHeightChase(true)
            }
            else {
              clearPlainCodeUpdateQueue()
              queuePlainCodeUpdate(displayCode.value, runtimeLanguage.value)
              // 2.0: once streaming settles, hand the stream-diffs controller
              // over to its finalized (highlighted) surface after the final
              // content update has been applied. Idempotent — repeat calls
              // early-return once the controller is finalized.
              await waitForPlainCodeQueueSettled()
              if (!isUnmounted && !isDiff.value)
                await Promise.resolve(finalizeCode())
            }
          }
          if (loadingJustFinished && isDiff.value) {
            syncEditorHostHeight({ preferModelDiffHeight: true, holdCurrentDiffHeight: true })
            scheduleStreamingDiffHeightChase(true)
          }
          else {
            syncEditorHostHeight(false)
          }
        }
        catch (error) {
          warnCodeBlockDev('Failed to refresh stream-diffs after streaming settled', error)
        }
      })()
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
  clearEditorHeightSyncBindings()
  clearInlineFoldProxies()
  cleanupEditor()
  pendingDiffResultErrorFilterCleanup?.()

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
  <PreCodeBlock
    v-if="usePreCodeRender"
    :style="preFallbackStyle"
    :node="preCodeNode"
    :loading="props.loading"
    :show-line-numbers="effectiveShowLineNumbers"
    :diff-inline="preFallbackDiffInline"
    :diff-hide-unchanged-regions="preFallbackDiffHideUnchangedRegions"
    :code-block-options="props.codeBlockOptions"
    :resolved-visual-options="preFallbackVisualOptions"
    :reserved-height-px="isDiff ? diffFallbackHandoffHeight ?? undefined : undefined"
    :is-dark="props.isDark"
    :theme="props.theme"
    :dark-theme="props.darkTheme"
    :light-theme="props.lightTheme"
    :themes="props.themes"
    :show-header="props.showHeader"
    :show-copy-button="props.showCopyButton"
    :show-tooltips="props.showTooltips"
  >
    <template v-if="$slots['header-left']" #header-left>
      <slot name="header-left" />
    </template>
    <template v-if="$slots['header-right']" #header-right>
      <slot name="header-right" />
    </template>
  </PreCodeBlock>
  <div
    v-else
    ref="container"
    :style="containerStyle"
    class="code-block-container rounded-lg border"
    data-markstream-code-block="1"
    :data-markstream-enhanced="editorDisplayReady && !usePreCodeRender ? 'true' : 'false'"
    :data-markstream-enhancement-state="codeBlockEnhancementState"
    :data-markstream-code-block-state="isCodeBlockLoading() ? 'streaming' : 'settled'"
    :data-markstream-pending="restoreVisualPending ? 'true' : undefined"
    :data-markstream-viewport-pending="viewportPendingMarkerReady && offscreenHeavyNodeDeferral && !viewportReady ? 'true' : undefined"
    :class="[
      { 'dark': props.isDark, 'is-rendering': props.loading, 'is-dark': resolvedSurfaceIsDark, 'is-diff': isDiff, 'is-plain-text': isPlainTextLanguage },
    ]"
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
      :stream="stream"
      :is-collapsed="isCollapsed"
      :is-expanded="isExpanded"
      :copy-text="copyText"
      :is-previewable="isPreviewable"
      :code-font-size="codeFontSize"
      :code-font-min="codeFontMin"
      :code-font-max="codeFontMax"
      :default-code-font-size="defaultCodeFontSize"
      :font-baseline-ready="fontBaselineReady"
      :diff-stats="isDiff ? diffStats : null"
      :diff-stats-aria-label="diffStatsAriaLabel"
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
                {{ headerTitle }}
              </div>
              <div v-if="headerCaption" class="code-header-caption">
                {{ headerCaption }}
              </div>
            </div>
          </div>
        </slot>
      </template>
      <template v-if="$slots['header-right']" #header-right>
        <slot name="header-right" />
      </template>

      <!-- stream-diffs editor layer -->
      <div
        v-show="stream ? true : !loading"
        class="code-editor-layer"
        :class="{ 'code-editor-layer--collapsed': isCollapsed }"
      >
        <div
          ref="codeEditor"
          class="code-editor-container"
          :class="stream ? '' : 'code-height-placeholder'"
          :data-markstream-host-hidden="hideCodeEditorContainer ? 'true' : undefined"
          :style="codeEditorContainerStyle"
        />
        <PreCodeBlock
          v-if="renderPreFallback"
          :style="preFallbackStyle"
          :node="preCodeNode"
          :loading="props.loading"
          :show-line-numbers="effectiveShowLineNumbers"
          :diff-inline="preFallbackDiffInline"
          :diff-hide-unchanged-regions="preFallbackDiffHideUnchangedRegions"
          :code-block-options="props.codeBlockOptions"
          :resolved-visual-options="preFallbackVisualOptions"
          :reserved-height-px="isDiff ? diffFallbackHandoffHeight ?? undefined : undefined"
          :is-dark="props.isDark"
          :theme="props.theme"
          :dark-theme="props.darkTheme"
          :light-theme="props.lightTheme"
          :themes="props.themes"
          :show-toolbar="false"
        />
      </div>
      <HtmlPreviewFrame
        v-if="showInlinePreview && !hasPreviewListener && isPreviewable && codeLanguage === 'html'"
        :code="props.node.code"
        :html-preview-allow-scripts="props.htmlPreviewAllowScripts"
        :html-preview-sandbox="props.htmlPreviewSandbox"
        :is-dark="props.isDark"
        :on-close="() => (showInlinePreview = false)"
      />

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
.code-block-container {
  --markstream-code-fallback-bg: var(--markstream-code-theme-bg, var(--markstream-pre-resolved-theme-bg));
  --markstream-code-fallback-fg: var(--markstream-code-theme-fg, var(--markstream-pre-resolved-theme-fg));
  --markstream-code-border-color: var(--code-border);
  --vscode-editor-selectionBackground: var(--markstream-code-fallback-selection-bg);
  --markstream-code-fallback-selection-bg: var(--code-selection-bg);
  --markstream-diff-frame-border: var(--code-border);
  --markstream-diff-frame-shadow: 0 16px 40px -32px hsl(var(--ms-foreground) / 0.18);
  --markstream-diff-shell-fg: hsl(var(--ms-foreground));
  --markstream-diff-shell-muted: hsl(var(--ms-muted-foreground));
  --markstream-diff-shell-border: var(--code-border);
  --markstream-diff-shell-shadow: var(--ms-shadow-subtle);
  --markstream-diff-shell-bg: var(--code-bg);
  --markstream-diff-header-border: hsl(var(--ms-border) / 0.92);
  --markstream-diff-editor-bg: hsl(var(--ms-background));
  --markstream-diff-editor-fg: hsl(var(--ms-foreground));
  --markstream-diff-unchanged-fg: hsl(var(--ms-foreground));
  --markstream-diff-unchanged-bg: hsl(var(--ms-muted));
  --markstream-diff-unchanged-divider: hsl(var(--ms-background) / 0.94);
  --markstream-diff-focus: var(--focus-ring);
  --markstream-diff-widget-shadow: hsl(var(--ms-foreground) / 0.26);
  --markstream-diff-action-hover: var(--code-action-hover-bg);
  --markstream-diff-panel-bg: linear-gradient(180deg, var(--code-bg) 0%, hsl(var(--ms-muted)) 100%);
  --markstream-diff-panel-bg-soft: var(--code-bg);
  --markstream-diff-panel-bg-strong: var(--code-bg);
  --markstream-diff-panel-border: hsl(var(--ms-border) / 0.3);
  --markstream-diff-gutter-bg: transparent;
  --markstream-diff-gutter-guide: hsl(var(--ms-border) / 0.72);
  --markstream-diff-gutter-gap: 8px;
  --markstream-diff-line-number-bg: var(--markstream-diff-editor-bg);
  --markstream-diff-line-number: var(--code-line-number);
  --markstream-diff-line-number-active: var(--code-line-number);
  --markstream-diff-added-fg: var(--diff-added-fg);
  --markstream-diff-removed-fg: var(--diff-removed-fg);
  --markstream-diff-added-line: var(--diff-added-bg);
  --markstream-diff-removed-line: var(--diff-removed-bg);
  --markstream-diff-added-inline: var(--diff-added-inline-bg);
  --markstream-diff-removed-inline: var(--diff-removed-inline-bg);
  --markstream-diff-added-inline-border: transparent;
  --markstream-diff-removed-inline-border: transparent;
  --markstream-diff-added-gutter: linear-gradient(
    90deg,
    var(--markstream-diff-added-fg) 0 4px,
    transparent 4px 100%
  );
  --markstream-diff-removed-gutter: repeating-linear-gradient(
        180deg,
        var(--markstream-diff-removed-fg) 0 2px,
        transparent 2px 4px
      )
      left / 4px 100% no-repeat;
  --markstream-diff-added-line-fill: var(--diff-added-bg);
  --markstream-diff-removed-line-fill: var(--diff-removed-bg);
}

.code-block-container.is-dark {
  --markstream-code-fallback-bg: var(--markstream-code-theme-bg, var(--markstream-pre-resolved-theme-bg));
  --markstream-code-fallback-fg: var(--markstream-code-theme-fg, var(--markstream-pre-resolved-theme-fg));
  --markstream-code-border-color: var(--code-border);
  --markstream-code-fallback-selection-bg: var(--code-selection-bg);
  --markstream-diff-frame-border: var(--code-border);
  --markstream-diff-frame-shadow: 0 18px 40px -30px hsl(var(--ms-foreground) / 0.84);
  --markstream-diff-shell-fg: hsl(var(--ms-foreground));
  --markstream-diff-shell-muted: hsl(var(--ms-muted-foreground));
  --markstream-diff-shell-border: var(--code-border);
  --markstream-diff-shell-shadow: var(--ms-shadow-subtle);
  --markstream-diff-shell-bg: var(--code-bg);
  --markstream-diff-header-border: hsl(var(--ms-border) / 0.82);
  --markstream-diff-editor-bg: #121212;
  --markstream-diff-editor-fg: #e5e5e5;
  --markstream-diff-unchanged-fg: #d4d4d4;
  --markstream-diff-unchanged-bg: #262626;
  --markstream-diff-unchanged-divider: hsl(0 0% 100% / 0.08);
  --markstream-diff-focus: var(--focus-ring);
  --markstream-diff-widget-shadow: hsl(var(--ms-foreground) / 0.72);
  --markstream-diff-action-hover: var(--code-action-hover-bg);
  --markstream-diff-panel-bg: #121212;
  --markstream-diff-panel-bg-soft: #121212;
  --markstream-diff-panel-bg-strong: #121212;
  --markstream-diff-panel-border: hsl(var(--ms-border) / 0.3);
  --markstream-diff-gutter-bg: linear-gradient(
    180deg,
    hsl(0 0% 7% / 0.94) 0%,
    hsl(0 0% 7% / 0.98) 100%
  );
  --markstream-diff-gutter-guide: hsl(var(--ms-muted-foreground) / 0.08);
  --markstream-diff-gutter-gap: 8px;
  --markstream-diff-line-number-bg: var(--markstream-diff-editor-bg);
  --markstream-diff-line-number: var(--code-line-number);
  --markstream-diff-line-number-active: var(--code-line-number);
  --markstream-diff-added-fg: hsl(152 42% 60%);
  --markstream-diff-removed-fg: hsl(0 58% 58%);
  --markstream-diff-added-line: hsl(152 42% 60% / 0.18);
  --markstream-diff-removed-line: hsl(0 58% 58% / 0.18);
  --markstream-diff-added-inline: hsl(152 42% 60% / 0.28);
  --markstream-diff-removed-inline: hsl(0 58% 58% / 0.28);
  --markstream-diff-added-inline-border: transparent;
  --markstream-diff-removed-inline-border: transparent;
  --markstream-diff-added-gutter: linear-gradient(
    90deg,
    var(--markstream-diff-added-fg) 0 4px,
    transparent 4px 100%
  );
  --markstream-diff-removed-gutter: repeating-linear-gradient(
        180deg,
        var(--markstream-diff-removed-fg) 0 2px,
        transparent 2px 4px
      )
      left / 4px 100% no-repeat;
  --markstream-diff-added-line-fill: hsl(152 42% 60% / 0.18);
  --markstream-diff-removed-line-fill: hsl(0 58% 58% / 0.18);
}

.code-editor-container {
  transition: none;
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
}

.code-block-container.is-diff .code-editor-container {
  transition: none;
}

.code-editor-layer {
  display: grid;
  min-width: 0;
  position: relative;
}

.code-editor-layer--collapsed {
  height: 0;
  min-height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}
.code-editor-layer > .code-editor-container {
  grid-area: 1 / 1;
  z-index: 1;
}
/* PreCodeBlock has a toolbar-capable fragment root, so Vue cannot forward this
   component's scope attribute to its nested <pre>. Cross that component
   boundary explicitly; otherwise the ready runtime host and fallback occupy
   separate implicit grid rows for one frame and their heights stack. */
.code-editor-layer > :deep(pre.code-pre-fallback) {
  grid-area: 1 / 1;
  position: relative;
  z-index: 2;
}

.code-block-container.is-plain-text:not(.is-diff) :deep(.stream-diffs-shell) {
  background: var(--vscode-editor-background, var(--markstream-code-fallback-bg)) !important;
  color: var(--vscode-editor-foreground, var(--markstream-code-fallback-fg)) !important;
}

.code-block-container.is-diff {
  color: var(--markstream-diff-shell-fg);
  border-color: var(--markstream-diff-shell-border);
  background: var(--markstream-diff-shell-bg);
  box-shadow: var(--markstream-diff-shell-shadow);
  --vscode-editor-selectionBackground: var(--markstream-diff-action-hover);
  /* Keep shared header background; diff only changes foreground/border tokens. */
  --code-fg: var(--markstream-diff-shell-fg);
  --code-border: var(--markstream-diff-header-border);
  --code-line-number: var(--markstream-diff-shell-muted);
  --code-action-fg: var(--markstream-diff-shell-muted);
}

.code-block-container.is-diff .code-editor-layer {
  background: transparent;
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

.code-block-container:not(.is-diff) {
  --markstream-code-line-number-box-width: calc(
    var(--markstream-code-layout-character-width, 1ch) +
      var(--markstream-code-layout-character-width, 1ch) +
      var(--markstream-code-layout-character-width, 1ch) +
      var(--markstream-code-layout-character-width, 1ch) +
      var(--markstream-code-layout-character-width, 1ch) + 2px
  );
  --markstream-code-content-left: calc(
    var(--markstream-code-line-number-box-width) +
      var(--markstream-code-layout-character-width, 1ch)
  );
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

.code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview) {
  background: var(--markstream-diff-editor-bg);
  transition: none;
}

.code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview .markstream-pre__diff-pane) {
  box-sizing: border-box;
  padding-bottom: var(--markstream-pre-diff-pane-bottom-padding, 0px);
}

.code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview:not(.markstream-pre--diff-inline) .markstream-pre__diff-pane) {
  padding-bottom: var(--markstream-pre-diff-pane-bottom-padding, 0px);
}

.code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview .markstream-pre__diff-line--added > .markstream-pre__diff-number) {
  background: var(--markstream-diff-added-number-fill, var(--markstream-diff-added-line-fill, transparent)) !important;
}

.code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview .markstream-pre__diff-line--removed > .markstream-pre__diff-number) {
  background: var(--markstream-diff-removed-number-fill, var(--markstream-diff-removed-line-fill, transparent)) !important;
}

.code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview .markstream-pre__diff-line--added > .markstream-pre__diff-rail) {
  background: var(--markstream-diff-added-gutter, currentColor) !important;
}

.code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview .markstream-pre__diff-line--removed > .markstream-pre__diff-rail) {
  background: var(--markstream-diff-removed-gutter, currentColor) !important;
}

@media (prefers-reduced-motion: reduce) {
  .code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview) {
    transition: none;
  }
}

.code-block-container.is-rendering .code-height-placeholder {
  position: relative;
  overflow: hidden;
  min-height: var(--ms-size-skeleton-min-height);
  background: var(--loading-shimmer);
}

.code-block-container.is-rendering .code-height-placeholder::before {
  content: '';
  position: absolute;
  inset-block: 0;
  left: -300%;
  width: 400%;
  background: linear-gradient(90deg, var(--loading-shimmer) 25%, hsl(var(--ms-muted) / 0.7) 37%, var(--loading-shimmer) 63%);
  animation: code-skeleton-shimmer 1.2s ease-in-out infinite;
}

/* Loading placeholder styles */
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
  position: relative;
  overflow: hidden;
  height: 1rem;
  border-radius: calc(var(--ms-radius) * 0.5);
  background: var(--loading-shimmer);
}

.skeleton-line::before {
  content: '';
  position: absolute;
  inset-block: 0;
  left: -300%;
  width: 400%;
  background: linear-gradient(90deg, var(--loading-shimmer) 25%, hsl(var(--ms-muted) / 0.7) 37%, var(--loading-shimmer) 63%);
}

.code-block-container.is-rendering .skeleton-line::before {
  animation: code-skeleton-shimmer 1.2s ease-in-out infinite;
}

.skeleton-line.short {
  width: 60%;
}

.code-block-container[data-markstream-viewport-pending='true'] .code-height-placeholder::before,
.code-block-container[data-markstream-viewport-pending='true'] .skeleton-line::before {
  animation: none;
}

@keyframes code-skeleton-shimmer {
  from { transform: translateX(0); }
  to { transform: translateX(75%); }
}

@media (prefers-reduced-motion: reduce) {
  .code-block-container.is-rendering .code-height-placeholder::before,
  .skeleton-line::before {
    animation: none;
  }
}
</style>
