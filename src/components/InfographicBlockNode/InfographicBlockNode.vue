<script setup lang="ts">
import type { InfographicBlockNodeProps } from '../../types/component-props'
import { createPanGesture } from 'markstream-core'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { useOffscreenHeavyNodeDeferral, useViewportPriority, useViewportPriorityOptions } from '../../composables/viewportPriority'
import infographicIcon from '../../icon/infographic.svg?raw'
import { clampInfographicPreviewHeight, estimateInfographicPreviewHeight, INFOGRAPHIC_PREVIEW_MIN_HEIGHT, parsePositiveNumber } from '../../utils/diagramHeight'
import { resolveLifecycleIndexKey } from '../../utils/lifecycleIndexKey'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../../utils/nodeLifecycle'
import { getInfographic, isInfographicEnabled } from './infographic'

const props = withDefaults(
  defineProps<InfographicBlockNodeProps>(),
  {
    maxHeight: undefined,
    loading: true,
    showHeader: true,
    showCopyButton: true,
    showCollapseButton: true,
    showModeToggle: true,
    showExportButton: true,
    showFullscreenButton: true,
    showZoomControls: true,
  },
)

const _emits = defineEmits(['copy', 'export', 'openModal'])

const { t } = useSafeI18n()
const registerViewport = useViewportPriority()
const viewportPriorityOptions = useViewportPriorityOptions()
const offscreenHeavyNodeDeferral = useOffscreenHeavyNodeDeferral()

const copyText = ref(false)
const isCollapsed = ref(false)
const viewportTarget = ref<HTMLElement>()
const infographicContainer = ref<HTMLElement>()
const showSource = ref(true)
const userToggledShowSource = ref(false)
const isModalOpen = ref(false)
const modalContent = ref<HTMLElement>()
const modalCloneWrapper = ref<HTMLElement | null>(null)
const hasPreview = ref(false)
const hasRenderError = ref(false)
const viewportHandle = ref<ReturnType<typeof registerViewport> | null>(null)
const viewportReady = ref(typeof window === 'undefined' || !offscreenHeavyNodeDeferral.value)
const attrs = useAttrs()
const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY, null)
let lifecyclePendingIndexKey = ''
const lifecycleIndexKey = computed(() => {
  return resolveLifecycleIndexKey(props, attrs)
})

function reportLifecycleHeight(indexKey = lifecycleIndexKey.value) {
  if (!indexKey || !viewportTarget.value)
    return
  lifecycle?.reportHeight(indexKey, viewportTarget.value.offsetHeight)
}

function markLifecyclePending() {
  const indexKey = lifecycleIndexKey.value
  if (!indexKey)
    return

  if (lifecyclePendingIndexKey === indexKey)
    return

  if (lifecyclePendingIndexKey)
    lifecycle?.markSettled(lifecyclePendingIndexKey)

  lifecyclePendingIndexKey = indexKey
  lifecycle?.markPending(indexKey)
}

async function markLifecycleSettled() {
  const indexKey = lifecyclePendingIndexKey
  if (!indexKey)
    return

  lifecyclePendingIndexKey = ''
  await nextTick()
  reportLifecycleHeight(indexKey)
  lifecycle?.markSettled(indexKey)
}

