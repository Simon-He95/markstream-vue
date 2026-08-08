<script setup lang="ts">
import type { BaseNode, HtmlPolicy, ParsedNode } from 'stream-markdown-parser'
import type { CodeBlockNodeProps, CodeBlockPreviewPayload, CodeBlockTheme, ShikiCodeBlockProps } from '../../types/component-props'
import { normalizeShikiLanguage } from 'markstream-core'
import { normalizeCustomHtmlTags } from 'stream-markdown-parser'
import { computed, provide } from 'vue-demi'
import AdmonitionNode from '../../components/AdmonitionNode'
import BlockquoteNode from '../../components/BlockquoteNode'
import CheckboxNode from '../../components/CheckboxNode'
import DefinitionListNode from '../../components/DefinitionListNode'
import EmojiNode from '../../components/EmojiNode'
import EmphasisNode from '../../components/EmphasisNode'
import FootnoteAnchorNode from '../../components/FootnoteAnchorNode'
import FootnoteNode from '../../components/FootnoteNode'
import FootnoteReferenceNode from '../../components/FootnoteReferenceNode'
import HardBreakNode from '../../components/HardBreakNode'
import HeadingNode from '../../components/HeadingNode'
import HighlightNode from '../../components/HighlightNode'
import ImageNode from '../../components/ImageNode'
import InlineCodeNode from '../../components/InlineCodeNode'
import InsertNode from '../../components/InsertNode'
import LinkNode from '../../components/LinkNode'
import ListItemNode from '../../components/ListItemNode'
import ListNode from '../../components/ListNode'
import ParagraphNode from '../../components/ParagraphNode'
import PreCodeNode from '../../components/PreCodeNode'
import ReferenceNode from '../../components/ReferenceNode'
import StrikethroughNode from '../../components/StrikethroughNode'
import StrongNode from '../../components/StrongNode'
import SubscriptNode from '../../components/SubscriptNode'
import SuperscriptNode from '../../components/SuperscriptNode'
import TableNode from '../../components/TableNode'
import TextNode from '../../components/TextNode'
import ThematicBreakNode from '../../components/ThematicBreakNode'
import VmrContainerNode from '../../components/VmrContainerNode'
import { normalizeLanguageIdentifier } from '../../utils'
import { getCodeBlockExtraProps } from '../../utils/codeBlockExtraProps'
import { getHtmlTagFromContent, shouldRenderUnknownHtmlTagAsText, stripCustomHtmlWrapper } from '../../utils/htmlRenderer'
import { customComponentsRevision, getCustomNodeComponents } from '../../utils/nodeComponents'
import HtmlBlockNode from '../HtmlBlockNode/HtmlBlockNode.vue'
import HtmlInlineNode from '../HtmlInlineNode/HtmlInlineNode.vue'
import { MathBlockNodeAsync, MathInlineNodeAsync } from './asyncComponent'
import FallbackComponent from './FallbackComponent.vue'

type NodeRendererCodeBlockThemes
  = CodeBlockNodeProps['themes']
    | ShikiCodeBlockProps['themes']

type NodeRendererCodeBlockProps
  = Partial<Omit<CodeBlockNodeProps, 'node' | 'themes'>>
    & Partial<Omit<ShikiCodeBlockProps, 'themes'>>
    & {
      themes?: NodeRendererCodeBlockThemes
    }
    & Record<string, unknown>

const props = withDefaults(defineProps<{
  nodes?: BaseNode[]
  customId?: string
  indexKey?: number | string
  typewriter?: boolean
  fade?: boolean
  showTooltips?: boolean
  codeBlockStream?: boolean
  codeBlockDarkTheme?: CodeBlockTheme
  codeBlockLightTheme?: CodeBlockTheme
  codeBlockMinWidth?: string | number
  codeBlockMaxWidth?: string | number
  codeBlockProps?: NodeRendererCodeBlockProps
  renderCodeBlocksAsPre?: boolean
  /**
   * Theme names or theme objects preloaded for enhanced (stream-diffs) code
   * blocks. When Shiki code blocks are used, only string theme names are
   * forwarded to stream-markdown; theme objects are ignored.
   */
  themes?: CodeBlockTheme[]
  /**
   * Shiki language preload list forwarded to stream-markdown.
   *
   * Used when a custom `code_block` or language renderer uses stream-markdown.
   */
  langs?: readonly string[]
  isDark?: boolean
  customHtmlTags?: readonly string[]
  htmlPolicy?: HtmlPolicy
}>(), {
  codeBlockStream: true,
  showTooltips: true,
  typewriter: false,
  fade: true,
})

const emit = defineEmits<{
  (e: 'copy', code: string): void
  (e: 'copy-code', code: string): void
  (e: 'handleArtifactClick', payload: CodeBlockPreviewPayload): void
  (e: 'click', event: MouseEvent): void
}>()

