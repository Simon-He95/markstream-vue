<script setup lang="ts">
import { useKatexReady } from '../../composables/useKatexReady'

defineProps<{
  node: {
    type: 'text'
    content: string
    raw: string
    center?: boolean
  }
}>()
defineEmits(['copy'])
const katexReady = useKatexReady()
</script>

<template>
  <span
    :class="[katexReady && node.center ? 'text-node-center' : '']"
    class="whitespace-pre-wrap break-words text-node"
  >
    {{ node.content }}
  </span>
</template>

<style scoped>
.text-node {
  display: inline;
  font-weight: inherit;
  vertical-align: baseline;
}
.text-node-center {
  display: inline-flex;
  justify-content: center;
  width: 100%;
}
</style>
