<script setup lang="ts">
import type { HtmlPolicy } from 'stream-markdown-parser'
import type { StreamSliceMode } from '../composables/createLocalTextStream'
import type { StreamPresetId } from '../composables/streamPresets'
import type { StreamTransportMode } from '../composables/useStreamSimulator'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { brandThemes, themes } from '../../../playground-shared/options'
import MarkdownRender from '../../../src/components/NodeRenderer'
import { preloadCodeBlockRuntime } from '../../../src/exports'
import { setCustomComponents } from '../../../src/utils/nodeComponents'
import KatexWorker from '../../../src/workers/katexRenderer.worker?worker&inline'
import { setKaTeXWorker } from '../../../src/workers/katexWorkerClient'
import MermaidWorker from '../../../src/workers/mermaidParser.worker?worker&inline'
import { setMermaidWorker } from '../../../src/workers/mermaidWorkerClient'
import PinnedImageNode from '../components/PinnedImageNode.vue'
import StreamSpeedPanel from '../components/StreamSpeedPanel.vue'
import ThinkingNode from '../components/ThinkingNode.vue'
import { CUSTOM_STREAM_PRESET_ID, findMatchingStreamPreset, getStreamPreset, STREAM_PRESETS } from '../composables/streamPresets'
import { clampStreamControl, normalizeStreamRange, useStreamSimulator } from '../composables/useStreamSimulator'
import { useTpsStreamSimulator } from '../composables/useTpsStreamSimulator'
import { streamContent } from '../const/markdown'
import { createAutoScrollChaseController } from '../utils/autoScrollChase'
import 'katex/dist/katex.min.css'
import '../../../src/index.css'

const _d2Demo = `

## D2 Diagram

\`\`\`d2
direction: right

Client -> API: request
API -> DB: query
DB -> API: rows
API -> Client: response
\`\`\`
`
const fullStreamContent = `${streamContent}`

