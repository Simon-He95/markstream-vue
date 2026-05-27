<script setup lang="ts">
import { computed } from 'vue'
import { useCustomNodeComponents } from '../../utils/nodeComponents'
import CheckboxNode from '../CheckboxNode'
import EmojiNode from '../EmojiNode'
import EmphasisNode from '../EmphasisNode'
import FootnoteReferenceNode from '../FootnoteReferenceNode'
import HardBreakNode from '../HardBreakNode'
import HighlightNode from '../HighlightNode'
import ImageNode from '../ImageNode'
import InlineCodeNode from '../InlineCodeNode'
import InsertNode from '../InsertNode'
import LinkNode from '../LinkNode'
import NodeChildRenderer from '../NodeChildRenderer'
import { MathInlineNodeAsync } from '../NodeRenderer/asyncComponent'
import ReferenceNode from '../ReferenceNode'
import StrikethroughNode from '../StrikethroughNode'
import StrongNode from '../StrongNode'
import SubscriptNode from '../SubscriptNode'
import SuperscriptNode from '../SuperscriptNode'
import TextNode from '../TextNode'

// Define the type for the node children
interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

const props = defineProps<{
  node: {
    type: 'heading'
    level: number
    text: string
    attrs?: Record<string, string | boolean>
    children: NodeChild[]
    raw: string
  }
  customId?: string
  indexKey?: number | string
}>()

const overrides = useCustomNodeComponents(() => props.customId)

const nodeComponents = computed(() => ({
  text: TextNode,
  inline_code: InlineCodeNode,
  link: LinkNode,
  image: ImageNode,
  strong: StrongNode,
  emphasis: EmphasisNode,
  strikethrough: StrikethroughNode,
  highlight: HighlightNode,
  insert: InsertNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  emoji: EmojiNode,
  checkbox: CheckboxNode,
  checkbox_input: CheckboxNode,
  footnote_reference: FootnoteReferenceNode,
  hardbreak: HardBreakNode,
  math_inline: MathInlineNodeAsync,
  reference: ReferenceNode,
  ...overrides.value,
}))
</script>

<template>
  <component
    :is="`h${node.level}`"
    class="heading-node"
    :class="[`heading-${node.level}`]"
    dir="auto"
    v-bind="node.attrs"
  >
    <NodeChildRenderer
      v-for="(child, index) in node.children"
      :key="`${indexKey || 'heading'}-${index}`"
      :components="nodeComponents"
      :custom-id="props.customId"
      :node="child"
      :index-key="`${indexKey || 'heading'}-${index}`"
    />
  </component>
</template>

<style scoped>
.heading-node {
  font-weight: 500;
  line-height: 1.25;
}
hr + .heading-node {
  margin-top: 0;
}

.heading-1 {
  font-size: var(--ms-text-h1);
  line-height: var(--ms-leading-h1);
  font-weight: var(--ms-weight-h1);
  margin-top: var(--ms-flow-heading-1-mt);
  margin-bottom: var(--ms-flow-heading-1-mb);
}

.heading-2 {
  font-size: var(--ms-text-h2);
  line-height: var(--ms-leading-h2);
  font-weight: var(--ms-weight-h2);
  margin-top: var(--ms-flow-heading-2-mt);
  margin-bottom: var(--ms-flow-heading-2-mb);
}

.heading-3 {
  font-size: var(--ms-text-h3);
  line-height: var(--ms-leading-h3);
  font-weight: var(--ms-weight-h3);
  margin-top: var(--ms-flow-heading-3-mt);
  margin-bottom: var(--ms-flow-heading-3-mb);
}

.heading-4 {
  font-size: var(--ms-text-h4);
  font-weight: var(--ms-weight-h4);
  margin-top: var(--ms-flow-heading-4-mt);
  margin-bottom: var(--ms-flow-heading-4-mb);
}

.heading-5 {
  font-size: var(--ms-text-h5);
  margin-top: var(--ms-flow-heading-5-mt);
  margin-bottom: var(--ms-flow-heading-5-mb);
}

.heading-6 {
  font-size: var(--ms-text-h6);
  margin-top: var(--ms-flow-heading-6-mt);
  margin-bottom: var(--ms-flow-heading-6-mb);
}
</style>
