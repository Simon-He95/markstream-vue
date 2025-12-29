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
import StrikethroughNode from '../StrikethroughNode'
import StrongNode from '../StrongNode'
import SuperscriptNode from '../SuperscriptNode'
import TextNode from '../TextNode'

interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

const props = defineProps<{
  node: {
    type: 'subscript'
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
  html_inline: HtmlInlineNode,
  strong: StrongNode,
  emphasis: EmphasisNode,
  footnote_reference: FootnoteReferenceNode,
  strikethrough: StrikethroughNode,
  highlight: HighlightNode,
  insert: InsertNode,
  superscript: SuperscriptNode,
  emoji: EmojiNode,
  math_inline: MathInlineNodeAsync,
  reference: ReferenceNode,
  ...overrides,
}
</script>

<template>
  <sub class="subscript-node">
    <template v-for="(child, index) in node.children">
      <component
        :is="nodeComponents[child.type]"
        v-if="nodeComponents[child.type]"
        :key="`${indexKey || 'subscript'}-${index}`"
        :node="child"
        :custom-id="props.customId"
        :index-key="`${indexKey || 'subscript'}-${index}`"
      />
      <span
        v-else
        :key="`${indexKey || 'subscript'}-${index}`"
      >
        {{ child.content || child.raw }}
      </span>
    </template>
  </sub>
</template>

<style scoped>
.subscript-node {
  font-size: 0.8em;
  vertical-align: sub;
}
</style>
