<script setup lang="ts">
import { useKatexReady } from '../../composables/useKatexReady'
import { getCustomNodeComponents } from '../../utils/nodeComponents'
import CheckboxNode from '../CheckboxNode'
import EmojiNode from '../EmojiNode'
import EmphasisNode from '../EmphasisNode'
import FootnoteAnchorNode from '../FootnoteAnchorNode'
import FootnoteReferenceNode from '../FootnoteReferenceNode'
import HardBreakNode from '../HardBreakNode'
import HighlightNode from '../HighlightNode'
import HtmlInlineNode from '../HtmlInlineNode'
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

// Define the type for the node children
interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

const props = defineProps<{
  node: {
    type: 'paragraph'
    children: NodeChild[]
    raw: string
  }
  customId?: string
  indexKey?: number | string
}>()
const overrides = getCustomNodeComponents(props.customId)

const nodeComponents = {
  inline_code: InlineCodeNode,
  image: ImageNode,
  link: LinkNode,
  hardbreak: HardBreakNode,
  emphasis: EmphasisNode,
  strong: StrongNode,
  strikethrough: StrikethroughNode,
  highlight: HighlightNode,
  insert: InsertNode,
  subscript: SubscriptNode,
  superscript: SuperscriptNode,
  html_inline: HtmlInlineNode,
  emoji: EmojiNode,
  checkbox: CheckboxNode,
  math_inline: MathInlineNodeAsync,
  checkbox_input: CheckboxNode,
  reference: ReferenceNode,
  footnote_anchor: FootnoteAnchorNode,
  footnote_reference: FootnoteReferenceNode,
  ...overrides,
}
const katexReady = useKatexReady()
</script>

<template>
  <p dir="auto" class="paragraph-node">
    <template v-for="(child, index) in node.children">
      <component
        :is="nodeComponents[child.type]"
        v-if="child.type !== 'text'"
        :key="`${indexKey || 'paragraph'}-${index}`"
        :node="child"
        :index-key="`${indexKey}-${index}`"
        :custom-id="props.customId"
      />
      <span
        v-else
        :key="`${indexKey || 'paragraph'}-${index}`"
        :class="[katexReady && child.center ? 'text-node-center' : '']"
        class="whitespace-pre-wrap break-words text-node"
      >
        {{ child.content }}
      </span>
    </template>
  </p>
</template>

<style scoped>
.paragraph-node{
  margin: 1.25em 0;
}
li .paragraph-node{
  margin: 0;
}
.text-node {
  display: inline;
  font-weight: inherit;
  vertical-align: baseline;
}
.text-node-center {
  display: inline-flex;
  justify-content: center;
  width: 100%;
}
</style>
