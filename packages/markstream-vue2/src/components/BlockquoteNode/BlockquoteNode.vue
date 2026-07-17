<script setup lang="ts">
import { markRaw, version } from 'vue-demi'
import { isLegacyVue26Version } from '../../utils/vue26'
import NodeRenderer from '../NodeRenderer'
import LegacyNodesRenderer from '../NodeRenderer/LegacyNodesRenderer.vue'

interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

interface BlockquoteNode {
  type: 'blockquote'
  children: NodeChild[]
  raw: string
  cite?: string
}

const props = defineProps<{
  node: BlockquoteNode
  indexKey: string | number
  typewriter?: boolean
  customId?: string
}>()

defineEmits<{
  copy: [text: string]
}>()

const nestedRenderer = markRaw(isLegacyVue26Version(version) ? LegacyNodesRenderer : NodeRenderer)
</script>

<template>
  <blockquote class="blockquote" dir="auto" :cite="node.cite">
    <component
      :is="nestedRenderer"
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
  margin: 1.6em 0;
  padding-left: 1em;
}

.blockquote ::v-deep .markdown-renderer {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}
</style>
