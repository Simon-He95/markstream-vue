<script setup lang="ts">
import NodeRenderer from '../NodeRenderer'

// child node shape used across many node components
interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

interface BlockquoteNode {
  type: 'blockquote'
  children: NodeChild[]
  raw: string
  // optional citation/source for the blockquote
  cite?: string
}

const props = defineProps<{
  node: BlockquoteNode
  indexKey: string | number
  typewriter?: boolean
  customId?: string
}>()

// typed emit for better DX and type-safety when forwarding copy events
defineEmits<{
  copy: [text: string]
}>()
</script>

<template>
  <blockquote class="blockquote" dir="auto" :cite="node.cite">
    <NodeRenderer
      v-memo="[props.node.children]"
      :index-key="`blockquote-${props.indexKey}`"
      :nodes="props.node.children || []"
      :custom-id="props.customId"
      :typewriter="props.typewriter"
      @copy="$emit('copy', $event)"
    />
  </blockquote>
</template>

<style scoped>
.blockquote {
  font-weight: 500;
  font-style: italic;
  border-left: 0.25rem solid var(--blockquote-border-color,#e2e8f0);
  quotes: "\201C" "\201D" "\2018" "\2019";
  margin-top: 1.6em;
  margin-bottom: 1.6em;
  padding-left: 1em;
}

/* 防止内部 NodeRenderer 使用 content-visibility: auto 时在大文档滚动中出现“高但空白”的占位 */
.blockquote :deep(.markdown-renderer) {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}
</style>