provide('markstreamTypewriter', computed(() => props.typewriter === true))
provide('markstreamFade', computed(() => props.fade !== false))

function isNativeDomEvent(value: unknown): value is Event {
  return typeof Event !== 'undefined' && value instanceof Event
}

function handleCopy(payload: unknown) {
  if (isNativeDomEvent(payload))
    return

  if (typeof payload === 'string') {
    // eslint-disable-next-line vue/custom-event-name-casing -- Public copy-code event is kebab-case.
    emit('copy-code', payload)
    emit('copy', payload)
    return
  }

  emit('copy', payload as string)
}

function handleArtifactClick(payload: CodeBlockPreviewPayload) {
  emit('handleArtifactClick', payload)
}

const nodeComponents = {
  text: TextNode,
  paragraph: ParagraphNode,
  heading: HeadingNode,
  code_block: PreCodeNode,
  list: ListNode,
  list_item: ListItemNode,
  blockquote: BlockquoteNode,
  table: TableNode,
  definition_list: DefinitionListNode,
  footnote: FootnoteNode,
  footnote_reference: FootnoteReferenceNode,
  footnote_anchor: FootnoteAnchorNode,
  admonition: AdmonitionNode,
  vmr_container: VmrContainerNode,
  hardbreak: HardBreakNode,
  link: LinkNode,
  image: ImageNode,
  thematic_break: ThematicBreakNode,
  math_inline: MathInlineNodeAsync,
  math_block: MathBlockNodeAsync,
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
  inline_code: InlineCodeNode,
  html_inline: HtmlInlineNode,
  html_block: HtmlBlockNode,
  reference: ReferenceNode,
}

const customComponentsMap = computed(() => {
  void customComponentsRevision.value
  return getCustomNodeComponents(props.customId)
})
const indexPrefix = computed(() => (props.indexKey != null ? String(props.indexKey) : 'legacy-renderer'))
const codeBlockExtraProps = computed(() => getCodeBlockExtraProps(props.codeBlockProps))
const builtinCodeBlockExtraProps = computed(() =>
  getCodeBlockExtraProps(props.codeBlockProps, { omit: ['langs'] }),
)
const codeBlockBindings = computed(() => ({
  stream: props.codeBlockStream,
  darkTheme: props.codeBlockDarkTheme,
  lightTheme: props.codeBlockLightTheme,
  themes: props.themes,
  minWidth: props.codeBlockMinWidth,
  maxWidth: props.codeBlockMaxWidth,
  ...builtinCodeBlockExtraProps.value,
}))
const customCodeBlockBindings = computed(() => ({
  ...codeBlockBindings.value,
  langs: props.langs,
  ...codeBlockExtraProps.value,
}))
const nonCodeBindings = computed(() => ({ typewriter: props.typewriter, fade: props.fade, htmlPolicy: props.htmlPolicy ?? 'safe' }))
const linkBindings = computed(() => ({
  ...nonCodeBindings.value,
  ...(typeof props.showTooltips === 'boolean' ? { showTooltip: props.showTooltips } : {}),
}))
const listBindings = computed(() => ({
  ...nonCodeBindings.value,
  ...(typeof props.showTooltips === 'boolean' ? { showTooltips: props.showTooltips } : {}),
}))
// Set of effective custom HTML tags (normalised to lowercase).
const effectiveCustomHtmlTagsSet = computed<Set<string>>(() => {
  return new Set(normalizeCustomHtmlTags(props.customHtmlTags))
})

const renderedItems = computed(() => {
  const nodes = Array.isArray(props.nodes) ? props.nodes : []
  return nodes.map((rawNode, index) => {
    let node = rawNode as ParsedNode
    const type = String((rawNode as any)?.type || 'unknown')
    const language = getCodeBlockLanguage(node)
    let component = getNodeComponent(node, language)

    // Coerce html_block/html_inline nodes whose tag matches a registered
    // custom component listed in customHtmlTags.
    if (
      (node.type === 'html_block' || node.type === 'html_inline')
      && component === (nodeComponents as any)[node.type]
    ) {
      const tag = String((node as any).tag ?? '').trim().toLowerCase()
        || getHtmlTagFromContent((node as any).content)
      if (tag) {
        // Check if tag is whitelisted in customHtmlTags
        if (effectiveCustomHtmlTagsSet.value.has(tag)) {
          const customComponents = customComponentsMap.value
          const customForTag = (customComponents as any)[tag]
          if (customForTag) {
            component = customForTag
            node = {
              ...(node as any),
              type: tag,
              tag,
              content: stripCustomHtmlWrapper((node as any).content, tag),
            } as ParsedNode
          }
        }
        else if (shouldRenderUnknownHtmlTagAsText((node as any).content ?? (node as any).raw, tag)) {
          const rawContent = String((node as any).content ?? (node as any).raw ?? '')
          if (node.type === 'html_inline') {
            component = TextNode
            node = {
              type: 'text',
              content: rawContent,
              raw: rawContent,
            } as ParsedNode
          }
          else {
            component = ParagraphNode
            node = {
              type: 'paragraph',
              children: [{ type: 'text', content: rawContent, raw: rawContent }],
              raw: rawContent,
            } as ParsedNode
          }
        }
      }
    }

    return {
      index,
      indexKey: `${indexPrefix.value}-${index}`,
      // Keep code blocks mounted during streaming so Shiki/stream-diffs renderers can
      // preserve their last successful DOM instead of flashing back to <pre>.
      renderKey: type === 'code_block'
        ? `${indexPrefix.value}-${index}-${type}`
        : `${indexPrefix.value}-${index}-${type}-${String((rawNode as any)?.raw || '').length}`,
      node,
      isCodeBlock: node?.type === 'code_block',
      component,
      bindings: getBindingsFor(node, language, component),
    }
  })
})

