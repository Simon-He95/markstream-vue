import { setKaTeXWorker, setMermaidWorker, VueRendererMarkdown } from 'markstream-vue2'
import KatexWorker from 'markstream-vue2/workers/katexRenderer.worker?worker&inline'
import MermaidWorker from 'markstream-vue2/workers/mermaidParser.worker?worker&inline'
import Vue from 'vue'
import App from './App.vue'
import 'markstream-vue2/index.css'
import 'katex/dist/katex.min.css'
import '@unocss/reset/tailwind.css'
import './styles/main.css'
import './app.css'

Vue.use(VueRendererMarkdown)

if (typeof window !== 'undefined') {
  setKaTeXWorker(new KatexWorker())
  setMermaidWorker(new MermaidWorker())
}

new Vue({
  render: h => h(App),
}).$mount('#app')
