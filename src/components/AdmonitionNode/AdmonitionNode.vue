<script setup lang="ts">
import { computed, ref } from 'vue'
import NodeRenderer from '../NodeRenderer'

export type AdmonitionKind = 'note' | 'info' | 'tip' | 'warning' | 'danger' | 'caution' | 'error'

interface AdmonitionNode {
  type: 'admonition'
  kind: AdmonitionKind
  title?: string
  children: { type: string, raw: string }[]
  raw: string
  collapsible?: boolean
  open?: boolean
}

const props = defineProps<{ node: AdmonitionNode, indexKey: number | string, isDark?: boolean, typewriter?: boolean, fade?: boolean, customId?: string }>()
const emit = defineEmits(['copy'])

const displayTitle = computed(() => {
  if (props.node.title && props.node.title.trim().length)
    return props.node.title
  const k = props.node.kind || 'note'
  return k.charAt(0).toUpperCase() + k.slice(1)
})

const collapsed = ref<boolean>(props.node.collapsible ? !(props.node.open ?? true) : false)
function toggleCollapse() {
  if (!props.node.collapsible)
    return
  collapsed.value = !collapsed.value
}

const headerId = `admonition-${Math.random().toString(36).slice(2, 9)}`
</script>

<template>
  <div class="admonition" :class="[`admonition-${props.node.kind}`]">
    <!-- Legend-style title that sits on the border -->
    <div :id="headerId" class="admonition-legend">
      <!-- SVG icons per type -->
      <svg v-if="props.node.kind === 'note' || props.node.kind === 'info'" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="admonition-icon"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
      <svg v-else-if="props.node.kind === 'tip'" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="admonition-icon"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></svg>
      <svg v-else-if="props.node.kind === 'warning' || props.node.kind === 'caution'" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="admonition-icon"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
      <svg v-else-if="props.node.kind === 'danger' || props.node.kind === 'error'" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="admonition-icon"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>

      <span class="admonition-title">{{ displayTitle }}</span>

      <button
        v-if="props.node.collapsible"
        class="admonition-toggle"
        :aria-expanded="!collapsed"
        :aria-controls="`${headerId}-content`"
        @click="toggleCollapse"
      >
        <svg :style="{ rotate: collapsed ? '0deg' : '90deg' }" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
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
        :fade="props.fade"
        @copy="emit('copy', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
/* ── Base: fieldset/legend style ── */
.admonition {
  position: relative;
  margin: var(--ms-flow-admonition-y) 0;
  padding: 0.25em 0.75em 0.375em;
  border: 1px solid var(--admonition-border);
  border-radius: var(--ms-radius);
  color: var(--admonition-fg);
}

/* ── Legend: sits on top border ── */
.admonition-legend {
  position: absolute;
  top: 0;
  left: 0.75em;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  padding: 0 0.5em;
  background-color: hsl(var(--ms-background));
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1;
}

.admonition-icon {
  flex-shrink: 0;
}

.admonition-title {
  white-space: nowrap;
}

/* ── Content: top padding accounts for legend height ── */
.admonition-content {
  padding-top: 0.25em;
  color: var(--admonition-fg);
}

/* ── Type variants: muted border + subtle tint bg + saturated legend ── */
.admonition-note,
.admonition-info {
  border-color: hsl(var(--ms-info) / 0.3);
  background-color: hsl(var(--ms-info) / 0.04);
}
.admonition-note .admonition-legend,
.admonition-info .admonition-legend {
  color: var(--admonition-note);
}

.admonition-tip {
  border-color: hsl(var(--ms-success) / 0.3);
  background-color: hsl(var(--ms-success) / 0.04);
}
.admonition-tip .admonition-legend {
  color: var(--admonition-tip);
}

.admonition-warning,
.admonition-caution {
  border-color: hsl(var(--ms-warning) / 0.3);
  background-color: hsl(var(--ms-warning) / 0.04);
}
.admonition-warning .admonition-legend,
.admonition-caution .admonition-legend {
  color: var(--admonition-warning);
}

.admonition-danger,
.admonition-error {
  border-color: hsl(var(--ms-destructive) / 0.3);
  background-color: hsl(var(--ms-destructive) / 0.04);
}
.admonition-danger .admonition-legend,
.admonition-error .admonition-legend {
  color: var(--admonition-danger);
}

/* ── Collapse toggle ── */
.admonition-toggle {
  margin-left: 0.25em;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0.125rem;
  border-radius: calc(var(--ms-radius) * 0.5);
  display: inline-flex;
  align-items: center;
  transition: background-color var(--ms-duration-fast) var(--ms-ease-standard);
}
.admonition-toggle:hover {
  background-color: hsl(var(--ms-accent));
}
.admonition-toggle:focus-visible {
  outline: var(--ms-focus-ring-width) solid var(--focus-ring);
  outline-offset: var(--ms-focus-ring-offset);
}

/* ── NodeRenderer inside admonition ── */
.admonition-content :deep(.markdown-renderer) {
  content-visibility: visible;
  contain: content;
  contain-intrinsic-size: 0px 0px;
}
</style>
