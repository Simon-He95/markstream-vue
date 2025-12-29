<script setup lang="ts">
defineProps<{
  node: {
    raw: string
  }
}>()
</script>

<template>
  <div class="unknown-node">
    {{ node.raw }}
  </div>
</template>

<style scoped></style>
