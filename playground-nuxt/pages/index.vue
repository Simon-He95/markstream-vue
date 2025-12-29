<script setup lang="ts">
import { useRouter } from '#imports'
import { Icon } from '@iconify/vue'
import { useDark, useInterval, useLocalStorage, useToggle } from '@vueuse/core'
import MarkdownRender, { getUseMonaco, setCustomComponents, setKaTeXWorker, setMermaidWorker } from 'markstream-vue'
import KatexWorker from 'markstream-vue/workers/katexRenderer.worker?worker&inline'
import MermaidWorker from 'markstream-vue/workers/mermaidParser.worker?worker&inline'
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { streamContent } from '../../playground/src/const/markdown'
import ThinkingNode from '../components/ThinkingNode.vue'

const content = ref<string>('')
const streamDelay = useLocalStorage<number>('vmr-settings-stream-delay', 16)
const streamChunkSize = useLocalStorage<number>('vmr-settings-stream-chunk-size', 1)
const normalizedChunkSize = computed(() => Math.max(1, Math.floor(streamChunkSize.value) || 1))

if (process.client) {
  getUseMonaco()
  setKaTeXWorker(new KatexWorker())
  setMermaidWorker(new MermaidWorker())
}
const router = useRouter()

function goToTest() {
  router.push('/test').catch(() => {
    window.location.href = '/test'
  })
}

watchEffect(() => {
  const parsedDelay = Number(streamDelay.value)
  const fallbackDelay = Number.isFinite(parsedDelay) ? parsedDelay : 16
  const boundedDelay = Math.min(200, Math.max(4, fallbackDelay))
  if (streamDelay.value !== boundedDelay)
    streamDelay.value = boundedDelay
})

watchEffect(() => {
  const parsedChunk = Number(streamChunkSize.value)
  const fallbackChunk = Number.isFinite(parsedChunk) ? parsedChunk : 1
  const normalizedChunk = Math.floor(fallbackChunk) || 1
  const boundedChunk = Math.min(16, Math.max(1, normalizedChunk))
  if (streamChunkSize.value !== boundedChunk)
    streamChunkSize.value = boundedChunk
})

useInterval(streamDelay, {
  callback() {
    const cur = content.value.length
    if (cur >= streamContent.length)
      return
    const chunkSize = normalizedChunkSize.value
    const nextChunk = streamContent.slice(cur, cur + chunkSize)
    content.value += nextChunk
  },
})

