<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue-demi'
import { useSafeI18n } from '../../composables/useSafeI18n'
import { hideTooltip, showTooltipForAnchor } from '../../composables/useSingletonTooltip'
import { createD2RenderSalt } from '../../utils/d2RenderSalt'
import { getD2 } from './d2'

interface D2BlockNodeProps {
  node: {
    code?: string
  }
  maxHeight?: string | number | null
  loading?: boolean
  isDark?: boolean
  progressiveRender?: boolean
  progressiveIntervalMs?: number
  themeId?: number | null
  darkThemeId?: number | null
  showHeader?: boolean
  showModeToggle?: boolean
  showCopyButton?: boolean
  showExportButton?: boolean
  showCollapseButton?: boolean
}

const props = withDefaults(
  defineProps<D2BlockNodeProps>(),
  {
    maxHeight: undefined,
    loading: true,
    progressiveRender: true,
    progressiveIntervalMs: 700,
    showHeader: true,
    showModeToggle: true,
    showCopyButton: true,
    showExportButton: true,
    showCollapseButton: true,
  },
)

const { t } = useSafeI18n()
const copyText = ref(false)
const isCollapsed = ref(false)
const showSource = ref(false)
const d2Available = ref(false)
const renderError = ref<string | null>(null)
const isRendering = ref(false)
const svgMarkup = ref('')
const renderToken = ref(0)
const bodyRef = ref<HTMLElement | null>(null)
const bodyMinHeight = ref<number | null>(null)

const baseCode = computed(() => props.node.code ?? '')
const showSourceFallback = computed(() => {
  return showSource.value || !d2Available.value || !svgMarkup.value
})
const hasPreview = computed(() => !!svgMarkup.value)
const bodyStyle = computed(() => {
  if (!showSourceFallback.value || !bodyMinHeight.value)
    return undefined
  return { minHeight: `${bodyMinHeight.value}px` }
})
const renderStyle = computed(() => {
  if (props.maxHeight === 'none')
    return { 'maxHeight': 'none', '--ms-d2-render-max-height': 'none' }
  if (props.maxHeight != null) {
    const max = typeof props.maxHeight === 'number' ? `${props.maxHeight}px` : String(props.maxHeight)
    return { 'maxHeight': max, '--ms-d2-render-max-height': max }
  }
  return undefined
})

const isClient = typeof window !== 'undefined'
let d2Instance: any | null = null
let scheduled = false
let unmounted = false
let lastRenderAt = 0
let throttleTimer: number | null = null
let pendingRender = false
let bodyObserver: ResizeObserver | null = null

const DARK_THEME_OVERRIDES: Record<string, string> = {
  N1: '#E5E7EB',
  N2: '#CBD5E1',
  N3: '#94A3B8',
  N4: '#64748B',
  N5: '#475569',
  N6: '#334155',
  N7: '#0B1220',
  B1: '#60A5FA',
  B2: '#3B82F6',
  B3: '#2563EB',
  B4: '#1D4ED8',
  B5: '#1E40AF',
  B6: '#111827',
  AA2: '#22D3EE',
  AA4: '#0EA5E9',
  AA5: '#0284C7',
  AB4: '#FBBF24',
  AB5: '#F59E0B',
}

// Tooltip helpers
function shouldSkipEventTarget(el: EventTarget | null) {
  const btn = el as HTMLButtonElement | null
  return !btn || btn.disabled
}

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'
function onBtnHover(e: Event, text: string, place: TooltipPlacement = 'top') {
  if (shouldSkipEventTarget(e.currentTarget))
    return
  const ev = e as MouseEvent
  const origin = ev?.clientX != null && ev?.clientY != null ? { x: ev.clientX, y: ev.clientY } : undefined
  showTooltipForAnchor(e.currentTarget as HTMLElement, text, place, false, origin, props.isDark)
}

function onBtnLeave() {
  hideTooltip()
}

