<script setup lang="ts">
import type { D2BlockNodeProps } from '../../types/component-props'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { useOffscreenHeavyNodeDeferral, useViewportPriority, useViewportPriorityOptions } from '../../composables/viewportPriority'
import { parsePositiveNumber } from '../../utils/diagramHeight'
import { resolveLifecycleIndexKey } from '../../utils/lifecycleIndexKey'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../../utils/nodeLifecycle'
import { getD2 } from './d2'

const props = withDefaults(
  defineProps<D2BlockNodeProps>(),
  {
    maxHeight: undefined,
    estimatedPreviewHeightPx: undefined,
    loading: true,
    progressiveRender: true,
    progressiveIntervalMs: 700,
    showHeader: true,
    showModeToggle: true,
    showCopyButton: true,
    showExportButton: true,
    showCollapseButton: true,
  },
)

const attrs = useAttrs()
const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY, null)
const { t } = useSafeI18n()
const copyText = ref(false)
const isCollapsed = ref(false)
const showSource = ref(false)
const d2Available = ref(false)
const renderError = ref<string | null>(null)
const isRendering = ref(false)
const svgMarkup = ref('')
const svgRenderSignature = ref('')
const renderToken = ref(0)
const lastCompletedRenderSignature = ref('')
const lastFailedRenderSignature = ref('')
const bodyRef = ref<HTMLElement | null>(null)
const bodyMinHeight = ref<number | null>(null)
const viewportTarget = ref<HTMLElement | null>(null)
const registerViewport = useViewportPriority()
const viewportPriorityOptions = useViewportPriorityOptions()
const offscreenHeavyNodeDeferral = useOffscreenHeavyNodeDeferral()
const viewportHandle = ref<ReturnType<typeof registerViewport> | null>(null)
const isClient = typeof window !== 'undefined'
const hasMounted = ref(false)
const viewportReady = ref(typeof window === 'undefined' || !offscreenHeavyNodeDeferral.value)

const baseCode = computed(() => props.node.code ?? '')
const lifecycleIndexKey = computed(() => {
  return resolveLifecycleIndexKey(props, attrs)
})
const renderSignature = computed(() => [
  props.isDark ? 'dark' : 'light',
  props.themeId ?? 'auto',
  props.darkThemeId ?? 'auto',
  baseCode.value,
].join(':'))
const hasCurrentPreview = computed(() => !!svgMarkup.value && svgRenderSignature.value === renderSignature.value)
const isPreviewPending = computed(() => {
  if (!hasMounted.value || !baseCode.value || showSource.value)
    return false
  const signature = renderSignature.value
  if (isRendering.value)
    return true
  if (lastCompletedRenderSignature.value === signature)
    return false
  if (renderError.value && lastFailedRenderSignature.value === signature)
    return false
  return true
})
const hasPreview = computed(() => hasCurrentPreview.value || (!!svgMarkup.value && isPreviewPending.value))
const showSourceFallback = computed(() => {
  return showSource.value || !d2Available.value || !hasPreview.value
})

// While the diagram is still being produced the source panel is what the block
// renders, and it is much shorter than the finished diagram. Reserving the
// estimated preview height here keeps the page below the block in place when
// the preview replaces the source (measured ~238px of layout shift otherwise).
//
// The reservation is applied from the first paint on purpose: applying it once
// the D2 runtime resolves moves the content just as much as the preview itself
// would. It is released as soon as the preview can no longer be expected — the
// user picked the source tab, a preview is on screen, the code is empty, or the
// render already failed for this content — so an errored or unavailable diagram
// does not hold blank space that will never be filled.
const pendingPreviewReserve = computed(() => {
  if (showSource.value || hasPreview.value)
    return 0
  if (!baseCode.value)
    return 0
  if (renderError.value && lastFailedRenderSignature.value === renderSignature.value)
    return 0
  return parsePositiveNumber(props.estimatedPreviewHeightPx) ?? 0
})

const bodyStyle = computed(() => {
  if (!showSourceFallback.value)
    return undefined
  const minHeight = Math.max(bodyMinHeight.value ?? 0, pendingPreviewReserve.value)
  return minHeight > 0 ? { minHeight: `${minHeight}px` } : undefined
})
const renderStyle = computed(() => {
  if (props.maxHeight === 'none')
    return { 'maxHeight': 'none', '--ms-d2-render-max-height': 'none' }
  if (props.maxHeight != null) {
    const max = typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : String(props.maxHeight)
    return { 'maxHeight': max, '--ms-d2-render-max-height': max }
  }
  // No explicit prop — CSS token handles it via scoped style
  return undefined
})

