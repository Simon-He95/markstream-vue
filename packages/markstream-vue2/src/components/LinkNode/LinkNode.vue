<script setup lang="ts">
// 定义链接节点
import { shouldOpenLinkInNewTab } from 'stream-markdown-parser'
import { computed, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, useAttrs } from 'vue-demi'
import { ensureTooltipMounted, hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { sanitizeAttrs } from '../../utils/htmlRenderer'
import EmphasisNode from '../EmphasisNode/EmphasisNode.vue'
import HtmlInlineNode from '../HtmlInlineNode'
import ImageNode from '../ImageNode'
import StrikethroughNode from '../StrikethroughNode'

import StrongNode from '../StrongNode'
import TextNode from '../TextNode'

// 接收props — 把动画/颜色相关配置暴露为props，并通过CSS变量注入样式
const props = withDefaults(defineProps<LinkNodeProps>(), {
  showTooltip: true,
})

const lastPointerPosition = {
  x: 0,
  y: 0,
  hasValue: false,
}

let pointerTrackerRefCount = 0
let pointerTrackerCleanup: (() => void) | null = null

function ensurePointerTracker() {
  if (pointerTrackerCleanup || typeof window === 'undefined')
    return

  const updatePosition = (event: MouseEvent | PointerEvent) => {
    if (typeof event.clientX !== 'number' || typeof event.clientY !== 'number')
      return
    lastPointerPosition.x = event.clientX
    lastPointerPosition.y = event.clientY
    lastPointerPosition.hasValue = true
  }

  window.addEventListener('pointermove', updatePosition, true)
  window.addEventListener('mousemove', updatePosition, true)
  pointerTrackerCleanup = () => {
    window.removeEventListener('pointermove', updatePosition, true)
    window.removeEventListener('mousemove', updatePosition, true)
  }
}

function retainPointerTracker() {
  ensurePointerTracker()
  pointerTrackerRefCount += 1
}

function releasePointerTracker() {
  pointerTrackerRefCount = Math.max(0, pointerTrackerRefCount - 1)
  if (!pointerTrackerRefCount && pointerTrackerCleanup) {
    pointerTrackerCleanup()
    pointerTrackerCleanup = null
  }
}

interface LinkNodeProps {
  node: {
    type: 'link'
    href: string
    title: string | null
    text: string
    children: { type: string, raw: string }[]
    raw: string
    loading?: boolean
  }
  indexKey: number | string
  customId?: string
  showTooltip?: boolean
  color?: string
  underlineHeight?: number
  underlineBottom?: number | string
  animationDuration?: number
  animationOpacity?: number
  animationTiming?: string
  animationIteration?: string | number
}

const cssVars = computed(() => {
  const bottom = props.underlineBottom !== undefined
    ? (typeof props.underlineBottom === 'number' ? `${props.underlineBottom}px` : String(props.underlineBottom))
    : '-3px'
  const activeOpacity = props.animationOpacity ?? 0.35
  const restingOpacity = Math.max(0.12, Math.min(activeOpacity * 0.5, activeOpacity))

  return {
    '--link-color': props.color ?? '#0366d6',
    '--underline-height': `${props.underlineHeight ?? 2}px`,
    '--underline-bottom': bottom,
    '--underline-opacity': String(activeOpacity),
    '--underline-rest-opacity': String(restingOpacity),
    '--underline-duration': `${props.animationDuration ?? 1.6}s`,
    '--underline-timing': props.animationTiming ?? 'ease-in-out',
    '--underline-iteration': typeof props.animationIteration === 'number' ? String(props.animationIteration) : (props.animationIteration ?? 'infinite'),
  } as Record<string, string>
})

// Available node components for child rendering
const nodeComponents = {
  text: TextNode,
  strong: StrongNode,
  strikethrough: StrikethroughNode,
  emphasis: EmphasisNode,
  image: ImageNode,
  html_inline: HtmlInlineNode,
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
const anchorEl = ref<HTMLElement | null>(null)
const isHovering = ref(false)
const anchorAttrs = computed(() => {
  const merged = {
    ...(attrs as Record<string, unknown>),
    ...nodeAttrs.value,
  }
  // `title` is controlled by `showTooltip` behavior and should not be overridden.
  delete (merged as Record<string, unknown>).title
  delete (merged as Record<string, unknown>).href
  delete (merged as Record<string, unknown>).target
  delete (merged as Record<string, unknown>).rel
  return merged
})
const safeHref = computed(() => {
  const href = String(props.node?.href ?? '')
  return sanitizeAttrs({ href }).href
})
const openInNewTab = computed(() => shouldOpenLinkInNewTab(safeHref.value))

function getTooltipText() {
  return props.node?.title || safeHref.value || props.node?.text || ''
}

function isPointerInsideAnchor(el: HTMLElement | null) {
  if (!el || !lastPointerPosition.hasValue)
    return false
  const rect = el.getBoundingClientRect()
  return lastPointerPosition.x >= rect.left
    && lastPointerPosition.x <= rect.right
    && lastPointerPosition.y >= rect.top
    && lastPointerPosition.y <= rect.bottom
}

function syncTooltipForHoveredAnchor() {
  if (!props.showTooltip || !anchorEl.value || !isPointerInsideAnchor(anchorEl.value))
    return
  isHovering.value = true
  showTooltipForAnchor(
    anchorEl.value,
    getTooltipText(),
    'top',
    true,
    {
      x: lastPointerPosition.x,
      y: lastPointerPosition.y,
    },
  )
}

// Tooltip handlers using singleton tooltip
function onAnchorEnter(e: Event) {
  if (!props.showTooltip)
    return
  isHovering.value = true
  const ev = e as MouseEvent
  const origin = ev?.clientX != null && ev?.clientY != null ? { x: ev.clientX, y: ev.clientY } : undefined
  showTooltipForAnchor(anchorEl.value || (e.currentTarget as HTMLElement), getTooltipText(), 'top', true, origin)
}

function onAnchorLeave() {
  if (!props.showTooltip)
    return
  isHovering.value = false
  hideTooltip()
}
const title = computed(() => {
  const rawTitle = props.node?.title
  if (typeof rawTitle === 'string' && rawTitle.trim().length > 0)
    return rawTitle
  return String(safeHref.value ?? '')
})

onMounted(() => {
  retainPointerTracker()
  if (props.showTooltip)
    ensureTooltipMounted()
  nextTick(() => {
    syncTooltipForHoveredAnchor()
  })
})

onUpdated(() => {
  syncTooltipForHoveredAnchor()
})

onBeforeUnmount(() => {
  releasePointerTracker()
  if (!isHovering.value)
    return
  isHovering.value = false
  hideTooltip(true)
})
</script>

<template>
  <a
    v-if="!node.loading"
    ref="anchorEl"
    class="link-node"
    :href="safeHref"
    :title="showTooltip ? '' : title"
    :aria-label="`Link: ${title}`"
    :aria-hidden="node.loading ? 'true' : 'false'"
    :target="openInNewTab ? '_blank' : undefined"
    :rel="openInNewTab ? 'noopener noreferrer' : undefined"
    v-bind="anchorAttrs"
    :style="cssVars"
    @mouseenter="(e) => onAnchorEnter(e)"
    @mouseleave="onAnchorLeave"
  >
    <component
      :is="nodeComponents[child.type]"
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
  color: var(--link-color, #0366d6);
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
  color: var(--link-color, #0366d6);
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
