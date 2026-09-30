<script setup lang="ts">
import type { HtmlPolicy } from 'stream-markdown-parser'
import type { StreamSliceMode } from '../composables/createLocalTextStream'
import type { StreamPresetId } from '../composables/streamPresets'
import type { StreamTransportMode } from '../composables/useStreamSimulator'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
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
const brandThemes = [
  '',
  'airbnb',
  'airtable',
  'apple',
  'bmw',
  'cal',
  'claude',
  'clay',
  'clickhouse',
  'cohere',
  'coinbase',
  'composio',
  'cursor',
  'elevenlabs',
  'expo',
  'figma',
  'framer',
  'hashicorp',
  'ibm',
  'intercom',
  'kraken',
  'linear',
  'lovable',
  'minimax',
  'mintlify',
  'miro',
  'mistral',
  'mongodb',
  'notion',
  'nvidia',
  'ollama',
  'opencode-ai',
  'pinterest',
  'posthog',
  'raycast',
  'replicate',
  'resend',
  'revolut',
  'runwayml',
  'sanity',
  'sentry',
  'spacex',
  'spotify',
  'stripe',
  'supabase',
  'superhuman',
  'together-ai',
  'uber',
  'vercel',
  'voltagent',
  'warp',
  'webflow',
  'wise',
  'x-ai',
  'zapier',
]

// Code block theme selector (single dropdown)
const themes = [
  'andromeeda',
  'aurora-x',
  'ayu-dark',
  'catppuccin-frappe',
  'catppuccin-latte',
  'catppuccin-macchiato',
  'catppuccin-mocha',
  'dark-plus',
  'dracula',
  'dracula-soft',
  'everforest-dark',
  'everforest-light',
  'github-dark',
  'github-dark-default',
  'github-dark-dimmed',
  'github-dark-high-contrast',
  'github-light',
  'github-light-default',
  'github-light-high-contrast',
  'gruvbox-dark-hard',
  'gruvbox-dark-medium',
  'gruvbox-dark-soft',
  'gruvbox-light-hard',
  'gruvbox-light-medium',
  'gruvbox-light-soft',
  'houston',
  'kanagawa-dragon',
  'kanagawa-lotus',
  'kanagawa-wave',
  'laserwave',
  'light-plus',
  'material-theme',
  'material-theme-darker',
  'material-theme-lighter',
  'material-theme-ocean',
  'material-theme-palenight',
  'min-dark',
  'min-light',
  'monokai',
  'night-owl',
  'nord',
  'one-dark-pro',
  'one-light',
  'plastic',
  'poimandres',
  'red',
  'rose-pine',
  'rose-pine-dawn',
  'rose-pine-moon',
  'slack-dark',
  'slack-ochin',
  'snazzy-light',
  'solarized-dark',
  'solarized-light',
  'synthwave-84',
  'tokyo-night',
  'vesper',
  'vitesse-black',
  'vitesse-dark',
  'vitesse-light',
]
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