const streamChunkDelayMin = useLocalStorage<number>('vmr-settings-stream-delay-min', 14)
const streamChunkDelayMax = useLocalStorage<number>('vmr-settings-stream-delay-max', 34)
const streamChunkSizeMin = useLocalStorage<number>('vmr-settings-stream-chunk-size-min', 2)
const streamChunkSizeMax = useLocalStorage<number>('vmr-settings-stream-chunk-size-max', 7)
const streamBurstiness = useLocalStorage<number>('vmr-settings-stream-burstiness', 35)
const streamTransportMode = useLocalStorage<StreamTransportMode>('vmr-settings-stream-transport-mode', 'readable-stream')
const streamSliceMode = useLocalStorage<StreamSliceMode>('vmr-settings-stream-slice-mode', 'pure-random')
const smoothStreaming = useLocalStorage<boolean>('vmr-settings-smooth-streaming', true)
const htmlPolicy = useLocalStorage<HtmlPolicy>('vmr-settings-html-policy', 'trusted')
const normalizedChunkDelayRange = computed(() => normalizeStreamRange(
  Number(streamChunkDelayMin.value),
  Number(streamChunkDelayMax.value),
  8,
  240,
  14,
  34,
))
const normalizedChunkSizeRange = computed(() => normalizeStreamRange(
  Number(streamChunkSizeMin.value),
  Number(streamChunkSizeMax.value),
  1,
  24,
  2,
  7,
))
const normalizedBurstiness = computed(() => Math.round(clampStreamControl(Number(streamBurstiness.value), 0, 100, 35)))
const activeStreamPreset = computed(() => findMatchingStreamPreset({
  chunkDelayMin: normalizedChunkDelayRange.value.min,
  chunkDelayMax: normalizedChunkDelayRange.value.max,
  chunkSizeMin: normalizedChunkSizeRange.value.min,
  chunkSizeMax: normalizedChunkSizeRange.value.max,
  burstiness: normalizedBurstiness.value,
}))
const selectedStreamPresetId = computed<StreamPresetId>({
  get: () => activeStreamPreset.value?.id ?? CUSTOM_STREAM_PRESET_ID,
  set: (presetId) => {
    if (presetId === CUSTOM_STREAM_PRESET_ID)
      return

    const preset = getStreamPreset(presetId)
    if (!preset)
      return

    streamChunkDelayMin.value = preset.chunkDelayMin
    streamChunkDelayMax.value = preset.chunkDelayMax
    streamChunkSizeMin.value = preset.chunkSizeMin
    streamChunkSizeMax.value = preset.chunkSizeMax
    streamBurstiness.value = preset.burstiness
  },
})
const streamPresetDescription = computed(() => activeStreamPreset.value?.description ?? 'Custom min/max window with your own burst profile.')
const streamChunkRangeLabel = computed(() => `${normalizedChunkSizeRange.value.min}-${normalizedChunkSizeRange.value.max}`)
const streamDelayRangeLabel = computed(() => `${normalizedChunkDelayRange.value.min}-${normalizedChunkDelayRange.value.max}ms`)
const isBenchmarkMode = typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('benchmark') === '1'
const benchmarkRenderChat = ref(true)
const savedSimulationMode = useLocalStorage<'tps' | 'chunks'>('vmr-settings-simulation-mode', 'tps')
const simulationMode = computed(() => isBenchmarkMode ? 'chunks' : savedSimulationMode.value === 'chunks' ? 'chunks' : 'tps')
const targetTps = useLocalStorage<number>('vmr-settings-target-tps', 300)
const normalizedTargetTps = computed(() => Math.round(clampStreamControl(Number(targetTps.value), 1, 2000, 300)))
const tpsSimulator = useTpsStreamSimulator({ source: fullStreamContent, targetTps: normalizedTargetTps })
const chunkSettings = computed(() => ({
  chunkSizeMin: normalizedChunkSizeRange.value.min,
  chunkSizeMax: normalizedChunkSizeRange.value.max,
  chunkDelayMin: normalizedChunkDelayRange.value.min,
  chunkDelayMax: normalizedChunkDelayRange.value.max,
  burstiness: normalizedBurstiness.value / 100,
  sliceMode: streamSliceMode.value,
  transportMode: streamTransportMode.value,
}))
const chunkRunSettings = ref(chunkSettings.value)
const chunkSimulator = useStreamSimulator({
  source: fullStreamContent,
  chunkSizeMin: () => chunkRunSettings.value.chunkSizeMin,
  chunkSizeMax: () => chunkRunSettings.value.chunkSizeMax,
  chunkDelayMin: () => chunkRunSettings.value.chunkDelayMin,
  chunkDelayMax: () => chunkRunSettings.value.chunkDelayMax,
  burstiness: () => chunkRunSettings.value.burstiness,
  sliceMode: () => chunkRunSettings.value.sliceMode,
  transportMode: () => chunkRunSettings.value.transportMode,
})

const activeSimulator = computed(() => simulationMode.value === 'tps' ? tpsSimulator : chunkSimulator)
const content = computed(() => activeSimulator.value.content.value)
const isPaused = computed(() => activeSimulator.value.isPaused.value)
const isStreaming = computed(() => activeSimulator.value.isStreaming.value)

function stopStreamSimulation() {
  chunkSimulator.stop()
  tpsSimulator.stop()
}

function startStreamSimulation() {
  stopStreamSimulation()
  chunkRunSettings.value = chunkSettings.value
  activeSimulator.value.start()
}

function toggleStreamPause() {
  activeSimulator.value.togglePause()
}

function selectSimulationMode(mode: 'tps' | 'chunks') {
  if (mode === simulationMode.value)
    return
  stopStreamSimulation()
  savedSimulationMode.value = mode
  replayStream()
}

function selectTps(speed: number) {
  targetTps.value = speed
  replayStream()
}

// 预加载 stream-diffs 运行时
if (!isBenchmarkMode)
  void preloadCodeBlockRuntime()
setKaTeXWorker(new KatexWorker())
setMermaidWorker(new MermaidWorker())
const router = useRouter()

function goToTest() {
  // Prefer router navigation, fallback to full redirect if it fails.
  router.push('/test').catch(() => {
    window.location.href = '/test'
  })
}

function goToCdnPeers() {
  router.push('/cdn-peers').catch(() => {
    window.location.href = '/cdn-peers'
  })
}

function goToThemeGallery() {
  router.push('/example').catch(() => {
    window.location.href = '/example'
  })
}

function goToVirtualScrollLab() {
  router.push('/virtual-scroll').catch(() => {
    window.location.href = '/virtual-scroll'
  })
}

