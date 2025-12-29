<script setup lang="ts">
import { computed } from 'vue'
import { getCustomNodeComponents } from '../../utils/nodeComponents'
import CheckboxNode from '../CheckboxNode'
import EmphasisNode from '../EmphasisNode'
import HardBreakNode from '../HardBreakNode'
import HeadingNode from '../HeadingNode'
import ImageNode from '../ImageNode'
import InlineCodeNode from '../InlineCodeNode'
import InsertNode from '../InsertNode'
import LinkNode from '../LinkNode'
import ListNode from '../ListNode'
import { MathBlockNodeAsync, MathInlineNodeAsync } from '../NodeRenderer/asyncComponent'
import FallbackComponent from '../NodeRenderer/FallbackComponent.vue'
import ParagraphNode from '../ParagraphNode'
import ReferenceNode from '../ReferenceNode'
import StrikethroughNode from '../StrikethroughNode'
import StrongNode from '../StrongNode'
import SubscriptNode from '../SubscriptNode'
import SuperscriptNode from '../SuperscriptNode'
import TableNode from '../TableNode'
import TextNode from '../TextNode'

interface VmrContainerNode {
  type: 'vmr_container'
  name: string
  attrs?: Record<string, string>
  children: { type: string, raw: string }[]
  raw: string
}

const props = defineProps<{ node: VmrContainerNode, indexKey: number | string, isDark?: boolean, typewriter?: boolean, customId?: string }>()

// Build CSS class from container name
const containerClass = computed(() => `vmr-container vmr-container-${props.node.name}`)
const overrides = getCustomNodeComponents(props.customId)

const nodeComponents = {
  // Inline nodes (used inside paragraphs)
  text: TextNode,
  paragraph: ParagraphNode,
  heading: HeadingNode,
  inline_code: InlineCodeNode,
  link: LinkNode,
  image: ImageNode,
  strong: StrongNode,
  emphasis: EmphasisNode,
  strikethrough: StrikethroughNode,
  insert: InsertNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  checkbox: CheckboxNode,
  checkbox_input: CheckboxNode,
  hardbreak: HardBreakNode,
  math_inline: MathInlineNodeAsync,
  reference: ReferenceNode,
  list: ListNode,
  math_block: MathBlockNodeAsync,
  table: TableNode,
  // Custom overrides
  ...overrides,
}

function getNodeComponent(type: string) {
  return nodeComponents[type] || FallbackComponent
}
</script>

<template>
  <div :class="containerClass" v-bind="node.attrs">
    <component
      :is="getNodeComponent(child.type)"
      v-for="(child, index) in node.children"
      :key="`${indexKey || 'vmr-container'}-${index}`"
      :custom-id="props.customId"
      :node="child"
      :index-key="`${indexKey || 'vmr-container'}-${index}`"
    />
  </div>
</template>

<style scoped>
.vmr-container {
  @apply rounded-lg border p-4 my-4;
  border-left-width: 4px;
}
</style>