function clearLifecyclePending() {
  const indexKey = lifecyclePendingIndexKey
  if (!indexKey)
    return

  lifecyclePendingIndexKey = ''
  lifecycle?.markSettled(indexKey)
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

function resolveContainerHeight(actualHeight: number) {
  if (props.maxHeight === 'none')
    return `${actualHeight}px`

  // Explicit prop value takes priority
  if (props.maxHeight != null) {
    const maxHeight = Number.parseFloat(String(props.maxHeight))
    if (Number.isFinite(maxHeight))
      return `${Math.min(actualHeight, maxHeight)}px`
  }

  // Fall back to CSS token (respects density theming)
  const el = infographicContainer.value
  if (el) {
    const raw = getComputedStyle(el).getPropertyValue('--ms-size-code-max-height').trim()
    const num = Number.parseFloat(raw)
    if (Number.isFinite(num))
      return `${Math.min(actualHeight, num)}px`
  }
  return `${Math.min(actualHeight, 500)}px` // ultimate fallback
}

/**
 * Resolve the preview minimum height from the density CSS token
 * (--ms-size-diagram-min-height), falling back to the built-in default.
 * Mirrors MermaidBlockNode's resolveMinContainerHeight.
 */
function resolveMinContainerHeight() {
  const raw = infographicContainer.value
    ? getComputedStyle(infographicContainer.value).getPropertyValue('--ms-size-diagram-min-height').trim()
    : ''
  return parsePositiveNumber(raw) ?? INFOGRAPHIC_PREVIEW_MIN_HEIGHT
}

function clampPreviewHeight(height: number) {
  const minHeight = resolveMinContainerHeight()
  if (props.maxHeight === 'none')
    return clampInfographicPreviewHeight(height, minHeight, null)
  const explicitMax = parsePositiveNumber(props.maxHeight)
  return clampInfographicPreviewHeight(height, minHeight, explicitMax)
}

const baseCode = computed(() => props.node.code)
const estimatedPreviewHeight = computed(() =>
  clampPreviewHeight(
    parsePositiveNumber(props.estimatedPreviewHeightPx) ?? estimateInfographicPreviewHeight(baseCode.value),
  ),
)
const containerHeight = ref<string>(`${estimatedPreviewHeight.value}px`)
const hasExternalPreviewHeightEstimate = computed(() => parsePositiveNumber(props.estimatedPreviewHeightPx) != null)

function updateContainerHeight() {
  if (!infographicContainer.value)
    return
  if (hasExternalPreviewHeightEstimate.value)
    return

  const actualHeight = infographicContainer.value.scrollHeight
  if (actualHeight > 0) {
    const resolvedHeight = parsePositiveNumber(resolveContainerHeight(actualHeight)) ?? actualHeight
    containerHeight.value = `${Math.max(resolvedHeight, estimatedPreviewHeight.value)}px`
  }
}

// Zoom state
const zoom = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)

const renderSignature = computed(() => baseCode.value)

// Tooltip helpers
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

// Copy functionality
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
    console.error('Failed to copy:', err)
  }
}

function handleSwitchMode(mode: 'preview' | 'source') {
  if (mode === 'preview' && !isInfographicEnabled())
    return
  userToggledShowSource.value = true
  showSource.value = mode === 'source'
}

// Export SVG functionality
function handleExportClick() {
  const svgElement = infographicContainer.value?.querySelector('svg')
  if (!svgElement) {
    console.error('SVG element not found')
    return
  }
  exportSvg(svgElement)
}

async function exportSvg(svgElement: SVGElement) {
  try {
    const svgData = new XMLSerializer().serializeToString(svgElement)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    if (typeof document !== 'undefined') {
      const link = document.createElement('a')
      link.href = url
      link.download = `infographic-${Date.now()}.svg`
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

// Modal/Fullscreen functionality
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
    if (infographicContainer.value && modalContent.value) {
      // Clear previous
      modalContent.value.innerHTML = ''

      // Create a wrapper for transform
      const wrapper = document.createElement('div')
      wrapper.style.transition = 'transform 0.1s ease'
      wrapper.style.transformOrigin = 'center center'
      wrapper.style.width = '100%'
      wrapper.style.height = '100%'
      wrapper.style.display = 'flex'
      wrapper.style.alignItems = 'center'
      wrapper.style.justifyContent = 'center'

      // Clone the content
      const clone = infographicContainer.value.cloneNode(true) as HTMLElement
      clone.classList.add('fullscreen')
      // Remove any fixed height from the clone to allow it to scale properly in flex
      clone.style.height = 'auto'

      wrapper.appendChild(clone)
      modalContent.value.appendChild(wrapper)

      modalCloneWrapper.value = wrapper

      // Sync initial transform
      wrapper.style.transform = `translate(${translateX.value}px, ${translateY.value}px) scale(${zoom.value})`
    }
  })
}

