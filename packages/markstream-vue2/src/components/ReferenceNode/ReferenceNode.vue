<script setup lang="ts">
defineProps<{
  node: {
    type: 'reference'
    id: string
    raw: string
  }
  messageId?: string
  threadId?: string
}>()
defineEmits(['click', 'mouseEnter', 'mouseLeave'])
</script>

<template>
  <span
    class="reference-node cursor-pointer bg-accent text-xs rounded-md px-1.5 mx-0.5 hover:bg-secondary"
    role="button"
    tabindex="0"
    @click="$emit('click', $event, node.id, messageId, threadId)"
    @mouseenter="$emit('mouseEnter', $event, node.id, messageId, threadId)"
    @mouseleave="$emit('mouseLeave', $event, node.id, messageId, threadId)"
  >
    {{ node.id }}
  </span>
</template>

<style scoped></style>
