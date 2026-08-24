<script setup lang="ts">
import type { ImageNodeProps } from '../../types/component-props'
import { sanitizeImageSrc } from 'stream-markdown-parser'
import { computed, getCurrentInstance, inject, nextTick, onBeforeUnmount, ref, shallowRef, useAttrs, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'
import { DEFAULT_VIEWPORT_PRIORITY_ROOT_MARGIN, useOffscreenHeavyNodeDeferral, useViewportPriority, useViewportPriorityOptions } from '../../composables/viewportPriority'
import { resolveLifecycleIndexKey } from '../../utils/lifecycleIndexKey'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../../utils/nodeLifecycle'

const props = withDefaults(defineProps<ImageNodeProps>(), {
  fallbackSrc: '',
  lazy: false,
  usePlaceholder: true,
})

const emit = defineEmits<{ (e: 'load', src: string): void, (e: 'error', src: string): void, (e: 'click', payload: [Event, string]): void }>()

const IMAGE_LIFECYCLE_PENDING_TIMEOUT_MS = 8000

const imageLoaded = ref(false)
const hasError = ref(false)
const activeSrc = ref('')
const imageStage = ref<'primary' | 'fallback' | 'failed'>('primary')
const rootRef = ref<HTMLElement | null>(null)
const attrs = useAttrs()
const lifecycle = inject(MARKSTREAM_NODE_LIFECYCLE_KEY, null)
const registerViewport = useViewportPriority()
const viewportPriorityOptions = useViewportPriorityOptions()
const offscreenHeavyNodeDeferral = useOffscreenHeavyNodeDeferral()
const safeNodeSrc = computed(() => sanitizeImageSrc(props.node.src))
const safeFallbackSrc = computed(() => sanitizeImageSrc(props.fallbackSrc))
const existingImage = getCurrentInstance()?.vnode.el?.querySelector?.('img')
const hydratedFromServer = typeof window !== 'undefined'
  && existingImage?.getAttribute('src') === (safeNodeSrc.value || safeFallbackSrc.value)
const viewportReady = ref(
  typeof window === 'undefined'
  || hydratedFromServer
  || !offscreenHeavyNodeDeferral.value,
)
const viewportHandle = shallowRef<ReturnType<typeof registerViewport> | null>(null)
let lifecyclePendingIndexKey = ''
let lifecyclePendingTimer: ReturnType<typeof setTimeout> | null = null

const displaySrc = computed(() => activeSrc.value)
const useEagerImagePath = computed(() => !props.lazy)
const shouldDeferImageRequest = computed(() =>
  typeof window !== 'undefined'
  && offscreenHeavyNodeDeferral.value
  && !hydratedFromServer,
)
const imageRequestActive = computed(() => !shouldDeferImageRequest.value || viewportReady.value)
const requestedSrc = computed(() => imageRequestActive.value ? displaySrc.value : '')
const viewportRootMargin = computed(() => viewportPriorityOptions?.value.heavyBlockMargin
  ?? viewportPriorityOptions?.value.rootMargin
  ?? DEFAULT_VIEWPORT_PRIORITY_ROOT_MARGIN)

const showImage = computed(() => !props.node.loading && imageStage.value !== 'failed' && activeSrc.value.length > 0)
const showError = computed(() => imageStage.value === 'failed')

// Shimmer overlay while waiting to enter viewport or finish downloading.
const showShimmer = computed(() => (
  !useEagerImagePath.value
  || (shouldDeferImageRequest.value && !viewportReady.value)
) && !imageLoaded.value && !hasError.value && imageStage.value !== 'failed' && activeSrc.value.length > 0)
const lifecycleIndexKey = computed(() => {
  return resolveLifecycleIndexKey(props, attrs)
})

function reportLifecycleHeight(indexKey = lifecycleIndexKey.value) {
  if (!indexKey || !rootRef.value)
    return
  lifecycle?.reportHeight(indexKey, rootRef.value.offsetHeight)
}

function scheduleLifecycleHeightReport(indexKey = lifecycleIndexKey.value) {
  if (!indexKey)
    return

  void nextTick(() => {
    reportLifecycleHeight(indexKey)
  })
}

function clearLifecyclePendingTimer() {
  if (!lifecyclePendingTimer)
    return

  clearTimeout(lifecyclePendingTimer)
  lifecyclePendingTimer = null
}

function markLifecyclePending() {
  const indexKey = lifecycleIndexKey.value
  if (!indexKey)
    return

  if (lifecyclePendingIndexKey === indexKey)
    return

  if (lifecyclePendingIndexKey)
    lifecycle?.markSettled(lifecyclePendingIndexKey)

  clearLifecyclePendingTimer()

  lifecyclePendingIndexKey = indexKey
  lifecycle?.markPending(indexKey)

  if (typeof window !== 'undefined') {
    lifecyclePendingTimer = window.setTimeout(() => {
      if (lifecyclePendingIndexKey !== indexKey)
        return

      scheduleLifecycleHeightReport(indexKey)
      void markLifecycleSettled()
    }, IMAGE_LIFECYCLE_PENDING_TIMEOUT_MS)
  }
}

async function markLifecycleSettled() {
  const indexKey = lifecyclePendingIndexKey
  if (!indexKey)
    return

  clearLifecyclePendingTimer()

  lifecyclePendingIndexKey = ''
  await nextTick()
  reportLifecycleHeight(indexKey)
  lifecycle?.markSettled(indexKey)
}

function clearLifecyclePending() {
  const indexKey = lifecyclePendingIndexKey
  if (!indexKey)
    return

  clearLifecyclePendingTimer()

  lifecyclePendingIndexKey = ''
  lifecycle?.markSettled(indexKey)
}

function handleImageError() {
  if (imageStage.value === 'primary' && safeFallbackSrc.value && safeFallbackSrc.value !== activeSrc.value) {
    imageStage.value = 'fallback'
    activeSrc.value = safeFallbackSrc.value
    imageLoaded.value = false
    hasError.value = false
    scheduleLifecycleHeightReport()
    return
  }

  imageStage.value = 'failed'
  hasError.value = true
  emit('error', activeSrc.value)
  scheduleLifecycleHeightReport()
}

function handleImageLoad() {
  imageLoaded.value = true
  hasError.value = false
  emit('load', displaySrc.value)
  scheduleLifecycleHeightReport()
}

function handleClick(e: Event) {
  e.preventDefault()
  if (!imageLoaded.value || hasError.value)
    return
  emit('click', [e, displaySrc.value])
}

const { t } = useSafeI18n()

watch(
  [safeNodeSrc, safeFallbackSrc, () => props.node.loading],
  () => {
    imageLoaded.value = false
    hasError.value = false

    if (props.node.loading) {
      activeSrc.value = safeNodeSrc.value
      imageStage.value = 'primary'
      return
    }

    if (safeNodeSrc.value) {
      activeSrc.value = safeNodeSrc.value
      imageStage.value = 'primary'
      return
    }

    if (safeFallbackSrc.value) {
      activeSrc.value = safeFallbackSrc.value
      imageStage.value = 'fallback'
      return
    }

    activeSrc.value = ''
    imageStage.value = 'failed'
    hasError.value = true
  },
  { immediate: true },
)

if (typeof window !== 'undefined') {
  watch(
    [rootRef, shouldDeferImageRequest],
    ([el, shouldDefer], _previous, onCleanup) => {
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
      const handle = registerViewport(el, {
        rootMargin: viewportRootMargin.value,
        allowIdle: false,
      })
      viewportHandle.value = handle
      viewportReady.value = handle.isVisible.value
      handle.whenVisible.then(() => {
        if (active && viewportHandle.value === handle)
          viewportReady.value = true
      })

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

watch(
  [showImage, imageLoaded, hasError, displaySrc, () => props.lazy, imageRequestActive],
  ([visible, loaded, error, src, lazy, requestActive]) => {
    if (!visible || !src || error || !requestActive) {
      void markLifecycleSettled()
      scheduleLifecycleHeightReport()
      return
    }

    if (loaded) {
      void markLifecycleSettled()
      scheduleLifecycleHeightReport()
      return
    }

    if (lazy) {
      markLifecyclePending()
      scheduleLifecycleHeightReport()
      return
    }

    if (!loaded && !error)
      markLifecyclePending()
  },
  { flush: 'post', immediate: true },
)

onBeforeUnmount(() => {
  viewportHandle.value?.destroy()
  viewportHandle.value = null
  clearLifecyclePending()
})
</script>

<template>
  <span
    ref="rootRef"
    class="image-node-container"
    :data-markstream-viewport-pending="shouldDeferImageRequest && !viewportReady ? 'true' : undefined"
  >
    <img
      v-if="showImage"
      :src="requestedSrc || undefined"
      :alt="String(props.node.alt ?? props.node.title ?? '')"
      :title="String(props.node.title ?? props.node.alt ?? '')"
      class="image-node__img"
      :class="{
        'is-loading': !useEagerImagePath && !imageLoaded,
        'is-loaded': useEagerImagePath || imageLoaded,
        'has-natural-size': imageLoaded,
        'cursor-pointer': imageLoaded,
      }"
      :loading="props.lazy ? 'lazy' : undefined"
      :fetchpriority="useEagerImagePath ? 'high' : undefined"
      :decoding="useEagerImagePath ? 'sync' : 'async'"
      :tabindex="imageLoaded ? 0 : -1"
      :aria-label="props.node.alt ?? t('image.preview')"
      @error="handleImageError"
      @load="handleImageLoad"
      @click="handleClick"
    >

    <span
      v-if="node.loading && !hasError"
      class="image-placeholder"
    >
      <template v-if="props.usePlaceholder">
        <slot name="placeholder" :node="props.node" :display-src="displaySrc" :image-loaded="imageLoaded" :has-error="hasError" :fallback-src="props.fallbackSrc" :lazy="props.lazy">
          <span class="image-shimmer" />
        </slot>
      </template>
      <template v-else>
        <span class="image-node__raw-text">{{ node.raw }}</span>
      </template>
    </span>

    <span
      v-if="showShimmer && !node.loading"
      class="image-shimmer-overlay"
    >
      <template v-if="props.usePlaceholder">
        <slot name="placeholder" :node="props.node" :display-src="displaySrc" :image-loaded="imageLoaded" :has-error="hasError" :fallback-src="props.fallbackSrc" :lazy="props.lazy">
          <span class="image-shimmer" />
        </slot>
      </template>
      <template v-else>
        <span class="image-node__raw-text">{{ node.raw }}</span>
      </template>
    </span>

    <span v-if="showError" class="image-error">
      <slot name="error" :node="props.node" :display-src="displaySrc" :image-loaded="imageLoaded" :has-error="hasError" :fallback-src="props.fallbackSrc" :lazy="props.lazy">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M2 2h20v10h-2V4H4v9.586l5-5L14.414 14L13 15.414l-4-4l-5 5V20h8v2H2zm13.547 5a1 1 0 1 0 0 2a1 1 0 0 0 0-2m-3 1a3 3 0 1 1 6 0a3 3 0 0 1-6 0m3.625 6.757L19 17.586l2.828-2.829l1.415 1.415L20.414 19l2.829 2.828l-1.415 1.415L19 20.414l-2.828 2.829l-1.415-1.415L17.586 19l-2.829-2.828z" /></svg>
        <span>{{ t('image.loadError') }}</span>
      </slot>
    </span>
  </span>
</template>

<style scoped>
.image-node-container {
  display: inline-block;
  position: relative;
  vertical-align: middle;
  max-width: var(--ms-size-image-max-width);
}

.image-node__img {
  display: inline-block;
  max-width: 100%;
  min-width: var(--ms-size-image-min-width);
  min-height: var(--ms-size-image-min-height);
  height: auto;
  vertical-align: middle;
  transition: opacity var(--ms-duration-emphasis) var(--ms-ease-standard);
}

.image-node__img.is-loading {
  opacity: 0;
}

.image-node__img.is-loaded {
  opacity: 1;
}

.image-node__img.has-natural-size {
  min-width: 0;
  min-height: 0;
}

.image-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: var(--ms-size-image-min-width);
  min-height: 8rem;
  max-width: var(--ms-size-image-max-width);
  background: hsl(var(--ms-muted));
  overflow: hidden;
  vertical-align: middle;
}

.image-shimmer-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--ms-muted));
  overflow: hidden;
}

