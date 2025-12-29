<script setup lang="ts">
defineProps<{
  node: {
    type: 'emoji'
    name: string
    markup: string
    raw: string
  }
}>()
</script>

<template>
  <span class="emoji-node">{{ node.name }}</span>
</template>

<style scoped>
.emoji-node {
  display: inline-block;
}
</style>
