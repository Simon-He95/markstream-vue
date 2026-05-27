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
  fade?: boolean
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
      :index-key="`blockquote-${props.indexKey}`"
      :nodes="props.node.children || []"
      :custom-id="props.customId"
      :typewriter="props.typewriter"
      :fade="props.fade"
      @copy="$emit('copy', $event)"
    />
  </blockquote>
</template>

<style scoped>
.blockquote {
  font-weight: 400;
  font-style: normal;
  color: var(--blockquote-fg, hsl(var(--ms-muted-foreground)));
  border-left: 3px solid var(--blockquote-border);
  margin-top: var(--ms-flow-blockquote-y);
  margin-bottom: var(--ms-flow-blockquote-y);
  padding-left: var(--ms-flow-blockquote-indent);
}

/* 防止内部 NodeRenderer 使用 content-visibility: auto 时在大文档滚动中出现“高但空白”的占位 */
.blockquote :deep(.markdown-renderer) {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}
</style>