function onCopyHover(e: Event) {
  if (shouldSkipEventTarget(e.currentTarget))
    return
  const txt = copyText.value ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')
  const ev = e as MouseEvent
  const origin = ev?.clientX != null && ev?.clientY != null ? { x: ev.clientX, y: ev.clientY } : undefined
  showTooltipForAnchor(e.currentTarget as HTMLElement, txt, 'top', false, origin, props.isDark)
}

async function copy() {
  try {
    const text = baseCode.value
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text)
    }
    copyText.value = true
    setTimeout(() => {
      copyText.value = false
    }, 1000)
  }
  catch (err) {
    console.error('Copy failed:', err)
  }
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function handleSwitchMode(mode: 'preview' | 'source') {
  showSource.value = mode === 'source'
}

const DISALLOWED_STYLE_PATTERNS = [/javascript:/i, /expression\s*\(/i, /url\s*\(\s*javascript:/i, /@import/i]
const SAFE_URL_PROTOCOLS = /^(?:https?:|mailto:|tel:|#|\/|data:image\/(?:png|gif|jpe?g|webp);)/i

function neutralizeScriptProtocols(raw: string) {
  return raw
    .replace(/["']\s*javascript:/gi, '#')
    .replace(/\bjavascript:/gi, '#')
    .replace(/["']\s*vbscript:/gi, '#')
    .replace(/\bvbscript:/gi, '#')
    .replace(/\bdata:text\/html/gi, '#')
}

function sanitizeUrl(value: string | null | undefined) {
  if (!value)
    return ''
  const trimmed = value.trim()
  if (SAFE_URL_PROTOCOLS.test(trimmed))
    return trimmed
  return ''
}

function scrubSvgElement(svgEl: SVGElement) {
  const forbiddenTags = new Set(['script'])
  const nodes = [svgEl, ...Array.from(svgEl.querySelectorAll<SVGElement>('*'))]
  for (const node of nodes) {
    if (forbiddenTags.has(node.tagName.toLowerCase())) {
      node.remove()
      continue
    }
    const attrs = Array.from(node.attributes)
    for (const attr of attrs) {
      const name = attr.name
      if (/^on/i.test(name)) {
        node.removeAttribute(name)
        continue
      }
      if (name === 'style' && attr.value) {
        const val = attr.value
        if (DISALLOWED_STYLE_PATTERNS.some(re => re.test(val))) {
          node.removeAttribute(name)
          continue
        }
      }
      if ((name === 'href' || name === 'xlink:href') && attr.value) {
        const safe = sanitizeUrl(attr.value)
        if (!safe) {
          node.removeAttribute(name)
          continue
        }
        if (safe !== attr.value)
          node.setAttribute(name, safe)
      }
    }
  }
}

function toSafeSvgMarkup(svg: string | null | undefined) {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined')
    return ''
  if (!svg)
    return ''
  const neutralized = neutralizeScriptProtocols(svg)
  const parsed = new DOMParser().parseFromString(neutralized, 'image/svg+xml')
  const svgEl = parsed.documentElement
  if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg')
    return ''
  const svgElement = svgEl as unknown as SVGElement
  scrubSvgElement(svgElement)
  svgElement.classList.add('markstream-d2-root-svg')
  return svgElement.outerHTML
}

function setSvg(svg: string) {
  const safe = toSafeSvgMarkup(svg)
  svgMarkup.value = safe || ''
}

function clearSvg() {
  svgMarkup.value = ''
}

function extractSvg(renderResult: any) {
  if (!renderResult)
    return ''
  if (typeof renderResult === 'string')
    return renderResult
  if (typeof renderResult.svg === 'string')
    return renderResult.svg
  if (typeof renderResult.data === 'string')
    return renderResult.data
  return ''
}

async function ensureD2Instance() {
  if (d2Instance)
    return d2Instance
  const D2Ctor = await getD2()
  if (!D2Ctor)
    return null
  if (typeof D2Ctor === 'function') {
    const inst = new D2Ctor()
    if (inst && typeof inst.compile === 'function')
      d2Instance = inst
    else if (typeof (D2Ctor as any).compile === 'function')
      d2Instance = D2Ctor
    return d2Instance
  }
  if (D2Ctor?.D2 && typeof D2Ctor.D2 === 'function') {
    d2Instance = new D2Ctor.D2()
    return d2Instance
  }
  if (typeof D2Ctor.compile === 'function')
    d2Instance = D2Ctor
  return d2Instance
}

async function renderDiagram() {
  if (!isClient || unmounted)
    return
  if (props.loading && !props.progressiveRender)
    return
  const code = baseCode.value
  if (!code) {
    clearSvg()
    renderError.value = null
    return
  }

  const token = ++renderToken.value
  isRendering.value = true
  renderError.value = null

  try {
    const instance = await ensureD2Instance()
    if (!instance) {
      d2Available.value = false
      showSource.value = true
      clearSvg()
      renderError.value = 'D2 is not available.'
      return
    }
    if (typeof instance.compile !== 'function' || typeof instance.render !== 'function') {
      throw new TypeError('D2 instance is missing compile/render methods.')
    }
    d2Available.value = true

    const compileResult = await instance.compile(code)
    if (token !== renderToken.value)
      return

    const diagram = compileResult?.diagram ?? compileResult
    const baseRenderOptions = compileResult?.renderOptions ?? compileResult?.options ?? {}
    const resolvedThemeId = props.themeId ?? baseRenderOptions.themeID
    const resolvedDarkThemeId = props.darkThemeId ?? baseRenderOptions.darkThemeID
    const renderOptions: Record<string, any> = { ...baseRenderOptions }
    renderOptions.themeID = props.isDark && resolvedDarkThemeId != null
      ? resolvedDarkThemeId
      : resolvedThemeId
    // Ensure app-controlled theme takes precedence over OS-level preference.
    renderOptions.darkThemeID = null
    renderOptions.darkThemeOverrides = null
    if (props.isDark) {
      const baseOverrides = baseRenderOptions.themeOverrides && typeof baseRenderOptions.themeOverrides === 'object'
        ? baseRenderOptions.themeOverrides
        : null
      renderOptions.themeOverrides = {
        ...DARK_THEME_OVERRIDES,
        ...(baseOverrides || {}),
      }
    }
    renderOptions.salt = renderOptions.salt ?? createD2RenderSalt()
    const renderResult = await instance.render(diagram, renderOptions)
    if (token !== renderToken.value)
      return

    const svg = extractSvg(renderResult)
    if (!svg)
      throw new Error('D2 render returned empty output.')
    setSvg(svg)
    if (props.loading)
      showSource.value = false
    renderError.value = null
  }
  catch (err: any) {
    if (token !== renderToken.value)
      return
    const message = err?.message ? String(err.message) : 'D2 render failed.'
    if (!props.loading)
      renderError.value = message
    if (message.includes('@terrastruct/d2')) {
      d2Available.value = false
      showSource.value = true
    }
  }
  finally {
    if (token === renderToken.value) {
      isRendering.value = false
      if (pendingRender) {
        pendingRender = false
        scheduleRender()
      }
    }
  }
}

function scheduleRender(force = false) {
  if (scheduled)
    return
  if (!isClient)
    return
  if (unmounted)
    return
  if (isRendering.value) {
    pendingRender = true
    return
  }
  const interval = Math.max(120, Number(props.progressiveIntervalMs) || 0)
  const now = Date.now()
  const elapsed = now - lastRenderAt
  if (!force && elapsed < interval) {
    pendingRender = true
    if (throttleTimer == null) {
      throttleTimer = window.setTimeout(() => {
        throttleTimer = null
        if (pendingRender) {
          pendingRender = false
          scheduleRender(true)
        }
      }, Math.max(0, interval - elapsed))
    }
    return
  }
  scheduled = true
  const runner = () => {
    scheduled = false
    lastRenderAt = Date.now()
    renderDiagram()
  }
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
    window.requestAnimationFrame(runner)
  else
    setTimeout(runner, 0)
}

function exportSvg() {
  if (!svgMarkup.value)
    return
  try {
    const blob = new Blob([svgMarkup.value], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    if (typeof document !== 'undefined') {
      const link = document.createElement('a')
      link.href = url
      link.download = `d2-diagram-${Date.now()}.svg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
    URL.revokeObjectURL(url)
  }
  catch (error) {
    console.error('Failed to export SVG:', error)
  }
}

function updateBodyMinHeight() {
  const el = bodyRef.value
  if (!el)
    return
  const height = el.getBoundingClientRect().height
  if (height > 0)
    bodyMinHeight.value = height
}

watch(
  () => [props.node.code, props.loading, props.isDark],
  () => {
    scheduleRender()
  },
  { immediate: true },
)

watch(
  () => props.loading,
  (loading, prev) => {
    if (prev && !loading)
      scheduleRender(true)
  },
)

watch(
  () => [showSourceFallback.value, svgMarkup.value, baseCode.value],
  () => {
    nextTick(() => {
      updateBodyMinHeight()
    })
  },
)

onMounted(() => {
  scheduleRender()
  nextTick(() => {
    updateBodyMinHeight()
  })
  if (typeof ResizeObserver !== 'undefined') {
    bodyObserver = new ResizeObserver(() => {
      updateBodyMinHeight()
    })
    if (bodyRef.value)
      bodyObserver.observe(bodyRef.value)
  }
})

onBeforeUnmount(() => {
  unmounted = true
  if (throttleTimer != null) {
    clearTimeout(throttleTimer)
    throttleTimer = null
  }
  bodyObserver?.disconnect()
  bodyObserver = null
})
</script>

<template>
  <div
    class="d2-block-container my-4 rounded-lg border overflow-hidden shadow-sm"
    :class="props.isDark ? 'border-gray-700/30 bg-gray-900 text-gray-100' : 'border-gray-200 bg-white text-gray-900'"
  >
    <div
      v-if="props.showHeader"
      class="d2-block-header flex justify-between items-center px-4 py-2.5 border-b border-gray-400/5"
      style="color: var(--vscode-editor-foreground);background-color: var(--vscode-editor-background);"
    >
      <div class="flex items-center gap-x-2">
        <span class="text-sm font-medium font-mono">D2</span>
      </div>
      <div class="flex items-center gap-x-2">
        <div
          v-if="props.showModeToggle"
          class="flex items-center gap-x-1 rounded-md p-0.5"
          :class="props.isDark ? 'bg-gray-700' : 'bg-gray-100'"
        >
          <button
            type="button"
            class="mode-btn px-2 py-1 text-xs rounded"
            :class="!showSource ? 'is-active' : ''"
            @click="handleSwitchMode('preview')"
            @mouseenter="onBtnHover($event, t('common.preview') || 'Preview')"
            @focus="onBtnHover($event, t('common.preview') || 'Preview')"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            {{ t('common.preview') || 'Preview' }}
          </button>
          <button
            type="button"
            class="mode-btn px-2 py-1 text-xs rounded"
            :class="showSource ? 'is-active' : ''"
            @click="handleSwitchMode('source')"
            @mouseenter="onBtnHover($event, t('common.source') || 'Source')"
            @focus="onBtnHover($event, t('common.source') || 'Source')"
            @mouseleave="onBtnLeave"
            @blur="onBtnLeave"
          >
            {{ t('common.source') || 'Source' }}
          </button>
        </div>

        <button
          v-if="props.showCopyButton"
          type="button"
          class="d2-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
          :aria-label="copyText ? (t('common.copied') || 'Copied') : (t('common.copy') || 'Copy')"
          @click="copy"
          @mouseenter="onCopyHover($event)"
          @focus="onCopyHover($event)"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg v-if="!copyText" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></g></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5" /></svg>
        </button>

        <button
          v-if="props.showExportButton && svgMarkup"
          type="button"
          class="d2-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
          :aria-label="t('common.export') || 'Export'"
          @click="exportSvg"
          @mouseenter="onBtnHover($event, t('common.export') || 'Export')"
          @focus="onBtnHover($event, t('common.export') || 'Export')"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v12m0-12l-4 4m4-4l4 4M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
        </button>

        <button
          v-if="props.showCollapseButton"
          type="button"
          class="d2-action-btn p-2 text-xs rounded-md transition-colors hover:bg-[var(--vscode-editor-selectionBackground)]"
          :aria-pressed="isCollapsed"
          @click="toggleCollapse"
          @mouseenter="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
          @focus="onBtnHover($event, isCollapsed ? (t('common.expand') || 'Expand') : (t('common.collapse') || 'Collapse'))"
          @mouseleave="onBtnLeave"
          @blur="onBtnLeave"
        >
          <svg :style="{ rotate: isCollapsed ? '0deg' : '90deg' }" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" width="1em" height="1em" viewBox="0 0 24 24" class="w-3 h-3"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18l6-6l-6-6" /></svg>
        </button>
      </div>
    </div>

    <div v-show="!isCollapsed" ref="bodyRef" class="d2-block-body" :style="bodyStyle">
      <div v-if="props.loading && !hasPreview" class="d2-source px-4 py-4">
        <pre class="d2-code"><code>{{ baseCode }}</code></pre>
        <p v-if="renderError" class="d2-error mt-2 text-xs">
          {{ renderError }}
        </p>
      </div>
      <div v-else>
        <div v-if="showSourceFallback" class="d2-source px-4 py-4">
          <pre class="d2-code"><code>{{ baseCode }}</code></pre>
          <p v-if="renderError" class="d2-error mt-2 text-xs">
            {{ renderError }}
          </p>
        </div>
        <div v-else class="d2-render" :style="renderStyle">
          <div class="d2-svg" v-html="svgMarkup" />
          <p v-if="renderError" class="d2-error px-4 pb-3 text-xs">
            {{ renderError }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.d2-block-body {
  position: relative;
}

.d2-source {
  font-family: var(--vscode-editor-font-family, 'Fira Code', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace);
}

.d2-code {
  white-space: pre;
  font-size: 0.875rem;
  line-height: 1.5;
}

/* Center the rendered diagram like the mermaid/infographic blocks: a
   column flex container with margin:auto children stays centered while
   remaining scroll-safe when content overflows. The class-level cap is a
   fallback; the inline maxHeight prop (default 500px) still wins when set. */
.d2-render {
  max-height: var(--ms-size-code-max-height, 500px);
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.d2-svg {
  margin: auto;
  width: 100%;
}

.d2-render .d2-error {
  margin-left: auto;
  margin-right: auto;
}

.d2-svg :deep(svg.markstream-d2-root-svg) {
  width: 100%;
  max-width: 100%;
  height: auto;
  /* Match the container cap so tall diagrams scale down to fit, mirroring
     the mermaid block's max-height behavior. When the user sets maxHeight,
     the inline style exposes the value as --ms-d2-render-max-height; the
     default fallback here is the shared token. */
  max-height: var(--ms-d2-render-max-height, var(--ms-size-code-max-height, 500px));
  display: block;
}

.mode-btn {
  opacity: 0.7;
  transition: opacity 0.2s;
}

.mode-btn.is-active {
  opacity: 1;
  font-weight: 600;
}

.d2-action-btn {
  opacity: 0.7;
  transition: opacity 0.2s;
}

.d2-action-btn:hover {
  opacity: 1;
}

.d2-action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.d2-error {
  color: #dc2626;
}
</style>