let d2Instance: any | null = null
let scheduled = false
let unmounted = false
let lastRenderAt = 0
let throttleTimer: number | null = null
let pendingRender = false
let bodyObserver: ResizeObserver | null = null
let lifecyclePendingIndexKey = ''

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
    if (!unmounted) {
      const height = viewportTarget.value?.offsetHeight ?? 0
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

if (typeof window !== 'undefined') {
  watch(
    [() => viewportTarget.value, offscreenHeavyNodeDeferral],
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
      const rootMargin = viewportPriorityOptions?.value.heavyBlockMargin
        ?? viewportPriorityOptions?.value.rootMargin
        ?? '160px'
      const handle = registerViewport(el, {
        rootMargin,
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

const DARK_THEME_OVERRIDES: Record<string, string> = {
  N1: '#E5E7EB',
  N2: '#CBD5E1',
  N3: '#94A3B8',
  N4: '#64748B',
  N5: '#475569',
  N6: '#334155',
  N7: '#0B1220',
  B1: '#60A5FA',
  B2: '#3B82F6',
  B3: '#2563EB',
  B4: '#1D4ED8',
  B5: '#1E40AF',
  B6: '#111827',
  AA2: '#22D3EE',
  AA4: '#0EA5E9',
  AA5: '#0284C7',
  AB4: '#FBBF24',
  AB5: '#F59E0B',
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

async function copy() {
  try {
    const text = baseCode.value
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
    }
    copyText.value = true
    setTimeout(() => {
      copyText.value = false
    }, 1000)
  }
  catch (err) {
    console.error('Copy failed:', err)
  }
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function handleSwitchMode(mode: 'preview' | 'source') {
  showSource.value = mode === 'source'
}

const DISALLOWED_STYLE_PATTERNS = [/javascript:/i, /expression\s*\(/i, /url\s*\(\s*javascript:/i, /@import/i]
const SAFE_URL_PROTOCOLS = /^(?:https?:|mailto:|tel:|#|\/|data:image\/(?:png|gif|jpe?g|webp);)/i

function neutralizeScriptProtocols(raw: string) {
  return raw
    .replace(/["']\s*javascript:/gi, '#')
    .replace(/\bjavascript:/gi, '#')
    .replace(/["']\s*vbscript:/gi, '#')
    .replace(/\bvbscript:/gi, '#')
    .replace(/\bdata:text\/html/gi, '#')
}

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
        if (safe !== attr.value)
          node.setAttribute(name, safe)
      }
    }
  }
}

function toSafeSvgMarkup(svg: string | null | undefined) {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined')
    return ''
  if (!svg)
    return ''
  const neutralized = neutralizeScriptProtocols(svg)
  const parsed = new DOMParser().parseFromString(neutralized, 'image/svg+xml')
  const svgEl = parsed.documentElement
  if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg')
    return ''
  const svgElement = svgEl as unknown as SVGElement
  scrubSvgElement(svgElement)
  svgElement.classList.add('markstream-d2-root-svg')
  return svgElement.outerHTML
}

function setSvg(svg: string, signature: string) {
  const safe = toSafeSvgMarkup(svg)
  svgMarkup.value = safe || ''
  svgRenderSignature.value = safe ? signature : ''
}

function clearSvg() {
  svgMarkup.value = ''
  svgRenderSignature.value = ''
}

function extractSvg(renderResult: any) {
  if (!renderResult)
    return ''
  if (typeof renderResult === 'string')
    return renderResult
  if (typeof renderResult.svg === 'string')
    return renderResult.svg
  if (typeof renderResult.data === 'string')
    return renderResult.data
  return ''
}

async function ensureD2Instance() {
  if (d2Instance)
    return d2Instance
  const D2Ctor = await getD2()
  if (unmounted || !D2Ctor)
    return null
  if (typeof D2Ctor === 'function') {
    const inst = new D2Ctor()
    if (inst && typeof inst.compile === 'function')
      d2Instance = inst
    else if (typeof (D2Ctor as any).compile === 'function')
      d2Instance = D2Ctor
    return d2Instance
  }
  if (D2Ctor?.D2 && typeof D2Ctor.D2 === 'function') {
    d2Instance = new D2Ctor.D2()
    return d2Instance
  }
  if (typeof D2Ctor.compile === 'function')
    d2Instance = D2Ctor
  return d2Instance
}

function isStaleRender(token: number) {
  return unmounted || token !== renderToken.value
}

async function renderDiagram() {
  if (!isClient || unmounted)
    return
  if (!viewportReady.value)
    return
  if (props.loading && !props.progressiveRender)
    return
  const signature = renderSignature.value
  if (signature === lastCompletedRenderSignature.value && !renderError.value && hasCurrentPreview.value) {
    d2Available.value = true
    if (props.loading)
      showSource.value = false
    return
  }
  const code = baseCode.value
  if (!code) {
    clearSvg()
    renderError.value = null
    lastCompletedRenderSignature.value = ''
    lastFailedRenderSignature.value = ''
    return
  }

  const token = ++renderToken.value
  isRendering.value = true
  renderError.value = null
  lastFailedRenderSignature.value = ''
  markLifecyclePending()

  try {
    const instance = await ensureD2Instance()
    if (isStaleRender(token))
      return
    if (!instance) {
      d2Available.value = false
      showSource.value = true
      clearSvg()
      renderError.value = 'D2 is not available.'
      lastFailedRenderSignature.value = signature
      return
    }
    if (typeof instance.compile !== 'function' || typeof instance.render !== 'function') {
      throw new TypeError('D2 instance is missing compile/render methods.')
    }
    d2Available.value = true

    const compileResult = await instance.compile(code)
    if (isStaleRender(token))
      return

    const diagram = compileResult?.diagram ?? compileResult
    const baseRenderOptions = compileResult?.renderOptions ?? compileResult?.options ?? {}
    const resolvedThemeId = props.themeId ?? baseRenderOptions.themeID
    const resolvedDarkThemeId = props.darkThemeId ?? baseRenderOptions.darkThemeID
    const renderOptions: Record<string, any> = { ...baseRenderOptions }
    renderOptions.themeID = props.isDark && resolvedDarkThemeId != null
      ? resolvedDarkThemeId
      : resolvedThemeId
    // Ensure app-controlled theme takes precedence over OS-level preference.
    renderOptions.darkThemeID = null
    renderOptions.darkThemeOverrides = null
    if (props.isDark) {
      const baseOverrides = baseRenderOptions.themeOverrides && typeof baseRenderOptions.themeOverrides === 'object'
        ? baseRenderOptions.themeOverrides
        : null
      renderOptions.themeOverrides = {
        ...DARK_THEME_OVERRIDES,
        ...(baseOverrides || {}),
      }
    }
    const renderResult = await instance.render(diagram, renderOptions)
    if (isStaleRender(token))
      return

    const svg = extractSvg(renderResult)
    if (!svg)
      throw new Error('D2 render returned empty output.')
    setSvg(svg, signature)
    lastCompletedRenderSignature.value = signature
    lastFailedRenderSignature.value = ''
    if (props.loading)
      showSource.value = false
    renderError.value = null
  }
  catch (err: any) {
    if (isStaleRender(token))
      return
    const message = err?.message ? String(err.message) : 'D2 render failed.'
    if (!props.loading) {
      renderError.value = message
      lastFailedRenderSignature.value = signature
    }
    lastCompletedRenderSignature.value = ''
    if (message.includes('@terrastruct/d2')) {
      d2Available.value = false
      showSource.value = true
    }
  }
  finally {
    if (!isStaleRender(token)) {
      isRendering.value = false
      if (pendingRender) {
        pendingRender = false
        scheduleRender()
      }
      else {
        markLifecycleSettled()
      }
    }
  }
}

function scheduleRender(force = false) {
  if (scheduled)
    return
  if (!isClient)
    return
  if (unmounted)
    return
  if (isRendering.value) {
    pendingRender = true
    return
  }
  const interval = Math.max(120, Number(props.progressiveIntervalMs) || 0)
  const now = Date.now()
  const elapsed = now - lastRenderAt
  if (!force && elapsed < interval) {
    pendingRender = true
    if (throttleTimer == null) {
      throttleTimer = window.setTimeout(() => {
        throttleTimer = null
        if (pendingRender) {
          pendingRender = false
          scheduleRender(true)
        }
      }, Math.max(0, interval - elapsed))
    }
    return
  }
  scheduled = true
  const runner = () => {
    scheduled = false
    lastRenderAt = Date.now()
    renderDiagram()
  }
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
    window.requestAnimationFrame(runner)
  else
    setTimeout(runner, 0)
}

function exportSvg() {
  if (!hasCurrentPreview.value)
    return
  try {
    const blob = new Blob([svgMarkup.value], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    if (typeof document !== 'undefined') {
      const link = document.createElement('a')
      link.href = url
      link.download = `d2-diagram-${Date.now()}.svg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
    URL.revokeObjectURL(url)
  }
  catch (error) {
    console.error('Failed to export SVG:', error)
  }
}

function updateBodyMinHeight() {
  const el = bodyRef.value
  if (!el)
    return
  // Measure the content, never the body itself: the body carries the reserved
  // preview height, so reading it back would ratchet that reservation into a
  // floor that can never shrink once the reservation is released.
  const content = (el.firstElementChild as HTMLElement | null) ?? el
  const height = content.getBoundingClientRect().height
  if (height > 0)
    bodyMinHeight.value = height
}

watch(
  () => [props.node.code, props.loading, props.isDark, props.themeId, props.darkThemeId],
  () => {
    scheduleRender()
  },
  { immediate: true },
)

watch(
  () => props.loading,
  (loading, prev) => {
    if (prev && !loading)
      scheduleRender(true)
  },
)

watch(
  () => viewportReady.value,
  (ready) => {
    if (ready)
      scheduleRender(true)
  },
)

watch(
  () => [showSourceFallback.value, svgMarkup.value, baseCode.value],
  () => {
    nextTick(() => {
      updateBodyMinHeight()
    })
  },
)

onMounted(() => {
  hasMounted.value = true
  nextTick(() => {
    updateBodyMinHeight()
  })
  if (typeof ResizeObserver !== 'undefined') {
    bodyObserver = new ResizeObserver(() => {
      updateBodyMinHeight()
    })
    if (bodyRef.value)
      bodyObserver.observe(bodyRef.value)
  }
})

onBeforeUnmount(() => {
  unmounted = true
  renderToken.value += 1
  pendingRender = false
  clearLifecyclePending()
  lastCompletedRenderSignature.value = ''
  viewportHandle.value?.destroy()
  viewportHandle.value = null
  if (throttleTimer != null) {
    clearTimeout(throttleTimer)
    throttleTimer = null
  }
  bodyObserver?.disconnect()
  bodyObserver = null
})
</script>

<template>
  <div
    ref="viewportTarget"
    class="d2-block-container rounded-lg border overflow-hidden"
    data-markstream-d2="1"
    :data-markstream-mode="showSourceFallback ? 'fallback' : 'preview'"
    :data-markstream-pending="isPreviewPending ? 'true' : undefined"
    :class="{ dark: props.isDark }"
  >
    <div
      v-if="props.showHeader"
      class="d2-block-header flex justify-between items-center border-b"
    >
      <div class="flex items-center gap-x-2">
        <span class="d2-label font-medium font-mono">D2</span>
      </div>
      <div class="d2-header-actions flex items-center">
        <div
          v-if="props.showModeToggle"
          class="d2-mode-toggle flex items-center gap-0.5"
        >
          <button
            type="button"
            class="mode-btn px-2 py-0.5 rounded"
            :class="!showSource ? 'is-active' : ''"
            @click="handleSwitchMode('preview')"
            @mouseenter="onBtnHover($event, t('common.preview') || 'Preview')"
            @focus="onBtnHover($event, t('common.preview') || 'Preview')"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            {{ t('common.preview') || 'Preview' }}
          </button>
          <button
            type="button"
            class="mode-btn px-2 py-0.5 rounded"
            :class="showSource ? 'is-active' : ''"
            @click="handleSwitchMode('source')"
            @mouseenter="onBtnHover($event, t('common.source') || 'Source')"
            @focus="onBtnHover($event, t('common.source') || 'Source')"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            {{ t('common.source') || 'Source' }}
          </button>
        </div>

        <button
          v-if="props.showCopyButton"
          type="button"
          class="d2-action-btn p-[var(--ms-action-btn-padding)] rounded-md"
          :aria-label="copyText ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')"
          @click="copy"
          @mouseenter="onCopyHover($event)"
          @focus="onCopyHover($event)"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg v-if="!copyText" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></g></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5" /></svg>
        </button>

        <button
          v-if="props.showExportButton && hasCurrentPreview"
          type="button"
          class="d2-action-btn p-[var(--ms-action-btn-padding)] rounded-md"
          :aria-label="t('common.export') || 'Export'"
          @click="exportSvg"
          @mouseenter="onBtnHover($event, t('common.export') || 'Export')"
          @focus="onBtnHover($event, t('common.export') || 'Export')"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v12m0-12l-4 4m4-4l4 4M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
        </button>

        <button
          v-if="props.showCollapseButton"
          type="button"
          class="d2-action-btn p-[var(--ms-action-btn-padding)] rounded-md"
          :aria-pressed="isCollapsed"
          @click="toggleCollapse"
          @mouseenter="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
          @focus="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg :style="{ rotate: isCollapsed ? '0deg' : '90deg' }" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6" /></svg>
        </button>
      </div>
    </div>

    <div v-show="!isCollapsed" ref="bodyRef" class="d2-block-body" :style="bodyStyle">
      <div v-if="props.loading && !hasPreview" class="d2-source">
        <pre class="d2-code"><code>{{ baseCode }}</code></pre>
        <p v-if="renderError" class="d2-error mt-2 text-xs">
          {{ renderError }}
        </p>
      </div>
      <div v-else>
        <div v-if="showSourceFallback" class="d2-source">
          <pre class="d2-code"><code>{{ baseCode }}</code></pre>
          <p v-if="renderError" class="d2-error mt-2 text-xs">
            {{ renderError }}
          </p>
        </div>
        <div v-else class="d2-render" :style="renderStyle">
          <div class="d2-svg" v-html="svgMarkup" />
          <p v-if="renderError" class="d2-error px-4 pb-3 text-xs">
            {{ renderError }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Container ── */
.d2-block-container {
  margin: var(--ms-flow-diagram-y) 0;
  background: var(--diagram-bg);
  border-color: var(--diagram-border);
  color: hsl(var(--ms-foreground));
  box-shadow: var(--ms-shadow-subtle);
}

/* ── Header ── */
.d2-block-header {
  padding: var(--ms-inset-panel-y) var(--ms-inset-panel-x);
  background: var(--diagram-header-bg);
  border-color: var(--diagram-border);
  color: hsl(var(--ms-foreground));
}

/* ── Mode toggle ── */
.d2-mode-toggle {
  background: transparent;
}

.mode-btn {
  font-size: var(--ms-text-label);
  color: var(--code-action-fg);
  opacity: 0.6;
  transition: opacity 0.2s, color 0.2s, background-color 0.2s;
}

.mode-btn:hover {
  opacity: 0.9;
}

.mode-btn.is-active {
  background: hsl(var(--ms-foreground) / 0.08);
  color: var(--code-fg);
  opacity: 1;
}

.d2-header-actions {
  gap: var(--ms-gap-header-actions);
}

/* ── Action buttons ── */
.d2-action-btn {
  color: var(--code-action-fg);
  opacity: 0.7;
  transition: opacity 0.2s, background-color 0.15s, color 0.15s;
}

.d2-action-btn:hover {
  opacity: 1;
  background: var(--code-action-hover-bg);
  color: var(--code-action-hover-fg);
}

.d2-action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ── Body ── */
.d2-block-body {
  position: relative;
}

.d2-source {
  padding: var(--ms-inset-panel-body) var(--ms-inset-panel-x);
  font-family: var(--vscode-editor-font-family, 'Fira Code', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace);
}

.d2-code {
  white-space: pre;
  font-size: 0.875rem;
  line-height: 1.5;
}

/* Center the rendered diagram like the mermaid/infographic blocks: a
   column flex container with margin:auto children stays centered while
   remaining scroll-safe when content overflows. */
.d2-render {
  max-height: var(--ms-size-code-max-height);
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.d2-svg {
  margin: auto;
  width: 100%;
}

.d2-render .d2-error {
  margin-left: auto;
  margin-right: auto;
}

.d2-svg :deep(svg.markstream-d2-root-svg) {
  width: 100%;
  max-width: 100%;
  height: auto;
  /* Match the container cap so tall diagrams scale down to fit, mirroring
     the mermaid block's max-height behavior. When the user sets maxHeight,
     the inline style exposes the value as --ms-d2-render-max-height; the
     default fallback here is the shared token. */
  max-height: var(--ms-d2-render-max-height, var(--ms-size-code-max-height));
  display: block;
}

.d2-label {
  font-size: var(--ms-text-label);
}

.action-icon {
  width: var(--ms-action-btn-icon);
  height: var(--ms-action-btn-icon);
}

.d2-error {
  color: hsl(var(--ms-destructive));
}
</style>
