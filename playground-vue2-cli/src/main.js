import {
  CodeBlockNode,
  createKaTeXWorkerFromCDN,
  createMermaidWorkerFromCDN,
  setCustomComponents,
  setKaTeXWorker,
  setMermaidWorker,
  VueRendererMarkdown,
} from 'markstream-vue2'
import Vue from 'vue'
import App from './App.vue'
import './vue2-composition-api-shim'
import 'markstream-vue2/dist/index.css'
import 'katex/dist/katex.min.css'

Vue.config.productionTip = false

// In Vue CLI (Webpack 4), the heavy Monaco/Shiki renderers are not bundled in
// markstream-vue2 2.0. Use the CodeBlockNode component instead.
setCustomComponents({ code_block: CodeBlockNode })

Vue.use(VueRendererMarkdown)

async function bootstrap() {
  if (typeof window !== 'undefined') {
    // Webpack 4 cannot handle Vite-style `?worker` imports. Use CDN workers instead.
    const { worker: katexWorker } = createKaTeXWorkerFromCDN({
      mode: 'classic',
      katexUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/katex.min.js',
      mhchemUrl: 'https://cdn.jsdelivr.net/npm/katex@0.16.25/dist/contrib/mhchem.min.js',
    })
    if (katexWorker)
      setKaTeXWorker(katexWorker)

    const { worker: mermaidWorker } = createMermaidWorkerFromCDN({
      mode: 'classic',
      mermaidUrl: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
    })
    if (mermaidWorker)
      setMermaidWorker(mermaidWorker)
  }

  new Vue({
    render: h => h(App),
  }).$mount('#app')
}

bootstrap()
