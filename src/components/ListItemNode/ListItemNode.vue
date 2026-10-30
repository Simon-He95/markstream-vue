<script setup lang="ts">
import { getPlainTextContent, resolveSimpleInlineChildren } from 'markstream-core'
import { computed, provide } from 'vue'
import { useCustomNodeComponents } from '../../utils/nodeComponents'
import NodeRenderer from '../NodeRenderer'
import SimpleInlineRenderer from '../SimpleInlineRenderer'

// 节点子元素类型
interface NodeChild {
  type: string
  raw: string
  [key: string]: unknown
}

// 列表项类型
interface ListItem {
  type: 'list_item'
  children: NodeChild[]
  raw: string
}

const props = defineProps<{
  /**
   * Preferred prop name for consistency with other node components.
   * `item` is kept for backward compatibility.
   */
  node?: ListItem
  item?: ListItem
  indexKey?: number | string
  customId?: string
  typewriter?: boolean
  fade?: boolean
  showTooltips?: boolean
  value?: number | null
  isDark?: boolean
}>()

defineEmits<{
  copy: [text: string]
}>()

const itemNode = computed(() => props.node ?? props.item)
const customComponents = useCustomNodeComponents(() => props.customId)
const hasParagraphOverride = computed(() =>
  Boolean((customComponents.value as any).paragraph),
)
const hasTextOverride = computed(() =>
  Boolean((customComponents.value as any).text),
)
const simpleBlockChildren = computed(() => {
  return resolveSimpleInlineChildren(itemNode.value?.children as any, !hasParagraphOverride.value)
})
const simpleBlockWithNestedLists = computed(() => {
  if (hasParagraphOverride.value)
    return null

  const children = itemNode.value?.children
  if (!Array.isArray(children) || children.length < 2)
    return null

  const firstChild = children[0]
  if (firstChild?.type !== 'paragraph' || !Array.isArray((firstChild as any).children))
    return null

  const nestedLists = children.slice(1)
  if (!nestedLists.every(child => child?.type === 'list'))
    return null

  const paragraphChildren = resolveSimpleInlineChildren([firstChild] as any)

  return paragraphChildren
    ? {
        paragraphChildren,
        nestedLists,
      }
    : null
})
function canRenderPlainTextInline() {
  return props.fade === false && !hasTextOverride.value
}
const simpleBlockPlainText = computed(() => {
  if (!canRenderPlainTextInline())
    return null

  return getPlainTextContent(simpleBlockChildren.value)
})
const simpleNestedParagraphPlainText = computed(() => {
  if (!canRenderPlainTextInline())
    return null

  return getPlainTextContent(simpleBlockWithNestedLists.value?.paragraphChildren)
})

const EMPTY_LI_VALUE_ATTRS = Object.freeze({}) as Record<string, never>

const liValueAttrs = computed(() => {
  const { value } = props

  return typeof value === 'number' && Number.isFinite(value)
    ? { value }
    : EMPTY_LI_VALUE_ATTRS
})

provide('markstreamShowTooltips', computed(() => props.showTooltips))
provide('markstreamFade', computed(() => props.fade))
</script>

<template>
  <li class="list-item" dir="auto" v-bind="liValueAttrs">
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
        :index-key="`list-item-${props.indexKey}-paragraph`"
      />
    </p>
    <template v-else-if="simpleBlockWithNestedLists">
      <p
        dir="auto"
        class="paragraph-node"
      >
        <span
          v-if="simpleNestedParagraphPlainText !== null"
          class="text-node"
          :custom-id="props.customId"
        >{{ simpleNestedParagraphPlainText }}</span>
        <SimpleInlineRenderer
          v-else
          :nodes="simpleBlockWithNestedLists.paragraphChildren as any"
          :custom-id="props.customId"
          :index-key="`list-item-${props.indexKey}-paragraph`"
        />
      </p>
      <NodeRenderer
        v-for="(nestedList, nestedIndex) in simpleBlockWithNestedLists.nestedLists"
        :key="nestedIndex"
        :nodes="[nestedList]"
        :custom-id="props.customId"
        :index-key="`list-item-${props.indexKey}-nested-${nestedIndex}`"
        :show-tooltips="props.showTooltips"
        :typewriter="props.typewriter"
        :fade="props.fade"
        :is-dark="props.isDark"
        :batch-rendering="false"
        :defer-nodes-until-visible="false"
        :render-as-fragment="true"
        @copy="$emit('copy', $event)"
      />
    </template>
    <NodeRenderer
      v-else
      :show-tooltips="props.showTooltips"
      :index-key="`list-item-${props.indexKey}`"
      :nodes="itemNode?.children ?? []"
      :custom-id="props.customId"
      :typewriter="props.typewriter"
      :fade="props.fade"
      :is-dark="props.isDark"
      :batch-rendering="false"
      @copy="$emit('copy', $event)"
    />
  </li>
</template>

<style scoped>
.list-item {
  margin: var(--ms-flow-list-item-y) 0;
  padding-left: var(--ms-space-1_5);
}

ol > .list-item::marker {
  color: var(--list-counter-marker);
  line-height: 1.6;
}

ul > .list-item::marker {
  color: var(--list-marker);
}

.list-item > .paragraph-node {
  font-size: var(--ms-text-body);
  line-height: var(--ms-leading-body);
  margin: 0;
}

/* 大列表滚动到视口时，嵌套 NodeRenderer 需要立即绘制内容，避免空白 */
.list-item :deep(.markdown-renderer) {
  content-visibility: visible;
  contain-intrinsic-size: 0px 0px;
  contain: content;
}
</style>