<style scoped>
/* ─── Root & Background ─── */
.playground-root {
  /*
   * The library scopes its `--ms-*` bridge tokens to `.markstream-vue`, so page
   * chrome in this playground cannot inherit them: every `var(--ms-*)` below
   * would resolve to nothing and drop the whole declaration (no page background,
   * no card border/shadow). Mirror the library's light defaults for the page.
   * `.markstream-vue` subtrees still declare their own tokens on themselves,
   * so this stays out of the renderer.
   */
  --ms-background: 0 0% 100%;
  --ms-foreground: 0 0% 10%;
  --ms-muted: 0 0% 96.5%;
  --ms-muted-foreground: 0 0% 43%;
  --ms-accent: 0 0% 91%;
  --ms-border: 0 0% 87%;
  --ms-ring: 0 0% 10%;
  --play-accent: #0d9488;
  --play-accent-bright: #14b8a6;
  --play-accent-soft: rgba(13, 148, 136, 0.1);
  --play-accent-ring: rgba(13, 148, 136, 0.32);
  --play-ink: #0c1420;
  --play-paper: rgba(255, 255, 255, 0.74);
  --play-border: hsl(var(--ms-border) / 0.6);
  --play-shadow-tint: rgba(12, 74, 68, 0.14);
  --play-font-display: 'Space Grotesk', 'Avenir Next', 'SF Pro Display', 'Segoe UI', sans-serif;
  --play-font-mono: 'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, monospace;
  --speed-surface: rgb(255 255 255 / 0.5);
  --speed-subtle: rgb(12 20 32 / 0.04);
  --speed-text: var(--play-ink);
  --speed-muted: #52616e;
  --speed-border: rgb(12 20 32 / 0.09);
  --speed-accent: var(--play-accent);
  font-family: var(--play-font-display);
  position: relative;
  min-height: 100dvh;
  overflow-x: hidden;
  background:
    radial-gradient(ellipse 60% 42% at 12% -6%, rgba(13, 148, 136, 0.14), transparent 62%),
    radial-gradient(ellipse 48% 38% at 92% 108%, rgba(56, 89, 199, 0.09), transparent 60%),
    linear-gradient(168deg, #f8fafa 0%, #eff4f3 52%, #edf1f5 100%);
  color: hsl(var(--ms-foreground));
  transition: background-color 0.3s ease;
}

.playground-root.dark {
  /* Dark counterparts of the bridge tokens declared on `.playground-root`. */
  --ms-background: 210 22% 6%;
  --ms-foreground: 0 0% 93%;
  --ms-muted: 210 16% 11%;
  --ms-muted-foreground: 0 0% 60%;
  --ms-accent: 210 14% 20%;
  --ms-border: 210 14% 19%;
  --ms-ring: 0 0% 80%;
  --play-accent: #2dd4bf;
  --play-accent-bright: #5eead4;
  --play-accent-soft: rgba(45, 212, 191, 0.1);
  --play-accent-ring: rgba(45, 212, 191, 0.36);
  --play-ink: #e6edf3;
  --play-paper: rgba(13, 20, 28, 0.66);
  --play-border: hsl(var(--ms-border) / 0.7);
  --play-shadow-tint: rgba(0, 0, 0, 0.5);
  --speed-surface: rgb(255 255 255 / 0.045);
  --speed-subtle: rgb(255 255 255 / 0.04);
  --speed-text: #e2e8f0;
  --speed-muted: #8fa0b3;
  --speed-border: rgb(255 255 255 / 0.09);
  --speed-accent: #2dd4bf;
  background:
    radial-gradient(ellipse 60% 44% at 12% -8%, rgba(45, 212, 191, 0.1), transparent 62%),
    radial-gradient(ellipse 50% 40% at 94% 110%, rgba(56, 89, 199, 0.12), transparent 60%),
    linear-gradient(168deg, #080d13 0%, #0a1017 55%, #0b1119 100%);
}

.playground-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

/* Diagonal light beam sweeping the backdrop */
.playground-bg__beam {
  position: absolute;
  top: -32%;
  left: 18%;
  width: 560px;
  height: 150%;
  transform: rotate(24deg);
  background: linear-gradient(90deg, transparent, rgba(20, 184, 166, 0.055), transparent);
  filter: blur(28px);
}

.playground-bg__orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(110px);
  will-change: transform;
}

.playground-bg__orb--1 {
  top: -14%;
  left: -8%;
  width: 620px;
  height: 620px;
  background: radial-gradient(circle, rgba(20, 184, 166, 0.32), rgba(13, 148, 136, 0.08) 55%, transparent 72%);
  animation: orbDrift 26s ease-in-out infinite alternate;
}

.playground-bg__orb--2 {
  bottom: -20%;
  right: -10%;
  width: 540px;
  height: 540px;
  background: radial-gradient(circle, rgba(56, 89, 199, 0.2), rgba(14, 116, 144, 0.06) 55%, transparent 72%);
  animation: orbDrift 32s ease-in-out infinite alternate-reverse;
}

@keyframes orbDrift {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(4%, 6%, 0) scale(1.08); }
}

