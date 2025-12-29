<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  node: {
    type: 'html_inline'
    tag?: string
    content: string
    loading?: boolean
    autoClosed?: boolean
  }
}>()

const containerRef = ref<HTMLElement | null>(null)
const isClient = typeof window !== 'undefined'

function renderHtmlContent() {
  if (!isClient || !containerRef.value)
    return
  const host = containerRef.value
  host.innerHTML = ''
  const template = document.createElement('template')
  template.innerHTML = props.node.content
  host.appendChild(template.content.cloneNode(true))
}

function renderLoadingContent() {
  if (!containerRef.value)
    return
  const host = containerRef.value
  host.innerHTML = ''
  host.textContent = props.node.content
}

onMounted(() => {
  if (props.node.loading && !props.node.autoClosed)
    renderLoadingContent()
  else
    renderHtmlContent()
})

watch(
  () => [props.node.content, props.node.loading, props.node.autoClosed],
  () => {
    if (props.node.loading && !props.node.autoClosed)
      renderLoadingContent()
    else
      renderHtmlContent()
  },
)

onBeforeUnmount(() => {
  if (!containerRef.value)
    return
  containerRef.value.innerHTML = ''
})
</script>

<template>
  <span
    ref="containerRef"
    class="html-inline-node"
    :class="{ 'html-inline-node--loading': props.node.loading }"
  />
</template>

<style scoped>
.html-inline-node {
  display: inline;
}

.html-inline-node--loading {
  opacity: 0.85;
}
</style>
