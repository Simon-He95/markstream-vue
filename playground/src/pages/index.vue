<script setup lang="ts">
import type { HtmlPolicy } from 'stream-markdown-parser'
import type { StreamSliceMode } from '../composables/createLocalTextStream'
import type { StreamPresetId } from '../composables/streamPresets'
import type { StreamTransportMode } from '../composables/useStreamSimulator'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { getUseMonaco } from '../../../src/components/CodeBlockNode/monaco'
import MarkdownRender, { setCustomComponents, setKaTeXWorker, setMermaidWorker } from 'markstream-vue'
import KatexWorker from '../../../src/workers/katexRenderer.worker?worker&inline'
import MermaidWorker from '../../../src/workers/mermaidParser.worker?worker&inline'
import ThinkingNode from '../components/ThinkingNode.vue'
import { CUSTOM_STREAM_PRESET_ID, findMatchingStreamPreset, getStreamPreset, STREAM_PRESETS } from '../composables/streamPresets'
import { clampStreamControl, normalizeStreamRange, useStreamSimulator } from '../composables/useStreamSimulator'
import { usePlaygroundI18n } from '../composables'
import { streamContent } from '../const/markdown'
import 'katex/dist/katex.min.css'
import 'markstream-vue/index.css'
// import MarkdownCodeBlockNode from '../../../src/components/MarkdownCodeBlockNode'

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
const diffHideUnchangedRegions = {
  enabled: true,
  contextLineCount: 2,
  minimumLineCount: 4,
  revealLineCount: 5,
} as const
const playgroundMonacoOptions = {
  renderSideBySide: false,
  useInlineViewWhenSpaceIsLimited: true,
  maxComputationTime: 0,
  ignoreTrimWhitespace: false,
  renderIndicators: true,
  diffAlgorithm: 'legacy',
  diffHideUnchangedRegions,
  hideUnchangedRegions: diffHideUnchangedRegions,
} as const

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
const streamPresetDescription = computed(() => {
  return getPresetDescription(activeStreamPreset.value)
})
const streamChunkRangeLabel = computed(() => `${normalizedChunkSizeRange.value.min}-${normalizedChunkSizeRange.value.max}`)
const streamDelayRangeLabel = computed(() => `${normalizedChunkDelayRange.value.min}-${normalizedChunkDelayRange.value.max}ms`)
const isBenchmarkMode = typeof window !== 'undefined' && new URL(window.location.href).searchParams.get('benchmark') === '1'
const benchmarkRenderChat = ref(true)
const {
  content,
  isPaused,
  isStreaming,
  start: startStreamSimulation,
  stop: stopStreamSimulation,
  togglePause: toggleStreamPause,
} = useStreamSimulator({
  source: fullStreamContent,
  chunkSizeMin: computed(() => normalizedChunkSizeRange.value.min),
  chunkSizeMax: computed(() => normalizedChunkSizeRange.value.max),
  chunkDelayMin: computed(() => normalizedChunkDelayRange.value.min),
  chunkDelayMax: computed(() => normalizedChunkDelayRange.value.max),
  burstiness: computed(() => normalizedBurstiness.value / 100),
  sliceMode: streamSliceMode,
  transportMode: streamTransportMode,
})

// 预加载 Monaco 编辑器
if (!isBenchmarkMode)
  getUseMonaco()
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

setCustomComponents('playground-demo', { thinking: ThinkingNode })

const { isZh, t, getPresetLabel, getPresetDescription } = usePlaygroundI18n()

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
let __autoScrollScheduled = false
// Observers and scheduler

function getScrollRoot() {
  return scrollRoot.value || document.scrollingElement || document.documentElement
}

function isScrollRootAtBottom(root = getScrollRoot(), threshold = 24) {
  return root.scrollHeight - root.scrollTop - root.clientHeight <= threshold
}

function scrollToBottom() {
  const root = getScrollRoot()
  root.scrollTop = root.scrollHeight
}

function scheduleScrollToBottom() {
  if (!shouldStickToBottom.value || __autoScrollScheduled)
    return

  __autoScrollScheduled = true
  requestAnimationFrame(() => {
    __autoScrollScheduled = false
    if (shouldStickToBottom.value)
      scrollToBottom()
  })
}

