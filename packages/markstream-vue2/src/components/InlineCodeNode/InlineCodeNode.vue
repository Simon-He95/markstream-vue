<script setup lang="ts">
defineProps<{
  node: {
    type: 'inline_code'
    code: string
    raw: string
  }
}>()
</script>

<template>
  <code
    class="inline text-[85%] px-1 py-0.5 rounded font-mono bg-secondary whitespace-normal break-words max-w-full before:content-[''] after:content-['']"
  >{{ node.code }}</code>
</template>
