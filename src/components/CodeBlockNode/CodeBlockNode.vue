<script setup lang="ts">
import type { CodeBlockMonacoTheme, CodeBlockNodeProps, CodeBlockPreviewPayload } from '../../types/component-props'
import type { MonacoDiffEditorViewLike, MonacoDisposableLike, MonacoEditorViewLike, MonacoNamespaceLike, MonacoRuntimeOptions } from './monaco'
// Avoid static import of `stream-monaco` for types so the runtime bundle
// doesn't get a reference. Define minimal local types we need here.
import { computed, getCurrentInstance, inject, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, shallowRef, useAttrs, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
// Tooltip is provided as a singleton via composable to avoid many DOM nodes
import { hideTooltip } from '../../composables/useSingletonTooltip'
import { useOffscreenHeavyNodeDeferral, useViewportPriority, useViewportPriorityOptions } from '../../composables/viewportPriority'
import { languageIconsRevision, languageMap, normalizeLanguageIdentifier, resolveMonacoLanguageId } from '../../utils'
import { MARKSTREAM_LANGUAGE_ICON_RESOLVER_KEY } from '../../utils/languageIconContext'
import { resolveLifecycleIndexKey } from '../../utils/lifecycleIndexKey'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../../utils/nodeLifecycle'
import { resolveLanguageIcon } from '../../utils/resolveLanguageIcon'
import { safeCancelRaf, safeRaf } from '../../utils/safeRaf'
import PreCodeNode from '../PreCodeNode'
import {
  defaultDiffHideUnchangedRegions,
  isDiffCodeBlock,
  resolveCodeBlockHeader,
  resolveDiffHideUnchangedRegionsOption,
  resolveDiffInlineLayout,
} from './codeBlockHeader'
import CodeBlockShell from './CodeBlockShell.vue'
import HtmlPreviewFrame from './HtmlPreviewFrame.vue'
import {
  getUseMonaco,
} from './monaco'

const props = withDefaults(
  defineProps<CodeBlockNodeProps & {
    estimatedHeightPx?: number
    estimatedContentHeightPx?: number
    estimatedDiffInline?: boolean
  }>(),
  {
    isShowPreview: true,
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

const emits = defineEmits<{
  (e: 'previewCode', payload: CodeBlockPreviewPayload): void
  (e: 'copy', code: string): void
}>()

const attrs = useAttrs()
const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY, null)
const hostScrollManaged = inject<{ value: boolean } | null>('markstreamHostScrollManaged', null)
const appLanguageIconResolver = inject(MARKSTREAM_LANGUAGE_ICON_RESOLVER_KEY, undefined)
const lifecycleIndexKey = computed(() => {
  return resolveLifecycleIndexKey(props, attrs)
})

// Chrome warns when Monaco registers non-passive touchstart listeners.
// Scope the workaround to editor boot so the host page prototype is restored.
const MONACO_TOUCH_PATCH_STATE_KEY = '__markstreamMonacoPassiveTouchState__'
type AddEventListenerFn = Element['addEventListener']

interface MonacoTouchPatchState {
  depth: number
  original: AddEventListenerFn | null
}
const activeMonacoTouchPatchReleases = new Set<() => void>()

function getMonacoTouchPatchState() {
  const globalObj = window as Window
  const stateStore = globalObj as unknown as Record<string, unknown>
  const existing = stateStore[MONACO_TOUCH_PATCH_STATE_KEY] as MonacoTouchPatchState | undefined
  if (existing)
    return existing
  const next: MonacoTouchPatchState = {
    depth: 0,
    original: null,
  }
  stateStore[MONACO_TOUCH_PATCH_STATE_KEY] = next
  return next
}

async function withMonacoPassiveTouchListeners<T>(task: () => Promise<T> | T) {
  if (typeof window === 'undefined')
    return await task()

  const proto = window.Element?.prototype
  const nativeAdd = proto?.addEventListener
  if (!proto || !nativeAdd)
    return await task()

  const state = getMonacoTouchPatchState()
  let release: (() => void) | null = null
  try {
    if (state.depth === 0) {
      state.original = nativeAdd
      proto.addEventListener = function patchedMonacoTouchStart(
        this: Element,
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) {
        const original = state.original ?? nativeAdd
        if (type === 'touchstart' && shouldForcePassiveForMonaco(this, options))
          return original.call(this, type, listener, withPassiveOptions(options))
        return original.call(this, type, listener, options)
      }
    }

    state.depth++
    let released = false
    release = () => {
      if (released)
        return
      released = true
      activeMonacoTouchPatchReleases.delete(release!)
      state.depth = Math.max(0, state.depth - 1)
      if (state.depth === 0 && state.original && proto.addEventListener !== state.original) {
        proto.addEventListener = state.original
        state.original = null
      }
    }
    activeMonacoTouchPatchReleases.add(release)
  }
  catch {
    return await task()
  }

  try {
    return await task()
  }
  finally {
    release?.()
  }
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
const monacoLanguage = computed(() => resolveMonacoLanguageId(codeLanguage.value))
const runtimeLanguage = computed(() => monacoLanguage.value === 'plaintext' ? 'text' : monacoLanguage.value)
const isPlainTextLanguage = computed(() => monacoLanguage.value === 'plaintext')
const isExpanded = ref(false)
const isCollapsed = ref(false)
const editorCreated = ref(false)
const editorRuntimeCreated = ref(false)
const editorMounted = ref(false)
const monacoReady = ref(false)
let isUnmounted = false
let expandRafId: number | null = null
let deferredHeightSyncRafId: number | null = null
let deferredHeightSyncFollowUpRafId: number | null = null
let streamingDiffHeightChaseRafId: number | null = null
let streamingDiffHeightChaseFrames = 0
let streamingDiffHeightChaseAllowSettled = false
let lifecyclePendingIndexKey = ''
const heightBeforeCollapse = ref<number | null>(null)
const lastStableCollapsedDiffHeight = ref<number | null>(null)
let collapsedDiffHandlesMouseWheel: boolean | null = null
let resumeGuardFrames = 0
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
  for (const release of Array.from(activeMonacoTouchPatchReleases))
    release()
  clearLifecyclePending()
  viewportHandle.value?.destroy()
  viewportHandle.value = null
})

// Lazy-load `stream-monaco` helpers at runtime so consumers who don't install
// `stream-monaco` won't have the editor code bundled. We provide safe no-op
// fallbacks for the minimal API we use.
let createEditor: ((el: HTMLElement, code: string, lang: string) => Promise<unknown> | unknown) | null = null
let createDiffEditor: ((el: HTMLElement, original: string, modified: string, lang: string) => Promise<unknown> | unknown) | null = null
let updateCode: (code: string, lang: string) => Promise<unknown> | unknown = () => {}
let updateDiffCode: (original: string, modified: string, lang: string) => Promise<unknown> | unknown = () => {}
let getEditor: () => MonacoNamespaceLike | null = () => null
let getEditorView: () => MonacoEditorViewLike | null = () => ({ getModel: () => ({ getLineCount: () => 1 }), getOption: () => 14, updateOptions: () => {} })
let getDiffEditorView: () => MonacoDiffEditorViewLike | null = () => ({ getModel: () => ({ getLineCount: () => 1 }), getOption: () => 14, updateOptions: () => {} })
let cleanupEditor: () => void = () => {}
let safeClean = () => {}
let refreshDiffPresentation: () => Promise<unknown> | unknown = () => {}
let whenRuntimeVisualReady: (() => Promise<boolean>) | null = null
let createEditorPromise: Promise<void> | null = null
let editorRuntimeCreationPromise: Promise<void> | null = null
let monacoRuntimePromise: Promise<void> | null = null
let detectLanguage: (code: string) => string = () => String(props.node.language ?? 'plaintext')
let setTheme: (theme: CodeBlockMonacoTheme | undefined) => Promise<void> | void = async () => {}
let pendingDiffResultErrorFilterInstalled = false
let pendingDiffResultErrorFilterCleanup: (() => void) | null = null
const editorHeightSyncDisposables: MonacoDisposableLike[] = []
const inlineFoldProxyCleanups: Array<() => void> = []
let runtimeMonacoOptions: MonacoRuntimeOptions | null = null
const isDiff = computed(() => isDiffCodeBlock(props.node))
const diffStats = ref({ removed: 0, added: 0 })
const diffStatsAriaLabel = computed(() => `-${diffStats.value.removed} +${diffStats.value.added}`)
const disabledDiffHideUnchangedRegions = Object.freeze({
  ...defaultDiffHideUnchangedRegions,
  enabled: false,
  revealLineCount: 0,
})
function resolveDiffWordWrapOption(raw: Record<string, unknown>) {
  if (raw.diffWordWrap !== undefined)
    return raw.diffWordWrap

  return 'off'
}

function shouldUseInlineDiffLayout(options: Record<string, unknown>) {
  const width = container.value?.getBoundingClientRect?.().width
    || container.value?.clientWidth
    || (typeof window === 'undefined' ? 0 : window.innerWidth)
  return resolveDiffInlineLayout(options, width)
}

function resolveDiffScrollbar(raw: Record<string, unknown>) {
  const rawScrollbar = raw.scrollbar && typeof raw.scrollbar === 'object'
    ? raw.scrollbar as Record<string, unknown>
    : {}

  return {
    ...rawScrollbar,
    verticalScrollbarSize: 0,
    horizontalScrollbarSize: 0,
    ...(shouldUseInlineDiffLayout(raw) ? { horizontal: 'hidden' } : {}),
  }
}

function resolveDiffRenderPair(original: string, updated: string) {
  return {
    original: getDisplayCode(original),
    updated: getDisplayCode(updated),
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
          warnCodeBlockDev('Failed to refresh Monaco diff presentation', error)
      })
    }
  }
  catch (error) {
    if (!isPendingDiffResultError(error))
      warnCodeBlockDev('Failed to refresh Monaco diff presentation', error)
  }
}

const resolvedMonacoOptions = computed(() => {
  const raw = props.monacoOptions ? { ...props.monacoOptions } : {}
  if (!isDiff.value) {
    return {
      lineDecorationsWidth: 0,
      lineNumbersMinChars: 2,
      glyphMargin: false,
      ...raw,
    }
  }
  const diffHideUnchangedRegions = raw.diffHideUnchangedRegions === undefined
    ? { ...defaultDiffHideUnchangedRegions }
    : resolveDiffHideUnchangedRegionsOption(raw.diffHideUnchangedRegions)
  const hideUnchangedRegions = raw.hideUnchangedRegions === undefined
    ? undefined
    : resolveDiffHideUnchangedRegionsOption(raw.hideUnchangedRegions)
  const streamPreviewDiff = props.stream !== false && props.loading !== false
  const activeDiffHideUnchangedRegions = streamPreviewDiff
    ? { ...disabledDiffHideUnchangedRegions }
    : diffHideUnchangedRegions
  const activeHideUnchangedRegions = streamPreviewDiff
    ? { ...disabledDiffHideUnchangedRegions }
    : hideUnchangedRegions
  const diffWordWrap = resolveDiffWordWrapOption(raw)
  const experimental = {
    ...((raw.experimental as Record<string, unknown> | undefined) ?? {}),
  }
  const diffUnchangedRegionStyle = raw.diffUnchangedRegionStyle ?? 'line-info'
  const diffScrollbar = resolveDiffScrollbar(raw)
  const diffDefaults = {
    maxComputationTime: 0,
    diffAlgorithm: 'legacy',
    ignoreTrimWhitespace: false,
    renderIndicators: true,
    diffUpdateThrottleMs: 120,
    renderLineHighlight: 'none',
    renderLineHighlightOnlyWhenFocus: true,
    selectionHighlight: false,
    occurrencesHighlight: 'off',
    matchBrackets: 'never',
    lineDecorationsWidth: 4,
    lineNumbersMinChars: 2,
    glyphMargin: false,
    padding: { top: 0, bottom: 0 },
    minimap: { enabled: false },
    renderOverviewRuler: false,
    overviewRulerBorder: false,
    hideCursorInOverviewRuler: true,
    scrollBeyondLastLine: false,
    diffWordWrap,
    renderSideBySide: raw.renderSideBySide ?? true,
    diffHideUnchangedRegions: activeDiffHideUnchangedRegions,
    useInlineViewWhenSpaceIsLimited: raw.useInlineViewWhenSpaceIsLimited ?? false,
    diffLineStyle: 'background',
    diffAppearance: 'auto',
    diffUnchangedRegionStyle,
    diffHunkActionsOnHover: false,
    experimental,
  }
  return {
    ...diffDefaults,
    ...raw,
    experimental,
    ...(activeHideUnchangedRegions === undefined ? {} : { hideUnchangedRegions: activeHideUnchangedRegions }),
    diffHideUnchangedRegions: activeDiffHideUnchangedRegions,
    diffWordWrap,
    scrollbar: diffScrollbar,
  }
})

