import { mount } from 'svelte'
import 'katex/dist/katex.min.css'
import 'markstream-svelte/index.css'
import './styles.css'

// `/codeblock-editing-demo` is a permanent playground route:
// http://localhost:4176/codeblock-editing-demo (run with `pnpm play:svelte`).
const isEditingDemo = location.pathname === '/codeblock-editing-demo'

async function bootstrap() {
  const component = isEditingDemo
    ? (await import('./CodeBlockEditingDemo.svelte')).default
    : (await import('./App.svelte')).default
  return mount(component, {
    target: document.getElementById('app')!,
  })
}

export default bootstrap()
