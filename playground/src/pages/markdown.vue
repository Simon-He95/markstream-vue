<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { getUseMonaco } from '../../../src/components/CodeBlockNode/monaco'
import MarkdownCodeBlockNode from '../../../src/components/MarkdownCodeBlockNode'
import MarkdownRender from '../../../src/components/NodeRenderer'
import { setCustomComponents } from '../../../src/utils/nodeComponents'
import KatexWorker from '../../../src/workers/katexRenderer.worker?worker&inline'
import { setKaTeXWorker } from '../../../src/workers/katexWorkerClient'
import MermaidWorker from '../../../src/workers/mermaidParser.worker?worker&inline'
import { setMermaidWorker } from '../../../src/workers/mermaidWorkerClient'
import ThinkingNode from '../components/ThinkingNode.vue'
import { streamContent } from '../const/markdown'
import 'katex/dist/katex.min.css'

// 每隔 10 毫秒输出一部分内容
const content = ref<string>('')
const streamDelay = useLocalStorage<number>('vmr-settings-stream-delay', 16)
const streamChunkSize = useLocalStorage<number>('vmr-settings-stream-chunk-size', 1)
const normalizedChunkSize = computed(() => Math.max(1, Math.floor(streamChunkSize.value) || 1))

// 预加载 Monaco 编辑器
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

// Keep persisted values within reasonable bounds on hydration.
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

// To avoid flashing sequences like ":::" during streaming (which later
// become an AdmonitionNode), we look ahead when encountering ":" and
// defer appending consecutive colons until a non-colon character is seen.
useInterval(streamDelay, {
  callback() {
    const cur = content.value.length
    if (cur >= streamContent.length)
      return
    const chunkSize = normalizedChunkSize.value
    const nextChunk = streamContent.slice(cur, cur + chunkSize)
    // Append chunk-sized slices so users can preview larger batches while streaming.
    content.value += nextChunk
  },
})

