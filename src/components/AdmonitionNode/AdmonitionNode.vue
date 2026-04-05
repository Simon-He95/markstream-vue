<script setup lang="ts">
import { computed, ref } from 'vue'
import NodeRenderer from '../NodeRenderer'

// 定义警告块节点类型
export type AdmonitionKind = 'note' | 'info' | 'tip' | 'warning' | 'danger' | 'caution' | 'error'

interface AdmonitionNode {
  type: 'admonition'
  kind: AdmonitionKind
  title?: string
  children: { type: string, raw: string }[]
  raw: string
  // 可选：是否支持折叠
  collapsible?: boolean
  // 可选：初始是否展开，默认 true
  open?: boolean
}

// 接收 props（并在 script 中使用）
const props = defineProps<{ node: AdmonitionNode, indexKey: number | string, isDark?: boolean, typewriter?: boolean, customId?: string }>()
// 定义事件
const emit = defineEmits(['copy'])

// 不同类型的警告块图标（显式类型以便编辑器提示）
const iconMap: Record<AdmonitionKind, string> = {
  note: 'ℹ️',
  info: 'ℹ️',
  tip: '💡',
  warning: '⚠️',
  danger: '❗',
  // 'error' is a common alias for 'danger' in some markdown flavors
  error: '⛔',
  caution: '⚠️',
}

// 当 title 为空时使用 kind 作为回退（首字母大写）
const displayTitle = computed(() => {
  if (props.node.title && props.node.title.trim().length)
    return props.node.title
  const k = props.node.kind || 'note'
  return k.charAt(0).toUpperCase() + k.slice(1)
})

// 支持折叠：如果 props.node.collapsible 为 true，则依据 props.node.open 初始化
const collapsed = ref<boolean>(props.node.collapsible ? !(props.node.open ?? true) : false)
function toggleCollapse() {
  if (!props.node.collapsible)
    return
  collapsed.value = !collapsed.value
}

// 为无障碍生成 ID（用于 aria-labelledby）
const headerId = `admonition-${Math.random().toString(36).slice(2, 9)}`
</script>

<template>
  <div class="admonition" :class="[`admonition-${props.node.kind}`]">
    <div :id="headerId" class="admonition-header">
      <span v-if="iconMap[props.node.kind]" class="admonition-icon">{{ iconMap[props.node.kind] }}</span>
      <span class="admonition-title">{{ displayTitle }}</span>

      <!-- 可选的折叠控制（放在 header 末端） -->
      <button
        v-if="props.node.collapsible"
        class="admonition-toggle"
        :aria-expanded="!collapsed"
        :aria-controls="`${headerId}-content`"
        :title="collapsed ? 'Expand' : 'Collapse'"
        @click="toggleCollapse"
      >
        <span v-if="collapsed">▶</span>
        <span v-else>▼</span>
      </button>
    </div>

    <div
      v-show="!collapsed"
      :id="`${headerId}-content`"
      class="admonition-content"
      :aria-labelledby="headerId"
    >
      <NodeRenderer
        :index-key="`admonition-${indexKey}`"
        :nodes="props.node.children"
        :custom-id="props.customId"
        :typewriter="props.typewriter"
        @copy="emit('copy', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
/* Base admonition — consumes semantic tokens from .markstream-vue */
.admonition {
  margin: 1rem 0;
  padding: 0;
  border-radius: var(--ms-radius);
  border-left: 4px solid var(--admonition-border);
  background-color: var(--admonition-bg);
  color: var(--admonition-fg);
  overflow: hidden;
}

.admonition-header {
  padding: 0.5rem 1rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  background-color: var(--admonition-header-bg);
  color: var(--admonition-muted);
}

.admonition-content {
  padding: 0.5rem 1rem 1rem;
  color: var(--admonition-fg);
}

.admonition-icon {
  margin-right: 0.5rem;
  color: inherit;
}

/* Type variants — border + header color via semantic tokens */
.admonition-note,
.admonition-info {
  border-left-color: var(--admonition-note);
}
.admonition-note .admonition-header,
.admonition-info .admonition-header {
  background-color: var(--admonition-note-header-bg);
  color: var(--admonition-note);
}

.admonition-tip {
  border-left-color: var(--admonition-tip);
}
.admonition-tip .admonition-header {
  background-color: var(--admonition-tip-header-bg);
  color: var(--admonition-tip);
}

.admonition-warning,
.admonition-caution {
  border-left-color: var(--admonition-warning);
}
.admonition-warning .admonition-header,
.admonition-caution .admonition-header {
  background-color: var(--admonition-warn-header-bg);
  color: var(--admonition-warning);
}

.admonition-danger,
.admonition-error {
  border-left-color: var(--admonition-danger);
}
.admonition-danger .admonition-header,
.admonition-error .admonition-header {
  background-color: var(--admonition-danger-header-bg);
  color: var(--admonition-danger);
}

/* 修复：当一次性渲染大量内容并滚动到 AdmonitionNode 时，
   内部 NodeRenderer（.markdown-renderer）使用 content-visibility: auto
   可能导致占位高度很高但未及时绘制。这里在告示块内部禁用该优化，
   保证内容按时渲染，避免“空白但很高”的现象。*/
.admonition-content :deep(.markdown-renderer) {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}

/* 折叠按钮样式 */
.admonition-toggle {
  margin-left: auto;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: var(--ms-radius);
  font-size: 0.9rem;
}
.admonition-toggle:focus {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

</style>