/* Faint engineering grid that fades into the center */
.playground-bg__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(hsl(var(--ms-foreground) / 0.028) 1px, transparent 1px),
    linear-gradient(90deg, hsl(var(--ms-foreground) / 0.028) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(ellipse 90% 70% at 50% 0%, rgba(0, 0, 0, 0.9), transparent 74%);
}

/* Film grain to break digital flatness */
.playground-bg__grain {
  position: absolute;
  inset: -50%;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.028;
  mix-blend-mode: overlay;
}

.playground-root.dark .playground-bg__grain {
  opacity: 0.05;
}

.playground-root.dark .playground-bg__grid {
  background-image:
    linear-gradient(rgb(255 255 255 / 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 0.03) 1px, transparent 1px);
}

/* ─── Settings FAB (compact) ─── */
.settings-fab {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 50;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--play-border);
  border-radius: 14px;
  background: var(--play-paper);
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 24px var(--play-shadow-tint);
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.settings-fab:hover {
  border-color: var(--play-accent-ring);
  box-shadow: 0 10px 32px var(--play-shadow-tint);
  transform: translateY(-2px);
}

.settings-fab:active {
  transform: scale(0.94);
}

.settings-fab:focus-visible {
  outline: 2px solid var(--play-accent);
  outline-offset: 2px;
}

.settings-fab--active {
  background: var(--play-accent-soft);
  border-color: var(--play-accent-ring);
}

.settings-fab__icon {
  width: 20px;
  height: 20px;
  color: hsl(var(--ms-muted-foreground));
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.2s ease;
}

.settings-fab--active .settings-fab__icon {
  color: var(--play-accent);
}

.settings-fab__icon--open {
  transform: rotate(60deg);
}

/* ─── Settings Sidebar ─── */
.settings-sidebar {
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 284px;
  padding: 22px;
  background:
    linear-gradient(180deg, hsl(var(--ms-background) / 0.9), hsl(var(--ms-background) / 0.82));
  backdrop-filter: blur(16px);
  border: 1px solid var(--play-border);
  overflow-y: auto;
  scrollbar-width: thin;
}

.settings-sidebar--docked {
  position: fixed;
  top: 0;
  right: 0;
  height: 100dvh;
  border-radius: 0;
  border-right: 0;
  border-top: 0;
  border-bottom: 0;
  box-shadow: -12px 0 48px var(--play-shadow-tint);
}

.settings-sidebar--floating {
  position: fixed;
  top: 68px;
  right: 16px;
  max-height: calc(100dvh - 84px);
  border-radius: 20px;
  box-shadow: 0 24px 64px var(--play-shadow-tint), 0 4px 16px var(--play-shadow-tint);
}

.settings-enter-active { transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
.settings-enter-from { opacity: 0; transform: translateX(20px) scale(0.96); }
.settings-enter-to { opacity: 1; transform: translateX(0) scale(1); }
.settings-leave-active { transition: all 0.2s ease; }
.settings-leave-from { opacity: 1; transform: translateX(0) scale(1); }
.settings-leave-to { opacity: 0; transform: translateX(20px) scale(0.96); }

.settings-sidebar__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 14px;
  border-bottom: 1px solid hsl(var(--ms-border) / 0.4);
}

.settings-sidebar__header-icon {
  width: 15px;
  height: 15px;
  color: var(--play-accent);
}

.settings-sidebar__title {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: hsl(var(--ms-muted-foreground));
}

.settings-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, hsl(var(--ms-border) / 0.55), transparent);
}

/* ─── Setting Controls ─── */
.setting-group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.setting-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: hsl(var(--ms-muted-foreground));
}

.setting-select-wrap {
  position: relative;
}