/**
 * Whether the editor surface (Monaco area) is dark.
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

  const explicit = resolvedMonacoOptions.value?.diffAppearance
  if (explicit === 'light' || explicit === 'dark')
    return explicit

  return editorSurfaceIsDark.value ? 'dark' : 'light'
})

const resolvedSurfaceIsDark = computed(() =>
  isDiff.value ? effectiveDiffAppearance.value === 'dark' : editorSurfaceIsDark.value,
)

// In streaming scenarios, the opening fence info string can arrive in chunks
// (e.g. "```d" then "iff json:..."), which means a block may flip between
// single <-> diff after the component has mounted. Monaco editors can't switch
// kind in-place, so we recreate the editor when the kind changes.
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
const preFallbackWrap = computed(() => {
  if (isDiff.value) {
    const diffWordWrap = resolvedMonacoOptions.value?.diffWordWrap
    if (diffWordWrap === 'inherit') {
      const wordWrap = props.monacoOptions?.wordWrap
      return wordWrap == null || String(wordWrap) !== 'off'
    }

    return diffWordWrap === 'on'
  }

  const wordWrap = props.monacoOptions?.wordWrap
  // Keep consistent with CodeBlockNode's default `wordWrap: 'on'`.
  if (wordWrap == null)
    return true
  return String(wordWrap) !== 'off'
})
const preFallbackDiffInline = computed(() => {
  if (!isDiff.value)
    return false

  return shouldUseInlineDiffLayout((resolvedMonacoOptions.value ?? {}) as Record<string, unknown>)
})
const preFallbackDiffHideUnchangedRegions = computed(() => {
  // Monaco keeps unchanged-region folding disabled while a diff is streaming,
  // but the fallback pre must keep its final folded geometry. Otherwise the
  // fallback expands all unchanged rows and visibly jumps when Monaco reveals.
  const configured = props.monacoOptions?.diffHideUnchangedRegions
  return configured === undefined
    ? { ...defaultDiffHideUnchangedRegions }
    : resolveDiffHideUnchangedRegionsOption(configured)
})
function resolvePreFallbackDiffCollapse() {
  const value = preFallbackDiffHideUnchangedRegions.value
  if (value === false || (typeof value === 'object' && value.enabled === false))
    return null

  const options = typeof value === 'object' ? value : defaultDiffHideUnchangedRegions
  const contextLineCount = Math.max(0, Math.floor(options.contextLineCount ?? 2))
  const minimumLineCount = Math.max(1, Math.floor(options.minimumLineCount ?? 4))
  return {
    contextLineCount,
    collapsedContextThreshold: minimumLineCount - 1,
  }
}
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
const showPreWhileMonacoLoads = computed(() => {
  // If Monaco isn't available at all, the component renders a standalone PreCodeNode.
  if (usePreCodeRender.value)
    return false
  if (editorCreationFailed.value)
    return true
  // A warm runtime still needs at least one paint before its editor is visible.
  // Keeping one fallback rule for single and diff blocks also prevents parser
  // kind changes from producing a blank third state during the handoff.
  return !editorDisplayReady.value
})
const renderPreFallback = computed(() => showPreWhileMonacoLoads.value)
const hideCodeEditorContainer = computed(() =>
  showPreWhileMonacoLoads.value && !editorHandoffPrepared.value,
)
const restoreVisualPending = computed(() =>
  !usePreCodeRender.value
  && !editorCreationFailed.value
  && showPreWhileMonacoLoads.value,
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
async function ensureMonacoRuntime() {
  if (typeof window === 'undefined' || isUnmounted)
    return
  if (monacoReady.value || usePreCodeRender.value)
    return
  if (monacoRuntimePromise)
    return monacoRuntimePromise

  const pending = (async () => {
    try {
      const mod = await getUseMonaco()
      if (isUnmounted)
        return
      if (!mod) {
        if (import.meta.env?.DEV) {
          console.warn('[markstream-vue] stream-diffs is not installed. Code blocks will use basic rendering. Install stream-diffs for enhanced code block rendering.')
        }
        usePreCodeRender.value = true
        return
      }
      const useMonaco = mod.useMonaco
      const det = mod.detectLanguage
      if (typeof det === 'function')
        detectLanguage = det
      if (typeof useMonaco !== 'function')
        return

      const theme = resolveRequestedTheme()
      if (theme && props.themes && Array.isArray(props.themes) && !props.themes.includes(theme))
        throw new Error('Preferred theme not in provided themes array')

      runtimeMonacoOptions = buildRuntimeMonacoOptions()
      const helpers = useMonaco(runtimeMonacoOptions)
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
      monacoReady.value = true
    }
    catch (err) {
      if (isUnmounted)
        return
      if (import.meta.env?.DEV)
        console.warn('[markstream-vue] Failed to initialize Monaco editor:', err)
      usePreCodeRender.value = true
    }
  })()

  const currentPromise = pending.finally(() => {
    if (monacoRuntimePromise === currentPromise)
      monacoRuntimePromise = null
  })
  monacoRuntimePromise = currentPromise
  return currentPromise
}

const codeFontMin = 10
const codeFontMax = 36
const codeFontStep = 1
const defaultPreFallbackFontSize = 12
const defaultPreFallbackLineHeight = 18
const defaultCodeFontSize = ref<number>(
  typeof props.monacoOptions?.fontSize === 'number' ? props.monacoOptions!.fontSize : Number.NaN,
)
const codeFontSize = ref<number>(defaultCodeFontSize.value)
// Set by syncFallbackFontMetricsFromEditor() after Monaco renders; drive preFallback* computeds.
const measuredEditorFontSize = ref<number | null>(null)
const measuredEditorLineHeight = ref<number | null>(null)
const measuredEditorCharacterWidth = ref<number | null>(null)
const fontBaselineReady = computed(() => {
  const a = defaultCodeFontSize.value
  const b = codeFontSize.value
  return typeof a === 'number' && Number.isFinite(a) && a > 0 && typeof b === 'number' && Number.isFinite(b) && b > 0
})
const preFallbackFontSize = computed(() => {
  const measured = measuredEditorFontSize.value
  if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0)
    return measured
  const fromOptions = props.monacoOptions?.fontSize
  if (typeof fromOptions === 'number' && Number.isFinite(fromOptions) && fromOptions > 0)
    return fromOptions
  const fromState = codeFontSize.value
  if (typeof fromState === 'number' && Number.isFinite(fromState) && fromState > 0)
    return fromState
  return defaultPreFallbackFontSize
})
const preFallbackLineHeight = computed(() => {
  const measured = measuredEditorLineHeight.value
  if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0)
    return measured
  const fromOptions = props.monacoOptions?.lineHeight
  if (typeof fromOptions === 'number' && Number.isFinite(fromOptions) && fromOptions > 0)
    return fromOptions
  if (preFallbackFontSize.value === defaultPreFallbackFontSize)
    return defaultPreFallbackLineHeight
  return Math.max(12, Math.round(preFallbackFontSize.value * 1.5))
})
// Unified line height for both diff and non-diff fallback; uses measured values first.
const preFallbackEffectiveLineHeight = computed(() => preFallbackLineHeight.value)
function isRemovedDiffLine(line: string) {
  return line.startsWith('-') && !line.startsWith('---')
}

function hasDiffSourcePair() {
  return props.node.originalCode != null || props.node.updatedCode != null
}
const preFallbackTabSize = computed(() => {
  const fromOptions = props.monacoOptions?.tabSize
  if (typeof fromOptions === 'number' && Number.isFinite(fromOptions) && fromOptions > 0)
    return fromOptions
  // Monaco default is 4.
  return 4
})
const preFallbackVerticalPadding = computed(() => {
  const padding = props.monacoOptions?.padding
  const defaultPadding = isDiff.value ? 0 : 8
  const top = typeof padding?.top === 'number' && Number.isFinite(padding.top) && padding.top >= 0
    ? padding.top
    : defaultPadding
  const bottom = typeof padding?.bottom === 'number' && Number.isFinite(padding.bottom) && padding.bottom >= 0
    ? padding.bottom
    : defaultPadding
  return { top, bottom }
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

const preFallbackLocalMinHeight = computed(() => {
  const countLines = (source: unknown) => {
    const value = String(source ?? '')
    if (!value)
      return 1
    return Math.max(1, value.split(/\r\n|\n|\r/).length)
  }

  if (isDiff.value)
    return null

  if (
    estimatedVisibleContentHeight.value != null
    && !shouldUseStreamingLocalPreFallbackHeight()
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
  if (estimated != null && !shouldUseStreamingLocalPreFallbackHeight())
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
  // content height. When Monaco becomes visible, the grid row will not collapse
  // by a browser rounding pixel.
  if (showPreWhileMonacoLoads.value || !editorDisplayReady.value)
    return preFallbackReservedContentHeight.value

  return null
})

function getDiffVisualVars(isDark: boolean) {
  const addedFg = isDark ? 'hsl(152 42% 60%)' : 'var(--diff-added-fg)'
  const removedFg = isDark ? 'hsl(0 58% 58%)' : 'var(--diff-removed-fg)'
  const addedLine = isDark ? 'hsl(152 42% 60% / 0.18)' : 'var(--diff-added-bg)'
  const removedLine = isDark ? 'hsl(0 58% 58% / 0.18)' : 'var(--diff-removed-bg)'
  const addedInline = isDark ? 'hsl(152 42% 60% / 0.28)' : 'var(--diff-added-inline-bg)'
  const removedInline = isDark ? 'hsl(0 58% 58% / 0.28)' : 'var(--diff-removed-inline-bg)'
  const addedGutter = `linear-gradient(90deg, ${addedFg} 0 4px, transparent 4px 100%)`
  const removedGutter = `linear-gradient(90deg, ${removedFg} 0 4px, transparent 4px 100%)`
  const lineNumberBg = isDark ? 'hsl(0 0% 7% / 0.98)' : 'hsl(var(--ms-muted) / 0.45)'
  const characterWidth = 'var(--markstream-code-layout-character-width, 1ch)'
  const doubleCharacterWidth = `calc(${characterWidth} + ${characterWidth})`
  const lineNumberBoxWidth = `calc(${characterWidth} + ${characterWidth} + ${characterWidth} + ${characterWidth} + ${characterWidth} + 2px)`
  const marginWidth = `calc(${lineNumberBoxWidth} + ${characterWidth})`
  return {
    '--markstream-diff-line-number-bg': lineNumberBg,
    '--markstream-diff-added-fg': addedFg,
    '--markstream-diff-removed-fg': removedFg,
    '--markstream-diff-added-line': addedLine,
    '--markstream-diff-removed-line': removedLine,
    '--markstream-diff-added-line-fill': addedLine,
    '--markstream-diff-removed-line-fill': removedLine,
    '--markstream-diff-added-gutter': addedGutter,
    '--markstream-diff-removed-gutter': removedGutter,
    '--markstream-diff-added-inline': addedInline,
    '--markstream-diff-removed-inline': removedInline,
    '--stream-monaco-added-fg': addedFg,
    '--stream-monaco-removed-fg': removedFg,
    '--stream-monaco-added-line': addedLine,
    '--stream-monaco-removed-line': removedLine,
    '--stream-monaco-added-line-fill': addedLine,
    '--stream-monaco-removed-line-fill': removedLine,
    '--stream-monaco-added-gutter': addedGutter,
    '--stream-monaco-removed-gutter': removedGutter,
    '--stream-monaco-added-inline': addedInline,
    '--stream-monaco-removed-inline': removedInline,
    '--stream-monaco-gutter-marker-width': '4px',
    '--stream-monaco-gutter-gap': '1ch',
    '--stream-monaco-line-number-left': '0px',
    '--stream-monaco-line-number-width': doubleCharacterWidth,
    '--stream-monaco-line-number-padding-left': doubleCharacterWidth,
    '--stream-monaco-line-number-padding-right': characterWidth,
    '--stream-monaco-line-number-separator-width': '2px',
    '--stream-monaco-layout-character-width': characterWidth,
    '--stream-monaco-line-number-box-width': lineNumberBoxWidth,
    '--stream-monaco-line-number-gap-to-code': characterWidth,
    '--stream-monaco-line-number-bg': lineNumberBg,
    '--stream-monaco-diff-code-gap': characterWidth,
    '--stream-monaco-diff-code-padding': '0px',
    '--stream-monaco-original-margin-width': marginWidth,
    '--stream-monaco-original-scrollable-left': marginWidth,
    '--stream-monaco-original-scrollable-width': `calc(100% - ${marginWidth})`,
    '--stream-monaco-modified-margin-width': marginWidth,
    '--stream-monaco-modified-scrollable-left': marginWidth,
    '--stream-monaco-modified-scrollable-width': `calc(100% - ${marginWidth})`,
  }
}

const preFallbackStyle = computed(() => {
  const fontFamily = props.monacoOptions?.fontFamily
  const cappedEstimatedContentHeight = capEditorContentHeight(estimatedVisibleContentHeight.value)
  const cappedLocalMinHeight = capEditorContentHeight(preFallbackLocalMinHeight.value)
  const useStreamingLocalHeight = shouldUseStreamingLocalPreFallbackHeight()
  const style = {
    fontSize: `${preFallbackFontSize.value}px`,
    lineHeight: `${preFallbackEffectiveLineHeight.value}px`,
    tabSize: preFallbackTabSize.value,
    boxSizing: 'border-box',
    maxHeight: `${getMaxHeightValue()}px`,
    overflow: 'auto',
    paddingTop: `${preFallbackVerticalPadding.value.top}px`,
    paddingBottom: `${preFallbackVerticalPadding.value.bottom}px`,
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
    ...(typeof fontFamily === 'string' && fontFamily.trim()
      ? { '--markstream-code-font-family': fontFamily.trim() }
      : {}),
  } as Record<string, string | number>

  style['--markstream-pre-line-number-top'] = `${preFallbackVerticalPadding.value.top}px`
  style['--markstream-code-padding-left'] = 'calc(2ch + 2ch + 1ch + 2px + 1ch)'
  style['--markstream-pre-line-number-left'] = '0px'
  style['--markstream-pre-line-number-width'] = '2ch'
  style['--markstream-pre-line-number-padding-left'] = '2ch'
  style['--markstream-pre-line-number-padding-right'] = '1ch'
  style['--markstream-pre-line-number-separator-width'] = '2px'

  if (isDiff.value) {
    // Keep the pre diff fallback visually close to stream-monaco's diff line box.
    style['--markstream-pre-diff-line-height'] = `${preFallbackEffectiveLineHeight.value}px`
    style['--markstream-pre-diff-pane-bottom-padding'] = preFallbackDiffInline.value
      ? '0px'
      : `${SIDE_BY_SIDE_DIFF_PREVIEW_BOTTOM_PADDING}px`
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
  // While the diff fallback pre is visible, the hidden Monaco host must not
  // participate in layout. The fallback pre owns the row height.
  if (isDiff.value && showPreWhileMonacoLoads.value)
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
  const estimate = preFallbackReservedContentHeight.value
  pendingEstimatedEditorHeightFloor.value = !editorMounted.value && estimate != null
    ? estimate
    : null
}

function clearEstimatedEditorHeightFloor() {
  pendingEstimatedEditorHeightFloor.value = null
}

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
    editorDisplayReady.value = true
    await nextTick()
    syncEditorHostHeight(false)
    layoutEditorToHost()
    return true
  }

  // The editor is fully prepared while hidden. Flip the two layers in one Vue
  // patch so there is no visible pre-reveal or post-reveal validation state.
  syncDiffEditorHostToFallbackHeight() ?? syncDiffRevealHostHeight()
  layoutEditorToHost(true)
  syncDiffScrollFromFallback()
  syncInlineFoldProxies()
  // Let the Monaco host enter its final grid position underneath the visible
  // fallback before removing that fallback. This avoids a second layout pass
  // shifting the first highlighted frame after it becomes visible.
  editorHandoffPrepared.value = true
  await nextTick()
  layoutEditorToHost(true)
  await waitForAnimationFrame()
  layoutEditorToHost(true)
  if (whenRuntimeVisualReady && !await whenRuntimeVisualReady())
    return false
  syncFallbackFontMetricsFromEditor()
  syncDiffRevealHostHeight()
  layoutEditorToHost(true)
  editorDisplayReady.value = true
  await nextTick()
  syncDiffRevealHostHeight()
  layoutEditorToHost(true)
  syncFallbackFontMetricsFromEditor()
  syncInlineFoldProxies()
  scheduleEditorHeightSync()
  return true
}

function syncDiffRevealHostHeight() {
  const editorHost = codeEditor.value
  if (editorHost && hasRenderedDiffEditorDom(editorHost)) {
    syncInlineFoldProxies()
    syncEditorHostHeight({ preferModelDiffHeight: true })
    scheduleStreamingDiffHeightChase()
    return Number.parseFloat(editorHost.style.height || '') || null
  }
  return syncDiffEditorHostToFallbackHeight()
}

function canReleaseEstimatedFloorForFoldedDiff() {
  if (!isDiff.value)
    return false

  if (!editorMounted.value || !editorDisplayReady.value)
    return false

  if (showPreWhileMonacoLoads.value)
    return false

  const editorHost = codeEditor.value
  if (!editorHost)
    return false

  return hasVisibleDiffHiddenLines(editorHost)
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
    || canReleaseEstimatedFloorForFoldedDiff()

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

function getLineHeightSafe(editor: MonacoEditorViewLike | null | undefined): number {
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
  const fs = Number.isFinite(codeFontSize.value) && codeFontSize.value! > 0 ? (codeFontSize.value as number) : 14
  // Conservative fallback close to Monaco's default ratio
  return Math.max(12, Math.round(fs * 1.35))
}

function getVerticalPaddingSafe(editor: MonacoEditorViewLike | null | undefined): number {
  try {
    const monacoEditor = getEditor() as { EditorOption?: { padding?: unknown } } | null | undefined
    const key = monacoEditor?.EditorOption?.padding
    if (key != null) {
      const value = editor?.getOption?.(key) as { top?: unknown, bottom?: unknown } | undefined
      if (typeof value?.top === 'number' || typeof value?.bottom === 'number') {
        const top = typeof value?.top === 'number' && Number.isFinite(value.top) ? Math.max(0, value.top) : 0
        const bottom = typeof value?.bottom === 'number' && Number.isFinite(value.bottom) ? Math.max(0, value.bottom) : 0
        return top + bottom
      }
    }
  }
  catch {}

  const rawPadding = (resolvedMonacoOptions.value as Record<string, unknown> | undefined)?.padding as { top?: unknown, bottom?: unknown } | undefined
  if (typeof rawPadding?.top === 'number' || typeof rawPadding?.bottom === 'number') {
    const top = typeof rawPadding?.top === 'number' && Number.isFinite(rawPadding.top) ? Math.max(0, rawPadding.top) : 0
    const bottom = typeof rawPadding?.bottom === 'number' && Number.isFinite(rawPadding.bottom) ? Math.max(0, rawPadding.bottom) : 0
    return top + bottom
  }

  return isDiff.value ? 24 : 0
}

function countChangedLineRange(start: number | undefined, end: number | undefined) {
  if (typeof start !== 'number' || typeof end !== 'number')
    return 0
  if (start < 1 || end < start)
    return 0
  return end - start + 1
}

function splitCodeLines(source: string) {
  if (!source)
    return [] as string[]
  const lines = source.split(/\r?\n/)
  return lines.length === 1 && lines[0] === '' ? [] : lines
}

function estimateDiffStats(originalSource: string, modifiedSource: string) {
  const originalLines = splitCodeLines(originalSource)
  const modifiedLines = splitCodeLines(modifiedSource)
  let start = 0
  let originalEnd = originalLines.length - 1
  let modifiedEnd = modifiedLines.length - 1

  while (
    start <= originalEnd
    && start <= modifiedEnd
    && originalLines[start] === modifiedLines[start]
  ) {
    start++
  }

  while (
    originalEnd >= start
    && modifiedEnd >= start
    && originalLines[originalEnd] === modifiedLines[modifiedEnd]
  ) {
    originalEnd--
    modifiedEnd--
  }

  const originalMiddleLength = Math.max(0, originalEnd - start + 1)
  const modifiedMiddleLength = Math.max(0, modifiedEnd - start + 1)
  if (originalMiddleLength === 0 || modifiedMiddleLength === 0) {
    return {
      removed: originalMiddleLength,
      added: modifiedMiddleLength,
    }
  }

  const maxCells = 1_500_000
  if ((originalMiddleLength + 1) * (modifiedMiddleLength + 1) <= maxCells) {
    const columns = modifiedMiddleLength + 1
    let next = new Uint32Array(columns)
    let current = new Uint32Array(columns)
    for (let i = originalMiddleLength - 1; i >= 0; i--) {
      current[modifiedMiddleLength] = 0
      for (let j = modifiedMiddleLength - 1; j >= 0; j--) {
        current[j] = originalLines[start + i] === modifiedLines[start + j]
          ? next[j + 1] + 1
          : Math.max(next[j], current[j + 1])
      }
      const swap = next
      next = current
      current = swap
    }
    const commonMiddleLines = next[0]
    return {
      removed: originalMiddleLength - commonMiddleLines,
      added: modifiedMiddleLength - commonMiddleLines,
    }
  }

  return {
    removed: originalMiddleLength,
    added: modifiedMiddleLength,
  }
}

function hasInlineRemovedDiffRows() {
  if (!isDiff.value || !preFallbackDiffInline.value)
    return false

  if (hasDiffSourcePair()) {
    return estimateDiffStats(
      String(props.node.originalCode ?? ''),
      String(props.node.updatedCode ?? ''),
    ).removed > 0
  }

  return String(props.node.code ?? '')
    .split(/\r\n|\n|\r/)
    .some(line => isRemovedDiffLine(line))
}

function hasInlineDeletedContentReady(root: HTMLElement | null | undefined) {
  if (!hasInlineRemovedDiffRows())
    return true

  const fallbackLine = root?.querySelector<HTMLElement>('.stream-monaco-fallback-inline-delete-line')
  if (
    fallbackLine?.textContent?.trim()
    && (
      fallbackLine.hasAttribute('data-stream-monaco-colorize-signature')
      || fallbackLine.querySelector('[class*="mtk"]')
    )
  ) {
    return true
  }

  const zone = root?.querySelector<HTMLElement>(
    [
      '.editor.modified .view-zones .view-lines.line-delete',
      '.editor.modified .view-lines .view-line.line-delete',
      '.editor.original .view-zones .view-lines.line-delete',
      '.editor.original .view-lines .view-line.line-delete',
    ].join(','),
  )
  if (!zone || (!zone.matches('.view-line') && !zone.querySelector('.view-line')))
    return false

  const rect = zone.getBoundingClientRect()
  const rootRect = root?.getBoundingClientRect()
  if (rootRect?.width === 0 && rootRect.height === 0)
    return true

  return rect.width > 0 && rect.height > 0
}

function hasExpectedChangedDiffDom(
  root: HTMLElement | null | undefined,
  expected: { added: number, removed: number },
) {
  if (!root)
    return false

  const addedReady = expected.added <= 0 || Boolean(root.querySelector([
    '.line-insert',
    '.gutter-insert',
    '.stream-monaco-fallback-line-insert',
    '.stream-monaco-fallback-gutter-insert',
    '.stream-monaco-fallback-line-number-insert',
  ].join(',')))
  const removedReady = expected.removed <= 0 || Boolean(root.querySelector([
    '.line-delete',
    '.gutter-delete',
    '.inline-deleted-margin-view-zone',
    '.stream-monaco-fallback-line-delete',
    '.stream-monaco-fallback-gutter-delete',
    '.stream-monaco-fallback-line-number-delete',
    '.stream-monaco-fallback-inline-delete-line',
    '.stream-monaco-fallback-inline-delete-margin',
  ].join(',')))

  return addedReady && removedReady
}

function getMountedDiffNode(root: HTMLElement | null | undefined, selector: string) {
  const node = root?.querySelector(selector)
  if (!(node instanceof HTMLElement))
    return null
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function')
    return node

  const style = window.getComputedStyle(node)
  return style.display === 'none' ? null : node
}

function hasMountedDiffNode(root: HTMLElement | null | undefined, selector: string) {
  return getMountedDiffNode(root, selector) !== null
}

function hasExpectedChangedDiffGutterDom(
  root: HTMLElement | null | undefined,
  expected: { added: number, removed: number },
) {
  if (!root)
    return false

  const addedReady = expected.added <= 0 || [
    '.gutter-insert',
    '.stream-monaco-fallback-gutter-insert',
  ].some(selector => hasMountedDiffNode(root, selector))
  const removedReady = expected.removed <= 0 || [
    '.gutter-delete',
    '.inline-deleted-margin-view-zone',
    '.stream-monaco-fallback-gutter-delete',
    '.stream-monaco-fallback-inline-delete-margin',
  ].some(selector => hasMountedDiffNode(root, selector))

  return addedReady && removedReady
}

function hasDiffLineNumberGutterLayout(root: HTMLElement | null | undefined) {
  const lineNumbers = Array.from(
    root?.querySelectorAll<HTMLElement>('.monaco-diff-editor .margin-view-overlays .line-numbers') ?? [],
  )
  if (!lineNumbers.length)
    return false

  return lineNumbers.some((node) => {
    if (!node.textContent?.trim())
      return false
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function')
      return true

    const style = window.getComputedStyle(node)
    if (style.display === 'none')
      return false

    const rect = node.getBoundingClientRect()
    if (rect.width <= 0 && rect.height <= 0)
      return true

    const cssWidth = Number.parseFloat(style.width || '')
    const paddingLeft = Number.parseFloat(style.paddingLeft || '')
    const paddingRight = Number.parseFloat(style.paddingRight || '')
    const hasBox = Math.max(rect.width, Number.isFinite(cssWidth) ? cssWidth : 0) >= 8
    const hasInset = Number.isFinite(paddingLeft) && paddingLeft >= 1
      && Number.isFinite(paddingRight) && paddingRight >= 1

    return hasBox && hasInset
  })
}

function hasDiffContentLayoutReady(root: HTMLElement | null | undefined) {
  const viewLine = getMountedDiffNode(root, '.monaco-diff-editor .view-lines .view-line')
  if (!viewLine)
    return false
  if (!expectsDiffLineNumberGutter())
    return true

  const lineNumber = getMountedDiffNode(root, '.monaco-diff-editor .margin-view-overlays .line-numbers')
  if (!lineNumber)
    return false
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function')
    return true

  const viewRect = viewLine.getBoundingClientRect()
  const numberRect = lineNumber.getBoundingClientRect()
  if (viewRect.width <= 0 && viewRect.height <= 0)
    return true
  if (numberRect.width <= 0 && numberRect.height <= 0)
    return true

  const gapToCode = viewRect.left - numberRect.right
  return gapToCode >= 0 && gapToCode <= 32
}

function hasInlineDiffNativePresentationReady(
  root: HTMLElement | null | undefined,
  expectsChangedDom: boolean,
) {
  if (!preFallbackDiffInline.value)
    return true
  const hasChangedMarkers = expectsChangedDom || Boolean(root?.querySelector([
    '.line-insert',
    '.line-delete',
    '.gutter-insert',
    '.gutter-delete',
    '.stream-monaco-line-number-insert',
    '.stream-monaco-line-number-delete',
    '.stream-monaco-line-insert-fill',
    '.stream-monaco-line-delete-fill',
    '.stream-monaco-fallback-line-insert',
    '.stream-monaco-fallback-line-delete',
    '.stream-monaco-fallback-inline-delete-line',
  ].join(',')))
  if (!hasChangedMarkers)
    return true
  return Boolean(
    root?.classList.contains('stream-monaco-diff-inline-native-ready')
    && !root.classList.contains('stream-monaco-diff-native-stale'),
  )
}

function hasVisibleChangedViewLineFill(
  root: HTMLElement | null | undefined,
  side: 'original' | 'modified',
  lineNumberClassName: string,
  fillClassName: string,
) {
  const editorRoot = root?.querySelector<HTMLElement>(`.monaco-diff-editor .editor.${side}`)
  if (!editorRoot)
    return false

  const changedLineNumbers = Array.from(
    editorRoot.querySelectorAll<HTMLElement>(
      `.margin-view-overlays .line-numbers.${lineNumberClassName}`,
    ),
  )
  if (!changedLineNumbers.length)
    return true

  const viewLines = Array.from(
    editorRoot.querySelectorAll<HTMLElement>(
      '.lines-content > .view-lines:not(.line-delete) > .view-line',
    ),
  )
  if (!viewLines.length)
    return false

  return changedLineNumbers.every((lineNumberNode) => {
    const numberRect = lineNumberNode.getBoundingClientRect()
    let nearest: { node: HTMLElement, distance: number } | null = null
    for (const viewLine of viewLines) {
      const lineRect = viewLine.getBoundingClientRect()
      const distance = Math.abs(lineRect.top - numberRect.top)
      if (!nearest || distance < nearest.distance)
        nearest = { node: viewLine, distance }
    }
    return !nearest || nearest.distance > 1.25 || nearest.node.classList.contains(fillClassName)
  })
}

function hasExpectedChangedDiffViewLineFill(
  root: HTMLElement | null | undefined,
  expected: { added: number, removed: number },
) {
  if (!root)
    return false

  const addedReady = expected.added <= 0 || hasVisibleChangedViewLineFill(
    root,
    'modified',
    'stream-monaco-line-number-insert',
    'stream-monaco-line-insert-fill',
  )
  const removedReady = expected.removed <= 0 || (
    preFallbackDiffInline.value
      ? Boolean(root.classList.contains('stream-monaco-diff-inline-native-ready'))
      : hasVisibleChangedViewLineFill(
          root,
          'original',
          'stream-monaco-line-number-delete',
          'stream-monaco-line-delete-fill',
        )
  )

  return addedReady && removedReady
}

function hasLanguageHighlightReady(root: HTMLElement | null | undefined) {
  if (isPlainTextLanguage.value)
    return true
  if (!root)
    return false

  const viewLines = Array.from(
    root.querySelectorAll<HTMLElement>(
      '.monaco-diff-editor .view-lines .view-line, .monaco-editor .view-lines .view-line',
    ),
  ).filter((line) => {
    if (!line.textContent?.trim())
      return false
    const rect = line.getBoundingClientRect()
    return rect.width > 0 || rect.height > 0
  })
  if (!viewLines.length)
    return false

  const tokenCandidateLines = viewLines.filter(line => expectsLanguageTokensForLine(line.textContent ?? ''))
  if (!tokenCandidateLines.length)
    return true
  const linesToCheck = tokenCandidateLines
  const tokenizedLineCount = linesToCheck.filter((line) => {
    const spans = Array.from(line.querySelectorAll<HTMLElement>('span'))
      .filter(span => span.textContent?.trim())
    return spans.some((span) => {
      const tokenClasses = String(span.className || '').split(/\s+/)
      return tokenClasses.some(className => /^mtk\d+$/.test(className) && className !== 'mtk1')
    })
  }).length

  return tokenizedLineCount > 0
}

function expectsLanguageTokensForLine(text: string) {
  return /['"`{}()[\]:;=<>.,]|\/\/|\/\*|\b(?:async|await|class|const|enum|export|for|function|if|import|interface|let|return|switch|type|var|while)\b/.test(
    text.replace(/\u00A0/g, ' ').trim(),
  )
}

function expectsDiffLineNumberGutter() {
  const options = resolvedMonacoOptions.value as Record<string, unknown> | undefined
  return options?.lineNumbers !== 'off'
}

function syncEstimatedDiffStats() {
  if (!isDiff.value) {
    diffStats.value = { removed: 0, added: 0 }
    return
  }

  diffStats.value = estimateDiffStats(
    String(props.node.originalCode ?? ''),
    String(props.node.updatedCode ?? ''),
  )
}

function refreshDiffStats() {
  if (!isDiff.value) {
    diffStats.value = { removed: 0, added: 0 }
    return
  }

  try {
    const diff = getDiffEditorView()
    const lineChanges = diff?.getLineChanges?.()
    if (!Array.isArray(lineChanges)) {
      syncEstimatedDiffStats()
      return
    }

    let removed = 0
    let added = 0
    for (const change of lineChanges) {
      removed += countChangedLineRange(
        change.originalStartLineNumber,
        change.originalEndLineNumber,
      )
      added += countChangedLineRange(
        change.modifiedStartLineNumber,
        change.modifiedEndLineNumber,
      )
    }

    diffStats.value = { removed, added }
  }
  catch {
    syncEstimatedDiffStats()
  }
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
      const verticalPadding = Math.max(getVerticalPaddingSafe(o), getVerticalPaddingSafe(m))
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
    const hostRect = container.getBoundingClientRect()
    const hostStyle = window.getComputedStyle(container)
    if (hostStyle.display === 'none' || hostStyle.visibility === 'hidden')
      return null

    const diffsRoot = container.querySelector('diffs-container')
    if (diffsRoot instanceof HTMLElement) {
      const diffsRect = diffsRoot.getBoundingClientRect()
      if (diffsRect.height > 0 && diffsRect.bottom > hostRect.top)
        return Math.ceil(diffsRect.bottom - hostRect.top)
    }

    const selectors = [
      '.editor.original .view-lines .view-line',
      '.editor.modified .view-lines .view-line',
      '.editor.original .view-zones > div',
      '.editor.modified .view-zones > div',
      '.editor.original .margin-view-zones > div',
      '.editor.modified .margin-view-zones > div',
      '.editor.original .diff-hidden-lines',
      '.editor.modified .diff-hidden-lines',
      '.stream-monaco-diff-unchanged-bridge',
    ]

    let bottom = 0
    for (const node of Array.from(container.querySelectorAll(selectors.join(',')))) {
      if (!(node instanceof HTMLElement))
        continue
      const isViewZone = Boolean(
        node.parentElement?.classList.contains('view-zones')
        || node.parentElement?.classList.contains('margin-view-zones'),
      )
      if (isViewZone) {
        const hasVisibleZoneContent = node.textContent?.trim()
          || node.matches('.line-delete, .line-insert, .cdr')
          || node.querySelector('.diff-hidden-lines, .stream-monaco-diff-unchanged-bridge, .line-delete, .line-insert, .cdr')
        if (!hasVisibleZoneContent)
          continue
      }
      const style = window.getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden')
        continue
      if (Number.parseFloat(style.opacity || '1') <= 0.01)
        continue
      const rect = node.getBoundingClientRect()
      if (rect.height <= 0 || rect.bottom <= hostRect.top)
        continue
      bottom = Math.max(bottom, rect.bottom - hostRect.top)
    }

    if (bottom > 0)
      return Math.ceil(bottom)

    return null
  }
  catch {
    return null
  }
}

function hasVisibleDiffHiddenLines(container: HTMLElement): boolean {
  if (typeof window === 'undefined')
    return false
  const hostRect = container.getBoundingClientRect()
  if (hostRect.width <= 0 || hostRect.height <= 0)
    return false
  const nodes = container.querySelectorAll(
    '.editor.modified .diff-hidden-lines, .editor.original .diff-hidden-lines, .stream-monaco-diff-unchanged-bridge',
  )
  for (const node of Array.from(nodes)) {
    if (!(node instanceof HTMLElement))
      continue
    const style = window.getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden')
      continue
    if (Number.parseFloat(style.opacity || '1') <= 0.01)
      continue
    const rect = node.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0)
      continue
    if (rect.bottom <= hostRect.top || rect.top >= hostRect.bottom)
      continue
    return true
  }
  return false
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
    const verticalPadding = Math.max(
      getVerticalPaddingSafe(originalEditor),
      getVerticalPaddingSafe(modifiedEditor),
    )
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
function getCodeEditorLayerElement() {
  const parent = codeEditor.value?.parentElement
  return parent instanceof HTMLElement ? parent : null
}

function clearLayerMeasuredVars() {
  const layerEl = getCodeEditorLayerElement()
  if (!layerEl)
    return
  layerEl.style.removeProperty('--stream-monaco-line-number-left')
  layerEl.style.removeProperty('--stream-monaco-line-number-width')
  layerEl.style.removeProperty('--stream-monaco-line-number-gap-to-code')
  layerEl.style.removeProperty('--stream-monaco-original-line-number-gap-to-code')
  layerEl.style.removeProperty('--stream-monaco-modified-line-number-gap-to-code')
  layerEl.style.removeProperty('--stream-monaco-original-scrollable-left')
  layerEl.style.removeProperty('--stream-monaco-modified-scrollable-left')
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

// Sync the Monaco host to the fallback pre height while the fallback is visible,
// so the transition from fallback → editor has no height jump.
function syncDiffEditorHostToFallbackHeight() {
  if (
    !isDiff.value
    || !showPreWhileMonacoLoads.value
  ) {
    return null
  }

  const editorHost = codeEditor.value
  const fallback = container.value?.querySelector('pre.code-pre-fallback') as HTMLElement | null

  if (!editorHost || !fallback)
    return null

  const height = Math.ceil(fallback.getBoundingClientRect().height)
  if (!Number.isFinite(height) || height <= 0)
    return null

  editorHost.style.height = `${height}px`
  editorHost.style.minHeight = `${height}px`
  editorHost.style.maxHeight = `${Math.ceil(getMaxHeightValue())}px`
  editorHost.style.overflow = 'hidden'
  return height
}

function syncEditorCssVars() {
  const editorEl = codeEditor.value as HTMLElement | null
  const rootEl = container.value as HTMLElement | null
  if (!editorEl || !rootEl)
    return
  // Target: write --vscode-* vars to the editor container (Monaco zone),
  // NOT to rootEl (Shell zone). Shell no longer reads these variables.
  const targetEl = editorEl
  // Monaco usually applies theme variables on an element with class
  // 'monaco-editor' or on the editor root; try to read from either.
  const editorRoot = (editorEl.querySelector('.monaco-editor') || editorEl) as HTMLElement
  const bgEl = (editorRoot.querySelector('.monaco-editor-background') || editorRoot) as HTMLElement
  const fgEl = (editorRoot.querySelector('.view-lines') || editorRoot) as HTMLElement

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
      targetEl.style.setProperty('--stream-monaco-editor-fg', fg)
    }
    else {
      rootEl.style.removeProperty('--markstream-diff-editor-fg')
      targetEl.style.removeProperty('--vscode-editor-foreground')
      targetEl.style.removeProperty('--stream-monaco-editor-fg')
    }

    if (bg) {
      rootEl.style.setProperty('--markstream-diff-editor-bg', bg)
      rootEl.style.setProperty('--markstream-diff-panel-bg', bg)
      rootEl.style.setProperty('--markstream-diff-panel-bg-soft', bg)
      rootEl.style.setProperty('--markstream-diff-panel-bg-strong', bg)
      targetEl.style.setProperty('--vscode-editor-background', bg)
      targetEl.style.setProperty('--stream-monaco-editor-bg', bg)
      targetEl.style.setProperty('--stream-monaco-fixed-editor-bg', bg)
      targetEl.style.setProperty('--stream-monaco-panel-bg', bg)
      targetEl.style.setProperty('--stream-monaco-panel-bg-soft', bg)
      targetEl.style.setProperty('--stream-monaco-panel-bg-strong', bg)
      targetEl.style.backgroundColor = bg
    }
    else {
      rootEl.style.removeProperty('--markstream-diff-editor-bg')
      rootEl.style.removeProperty('--markstream-diff-panel-bg')
      rootEl.style.removeProperty('--markstream-diff-panel-bg-soft')
      rootEl.style.removeProperty('--markstream-diff-panel-bg-strong')
      targetEl.style.removeProperty('--vscode-editor-background')
      targetEl.style.removeProperty('--stream-monaco-editor-bg')
      targetEl.style.removeProperty('--stream-monaco-fixed-editor-bg')
      targetEl.style.removeProperty('--stream-monaco-panel-bg')
      targetEl.style.removeProperty('--stream-monaco-panel-bg-soft')
      targetEl.style.removeProperty('--stream-monaco-panel-bg-strong')
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

  // 1px is usually Monaco/pre/browser rounding noise. Never mutate scrollTop
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
  if (!isDiff.value) {
    clearInlineFoldProxies()
    return
  }

  const root = codeEditor.value
  if (!root) {
    clearInlineFoldProxies()
    return
  }

  const diffRoot = root.querySelector('.monaco-diff-editor') as HTMLElement | null
  if (!diffRoot || diffRoot.classList.contains('side-by-side')) {
    clearInlineFoldProxies()
    return
  }

  const originalWidgets = Array.from(diffRoot.querySelectorAll('.editor.original .diff-hidden-lines'))
  const modifiedWidgets = Array.from(diffRoot.querySelectorAll('.editor.modified .diff-hidden-lines'))
  const pairCount = Math.min(originalWidgets.length, modifiedWidgets.length)

  for (let i = 0; i < pairCount; i++) {
    const modifiedWidget = modifiedWidgets[i] as HTMLElement
    const modifiedTrigger = modifiedWidget.querySelector('a') as HTMLElement | null
    const modifiedSlot = modifiedWidget.querySelector('.center > div:first-child') as HTMLElement | null
    const modifiedCenter = modifiedWidget.querySelector('.center') as HTMLElement | null

    if (!modifiedTrigger || !modifiedSlot || !modifiedCenter)
      continue
    if (modifiedCenter.querySelector('.markstream-inline-fold-proxy'))
      continue

    const proxyButton = document.createElement('button')
    proxyButton.type = 'button'
    proxyButton.className = 'markstream-inline-fold-proxy'
    proxyButton.dataset.markstreamInlineFoldProxy = 'true'
    const label = modifiedTrigger.getAttribute('title') || 'Show Unchanged Region'
    proxyButton.title = label
    proxyButton.setAttribute('aria-label', label)

    const handlePointerDown = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
    }
    const handleClick = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      modifiedTrigger.click()
      safeRaf(() => scheduleEditorHeightSync())
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ')
        return
      event.preventDefault()
      event.stopPropagation()
      modifiedTrigger.click()
      safeRaf(() => scheduleEditorHeightSync())
    }

    proxyButton.addEventListener('mousedown', handlePointerDown)
    proxyButton.addEventListener('click', handleClick)
    proxyButton.addEventListener('keydown', handleKeyDown)
    modifiedCenter.appendChild(proxyButton)

    inlineFoldProxyCleanups.push(() => {
      proxyButton.removeEventListener('mousedown', handlePointerDown)
      proxyButton.removeEventListener('click', handleClick)
      proxyButton.removeEventListener('keydown', handleKeyDown)
      if (proxyButton.parentElement === modifiedCenter)
        modifiedCenter.removeChild(proxyButton)
    })
  }
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
  } = {},
) {
  const renderedStreamingDiffHeight = isDiff.value && props.loading !== false
    ? measureRenderedDiffHeight(container)
    : null
  const resolvedContentHeight = renderedStreamingDiffHeight != null
    && renderedStreamingDiffHeight > contentHeight + PIXEL_EPSILON
    ? renderedStreamingDiffHeight
    : contentHeight
  const cappedHeight = Math.min(resolvedContentHeight, maxHeight)
  const allowBelowEstimatedFloor = options.allowBelowEstimatedFloor === true
    || canReleaseEstimatedFloorForFoldedDiff()

  const nextHeight = resolveHeightWithEstimatedEditorFloor(
    cappedHeight,
    options.clearEstimatedFloor === true,
    { allowBelowEstimatedFloor },
  )
  const floor = getPendingEstimatedEditorHeightFloor()

  // If folded diff is ready, the fallback floor must be released; otherwise the
  // final collapsed unchanged-lines UI keeps a large blank area below it.
  container.style.minHeight = floor != null && !allowBelowEstimatedFloor
    ? `${Math.min(floor, Math.ceil(maxHeight))}px`
    : '0px'

  container.style.height = `${nextHeight}px`
  container.style.maxHeight = `${Math.ceil(maxHeight)}px`
  if (isDiff.value) {
    container.style.overflow = 'hidden'
  }
  else {
    const shouldScroll = contentHeight > maxHeight + PIXEL_EPSILON
    container.style.overflow = shouldScroll ? 'auto' : 'hidden'
  }

  return nextHeight
}

function syncCollapsedDiffScrollHandling(container: HTMLElement) {
  if (!isDiff.value)
    return

  const shouldHandleMouseWheel = isExpanded.value
    || !hasVisibleDiffHiddenLines(container)
    || container.getBoundingClientRect().height >= getMaxHeightValue() - PIXEL_EPSILON
  if (collapsedDiffHandlesMouseWheel === shouldHandleMouseWheel)
    return

  collapsedDiffHandlesMouseWheel = shouldHandleMouseWheel
  const scrollbar = {
    ...(props.monacoOptions?.scrollbar ?? {}),
    handleMouseWheel: shouldHandleMouseWheel,
  }
  const diff = getDiffEditorView()
  try {
    diff?.getOriginalEditor?.()?.updateOptions?.({ scrollbar })
    diff?.getModifiedEditor?.()?.updateOptions?.({ scrollbar })
  }
  catch {}
}

function bindEditorHeightSync() {
  clearEditorHeightSyncBindings()

  if (isDiff.value) {
    const diff = getDiffEditorView()
    const originalEditor = diff?.getOriginalEditor?.()
    const modifiedEditor = diff?.getModifiedEditor?.()

    const bind = (
      source: MonacoEditorViewLike | null | undefined,
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
        '.view-line',
        '.view-lines',
        '.view-zones',
        '.margin-view-zones',
        '.diff-hidden-lines',
        '.stream-monaco-diff-unchanged-bridge',
        '.stream-monaco-fallback-inline-delete-zone',
        '.stream-monaco-fallback-inline-delete-margin',
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
        if (!shouldAllowDiffDomHeightShrink(host))
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
    if (host) {
      const startUnchangedRegionExpansion = (event: MouseEvent) => {
        const target = event.target instanceof Element ? event.target : null
        if (!target?.closest([
          '.stream-monaco-unchanged-summary',
          '.stream-monaco-unchanged-reveal',
          '.stream-monaco-unchanged-expand',
          '.markstream-inline-fold-proxy',
          '.diff-hidden-lines .center',
        ].join(','))) {
          return
        }
        const height = Math.ceil(host.getBoundingClientRect().height || 0)
        if (height > 0)
          lastStableCollapsedDiffHeight.value = height
      }
      host.addEventListener('click', startUnchangedRegionExpansion, true)
      editorHeightSyncDisposables.push({
        dispose: () => host.removeEventListener('click', startUnchangedRegionExpansion, true),
      })
    }
    if (host && typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        if (!isDiff.value)
          return
        layoutEditorToHost()
        if (!shouldAllowDiffDomHeightShrink(host))
          return
        const renderedHeight = measureRenderedDiffHeight(host)
        if (renderedHeight == null)
          return
        const hostHeight = Math.ceil(host.getBoundingClientRect().height || 0)
        const stableHeight = lastStableCollapsedDiffHeight.value
        if (hasVisibleDiffHiddenLines(host) && stableHeight != null) {
          if (hostHeight > stableHeight + PIXEL_EPSILON) {
            lastStableCollapsedDiffHeight.value = hostHeight
          }
          else if (hostHeight < stableHeight - PIXEL_EPSILON) {
            applyCollapsedContainerHeight(host, stableHeight, getMaxHeightValue())
            layoutEditorToHost()
            return
          }
        }
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

    const max = getMaxHeightValue()
    const rectH = Math.ceil((container.getBoundingClientRect?.().height) || 0)
    const styleH = Number.parseFloat(container.style.height || '')
    const currentHostHeight = rectH > 0
      ? rectH
      : Number.isFinite(styleH) && styleH > 0 ? Math.ceil(styleH) : 0
    const estimatedDiffHeight = isDiff.value ? estimateDiffEditorContentHeight() : null
    const hasVisibleCollapsedDiffSummary = isDiff.value && hasVisibleDiffHiddenLines(container)
    const hasRenderedDiffDom = isDiff.value && hasRenderedDiffEditorDom(container)
    const hasStaleNativeDiffDom = isDiff.value && container.classList.contains('stream-monaco-diff-native-stale')
    const foldedDiffReadyForShrink = hasVisibleCollapsedDiffSummary
      && editorMounted.value
      && editorDisplayReady.value
      && !showPreWhileMonacoLoads.value
    if (!hasVisibleCollapsedDiffSummary)
      lastStableCollapsedDiffHeight.value = null
    if (resumeGuardFrames > 0) {
      resumeGuardFrames--
      if (heightBeforeCollapse.value != null) {
        const h = applyCollapsedContainerHeight(container, heightBeforeCollapse.value, max, {
          allowBelowEstimatedFloor: foldedDiffReadyForShrink,
        })
        adjustScrollAfterHeightChange(container, oldHeight, h)
        return
      }
    }
    if (isDiff.value && !hasRenderedDiffDom && !hasVisibleCollapsedDiffSummary && showPreWhileMonacoLoads.value) {
      const fallbackHeight = syncDiffEditorHostToFallbackHeight()
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
      && !foldedDiffReadyForShrink
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
        h0 = hasVisibleCollapsedDiffSummary || estimatedDiffHeight == null
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
    else if (hasVisibleCollapsedDiffSummary) {
      h0 = renderedDiffHeight
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
      && props.loading === false
      && hasStaleNativeDiffDom
      && !foldedDiffReadyForShrink
      && h0 != null
      && estimatedDiffHeight != null
    ) {
      h0 = Math.min(h0, estimatedDiffHeight)
    }
    if (
      isDiff.value
      && h0 != null
      && currentHostHeight > 0
      && (
        props.loading !== false
        || (props.loading === false && hasStaleNativeDiffDom && !foldedDiffReadyForShrink)
        || (options.holdCurrentDiffHeight === true && !foldedDiffReadyForShrink)
      )
    ) {
      h0 = Math.max(h0, currentHostHeight)
    }
    // 1) 有实时内容高度 -> 采用并记忆原始内容高度（未裁剪前），用于下一次恢复
    if (h0 != null && h0 > 0) {
      const shouldKeepLastStableCollapsedDiffHeight = hasVisibleCollapsedDiffSummary
        && lastStableCollapsedDiffHeight.value != null
      const shouldKeepCurrentCollapsedDiffHeight = hasVisibleCollapsedDiffSummary
        && rectH > 0
        && rectH < max - PIXEL_EPSILON
        && h0 >= max - PIXEL_EPSILON
      const measuredHeight = shouldKeepLastStableCollapsedDiffHeight
        ? Math.max(lastStableCollapsedDiffHeight.value!, h0)
        : shouldKeepCurrentCollapsedDiffHeight ? rectH : h0
      const h = applyCollapsedContainerHeight(container, measuredHeight, max, {
        clearEstimatedFloor: true,
        allowBelowEstimatedFloor: foldedDiffReadyForShrink || allowBelowPlainEstimatedFloor || allowBelowStreamingDiffEstimatedFloor,
      })
      if (hasVisibleCollapsedDiffSummary && h < max - PIXEL_EPSILON)
        lastStableCollapsedDiffHeight.value = Math.max(lastStableCollapsedDiffHeight.value ?? 0, h)
      syncCollapsedDiffScrollHandling(container)
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    // 2) 使用折叠前的内容高度（不更新记忆值）
    if (heightBeforeCollapse.value != null) {
      const h = applyCollapsedContainerHeight(container, heightBeforeCollapse.value, max, {
        allowBelowEstimatedFloor: foldedDiffReadyForShrink,
      })
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    const stableFallbackHeight = isDiff.value && props.loading !== false
      ? rectH
      : hasVisibleCollapsedDiffSummary
        ? rectH
        : Math.max(
            rectH,
            estimatedDiffHeight != null && estimatedDiffHeight > 0 ? estimatedDiffHeight : 0,
          )
    // 3) 使用当前 DOM 高度或保守估算高度（不更新记忆值）
    if (stableFallbackHeight > 0) {
      const shouldKeepLastStableCollapsedDiffHeight = hasVisibleCollapsedDiffSummary
        && lastStableCollapsedDiffHeight.value != null
      const shouldKeepCurrentCollapsedDiffHeight = hasVisibleCollapsedDiffSummary
        && rectH > 0
        && rectH < max - PIXEL_EPSILON
        && stableFallbackHeight >= max - PIXEL_EPSILON
      const fallbackHeight = shouldKeepLastStableCollapsedDiffHeight
        ? Math.max(lastStableCollapsedDiffHeight.value!, stableFallbackHeight)
        : shouldKeepCurrentCollapsedDiffHeight ? rectH : stableFallbackHeight
      const h = applyCollapsedContainerHeight(container, fallbackHeight, max, {
        allowBelowEstimatedFloor: foldedDiffReadyForShrink,
      })
      if (hasVisibleCollapsedDiffSummary && h < max - PIXEL_EPSILON)
        lastStableCollapsedDiffHeight.value = Math.max(lastStableCollapsedDiffHeight.value ?? 0, h)
      syncCollapsedDiffScrollHandling(container)
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    const floor = getPendingEstimatedEditorHeightFloor()
    if (floor != null && !(isDiff.value && props.loading !== false && hasRenderedDiffDom)) {
      const h = applyCollapsedContainerHeight(container, floor, max, {
        allowBelowEstimatedFloor: foldedDiffReadyForShrink,
      })
      adjustScrollAfterHeightChange(container, oldHeight, h)
      return
    }

    // 4) 兜底：若有先前行高/字体，可估一个最小高度；否则保持现状，避免强制跳到 MAX
    const prev = Number.parseFloat(container.style.height)
    if (!Number.isNaN(prev) && prev > 0) {
      const h = applyCollapsedContainerHeight(container, prev, max, {
        allowBelowEstimatedFloor: foldedDiffReadyForShrink,
      })
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
  if (hasRenderedDiffsDom(root))
    return true
  return Boolean(
    root?.querySelector('.monaco-diff-editor .view-lines .view-line'),
  )
}

function hasRenderedSingleEditorDom(root = codeEditor.value) {
  if (hasRenderedDiffsDom(root))
    return true
  return Boolean(root?.querySelector('.monaco-editor .view-lines .view-line'))
}

function hasCurrentSingleEditorContent() {
  if (hasRenderedDiffsDom())
    return true
  const model = getEditorView()?.getModel?.()
  return typeof model?.getValue === 'function'
    && model.getValue() === displayCode.value
}

function hasDiffPresentationRootClass(root = codeEditor.value) {
  if (hasRenderedDiffsDom(root))
    return true
  if (!root?.classList.contains('stream-monaco-diff-root'))
    return false
  if (preFallbackDiffInline.value && !root.classList.contains('stream-monaco-diff-inline'))
    return false
  return true
}

function hasRenderedDiffsDom(root = codeEditor.value) {
  return Boolean(root?.querySelector('diffs-container'))
}

function shouldAllowDiffDomHeightShrink(host: HTMLElement) {
  return props.loading !== false
    || editorDisplayReady.value
    || host.classList.contains('stream-monaco-diff-native-stale')
    || hasVisibleDiffHiddenLines(host)
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

// Waits until the diff editor has computed line changes and rendered at least
// one view-line, then does a final presentation pass. This prevents the
// "plain Monaco editor" intermediate frame (the third state between the pre
// fallback and the fully decorated diff surface).
async function waitForDiffEditorVisualReady(options: { requireHighlight?: boolean } = {}) {
  if (!isDiff.value)
    return true

  if (hasRenderedDiffsDom()) {
    await nextTick()
    await waitForAnimationFrame()
    return hasRenderedDiffsDom()
  }

  const requireHighlight = options.requireHighlight !== false
  const maxPasses = 30
  const requiredStableReadyPasses = 2
  let stableReadyPasses = 0
  let pair = resolveDiffRenderPair(
    String(props.node.originalCode ?? ''),
    String(props.node.updatedCode ?? ''),
  )
  let expected = estimateDiffStats(pair.original, pair.updated)
  let expectsChangedDom = expected.added > 0 || expected.removed > 0

  const refreshExpectedDiffStats = () => {
    const currentPair = resolveDiffRenderPair(
      String(props.node.originalCode ?? ''),
      String(props.node.updatedCode ?? ''),
    )
    if (currentPair.original !== pair.original || currentPair.updated !== pair.updated) {
      pair = currentPair
      expected = estimateDiffStats(pair.original, pair.updated)
      expectsChangedDom = expected.added > 0 || expected.removed > 0
    }
  }

  for (let pass = 0; pass < maxPasses; pass++) {
    if (isUnmounted)
      return false

    refreshExpectedDiffStats()

    const root = codeEditor.value
    const diffEditor = getDiffEditorView()
    const expectsLineNumberGutter = expectsDiffLineNumberGutter()

    let lineChangesReady = false
    try {
      const changes = diffEditor?.getLineChanges?.()
      lineChangesReady = Array.isArray(changes) && (!expectsChangedDom || changes.length > 0)
    }
    catch {
      lineChangesReady = false
    }

    const hasDiffRoot = Boolean(root?.querySelector('.monaco-diff-editor'))
    const hasRenderedLines = hasRenderedDiffEditorDom(root)
    const changedDomReady = !expectsChangedDom || hasExpectedChangedDiffDom(root, expected)
    const gutterReady = !expectsChangedDom || hasExpectedChangedDiffGutterDom(root, expected)
    const lineNumberGutterReady = !expectsLineNumberGutter || hasDiffLineNumberGutterLayout(root)
    if (hasDiffRoot && hasRenderedLines && lineChangesReady && changedDomReady && gutterReady && lineNumberGutterReady && hasInlineDeletedContentReady(root)) {
      try {
        refreshDiffPresentationSafely()
        syncInlineFoldProxies()
        refreshDiffStats()
        scheduleEditorHeightSync()
      }
      catch {}
      await nextTick()
      await waitForAnimationFrame()
      if (isUnmounted)
        return false
      const readyRoot = codeEditor.value
      const readyLineNumberGutter = !expectsDiffLineNumberGutter() || hasDiffLineNumberGutterLayout(readyRoot)
      const readyChangedDom = !expectsChangedDom || hasExpectedChangedDiffDom(readyRoot, expected)
      const readyGutterDom = !expectsChangedDom || hasExpectedChangedDiffGutterDom(readyRoot, expected)
      const readyInlineNative = hasInlineDiffNativePresentationReady(readyRoot, expectsChangedDom)
      const readyLineFill = hasExpectedChangedDiffViewLineFill(readyRoot, expected)
      const readyHighlight = !requireHighlight || hasLanguageHighlightReady(readyRoot)
      const strictReady = (
        hasDiffPresentationRootClass(readyRoot)
        && readyLineNumberGutter
        && hasDiffContentLayoutReady(readyRoot)
        && readyChangedDom
        && readyGutterDom
        && readyInlineNative
        && readyLineFill
        && readyHighlight
      )
      const fallbackDeletedContentReady = (
        hasDiffPresentationRootClass(readyRoot)
        && readyLineNumberGutter
        && hasDiffContentLayoutReady(readyRoot)
        && readyChangedDom
        && readyGutterDom
        && hasInlineDeletedContentReady(readyRoot)
        && readyHighlight
      )
      if (strictReady || fallbackDeletedContentReady) {
        stableReadyPasses++
        if (stableReadyPasses >= requiredStableReadyPasses)
          return true
      }
      else {
        stableReadyPasses = 0
      }
    }

    await nextTick()
    await waitForAnimationFrame()
  }

  if (isUnmounted)
    return false

  refreshDiffPresentationSafely()
  syncInlineFoldProxies()
  refreshDiffStats()
  scheduleEditorHeightSync()
  refreshExpectedDiffStats()

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

async function updateDiffCodeWithSettledResult(original: string, updated: string, language: string) {
  try {
    await updateDiffCode(original, updated, language)
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
  }
  catch (error) {
    if (!isPendingDiffResultError(error))
      throw error
  }
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
        warnCodeBlockDev('Failed to update Monaco code editor', error)
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
    lastStableCollapsedDiffHeight.value = null
    syncEstimatedDiffStats()
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
      syncRuntimeMonacoOptions()

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
      warnCodeBlockDev('Failed to update Monaco diff editor', error)
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
  // space under the editor layer until Monaco finishes.
  if (shouldReserveEstimatedEditorHeight.value && !isDiff.value && !isCollapsed.value) {
    const reserved = reservedOuterBlockHeight.value
    if (reserved != null)
      s.minHeight = `${reserved}px`
  }
  if (!isDiff.value) {
    s.color = 'var(--vscode-editor-foreground, var(--markstream-code-fallback-fg))'
    s.backgroundColor = 'var(--vscode-editor-background, var(--markstream-code-fallback-bg))'
    s.borderColor = 'var(--markstream-code-border-color)'
  }
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
    // Expanded: enable automaticLayout and explicitly size container by lines
    setAutomaticLayout(true)
    container.style.maxHeight = 'none'
    container.style.overflow = 'visible'
    syncEditorHostHeight(true)
  }
  else {
    stopExpandAutoResize()
    setAutomaticLayout(false)
    container.style.overflow = isDiff.value ? 'hidden' : 'auto'
    syncEditorHostHeight(true)
  }

  syncCollapsedDiffScrollHandling(container)
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
    editor.updateOptions({ fontSize: size })
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

function resetEditorHost(el: HTMLElement) {
  // Monaco diff/single editors should own the host exclusively. Clearing the
  // host before each creation prevents stale roots from stacking when a block
  // is recreated at the end of a streaming session.
  el.replaceChildren()
}

async function runEditorCreation(el: HTMLElement) {
  if (!createEditor || isUnmounted)
    return

  const creationKind = desiredEditorKind.value
  diffEditorCreatedWhileStreaming = false
  editorCreationFailed.value = false
  failedEditorCreationKey.value = null
  editorRuntimeCreated.value = false
  editorDisplayReady.value = false
  editorHandoffPrepared.value = false
  collapsedDiffHandlesMouseWheel = null
  measuredEditorFontSize.value = null
  measuredEditorLineHeight.value = null
  measuredEditorCharacterWidth.value = null
  clearLayerMeasuredVars()
  resetEditorLayoutCache()
  armEstimatedEditorHeightFloor()
  clearEditorHeightSyncBindings()
  clearInlineFoldProxies()
  resetEditorHost(el)
  syncRuntimeMonacoOptions()
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
        await withMonacoPassiveTouchListeners(() =>
          createDiffEditor!(el as HTMLElement, pair.original, pair.updated, runtimeLanguage.value))
      }
      else {
        await withMonacoPassiveTouchListeners(() =>
          createEditor!(el as HTMLElement, props.node.code, runtimeLanguage.value))
      }
    }
    else {
      await withMonacoPassiveTouchListeners(() =>
        createEditor!(el as HTMLElement, displayCode.value, runtimeLanguage.value))
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

  const editor = creationKind === 'diff' ? getDiffEditorView() : getEditorView()
  if (typeof props.monacoOptions?.fontSize === 'number') {
    editor?.updateOptions({ fontSize: props.monacoOptions.fontSize, automaticLayout: false })
    defaultCodeFontSize.value = props.monacoOptions.fontSize
    codeFontSize.value = props.monacoOptions.fontSize
  }
  else {
    if (!shouldFreezeVisibleDiffFallbackMetrics()) {
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
  }

  syncFallbackFontMetricsFromEditor()

  // stream-diffs keeps its theme on each mounted surface. Apply the requested
  // theme after this surface exists so the initial frame matches props.isDark.
  await themeUpdate()

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
      ? await waitForDiffEditorVisualReady({ requireHighlight: true })
      : await waitForSingleEditorVisualReady()
    : runtimeVisualReady
  if (isUnmounted || desiredEditorKind.value !== creationKind || codeEditor.value !== el)
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
          warnCodeBlockDev('Failed to mount Monaco editor after stale creation failed', error)
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
    monacoReady.value,
    viewportReady.value,
    props.node.language,
    props.node.raw,
    props.node.code,
    props.node.loading,
  ] as const,
  async ([el, _isDiff, stream, loading, _monacoReady, visible]) => {
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
      await ensureMonacoRuntime()
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
      // Keep the `<pre>` fallback if Monaco fails to mount for this block.
      warnCodeBlockDev('Failed to mount Monaco editor', error)
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

    // If Monaco isn't mounted yet (or not available), just let the normal
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
      warnCodeBlockDev('Failed to recreate Monaco editor after code block kind changed', error)
      // Keep fallback rendering if recreation fails.
      editorMounted.value = false
      editorDisplayReady.value = false
      markEditorCreationFailed()
    }
  },
)

function isPairedTheme(t: unknown): t is { light: CodeBlockMonacoTheme, dark: CodeBlockMonacoTheme } {
  return !!t && typeof t === 'object' && 'light' in t && 'dark' in t
}

function getPreferredColorScheme(): CodeBlockMonacoTheme | undefined {
  // Unified theme prop takes precedence
  if (props.theme !== undefined) {
    const t = props.theme
    if (isPairedTheme(t))
      return props.isDark ? t.dark : t.light
    // Fixed theme — always this theme regardless of isDark
    return t as CodeBlockMonacoTheme
  }
  // Backward compat: darkTheme / lightTheme
  return props.isDark ? props.darkTheme : props.lightTheme
}

function getThemeName(theme: CodeBlockMonacoTheme | null | undefined) {
  if (typeof theme === 'string')
    return theme
  if (theme && typeof theme === 'object' && 'name' in theme)
    return String(theme.name)
  return null
}

function isSameRequestedTheme(a: CodeBlockMonacoTheme | null | undefined, b: CodeBlockMonacoTheme | null | undefined) {
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
  const preferred = getPreferredColorScheme()
  const explicit = resolvedMonacoOptions.value?.theme
  const requested = preferred ?? explicit

  // Object themes are self-contained — trust them directly, skip availability check
  if (requested != null && typeof requested === 'object')
    return requested

  const availableThemes = Array.isArray(props.themes) ? props.themes : []
  if (!availableThemes.length || requested == null)
    return requested

  const requestedName = getThemeName(requested)
  const availableNames = availableThemes
    .map(theme => getThemeName(theme))
    .filter((name): name is string => !!name)
  if (!requestedName || availableNames.includes(requestedName))
    return requested

  const explicitName = getThemeName(explicit)
  if (explicit != null && explicitName && availableNames.includes(explicitName))
    return explicit

  return availableThemes[0]
}

async function themeUpdate(options: { appearanceOnly?: boolean } = {}) {
  syncRuntimeMonacoOptions()

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
    await setTheme(themeToSet)
    syncPresentation()
  }
  catch (error) {
    warnCodeBlockDev('Failed to apply Monaco theme', error)
  }
}

function themeLooksDark(theme: CodeBlockMonacoTheme | null | undefined) {
  // For object themes, try to detect from editor.background luminance
  if (theme && typeof theme === 'object' && theme.colors?.['editor.background']) {
    const lum = getColorLuminance(theme.colors['editor.background'])
    if (lum != null)
      return lum < 128
  }
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

function addRuntimeLanguage(languages: string[], language: unknown) {
  if (typeof language !== 'string')
    return

  const canonical = normalizeLanguageIdentifier(language)
  const monacoId = resolveMonacoLanguageId(canonical)
  const grammarId = ['plain', 'objectivec', 'objectivecpp'].includes(canonical)
    ? monacoId
    : canonical
  for (const value of [grammarId, monacoId]) {
    if (value && !languages.includes(value))
      languages.push(value)
  }
}

const runtimeMonacoLanguages = computed(() => {
  const languages: string[] = []
  const configured = resolvedMonacoOptions.value?.languages
  if (Array.isArray(configured)) {
    for (const language of configured)
      addRuntimeLanguage(languages, language)
  }

  if (hasCompletedStreamingFenceInfo())
    addRuntimeLanguage(languages, props.node.language)
  addRuntimeLanguage(languages, codeLanguage.value)
  addRuntimeLanguage(languages, runtimeLanguage.value)
  addRuntimeLanguage(languages, 'plaintext')
  return languages
})

function buildRuntimeMonacoOptions() {
  const nextOptions = {
    wordWrap: 'on',
    wrappingIndent: 'same',
    themes: props.themes,
    ...(resolvedMonacoOptions.value || {}),
    languages: runtimeMonacoLanguages.value,
    stream: false,
    fontSize: preFallbackFontSize.value,
    lineHeight: preFallbackEffectiveLineHeight.value,
    theme: resolveRequestedTheme(),
    // CodeBlockShell owns the file header for every enhanced code block.
    // Pierre's header would otherwise duplicate that chrome for File surfaces.
    disableFileHeader: true,
    ...(isDiff.value
      ? {
          diffAppearance: effectiveDiffAppearance.value,
        }
      : {}),
    onThemeChange() {
      syncEditorCssVars()
    },
  } as MonacoRuntimeOptions

  const fontFamily = resolveRuntimeFontFamily()
  if (fontFamily)
    nextOptions.fontFamily ??= fontFamily

  if (isDiff.value) {
    nextOptions.wordWrap = preFallbackWrap.value ? 'on' : 'off'
    const existingUnsafeCSS = typeof nextOptions.unsafeCSS === 'string'
      ? `${nextOptions.unsafeCSS}\n`
      : ''
    const collapse = resolvePreFallbackDiffCollapse()
    nextOptions.unsafeCSS = `${existingUnsafeCSS}
pre { column-gap: 0; }
pre > code { column-gap: 0; padding-block: 0; }
[data-separator="line-info"] { margin-top: 0; }
`
    if (collapse) {
      nextOptions.parseDiffOptions = {
        ...(nextOptions.parseDiffOptions as Record<string, unknown> | undefined),
        context: collapse.contextLineCount,
      }
      nextOptions.collapsedContextThreshold = collapse.collapsedContextThreshold
      nextOptions.expandUnchanged = false
      nextOptions.hunkSeparators = 'line-info'
      nextOptions.unsafeCSS += '[data-separator="line-info"][data-separator-last] { height: 28px; }\n'
    }
    else {
      nextOptions.expandUnchanged = true
      nextOptions.hunkSeparators = 'simple'
    }
  }

  return nextOptions
}

function syncRuntimeMonacoOptions() {
  const nextOptions = buildRuntimeMonacoOptions()
  if (!runtimeMonacoOptions) {
    runtimeMonacoOptions = nextOptions
    return runtimeMonacoOptions
  }

  for (const key of Object.keys(runtimeMonacoOptions)) {
    if (!(key in nextOptions))
      delete runtimeMonacoOptions[key]
  }
  Object.assign(runtimeMonacoOptions, nextOptions)
  return runtimeMonacoOptions
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
  const configured = resolvedMonacoOptions.value?.fontFamily
  if (typeof configured === 'string' && configured.trim())
    return configured.trim()

  if (!isDiff.value)
    return undefined

  return readVisiblePreFallbackFontFamily()
}

const monacoStructuralSignature = computed(() => JSON.stringify({
  diffLineStyle: resolvedMonacoOptions.value?.diffLineStyle ?? 'background',
  diffUnchangedRegionStyle: resolvedMonacoOptions.value?.diffUnchangedRegionStyle ?? 'line-info',
  diffHideUnchangedRegions: props.monacoOptions?.diffHideUnchangedRegions === undefined
    ? { ...defaultDiffHideUnchangedRegions }
    : resolveDiffHideUnchangedRegionsOption(props.monacoOptions.diffHideUnchangedRegions),
  renderSideBySide: resolvedMonacoOptions.value?.renderSideBySide ?? true,
  useInlineViewWhenSpaceIsLimited: resolvedMonacoOptions.value?.useInlineViewWhenSpaceIsLimited ?? false,
  enableSplitViewResizing: resolvedMonacoOptions.value?.enableSplitViewResizing ?? true,
  ignoreTrimWhitespace: resolvedMonacoOptions.value?.ignoreTrimWhitespace ?? true,
  originalEditable: resolvedMonacoOptions.value?.originalEditable ?? false,
}))

const editorCreationOptionsRevision = ref(0)

watch(
  () => [props.monacoOptions, props.theme, props.themes, props.lightTheme, props.darkTheme] as const,
  () => {
    editorCreationOptionsRevision.value += 1
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
    structural: monacoStructuralSignature.value,
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
    warnCodeBlockDev('Failed to mount Monaco editor after code block identity changed', error)
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

// Watch for monacoOptions changes (deep) and try to update editor options or
// recreate the editor when necessary.
watch(
  () => [props.monacoOptions, viewportReady.value],
  () => {
    syncRuntimeMonacoOptions()
    if (!createEditor || !viewportReady.value)
      return

    const ed = isDiff.value ? getDiffEditorView() : getEditorView()
    const applying = typeof props.monacoOptions?.fontSize === 'number'
      ? props.monacoOptions.fontSize
      : (Number.isFinite(codeFontSize.value) ? (codeFontSize.value as number) : undefined)
    if (typeof applying === 'number' && Number.isFinite(applying) && applying > 0) {
      ed?.updateOptions?.({ fontSize: applying })
    }
    syncEditorHostHeight(false)
  },
  { deep: true },
)

watch(
  () => [resolveRequestedTheme(), effectiveDiffAppearance.value, monacoReady.value, editorCreated.value, viewportReady.value] as const,
  ([theme], previous) => {
    if (!monacoReady.value || !editorMounted.value || !viewportReady.value)
      return
    const sameRequestedTheme = previous != null && isSameRequestedTheme(theme, previous[0])
    void themeUpdate({ appearanceOnly: sameRequestedTheme })
  },
  { flush: 'post' },
)

watch(
  () => [monacoStructuralSignature.value, monacoReady.value, viewportReady.value] as const,
  async ([nextSignature, ready, visible], [prevSignature]) => {
    syncRuntimeMonacoOptions()
    if (!ready || !visible)
      return
    if (!createEditor || !codeEditor.value)
      return
    if (!editorCreated.value)
      return
    if (nextSignature === prevSignature)
      return
    if (props.stream === false && props.loading !== false)
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
    if (currentEditorKind.value === desiredEditorKind.value && editorCreated.value && editorMounted.value)
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
      await ensureEditorCreation(codeEditor.value as HTMLElement, { allowStaleContentRetry: false })
    }
    catch (error) {
      warnCodeBlockDev('Failed to recreate Monaco editor after Monaco options changed', error)
      editorMounted.value = false
      editorDisplayReady.value = false
      markEditorCreationFailed()
    }
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
    await nextTick()

    try {
      await ensureEditorCreation(codeEditor.value as HTMLElement)
    }
    catch (error) {
      warnCodeBlockDev('Failed to mount Monaco editor after streaming settled', error)
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
          syncRuntimeMonacoOptions()
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
              syncRuntimeMonacoOptions()
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
              refreshDiffPresentationSafely()
              layoutEditorToHost(true)
              syncDiffScrollFromFallback()
              syncInlineFoldProxies()
              refreshDiffStats()
              const localVisualReady = await waitForDiffEditorVisualReady({ requireHighlight: true })
              const runtimeVisualReady = whenRuntimeVisualReady
                ? await whenRuntimeVisualReady()
                : true
              const visualReady = localVisualReady && runtimeVisualReady
              if (!isUnmounted && visualReady && !editorDisplayReady.value)
                await revealEditorDisplay()
              scheduleEditorHeightSync()
              scheduleStreamingDiffHeightChase(true)
            }
            else {
              clearPlainCodeUpdateQueue()
              queuePlainCodeUpdate(displayCode.value, runtimeLanguage.value)
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
          warnCodeBlockDev('Failed to refresh Monaco editor after streaming settled', error)
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
  <PreCodeNode
    v-if="usePreCodeRender"
    class="code-pre-fallback"
    :class="{ 'is-wrap': preFallbackWrap }"
    :style="preFallbackStyle"
    :node="preCodeNode"
    :loading="props.loading"
    :show-line-numbers="true"
    :diff-inline="preFallbackDiffInline"
    :diff-hide-unchanged-regions="preFallbackDiffHideUnchangedRegions"
  />
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

      <!-- Monaco editor layer -->
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
        <PreCodeNode
          v-if="renderPreFallback"
          class="code-pre-fallback"
          :class="{ 'is-wrap': preFallbackWrap }"
          :style="preFallbackStyle"
          :node="preCodeNode"
          :show-line-numbers="true"
          :diff-inline="preFallbackDiffInline"
          :diff-hide-unchanged-regions="preFallbackDiffHideUnchangedRegions"
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
  --markstream-code-fallback-bg: var(--code-bg);
  --markstream-code-fallback-fg: var(--code-fg);
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
  --markstream-diff-pane-divider: hsl(var(--ms-border) / 0.42);
  --markstream-diff-gutter-bg: transparent;
  --markstream-diff-gutter-guide: hsl(var(--ms-border) / 0.72);
  --markstream-diff-gutter-gap: 8px;
  --markstream-diff-line-number-bg: hsl(var(--ms-muted) / 0.45);
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
    var(--markstream-diff-added-fg) 0 var(--stream-monaco-gutter-marker-width, 4px),
    transparent var(--stream-monaco-gutter-marker-width, 4px) 100%
  );
  --markstream-diff-removed-gutter: repeating-linear-gradient(
        180deg,
        var(--markstream-diff-removed-fg) 0 2px,
        transparent 2px 4px
      )
      left / var(--stream-monaco-gutter-marker-width, 4px) 100% no-repeat;
  --markstream-diff-added-line-fill: var(--diff-added-bg);
  --markstream-diff-removed-line-fill: var(--diff-removed-bg);
}

.code-block-container.is-dark {
  --markstream-code-fallback-bg: var(--code-bg);
  --markstream-code-fallback-fg: var(--code-fg);
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
  --markstream-diff-pane-divider: hsl(var(--ms-border) / 0.34);
  --markstream-diff-gutter-bg: linear-gradient(
    180deg,
    hsl(0 0% 7% / 0.94) 0%,
    hsl(0 0% 7% / 0.98) 100%
  );
  --markstream-diff-gutter-guide: hsl(var(--ms-muted-foreground) / 0.08);
  --markstream-diff-gutter-gap: 8px;
  --markstream-diff-line-number-bg: hsl(0 0% 7% / 0.98);
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
    var(--markstream-diff-added-fg) 0 var(--stream-monaco-gutter-marker-width, 4px),
    transparent var(--stream-monaco-gutter-marker-width, 4px) 100%
  );
  --markstream-diff-removed-gutter: repeating-linear-gradient(
        180deg,
        var(--markstream-diff-removed-fg) 0 2px,
        transparent 2px 4px
      )
      left / var(--stream-monaco-gutter-marker-width, 4px) 100% no-repeat;
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
:deep(.code-editor-layer > pre.code-pre-fallback) {
  grid-area: 1 / 1;
  position: relative;
  z-index: 2;
}

.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .monaco-editor-background),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .margin),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .lines-content) {
  background: var(--vscode-editor-background, var(--markstream-code-fallback-bg)) !important;
}

.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .margin),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .view-lines),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .view-line),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .view-line span),
.code-block-container.is-plain-text:not(.is-diff) :deep(.monaco-editor .line-numbers) {
  color: var(--vscode-editor-foreground, var(--markstream-code-fallback-fg)) !important;
}

.code-block-container.is-diff {
  color: var(--markstream-diff-shell-fg);
  border-color: var(--markstream-diff-shell-border);
  background: var(--markstream-diff-shell-bg);
  box-shadow: var(--markstream-diff-shell-shadow);
  --vscode-editor-selectionBackground: var(--markstream-diff-action-hover);
  /* Override shared tokens so CodeBlockShell header inherits diff styling */
  --code-fg: var(--markstream-diff-shell-fg);
  --code-header-bg: transparent;
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
  --stream-monaco-editor-bg: var(--markstream-diff-editor-bg);
  --stream-monaco-editor-fg: var(--markstream-diff-editor-fg);
  --stream-monaco-unchanged-fg: var(--markstream-diff-unchanged-fg);
  --stream-monaco-unchanged-bg: var(--markstream-diff-unchanged-bg);
  --stream-monaco-frame-radius: 0;
  --stream-monaco-fixed-editor-bg: var(--markstream-diff-editor-bg);
  --stream-monaco-frame-border: transparent;
  --stream-monaco-frame-shadow: none;
  --stream-monaco-panel-bg: var(--markstream-diff-editor-bg);
  --stream-monaco-panel-bg-soft: var(--markstream-diff-editor-bg);
  --stream-monaco-panel-bg-strong: var(--markstream-diff-editor-bg);
  --stream-monaco-panel-border: transparent;
  --stream-monaco-pane-divider: var(--markstream-diff-pane-divider);
  --stream-monaco-gutter-bg: var(--markstream-diff-gutter-bg);
  --stream-monaco-gutter-guide: var(--markstream-diff-gutter-guide);
  --stream-monaco-gutter-marker-width: 4px;
  --stream-monaco-gutter-gap: 1ch;
  --stream-monaco-line-number-bg: var(--markstream-diff-line-number-bg);
  --stream-monaco-line-number: var(--markstream-diff-line-number);
  --stream-monaco-line-number-active: var(--markstream-diff-line-number-active);
  --stream-monaco-line-number-left: 0px;
  --stream-monaco-line-number-width: 2ch;
  --stream-monaco-line-number-padding-left: 2ch;
  --stream-monaco-line-number-padding-right: 1ch;
  --stream-monaco-line-number-separator-width: 2px;
  --stream-monaco-layout-character-width: var(--markstream-code-layout-character-width, 1ch);
  --stream-monaco-line-number-box-width: calc(
    var(--stream-monaco-layout-character-width) +
      var(--stream-monaco-layout-character-width) +
      var(--stream-monaco-layout-character-width) +
      var(--stream-monaco-layout-character-width) +
      var(--stream-monaco-layout-character-width) +
      var(--stream-monaco-line-number-separator-width)
  );
  --stream-monaco-diff-code-gap: 1ch;
  --stream-monaco-diff-code-padding: 0px;
  --stream-monaco-line-number-gap-to-code: var(--stream-monaco-diff-code-gap);
  --stream-monaco-line-number-align: var(
    --markstream-diff-line-number-align,
    var(--markstream-code-line-number-align, right)
  );
  --stream-monaco-original-margin-width: calc(
    var(--stream-monaco-line-number-left) +
      var(--stream-monaco-line-number-box-width)
      + var(--stream-monaco-line-number-gap-to-code)
  );
  --stream-monaco-original-scrollable-left: var(--stream-monaco-original-margin-width);
  --stream-monaco-original-scrollable-width: calc(
    100% - var(--stream-monaco-original-margin-width)
  );
  --stream-monaco-modified-margin-width: calc(
    var(--stream-monaco-line-number-left) +
      var(--stream-monaco-line-number-box-width)
      + var(--stream-monaco-line-number-gap-to-code)
  );
  --stream-monaco-modified-scrollable-left: var(--stream-monaco-modified-margin-width);
  --stream-monaco-modified-scrollable-width: calc(
    100% - var(--stream-monaco-modified-margin-width)
  );
  --stream-monaco-added-fg: var(--markstream-diff-added-fg);
  --stream-monaco-removed-fg: var(--markstream-diff-removed-fg);
  --stream-monaco-added-line: var(--markstream-diff-added-line);
  --stream-monaco-removed-line: var(--markstream-diff-removed-line);
  --stream-monaco-added-inline: var(--markstream-diff-added-inline);
  --stream-monaco-removed-inline: var(--markstream-diff-removed-inline);
  --stream-monaco-added-outline: transparent;
  --stream-monaco-removed-outline: transparent;
  --stream-monaco-added-inline-border: var(--markstream-diff-added-inline-border);
  --stream-monaco-removed-inline-border: var(--markstream-diff-removed-inline-border);
  --stream-monaco-added-line-shadow: none;
  --stream-monaco-removed-line-shadow: none;
  --stream-monaco-added-gutter: var(--markstream-diff-added-gutter);
  --stream-monaco-removed-gutter: var(--markstream-diff-removed-gutter);
  --stream-monaco-added-line-fill: var(--markstream-diff-added-line-fill);
  --stream-monaco-removed-line-fill: var(--markstream-diff-removed-line-fill);
  --stream-monaco-added-border: hsl(var(--ms-diff-added) / 0.25);
  --stream-monaco-removed-border: hsl(var(--ms-diff-removed) / 0.25);
  --stream-monaco-widget-shadow: var(--markstream-diff-widget-shadow);
}

