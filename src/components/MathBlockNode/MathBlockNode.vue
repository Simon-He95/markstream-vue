<script setup lang="ts">
import type { MathBlockNodeProps } from '../../types/component-props'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useViewportPriority } from '../../composables/viewportPriority'
import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../../workers/katexWorkerClient'

import { getKatex } from '../MathInlineNode/katex'

const props = defineProps<MathBlockNodeProps>()
const containerEl = ref<HTMLElement | null>(null)
const mathBlockElement = ref<HTMLElement | null>(null)
let hasRenderedOnce = false
let currentRenderId = 0
let isUnmounted = false
let currentAbortController: AbortController | null = null
const registerVisibility = useViewportPriority()
let visibilityHandle: ReturnType<typeof registerVisibility> | null = null
const renderingLoading = ref(true)

// Function to render math using KaTeX
async function renderMath() {
  if (!mathBlockElement.value || isUnmounted)
    return
  if (!props.node.content) {
    renderingLoading.value = false
    mathBlockElement.value.textContent = props.node.raw
    hasRenderedOnce = true
    return
  }

  // Wait until near/in viewport to prioritize visible area
  if (!hasRenderedOnce) {
    try {
      // register once per mount
      if (!visibilityHandle && containerEl.value) {
        // Observe the outer wrapper to ensure IO triggers even if inner is empty
        visibilityHandle = registerVisibility(containerEl.value)
      }
      await visibilityHandle?.whenVisible
    }
    catch {}
  }

  // cancel any previous in-flight render
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }

  // increment render id for this invocation; responses from older renders are ignored
  const renderId = ++currentRenderId
  const abortController = new AbortController()
  currentAbortController = abortController

  renderKaTeXWithBackpressure(props.node.content, true, {
    timeout: 3000,
    waitTimeout: 2000,
    maxRetries: 1,
    signal: abortController.signal,
  })
    .then((html) => {
      // ignore if a newer render was requested or component unmounted
      if (isUnmounted || renderId !== currentRenderId)
        return
      if (!mathBlockElement.value)
        return
      mathBlockElement.value.innerHTML = html
      hasRenderedOnce = true
      renderingLoading.value = false
    })
    .catch(async (err: any) => {
      // ignore if a newer render was requested or component unmounted
      if (isUnmounted || renderId !== currentRenderId)
        return
      if (!mathBlockElement.value)
        return

      // If the worker failed to initialize (e.g. bad new Worker path), the
      // worker client will return a special error with code 'WORKER_INIT_ERROR'
      // and `fallbackToRenderer = true`. In that case, perform a synchronous
      // KaTeX render on the main thread as a fallback. If the error is a
      // KaTeX render error from the worker (syntax), we should ignore it here
      // and fall through to the raw/text fallback below.
      const code = err?.code || err?.name
      const isWorkerInitFailure = code === 'WORKER_INIT_ERROR' || err?.fallbackToRenderer
      const isBusyOrTimeout = code === WORKER_BUSY_CODE || code === 'WORKER_TIMEOUT'
      const isDisabled = code === 'KATEX_DISABLED'

      // For blocks, also fall back to main-thread render when the worker is busy/timeout
      // under viewport bursts to avoid showing raw text.
      if (isWorkerInitFailure || isBusyOrTimeout) {
        const katex = await getKatex()
        if (katex) {
          try {
            const html = katex.renderToString(props.node.content, {
              throwOnError: props.node.loading,
              displayMode: true,
            })
            mathBlockElement.value.innerHTML = html
            hasRenderedOnce = true
            renderingLoading.value = false
            // populate worker client cache so future calls hit cache
            setKaTeXCache(props.node.content, true, html)
          }
          catch {
          }
          return
        }
      }

      // show raw fallback when we never successfully rendered before or when loading flag is false

      if (isDisabled) {
        renderingLoading.value = false
        mathBlockElement.value.textContent = props.node.raw
        return
      }

      if (!hasRenderedOnce) {
        renderingLoading.value = true
      }
      if (!props.node.loading) {
        renderingLoading.value = false
        mathBlockElement.value.textContent = props.node.raw
      }
    })
}

watch(
  () => props.node.content,
  () => {
    renderMath()
  },
)
onMounted(() => {
  renderMath()
})

onBeforeUnmount(() => {
  // prevent any pending worker responses from touching the DOM
  isUnmounted = true
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
  visibilityHandle?.destroy?.()
  visibilityHandle = null
})
</script>

<template>
  <div ref="containerEl" class="math-block text-center overflow-x-auto relative min-h-[40px]">
    <Transition name="math-fade">
      <div v-if="renderingLoading" class="math-loading-overlay">
        <div class="math-loading-spinner" />
      </div>
    </Transition>
    <div ref="mathBlockElement" :class="{ 'math-rendering': renderingLoading }" />
  </div>
</template>

<style scoped>
.math-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(2px);
  min-height: 40px;
}

.math-loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-top-color: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  animation: math-spin 0.8s linear infinite;
}

@keyframes math-spin {
  to {
    transform: rotate(360deg);
  }
}

.math-rendering {
  opacity: 0.3;
  transition: opacity 0.2s ease;
}

.math-fade-enter-active,
.math-fade-leave-active {
  transition: opacity 0.3s ease;
}

.math-fade-enter-from,
.math-fade-leave-to {
  opacity: 0;
}

@media (prefers-color-scheme: dark) {
  .math-loading-overlay {
    background-color: rgba(0, 0, 0, 0.6);
  }

  .math-loading-spinner {
    border-color: rgba(255, 255, 255, 0.2);
    border-top-color: rgba(255, 255, 255, 0.8);
  }
}
</style>