.setting-select {
  width: 100%;
  appearance: none;
  padding: 9px 32px 9px 12px;
  font-family: var(--play-font-display);
  font-size: 0.82rem;
  font-weight: 500;
  color: hsl(var(--ms-foreground));
  background: hsl(var(--ms-muted) / 0.45);
  border: 1px solid hsl(var(--ms-border) / 0.5);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.setting-select:hover {
  background: hsl(var(--ms-muted) / 0.72);
  border-color: var(--play-accent-ring);
}

.setting-select:focus-visible {
  outline: none;
  border-color: var(--play-accent);
  box-shadow: 0 0 0 3px var(--play-accent-soft);
}

.setting-select-icon {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  color: hsl(var(--ms-muted-foreground));
  pointer-events: none;
}

.setting-hint {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.55;
  color: hsl(var(--ms-muted-foreground) / 0.75);
}

.setting-slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.setting-slider-label {
  width: 28px;
  flex-shrink: 0;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: hsl(var(--ms-muted-foreground));
}

.setting-slider {
  flex: 1;
  height: 4px;
  appearance: none;
  border-radius: 999px;
  background: hsl(var(--ms-foreground) / 0.12);
  cursor: pointer;
}

.setting-slider::-webkit-slider-thumb {
  appearance: none;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--play-accent-bright);
  border: 2px solid hsl(var(--ms-background));
  box-shadow: 0 1px 6px var(--play-accent-ring);
  transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.setting-slider::-webkit-slider-thumb:hover {
  transform: scale(1.18);
}

.setting-slider::-moz-range-thumb {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: var(--play-accent-bright);
  border: 2px solid hsl(var(--ms-background));
  box-shadow: 0 1px 6px var(--play-accent-ring);
}

.setting-slider:focus-visible {
  outline: 2px solid var(--play-accent);
  outline-offset: 4px;
}

.setting-slider-value {
  width: 52px;
  flex-shrink: 0;
  text-align: right;
  font-family: var(--play-font-mono);
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--play-accent);
  font-variant-numeric: tabular-nums;
}

.setting-row-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* ─── Theme Toggle ─── */
.theme-toggle {
  position: relative;
  width: 48px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid hsl(var(--ms-border) / 0.6);
  background: hsl(var(--ms-muted));
  cursor: pointer;
  transition: background 0.35s ease, border-color 0.35s ease;
}

.theme-toggle:hover {
  border-color: var(--play-accent-ring);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--play-accent);
  outline-offset: 2px;
}

.theme-toggle--dark {
  background: var(--play-accent);
  border-color: transparent;
}

.theme-toggle__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  transition: left 0.35s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.theme-toggle--dark .theme-toggle__thumb {
  left: 24px;
}

.theme-toggle__icon { width: 12px; height: 12px; }
.theme-toggle__icon--moon { color: var(--play-accent); }
.theme-toggle__icon--sun { color: #d97706; }

/* ─── Chat Wrapper ─── */
.chat-wrapper {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  box-sizing: border-box;
  height: 100dvh;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 24px;
  overscroll-behavior: contain;
  transition: padding-right 0.3s ease;
}

.chat-wrapper--with-sidebar {
  padding-right: 308px;
}

/* ─── Chat Container ─── */
.chat-container {
  position: relative;
  flex: 0 0 auto;
  width: 100%;
  max-width: 1000px;
  min-height: calc(100dvh - 48px);
  display: flex;
  flex-direction: column;
  border-radius: 28px;
  border: 1px solid var(--play-border);
  background:
    linear-gradient(180deg, hsl(var(--ms-background) / 0.9), hsl(var(--ms-background) / 0.8));
  /*
   * No `backdrop-filter` on the page-wide cards: Chromium whites out large
   * blurred backdrops while scrolling (issues.chromium.org/issues/339841685).
   * The translucent surfaces alone keep the intended look.
   */
  box-shadow:
    0 0 0 1px hsl(var(--ms-border) / 0.08),
    0 32px 90px var(--play-shadow-tint),
    0 8px 24px var(--play-shadow-tint);
}

/* Spotlight top edge: a hairline of accent light across the card */
.chat-container::after {
  content: '';
  position: absolute;
  top: 0;
  left: 8%;
  right: 8%;
  height: 1px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, var(--play-accent-ring), transparent);
}