.code-block-container.is-diff :deep(.monaco-diff-editor .editor.original .margin-view-overlays .line-numbers) {
  left: var(--stream-monaco-line-number-left) !important;
  width: var(--stream-monaco-line-number-width) !important;
  min-width: var(--stream-monaco-line-number-width) !important;
  box-sizing: content-box !important;
  background: var(--stream-monaco-line-number-bg, var(--markstream-diff-line-number-bg)) !important;
  padding-left: var(--stream-monaco-line-number-padding-left, 2ch) !important;
  padding-right: var(--stream-monaco-line-number-padding-right, 1ch) !important;
  border-right: var(--stream-monaco-line-number-separator-width, 2px) solid var(--stream-monaco-editor-bg) !important;
  text-align: var(
    --markstream-diff-line-number-align,
    var(--markstream-code-line-number-align, right)
  ) !important;
  font-variant-numeric: tabular-nums;
  box-shadow: none;
}

.code-block-container.is-diff :deep(.monaco-diff-editor .editor.modified .margin-view-overlays .line-numbers) {
  left: var(--stream-monaco-line-number-left) !important;
  width: var(--stream-monaco-line-number-width) !important;
  min-width: var(--stream-monaco-line-number-width) !important;
  box-sizing: content-box !important;
  background: var(--stream-monaco-line-number-bg, var(--markstream-diff-line-number-bg)) !important;
  padding-left: var(--stream-monaco-line-number-padding-left, 2ch) !important;
  padding-right: var(--stream-monaco-line-number-padding-right, 1ch) !important;
  border-right: var(--stream-monaco-line-number-separator-width, 2px) solid var(--stream-monaco-editor-bg) !important;
  text-align: var(
    --markstream-diff-line-number-align,
    var(--markstream-code-line-number-align, right)
  ) !important;
  font-variant-numeric: tabular-nums;
  box-shadow: none;
}

