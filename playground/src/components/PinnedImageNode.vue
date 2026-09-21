<script setup lang="ts">
import { sanitizeImageSrc } from 'stream-markdown-parser'
import { computed, ref } from 'vue'
import { useSafeI18n } from '../../../src/composables/useSafeI18n'

/**
 * Playground image node for issue #766.
 *
 * The built-in demo streams `![Vue Logo](https://vuejs.org/images/logo.png)`.
 * The default `ImageNode` reserves the 8rem placeholder and then swaps to the
 * image's natural size, so the node grows 128px -> 384px in one step while the
 * reader is pinned to the bottom — that is what "the playground jumps" looks
 * like.
 *
 * A block that is still streaming cannot know its own final height, but the app
 * can pin it: this node reserves a single fixed square box that is shared by the
 * placeholder and the image. The box height comes from the box width and the
 * aspect ratio only — both layers are absolutely positioned — so the node keeps
 * exactly the same height from the first chunk to the finished image, the same
 * shape as a "generated at a fixed 480x480" flow.
 */
const props = defineProps<{
  node: {
    type: 'image'
    src: string
    alt: string
    title: string | null
    raw: string
    loading?: boolean
  }
  /**
   * Explicit box edge; a number is read as px (e.g. `480`). Defaults to the
   * renderer's own image cap (`--ms-size-image-max-width`), which is the largest
   * size a square image can reach, so the reserved box matches the final image.
   */
  boxSize?: number | string
  customId?: string
  isDark?: boolean
  indexKey?: string | number
}>()

const { t } = useSafeI18n()

const loadedSrc = ref('')
const failedSrc = ref('')

const safeSrc = computed(() => sanitizeImageSrc(props.node.src))
const altText = computed(() => String(props.node.alt ?? props.node.title ?? ''))
const titleText = computed(() => String(props.node.title ?? props.node.alt ?? ''))
const isLoaded = computed(() => safeSrc.value !== '' && loadedSrc.value === safeSrc.value)
const isStreaming = computed(() => props.node.loading === true)
// A streamed src stays partial until the closing paren arrives, so a failure
// while the node is still loading must keep the placeholder instead of flashing
// the error state on every incomplete URL.
const showError = computed(() => {
  if (isStreaming.value)
    return false
  return safeSrc.value === '' || failedSrc.value === safeSrc.value
})
const showPlaceholder = computed(() => !showError.value && !isLoaded.value)
const boxStyle = computed(() => {
  if (props.boxSize == null)
    return undefined
  return {
    '--pinned-image-size': typeof props.boxSize === 'number' ? `${props.boxSize}px` : props.boxSize,
  }
})

function handleLoad() {
  loadedSrc.value = safeSrc.value
}

function handleError() {
  failedSrc.value = safeSrc.value
}
</script>

<template>
  <span
    class="pinned-image-node"
    :style="boxStyle"
    :data-pinned-image-state="showError ? 'error' : isLoaded ? 'loaded' : 'loading'"
  >
    <img
      v-if="safeSrc && !showError"
      :src="safeSrc"
      :alt="altText"
      :title="titleText"
      decoding="async"
      class="pinned-image-node__img"
      :class="{ 'is-loaded': isLoaded }"
      @load="handleLoad"
      @error="handleError"
    >

    <span v-if="showPlaceholder" class="pinned-image-node__placeholder">
      <span class="pinned-image-node__shimmer" aria-hidden="true" />
    </span>

    <span v-else-if="showError" class="pinned-image-node__error">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M2 2h20v10h-2V4H4v9.586l5-5L14.414 14L13 15.414l-4-4l-5 5V20h8v2H2zm13.547 5a1 1 0 1 0 0 2a1 1 0 0 0 0-2m-3 1a3 3 0 1 1 6 0a3 3 0 0 1-6 0m3.625 6.757L19 17.586l2.828-2.829l1.415 1.415L20.414 19l2.829 2.828l-1.415 1.415L19 20.414l-2.828 2.829l-1.415-1.415L17.586 19l-2.829-2.828z" /></svg>
      <span>{{ t('image.loadError') }}</span>
    </span>
  </span>
</template>

<style scoped>
.pinned-image-node {
  /*
   * One fixed square for the placeholder and the image. The height is derived
   * from the box width and this ratio, never from the image bytes, so the node
   * cannot resize once its bytes arrive.
   */
  --pinned-image-size: var(--ms-size-image-max-width, 24rem);
  position: relative;
  display: block;
  width: min(100%, var(--pinned-image-size));
  aspect-ratio: 1 / 1;
  margin: 0.75em 0;
  overflow: hidden;
  vertical-align: middle;
}

.pinned-image-node__img {
  /* Absolutely positioned: the image can never contribute to the box height. */
  position: absolute;
  inset: 0;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  margin: auto;
  opacity: 0;
  transition: opacity var(--ms-duration-emphasis, 200ms) var(--ms-ease-standard, ease);
}

.pinned-image-node__img.is-loaded {
  opacity: 1;
}

.pinned-image-node__placeholder,
.pinned-image-node__error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--ms-radius-md, 0.5rem);
  background: hsl(var(--ms-muted));
}

.pinned-image-node__error {
  gap: 0.375rem;
  color: hsl(var(--ms-muted-foreground));
  font-size: 0.8125rem;
}

.pinned-image-node__shimmer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: hsl(var(--ms-muted));
}

.pinned-image-node__shimmer::before {
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
  animation: pinned-image-shimmer 1.5s ease-in-out infinite;
}

@keyframes pinned-image-shimmer {
  from { transform: translateX(0); }
  to { transform: translateX(66.6667%); }
}

@media (prefers-reduced-motion: reduce) {
  .pinned-image-node__img { transition: none; }
  .pinned-image-node__shimmer::before { animation: none; }
}
</style>