function handleScrollRootScroll() {
  shouldStickToBottom.value = isScrollRootAtBottom()
}

function handleScrollRootWheel(event: WheelEvent) {
  if (event.deltaY < 0)
    shouldStickToBottom.value = false
}

function handleScrollRootTouchMove() {
  shouldStickToBottom.value = false
}

function handleScrollRootTouchEnd() {
  if (isScrollRootAtBottom())
    shouldStickToBottom.value = true
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
      // 内容已超出：不再需要继续监听，断开所有 observer 以节省开销
      try {
        __roContainer?.disconnect()
        __roContent?.disconnect()
        __mo?.disconnect()
      }
      finally {
        __roContainer = null
        __roContent = null
        __mo = null
      }
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

  // 观察容器尺寸变化（窗口大小、面板大小）
  __roContainer = new ResizeObserver(scheduleCheckMinHeight)
  __roContainer.observe(container)

  // 观察渲染内容尺寸变化（markdown 内容动态变化）
  const tryObserveContent = () => {
    const el = Array.from(container.children).find(child =>
      (child as HTMLElement).classList?.contains('markdown-renderer'),
    ) as HTMLElement | undefined
    if (el) {
      if (__roContent)
        __roContent.disconnect()
      __roContent = new ResizeObserver(scheduleCheckMinHeight)
      __roContent.observe(el)
    }
  }
  tryObserveContent()

  // 如果 MarkdownRender 在后续替换了子节点，使用 MutationObserver 重新 attach
  __mo = new MutationObserver(() => {
    tryObserveContent()
    scheduleCheckMinHeight()
  })
  __mo.observe(container, { childList: true, subtree: true })
  scheduleScrollToBottom()
})

onBeforeUnmount(() => {
  const benchmarkWindow = window as Window & { __markstreamBenchmarkUnmount?: () => void }
  delete benchmarkWindow.__markstreamBenchmarkUnmount
  stopStreamSimulation()
  __roContainer?.disconnect()
  __roContent?.disconnect()
  __mo?.disconnect()
})
</script>

