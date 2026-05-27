<script setup lang="ts">
import type { HtmlPolicy } from 'stream-markdown-parser'
import type { NodeRendererProps } from '../../types/node-renderer-props'
import { normalizeCustomHtmlTags } from 'stream-markdown-parser'
import { computed, defineAsyncComponent, inject } from 'vue'
import { getCustomNodeAttrs, getHtmlTagFromContent, shouldRenderUnknownHtmlTagAsText } from '../../utils/htmlRenderer'
import { isReservedNodeComponentKey, useCustomNodeComponents } from '../../utils/nodeComponents'
import CheckboxNode from '../CheckboxNode'
import EmojiNode from '../EmojiNode'
import EmphasisNode from '../EmphasisNode'
import FootnoteAnchorNode from '../FootnoteAnchorNode'
import FootnoteReferenceNode from '../FootnoteReferenceNode'
import HardBreakNode from '../HardBreakNode'
import HighlightNode from '../HighlightNode'
import HtmlBlockNode from '../HtmlBlockNode'
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
import TextNode from '../TextNode'

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
  customHtmlTags?: readonly string[]
  parseOptions?: NodeRendererProps['parseOptions']
  customMarkdownIt?: NodeRendererProps['customMarkdownIt']
}>()

const overrides = useCustomNodeComponents(() => props.customId)
const inheritedHtmlPolicy = inject<{ value?: HtmlPolicy } | undefined>('markstreamHtmlPolicy', undefined)
const inheritedParseOptions = inject<{ value?: NodeRendererProps['parseOptions'] } | undefined>('markstreamParseOptions', undefined)
const inheritedCustomMarkdownIt = inject<{ value?: NodeRendererProps['customMarkdownIt'] } | undefined>('markstreamCustomMarkdownIt', undefined)
const inheritedNestedRendererProps = inject<{ value?: Partial<NodeRendererProps> } | undefined>('markstreamNestedRendererProps', undefined)
const resolvedHtmlPolicy = computed<HtmlPolicy>(() => inheritedHtmlPolicy?.value ?? 'safe')
const resolvedParseOptions = computed(() => props.parseOptions ?? inheritedParseOptions?.value)
const resolvedCustomMarkdownIt = computed(() => props.customMarkdownIt ?? inheritedCustomMarkdownIt?.value)
const resolvedCustomHtmlTags = computed(() => props.customHtmlTags ?? inheritedNestedRendererProps?.value?.customHtmlTags)
const nestedRendererProps = computed<Partial<NodeRendererProps>>(() => {
  const inherited = inheritedNestedRendererProps?.value ?? {}
  return {
    ...inherited,
    customId: props.customId ?? inherited.customId,
    customHtmlTags: resolvedCustomHtmlTags.value,
    parseOptions: resolvedParseOptions.value,
    customMarkdownIt: resolvedCustomMarkdownIt.value,
    htmlPolicy: resolvedHtmlPolicy.value,
  }
})
const StructuredNodeRenderer = defineAsyncComponent({
  loader: () => import('../NodeRenderer'),
  suspensible: false,
})

function isWhitespaceText(child: NodeChild) {
  return child.type === 'text' && String((child as any).content ?? '').trim() === ''
}

function getTextContent(child: NodeChild) {
  return String((child as any).content ?? '')
}

function getMeaningfulLinkChildren(child: NodeChild) {
  if (child.type !== 'link' || !Array.isArray((child as any).children))
    return []

  return (child as any).children.filter((linkChild: NodeChild) => !isWhitespaceText(linkChild))
}

function isImageOnlyLink(child: NodeChild) {
  const linkChildren = getMeaningfulLinkChildren(child)
  return linkChildren.length === 1 && linkChildren[0]?.type === 'image'
}

const meaningfulChildren = computed(() => props.node.children.filter(child => !isWhitespaceText(child)))

const isMediaOnlyParagraph = computed(() => (
  meaningfulChildren.value.length > 0
  && meaningfulChildren.value.every(child => child.type === 'image' || isImageOnlyLink(child))
))

const customHtmlTagsSet = computed<Set<string>>(() => {
  return new Set(normalizeCustomHtmlTags(resolvedCustomHtmlTags.value))
})