setCustomComponents('playground-demo', { thinking: ThinkingNode, code_block: MarkdownCodeBlockNode })
const parseOptions = {
  preTransformTokens: (tokens: any[]) => {
    // Example: Log tokens during parsing
    // console.log('Pre-transform tokens:', tokens)
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
            const content = t.content.replace(/<thinking[^>]*>/, '').replace(/<\/*t*h*i*n*k*i*n*g*>*\n*$/, '')
            return {
              type: 'thinking',
              loading: t.loading,
              attrs,
              content,
            }
          }
          return t
        })
      }
      return token
    })
  },
}

// 主题切换
const isDark = useDark()
const toggleTheme = useToggle(isDark)
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

// Use reversed column layout and let the browser handle native scrolling.
// Removed custom JS scroll management (observers, programmatic scroll, and
// pointer/wheel/touch heuristics) to rely on CSS `flex-direction: column-reverse`.
const messagesContainer = ref<HTMLElement | null>(null)

// 性能友好的监听：使用 ResizeObserver 监听容器和渲染内容变化，
// 当内容高度超过容器可见高度时，为 `.markdown-renderer` 添加 `disable-min-height` 类以移除 min-height。
let __roContainer: ResizeObserver | null = null
let __roContent: ResizeObserver | null = null
let __mo: MutationObserver | null = null
let __scheduled = false
// Observers and scheduler

function scheduleCheckMinHeight() {
  if (__scheduled)
    return
  __scheduled = true
  requestAnimationFrame(() => {
    __scheduled = false
    const container = messagesContainer.value
    if (!container)
      return
    const contentEl = container.querySelector('.markdown-renderer') as HTMLElement | null
    if (!contentEl)
      return
    const shouldRemove = contentEl.scrollHeight > container.clientHeight
    if (shouldRemove) {
      contentEl.classList.add('disable-min-height')
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
      contentEl.classList.remove('disable-min-height')
    }
  })
}

onMounted(() => {
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
    const el = container.querySelector('.markdown-renderer') as HTMLElement | null
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
})

onBeforeUnmount(() => {
  __roContainer?.disconnect()
  __roContent?.disconnect()
  __mo?.disconnect()
})
</script>

<template>
  <div class="flex items-center justify-center p-4 app-container h-full bg-gray-50 dark:bg-gray-900">
    <!-- 设置按钮和面板 -->
    <div class="fixed top-4 right-4 z-10">
      <!-- 设置按钮 -->
      <button
        class="
          settings-toggle w-10 h-10 rounded-full
          bg-white/95 dark:bg-gray-800/95
          backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50
          hover:bg-gray-50 dark:hover:bg-gray-700/50
          shadow-lg dark:shadow-gray-900/20
          transition-all duration-200 flex items-center justify-center
          focus:outline-none focus:ring-2 focus:ring-blue-500/50
        "
        :class="{ 'ring-2 ring-blue-500/50': showSettings }"
        @click="showSettings = !showSettings"
      >
        <Icon
          icon="carbon:settings"
          class="w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform duration-200"
          :class="{ 'rotate-90': showSettings }"
        />
      </button>

      <!-- 设置面板 -->
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
          class="
            absolute top-12 right-0 mt-2
            bg-white/95 dark:bg-gray-800/95
            backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50
            rounded-xl shadow-xl dark:shadow-gray-900/30
            p-4 space-y-4 min-w-[220px]
            origin-top-right
          "
          @click.stop
        >
          <!-- 主题选择器 -->
          <div class="space-y-2">
            <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Code Theme
            </label>
            <div class="relative">
              <select
                v-model="selectedTheme"
                class="
                  w-full appearance-none px-3 py-2 pr-8
                  bg-gray-50 dark:bg-gray-700/50
                  border border-gray-200 dark:border-gray-600
                  rounded-lg text-sm font-medium
                  text-gray-900 dark:text-gray-100
                  hover:bg-gray-100 dark:hover:bg-gray-700
                  focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
                  transition-all duration-200 cursor-pointer
                "
                aria-label="Code block theme"
                @click.stop
                @change.stop
              >
                <option v-for="t in themes" :key="t" :value="t">
                  {{ formatThemeName(t) }}
                </option>
              </select>
              <div class="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <Icon
                  icon="carbon:chevron-down"
                  class="w-4 h-4 text-gray-400 dark:text-gray-500"
                />
              </div>
            </div>
          </div>

          <!-- 流式速度控制 -->
          <div class="space-y-2">
            <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Stream Delay
            </label>
            <div class="flex items-center gap-3">
              <input
                v-model.number="streamDelay"
                type="range"
                min="4"
                max="200"
                step="4"
                class="flex-1 cursor-pointer"
              >
              <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-12 text-right">
                {{ streamDelay }}ms
              </span>
            </div>
          </div>

          <!-- 流式字符数量控制 -->
          <div class="space-y-2">
            <label class="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Chunk Size
            </label>
            <div class="flex items-center gap-3">
              <input
                v-model.number="streamChunkSize"
                type="range"
                min="1"
                max="16"
                step="1"
                class="flex-1 cursor-pointer"
              >
              <span class="text-xs font-medium text-gray-600 dark:text-gray-400 w-12 text-right">
                {{ normalizedChunkSize }}
              </span>
            </div>
          </div>

          <!-- 分割线 -->
          <div class="border-t border-gray-200 dark:border-gray-700" />

          <!-- 主题切换 -->
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Dark Mode
            </label>
            <button
              class="
                relative w-12 h-6 rounded-full
                focus:outline-none focus:ring-2 focus:ring-blue-500/50
                hover:shadow-lg active:scale-95
                transition-all duration-200 ease-out
              "
              :style="{
                backgroundColor: isDark ? '#3b82f6' : '#e5e7eb',
                transition: 'background-color 0.35s ease-out, box-shadow 0.2s ease, transform 0.1s ease',
              }"
              @click.stop="toggleTheme()"
            >
              <!-- 滑动圆点 -->
              <div
                class="
                  absolute top-0.5 w-5 h-5 bg-white rounded-full
                  flex items-center justify-center
                  shadow-md hover:shadow-lg
                "
                :style="{
                  left: isDark ? '26px' : '2px',
                  transform: `scale(${isDark ? 1.02 : 1})`,
                  transition: 'left 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 0.2s ease-out, box-shadow 0.2s ease',
                }"
              >
                <!-- 图标根据状态显示 -->
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

    <!-- Chatbot-style container -->
    <div class="chatbot-container max-w-5xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl dark:shadow-gray-900/50 flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700">
      <!-- Header -->
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
            <!-- GitHub Star Button -->
            <a
              href="https://github.com/Simon-He95/markstream-vue"
              target="_blank"
              rel="noopener noreferrer"
              class="
              github-star-btn flex items-center gap-2 px-3 py-1.5
              bg-gray-800 dark:bg-gray-700 hover:bg-gray-700 dark:hover:bg-gray-600
              text-white text-sm font-medium rounded-lg
              transition-all duration-200
              shadow-md hover:shadow-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500/50
            "
            >
              <Icon icon="carbon:star" class="w-4 h-4" />
              <span>Star</span>
            </a>

            <!-- Test Page Button -->
            <button
              class="ml-2 test-page-btn flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              title="Go to Test page"
              @click="goToTest"
            >
              <Icon icon="carbon:rocket" class="w-4 h-4" />
              <span>Test</span>
            </button>

            <!-- CDN peers demo -->
            <button
              class="ml-2 flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              title="Go to CDN peers demo"
              @click="goToCdnPeers"
            >
              <Icon icon="carbon:cloud" class="w-4 h-4" />
              <span>CDN</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Messages area with scroll (use column-reverse on the scroll container) -->
      <main ref="messagesContainer" class="chatbot-messages flex-1 overflow-y-auto mr-[1px] mb-4 flex flex-col-reverse">
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
}

/* 当真实内容高度超出容器时，移除默认 min-height（由 JS 切换类名） */
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

/* 主题选择器自定义样式 */
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

/* 设置面板动画 */
.settings-panel {
  transform-origin: top right;
}

/* 代码块加载时的流光闪烁效果 */
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

/* Mermaid 块加载时的流光闪烁效果 */
:deep(.is-rendering) {
  position: relative;
  animation: renderingGlow 2s ease-in-out infinite;
}
</style>