<template>
  <div class="playground-root" :class="{ dark: isDark }" :data-theme="activeBrandTheme || undefined">
    <!-- Background decorations -->
    <div class="playground-bg">
      <div class="playground-bg__orb playground-bg__orb--1" />
      <div class="playground-bg__orb playground-bg__orb--2" />
      <div class="playground-bg__orb playground-bg__orb--3" />
    </div>

    <!-- Settings toggle (compact) -->
    <button
      v-if="isCompactSettings"
      class="settings-fab"
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
          <span class="settings-sidebar__title">{{ t('controls') }}</span>
        </div>

        <!-- Brand Theme -->
        <div class="setting-group">
          <label class="setting-label">{{ t('brandTheme') }}</label>
          <div class="setting-select-wrap">
            <select v-model="activeBrandTheme" class="setting-select">
              <option value="">
                {{ t('default') }}
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
          <label class="setting-label">{{ t('codeTheme') }}</label>
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
          <label class="setting-label">{{ t('htmlPolicy') }}</label>
          <div class="setting-select-wrap">
            <select v-model="htmlPolicy" class="setting-select" aria-label="HTML policy">
              <option value="trusted">
                {{ t('trusted') }}
              </option>
              <option value="safe">
                {{ t('safe') }}
              </option>
              <option value="escape">
                {{ t('escape') }}
              </option>
            </select>
            <Icon icon="carbon:chevron-down" class="setting-select-icon" />
          </div>
        </div>

        <!-- Stream Profile -->
        <div class="setting-group">
          <label class="setting-label">{{ t('streamProfile') }}</label>
          <div class="setting-select-wrap">
            <select v-model="selectedStreamPresetId" class="setting-select">
              <option v-for="preset in STREAM_PRESETS" :key="preset.id" :value="preset.id">
                {{ getPresetLabel(preset) }}
              </option>
              <option :value="CUSTOM_STREAM_PRESET_ID">
                {{ t('custom') }}
              </option>
            </select>
            <Icon icon="carbon:chevron-down" class="setting-select-icon" />
          </div>
          <p class="setting-hint">
            {{ streamPresetDescription }}
          </p>
        </div>

        <!-- Transport -->
        <div class="setting-group">
          <label class="setting-label">{{ t('transport') }}</label>
          <div class="setting-select-wrap">
            <select v-model="streamTransportMode" class="setting-select">
              <option value="readable-stream">
                {{ t('readableStreamOption') }}
              </option>
              <option value="scheduler">
                {{ t('schedulerOption') }}
              </option>
            </select>
            <Icon icon="carbon:chevron-down" class="setting-select-icon" />
          </div>
        </div>

        <!-- Slice Mode -->
        <div class="setting-group">
          <label class="setting-label">{{ t('sliceMode') }}</label>
          <div class="setting-select-wrap">
            <select v-model="streamSliceMode" class="setting-select">
              <option value="pure-random">
                {{ t('pureRandom') }}
              </option>
              <option value="boundary-aware">
                {{ t('boundaryAware') }}
              </option>
            </select>
            <Icon icon="carbon:chevron-down" class="setting-select-icon" />
          </div>
        </div>

        <div class="settings-divider" />

        <!-- Sliders -->
        <div class="setting-group">
          <label class="setting-label">{{ t('chunkDelay') }}</label>
          <div class="setting-slider-row">
            <span class="setting-slider-label">{{ t('min') }}</span>
            <input v-model.number="streamChunkDelayMin" type="range" min="8" max="240" step="4" class="setting-slider">
            <span class="setting-slider-value">{{ normalizedChunkDelayRange.min }}ms</span>
          </div>
          <div class="setting-slider-row">
            <span class="setting-slider-label">{{ t('max') }}</span>
            <input v-model.number="streamChunkDelayMax" type="range" min="8" max="240" step="4" class="setting-slider">
            <span class="setting-slider-value">{{ normalizedChunkDelayRange.max }}ms</span>
          </div>
        </div>

        <div class="setting-group">
          <label class="setting-label">{{ t('chunkSize') }}</label>
          <div class="setting-slider-row">
            <span class="setting-slider-label">{{ t('min') }}</span>
            <input v-model.number="streamChunkSizeMin" type="range" min="1" max="24" step="1" class="setting-slider">
            <span class="setting-slider-value">{{ normalizedChunkSizeRange.min }}</span>
          </div>
          <div class="setting-slider-row">
            <span class="setting-slider-label">{{ t('max') }}</span>
            <input v-model.number="streamChunkSizeMax" type="range" min="1" max="24" step="1" class="setting-slider">
            <span class="setting-slider-value">{{ normalizedChunkSizeRange.max }}</span>
          </div>
        </div>

        <div class="setting-group">
          <label class="setting-label">{{ t('burstiness') }}</label>
          <div class="setting-slider-row">
            <input v-model.number="streamBurstiness" type="range" min="0" max="100" step="1" class="setting-slider">
            <span class="setting-slider-value">{{ normalizedBurstiness }}%</span>
          </div>
        </div>

        <p class="setting-hint">
          {{ t('window') }}: {{ streamChunkRangeLabel }} {{ t('chars') }} / {{ streamDelayRangeLabel }}
        </p>

        <div class="settings-divider" />

        <!-- Language Switcher -->
        <div class="setting-row-inline" style="margin-bottom: 12px;">
          <label class="setting-label">{{ t('language') }}</label>
          <button
            class="theme-toggle"
            :class="{ 'theme-toggle--dark': isZh }"
            @click.stop="isZh = !isZh"
          >
            <div class="theme-toggle__thumb">
              <span style="font-size: 9px; font-weight: bold; color: #3b82f6; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
                {{ isZh ? '中' : 'EN' }}
              </span>
            </div>
          </button>
        </div>

        <!-- Dark Mode -->
        <div class="setting-row-inline">
          <label class="setting-label">{{ t('darkMode') }}</label>
          <button
            class="theme-toggle"
            :class="{ 'theme-toggle--dark': isDark }"
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
          <label class="setting-label">{{ t('smoothStream') }}</label>
          <button
            class="theme-toggle"
            :class="{ 'theme-toggle--dark': smoothStreaming }"
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
                {{ t('subtitle') }}
              </p>
              <div class="chat-header__meta">
                <span class="chat-header__meta-pill" :class="{ 'chat-header__meta-pill--active': isStreaming }">
                  {{ isStreaming ? (isPaused ? t('paused') : t('streaming')) : t('ready') }}
                </span>
                <span class="chat-header__meta-pill">{{ selectedTheme || t('autoTheme') }}</span>
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
              <span class="nav-btn__text">{{ t('star') }}</span>
            </a>

            <a
              href="https://markstream.simonhe.me/"
              target="_blank"
              rel="noopener noreferrer"
              class="nav-btn nav-btn--docs"
            >
              <Icon icon="carbon:book" class="nav-btn__icon" />
              <span class="nav-btn__text">{{ t('docs') }}</span>
            </a>

            <button class="nav-btn nav-btn--themes" @click="goToThemeGallery">
              <Icon icon="carbon:color-palette" class="nav-btn__icon" />
              <span class="nav-btn__text">{{ t('themes') }}</span>
            </button>

            <button class="nav-btn nav-btn--virtual" @click="goToVirtualScrollLab">
              <Icon icon="carbon:list" class="nav-btn__icon" />
              <span class="nav-btn__text">{{ t('virtualScrollLab') }}</span>
            </button>

            <button class="nav-btn nav-btn--virtual" @click="goToVirtualTimelineZero">
              <Icon icon="carbon:flow" class="nav-btn__icon" />
              <span class="nav-btn__text">{{ t('virtualTimeline') }}</span>
            </button>

            <button class="nav-btn nav-btn--virtual" @click="goToVirtualScrollerMarkstream">
              <Icon icon="carbon:data-vis-1" class="nav-btn__icon" />
              <span class="nav-btn__text">{{ t('vueScroller') }}</span>
            </button>

            <button
              class="nav-btn nav-btn--retry"
              :disabled="isStreaming && !isPaused"
              @click="() => { stopStreamSimulation(); startStreamSimulation() }"
            >
              <Icon icon="carbon:restart" class="nav-btn__icon" />
              <span class="nav-btn__text">{{ t('retry') }}</span>
            </button>

            <button
              class="nav-btn nav-btn--stream"
              :disabled="!isStreaming"
              @click="toggleStreamPause"
            >
              <Icon :icon="isPaused ? 'carbon:play-filled-alt' : 'carbon:pause-filled'" class="nav-btn__icon" />
              <span class="nav-btn__text">{{ isPaused ? t('resume') : t('pause') }}</span>
            </button>

            <button class="nav-btn nav-btn--test" @click="goToTest">
              <Icon icon="carbon:rocket" class="nav-btn__icon" />
              <span class="nav-btn__text">{{ t('test') }}</span>
            </button>

            <button class="nav-btn nav-btn--cdn" @click="goToCdnPeers">
              <Icon icon="carbon:cloud" class="nav-btn__icon" />
              <span class="nav-btn__text">{{ t('cdn') }}</span>
            </button>
          </nav>
        </header>

        <section class="chat-overview">
          <div class="chat-overview__intro">
            <span class="chat-overview__eyebrow">{{ t('livePlayground') }}</span>
            <p class="chat-overview__summary">
              {{ streamPresetDescription }}
            </p>
          </div>

          <div class="chat-overview__stats">
            <div class="chat-overview__stat">
              <span class="chat-overview__stat-label">{{ t('chunk') }}</span>
              <strong class="chat-overview__stat-value">{{ streamChunkRangeLabel }}</strong>
            </div>
            <div class="chat-overview__stat">
              <span class="chat-overview__stat-label">{{ t('delay') }}</span>
              <strong class="chat-overview__stat-value">{{ streamDelayRangeLabel }}</strong>
            </div>
            <div class="chat-overview__stat">
              <span class="chat-overview__stat-label">{{ t('transport') }}</span>
              <strong class="chat-overview__stat-value">{{ streamTransportMode === 'readable-stream' ? t('reader') : t('scheduler') }}</strong>
            </div>
            <div class="chat-overview__stat">
              <span class="chat-overview__stat-label">{{ t('burst') }}</span>
              <strong class="chat-overview__stat-value">{{ normalizedBurstiness }}%</strong>
            </div>
          </div>
        </section>

        <!-- Messages area -->
        <main ref="messagesContainer" class="chat-messages chatbot-messages">
          <MarkdownRender
            v-if="benchmarkRenderChat"
            :content="content"
            :smooth-streaming="smoothStreaming"
            :fade="!smoothStreaming"
            :code-block-dark-theme="selectedTheme || undefined"
            :code-block-light-theme="selectedTheme || undefined"
            :code-block-monaco-options="playgroundMonacoOptions"
            :html-policy="htmlPolicy"
            :themes="themes"
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
  --play-accent: #0f766e;
  --play-accent-2: #0ea5e9;
  --play-warm: #f97316;
  --play-ink: #0f172a;
  --play-paper: rgba(255, 255, 255, 0.82);
  --play-border: hsl(var(--ms-border) / 0.52);
  font-family: 'Avenir Next', 'SF Pro Display', 'Segoe UI', sans-serif;
  position: relative;
  min-height: 100vh;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 8% 8%, rgba(15, 118, 110, 0.12), transparent 46%),
    radial-gradient(circle at 86% 88%, rgba(14, 165, 233, 0.14), transparent 48%),
    linear-gradient(140deg, hsl(var(--ms-background)), hsl(var(--ms-muted) / 0.45));
  color: hsl(var(--ms-foreground));
  transition: background-color 0.3s ease;
}

