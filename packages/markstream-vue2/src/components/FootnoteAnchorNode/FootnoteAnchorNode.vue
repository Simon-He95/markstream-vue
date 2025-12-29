<script setup lang="ts">
const props = defineProps<{ node: { type: 'footnote_anchor', id: string, raw?: string } }>()

function scrollToReference(e) {
  e.preventDefault()
  if (typeof document === 'undefined')
    return
  const id = `fnref-${String(props.node.id ?? '')}`
  // Try to find the reference element rendered by FootnoteReferenceNode.
  // FootnoteReferenceNode renders a span. We search for .footnote-link text matching [id].
  const anchors = document.getElementById(id)
  if (anchors) {
    anchors.scrollIntoView({ behavior: 'smooth' })
  }
}
</script>

<template>
  <a
    class="footnote-anchor text-sm text-[#0366d6] hover:underline cursor-pointer"
    :href="`#fnref-${node.id}`"
    :title="`返回引用 ${node.id}`"
    @click="scrollToReference"
  >
    ↩︎
  </a>
</template>

<style scoped>
.footnote-anchor {
  margin-left: 0.5rem;
}
</style>