function closeModal() {
  isModalOpen.value = false
  if (modalContent.value) {
    modalContent.value.innerHTML = ''
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

// Keep modal clone in sync with transform changes

function handleOpenModalClick() {
  openModal()
}

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

// The diagram is scaled to fit the preview box, so at fit zoom nothing is
// off-screen and panning only shifts it inside the box. Touch therefore keeps
// scrolling the page at that zoom (a chat is mostly scrolling) and only claims
// the gesture once the diagram is zoomed in and actually overflows the box.
// The fullscreen modal always claims it: the surface fills the viewport, panning
// is the intended gesture there, and the page behind it is locked anyway.
const panSurfaceClaimsTouch = computed(() => isModalOpen.value || zoom.value > 1)

// Drag functionality. The gesture lifecycle (window listeners, pointer identity,
// lost releases) lives in markstream-core so every package pans identically.
const panGesture = createPanGesture({
  getTranslate: () => ({ x: translateX.value, y: translateY.value }),
  setTranslate: (next) => {
    translateX.value = next.x
    translateY.value = next.y
  },
  canStart: (e) => {
    // Nothing to pan until the diagram exists. Without this the pending/error
    // source panel would be claimed by the gesture, and `preventDefault` would
    // take text selection away from it.
    if (!hasPreview.value)
      return false

    // Touch pans only where the surface claims the gesture. Elsewhere the page
    // keeps the swipe for scrolling, and panning along with it would shift the
    // diagram by a few pixels before the browser takes the gesture over.
    return e.pointerType !== 'touch' || panSurfaceClaimsTouch.value
  },
  onActiveChange: active => (isDragging.value = active),
})

const startDrag = panGesture.start
const stopDrag = panGesture.stop

let infographicInstance: any | null = null
let renderInFlight = false
let rerenderQueued = false
let rerenderForce = false
let renderScheduled = false
let renderScheduledForce = false
let lastCompletedRenderSignature = ''
let unmounted = false
let renderGeneration = 0

function isCurrentRender(generation: number) {
  return !unmounted && generation === renderGeneration
}

async function renderInfographic(force = false) {
  if (unmounted || !viewportReady.value)
    return
  if (!infographicContainer.value)
    return
  if (renderInFlight) {
    rerenderQueued = true
    rerenderForce = rerenderForce || force
    return
  }
  const signature = renderSignature.value
  if (!force && signature === lastCompletedRenderSignature && hasPreview.value)
    return

  const source = baseCode.value
  const final = props.loading === false
  const generation = ++renderGeneration
  renderInFlight = true
  markLifecyclePending()
  let nextInfographicInstance: any | null = null
  let previousChildren: ChildNode[] | null = null

  try {
    const InfographicClass = await getInfographic()
    if (!isCurrentRender(generation))
      return
    if (!InfographicClass)
      throw new Error('Infographic library failed to load.')
    const container = infographicContainer.value
    if (!container)
      return

    const stillStreaming = props.loading === true
    const canRender = signature === renderSignature.value
      || (!final && stillStreaming && baseCode.value.startsWith(source))
    if (!canRender)
      return

    previousChildren = Array.from(container.childNodes)
    nextInfographicInstance = new InfographicClass({
      container,
      width: '100%',
      height: '100%',
    })

    let renderErrorMessage = ''
    let renderCompleted = false
    nextInfographicInstance.on?.('error', (error: unknown) => {
      const errors = Array.isArray(error) ? error : [error]
      renderErrorMessage = errors
        .map((item) => {
          if (item instanceof Error)
            return item.message
          if (typeof item === 'string')
            return item
          if (item && typeof item === 'object' && 'message' in item)
            return String((item as { message?: unknown }).message ?? '')
          return String(item ?? '')
        })
        .filter(Boolean)
        .join('; ')
    })
    nextInfographicInstance.on?.('rendered', () => {
      renderCompleted = true
    })

    // Render the syntax
    nextInfographicInstance.render(source)
    if (renderErrorMessage)
      throw new Error(renderErrorMessage)
    const nextChildren = Array.from(container.childNodes)
    const replacedChildren = nextChildren.length > 0 && (
      nextChildren.length !== previousChildren.length
      || nextChildren.some((child, index) => child !== previousChildren?.[index])
    )
    if (!renderCompleted && !replacedChildren)
      throw new Error('Infographic render returned empty output.')

    infographicInstance?.destroy?.()
    infographicInstance = nextInfographicInstance
    nextInfographicInstance = null
    hasPreview.value = true
    hasRenderError.value = false
    lastCompletedRenderSignature = signature

    // Update container height after render
    nextTick(() => {
      if (isCurrentRender(generation))
        updateContainerHeight()
    })
  }
  catch (error) {
    if (!isCurrentRender(generation))
      return
    nextInfographicInstance?.destroy?.()
    nextInfographicInstance = null
    if (final && props.loading === false && signature === renderSignature.value) {
      console.error('Failed to render infographic:', error)
      infographicInstance?.destroy?.()
      infographicInstance = null
      hasPreview.value = false
      hasRenderError.value = true
      lastCompletedRenderSignature = ''
      if (infographicContainer.value) {
        infographicContainer.value.innerHTML = `<div style="padding: var(--ms-inset-panel-body); color: hsl(var(--ms-destructive))">Failed to render infographic: ${error instanceof Error ? error.message : 'Unknown error'}</div>`
      }
    }
    else if (previousChildren && infographicContainer.value) {
      infographicContainer.value.replaceChildren(...previousChildren)
    }
  }
  finally {
    nextInfographicInstance?.destroy?.()
    renderInFlight = false
    if (isCurrentRender(generation)) {
      if (rerenderQueued) {
        const forceNext = rerenderForce
        rerenderQueued = false
        rerenderForce = false
        nextTick(() => {
          void renderInfographic(forceNext)
        })
      }
      else {
        void markLifecycleSettled()
      }
    }
  }
}

function queueInfographicRender(force = false) {
  if (unmounted || !viewportReady.value || showSource.value || isCollapsed.value)
    return
  renderScheduledForce = renderScheduledForce || force
  if (renderScheduled)
    return
  renderScheduled = true
  nextTick(() => {
    renderScheduled = false
    const forceNext = renderScheduledForce
    renderScheduledForce = false
    if (!unmounted)
      void renderInfographic(forceNext)
  })
}

// Watch for code changes
watch(
  () => baseCode.value,
  () => {
    queueInfographicRender(true)
  },
)

watch(
  () => props.loading,
  (loading, prev) => {
    if (prev && !loading)
      queueInfographicRender(true)
  },
)

// Watch for mode changes
watch(
  () => showSource.value,
  (isSource) => {
    if (!isSource)
      queueInfographicRender(true)
  },
)

// Watch for collapse changes
watch(
  () => isCollapsed.value,
  (collapsed) => {
    if (!collapsed)
      queueInfographicRender()
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
  [() => props.estimatedPreviewHeightPx, () => baseCode.value],
  () => {
    if (!hasPreview.value && !showSource.value)
      containerHeight.value = `${estimatedPreviewHeight.value}px`
  },
)

watch(
  () => viewportReady.value,
  (ready) => {
    if (!ready || showSource.value || isCollapsed.value)
      return
    queueInfographicRender()
  },
)

onMounted(() => {
  if (!userToggledShowSource.value && isInfographicEnabled())
    showSource.value = false
  queueInfographicRender()
})

onBeforeUnmount(() => {
  unmounted = true
  stopDrag()
  renderGeneration += 1
  rerenderQueued = false
  rerenderForce = false
  renderScheduled = false
  renderScheduledForce = false
  viewportHandle.value?.destroy()
  viewportHandle.value = null
  clearLifecyclePending()
  if (infographicInstance) {
    infographicInstance.destroy?.()
    infographicInstance = null
  }
  lastCompletedRenderSignature = ''
  if (typeof window !== 'undefined') {
    try {
      window.removeEventListener('keydown', handleKeydown)
    }
    catch {}
  }
})

const computedButtonStyle = 'infographic-action-btn p-[var(--ms-action-btn-padding)] rounded'

const isPreviewDisabled = computed(() => !isInfographicEnabled())
const isFullscreenDisabled = computed(() => showSource.value || isCollapsed.value)
const renderMode = computed(() => {
  if (showSource.value)
    return 'fallback'
  if (hasRenderError.value)
    return 'error'
  return hasPreview.value ? 'preview' : 'pending'
})

const transformStyle = computed(() => ({
  transform: `translate(${translateX.value}px, ${translateY.value}px) scale(${zoom.value})`,
}))

// Keep modal clone in sync with transform changes
watch(
  transformStyle,
  (newStyle) => {
    if (isModalOpen.value && modalCloneWrapper.value) {
      modalCloneWrapper.value.style.transform = newStyle.transform
    }
  },
)
</script>

<template>
  <div
    ref="viewportTarget"
    class="infographic-block-container rounded-lg border overflow-hidden"
    data-markstream-infographic="1"
    :data-markstream-mode="renderMode"
    :class="[
      { 'is-rendering': props.loading, 'dark': props.isDark },
    ]"
  >
    <!-- Header -->
    <div
      v-if="props.showHeader"
      class="infographic-block-header flex justify-between items-center border-b"
    >
      <!-- Left side -->
      <div v-if="$slots['header-left']">
        <slot name="header-left" />
      </div>
      <div v-else class="flex items-center gap-x-2 overflow-hidden">
        <span class="icon-slot action-icon shrink-0" v-html="infographicIcon" />
        <span class="infographic-label font-medium font-mono truncate">Infographic</span>
      </div>

      <!-- Center - Mode toggle -->
      <div v-if="$slots['header-center']">
        <slot name="header-center" />
      </div>
      <div v-else-if="props.showModeToggle" class="infographic-mode-toggle flex items-center gap-0.5">
        <button
          class="infographic-mode-btn px-2 py-0.5 rounded transition-colors"
          :class="[!showSource ? 'is-active' : '', isPreviewDisabled ? 'opacity-50 cursor-not-allowed' : '']"
          :disabled="isPreviewDisabled"
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
          class="infographic-mode-btn px-2 py-0.5 rounded transition-colors"
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

      <!-- Right side - Action buttons -->
      <div v-if="$slots['header-right']">
        <slot name="header-right" />
      </div>
      <div v-else class="infographic-header-actions flex items-center">
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
          v-if="props.showExportButton"
          :class="`${computedButtonStyle} ${isFullscreenDisabled ? 'opacity-50 cursor-not-allowed' : ''}`"
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
          v-if="props.showFullscreenButton"
          :class="`${computedButtonStyle} ${isFullscreenDisabled ? 'opacity-50 cursor-not-allowed' : ''}`"
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

    <!-- Content area -->
    <div v-show="!isCollapsed">
      <div v-if="showSource" class="infographic-source">
        <pre class="infographic-source-code text-sm font-mono whitespace-pre-wrap">{{ baseCode }}</pre>
      </div>
      <div v-else class="relative">
        <!-- Zoom controls -->
        <div v-if="props.showZoomControls" class="absolute top-2 right-2 z-10 rounded-lg">
          <div class="flex items-center gap-2 backdrop-blur rounded-lg">
            <button
              class="infographic-action-btn p-[var(--ms-action-btn-padding)] rounded"
              @click="zoomIn"
              @mouseenter="onBtnHover($event, t('common.zoomIn') || 'Zoom in')"
              @focus="onBtnHover($event, t('common.zoomIn') || 'Zoom in')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M11 8v6m-3-3h6" /></g></svg>
            </button>
            <button
              class="infographic-action-btn p-[var(--ms-action-btn-padding)] rounded"
              @click="zoomOut"
              @mouseenter="onBtnHover($event, t('common.zoomOut') || 'Zoom out')"
              @focus="onBtnHover($event, t('common.zoomOut') || 'Zoom out')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M8 11h6" /></g></svg>
            </button>
            <button
              class="infographic-action-btn p-[var(--ms-action-btn-padding)] rounded"
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
          class="infographic-preview relative transition-all overflow-hidden block"
          :class="{ 'infographic-pan-touch': panSurfaceClaimsTouch }"
          :style="{ height: containerHeight }"
          @pointerdown="startDrag"
        >
          <pre
            v-if="!hasPreview && !hasRenderError"
            class="infographic-pending-source text-sm font-mono whitespace-pre-wrap"
          >{{ baseCode }}</pre>
          <div
            class="absolute inset-0 cursor-grab"
            :class="{ 'cursor-grabbing': isDragging }"
            :style="transformStyle"
          >
            <div
              ref="infographicContainer"
              class="w-full text-center flex items-center justify-center min-h-full"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Modal fullscreen overlay (teleported to body) -->
    <teleport to="body">
      <div class="markstream-vue" :class="{ dark: props.isDark }">
        <transition name="infographic-dialog" appear>
          <div
            v-if="isModalOpen"
            class="infographic-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
            @click.self="closeModal"
          >
            <div
              class="dialog-panel infographic-modal-panel relative w-full h-full max-w-full max-h-full rounded overflow-hidden"
            >
              <div class="absolute top-6 right-6 z-50 flex items-center gap-2">
                <button
                  class="infographic-action-btn p-[var(--ms-action-btn-padding)] rounded"
                  @click="zoomIn"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M11 8v6m-3-3h6" /></g></svg>
                </button>
                <button
                  class="infographic-action-btn p-[var(--ms-action-btn-padding)] rounded"
                  @click="zoomOut"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M8 11h6" /></g></svg>
                </button>
                <button
                  class="infographic-action-btn p-[var(--ms-action-btn-padding)] rounded"
                  @click="resetZoom"
                >
                  {{ Math.round(zoom * 100) }}%
                </button>
                <button
                  class="infographic-action-btn inline-flex items-center justify-center p-[var(--ms-action-btn-padding)] rounded"
                  @click="closeModal"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="action-icon"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div
                ref="modalContent"
                class="w-full h-full flex items-center justify-center p-4 overflow-hidden"
                :class="{ 'cursor-grab': !isDragging, 'cursor-grabbing': isDragging, 'infographic-pan-touch': panSurfaceClaimsTouch }"
                @pointerdown="startDrag"
              />
            </div>
          </div>
        </transition>
      </div>
    </teleport>
  </div>
</template>

<style scoped>
/* ── Container ── */
.infographic-block-container {
  margin: var(--ms-flow-diagram-y) 0;
  background: var(--diagram-bg);
  border-color: var(--diagram-border);
  color: hsl(var(--ms-foreground));
  box-shadow: var(--ms-shadow-subtle);
}

/* ── Header ── */
.infographic-block-header {
  padding: var(--ms-inset-panel-y) var(--ms-inset-panel-x);
  background: var(--diagram-header-bg);
  border-color: var(--diagram-border);
  color: hsl(var(--ms-foreground));
}

.infographic-label {
  font-size: var(--ms-text-label);
  color: hsl(var(--ms-muted-foreground));
}

.action-icon {
  width: var(--ms-action-btn-icon);
  height: var(--ms-action-btn-icon);
}
.icon-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.icon-slot :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

/* ── Mode toggle ── */
.infographic-mode-toggle {
  background: transparent;
}

.infographic-mode-btn {
  font-size: var(--ms-text-label);
  color: var(--code-action-fg);
  opacity: 0.6;
  transition: color 0.15s, background-color 0.15s, opacity 0.15s;
}

.infographic-mode-btn:hover {
  opacity: 0.9;
}

.infographic-mode-btn.is-active {
  background: hsl(var(--ms-foreground) / 0.08);
  color: var(--code-fg);
  opacity: 1;
}

.infographic-header-actions {
  gap: var(--ms-gap-header-actions);
}

/* ── Action buttons ── */
.infographic-action-btn {
  font-family: inherit;
  color: var(--code-action-fg);
  transition: background-color 0.15s, color 0.15s;
}

.infographic-action-btn:hover {
  background: var(--code-action-hover-bg);
  color: var(--code-action-hover-fg);
}

.infographic-action-btn:active {
  transform: scale(0.98);
}

/* ── Source view ── */
.infographic-source {
  padding: var(--ms-inset-panel-body);
  background: var(--diagram-bg);
}

.infographic-source-code {
  color: hsl(var(--ms-foreground));
}

/* ── Preview area ── */
.infographic-preview {
  background: var(--diagram-bg);
  min-height: var(--ms-size-diagram-min-height);
  transition-duration: var(--ms-duration-fast);
}

/* The pan surface takes the touch gesture instead of letting the page scroller
   claim it, which would fire pointercancel and stop the drag mid-gesture. */
.infographic-pan-touch {
  touch-action: none;
}

/* Keep the diagram fully visible and centered like the mermaid block:
   scale down proportionally inside the preview area. The flex centering
   wrapper is the .absolute inset-0 layer, which has a definite height. */
.infographic-preview :deep(svg) {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
}

.infographic-pending-source {
  position: absolute;
  inset: 0;
  z-index: 1;
  margin: 0;
  padding: var(--ms-inset-panel-body);
  overflow: auto;
  color: hsl(var(--ms-foreground));
  text-align: left;
  background: var(--diagram-bg);
}

/* ── Modal ── */
.infographic-modal-overlay {
  background: var(--modal-overlay);
}

.infographic-modal-panel {
  background: var(--modal-bg);
  color: var(--modal-fg);
  box-shadow: var(--ms-shadow-modal);
}

.fullscreen {
  width: 100%;
  max-height: 100% !important;
  height: 100% !important;
}

/* Dialog transition */
.infographic-dialog-enter-from,
.infographic-dialog-leave-to {
  opacity: 0;
}
.infographic-dialog-enter-active,
.infographic-dialog-leave-active {
  transition: opacity var(--ms-duration-overlay) var(--ms-ease-standard);
}
.infographic-dialog-enter-from .dialog-panel,
.infographic-dialog-leave-to .dialog-panel {
  transform: translateY(8px) scale(0.98);
  opacity: 0.98;
}
.infographic-dialog-enter-to .dialog-panel,
.infographic-dialog-leave-from .dialog-panel {
  transform: translateY(0) scale(1);
  opacity: 1;
}
.infographic-dialog-enter-active .dialog-panel,
.infographic-dialog-leave-active .dialog-panel {
  transition: transform var(--ms-duration-overlay) var(--ms-ease-standard), opacity var(--ms-duration-overlay) var(--ms-ease-standard);
}
</style>