.playground-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.playground-bg__orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.15;
}

.playground-bg__orb--1 {
  top: -10%;
  left: -5%;
  width: 600px;
  height: 600px;
  background: linear-gradient(135deg, #0f766e, #14b8a6);
}

.playground-bg__orb--2 {
  bottom: -15%;
  right: -8%;
  width: 500px;
  height: 500px;
  background: linear-gradient(135deg, #0ea5e9, #22d3ee);
}

.playground-bg__orb--3 {
  top: 40%;
  left: 50%;
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #f59e0b, #f97316);
  opacity: 0.08;
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
  backdrop-filter: blur(12px) saturate(1.6);
  box-shadow: 0 4px 24px hsl(var(--ms-foreground) / 0.06);
  cursor: pointer;
  transition: all 0.2s ease;
}

.settings-fab:hover {
  border-color: hsl(var(--ms-border));
  box-shadow: 0 8px 32px hsl(var(--ms-foreground) / 0.1);
  transform: translateY(-1px);
}

.settings-fab--active {
  background: rgba(15, 118, 110, 0.12);
  border-color: rgba(15, 118, 110, 0.3);
}

.settings-fab__icon {
  width: 20px;
  height: 20px;
  color: hsl(var(--ms-muted-foreground));
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.settings-fab__icon--open {
  transform: rotate(60deg);
}

/* ─── Settings Sidebar ─── */
.settings-sidebar {
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 280px;
  padding: 20px;
  background: hsl(var(--ms-background) / 0.92);
  backdrop-filter: blur(20px) saturate(1.6);
  border: 1px solid hsl(var(--ms-border) / 0.4);
  overflow-y: auto;
  scrollbar-width: thin;
}

.settings-sidebar--docked {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  backdrop-filter: none;
  border-radius: 0;
  border-right: 0;
  border-top: 0;
  border-bottom: 0;
  box-shadow: -8px 0 40px hsl(var(--ms-foreground) / 0.05);
}

.settings-sidebar--floating {
  position: fixed;
  top: 68px;
  right: 16px;
  max-height: calc(100vh - 84px);
  border-radius: 20px;
  box-shadow: 0 24px 64px hsl(var(--ms-foreground) / 0.12);
}

.settings-enter-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.settings-enter-from { opacity: 0; transform: translateX(16px) scale(0.96); }
.settings-enter-to { opacity: 1; transform: translateX(0) scale(1); }
.settings-leave-active { transition: all 0.2s ease; }
.settings-leave-from { opacity: 1; transform: translateX(0) scale(1); }
.settings-leave-to { opacity: 0; transform: translateX(16px) scale(0.96); }

.settings-sidebar__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid hsl(var(--ms-border) / 0.4);
}

.settings-sidebar__header-icon {
  width: 16px;
  height: 16px;
  color: hsl(var(--ms-muted-foreground));
}

.settings-sidebar__title {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: hsl(var(--ms-muted-foreground));
}

.settings-divider {
  height: 1px;
  background: hsl(var(--ms-border) / 0.4);
}

/* ─── Setting Controls ─── */
.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--ms-muted-foreground));
}

