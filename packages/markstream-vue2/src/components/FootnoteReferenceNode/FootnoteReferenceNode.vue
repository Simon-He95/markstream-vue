<script setup lang="ts">
// 定义脚注引用节点
interface FootnoteReferenceNode {
  type: 'footnote_reference'
  id: string
  raw: string
}

// 接收props
const props = defineProps<{
  node: FootnoteReferenceNode
}>()
const href = `#footnote-${props.node.id}`
function handleScroll() {
  if (typeof document === 'undefined') {
    // SSR: nothing to do
    return
  }
  const element = document.querySelector(href)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' })
  }
  else {
    console.warn(`Element with href: ${href} not found`)
  }
}
</script>

<template>
  <sup :id="`fnref-${node.id}`" class="footnote-reference" @click="handleScroll">
    <span
      :href="href"
      :title="`查看脚注 ${node.id}`"
      class="footnote-link cursor-pointer"
    >[{{ node.id }}]</span>
  </sup>
</template>

<style scoped>
.footnote-reference {
  font-size: 0.75em;
  line-height: 0;
}

.footnote-link {
  color: #0366d6;
  text-decoration: none;
}

.footnote-link:hover {
  text-decoration: underline;
}
</style>
