<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ to?: string }>()
const rootRef = ref<HTMLElement | null>(null)

function resolveTarget() {
  if (typeof document === 'undefined')
    return null
  if (!props.to || props.to === 'body')
    return document.body
  return document.querySelector(props.to)
}

function moveToTarget() {
  const root = rootRef.value
  if (!root)
    return
  const target = resolveTarget()
  if (target && root.parentElement !== target)
    target.appendChild(root)
}

onMounted(() => {
  moveToTarget()
})

watch(
  () => props.to,
  () => {
    moveToTarget()
  },
)

onBeforeUnmount(() => {
  // Vue will remove the element from its current parent automatically.
})
</script>

<template>
  <div ref="rootRef" class="portal-root">
    <slot />
  </div>
</template>

<style scoped>
.portal-root {
  display: contents;
}
</style>
