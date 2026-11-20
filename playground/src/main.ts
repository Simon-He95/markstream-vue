import { canUseWASM } from '@pierre/diffs'
import { getOrCreateWorkerPoolSingleton } from '@pierre/diffs/worker'
import DiffsWorker from '@pierre/diffs/worker/worker.js?worker'
import { getStreamDiffsWorkerPool, setInfographicLoader, setStreamDiffsWorkerPool } from 'markstream-vue'
import { createPinia } from 'pinia'
import routes from 'virtual:generated-pages'
import { createApp } from 'vue'
// import { setDefaultI18nMap } from '../../src/exports'
// import { createI18n } from 'vue-i18n'
import { createRouter, createWebHistory } from 'vue-router'
// import { setLanguageIconResolver } from '../../src/exports'
import App from './App.vue'
import { installPlaygroundSeo } from './seo'
// import JsLocalIcon from './assets/javascript.svg?raw'
import '@unocss/reset/tailwind.css'
import './styles/main.css'

// Off-thread Shiki highlighting for code blocks: the host builds the worker
// pool with its own bundler (`?worker`) and markstream-vue forwards it to every
// enhanced surface. poolSize = number of parallel highlight workers. The pool
// theme is only the initial value — CodeBlockNode re-syncs the active theme on
// every block via setRenderOptions.
// Mirror stream-diffs' `auto` backend so worker-produced tokens match what the
// main thread would produce. The registry is per-thread, but the theme and
// grammar payloads cross the boundary, so both sides must agree.
const preferredHighlighter = canUseWASM() ? 'highlights' : 'shiki-js'

setStreamDiffsWorkerPool(getOrCreateWorkerPoolSingleton({
  poolOptions: {
    poolSize: Math.min(4, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4),
    // Chat-sized fences highlight faster on the main thread than through a
    // worker round trip; anything larger still goes to the pool.
    mainThreadMaxCharacters: 4_000,
    workerFactory: () => new DiffsWorker(),
  },
  highlighterOptions: {
    // A `{ dark, light }` pair is required here: @pierre/diffs 1.6.x does not
    // re-send a theme set to workers when `setRenderOptions` is called with a
    // value equal to the pool's current theme, leaving the worker without the
    // theme it is asked to render (`Theme "pierre-dark" has not been
    // resolved`). CodeBlockNode syncs a resolved single name, so keeping the
    // init shape distinct guarantees the worker receives the resolved set.
    theme: { dark: 'vitesse-dark', light: 'vitesse-light' },
    preferredHighlighter,
  },
}))

// Dev-only diagnostic: confirm the pool initialized and is doing the
// highlighting (instead of silently falling back to the main thread).
// managerState should be 'initialized' and workersFailed should be false.
setTimeout(() => {
  const pool = getStreamDiffsWorkerPool() as any
  console.log('[playground] worker pool status:', JSON.stringify({
    working: pool?.isWorkingPool?.(),
    initialized: pool?.isInitialized?.(),
    stats: pool?.getStats?.(),
  }))
}, 2000)

const app = createApp(App)
setInfographicLoader(() => import('@antv/infographic'))
app.use(createPinia())

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})
installPlaygroundSeo(router)
app.use(router)

// Demo: override icons through the process-global helper.
// Avoid this pattern in multi-tenant SSR apps.
// const SHELL_ICON_URL = 'https://raw.githubusercontent.com/catppuccin/vscode-icons/refs/heads/main/icons/mocha/bash.svg'
// setLanguageIconResolver((lang: string) => {
//     const l = (lang || '').toLowerCase()
//     if (l === 'shellscript' || l === 'sh' || l === 'bash')
//       return `<img src="${SHELL_ICON_URL}" alt="${l}" />`
//     if (l === 'javascript' || l === 'js')
//       return JsLocalIcon
//     return undefined
// })

// Optional: if you don't use `vue-i18n`, replace built-in fallback translations
// at app startup by calling `setDefaultI18nMap`. Keep this commented in the
// playground by default — uncomment to try it out.

// setDefaultI18nMap({
//   'common.copy': '复制',
//   'common.copied': '已复制',
//   'common.decrease': '减少',
//   'common.reset': '重置',
//   'common.increase': '增加',
//   'common.expand': '展开',
//   'common.collapse': '折叠',
//   'common.preview': '预览',
//   'common.source': '源代码',
//   'common.export': '导出',
//   'common.open': '打开',
//   'common.zoomIn': '放大',
//   'common.zoomOut': '缩小',
//   'common.resetZoom': '重置缩放',
//   'image.loadError': '图片加载失败',
//   'image.loading': '正在加载图片...',
// })

app.mount('#app')
