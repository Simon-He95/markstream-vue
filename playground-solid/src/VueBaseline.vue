<script setup lang="ts">
import MarkdownRender from '../../src/exports'

defineOptions({ inheritAttrs: false })
</script>

<template>
  <MarkdownRender v-bind="$attrs" />
</template>
