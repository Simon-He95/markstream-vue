<script setup lang="ts">
import { getCustomNodeComponents } from '../../utils/nodeComponents'
import EmojiNode from '../EmojiNode'
import EmphasisNode from '../EmphasisNode'
import FootnoteReferenceNode from '../FootnoteReferenceNode'
import HighlightNode from '../HighlightNode'
import HtmlInlineNode from '../HtmlInlineNode'
import InlineCodeNode from '../InlineCodeNode'
import InsertNode from '../InsertNode'
import LinkNode from '../LinkNode'
import { MathInlineNodeAsync } from '../NodeRenderer/asyncComponent'
import ReferenceNode from '../ReferenceNode'
import StrongNode from '../StrongNode'
import SubscriptNode from '../SubscriptNode'
import SuperscriptNode from '../SuperscriptNode'
import TextNode from '../TextNode'

interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

const props = defineProps<{
  node: {
    type: 'strikethrough'
    children: NodeChild[]
    raw: string
  }
  customId?: string
  indexKey?: string | number
}>()

const overrides = getCustomNodeComponents(props.customId)

// Available node components for child rendering; prefer custom overrides
const nodeComponents = {
  text: TextNode,
  inline_code: InlineCodeNode,
  link: LinkNode,
  html_inline: HtmlInlineNode,
  strong: StrongNode,
  emphasis: EmphasisNode,
  highlight: HighlightNode,
  insert: InsertNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  emoji: EmojiNode,
  footnote_reference: FootnoteReferenceNode,
  math_inline: MathInlineNodeAsync,
  reference: ReferenceNode,
  ...overrides,
}
</script>

<template>
  <del class="strikethrough-node">
    <component
      :is="nodeComponents[child.type]"
      v-for="(child, index) in node.children"
      :key="`${indexKey || 'strikethrough'}-${index}`"
      :node="child"
      :custom-id="props.customId"
      :index-key="`${indexKey || 'strikethrough'}-${index}`"
    />
  </del>
</template>

<style scoped>
.strikethrough-node {
  text-decoration: line-through;
}
</style>
