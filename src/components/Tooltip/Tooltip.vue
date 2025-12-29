<script setup lang="ts">
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  anchorEl: HTMLElement | null
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  offset?: number
  originX?: number | null
  originY?: number | null
  id?: string | null
  isDark?: boolean | null
}>()

// Determine effective dark mode: prefer explicit prop, otherwise detect global/document preference
const isDarkEffective = computed(() => {
  if (props.isDark !== undefined && props.isDark !== null)
    return Boolean(props.isDark)
  if (typeof document !== 'undefined') {
    try {
      if (document.documentElement.classList.contains('dark'))
        return true
      if ((window as any)?.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
        return true
    }
    catch {}
  }
  return false
})

const tooltip = ref<HTMLElement | null>(null)
// Position via transform to allow smooth transitions
const style = ref<Record<string, string>>({ transform: 'translate3d(0px, 0px, 0px)', left: '0px', top: '0px' })
const ready = ref(false)

let cleanupAutoUpdate: (() => void) | null = null

async function updatePosition() {
  if (!props.anchorEl || !tooltip.value)
    return
  const middleware = [offset(props.offset ?? 8), flip(), shift({ padding: 8 })]
  const { x, y } = await computePosition(props.anchorEl, tooltip.value, {
    placement: props.placement ?? 'top',
    middleware,
    strategy: 'fixed',
  })
  // Use transform so changes animate smoothly
  style.value.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
  style.value.left = '0px'
  style.value.top = '0px'
}

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      ready.value = false
      await nextTick()
      if (props.anchorEl && tooltip.value) {
        try {
          const rect = props.anchorEl.getBoundingClientRect()
          // compute target position first
          await updatePosition()
          const targetTransform = style.value.transform
          if (props.originX != null && props.originY != null) {
            const dx = Math.abs(Number(props.originX) - rect.left)
            const dy = Math.abs(Number(props.originY) - rect.top)
            const dist = Math.hypot(dx, dy)
            const THRESH = 120
            if (dist > THRESH) {
              // place tooltip visually at origin first (while hidden), then show and animate to target
              style.value.transform = `translate3d(${Math.round(props.originX)}px, ${Math.round(props.originY)}px, 0)`
              // make element visible at origin
              await nextTick()
              ready.value = true
              // next tick set to target so CSS transform animates
              await nextTick()
              style.value.transform = targetTransform
            }
            else {
              // show directly at target
              ready.value = true
            }
          }
          else {
            // no origin: show directly at target
            ready.value = true
          }
          // setup autoUpdate to reposition on scroll/resize/mutation; returns cleanup
          cleanupAutoUpdate = autoUpdate(props.anchorEl, tooltip.value, updatePosition)
        }
        catch {
          await updatePosition()
          ready.value = true
          cleanupAutoUpdate = autoUpdate(props.anchorEl, tooltip.value, updatePosition)
        }
      }
      else {
        // nothing to position; still mark ready so v-show can render if visible
        ready.value = true
      }
    }
    else {
      ready.value = false
      if (cleanupAutoUpdate) {
        cleanupAutoUpdate()
        cleanupAutoUpdate = null
      }
    }
  },
)

// Recompute when anchor/placement/content changes to animate between anchors
watch([
  () => props.anchorEl,
  () => props.placement,
  () => props.content,
], async () => {
  if (props.visible && props.anchorEl && tooltip.value) {
    await nextTick()
    await updatePosition()
  }
})

onBeforeUnmount(() => {
  if (cleanupAutoUpdate)
    cleanupAutoUpdate()
})
</script>

<template>
  <teleport to="body">
    <div class="markstream-vue">
      <transition name="tooltip" appear>
        <div
          v-show="visible && ready"
          :id="props.id"
          ref="tooltip"
          :style="{ position: 'fixed', left: style.left, top: style.top, transform: style.transform }"
          class="z-[9999] inline-block text-base py-2 px-3 rounded-md shadow-md whitespace-nowrap pointer-events-none tooltip-element border" :class="[isDarkEffective ? 'bg-gray-900 text-white border-gray-700 border is-dark' : 'bg-white text-gray-900 border-gray-200 border']"
          role="tooltip"
        >
          {{ content }}
        </div>
      </transition>
    </div>
  </teleport>
</template>

<style scoped>
/* Fade + slide (translate) for smooth transitions */
.tooltip-enter-from { opacity: 0; transform: translateY(-6px) scale(0.98); }
.tooltip-enter-to { opacity: 1; transform: translateY(0) scale(1); }
.tooltip-leave-from { opacity: 1; transform: translateY(0) scale(1); }
.tooltip-leave-to { opacity: 0; transform: translateY(-6px) scale(0.98); }
.tooltip-enter-active, .tooltip-leave-active { transition: opacity 120ms linear; }

/* Move transition: always active on the element so updates to transform animate smoothly */
.tooltip-element { transition: transform 220ms cubic-bezier(.16,1,.3,1), box-shadow 220ms cubic-bezier(.16,1,.3,1); }
</style>