.chat-container::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background-image: linear-gradient(rgba(15, 23, 42, 0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 23, 42, 0.018) 1px, transparent 1px);
  background-size: 30px 30px;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.7), transparent 78%);
}

/* ─── Chat Header ─── */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid hsl(var(--ms-border) / 0.4);
  background: linear-gradient(180deg, hsl(var(--ms-muted) / 0.42), hsl(var(--ms-muted) / 0.18));
  flex-wrap: wrap;
}

.chat-header__brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.chat-header__logo {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 15px;
  background: linear-gradient(145deg, var(--play-accent), #0e7490);
  box-shadow:
    0 10px 26px var(--play-accent-ring),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
}

.chat-header__logo::after {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: 19px;
  border: 1px solid var(--play-accent-ring);
  opacity: 0.5;
}

.chat-header__logo-icon {
  width: 30px;
  height: 30px;
  display: block;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25));
}

.chat-header__info {
  display: flex;
  flex-direction: column;
}

.chat-header__meta {
  margin-top: 7px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chat-header__meta-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-family: var(--play-font-mono);
  font-size: 0.64rem;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: hsl(var(--ms-muted-foreground));
  background: hsl(var(--ms-muted) / 0.5);
  border: 1px solid hsl(var(--ms-border) / 0.45);
}

.chat-header__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: hsl(var(--ms-muted-foreground));
  flex-shrink: 0;
}

.chat-header__meta-pill--active {
  color: var(--play-accent);
  border-color: var(--play-accent-ring);
  background: var(--play-accent-soft);
}

.chat-header__meta-pill--active .chat-header__status-dot {
  background: var(--play-accent-bright);
  box-shadow: 0 0 0 0 var(--play-accent-ring);
  animation: statusPulse 1.6s ease-out infinite;
}

.chat-header__meta-pill--paused {
  color: #b45309;
  border-color: rgba(217, 119, 6, 0.3);
  background: rgba(217, 119, 6, 0.1);
}

.chat-header__meta-pill--paused .chat-header__status-dot {
  background: #d97706;
}

