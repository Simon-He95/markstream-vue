<script setup lang="ts">
import { sanitizeImageSrc } from 'stream-markdown-parser'
import { computed, ref, watch } from 'vue-demi'
import { useSafeI18n } from '../../composables/useSafeI18n'

interface ImageNodeProps {
  node: {
    type: 'image'
    src: string
    alt: string
    title: string | null
    raw: string
    loading?: boolean
  }
  fallbackSrc?: string
  lazy?: boolean
  usePlaceholder?: boolean
}

const props = withDefaults(defineProps<ImageNodeProps>(), {
  fallbackSrc: '',
  lazy: true,
  usePlaceholder: true,
})

const emit = defineEmits<{ (e: 'load', src: string): void, (e: 'error', src: string): void, (e: 'click', payload: [Event, string]): void }>()

const imageLoaded = ref(false)
const hasError = ref(false)
const activeSrc = ref('')
const imageStage = ref<'primary' | 'fallback' | 'failed'>('primary')
const safeNodeSrc = computed(() => sanitizeImageSrc(props.node.src))
const safeFallbackSrc = computed(() => sanitizeImageSrc(props.fallbackSrc))
const displaySrc = computed(() => activeSrc.value)
const showImage = computed(() => !props.node.loading && imageStage.value !== 'failed' && activeSrc.value.length > 0)
const showError = computed(() => !props.node.loading && imageStage.value === 'failed')

function handleImageError() {
  if (imageStage.value === 'primary' && safeFallbackSrc.value && safeFallbackSrc.value !== activeSrc.value) {
    imageStage.value = 'fallback'
    activeSrc.value = safeFallbackSrc.value
    imageLoaded.value = false
    hasError.value = false
    return
  }

  imageStage.value = 'failed'
  hasError.value = true
  emit('error', activeSrc.value)
}

function handleImageLoad() {
  imageLoaded.value = true
  hasError.value = false
  emit('load', displaySrc.value)
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
</script>

<template>
  <transition name="img-switch" mode="out-in">
    <img
      v-if="showImage"
      key="image"
      :src="displaySrc"
      :alt="String(props.node.alt ?? props.node.title ?? '')"
      :title="String(props.node.title ?? props.node.alt ?? '')"
      class="image-node__img h-auto rounded-lg transition-opacity duration-200 ease-in-out image-node__img--inline"
      :class="{
        'opacity-0': !imageLoaded,
        'opacity-100': imageLoaded,
        'cursor-pointer': imageLoaded,
      }"
      :loading="props.lazy ? 'lazy' : 'eager'"
      decoding="async"
      :tabindex="imageLoaded ? 0 : -1"
      :aria-label="props.node.alt ?? t('image.preview')"
      @error="handleImageError"
      @load="handleImageLoad"
      @click="handleClick"
    >

    <span
      v-else-if="node.loading && !hasError"
      key="placeholder"
      class="placeholder-layer placeholder-layer--inline inline-flex items-center justify-center gap-2"
    >
      <template v-if="props.usePlaceholder">
        <slot name="placeholder" :node="props.node" :display-src="displaySrc" :image-loaded="imageLoaded" :has-error="hasError" :fallback-src="props.fallbackSrc" :lazy="props.lazy">
          <div class="w-4 h-4 rounded-full border-2 border-solid border-current border-t-transparent animate-spin" aria-hidden="true" />
          <span class="text-sm whitespace-nowrap">{{ t('image.loading') }}</span>
        </slot>
      </template>
      <template v-else>
        <span class="text-sm text-gray-500">{{ node.raw }}</span>
      </template>
    </span>

    <span v-else-if="showError" key="error" class="image-node__error image-node__error--inline px-4 py-2 bg-gray-100 flex items-center justify-center rounded-lg gap-2 text-red-500">
      <slot name="error" :node="props.node" :display-src="displaySrc" :image-loaded="imageLoaded" :has-error="hasError" :fallback-src="props.fallbackSrc" :lazy="props.lazy">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><!-- Icon from TDesign Icons by TDesign - https://github.com/Tencent/tdesign-icons/blob/main/LICENSE --><path fill="currentColor" d="M2 2h20v10h-2V4H4v9.586l5-5L14.414 14L13 15.414l-4-4l-5 5V20h8v2H2zm13.547 5a1 1 0 1 0 0 2a1 1 0 0 0 0-2m-3 1a3 3 0 1 1 6 0a3 3 0 0 1-6 0m3.625 6.757L19 17.586l2.828-2.829l1.415 1.415L20.414 19l2.829 2.828l-1.415 1.415L19 20.414l-2.828 2.829l-1.415-1.415L17.586 19l-2.829-2.828z" /></svg>
        <span class="text-sm whitespace-nowrap">{{ t('image.loadError') }}</span>
      </slot>
    </span>
  </transition>
</template>

<style scoped>
.image-node__img {
  max-width: 24rem;
}

.placeholder-layer {
  max-width: 24rem;
}

.image-node__img--inline {
  min-height: 0 !important;
  width: auto !important;
  height: auto !important;
  object-fit: initial !important;
  display: inline-block;
  vertical-align: middle;
}

.placeholder-layer--inline {
  min-height: auto !important;
}

.image-node__error--inline {
  display: inline-flex;
  vertical-align: middle;
}

.img-switch-enter-active, .img-switch-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}
.img-switch-enter-from, .img-switch-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
.img-switch-enter-to, .img-switch-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.placeholder-layer {
  will-change: transform, opacity;
}

@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none !important; }
  .img-switch-enter-active, .img-switch-leave-active { transition: none !important; }
}
</style>
