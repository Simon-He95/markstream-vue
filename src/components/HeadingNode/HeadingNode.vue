<script setup lang="ts">
import { getCustomNodeComponents } from '../../utils/nodeComponents'
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
    children: NodeChild[]
    raw: string
  }
  customId?: string
  indexKey?: number | string
}>()

const overrides = getCustomNodeComponents(props.customId)

const nodeComponents = {
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
  ...overrides,
}
</script>

<template>
  <component
    :is="`h${node.level}`"
    v-memo="[node.children]"
    class="heading-node"
    :class="[`heading-${node.level}`]"
    dir="auto"
  >
    <component
      :is="nodeComponents[child.type]"
      v-for="(child, index) in node.children"
      :key="`${indexKey || 'heading'}-${index}`"
      v-memo="[child]"
      :custom-id="props.customId"
      :node="child"
      :index-key="`${indexKey || 'heading'}-${index}`"
    />
  </component>
</template>

<style scoped>
.heading-node {
  @apply font-medium leading-tight;
}
hr + .heading-node {
  @apply mt-0;
}

.heading-1 {
  @apply mt-0 mb-[calc(8/9*1em)] text-4xl leading-[calc(10/9*1)] font-extrabold;
}

.heading-2 {
  @apply mt-8 mb-4 text-2xl leading-[calc(4/3*1)] font-bold;
}

.heading-3 {
  @apply mt-[calc(8/5*1em)] mb-[calc(3/5*1em)] text-xl font-semibold leading-[calc(5/3*1)];
}

.heading-4 {
  @apply mt-6 mb-2 text-base font-semibold;
}

.heading-5 {
  @apply m-0 text-base;
}

.heading-6 {
  @apply m-0 text-base;
}
</style>
