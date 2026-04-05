<script setup lang="ts">
// 定义图片节点类型
import type { ImageNodeProps } from '../../types/component-props'
import { computed, ref, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'

// 接收 props：node 是必须，其他为可选配置（fallback、是否启用 lazy）
const props = withDefaults(defineProps<ImageNodeProps>(), {
  fallbackSrc: '',
  lazy: false,
  usePlaceholder: true,
})

// 事件：load / error / click（click 用于外部处理图片预览）
const emit = defineEmits<{ (e: 'load', src: string): void, (e: 'error', src: string): void, (e: 'click', payload: [Event, string]): void }>()

// 图片加载状态
const imageLoaded = ref(false)
const hasError = ref(false)
const fallbackTried = ref(false)

// 计算当前用于渲染的 src（当有 error 且提供 fallback 时使用 fallback）
const displaySrc = computed(() => hasError.value && props.fallbackSrc ? props.fallbackSrc : props.node.src)
const useEagerImagePath = computed(() => !props.lazy)

// 处理图片加载错误：尝试一次 fallback，否则保留错误状态
function handleImageError() {
  if (props.fallbackSrc && !fallbackTried.value) {
    fallbackTried.value = true
    hasError.value = true
    // leave imageLoaded false so placeholder/spinner can show while fallback loads
  }
  else {
    hasError.value = true
    emit('error', props.node.src)
  }
}

// 处理图片加载完成
function handleImageLoad() {
  imageLoaded.value = true
  hasError.value = false
  emit('load', displaySrc.value)
}

// 当用户点击/触摸图片时（仅对已成功加载的图片有效），向外发出 click 事件（用于图片 preview）
function handleClick(e: Event) {
  // stop propagation so parent click handlers don't see both pointerup and click
  e.preventDefault()

  if (!imageLoaded.value || hasError.value)
    return
  emit('click', [e, displaySrc.value])
}

const { t } = useSafeI18n()

// When the src changes (displaySrc), reset imageLoaded so the new image can fade in
watch(displaySrc, () => {
  imageLoaded.value = false
  hasError.value = false
})
</script>

<template>
  <transition name="img-switch" mode="out-in">
    <img
      v-if="!node.loading && !hasError"
      key="image"
      :src="displaySrc"
      :alt="String(props.node.alt ?? props.node.title ?? '')"
      :title="String(props.node.title ?? props.node.alt ?? '')"
      class="image-node__img h-auto rounded-lg image-node__img--inline"
      :class="{
        'transition-opacity duration-200 ease-in-out': !useEagerImagePath,
        'opacity-0': !useEagerImagePath && !imageLoaded,
        'opacity-100': useEagerImagePath || imageLoaded,
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
      v-else-if="!hasError"
      key="placeholder"
      class="placeholder-layer placeholder-layer--inline inline-flex items-center justify-center gap-2"
    >
      <template v-if="props.usePlaceholder">
        <slot name="placeholder" :node="props.node" :display-src="displaySrc" :image-loaded="imageLoaded" :has-error="hasError" :fallback-src="props.fallbackSrc" :lazy="props.lazy">
          <div class="image-node__spinner w-4 h-4 rounded-full border-2 border-solid animate-spin" aria-hidden="true" />
          <span class="text-sm whitespace-nowrap">{{ t('image.loading') }}</span>
        </slot>
      </template>
      <template v-else>
        <span class="image-node__raw-text text-sm">{{ node.raw }}</span>
      </template>
    </span>

    <span v-else-if="!node.loading && !props.fallbackSrc" key="error" class="image-node__error image-node__error--inline px-4 py-2 flex items-center justify-center rounded-lg gap-2">
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
  will-change: transform, opacity;
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

/* Transition between placeholder and image: fade + slight upward motion */
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

/* Spinner uses semantic loading color */
.image-node__spinner {
  border-color: var(--loading-spinner);
  border-top-color: transparent;
}

/* Raw text (when placeholder is disabled) uses muted foreground */
.image-node__raw-text {
  color: hsl(var(--ms-muted-foreground));
}

/* Error state uses semantic destructive color and placeholder background */
.image-node__error {
  background-color: var(--image-placeholder-bg);
  color: hsl(var(--ms-destructive));
}

/* Respect user preference for reduced motion */
@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none !important; }
  .img-switch-enter-active, .img-switch-leave-active { transition: none !important; }
}
</style>
