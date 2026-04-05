<script setup lang="ts">
// 定义链接节点
import type { LinkNodeProps } from '../../types/component-props'
import { computed, inject, useAttrs } from 'vue'
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { sanitizeAttrs } from '../../utils/htmlRenderer'
import { customComponentsRevision, getCustomNodeComponents } from '../../utils/nodeComponents'
import EmphasisNode from '../EmphasisNode/EmphasisNode.vue'
import HtmlInlineNode from '../HtmlInlineNode'
import ImageNode from '../ImageNode'
import InlineCodeNode from '../InlineCodeNode'
import StrikethroughNode from '../StrikethroughNode'
import StrongNode from '../StrongNode'
import TextNode from '../TextNode'

// 接收props — 把动画/颜色相关配置暴露为props，并通过CSS变量注入样式
const props = withDefaults(defineProps<LinkNodeProps>(), {
  showTooltip: true,
})
const inheritedShowTooltips = inject<{ value?: boolean } | undefined>('markstreamShowTooltips', undefined)

const tooltipEnabled = computed(() => {
  const inherited = inheritedShowTooltips?.value
  if (typeof inherited === 'boolean')
    return inherited
  return props.showTooltip
})

const cssVars = computed(() => {
  const bottom = props.underlineBottom !== undefined
    ? (typeof props.underlineBottom === 'number' ? `${props.underlineBottom}px` : String(props.underlineBottom))
    : '-3px'
  const activeOpacity = props.animationOpacity ?? 0.35
  const restingOpacity = Math.max(0.12, Math.min(activeOpacity * 0.5, activeOpacity))

  const vars: Record<string, string> = {
    '--underline-height': `${props.underlineHeight ?? 2}px`,
    '--underline-bottom': bottom,
    '--underline-opacity': String(activeOpacity),
    '--underline-rest-opacity': String(restingOpacity),
    '--underline-duration': `${props.animationDuration ?? 1.6}s`,
    '--underline-timing': props.animationTiming ?? 'ease-in-out',
    '--underline-iteration': typeof props.animationIteration === 'number' ? String(props.animationIteration) : (props.animationIteration ?? 'infinite'),
  }
  if (props.color)
    vars['--link-color'] = props.color
  return vars
})

// Available node components for child rendering
const nodeComponents = {
  text: TextNode,
  strong: StrongNode,
  strikethrough: StrikethroughNode,
  emphasis: EmphasisNode,
  image: ImageNode,
  html_inline: HtmlInlineNode,
  inline_code: InlineCodeNode,
}

const customComponents = computed(() => {
  void customComponentsRevision.value
  return getCustomNodeComponents(props.customId)
})

// 获取子节点组件，优先使用用户自定义组件
function getChildComponent(child: any) {
  const customComponent = customComponents.value[child.type]
  if (customComponent)
    return customComponent

  return nodeComponents[child.type] || null
}

// forward any non-prop attributes (e.g. custom-id) to the rendered element
const attrs = useAttrs()
const nodeAttrs = computed(() => {
  const rawAttrs = (props.node as any)?.attrs
  if (!rawAttrs || typeof rawAttrs !== 'object')
    return {}

  const normalized: Record<string, string> = {}

  if (Array.isArray(rawAttrs)) {
    for (const attr of rawAttrs) {
      if (!Array.isArray(attr) || !attr[0])
        continue
      normalized[String(attr[0])] = String(attr[1] ?? '')
    }
  }
  else {
    for (const [key, value] of Object.entries(rawAttrs)) {
      if (!key || value == null || value === false)
        continue
      normalized[key] = value === true ? '' : String(value)
    }
  }

  return sanitizeAttrs(normalized)
})
const anchorAttrs = computed(() => {
  const merged = {
    ...(attrs as Record<string, unknown>),
    ...nodeAttrs.value,
  } as Record<string, unknown>
  // `title` is controlled by `showTooltip` behavior and should not be overridden.
  delete merged.title
  return merged
})

// Tooltip handlers using singleton tooltip
function onAnchorEnter(e: Event) {
  if (!tooltipEnabled.value)
    return
  const ev = e as MouseEvent
  const origin = ev?.clientX != null && ev?.clientY != null ? { x: ev.clientX, y: ev.clientY } : undefined
  // show the link href in tooltip; fall back to title/text if href missing
  const txt = props.node?.title || props.node?.href || props.node?.text || ''
  showTooltipForAnchor(e.currentTarget as HTMLElement, txt, 'top', false, origin)
}

function onAnchorLeave() {
  if (!tooltipEnabled.value)
    return
  hideTooltip()
}
const title = computed(() => {
  const rawTitle = props.node?.title
  if (typeof rawTitle === 'string' && rawTitle.trim().length > 0)
    return rawTitle
  return String(props.node?.href ?? '')
})
</script>

<template>
  <a
    v-if="!node.loading"
    class="link-node"
    :href="node.href"
    :title="tooltipEnabled ? '' : title"
    :aria-label="`Link: ${title}`"
    :aria-hidden="node.loading ? 'true' : 'false'"
    target="_blank"
    rel="noopener noreferrer"
    v-bind="anchorAttrs"
    :style="cssVars"
    @mouseenter="(e) => onAnchorEnter(e)"
    @mouseleave="onAnchorLeave"
  >
    <component
      :is="getChildComponent(child)"
      v-for="(child, index) in node.children"
      :key="`${indexKey || 'emphasis'}-${index}`"
      :node="child"
      :custom-id="props.customId"
      :index-key="`${indexKey || 'link-text'}-${index}`"
    />
  </a>
  <span v-else class="link-loading inline-flex items-baseline gap-1.5" :aria-hidden="!node.loading ? 'true' : 'false'" v-bind="attrs" :style="cssVars">
    <span class="link-text-wrapper relative inline-flex">
      <span class="leading-[normal] link-text">
        <TextNode
          class="leading-[normal] link-text"
          :node="{ type: 'text', content: String(node.text ?? ''), raw: String(node.text ?? '') }"
          :index-key="`${indexKey || 'link-text'}-loading`"
        />
      </span>
      <span class="link-loading-indicator" aria-hidden="true" />
    </span>
  </span>
</template>

<style scoped>
.link-node {
  color: var(--link-color);
  text-decoration: none;
}

.link-node:hover {
  text-decoration: underline;
  text-underline-offset: .2rem
}
.link-loading .link-text-wrapper {
  position: relative;
}

.link-loading {
  color: var(--link-color);
}

.link-loading .link-text {
  position: relative;
  z-index: 2;
}

.link-loading-indicator {
  position: absolute;
  left: 0;
  right: 0;
  height: var(--underline-height, 2px);
  bottom: var(--underline-bottom, -3px);
  background: currentColor;
  border-radius: 999px;
  will-change: opacity;
  opacity: var(--underline-rest-opacity, 0.18);
  animation: underlinePulse var(--underline-duration, 1.6s) var(--underline-timing, ease-in-out) var(--underline-iteration, infinite);
}

@keyframes underlinePulse {
  0%, 100% { opacity: var(--underline-rest-opacity, 0.18); }
  50% { opacity: var(--underline-opacity, 0.35); }
}

@media (prefers-reduced-motion: reduce) {
  .link-loading-indicator {
    animation: none;
    opacity: var(--underline-rest-opacity, 0.18);
  }
}
</style>