.code-block-container.is-diff :deep(.monaco-diff-editor .margin-view-overlays .line-numbers),
.code-block-container.is-diff :deep(.monaco-diff-editor .margin-view-overlays .line-numbers *) {
  text-align: var(
    --markstream-diff-line-number-align,
    var(--markstream-code-line-number-align, right)
  ) !important;
  font-variant-numeric: tabular-nums;
}

.code-block-container.is-diff :deep(.monaco-diff-editor .editor.original .margin-view-overlays .line-delete.line-numbers),
.code-block-container.is-diff :deep(.monaco-diff-editor .editor.modified .margin-view-overlays .line-delete.line-numbers),
.code-block-container.is-diff :deep(.monaco-diff-editor .line-delete.line-numbers),
.code-block-container.is-diff :deep(.monaco-diff-editor .editor.original .margin-view-overlays .line-numbers.stream-monaco-line-number-delete),
.code-block-container.is-diff :deep(.monaco-diff-editor .editor.modified .margin-view-overlays .line-numbers.stream-monaco-line-number-delete),
.code-block-container.is-diff :deep(.monaco-editor .stream-monaco-fallback-line-number-delete),
.code-block-container.is-diff :deep(.stream-monaco-diff-root.stream-monaco-diff-native-stale .monaco-diff-editor .line-delete.line-numbers) {
  background: var(--stream-monaco-removed-line-fill) !important;
  color: var(--stream-monaco-removed-fg) !important;
  box-shadow: none !important;
}