@keyframes statusPulse {
  0% { box-shadow: 0 0 0 0 var(--play-accent-ring); }
  70% { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

.chat-header__title {
  margin: 0;
  font-size: 1.18rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  background: linear-gradient(100deg, hsl(var(--ms-foreground)) 30%, var(--play-accent) 85%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

.chat-header__subtitle {
  margin: 1px 0 0;
  font-size: 0.74rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: hsl(var(--ms-muted-foreground));
}

/* ─── Chat Overview ─── */
.chat-overview {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 112px;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid hsl(var(--ms-border) / 0.34);
  background:
    linear-gradient(180deg, hsl(var(--ms-background) / 0.42), hsl(var(--ms-background) / 0.14));
}

.chat-overview__visual {
  width: 112px;
  aspect-ratio: 1;
  align-self: center;
  justify-self: end;
  object-fit: cover;
  border: 1px solid var(--play-border);
  border-radius: 18px;
  box-shadow: 0 12px 30px var(--play-accent-ring);
  transition: transform 0.35s cubic-bezier(0.34, 1.4, 0.64, 1);
}

.chat-overview__visual:hover {
  transform: translateY(-3px) rotate(-1.5deg);
}

.chat-overview__intro {
  display: grid;
  gap: 9px;
  align-content: start;
}

.chat-overview__eyebrow {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 6px;
  padding: 4px 11px;
  border-radius: 6px;
  background: var(--play-accent-soft);
  border: 1px solid var(--play-accent-ring);
  color: var(--play-accent);
  font-family: var(--play-font-mono);
  font-size: 0.64rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.chat-overview__summary {
  margin: 0;
  max-width: 52ch;
  color: hsl(var(--ms-muted-foreground));
  font-size: 0.8rem;
  line-height: 1.6;
}

.chat-overview__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.chat-overview__stat {
  display: grid;
  gap: 5px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid hsl(var(--ms-border) / 0.42);
  background: hsl(var(--ms-muted) / 0.32);
  transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;
}

.chat-overview__stat:hover {
  border-color: var(--play-accent-ring);
  background: var(--play-accent-soft);
  transform: translateY(-2px);
}

.chat-overview__stat-label {
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: hsl(var(--ms-muted-foreground));
}

.chat-overview__stat-value {
  font-family: var(--play-font-mono);
  font-size: 0.85rem;
  font-weight: 600;
  color: hsl(var(--ms-foreground));
  font-variant-numeric: tabular-nums;
}

/* ─── Nav Buttons ─── */
.chat-header__nav {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 13px;
  font-family: var(--play-font-display);
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  border: 1px solid hsl(var(--ms-border) / 0.5);
  border-radius: 10px;
  cursor: pointer;
  color: hsl(var(--ms-foreground) / 0.85);
  background: hsl(var(--ms-muted) / 0.35);
  text-decoration: none;
  white-space: nowrap;
  transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.18s ease, background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.nav-btn:hover {
  transform: translateY(-1px);
  border-color: var(--play-accent-ring);
  background: var(--play-accent-soft);
  color: var(--play-accent);
  box-shadow: 0 6px 18px var(--play-shadow-tint);
}

.nav-btn:active {
  transform: scale(0.95);
  box-shadow: none;
}

.nav-btn:focus-visible {
  outline: 2px solid var(--play-accent);
  outline-offset: 2px;
}

.nav-btn:disabled {
  opacity: 0.38;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.nav-btn__icon { width: 15px; height: 15px; }
.nav-btn__text { line-height: 1; }

/* Primary action */
.nav-btn--stream {
  background: linear-gradient(140deg, var(--play-accent), #0e7490);
  border-color: transparent;
  color: #f0fdfa;
  box-shadow: 0 6px 18px var(--play-accent-ring), inset 0 1px 0 rgba(255, 255, 255, 0.22);
}

.nav-btn--stream:hover:not(:disabled) {
  background: linear-gradient(140deg, var(--play-accent-bright), var(--play-accent));
  color: #fff;
  box-shadow: 0 10px 26px var(--play-accent-ring);
}

/* ─── Chat Messages ─── */
.chat-messages {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  scroll-behavior: smooth;
}

.chat-messages > .markdown-renderer {
  flex: 1 1 auto;
  min-height: 100%;
  box-sizing: border-box;
}

.chat-messages.disable-min-height > .markdown-renderer {
  flex: 0 1 auto;
  min-height: unset !important;
}

.chat-messages__content {
  padding: 30px 34px;
  font-family: var(--play-font-display);
}

/* ─── Code block rendering glow ─── */
:deep(.code-block-container.is-rendering) {
  position: relative;
  animation: renderingGlow 1.8s ease-in-out infinite;
}

@keyframes renderingGlow {
  0%, 100% { box-shadow: 0 0 0 1px var(--play-accent-ring), 0 0 18px rgba(20, 184, 166, 0.22); }
  50% { box-shadow: 0 0 0 1px var(--play-accent-ring), 0 0 34px rgba(20, 184, 166, 0.4); }
}

:deep(.is-rendering) {
  position: relative;
  animation: renderingGlow 1.8s ease-in-out infinite;
}

/* ─── Responsive ─── */
@media (max-width: 768px) {
  .chat-wrapper { padding: 10px; }
  .chat-wrapper--with-sidebar { padding-right: 10px; }
  .chat-container { border-radius: 20px; min-height: calc(100dvh - 20px); }
  .chat-header__nav { gap: 5px; }
  .chat-overview { grid-template-columns: 1fr; padding: 14px 16px; }
  .chat-overview__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .chat-overview__visual { width: 96px; justify-self: start; }
  .nav-btn { padding: 6px 9px; font-size: 0.72rem; border-radius: 9px; }
  .nav-btn__text { display: none; }
  .nav-btn__icon { width: 16px; height: 16px; }
  .chat-messages__content { padding: 20px 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .playground-bg__orb,
  .chat-header__status-dot,
  :deep(.is-rendering),
  :deep(.code-block-container.is-rendering) {
    animation: none;
  }
}
</style>
