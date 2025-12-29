<script setup lang="ts">
import type { MathInlineNodeProps } from '../../types/component-props'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useViewportPriority } from '../../composables/viewportPriority'
import { renderKaTeXWithBackpressure, setKaTeXCache, WORKER_BUSY_CODE } from '../../workers/katexWorkerClient'

import { getKatex } from './katex'

const props = defineProps<MathInlineNodeProps>()

const containerEl = ref<HTMLElement | null>(null)
const mathElement = ref<HTMLElement | null>(null)
let hasRenderedOnce = false
let currentRenderId = 0
let isUnmounted = false
let currentAbortController: AbortController | null = null
const renderingLoading = ref(true)
const registerVisibility = useViewportPriority()
let visibilityHandle: ReturnType<typeof registerVisibility> | null = null

async function renderMath() {
  if (!mathElement.value || isUnmounted)
    return
  if (!props.node.content) {
    renderingLoading.value = false
    mathElement.value.textContent = props.node.raw
    hasRenderedOnce = true
    return
  }

  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }

  const renderId = ++currentRenderId
  const abortController = new AbortController()
  currentAbortController = abortController

  // Defer heavy work until visible on first render
  if (!hasRenderedOnce) {
    try {
      if (!visibilityHandle && containerEl.value) {
        // Observe the always-visible wrapper, not the v-show hidden math span
        visibilityHandle = registerVisibility(containerEl.value)
      }
      await visibilityHandle?.whenVisible
    }
    catch {}
  }

  renderKaTeXWithBackpressure(props.node.content, false, {
    // Inline math should not wait on worker slots; fallback to sync render immediately
    timeout: 1500,
    waitTimeout: 0,
    maxRetries: 0,
    signal: abortController.signal,
  })
    .then((html) => {
      if (isUnmounted || renderId !== currentRenderId)
        return
      if (!mathElement.value)
        return
      mathElement.value.innerHTML = html
      renderingLoading.value = false
      hasRenderedOnce = true
    })
    .catch(async (err: any) => {
      if (isUnmounted || renderId !== currentRenderId)
        return
      if (!mathElement.value)
        return
      // Fallback cases:
      // 1) Worker failed to initialize -> try sync render
      // 2) Worker is busy/timeout under heavy concurrency -> try sync render to avoid perpetual loading
      //    (inline math is usually cheap to render on main thread)
      const code = err?.code || err?.name
      const isWorkerInitFailure = code === 'WORKER_INIT_ERROR' || err?.fallbackToRenderer
      const isBusyOrTimeout = code === WORKER_BUSY_CODE || code === 'WORKER_TIMEOUT'
      const isDisabled = code === 'KATEX_DISABLED'

      if (isWorkerInitFailure || isBusyOrTimeout) {
        const katex = await getKatex()
        if (katex) {
          try {
            const html = katex.renderToString(props.node.content, { throwOnError: props.node.loading, displayMode: false })
            renderingLoading.value = false
            mathElement.value.innerHTML = html
            hasRenderedOnce = true
            // populate worker client cache for inline as well
            setKaTeXCache(props.node.content, false, html)
          }
          catch {
          }

          return
        }
      }
      if (isDisabled) {
        renderingLoading.value = false
        mathElement.value.textContent = props.node.raw
        return
      }
      // If we reach here, the worker render failed and sync fallback was not possible.
      // Stop the spinner and show raw text when we have not rendered once yet
      // or the node isn't in loading mode.
      if (!hasRenderedOnce) {
        renderingLoading.value = !isDisabled
      }
      if (!props.node.loading) {
        renderingLoading.value = false
        mathElement.value.textContent = props.node.raw
      }
      else if (isDisabled) {
        mathElement.value.textContent = props.node.raw
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
  <span ref="containerEl" class="math-inline-wrapper">
    <span v-show="!renderingLoading" ref="mathElement" class="math-inline" />
    <transition v-if="renderingLoading" name="table-node-fade">
      <span
        class="math-inline__loading"
        role="status"
        aria-live="polite"
      >
        <slot name="loading" :is-loading="renderingLoading">
          <span class="math-inline__spinner animate-spin" aria-hidden="true" />
          <span class="sr-only">Loading</span>
        </slot>
      </span>
    </transition>
  </span>
</template>

<style scoped>
.math-inline-wrapper {
  position: relative;
  display: inline-block;
}

.math-inline {
  display: inline-block;
  vertical-align: middle;
}

.math-inline__loading {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.math-inline__spinner {
  width: 1rem;
  height: 1rem;
  border-radius: 9999px;
  border: 2px solid rgba(94, 104, 121, 0.25);
  border-top-color: rgba(94, 104, 121, 0.8);
  will-change: transform;
}

.table-node-fade-enter-active,
.table-node-fade-leave-active {
  transition: opacity 0.18s ease;
}

.table-node-fade-enter-from,
.table-node-fade-leave-to {
  opacity: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
