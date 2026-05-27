import { mount } from 'svelte'
import App from './App.svelte'
import 'katex/dist/katex.min.css'
import 'monaco-editor/min/vs/editor/editor.main.css'
import 'markstream-svelte/index.css'
import './styles.css'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
