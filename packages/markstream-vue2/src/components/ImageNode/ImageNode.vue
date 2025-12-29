<script setup lang="ts">
// 定义图片节点类型
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSafeI18n } from '../../composables/useSafeI18n'

import { useViewportPriority } from '../../composables/viewportPriority'

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
  showCaption?: boolean
  lazy?: boolean
  svgMinHeight?: string
  usePlaceholder?: boolean
}

// 接收props：node 是必须，其他为可选配置（fallback、是否显示caption、是否启用lazy）
const props = withDefaults(defineProps<ImageNodeProps>(), {
  fallbackSrc: '',
  showCaption: false,
  lazy: true,
  svgMinHeight: '12rem',
  usePlaceholder: true,
})

// 事件：load / error / click（click 用于外部处理图片预览）
const emit = defineEmits<{ (e: 'load', src: string): void, (e: 'error', src: string): void, (e: 'click', payload: [Event, string]): void }>()

// 图片加载状态
const imageLoaded = ref(false)
const hasError = ref(false)
const fallbackTried = ref(false)
const figureRef = ref<HTMLElement | null>(null)
const registerVisibility = useViewportPriority()
let visibilityHandle: ReturnType<typeof registerVisibility> | null = null
const isVisible = ref(typeof window === 'undefined')

if (typeof window !== 'undefined') {
  watch(
    () => figureRef.value,
    (el) => {
      visibilityHandle?.destroy()
      visibilityHandle = null
      if (!el) {
        isVisible.value = false
        return
      }
      const handle = registerVisibility(el, { rootMargin: '400px' })
      visibilityHandle = handle
      isVisible.value = handle.isVisible.value
      handle.whenVisible.then(() => {
        isVisible.value = true
      })
    },
    { immediate: true },
  )
}

onBeforeUnmount(() => {
  visibilityHandle?.destroy()
  visibilityHandle = null
})

// 计算当前用于渲染的 src（当有 error 且提供 fallback 时使用 fallback）
const displaySrc = computed(() => hasError.value && props.fallbackSrc ? props.fallbackSrc : props.node.src)
const canRenderImage = computed(() => !props.lazy || isVisible.value)

// 是否为 svg 文件（可能没有内置尺寸）
const isSvg = computed(() => /\.svg(?:\?|$)/i.test(displaySrc.value))

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
  <figure ref="figureRef" class="text-center my-8">
    <div class="relative inline-block">
      <!-- 包裹条件渲染元素，启用 out-in 模式以在替换时做平滑过渡 -->
      <transition name="img-switch" mode="out-in">
        <!-- 图片展示区域：当有错误且没有 fallback 时显示占位符 -->
        <img
          v-if="!node.loading && !hasError && canRenderImage"
          key="image"
          :src="displaySrc"
          :alt="String(props.node.alt ?? props.node.title ?? '')"
          :title="String(props.node.title ?? props.node.alt ?? '')"
          class="max-w-96 h-auto rounded-lg transition-opacity duration-200 ease-in-out"
          :style="isSvg ? { minHeight: props.svgMinHeight, width: '100%', height: 'auto', objectFit: 'contain' } : undefined"
          :class="{ 'opacity-0': !imageLoaded, 'opacity-100': imageLoaded, 'cursor-pointer': imageLoaded }"
          :loading="props.lazy ? 'lazy' : 'eager'"
          decoding="async"
          :tabindex="imageLoaded ? 0 : -1"
          :aria-label="props.node.alt ?? t('image.preview')"
          @error="handleImageError"
          @load="handleImageLoad"
          @click="handleClick"
        >

        <!-- 加载时的简单占位/骨架；允许通过 usePlaceholder 关闭占位展示，改为纯文本 -->
        <div
          v-else-if="!hasError"
          key="placeholder"
          class="placeholder-layer max-w-96 inline-flex items-center justify-center gap-2"
          :style="isSvg ? { minHeight: props.svgMinHeight, width: '100%' } : { minHeight: '6rem' }"
        >
          <template v-if="props.usePlaceholder">
            <slot name="placeholder" :node="props.node" :display-src="displaySrc" :image-loaded="imageLoaded" :has-error="hasError" :fallback-src="props.fallbackSrc" :lazy="props.lazy" :is-svg="isSvg">
              <div class="w-4 h-4 rounded-full border-2 border-solid border-current border-t-transparent animate-spin" aria-hidden="true" />
              <span class="text-sm whitespace-nowrap">{{ t('image.loading') }}</span>
            </slot>
          </template>
          <template v-else>
            <!-- 如果禁用占位符，展示一行可替换的文本（slot 仍可被 error slot 覆盖） -->
            <span class="text-sm text-gray-500">{{ node.raw }}</span>
          </template>
        </div>

        <!-- 无法加载且没有提供 fallback 的错误占位 -->
        <div v-else-if="!node.loading && !props.fallbackSrc" key="error" class="px-4 py-2 bg-gray-100 flex items-center justify-center rounded-lg gap-2 text-red-500">
          <slot name="error" :node="props.node" :display-src="displaySrc" :image-loaded="imageLoaded" :has-error="hasError" :fallback-src="props.fallbackSrc" :lazy="props.lazy" :is-svg="isSvg">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><!-- Icon from TDesign Icons by TDesign - https://github.com/Tencent/tdesign-icons/blob/main/LICENSE --><path fill="currentColor" d="M2 2h20v10h-2V4H4v9.586l5-5L14.414 14L13 15.414l-4-4l-5 5V20h8v2H2zm13.547 5a1 1 0 1 0 0 2a1 1 0 0 0 0-2m-3 1a3 3 0 1 1 6 0a3 3 0 0 1-6 0m3.625 6.757L19 17.586l2.828-2.829l1.415 1.415L20.414 19l2.829 2.828l-1.415 1.415L19 20.414l-2.828 2.829l-1.415-1.415L17.586 19l-2.829-2.828z" /></svg>
            <span class="text-sm whitespace-nowrap">{{ t('image.loadError') }}</span>
          </slot>
        </div>
      </transition>
    </div>

    <figcaption v-if="props.showCaption && props.node.alt" class="mt-2 text-sm text-gray-500 italic">
      {{ props.node.alt }}
    </figcaption>
  </figure>
</template>

<style scoped>
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

/* Spinner styles using CSS animations to leverage compositor */
.placeholder-layer {
  will-change: transform, opacity;
}

/* Respect user preference for reduced motion */
@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none !important; }
  .img-switch-enter-active, .img-switch-leave-active { transition: none !important; }
}
</style>