.setting-select-wrap {
  position: relative;
}

.setting-select {
  width: 100%;
  appearance: none;
  padding: 8px 32px 8px 12px;
  font-size: 0.82rem;
  font-weight: 500;
  color: hsl(var(--ms-foreground));
  background: hsl(var(--ms-muted) / 0.5);
  border: 1px solid hsl(var(--ms-border) / 0.5);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.setting-select:hover {
  background: hsl(var(--ms-muted) / 0.7);
  border-color: hsl(var(--ms-border));
}

.setting-select:focus {
  outline: none;
  border-color: hsl(var(--ms-ring) / 0.5);
  box-shadow: 0 0 0 3px hsl(var(--ms-ring) / 0.12);
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
  line-height: 1.5;
  color: hsl(var(--ms-muted-foreground) / 0.7);
}

.setting-slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-slider-label {
  width: 28px;
  flex-shrink: 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: hsl(var(--ms-muted-foreground));
}

.setting-slider {
  flex: 1;
  cursor: pointer;
  accent-color: hsl(var(--ms-accent, 220 70% 55%));
}

.setting-slider-value {
  width: 48px;
  flex-shrink: 0;
  text-align: right;
  font-size: 0.72rem;
  font-weight: 600;
  color: hsl(var(--ms-muted-foreground));
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
  border: 0;
  background: hsl(var(--ms-muted));
  cursor: pointer;
  transition: background 0.35s ease;
}

.theme-toggle--dark {
  background: #3b82f6;
}

.theme-toggle__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: left 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.theme-toggle--dark .theme-toggle__thumb {
  left: 25px;
}

.theme-toggle__icon { width: 12px; height: 12px; }
.theme-toggle__icon--moon { color: #3b82f6; }
.theme-toggle__icon--sun { color: #f59e0b; }

/* ─── Chat Wrapper ─── */
.chat-wrapper {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  box-sizing: border-box;
  height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 20px;
  overscroll-behavior: contain;
  transition: padding-right 0.3s ease;
}

.chat-wrapper--with-sidebar {
  padding-right: 300px;
}

/* ─── Chat Container ─── */
.chat-container {
  flex: 0 0 auto;
  width: 100%;
  max-width: 960px;
  min-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  border: 1px solid var(--play-border);
  background:
    linear-gradient(180deg, hsl(var(--ms-background) / 0.88), hsl(var(--ms-background) / 0.78));
  backdrop-filter: blur(16px) saturate(1.4);
  box-shadow:
    0 0 0 1px hsl(var(--ms-border) / 0.1),
    0 28px 84px hsl(var(--ms-foreground) / 0.1),
    0 8px 24px hsl(var(--ms-foreground) / 0.04);
}

.chat-container::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
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
  padding: 14px 20px;
  border-bottom: 1px solid hsl(var(--ms-border) / 0.4);
  background: linear-gradient(180deg, hsl(var(--ms-muted) / 0.46), hsl(var(--ms-muted) / 0.24));
  flex-wrap: wrap;
}

.chat-header__brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-header__logo {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: linear-gradient(140deg, var(--play-accent), var(--play-accent-2), var(--play-warm));
  box-shadow: 0 8px 22px rgba(15, 118, 110, 0.35);
}

.chat-header__logo-icon {
  width: 30px;
  height: 30px;
  display: block;
}

.chat-header__info {
  display: flex;
  flex-direction: column;
}

.chat-header__meta {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chat-header__meta-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: hsl(var(--ms-muted-foreground));
  background: hsl(var(--ms-muted) / 0.56);
  border: 1px solid hsl(var(--ms-border) / 0.45);
}

.chat-header__meta-pill--active {
  color: #0f766e;
  border-color: rgba(15, 118, 110, 0.28);
  background: rgba(15, 118, 110, 0.14);
}

.chat-header__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: hsl(var(--ms-foreground));
  letter-spacing: -0.01em;
}

.chat-header__subtitle {
  margin: 0;
  font-size: 0.75rem;
  color: hsl(var(--ms-muted-foreground));
}

/* ─── Nav Buttons ─── */
.chat-header__nav {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

/* ─── Chat Overview ─── */
.chat-overview {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 14px;
  padding: 16px 20px;
  border-bottom: 1px solid hsl(var(--ms-border) / 0.34);
  background:
    linear-gradient(180deg, hsl(var(--ms-background) / 0.46), hsl(var(--ms-background) / 0.18));
}

.chat-overview__intro {
  display: grid;
  gap: 8px;
  align-content: start;
}

.chat-overview__eyebrow {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(15, 118, 110, 0.12);
  border: 1px solid rgba(15, 118, 110, 0.18);
  color: #0f766e;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.12em;
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
  gap: 4px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid hsl(var(--ms-border) / 0.42);
  background: hsl(var(--ms-muted) / 0.32);
}

.chat-overview__stat-label {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: hsl(var(--ms-muted-foreground));
}

.chat-overview__stat-value {
  font-size: 0.85rem;
  font-weight: 700;
  color: hsl(var(--ms-foreground));
  font-variant-numeric: tabular-nums;
}

.nav-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  font-size: 0.78rem;
  font-weight: 600;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  color: #f8fafc;
  text-decoration: none;
  white-space: nowrap;
  transition: all 0.18s ease;
}

.nav-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.1);
}

