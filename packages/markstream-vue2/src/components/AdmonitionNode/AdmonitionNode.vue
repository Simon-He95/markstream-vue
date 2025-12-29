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
  <div class="admonition" :class="[`admonition-${props.node.kind}`, props.isDark ? 'is-dark' : '']">
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
/* 变量默认（浅色主题）*/
.admonition {
  --admonition-bg: #f8f8f8;
  --admonition-border: #eaecef;
  --admonition-header-bg: rgba(0, 0, 0, 0.03);
  --admonition-text: #111827;
  --admonition-muted: #374151;

  --admonition-note-color: #448aff;
  --admonition-tip-color: #00bfa5;
  --admonition-warning-color: #ff9100;
  --admonition-danger-color: #ff5252;

  margin: 1rem 0;
  padding: 0;
  border-radius: 4px;
  border-left: 4px solid var(--admonition-border);
  background-color: var(--admonition-bg);
  color: var(--admonition-text);
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

.admonition-icon {
  margin-right: 0.5rem;
  color: inherit;
}

.admonition-content {
  padding: 0.5rem 1rem 1rem;
  color: var(--admonition-text);
}

/* 各种类型只控制边框与 header 颜色（使用更轻的 header 背景，以免过于抢眼） */
.admonition-note {
  border-left-color: var(--admonition-note-color);
}
.admonition-note .admonition-header {
  background-color: rgba(68, 138, 255, 0.06);
  color: var(--admonition-note-color);
}

.admonition-info {
  border-left-color: var(--admonition-note-color);
}
.admonition-info .admonition-header {
  background-color: rgba(68, 138, 255, 0.06);
  color: var(--admonition-note-color);
}

.admonition-tip {
  border-left-color: var(--admonition-tip-color);
}
.admonition-tip .admonition-header {
  background-color: rgba(0, 191, 165, 0.06);
  color: var(--admonition-tip-color);
}

.admonition-warning {
  border-left-color: var(--admonition-warning-color);
}
.admonition-warning .admonition-header {
  background-color: rgba(255, 145, 0, 0.06);
  color: var(--admonition-warning-color);
}

.admonition-danger {
  border-left-color: var(--admonition-danger-color);
}
.admonition-danger .admonition-header {
  background-color: rgba(255, 82, 82, 0.06);
  color: var(--admonition-danger-color);
}

.admonition-error {
  border-left-color: var(--admonition-danger-color);
}
.admonition-error .admonition-header {
  background-color: rgba(255, 82, 82, 0.06);
  color: var(--admonition-danger-color);
}

.admonition-caution {
  border-left-color: var(--admonition-warning-color);
}
.admonition-caution .admonition-header {
  background-color: rgba(255, 145, 0, 0.06);
  color: var(--admonition-warning-color);
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
  border-radius: 4px;
  font-size: 0.9rem;
}
.admonition-toggle:focus {
  outline: 2px solid rgba(0,0,0,0.08);
  outline-offset: 2px;
}

/* 深色模式支持：支持 props.isDark（组件级）与系统偏好（媒体查询） */
.admonition.is-dark {
  --admonition-bg: #0b1220;
  --admonition-border: rgba(255, 255, 255, 0.06);
  --admonition-header-bg: rgba(255, 255, 255, 0.03);
  --admonition-text: #e6eef8;
  --admonition-muted: #cbd5e1;
}

/* 当组件通过 props.isDark 指定为暗色时，增强语义色块 */
.admonition.is-dark .admonition-note .admonition-header,
.admonition.is-dark .admonition-info .admonition-header {
  background-color: rgba(68, 138, 255, 0.12);
  color: var(--admonition-note-color);
}
.admonition.is-dark .admonition-tip .admonition-header {
  background-color: rgba(0, 191, 165, 0.12);
  color: var(--admonition-tip-color);
}
.admonition.is-dark .admonition-warning .admonition-header {
  background-color: rgba(255, 145, 0, 0.12);
  color: var(--admonition-warning-color);
}
.admonition.is-dark .admonition-danger .admonition-header {
  background-color: rgba(255, 82, 82, 0.12);
  color: var(--admonition-danger-color);
}

@media (prefers-color-scheme: dark) {
  .admonition {
    --admonition-bg: #0b1220;
    --admonition-border: rgba(255, 255, 255, 0.06);
    --admonition-header-bg: rgba(255, 255, 255, 0.03);
    --admonition-text: #e6eef8;
    --admonition-muted: #cbd5e1;
  }

  /* 在暗色里稍微增强 header 的语义色块 */
  .admonition-note .admonition-header,
  .admonition-info .admonition-header {
    background-color: rgba(68, 138, 255, 0.12);
    color: var(--admonition-note-color);
  }
  .admonition-tip .admonition-header {
    background-color: rgba(0, 191, 165, 0.12);
    color: var(--admonition-tip-color);
  }
  .admonition-warning .admonition-header {
    background-color: rgba(255, 145, 0, 0.12);
    color: var(--admonition-warning-color);
  }
  .admonition-danger .admonition-header {
    background-color: rgba(255, 82, 82, 0.12);
    color: var(--admonition-danger-color);
  }
}
</style>