function getCodeBlockLanguage(node: ParsedNode) {
  return node?.type === 'code_block'
    ? String((node as any).language ?? '').trim().toLowerCase()
    : ''
}

function getCustomCodeLanguageComponent(
  customComponents: Record<string, unknown>,
  language: string,
) {
  const raw = language.trim().toLowerCase()
  if (!raw)
    return undefined

  for (const key of [raw, normalizeLanguageIdentifier(raw), normalizeShikiLanguage(raw)]) {
    const component = key && customComponents[key]
    if (component)
      return component
  }

  return undefined
}

function getNodeComponent(node: ParsedNode, language?: string) {
  if (!node)
    return FallbackComponent
  const customComponents = customComponentsMap.value
  const customForType = (customComponents as any)[String((node as any).type)]
  if (node.type === 'code_block') {
    const lang = language ?? getCodeBlockLanguage(node)
    const customForLanguage = lang
      ? getCustomCodeLanguageComponent(customComponents as any, lang)
      : undefined
    if (customForLanguage)
      return customForLanguage

    if (lang === 'mermaid') {
      const customMermaid = (customComponents as any).mermaid
      return customMermaid || PreCodeNode
    }
    if (lang === 'infographic') {
      const customInfographic = (customComponents as any).infographic
      return customInfographic || PreCodeNode
    }
    if (lang === 'd2' || lang === 'd2lang') {
      const customD2 = (customComponents as any).d2
      return customD2 || PreCodeNode
    }
    if (customForType)
      return customForType
    const customCodeBlock = (customComponents as any).code_block
    return customCodeBlock || (props.renderCodeBlocksAsPre ? PreCodeNode : PreCodeNode)
  }
  if (customForType)
    return customForType
  return (nodeComponents as any)[String((node as any).type)] || FallbackComponent
}

function isCustomCodeBlockComponent(component: unknown) {
  return Boolean(component && component === customComponentsMap.value.code_block)
}

function isCustomLanguageCodeBlockComponent(component: unknown, language?: string) {
  return Boolean(component && language && component === getCustomCodeLanguageComponent(customComponentsMap.value as any, language))
}

function getBindingsFor(node: ParsedNode, language?: string, component?: unknown) {
  const lang = language ?? getCodeBlockLanguage(node)
  if (node.type === 'code_block' && isCustomLanguageCodeBlockComponent(component, lang)) {
    if (lang === 'mermaid' || lang === 'infographic' || lang === 'd2' || lang === 'd2lang')
      return {}

    return customCodeBlockBindings.value
  }

  if (
    node.type === 'code_block'
    && isCustomCodeBlockComponent(component)
  ) {
    return customCodeBlockBindings.value
  }

  if (lang === 'mermaid' || lang === 'infographic' || lang === 'd2' || lang === 'd2lang')
    return {}
  if (node.type === 'link')
    return linkBindings.value
  if (node.type === 'list')
    return listBindings.value
  return node.type === 'code_block'
    ? codeBlockBindings.value
    : nonCodeBindings.value
}

function handleClick(event: MouseEvent) {
  emit('click', event)
}
</script>

<template>
  <div class="markstream-vue2 markdown-renderer legacy-nodes-renderer" :class="{ dark: props.isDark }" @click="handleClick">
    <div
      v-for="item in renderedItems"
      :key="item.renderKey"
      class="node-slot"
      :data-node-index="item.index"
      :data-node-type="item.node.type"
    >
      <div class="node-content">
        <component
          :is="item.component"
          :key="`${item.renderKey}-component`"
          :node="item.node"
          :loading="item.node.loading"
          :index-key="item.indexKey"
          v-bind="item.bindings"
          :custom-id="props.customId"
          :is-dark="props.isDark"
          @copy="handleCopy"
          @handle-artifact-click="handleArtifactClick"
        />
      </div>
    </div>
  </div>
</template>