.code-block-container.is-diff :deep(.monaco-diff-editor .editor.original .margin-view-overlays .line-insert.line-numbers),
.code-block-container.is-diff :deep(.monaco-diff-editor .editor.modified .margin-view-overlays .line-insert.line-numbers),
.code-block-container.is-diff :deep(.monaco-diff-editor .line-insert.line-numbers),
.code-block-container.is-diff :deep(.monaco-diff-editor .editor.original .margin-view-overlays .line-numbers.stream-monaco-line-number-insert),
.code-block-container.is-diff :deep(.monaco-diff-editor .editor.modified .margin-view-overlays .line-numbers.stream-monaco-line-number-insert),
.code-block-container.is-diff :deep(.monaco-editor .stream-monaco-fallback-line-number-insert),
.code-block-container.is-diff :deep(.stream-monaco-diff-root.stream-monaco-diff-native-stale .monaco-diff-editor .line-insert.line-numbers) {
  background: var(--stream-monaco-added-line-fill) !important;
  color: var(--stream-monaco-added-fg) !important;
  box-shadow: none !important;
}

.code-block-container.is-diff :deep(.monaco-diff-editor),
.code-block-container.is-diff :deep(.monaco-diff-editor .monaco-editor),
.code-block-container.is-diff :deep(.monaco-diff-editor .margin),
.code-block-container.is-diff :deep(.monaco-diff-editor .margin-view-overlays) {
  --stream-monaco-line-number-align: var(
    --markstream-diff-line-number-align,
    var(--markstream-code-line-number-align, right)
  ) !important;
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

.code-block-container:not(.is-diff) :deep(.monaco-editor .margin),
.code-block-container:not(.is-diff) :deep(.monaco-editor .margin-view-overlays) {
  width: var(--markstream-code-content-left) !important;
}

.code-block-container:not(.is-diff) :deep(.monaco-editor .line-numbers) {
  left: 0 !important;
  width: 2ch !important;
  min-width: 2ch !important;
  box-sizing: content-box !important;
  padding-left: 2ch !important;
  padding-right: 1ch !important;
  border-right: 2px solid var(--vscode-editor-background) !important;
  text-align: var(--markstream-code-line-number-align, right) !important;
  font-variant-numeric: tabular-nums;
}

.code-block-container:not(.is-diff) :deep(.monaco-editor .monaco-scrollable-element.editor-scrollable) {
  left: var(--markstream-code-content-left) !important;
  width: calc(100% - var(--markstream-code-content-left)) !important;
}

.code-block-container:not(.is-diff) :deep(.monaco-editor .lines-content) {
  left: 0 !important;
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

:deep(pre.code-pre-fallback) {
  margin: 0;
  box-sizing: border-box;
  width: 100%;
  padding: var(--markstream-code-padding-y, 8px) var(--markstream-code-padding-x, 12px);
  padding-left: var(--markstream-code-padding-left, 52px);
  background: transparent;
  color: var(--vscode-editor-foreground, inherit);
  backface-visibility: visible;
  transform: none;
  -webkit-font-smoothing: auto;
  /* Match Monaco defaults to avoid a jarring swap while it loads */
  font-size: var(--vscode-editor-font-size, 12px);
  line-height: var(--vscode-editor-line-height, 18px);
  font-weight: 400;
  font-family: var(
    --markstream-code-font-family,
    Menlo,
    Monaco,
    Courier New,
    monospace
  );
}

:deep(pre.code-pre-fallback > code) {
  font-size: inherit;
  font-weight: inherit;
  line-height: inherit;
  font-family: inherit;
}

:deep(pre.code-pre-fallback.is-wrap) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

:deep(pre.code-pre-fallback.markstream-pre--diff-preview) {
  padding-left: 0;
  padding-right: 0;
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

.code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview .markstream-pre__diff-line--added::after),
.code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview .markstream-pre__diff-line--added > .markstream-pre__diff-number) {
  background: var(--stream-monaco-added-line-fill, var(--markstream-diff-added-line-fill, transparent)) !important;
}

.code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview .markstream-pre__diff-line--removed::after),
.code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview .markstream-pre__diff-line--removed > .markstream-pre__diff-number) {
  background: var(--stream-monaco-removed-line-fill, var(--markstream-diff-removed-line-fill, transparent)) !important;
}