function goToVirtualTimelineZero() {
  router.push('/virtual-timeline-zero').catch(() => {
    window.location.href = '/virtual-timeline-zero'
  })
}

function goToVirtualScrollerMarkstream() {
  router.push('/virtual-scroller-markstream').catch(() => {
    window.location.href = '/virtual-scroller-markstream'
  })
}

// Keep persisted values within reasonable bounds on hydration.
watchEffect(() => {
  if (streamChunkDelayMin.value !== normalizedChunkDelayRange.value.min)
    streamChunkDelayMin.value = normalizedChunkDelayRange.value.min
  if (streamChunkDelayMax.value !== normalizedChunkDelayRange.value.max)
    streamChunkDelayMax.value = normalizedChunkDelayRange.value.max
})

watchEffect(() => {
  if (streamChunkSizeMin.value !== normalizedChunkSizeRange.value.min)
    streamChunkSizeMin.value = normalizedChunkSizeRange.value.min
  if (streamChunkSizeMax.value !== normalizedChunkSizeRange.value.max)
    streamChunkSizeMax.value = normalizedChunkSizeRange.value.max
})

watchEffect(() => {
  const parsedBurstiness = Number(streamBurstiness.value)
  const fallbackBurstiness = Number.isFinite(parsedBurstiness) ? parsedBurstiness : 35
  const boundedBurstiness = Math.round(clampStreamControl(fallbackBurstiness, 0, 100, 35))
  if (streamBurstiness.value !== boundedBurstiness)
    streamBurstiness.value = boundedBurstiness
})

// Pin the image node to one fixed box so the placeholder and the rendered image
// keep the same height (issue #766: the bottom used to jump when the 8rem
// placeholder was swapped for the image's natural size).
setCustomComponents('playground-demo', { image: PinnedImageNode, thinking: ThinkingNode })

// 主题切换
const isDark = useDark()
const toggleTheme = useToggle(isDark)

// Brand theme selector
const activeBrandTheme = ref('')

// Code block theme selector (single dropdown)

const selectedTheme = useLocalStorage<string>('vmr-settings-selected-theme', 'vitesse-dark')
const codeBlockThemes = computed(() => [selectedTheme.value, selectedTheme.value] as const)

