import { afterEach, describe, expect, it, vi } from 'vitest'
import Vue from 'vue'
import NodeRenderer from '../src/components/MarkdownRenderCompat.vue'

const apps: Vue[] = []
afterEach(() => {
  apps.splice(0).forEach(app => app.$destroy())
  document.body.innerHTML = ''
  vi.useRealTimers()
})
async function mount() {
  const app = new Vue({
    data: () => ({ content: 'Hello', final: false, smooth: false }),
    render(h) {
      return h(NodeRenderer, { props: { content: this.content, final: this.final, smoothStreaming: this.smooth, batchRendering: false, deferNodesUntilVisible: false, viewportPriority: false } })
    },
  }).$mount()
  apps.push(app)
  document.body.appendChild(app.$el)
  await Vue.nextTick()
  return app
}
describe('vue2 streaming final', () => {
  it('retains individual word spans and cancels fade immediately on final', async () => {
    const app = await mount()
    app.content = 'Hello one tw'
    await Vue.nextTick()
    const words = [...app.$el.querySelectorAll('.text-node-stream-delta')]
    expect(words.map(el => el.textContent)).toEqual(['one ', 'tw'])
    app.content = 'Hello one two three'
    await Vue.nextTick()
    expect(app.$el.querySelectorAll('.text-node-stream-delta')[1]).toBe(words[1])
    app.final = true
    await Vue.nextTick()
    expect(app.$el.querySelector('.text-node-stream-delta')).toBeNull()
    expect(app.$el.textContent).toContain('Hello one two three')
  })
  it('flushes a small final tail and drains large tails across frames', async () => {
    vi.useFakeTimers()
    const app = await mount()
    app.smooth = true
    await Vue.nextTick()
    app.content = `Hello${'字'.repeat(900)}`
    app.final = true
    await Vue.nextTick()
    expect(app.$el.textContent).toContain(app.content)
    app.content = 'Another'
    app.final = false
    await Vue.nextTick()
    app.content += '字'.repeat(6000)
    app.final = true
    await Vue.nextTick()
    expect(app.$el.textContent).not.toContain(app.content)
    await vi.runAllTimersAsync()
    await Vue.nextTick()
    expect(app.$el.textContent).toContain(app.content)
  })
})
