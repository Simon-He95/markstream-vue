<script setup lang="ts">
import { getPlainTextContent, resolveSimpleInlineChildren } from 'markstream-core'
import { computed, provide } from 'vue'
import { useCustomNodeComponents } from '../../utils/nodeComponents'
import NodeRenderer from '../NodeRenderer'
import SimpleInlineRenderer from '../SimpleInlineRenderer'

// child node shape used across many node components
interface NodeChild {
  type: string
  raw: string
  children?: NodeChild[]
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
  showTooltips?: boolean
}>()

// typed emit for better DX and type-safety when forwarding copy events
defineEmits<{
  copy: [text: string]
}>()

const customComponents = useCustomNodeComponents(() => props.customId)
const hasParagraphOverride = computed(() =>
  Boolean((customComponents.value as any).paragraph),
)
const hasTextOverride = computed(() =>
  Boolean((customComponents.value as any).text),
)
const simpleBlockChildren = computed(() => {
  return resolveSimpleInlineChildren(props.node.children as any, !hasParagraphOverride.value)
})
function canRenderPlainTextInline() {
  return props.fade === false && !hasTextOverride.value
}
const simpleBlockPlainText = computed(() => {
  if (!canRenderPlainTextInline())
    return null

  return getPlainTextContent(simpleBlockChildren.value)
})

provide('markstreamShowTooltips', computed(() => props.showTooltips))
provide('markstreamFade', computed(() => props.fade))
</script>

<template>
  <blockquote class="blockquote blockquote-node" dir="auto" :cite="node.cite">
    <p
      v-if="simpleBlockChildren"
      dir="auto"
      class="paragraph-node"
    >
      <span
        v-if="simpleBlockPlainText !== null"
        class="text-node"
        :custom-id="props.customId"
      >{{ simpleBlockPlainText }}</span>
      <SimpleInlineRenderer
        v-else
        :nodes="simpleBlockChildren as any"
        :custom-id="props.customId"
        :index-key="`blockquote-${props.indexKey}-paragraph`"
      />
    </p>
    <NodeRenderer
      v-else
      :show-tooltips="props.showTooltips"
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

.blockquote > .paragraph-node {
  font-size: var(--ms-text-body);
  line-height: var(--ms-leading-body);
  margin: var(--ms-flow-paragraph-y) 0;
}

.blockquote > .paragraph-node:first-child {
  margin-top: 0;
}

.blockquote > .paragraph-node:last-child {
  margin-bottom: 0;
}

/* 防止内部 NodeRenderer 使用 content-visibility: auto 时在大文档滚动中出现“高但空白”的占位 */
.blockquote :deep(.markdown-renderer) {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}
</style>