.nav-btn:active {
  transform: scale(0.96);
}

.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
  filter: none;
}

.nav-btn__icon { width: 15px; height: 15px; }
.nav-btn__text { line-height: 1; }

.nav-btn--github { background: #24292f; }
.nav-btn--docs { background: #0f766e; }
.nav-btn--themes { background: #0e7490; }
.nav-btn--virtual { background: #4338ca; }
.nav-btn--retry { background: #0f766e; }
.nav-btn--stream { background: #c2410c; }
.nav-btn--test { background: #0369a1; }
.nav-btn--cdn { background: #475569; }

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
  padding: 28px 32px;
  font-family: 'Avenir Next', 'SF Pro Text', sans-serif;
}

/* ─── Code block rendering glow ─── */
:deep(.code-block-container.is-rendering) {
  position: relative;
  animation: renderingGlow 2s ease-in-out infinite;
}

@keyframes renderingGlow {
  0% { box-shadow: 0 0 10px rgba(99, 102, 241, 0.4), 0 0 20px rgba(99, 102, 241, 0.2); }
  25% { box-shadow: 0 0 15px rgba(139, 92, 246, 0.5), 0 0 30px rgba(139, 92, 246, 0.3); }
  50% { box-shadow: 0 0 20px rgba(236, 72, 153, 0.5), 0 0 40px rgba(236, 72, 153, 0.3); }
  75% { box-shadow: 0 0 15px rgba(16, 185, 129, 0.5), 0 0 30px rgba(16, 185, 129, 0.3); }
  100% { box-shadow: 0 0 10px rgba(99, 102, 241, 0.4), 0 0 20px rgba(99, 102, 241, 0.2); }
}

:deep(.is-rendering) {
  position: relative;
  animation: renderingGlow 2s ease-in-out infinite;
}

/* ─── Responsive ─── */
@media (max-width: 768px) {
  .chat-wrapper { padding: 10px; }
  .chat-wrapper--with-sidebar { padding-right: 10px; }
  .chat-container { border-radius: 18px; min-height: calc(100vh - 20px); }
  .chat-header__nav { gap: 4px; }
  .chat-overview { grid-template-columns: 1fr; padding: 14px 16px; }
  .chat-overview__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .nav-btn { padding: 5px 8px; font-size: 0.72rem; border-radius: 8px; }
  .nav-btn__text { display: none; }
  .nav-btn__icon { width: 16px; height: 16px; }
  .chat-messages__content { padding: 20px 16px; }
}
</style>