.image-shimmer-overlay .image-shimmer {
  width: 100%;
  height: 100%;
}

.image-shimmer {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  min-height: 8rem;
  overflow: hidden;
  background: hsl(var(--ms-muted));
}

.image-shimmer::before {
  content: '';
  position: absolute;
  inset-block: 0;
  left: -200%;
  width: 300%;
  background: linear-gradient(
    90deg,
    hsl(var(--ms-muted)) 0%,
    hsl(var(--ms-muted-foreground) / 0.06) 50%,
    hsl(var(--ms-muted)) 100%
  );
  background-position: 100% 0;
  background-size: 66.6667% 100%;
  animation: image-shimmer 1.5s ease-in-out infinite;
}

.image-node-container[data-markstream-viewport-pending='true'] .image-shimmer::before {
  animation: none;
}

@keyframes image-shimmer {
  from { transform: translateX(0); }
  to { transform: translateX(66.6667%); }
}

.image-error {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  min-height: 4rem;
  max-width: var(--ms-size-image-max-width);
  background: hsl(var(--ms-muted));
  color: hsl(var(--ms-muted-foreground));
  font-size: var(--ms-text-label);
  vertical-align: middle;
}

.image-node__raw-text {
  font-size: var(--ms-text-label);
  color: hsl(var(--ms-muted-foreground));
}

@media (prefers-reduced-motion: reduce) {
  .image-shimmer::before { animation: none !important; }
}
</style>
