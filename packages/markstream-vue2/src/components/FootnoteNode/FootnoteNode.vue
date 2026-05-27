<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue-demi'
import { isLegacyVue26Vm } from '../../utils/vue26'
import NodeRenderer from '../NodeRenderer'
import LegacyNodesRenderer from '../NodeRenderer/LegacyNodesRenderer.vue'

// 定义脚注节点
interface FootnoteNode {
  type: 'footnote'
  id: string
  children: { type: string, raw: string }[]
  raw: string
}

// 接收props
const props = defineProps<{
  node: FootnoteNode
  indexKey: string | number
  typewriter?: boolean
  customId?: string
}>()

// 定义事件
defineEmits(['copy'])
const instance = getCurrentInstance()
const nestedRenderer = computed(() => {
  const vm = instance?.proxy as any
  return isLegacyVue26Vm(vm) ? LegacyNodesRenderer : NodeRenderer
})
</script>

<template>
  <div
    :id="`fnref--${node.id}`"
    class="footnote-node flex text-sm leading-relaxed border-t border-[var(--footnote-border,#eaecef)] pt-2"
  >
    <!-- <span class="font-semibold mr-2 text-[#0366d6]">[{{ node.id }}]</span> -->
    <div class="flex-1">
      <component
        :is="nestedRenderer"
        :index-key="`footnote-${props.indexKey}`"
        :nodes="props.node.children"
        :custom-id="props.customId"
        :typewriter="props.typewriter"
        @copy="$emit('copy', $event)"
      />
    </div>
  </div>
</template>

<style>
.footnote-node {
  margin-top: var(--ms-flow-footnote-y, 0.5em);
  margin-bottom: var(--ms-flow-footnote-y, 0.5em);
}

/* 脚注中嵌套 NodeRenderer 关闭 content-visibility 占位，防止空白内容 */
.markstream-vue2 [class*="footnote-"] .markdown-renderer,
.markstream-vue2 .flex-1 .markdown-renderer {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}
</style>
