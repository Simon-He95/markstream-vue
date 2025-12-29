<script setup lang="ts">
import NodeRenderer from '../NodeRenderer'

// 定义定义项节点
interface DefinitionItemNode {
  type: 'definition_item'
  term: { type: string, raw: string }[]
  definition: { type: string, raw: string }[]
  raw: string
}

// 定义定义列表节点
interface DefinitionListNode {
  type: 'definition_list'
  items: DefinitionItemNode[]
  raw: string
}

// 接收props
const props = defineProps<{
  node: DefinitionListNode
  indexKey: string | number
  typewriter?: boolean
  customId?: string
}>()

// 定义事件
defineEmits(['copy'])
</script>

<template>
  <dl class="definition-list">
    <template v-for="(item, index) in props.node.items" :key="index">
      <dt class="definition-term">
        <NodeRenderer
          :index-key="`definition-term-${props.indexKey}-${index}`"
          :nodes="item.term"
          :custom-id="props.customId"
          :typewriter="props.typewriter"
          @copy="$emit('copy', $event)"
        />
      </dt>
      <dd class="definition-desc">
        <NodeRenderer
          :index-key="`definition-desc-${props.indexKey}-${index}`"
          :nodes="item.definition"
          :custom-id="props.customId"
          :typewriter="props.typewriter"
          @copy="$emit('copy', $event)"
        />
      </dd>
    </template>
  </dl>
</template>

<style scoped>
.definition-list {
  margin: 0 0 1rem;
}

.definition-term {
  font-weight: 600;
  margin-top: 0.5rem;
}

.definition-desc {
  margin-left: 1rem;
  margin-bottom: 0.5rem;
}

/* 避免列表中嵌套 NodeRenderer 的 content-visibility 导致空白占位 */
.definition-list :deep(.markdown-renderer) {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}
</style>