.code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview .markstream-pre__diff-line--added > .markstream-pre__diff-rail) {
  background: var(--stream-monaco-added-gutter, var(--markstream-diff-added-gutter, currentColor)) !important;
}

.code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview .markstream-pre__diff-line--removed > .markstream-pre__diff-rail) {
  background: var(--stream-monaco-removed-gutter, var(--markstream-diff-removed-gutter, currentColor)) !important;
}

.code-block-container.is-diff :deep(.monaco-diff-editor .margin-view-overlays > .gutter-insert > .cmdr.gutter-insert) {
  background: linear-gradient(
    90deg,
    transparent 0 var(--stream-monaco-line-number-box-width),
    var(--stream-monaco-added-line-fill) var(--stream-monaco-line-number-box-width) 100%
  ) !important;
}

.code-block-container.is-diff :deep(.monaco-diff-editor .margin-view-overlays > .gutter-delete > .cmdr.gutter-delete) {
  background: linear-gradient(
    90deg,
    transparent 0 var(--stream-monaco-line-number-box-width),
    var(--stream-monaco-removed-line-fill) var(--stream-monaco-line-number-box-width) 100%
  ) !important;
}

@media (prefers-reduced-motion: reduce) {
  .code-block-container.is-diff :deep(pre.code-pre-fallback.markstream-pre--diff-preview) {
    transition: none;
  }
}

