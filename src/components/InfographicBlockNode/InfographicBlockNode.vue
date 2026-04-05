<script setup lang="ts">
import type { InfographicBlockNodeProps } from '../../types/component-props'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { useViewportPriority } from '../../composables/viewportPriority'
import infographicIconUrl from '../../icon/infographic.svg?url'
import { getInfographic } from './infographic'

const props = withDefaults(
  defineProps<InfographicBlockNodeProps>(),
  {
    maxHeight: '500px',
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

const copyText = ref(false)
const isCollapsed = ref(false)
const viewportTarget = ref<HTMLElement>()
const infographicContainer = ref<HTMLElement>()
const showSource = ref(true)
const userToggledShowSource = ref(false)
const containerHeight = ref<string>('360px')
const isModalOpen = ref(false)
const modalContent = ref<HTMLElement>()
const modalCloneWrapper = ref<HTMLElement | null>(null)
const hasPreview = ref(false)
const viewportHandle = ref<ReturnType<typeof registerViewport> | null>(null)
const viewportReady = ref(typeof window === 'undefined')

if (typeof window !== 'undefined') {
  watch(
    () => viewportTarget.value,
    (el) => {
      viewportHandle.value?.destroy()
      viewportHandle.value = null
      if (!el) {
        viewportReady.value = false
        return
      }
      const handle = registerViewport(el, { rootMargin: '160px' })
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
  if (!props.maxHeight || props.maxHeight === 'none')
    return `${actualHeight}px`

  const maxHeight = Number.parseFloat(String(props.maxHeight))
  if (!Number.isFinite(maxHeight))
    return `${actualHeight}px`

  return `${Math.min(actualHeight, maxHeight)}px`
}

function updateContainerHeight() {
  if (!infographicContainer.value)
    return

  const actualHeight = infographicContainer.value.scrollHeight
  if (actualHeight > 0)
    containerHeight.value = resolveContainerHeight(actualHeight)
}

// Zoom state
const zoom = ref(1)
const translateX = ref(0)
const translateY = ref(0)
const isDragging = ref(false)
const dragStart = ref({ x: 0, y: 0 })

const baseCode = computed(() => props.node.code)
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

let infographicInstance: any | null = null
let renderInFlight = false
let rerenderQueued = false
let rerenderForce = false
let lastCompletedRenderSignature = ''

async function renderInfographic(force = false) {
  if (!viewportReady.value)
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

  renderInFlight = true

  try {
    const InfographicClass = await getInfographic()
    if (!InfographicClass) {
      console.warn('Infographic library failed to load.')
      return
    }

    // Clear previous instance
    if (infographicInstance) {
      infographicInstance.destroy?.()
      infographicInstance = null
    }

    // Clear container
    infographicContainer.value.innerHTML = ''

    // Create new instance
    infographicInstance = new InfographicClass({
      container: infographicContainer.value,
      width: '100%',
      height: '100%',
    })

    // Render the syntax
    infographicInstance.render(baseCode.value)
    hasPreview.value = true
    lastCompletedRenderSignature = signature

    // Update container height after render
    nextTick(() => {
      updateContainerHeight()
    })
  }
  catch (error) {
    console.error('Failed to render infographic:', error)
    hasPreview.value = false
    lastCompletedRenderSignature = ''
    if (infographicContainer.value) {
      infographicContainer.value.innerHTML = `<div class="p-4" style="color: hsl(var(--ms-destructive))">Failed to render infographic: ${error instanceof Error ? error.message : 'Unknown error'}</div>`
    }
  }
  finally {
    renderInFlight = false
    if (rerenderQueued) {
      const forceNext = rerenderForce
      rerenderQueued = false
      rerenderForce = false
      nextTick(() => {
        void renderInfographic(forceNext)
      })
    }
  }
}

function queueInfographicRender(force = false) {
  if (!viewportReady.value || showSource.value || isCollapsed.value)
    return
  nextTick(() => {
    void renderInfographic(force)
  })
}

// Watch for code changes
watch(
  () => baseCode.value,
  () => {
    queueInfographicRender(true)
  },
)

// Watch for mode changes
watch(
  () => showSource.value,
  (isSource) => {
    if (!isSource)
      queueInfographicRender()
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
  () => viewportReady.value,
  (ready) => {
    if (!ready || showSource.value || isCollapsed.value)
      return
    queueInfographicRender()
  },
)

onMounted(() => {
  if (!userToggledShowSource.value)
    showSource.value = false
  queueInfographicRender()
})

onBeforeUnmount(() => {
  viewportHandle.value?.destroy()
  viewportHandle.value = null
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

const computedButtonStyle = 'infographic-action-btn p-2 text-xs rounded'

const isFullscreenDisabled = computed(() => showSource.value || isCollapsed.value)
const renderMode = computed(() => {
  if (showSource.value)
    return 'fallback'
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
    class="infographic-block-container my-4 rounded-lg border overflow-hidden shadow-sm"
    data-markstream-infographic="1"
    :data-markstream-mode="renderMode"
    :class="[
      { 'is-rendering': props.loading },
    ]"
  >
    <!-- Header -->
    <div
      v-if="props.showHeader"
      class="infographic-block-header flex justify-between items-center px-4 py-2.5 border-b"
    >
      <!-- Left side -->
      <div v-if="$slots['header-left']">
        <slot name="header-left" />
      </div>
      <div v-else class="flex items-center gap-x-2 overflow-hidden">
        <img :src="infographicIconUrl" class="w-4 h-4 my-0" alt="Infographic">
        <span class="infographic-label text-sm font-medium font-mono truncate">Infographic</span>
      </div>

      <!-- Center - Mode toggle -->
      <div v-if="$slots['header-center']">
        <slot name="header-center" />
      </div>
      <div v-else-if="props.showModeToggle" class="infographic-mode-toggle flex items-center gap-x-1 rounded-md p-0.5">
        <button
          class="infographic-mode-btn px-2.5 py-1 text-xs rounded transition-colors"
          :class="[!showSource ? 'is-active' : '']"
          @click="() => handleSwitchMode('preview')"
          @mouseenter="onBtnHover($event, t('common.preview') || 'Preview')"
          @focus="onBtnHover($event, t('common.preview') || 'Preview')"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <div class="flex items-center gap-x-1">
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M2.062 12.348a1 1 0 0 1 0-.696a10.75 10.75 0 0 1 19.876 0a1 1 0 0 1 0 .696a10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></g></svg>
            <span>{{ t('common.preview') || 'Preview' }}</span>
          </div>
        </button>
        <button
          class="infographic-mode-btn px-2.5 py-1 text-xs rounded transition-colors"
          :class="[showSource ? 'is-active' : '']"
          @click="() => handleSwitchMode('source')"
          @mouseenter="onBtnHover($event, t('common.source') || 'Source')"
          @focus="onBtnHover($event, t('common.source') || 'Source')"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <div class="flex items-center gap-x-1">
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16 18l6-6l-6-6M8 6l-6 6l6 6" /></svg>
            <span>{{ t('common.source') || 'Source' }}</span>
          </div>
        </button>
      </div>

      <!-- Right side - Action buttons -->
      <div v-if="$slots['header-right']">
        <slot name="header-right" />
      </div>
      <div v-else class="flex items-center gap-x-1">
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
          v-if="props.showExportButton"
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
          v-if="props.showFullscreenButton"
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

    <!-- Content area -->
    <div v-show="!isCollapsed">
      <div v-if="showSource" class="infographic-source p-4">
        <pre class="infographic-source-code text-sm font-mono whitespace-pre-wrap">{{ baseCode }}</pre>
      </div>
      <div v-else class="relative">
        <!-- Zoom controls -->
        <div v-if="props.showZoomControls" class="absolute top-2 right-2 z-10 rounded-lg">
          <div class="flex items-center gap-2 backdrop-blur rounded-lg">
            <button
              class="infographic-action-btn p-2 text-xs rounded"
              @click="zoomIn"
              @mouseenter="onBtnHover($event, t('common.zoomIn') || 'Zoom in')"
              @focus="onBtnHover($event, t('common.zoomIn') || 'Zoom in')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M11 8v6m-3-3h6" /></g></svg>
            </button>
            <button
              class="infographic-action-btn p-2 text-xs rounded"
              @click="zoomOut"
              @mouseenter="onBtnHover($event, t('common.zoomOut') || 'Zoom out')"
              @focus="onBtnHover($event, t('common.zoomOut') || 'Zoom out')"
              @mouseleave="onBtnLeave"
              @blur="onBtnLeave"
            >
              <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M8 11h6" /></g></svg>
            </button>
            <button
              class="infographic-action-btn p-2 text-xs rounded"
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
          class="infographic-preview min-h-[360px] relative transition-all duration-100 overflow-hidden block"
          :style="{ height: containerHeight }"
          @mousedown="startDrag"
          @mousemove="onDrag"
          @mouseup="stopDrag"
          @mouseleave="stopDrag"
          @touchstart.passive="startDrag"
          @touchmove.passive="onDrag"
          @touchend.passive="stopDrag"
        >
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
      <div class="markstream-vue">
        <transition name="infographic-dialog" appear>
          <div
            v-if="isModalOpen"
            class="infographic-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
            @click.self="closeModal"
          >
            <div
              class="dialog-panel infographic-modal-panel relative w-full h-full max-w-full max-h-full rounded shadow-lg overflow-hidden"
            >
              <div class="absolute top-6 right-6 z-50 flex items-center gap-2">
                <button
                  class="infographic-action-btn p-2 text-xs rounded"
                  @click="zoomIn"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M11 8v6m-3-3h6" /></g></svg>
                </button>
                <button
                  class="infographic-action-btn p-2 text-xs rounded"
                  @click="zoomOut"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="11" cy="11" r="8" /><path d="m21 21l-4.35-4.35M8 11h6" /></g></svg>
                </button>
                <button
                  class="infographic-action-btn p-2 text-xs rounded"
                  @click="resetZoom"
                >
                  {{ Math.round(zoom * 100) }}%
                </button>
                <button
                  class="infographic-action-btn inline-flex items-center justify-center p-2 rounded"
                  @click="closeModal"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div
                ref="modalContent"
                class="w-full h-full flex items-center justify-center p-4 overflow-hidden"
                :class="{ 'cursor-grab': !isDragging, 'cursor-grabbing': isDragging }"
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
</template>

<style scoped>
/* ── Container ── */
.infographic-block-container {
  background: var(--diagram-bg);
  border-color: var(--diagram-border);
  color: hsl(var(--ms-foreground));
}

/* ── Header ── */
.infographic-block-header {
  background: var(--diagram-header-bg);
  border-color: var(--diagram-border);
  color: hsl(var(--ms-foreground));
}

.infographic-label {
  color: hsl(var(--ms-muted-foreground));
}

/* ── Mode toggle pill ── */
.infographic-mode-toggle {
  background: hsl(var(--ms-secondary));
}

.infographic-mode-btn {
  color: var(--code-action-fg);
  transition: color 0.15s, background-color 0.15s;
}

.infographic-mode-btn.is-active {
  background: var(--code-action-active-bg);
  color: var(--code-action-active-fg);
  box-shadow: 0 1px 2px 0 hsl(var(--ms-foreground) / 0.05);
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
  background: var(--diagram-bg);
}

.infographic-source-code {
  color: hsl(var(--ms-foreground));
}

/* ── Preview area ── */
.infographic-preview {
  background: var(--diagram-bg);
}

/* ── Modal ── */
.infographic-modal-overlay {
  background: var(--modal-overlay);
}

.infographic-modal-panel {
  background: var(--modal-bg);
  color: var(--modal-fg);
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
  transition: opacity 200ms ease;
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
  transition: transform 200ms ease, opacity 200ms ease;
}
</style>