setCustomComponents('playground-demo', { thinking: ThinkingNode })
const parseOptions = {
  preTransformTokens: (tokens: any[]) => {
    return tokens.map((token) => {
      if (token.type === 'inline' && token.content.includes('<thinking')) {
        token.children = token.children.map((t: any) => {
          if (t.type === 'html_block' && t.tag === 'thinking') {
            const m = t.content.match(/<thinking([^>]*)>/)
            const attrs = []
            if (m) {
              const attrString = m[1]
              const attrRegex = /([^\s=]+)(?:="([^"]*)")?/g
              let match
              while ((match = attrRegex.exec(attrString)) !== null) {
                const attrName = match[1]
                const attrValue = match[2] || true
                attrs.push({ name: attrName, value: attrValue })
              }
            }
            // eslint-disable-next-line regexp/no-super-linear-backtracking
            const thinkingContent = t.content.replace(/<thinking[^>]*>/, '').replace(/<\/*t*h*i*n*k*i*n*g*>*\n*$/, '')
            return {
              type: 'thinking',
              loading: t.loading,
              attrs,
              content: thinkingContent,
            }
          }
          return t
        })
      }
      return token
    })
  },
}

const isDark = useDark()
const toggleTheme = useToggle(isDark)
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

function formatThemeName(themeName: string) {
  return themeName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const showSettings = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)

let __roContainer: ResizeObserver | null = null
let __roContent: ResizeObserver | null = null
let __mo: MutationObserver | null = null
let __scheduled = false
let __minHeightDisabled = false
let __overflowConfirmations = 0
let __clearConfirmations = 0

function scheduleCheckMinHeight() {
  if (__scheduled)
    return
  __scheduled = true
  requestAnimationFrame(() => {
    __scheduled = false
    const container = messagesContainer.value
    if (!container)
      return
    const contentEl = Array.from(container.children).find(child =>
      (child as HTMLElement).classList?.contains('markdown-renderer'),
    ) as HTMLElement | undefined
    if (!contentEl)
      return

    const REQUIRED_OVERFLOW_CONFIRMATIONS = 2
    const REQUIRED_CLEAR_CONFIRMATIONS = 3

    const hadClass = contentEl.classList.contains('disable-min-height')

    if (__minHeightDisabled || hadClass) {
      contentEl.classList.add('disable-min-height')
      const containerDelta = container.scrollHeight - container.clientHeight
      const shouldRemove = containerDelta > 1
      if (shouldRemove) {
        __clearConfirmations = 0
        __minHeightDisabled = true
      }
      else {
        __clearConfirmations++
        if (__clearConfirmations >= REQUIRED_CLEAR_CONFIRMATIONS) {
          __minHeightDisabled = false
          __overflowConfirmations = 0
          contentEl.classList.remove('disable-min-height')
        }
      }
      return
    }

    // Not latched: probe by temporarily unsetting min-height (same rAF tick).
    contentEl.classList.add('disable-min-height')
    const containerDelta = container.scrollHeight - container.clientHeight
    const probeOverflow = containerDelta > 1
    if (probeOverflow)
      __overflowConfirmations++
    else
      __overflowConfirmations = 0

    const shouldRemove = __overflowConfirmations >= REQUIRED_OVERFLOW_CONFIRMATIONS
    if (shouldRemove) {
      __minHeightDisabled = true
      __clearConfirmations = 0
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
      contentEl.classList.remove('disable-min-height')
    }
  })
}

onMounted(() => {
  const container = messagesContainer.value
  if (!container)
    return
  requestAnimationFrame(scheduleCheckMinHeight)

  __roContainer = new ResizeObserver(scheduleCheckMinHeight)
  __roContainer.observe(container)

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

  __mo = new MutationObserver(() => {
    tryObserveContent()
    scheduleCheckMinHeight()
  })
  __mo.observe(container, { childList: true, subtree: true })
})

onBeforeUnmount(() => {
  __roContainer?.disconnect()
  __roContent?.disconnect()
  __mo?.disconnect()
})
</script>

<template>
  <div class="flex items-center justify-center p-4 app-container h-full bg-gray-50 dark:bg-gray-900">
    <div class="fixed top-4 right-4 z-10">
      <button
        class="settings-toggle w-10 h-10 rounded-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 shadow-lg dark:shadow-gray-900/20 transition-all duration-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500/50"
        :class="{ 'ring-2 ring-blue-500/50': showSettings }"
        @click="showSettings = !showSettings"
      >
        <Icon
          icon="carbon:settings"
          class="w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform duration-200"
          :class="{ 'rotate-90': showSettings }"
        />
      </button>

      <Transition
        enter-active-class="transition ease-out duration-300"
        enter-from-class="opacity-0 scale-95 translate-y-2"
        enter-to-class="opacity-100 scale-100 translate-y-0"
        leave-active-class="transition ease-in duration-200"
        leave-from-class="opacity-100 scale-100 translate-y-0"
        leave-to-class="opacity-0 scale-95 translate-y-2"
      >
        <div
          v-if="showSettings"
          class="absolute top-12 right-0 mt-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 rounded-xl shadow-xl dark:shadow-gray-900/30 p-4 space-y-4 min-w-[220px] origin-top-right"
          @click.stop
        >
          <div class="space-y-2">
            <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Code Theme
            </label>
            <div class="relative theme-selector">
              <select
                v-model="selectedTheme"
                class="w-full appearance-none px-3 py-2 pr-8 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200 cursor-pointer"
                aria-label="Code block theme"
                @click.stop
                @change.stop
              >
                <option v-for="t in themes" :key="t" :value="t">
                  {{ formatThemeName(t) }}
                </option>
              </select>
              <div class="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <Icon icon="carbon:chevron-down" class="w-4 h-4 text-gray-400 dark:text-gray-500" />
              </div>
            </div>
          </div>

          <div class="space-y-2">
            <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Stream Delay
            </label>
            <div class="flex items-center gap-3">
              <input v-model.number="streamDelay" type="range" min="4" max="200" step="4" class="flex-1 cursor-pointer">
              <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-12 text-right">
                {{ streamDelay }}ms
              </span>
            </div>
          </div>

          <div class="space-y-2">
            <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Chunk Size
            </label>
            <div class="flex items-center gap-3">
              <input v-model.number="streamChunkSize" type="range" min="1" max="16" step="1" class="flex-1 cursor-pointer">
              <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-12 text-right">
                {{ normalizedChunkSize }}
              </span>
            </div>
          </div>

          <div class="border-t border-gray-200 dark:border-gray-700" />

          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Dark Mode
            </label>
            <button
              class="relative w-12 h-6 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:shadow-lg active:scale-95 transition-all duration-200 ease-out"
              :style="{
                backgroundColor: isDark ? '#3b82f6' : '#e5e7eb',
                transition: 'background-color 0.35s ease-out, box-shadow 0.2s ease, transform 0.1s ease',
              }"
              @click.stop="toggleTheme()"
            >
              <div
                class="absolute top-0.5 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-md hover:shadow-lg"
                :style="{
                  left: isDark ? '26px' : '2px',
                  transform: `scale(${isDark ? 1.02 : 1})`,
                  transition: 'left 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.2s ease-out, box-shadow 0.2s ease',
                }"
              >
                <Transition
                  enter-active-class="transition-all duration-300 ease-out"
                  leave-active-class="transition-all duration-200 ease-in"
                  enter-from-class="opacity-0 scale-0 rotate-90"
                  enter-to-class="opacity-100 scale-100 rotate-0"
                  leave-from-class="opacity-100 scale-100 rotate-0"
                  leave-to-class="opacity-0 scale-0 rotate-90"
                  mode="out-in"
                >
                  <Icon
                    v-if="isDark"
                    key="moon"
                    icon="carbon:moon"
                    class="w-3 h-3 text-blue-600 drop-shadow-sm"
                  />
                  <Icon
                    v-else
                    key="sun"
                    icon="carbon:sun"
                    class="w-3 h-3 text-yellow-500 drop-shadow-sm"
                  />
                </Transition>
              </div>
            </button>
          </div>
        </div>
      </Transition>
    </div>

    <div class="chatbot-container max-w-5xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl dark:shadow-gray-900/50 flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
      <div class="chatbot-header px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-800">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <Icon icon="carbon:chat" class="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 class="text-lg font-semibold text-gray-800 dark:text-gray-100">
                markstream-vue
              </h1>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                Streaming markdown demo
              </p>
            </div>
          </div>

          <div class="flex">
            <a
              href="https://github.com/Simon-He95/markstream-vue"
              target="_blank"
              rel="noopener noreferrer"
              class="github-star-btn flex items-center gap-2 px-3 py-1.5 bg-gray-800 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <Icon icon="carbon:star" class="w-4 h-4" />
              <span>Star</span>
            </a>

            <button
              class="ml-2 test-page-btn flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              title="Go to Test page"
              @click="goToTest"
            >
              <Icon icon="carbon:rocket" class="w-4 h-4" />
              <span>Test</span>
            </button>
          </div>
        </div>
      </div>

      <main ref="messagesContainer" class="chatbot-messages flex-1 overflow-y-auto mr-[1px] mb-4 flex flex-col-reverse">
        <ClientOnly>
          <MarkdownRender
            :content="content"
            :code-block-dark-theme="selectedTheme || undefined"
            :code-block-light-theme="selectedTheme || undefined"
            :themes="themes"
            :is-dark="isDark"
            :parse-options="parseOptions"
            custom-id="playground-demo"
            class="p-6"
          />
        </ClientOnly>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  transition: background-color 0.3s ease;
  overflow: hidden;
}

.chatbot-container {
  transition: all 0.3s ease;
  overscroll-behavior: contain;
  height: calc(var(--app-viewport-vh, 1vh) * 100 - 2rem);
  max-height: calc(var(--app-viewport-vh, 1vh) * 100 - 2rem);
}

.github-star-btn:active {
  transform: scale(0.95);
}

.chatbot-messages {
  scroll-behavior: smooth;
  overscroll-behavior: contain;
}
.chatbot-messages > .markdown-renderer {
  min-height: 100%;
  box-sizing: border-box;
}

.chatbot-messages > .markdown-renderer.disable-min-height {
  min-height: unset !important;
}

.chatbot-messages::-webkit-scrollbar {
  width: 8px;
}

.chatbot-messages::-webkit-scrollbar-track {
  background: transparent;
}

.chatbot-messages::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.dark .chatbot-messages::-webkit-scrollbar-thumb {
  background: #475569;
}

.chatbot-messages::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.dark .chatbot-messages::-webkit-scrollbar-thumb:hover {
  background: #64748b;
}

.settings-toggle {
  backdrop-filter: blur(8px);
}

.settings-toggle:active {
  transform: scale(0.95);
}

.theme-selector select:focus {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.theme-selector select option {
  padding: 8px 12px;
  background-color: white;
  color: #374151;
}

.dark .theme-selector select option {
  background-color: #1f2937;
  color: #f3f4f6;
}

.settings-panel {
  transform-origin: top right;
}

:deep(.code-block-container.is-rendering) {
  position: relative;
  animation: renderingGlow 2s ease-in-out infinite;
}

@keyframes renderingGlow {
  0% {
    box-shadow:
      0 0 10px rgba(59, 130, 246, 0.4),
      0 0 20px rgba(59, 130, 246, 0.2);
  }
  25% {
    box-shadow:
      0 0 15px rgba(139, 92, 246, 0.5),
      0 0 30px rgba(139, 92, 246, 0.3);
  }
  50% {
    box-shadow:
      0 0 20px rgba(236, 72, 153, 0.5),
      0 0 40px rgba(236, 72, 153, 0.3);
  }
  75% {
    box-shadow:
      0 0 15px rgba(16, 185, 129, 0.5),
      0 0 30px rgba(16, 185, 129, 0.3);
  }
  100% {
    box-shadow:
      0 0 10px rgba(59, 130, 246, 0.4),
      0 0 20px rgba(59, 130, 246, 0.2);
  }
}

:deep(.is-rendering) {
  position: relative;
  animation: renderingGlow 2s ease-in-out infinite;
}
</style>
