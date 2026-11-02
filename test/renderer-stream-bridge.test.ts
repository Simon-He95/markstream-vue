import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRendererStreamBridge } from '../packages/markstream-core/src/renderer-stream-bridge'
import { createSmoothMarkdownStream } from '../packages/markstream-core/src/smooth-stream-controller'

const active: Array<() => void> = []
afterEach(() => {
  active.splice(0).forEach(dispose => dispose())
  vi.useRealTimers()
})
function setup(flushOnFinish?: boolean) {
  vi.useFakeTimers()
  const stream = createSmoothMarkdownStream({ startDelayMs: 0 })
  let ready = false
  const commits: string[] = []
  const bridge = createRendererStreamBridge(stream, {
    flushOnFinish,
    commit: async (work) => {
      work()
      commits.push(stream.getSnapshot().visible)
    },
    onReady: (value) => { ready = value },
  })
  active.push(() => {
    bridge.dispose()
    stream.destroy()
  })
  return { stream, bridge, commits, ready: () => ready }
}
describe('renderer final drain', () => {
  it('flushes 1000 characters immediately without animation pacing', () => {
    const { stream, bridge, ready } = setup()
    bridge.update('', false, true, false)
    bridge.update('字'.repeat(1000), false, true, true)
    expect(stream.getSnapshot().visible).toHaveLength(1000)
    expect(ready()).toBe(true)
  })
  it('yields large bursts, preserves exact output, and confirms final after the last commit', async () => {
    const { stream, bridge, commits, ready } = setup()
    const content = `# Header\n\n${'中文 👩‍💻 **word**\n'.repeat(600)}`
    bridge.update('', false, true, false)
    bridge.update(content, false, true, true)
    expect(stream.getSnapshot().caughtUp).toBe(false)
    expect(ready()).toBe(false)
    await vi.runAllTimersAsync()
    expect(commits.length).toBeGreaterThan(2)
    expect(commits.every(value => content.startsWith(value))).toBe(true)
    expect(stream.getSnapshot().visible).toBe(content)
    expect(ready()).toBe(true)
  })
  it('restores completed documents immediately and cancels stale final work on replacement', async () => {
    const { stream, bridge, ready } = setup()
    bridge.update('saved'.repeat(3000), false, true, true)
    expect(stream.getSnapshot().caughtUp).toBe(true)
    bridge.update('new', false, true, false)
    bridge.update('new'.repeat(6000), false, true, true)
    bridge.update('replacement', false, true, true)
    await vi.runAllTimersAsync()
    expect(stream.getSnapshot().visible).toBe('replacement')
    expect(ready()).toBe(true)
  })
  it('retains explicit paced finish and disposes scheduled work', async () => {
    const { stream, bridge } = setup(false)
    bridge.update('', false, true, false)
    bridge.update('text'.repeat(1000), false, true, true)
    expect(stream.getSnapshot().caughtUp).toBe(false)
    bridge.dispose()
    stream.pause()
    await vi.runAllTimersAsync()
    expect(stream.getSnapshot().caughtUp).toBe(false)
  })
})