// 格式化主题名称显示
function formatThemeName(themeName: string) {
  return themeName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// 设置面板显示状态
const showSettings = ref(false)
const isCompactSettings = useMediaQuery('(max-width: 1023px)')
const shouldShowSettingsPanel = computed(() => !isCompactSettings.value || showSettings.value)

const messagesContainer = ref<HTMLElement | null>(null)
const scrollRoot = ref<HTMLElement | null>(null)
const shouldStickToBottom = ref(true)

// 性能友好的监听：使用 ResizeObserver 监听消息区域和渲染内容变化，
// 当内容高度超过全屏滚动区域时，在消息区域上添加 `disable-min-height` 类以移除渲染器的 min-height。
// 注意：不要直接对 `.markdown-renderer` 做 `classList.add()`，因为它的 class 由 Vue patch，
// 在切换模式/主题等触发更新时会被覆盖，导致 `disable-min-height` 丢失。
let __roContainer: ResizeObserver | null = null
let __roContent: ResizeObserver | null = null
let __mo: MutationObserver | null = null
let __scheduled = false
let __minHeightDisabled = false
let __overflowConfirmations = 0
let __clearConfirmations = 0
// Observers and scheduler

function getScrollRoot() {
  return (scrollRoot.value || document.scrollingElement || document.documentElement) as HTMLElement
}

const autoScrollChase = createAutoScrollChaseController({
  getRoot: getScrollRoot,
  getShouldStick: () => shouldStickToBottom.value,
  setShouldStick: (value: boolean) => {
    shouldStickToBottom.value = value
  },
})

function replayStream() {
  startStreamSimulation()
  nextTick(() => {
    shouldStickToBottom.value = true
    autoScrollChase.scrollToBottom()
    autoScrollChase.schedule()
  })
}

function scheduleScrollToBottom() {
  autoScrollChase.schedule()
}

function handleScrollRootScroll() {
  autoScrollChase.handleScroll()
}

function handleScrollRootWheel(event: WheelEvent) {
  autoScrollChase.handleWheel(event.deltaY)
}

function handleScrollRootTouchMove() {
  autoScrollChase.handleTouchMove()
}

function handleScrollRootTouchEnd() {
  autoScrollChase.handleTouchEnd()
}

// Streaming updates can change the rendered height without reliably triggering
// ResizeObserver (e.g. due to layout containment / virtualization). Ensure we
// re-check after Vue has flushed DOM updates.
watch(
  () => content.value.length,
  () => {
    scheduleCheckMinHeight()
    scheduleScrollToBottom()
  },
  { flush: 'post' },
)

function scheduleCheckMinHeight() {
  if (__scheduled)
    return
  __scheduled = true
  requestAnimationFrame(() => {
    __scheduled = false
    const container = messagesContainer.value
    if (!container)
      return
    const hadClass = container.classList.contains('disable-min-height')

    // Hysteresis thresholds:
    // - Require overflow to persist for a couple of checks before latching.
    // - Require a few clear checks before undoing a latched state.
    const REQUIRED_OVERFLOW_CONFIRMATIONS = 2
    const REQUIRED_CLEAR_CONFIRMATIONS = 3

    // If currently latched (or DOM already has class), keep class and only
    // consider clearing after several consecutive non-overflow readings.
    if (__minHeightDisabled || hadClass) {
      container.classList.add('disable-min-height')
      const root = scrollRoot.value || document.scrollingElement || document.documentElement
      const shouldRemove = root.scrollHeight - root.clientHeight > 1

      if (shouldRemove) {
        __clearConfirmations = 0
        __minHeightDisabled = true
      }
      else {
        __clearConfirmations++
        if (__clearConfirmations >= REQUIRED_CLEAR_CONFIRMATIONS) {
          __minHeightDisabled = false
          __overflowConfirmations = 0
          container.classList.remove('disable-min-height')
        }
      }
      scheduleScrollToBottom()
      return
    }

    // Not latched: probe by temporarily unsetting min-height (same rAF tick).
    container.classList.add('disable-min-height')
    const root = scrollRoot.value || document.scrollingElement || document.documentElement
    const probeOverflow = root.scrollHeight - root.clientHeight > 1
    if (probeOverflow)
      __overflowConfirmations++
    else
      __overflowConfirmations = 0

    const shouldRemove = __overflowConfirmations >= REQUIRED_OVERFLOW_CONFIRMATIONS

    if (shouldRemove) {
      __minHeightDisabled = true
      __clearConfirmations = 0
      __mo?.disconnect()
      __mo = null
    }
    else {
      // Revert probe change before paint.
      container.classList.remove('disable-min-height')
    }
    scheduleScrollToBottom()
  })
}

onMounted(() => {
  const benchmarkWindow = window as Window & { __markstreamBenchmarkUnmount?: () => void }
  if (isBenchmarkMode) {
    benchmarkWindow.__markstreamBenchmarkUnmount = () => {
      stopStreamSimulation()
      autoScrollChase.cancel()
      __roContainer?.disconnect()
      __roContent?.disconnect()
      __mo?.disconnect()
      __roContainer = null
      __roContent = null
      __mo = null
      benchmarkRenderChat.value = false
    }
  }
  startStreamSimulation()

  // 初始检查和观察
  const container = messagesContainer.value
  if (!container)
    return
  // 初次判断（确保组件渲染完）
  requestAnimationFrame(scheduleCheckMinHeight)

  // A delayed layout change (for example, a large Markdown node finishing
  // parsing) must also extend the bottom-follow window. Do this directly from
  // ResizeObserver instead of relying only on the min-height probe's rAF.
  const handleObservedResize = () => {
    scheduleCheckMinHeight()
    scheduleScrollToBottom()
  }

  // 观察容器尺寸变化（窗口大小、面板大小）
  __roContainer = new ResizeObserver(handleObservedResize)
  __roContainer.observe(container)

  // 观察渲染内容尺寸变化（markdown 内容动态变化）
  const tryObserveContent = () => {
    const el = Array.from(container.children).find(child =>
      (child as HTMLElement).classList?.contains('markdown-renderer'),
    ) as HTMLElement | undefined
    if (el) {
      if (__roContent)
        __roContent.disconnect()
      __roContent = new ResizeObserver(handleObservedResize)
      __roContent.observe(el)
    }
  }
  tryObserveContent()

  // 如果 MarkdownRender 在后续替换了子节点，使用 MutationObserver 重新 attach
  __mo = new MutationObserver(() => {
    tryObserveContent()
    scheduleCheckMinHeight()
    scheduleScrollToBottom()
  })
  __mo.observe(container, { childList: true, subtree: true })
  scheduleScrollToBottom()
})

onBeforeUnmount(() => {
  const benchmarkWindow = window as Window & { __markstreamBenchmarkUnmount?: () => void }
  delete benchmarkWindow.__markstreamBenchmarkUnmount
  stopStreamSimulation()
  autoScrollChase.cancel()
  __roContainer?.disconnect()
  __roContent?.disconnect()
  __mo?.disconnect()
})
</script>

<template>
  <div class="playground-root" :class="{ dark: isDark }" :data-theme="activeBrandTheme || undefined">
    <!-- Background decorations -->
    <div class="playground-bg" aria-hidden="true">
      <div class="playground-bg__beam" />
      <div class="playground-bg__orb playground-bg__orb--1" />
      <div class="playground-bg__orb playground-bg__orb--2" />
      <div class="playground-bg__grid" />
      <div class="playground-bg__grain" />
    </div>

    <!-- Settings toggle (compact) -->
    <button
      v-if="isCompactSettings"
      class="settings-fab"
      aria-label="Toggle controls"
      :aria-expanded="showSettings"
      :class="{ 'settings-fab--active': showSettings }"
      @click="showSettings = !showSettings"
    >
      <Icon
        icon="carbon:settings-adjust"
        class="settings-fab__icon"
        :class="{ 'settings-fab__icon--open': showSettings }"
      />
    </button>

    <!-- Settings panel -->
    <Transition
      enter-active-class="settings-enter-active"
      enter-from-class="settings-enter-from"
      enter-to-class="settings-enter-to"
      leave-active-class="settings-leave-active"
      leave-from-class="settings-leave-from"
      leave-to-class="settings-leave-to"
    >
      <aside
        v-if="shouldShowSettingsPanel"
        class="settings-sidebar"
        :class="isCompactSettings ? 'settings-sidebar--floating' : 'settings-sidebar--docked'"
        @click.stop
      >
        <div class="settings-sidebar__header">
          <Icon icon="carbon:settings-adjust" class="settings-sidebar__header-icon" />
          <span class="settings-sidebar__title">Controls</span>
        </div>

        <!-- Brand Theme -->
        <div class="setting-group">
          <label class="setting-label">Brand Theme</label>
          <div class="setting-select-wrap">
            <select v-model="activeBrandTheme" class="setting-select">
              <option value="">
                Default
              </option>
              <option v-for="t in brandThemes.filter(Boolean)" :key="t" :value="t">
                {{ t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, ' ') }}
              </option>
            </select>
            <Icon icon="carbon:chevron-down" class="setting-select-icon" />
          </div>
        </div>

        <!-- Code Theme -->
        <div class="setting-group">
          <label class="setting-label">Code Theme</label>
          <div class="setting-select-wrap">
            <select v-model="selectedTheme" class="setting-select" aria-label="Code block theme" @click.stop @change.stop>
              <option v-for="t in themes" :key="t" :value="t">
                {{ formatThemeName(t) }}
              </option>
            </select>
            <Icon icon="carbon:chevron-down" class="setting-select-icon" />
          </div>
        </div>

        <!-- HTML Policy -->
        <div class="setting-group">
          <label class="setting-label">HTML Policy</label>
          <div class="setting-select-wrap">
            <select v-model="htmlPolicy" class="setting-select" aria-label="HTML policy">
              <option value="trusted">
                Trusted
              </option>
              <option value="safe">
                Safe
              </option>
              <option value="escape">
                Escape
              </option>
            </select>
            <Icon icon="carbon:chevron-down" class="setting-select-icon" />
          </div>
        </div>

        <template v-if="simulationMode === 'chunks'">
          <!-- Stream Profile -->
          <div class="setting-group">
            <label class="setting-label">Stream Profile</label>
            <div class="setting-select-wrap">
              <select v-model="selectedStreamPresetId" class="setting-select">
                <option v-for="preset in STREAM_PRESETS" :key="preset.id" :value="preset.id">
                  {{ preset.label }}
                </option>
                <option :value="CUSTOM_STREAM_PRESET_ID">
                  Custom
                </option>
              </select>
              <Icon icon="carbon:chevron-down" class="setting-select-icon" />
            </div>
            <p class="setting-hint">
              {{ streamPresetDescription }} Settings apply on replay.
            </p>
          </div>

          <!-- Transport -->
          <div class="setting-group">
            <label class="setting-label">Transport</label>
            <div class="setting-select-wrap">
              <select v-model="streamTransportMode" class="setting-select">
                <option value="readable-stream">
                  ReadableStream
                </option>
                <option value="scheduler">
                  Scheduler
                </option>
              </select>
              <Icon icon="carbon:chevron-down" class="setting-select-icon" />
            </div>
          </div>

          <!-- Slice Mode -->
          <div class="setting-group">
            <label class="setting-label">Slice Mode</label>
            <div class="setting-select-wrap">
              <select v-model="streamSliceMode" class="setting-select">
                <option value="pure-random">
                  Pure Random
                </option>
                <option value="boundary-aware">
                  Boundary Aware
                </option>
              </select>
              <Icon icon="carbon:chevron-down" class="setting-select-icon" />
            </div>
          </div>

          <div class="settings-divider" />

          <!-- Sliders -->
          <div class="setting-group">
            <label class="setting-label">Chunk Delay</label>
            <div class="setting-slider-row">
              <span class="setting-slider-label">Min</span>
              <input v-model.number="streamChunkDelayMin" type="range" min="8" max="240" step="4" class="setting-slider">
              <span class="setting-slider-value">{{ normalizedChunkDelayRange.min }}ms</span>
            </div>
            <div class="setting-slider-row">
              <span class="setting-slider-label">Max</span>
              <input v-model.number="streamChunkDelayMax" type="range" min="8" max="240" step="4" class="setting-slider">
              <span class="setting-slider-value">{{ normalizedChunkDelayRange.max }}ms</span>
            </div>
          </div>

          <div class="setting-group">
            <label class="setting-label">Chunk Size</label>
            <div class="setting-slider-row">
              <span class="setting-slider-label">Min</span>
              <input v-model.number="streamChunkSizeMin" type="range" min="1" max="24" step="1" class="setting-slider">
              <span class="setting-slider-value">{{ normalizedChunkSizeRange.min }}</span>
            </div>
            <div class="setting-slider-row">
              <span class="setting-slider-label">Max</span>
              <input v-model.number="streamChunkSizeMax" type="range" min="1" max="24" step="1" class="setting-slider">
              <span class="setting-slider-value">{{ normalizedChunkSizeRange.max }}</span>
            </div>
          </div>

          <div v-if="streamTransportMode === 'scheduler' && streamSliceMode === 'boundary-aware'" class="setting-group">
            <label class="setting-label">Burstiness</label>
            <div class="setting-slider-row">
              <input v-model.number="streamBurstiness" type="range" min="0" max="100" step="1" class="setting-slider">
              <span class="setting-slider-value">{{ normalizedBurstiness }}%</span>
            </div>
          </div>

          <p class="setting-hint">
            Window: {{ streamChunkRangeLabel }} chars / {{ streamDelayRangeLabel }}
          </p>

          <div class="settings-divider" />
        </template>

        <!-- Dark Mode -->
        <div class="setting-row-inline">
          <label id="dark-mode-label" class="setting-label">Dark Mode</label>
          <button
            class="theme-toggle"
            :class="{ 'theme-toggle--dark': isDark }"
            aria-labelledby="dark-mode-label"
            :aria-pressed="isDark"
            @click.stop="toggleTheme()"
          >
            <div class="theme-toggle__thumb">
              <Transition
                enter-active-class="transition-all duration-300 ease-out"
                leave-active-class="transition-all duration-200 ease-in"
                enter-from-class="opacity-0 scale-0 rotate-90"
                enter-to-class="opacity-100 scale-100 rotate-0"
                leave-from-class="opacity-100 scale-100 rotate-0"
                leave-to-class="opacity-0 scale-0 rotate-90"
                mode="out-in"
              >
                <Icon v-if="isDark" key="moon" icon="carbon:moon" class="theme-toggle__icon theme-toggle__icon--moon" />
                <Icon v-else key="sun" icon="carbon:sun" class="theme-toggle__icon theme-toggle__icon--sun" />
              </Transition>
            </div>
          </button>
        </div>

        <div class="setting-row-inline">
          <label id="smooth-stream-label" class="setting-label">Smooth Stream</label>
          <button
            class="theme-toggle"
            :class="{ 'theme-toggle--dark': smoothStreaming }"
            aria-labelledby="smooth-stream-label"
            :aria-pressed="smoothStreaming"
            @click.stop="smoothStreaming = !smoothStreaming"
          >
            <div class="theme-toggle__thumb">
              <Transition
                enter-active-class="transition-all duration-300 ease-out"
                leave-active-class="transition-all duration-200 ease-in"
                enter-from-class="opacity-0 scale-0 rotate-90"
                enter-to-class="opacity-100 scale-100 rotate-0"
                leave-from-class="opacity-100 scale-100 rotate-0"
                leave-to-class="opacity-0 scale-0 rotate-90"
                mode="out-in"
              >
                <Icon v-if="smoothStreaming" key="smooth-on" icon="carbon:checkmark" class="theme-toggle__icon theme-toggle__icon--moon" />
                <Icon v-else key="smooth-off" icon="carbon:close" class="theme-toggle__icon theme-toggle__icon--sun" />
              </Transition>
            </div>
          </button>
        </div>
      </aside>
    </Transition>

    <!-- Main chat area -->
    <div
      ref="scrollRoot"
      class="chat-wrapper"
      :class="{ 'chat-wrapper--with-sidebar': !isCompactSettings }"
      @scroll.passive="handleScrollRootScroll"
      @wheel.passive="handleScrollRootWheel"
      @touchmove.passive="handleScrollRootTouchMove"
      @touchend.passive="handleScrollRootTouchEnd"
      @touchcancel.passive="handleScrollRootTouchEnd"
    >
      <div class="chat-container">
        <!-- Header bar -->
        <header class="chat-header">
          <div class="chat-header__brand">
            <div class="chat-header__logo">
              <img
                src="/vue-markdown-icon.svg"
                alt=""
                class="chat-header__logo-icon"
              >
            </div>
            <div class="chat-header__info">
              <h1 class="chat-header__title">
                markstream-vue
              </h1>
              <p class="chat-header__subtitle">
                Streaming Markdown Renderer
              </p>
              <div class="chat-header__meta">
                <span
                  class="chat-header__meta-pill"
                  :class="{
                    'chat-header__meta-pill--active': isStreaming && !isPaused,
                    'chat-header__meta-pill--paused': isStreaming && isPaused,
                  }"
                >
                  <span class="chat-header__status-dot" />
                  {{ isStreaming ? (isPaused ? 'Paused' : 'Streaming') : 'Ready' }}
                </span>
                <span class="chat-header__meta-pill">{{ selectedTheme || 'Auto Theme' }}</span>
              </div>
            </div>
          </div>

          <nav class="chat-header__nav">
            <a
              href="https://github.com/Simon-He95/markstream-vue"
              target="_blank"
              rel="noopener noreferrer"
              class="nav-btn nav-btn--github"
            >
              <Icon icon="carbon:logo-github" class="nav-btn__icon" />
              <span class="nav-btn__text">Star</span>
            </a>

            <a
              href="https://markstream.simonhe.me/"
              target="_blank"
              rel="noopener noreferrer"
              class="nav-btn nav-btn--docs"
            >
              <Icon icon="carbon:book" class="nav-btn__icon" />
              <span class="nav-btn__text">Docs</span>
            </a>

            <button class="nav-btn nav-btn--themes" @click="goToThemeGallery">
              <Icon icon="carbon:color-palette" class="nav-btn__icon" />
              <span class="nav-btn__text">Themes</span>
            </button>

            <button class="nav-btn nav-btn--virtual" @click="goToVirtualScrollLab">
              <Icon icon="carbon:list" class="nav-btn__icon" />
              <span class="nav-btn__text">Virtual scroll lab</span>
            </button>

            <button class="nav-btn nav-btn--virtual" @click="goToVirtualTimelineZero">
              <Icon icon="carbon:flow" class="nav-btn__icon" />
              <span class="nav-btn__text">Virtual timeline</span>
            </button>

            <button class="nav-btn nav-btn--virtual" @click="goToVirtualScrollerMarkstream">
              <Icon icon="carbon:data-vis-1" class="nav-btn__icon" />
              <span class="nav-btn__text">Vue scroller</span>
            </button>

            <button
              class="nav-btn nav-btn--retry"
              @click="replayStream"
            >
              <Icon icon="carbon:restart" class="nav-btn__icon" />
              <span class="nav-btn__text">Retry</span>
            </button>

            <button
              class="nav-btn nav-btn--stream"
              :disabled="!isStreaming"
              @click="toggleStreamPause"
            >
              <Icon :icon="isPaused ? 'carbon:play-filled-alt' : 'carbon:pause-filled'" class="nav-btn__icon" />
              <span class="nav-btn__text">{{ isPaused ? 'Resume' : 'Pause' }}</span>
            </button>

            <button class="nav-btn nav-btn--test" @click="goToTest">
              <Icon icon="carbon:rocket" class="nav-btn__icon" />
              <span class="nav-btn__text">Test</span>
            </button>

            <button class="nav-btn nav-btn--cdn" @click="goToCdnPeers">
              <Icon icon="carbon:cloud" class="nav-btn__icon" />
              <span class="nav-btn__text">CDN</span>
            </button>
          </nav>
        </header>

        <StreamSpeedPanel
          :mode="simulationMode"
          :target-tps="normalizedTargetTps"
          :actual-tps="tpsSimulator.actualTps.value"
          :total-tokens="tpsSimulator.totalTokens.value"
          :elapsed-ms="tpsSimulator.elapsedMs.value"
          :progress="tpsSimulator.progress.value"
          :is-streaming="isStreaming"
          :is-paused="isPaused"
          :smooth-streaming="smoothStreaming"
          @mode="selectSimulationMode"
          @speed="selectTps"
        />

        <section v-if="simulationMode === 'chunks'" class="chat-overview">
          <div class="chat-overview__intro">
            <span class="chat-overview__eyebrow">Live Playground</span>
            <p class="chat-overview__summary">
              {{ streamPresetDescription }} Settings apply on replay.
            </p>
          </div>

          <div class="chat-overview__stats">
            <div class="chat-overview__stat">
              <span class="chat-overview__stat-label">Chunk</span>
              <strong class="chat-overview__stat-value">{{ streamChunkRangeLabel }}</strong>
            </div>
            <div class="chat-overview__stat">
              <span class="chat-overview__stat-label">Delay</span>
              <strong class="chat-overview__stat-value">{{ streamDelayRangeLabel }}</strong>
            </div>
            <div class="chat-overview__stat">
              <span class="chat-overview__stat-label">Transport</span>
              <strong class="chat-overview__stat-value">{{ streamTransportMode === 'readable-stream' ? 'Reader' : 'Scheduler' }}</strong>
            </div>
            <div class="chat-overview__stat">
              <span class="chat-overview__stat-label">Burst</span>
              <strong class="chat-overview__stat-value">{{ streamTransportMode === 'scheduler' && streamSliceMode === 'boundary-aware' ? `${normalizedBurstiness}%` : 'Off' }}</strong>
            </div>
          </div>

          <img
            src="/markstream-hero.webp"
            alt="markstream-vue streaming Markdown illustration"
            class="chat-overview__visual"
          >
        </section>

        <!-- Messages area -->
        <main ref="messagesContainer" class="chat-messages chatbot-messages">
          <MarkdownRender
            v-if="benchmarkRenderChat"
            :content="content"
            :smooth-streaming="smoothStreaming"
            :final="!isStreaming"
            fade
            :code-block-dark-theme="selectedTheme || undefined"
            :code-block-light-theme="selectedTheme || undefined"
            :html-policy="htmlPolicy"
            :themes="codeBlockThemes"
            :custom-html-tags="['thinking']"
            :escape-html-tags="['question', 'answer']"
            :is-dark="isDark"
            :debug-performance="isBenchmarkMode"
            :data-theme="activeBrandTheme || undefined"
            custom-id="playground-demo"
            class="chat-messages__content"
          />
        </main>
      </div>
    </div>
  </div>
</template>

<style src="../../../playground-shared/chat.css"></style>