.code-block-container.is-rendering .code-height-placeholder{
  background-size: 400% 100%;
  animation: code-skeleton-shimmer 1.2s ease-in-out infinite;
  min-height: var(--ms-size-skeleton-min-height);
  background: linear-gradient(90deg, var(--loading-shimmer) 25%, hsl(var(--ms-muted) / 0.7) 37%, var(--loading-shimmer) 63%);
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
  height: 1rem;
  background: linear-gradient(90deg, var(--loading-shimmer) 25%, hsl(var(--ms-muted) / 0.7) 37%, var(--loading-shimmer) 63%);
  background-size: 400% 100%;
  animation: code-skeleton-shimmer 1.2s ease-in-out infinite;
  border-radius: calc(var(--ms-radius) * 0.5);
}

.skeleton-line.short {
  width: 60%;
}

.code-block-container[data-markstream-viewport-pending='true'] .code-height-placeholder,
.code-block-container[data-markstream-viewport-pending='true'] .skeleton-line {
  animation: none;
}

@keyframes code-skeleton-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

/* ── Unchanged lines widget (ghost style) ── */
:deep(.stream-monaco-diff-root .monaco-editor .diff-hidden-lines .center) {
  border-radius: var(--ms-radius) !important;
  background: transparent !important;
  border: 1px solid transparent !important;
  box-shadow: none !important;
  min-height: 28px !important;
  transition: background-color 0.14s ease, border-color 0.14s ease !important;
}