const renderedChildren = computed(() => {
  if (!isMediaOnlyParagraph.value || meaningfulChildren.value.length <= 1)
    return props.node.children

  const children: NodeChild[] = []
  for (let i = 0; i < props.node.children.length; i++) {
    const child = props.node.children[i]
    if (!isWhitespaceText(child)) {
      children.push(child)
      continue
    }

    const hasPrevious = children.length > 0
    const hasNext = props.node.children.slice(i + 1).some(nextChild => !isWhitespaceText(nextChild))
    if (!hasPrevious || !hasNext)
      continue

    children.push({
      ...child,
      content: ' ',
      raw: ' ',
    } as NodeChild)
  }

  return children
})

function getChildProps(child: NodeChild, index: number) {
  return {
    'node': child,
    'index-key': `${props.indexKey}-${index}`,
    'custom-id': props.customId,
    'custom-html-tags': resolvedCustomHtmlTags.value,
  }
}

const nodeComponents = computed(() => ({
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
  html_block: HtmlBlockNode,
  emoji: EmojiNode,
  checkbox: CheckboxNode,
  math_inline: MathInlineNodeAsync,
  checkbox_input: CheckboxNode,
  reference: ReferenceNode,
  footnote_anchor: FootnoteAnchorNode,
  footnote_reference: FootnoteReferenceNode,
  text: TextNode,
  ...overrides.value,
}))

// Process children to handle non-whitelisted custom HTML tags
function processChild(child: NodeChild): { child: NodeChild, component: any, isCustomComponent: boolean } {
  if (child.type === 'html_block' || child.type === 'html_inline') {
    const tag = String((child as any).tag ?? '').trim().toLowerCase()
      || getHtmlTagFromContent((child as any).content)

    if (tag && !customHtmlTagsSet.value.has(tag) && shouldRenderUnknownHtmlTagAsText((child as any).content ?? (child as any).raw, tag)) {
      const rawContent = String((child as any).content ?? (child as any).raw ?? '')

      return {
        child: {
          type: 'text',
          content: rawContent,
          raw: rawContent,
        } as NodeChild,
        component: TextNode,
        isCustomComponent: false,
      }
    }
  }

  return {
    child,
    component: (nodeComponents.value as any)[child.type],
    isCustomComponent: Boolean((overrides.value as any)[child.type] && !isReservedNodeComponentKey(String(child.type))),
  }
}

const processedChildren = computed(() => renderedChildren.value.map((child, index) => {
  const processed = processChild(child)
  return {
    ...processed,
    index,
    key: `${props.indexKey || 'paragraph'}-${index}`,
    customAttrs: processed.isCustomComponent
      ? getCustomNodeAttrs(processed.child as any, resolvedHtmlPolicy.value)
      : undefined,
    hasSlotChildren: Array.isArray((processed.child as any).children) && (processed.child as any).children.length > 0,
    slotContent: String((processed.child as any).content ?? ''),
    originalChild: child,
  }
}))
</script>

<template>
  <p dir="auto" class="paragraph-node">
    <template
      v-for="item in processedChildren"
      :key="item.key"
    >
      <template v-if="isMediaOnlyParagraph && isWhitespaceText(item.originalChild)">
        {{ getTextContent(item.originalChild) }}
      </template>
      <component
        :is="item.component"
        v-else-if="item.isCustomComponent"
        v-bind="item.customAttrs"
        :node="item.child"
        :loading="(item.child as any).loading"
        :index-key="item.key"
        :custom-id="props.customId"
        :custom-html-tags="resolvedCustomHtmlTags"
        :is-dark="nestedRendererProps.isDark"
      >
        <StructuredNodeRenderer
          v-if="item.hasSlotChildren"
          v-bind="nestedRendererProps"
          :nodes="(item.child as any).children"
          :index-key="item.key"
          :batch-rendering="false"
          :defer-nodes-until-visible="false"
          :render-as-fragment="true"
        />
        <StructuredNodeRenderer
          v-else-if="item.slotContent"
          v-bind="nestedRendererProps"
          :content="item.slotContent"
          :final="!(item.child as any).loading"
          :index-key="`${item.key}-content`"
          :smooth-streaming="false"
          :batch-rendering="false"
          :defer-nodes-until-visible="false"
          :render-as-fragment="true"
        />
      </component>
      <component
        :is="item.component"
        v-else
        v-bind="getChildProps(item.child, item.index)"
      />
    </template>
  </p>
</template>

<style scoped>
.paragraph-node{
  font-size: var(--ms-text-body);
  line-height: var(--ms-leading-body);
  margin: var(--ms-flow-paragraph-y) 0;
}
li .paragraph-node{
  margin: 0;
}
</style>
