import { setInfographicLoader } from 'markstream-vue'
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