:deep(.stream-monaco-diff-root .monaco-editor .diff-hidden-lines .center:hover),
:deep(.stream-monaco-diff-root .monaco-editor .diff-hidden-lines .center.stream-monaco-focus-within) {
  background: color-mix(in srgb, var(--stream-monaco-editor-fg) 4%, transparent) !important;
  border-color: color-mix(in srgb, var(--stream-monaco-editor-fg) 10%, transparent) !important;
  box-shadow: none !important;
}

:deep(.stream-monaco-diff-root.stream-monaco-diff-appearance-dark .monaco-editor .diff-hidden-lines .center) {
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}

:deep(.stream-monaco-diff-root.stream-monaco-diff-appearance-dark .monaco-editor .diff-hidden-lines .center:hover),
:deep(.stream-monaco-diff-root.stream-monaco-diff-appearance-dark .monaco-editor .diff-hidden-lines .center.stream-monaco-focus-within) {
  background: color-mix(in srgb, var(--stream-monaco-editor-fg) 6%, transparent) !important;
  border-color: color-mix(in srgb, var(--stream-monaco-editor-fg) 12%, transparent) !important;
  box-shadow: none !important;
}

/* Expand icon before the count label */
:deep(.stream-monaco-diff-root .monaco-editor .diff-hidden-lines .center .stream-monaco-unchanged-count)::before {
  content: '';
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 4px;
  flex-shrink: 0;
  background: currentColor;
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 15 5 5 5-5'/%3E%3Cpath d='m7 9 5-5 5 5'/%3E%3C/svg%3E");
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m7 15 5 5 5-5'/%3E%3Cpath d='m7 9 5-5 5 5'/%3E%3C/svg%3E");
  mask-size: contain;
  -webkit-mask-size: contain;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
}

:deep(.monaco-diff-editor .diffOverview){
  background-color: var(--vscode-editor-background);
}

:deep(.stream-monaco-diff-root .monaco-diff-editor .diffOverview),
:deep(.stream-monaco-diff-root .decorationsOverviewRuler) {
  display: none !important;
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  border: 0 !important;
  background: transparent !important;
  opacity: 0 !important;
  pointer-events: none !important;
  overflow: hidden !important;
}

:deep(.code-block-container .stream-monaco-diff-root .monaco-diff-editor) {
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

:deep(.code-block-container .stream-monaco-diff-root .monaco-editor .diff-hidden-lines .center:not(.stream-monaco-clickable) > *:not(a)) {
  visibility: hidden !important;
}

:deep(.code-block-container .stream-monaco-diff-root .monaco-editor .diff-hidden-lines-compact .text) {
  opacity: 0 !important;
}

:deep(.stream-monaco-diff-root) {
  --stream-monaco-gutter-guide: var(--markstream-diff-gutter-guide) !important;
  --stream-monaco-gutter-gap: var(--markstream-diff-gutter-gap) !important;
  --stream-monaco-line-number: var(--markstream-diff-line-number) !important;
  --stream-monaco-line-number-active: var(--markstream-diff-line-number-active) !important;
  --stream-monaco-added-fg: var(--markstream-diff-added-fg) !important;
  --stream-monaco-removed-fg: var(--markstream-diff-removed-fg) !important;
  --stream-monaco-added-line: var(--markstream-diff-added-line) !important;
  --stream-monaco-removed-line: var(--markstream-diff-removed-line) !important;
  --stream-monaco-added-inline: var(--markstream-diff-added-inline) !important;
  --stream-monaco-removed-inline: var(--markstream-diff-removed-inline) !important;
  --stream-monaco-added-inline-border: var(--markstream-diff-added-inline-border) !important;
  --stream-monaco-removed-inline-border: var(--markstream-diff-removed-inline-border) !important;
  --stream-monaco-added-line-fill: var(--markstream-diff-added-line-fill) !important;
  --stream-monaco-removed-line-fill: var(--markstream-diff-removed-line-fill) !important;
  --stream-monaco-added-gutter: var(--markstream-diff-added-gutter) !important;
  --stream-monaco-removed-gutter: var(--markstream-diff-removed-gutter) !important;
  --stream-monaco-added-line-shadow: none !important;
  --stream-monaco-removed-line-shadow: none !important;
  --stream-monaco-unchanged-bg: var(--markstream-diff-unchanged-bg) !important;
  --stream-monaco-unchanged-fg: var(--markstream-diff-unchanged-fg) !important;
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
}

:deep(.stream-monaco-diff-root.stream-monaco-diff-inline .monaco-diff-editor),
:deep(.stream-monaco-diff-root.stream-monaco-diff-inline .monaco-diff-editor .editor.modified),
:deep(.stream-monaco-diff-root.stream-monaco-diff-inline .monaco-diff-editor .editor.modified .monaco-editor),
:deep(.stream-monaco-diff-root.stream-monaco-diff-inline .monaco-diff-editor .editor.modified .overflow-guard),
:deep(.stream-monaco-diff-root .monaco-diff-editor:not(.side-by-side)),
:deep(.stream-monaco-diff-root .monaco-diff-editor:not(.side-by-side) .editor.modified),
:deep(.stream-monaco-diff-root .monaco-diff-editor:not(.side-by-side) .editor.modified .monaco-editor),
:deep(.stream-monaco-diff-root .monaco-diff-editor:not(.side-by-side) .editor.modified .overflow-guard) {
  min-width: 0 !important;
  width: 100% !important;
}

:deep(.stream-monaco-diff-root.stream-monaco-diff-inline .monaco-diff-editor .editor.modified .monaco-scrollable-element.editor-scrollable),
:deep(.stream-monaco-diff-root .monaco-diff-editor:not(.side-by-side) .editor.modified .monaco-scrollable-element.editor-scrollable) {
  left: var(--stream-monaco-modified-scrollable-left, var(--stream-monaco-modified-margin-width)) !important;
  width: calc(100% - var(--stream-monaco-modified-scrollable-left, var(--stream-monaco-modified-margin-width))) !important;
}

:deep(.stream-monaco-diff-root .monaco-diff-editor .editor.modified .view-lines .view-line.stream-monaco-line-insert-fill),
:deep(.stream-monaco-diff-root .monaco-diff-editor .editor.original .view-lines .view-line.stream-monaco-line-delete-fill) {
  width: 1000000px !important;
}

.code-block-container.is-diff :deep(.stream-monaco-fallback-inline-delete-line) {
  box-sizing: border-box;
  padding-left: var(--stream-monaco-diff-code-padding, 0px);
}

:deep(.stream-monaco-diff-root.stream-monaco-diff-inline .monaco-diff-editor .scrollbar.horizontal),
:deep(.stream-monaco-diff-root .monaco-diff-editor:not(.side-by-side) .scrollbar.horizontal) {
  display: none !important;
  height: 0 !important;
}

:deep(.stream-monaco-diff-root.stream-monaco-diff-inline.stream-monaco-diff-inline-native-ready.stream-monaco-diff-native-stale .monaco-diff-editor .editor.modified .view-lines.line-delete) {
  margin-left: 0 !important;
  width: 100% !important;
  background: var(--stream-monaco-removed-line-fill) !important;
  box-shadow: var(--stream-monaco-removed-line-shadow) !important;
  display: block !important;
  height: max-content !important;
  min-height: 18px !important;
  overflow: visible !important;
}

:deep(.stream-monaco-diff-root.stream-monaco-diff-inline.stream-monaco-diff-inline-native-ready.stream-monaco-diff-native-stale .monaco-diff-editor .gutter-delete),
:deep(.stream-monaco-diff-root.stream-monaco-diff-inline.stream-monaco-diff-inline-native-ready.stream-monaco-diff-native-stale .monaco-diff-editor .editor.modified .inline-deleted-margin-view-zone),
:deep(.stream-monaco-diff-root.stream-monaco-diff-inline.stream-monaco-diff-inline-native-ready.stream-monaco-diff-native-stale .monaco-diff-editor .editor.modified .stream-monaco-fallback-inline-delete-margin) {
  background: var(--stream-monaco-removed-gutter), var(--stream-monaco-removed-line-fill) !important;
  display: block !important;
  height: 100% !important;
  min-height: 18px !important;
  overflow: visible !important;
}

:deep(.stream-monaco-diff-root .monaco-editor .diff-hidden-lines .center:not(.stream-monaco-unchanged-bridge-source)),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge) {
  --stream-monaco-unchanged-bg: var(--markstream-diff-unchanged-bg) !important;
  --stream-monaco-unchanged-fg: var(--markstream-diff-unchanged-fg) !important;
  background: var(--stream-monaco-unchanged-bg) !important;
  color: var(--stream-monaco-unchanged-fg) !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge) {
  right: calc(
    var(--stream-monaco-gutter-marker-width) - var(--stream-monaco-unchanged-rail-width) / 2 + (var(--stream-monaco-gutter-gap) * 2)
  ) !important;
  width: auto !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-summary),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-summary:hover),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-summary:focus-visible),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-summary.stream-monaco-focus-visible) {
  background: var(--stream-monaco-unchanged-bg) !important;
  color: var(--markstream-diff-unchanged-fg) !important;
  padding-left: calc(
    var(--stream-monaco-gutter-marker-width) + (var(--stream-monaco-gutter-gap) * 2)
  ) !important;
  padding-right: calc(
    var(--stream-monaco-gutter-marker-width) + (var(--stream-monaco-gutter-gap) * 2)
  ) !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-rail),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge.stream-monaco-diff-unchanged-bridge-line-info .stream-monaco-unchanged-rail),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal:hover),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal:focus-visible),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal.stream-monaco-focus-visible) {
  background: var(--stream-monaco-unchanged-bg) !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-rail) {
  border-right-color: var(--markstream-diff-unchanged-divider) !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal) {
  border-bottom-color: transparent !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-rail.stream-monaco-unchanged-rail-both .stream-monaco-unchanged-reveal:first-child) {
  border-bottom-color: var(--markstream-diff-unchanged-divider) !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-rail.stream-monaco-unchanged-rail-top-only .stream-monaco-unchanged-reveal),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-rail.stream-monaco-unchanged-rail-bottom-only .stream-monaco-unchanged-reveal) {
  border-bottom: 0 !important;
}

:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-meta),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-count),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-metadata-label),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal:hover),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal:focus-visible),
:deep(.stream-monaco-diff-root .stream-monaco-diff-unchanged-bridge .stream-monaco-unchanged-reveal.stream-monaco-focus-visible) {
  color: var(--markstream-diff-unchanged-fg) !important;
}

:deep(.monaco-diff-editor:not(.side-by-side) .editor.original .diff-hidden-lines .center) {
  align-items: center;
  justify-content: center;
}

:deep(.monaco-diff-editor:not(.side-by-side) .editor.modified .diff-hidden-lines .center) {
  align-items: center;
  justify-content: center !important;
  position: relative;
}

:deep(.monaco-diff-editor:not(.side-by-side) .editor.modified .diff-hidden-lines .center:not(.stream-monaco-clickable)) {
  opacity: 0 !important;
  pointer-events: none !important;
}

:deep(.monaco-diff-editor:not(.side-by-side) .editor.modified .diff-hidden-lines .center .stream-monaco-unchanged-meta) {
  justify-content: center !important;
  padding: 0 28px !important;
}

:deep(.monaco-diff-editor:not(.side-by-side) .editor.original .diff-hidden-lines .center > div:first-child) {
  align-items: center;
  display: flex;
  justify-content: center !important;
  min-width: 100%;
  width: 100% !important;
}

:deep(.markstream-inline-fold-proxy) {
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: calc(var(--ms-radius) * 0.5);
  box-shadow: none;
  cursor: pointer;
  inset: 0;
  padding: 0;
  pointer-events: auto;
  position: absolute;
  z-index: 2;
}

:deep(.markstream-inline-fold-proxy:hover),
:deep(.markstream-inline-fold-proxy:focus-visible) {
  background: transparent;
}

:deep(.markstream-inline-fold-proxy:focus-visible) {
  outline: 1px solid var(--vscode-focusBorder, currentColor);
  outline-offset: -1px;
}
</style>
