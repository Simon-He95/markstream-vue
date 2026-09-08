import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useTpsStreamSimulator } from '../playground/src/composables/useTpsStreamSimulator'

function mountSimulator(source = 'a'.repeat(12000), targetTps = 300) {
  return mount(defineComponent({
    setup() {
      return useTpsStreamSimulator({ source, targetTps })
    },
    template: '<div />',
  }))
}

describe('estimated TPS simulator', () => {
  afterEach(() => vi.useRealTimers())

  it.each([100, 300, 500, 1000])('delivers %i estimated tokens per active second', async (speed) => {
    vi.useFakeTimers()
    const wrapper = mountSimulator(undefined, speed)
    wrapper.vm.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.vm.content).toHaveLength(speed * 4)
    expect(wrapper.vm.actualTps).toBe(speed)
    expect(wrapper.vm.elapsedMs).toBe(1000)
    wrapper.unmount()
  })

  it('catches up after delayed callbacks instead of losing throughput', () => {
    vi.useFakeTimers()
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const wrapper = mountSimulator()
    wrapper.vm.start()
    now = 1000
    vi.advanceTimersToNextTimer()
    expect(wrapper.vm.content).toHaveLength(1200)
    expect(wrapper.vm.actualTps).toBe(300)
    wrapper.unmount()
  })

  it('excludes pauses from the clock and does not burst on resume', async () => {
    vi.useFakeTimers()
    const wrapper = mountSimulator()
    wrapper.vm.start()
    await vi.advanceTimersByTimeAsync(1000)
    wrapper.vm.pause()
    await vi.advanceTimersByTimeAsync(10000)
    expect(wrapper.vm.content).toHaveLength(1200)
    expect(wrapper.vm.elapsedMs).toBe(1000)
    wrapper.vm.resume()
    expect(wrapper.vm.content).toHaveLength(1200)
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.vm.content).toHaveLength(2400)
    expect(wrapper.vm.elapsedMs).toBe(2000)
    wrapper.unmount()
  })

  it('replays cleanly, completes exactly, and cancels pending updates on stop', async () => {
    vi.useFakeTimers()
    const wrapper = mountSimulator('a'.repeat(1201))
    wrapper.vm.start()
    await vi.advanceTimersByTimeAsync(500)
    wrapper.vm.start()
    expect(wrapper.vm.content).toBe('')
    expect(wrapper.vm.elapsedMs).toBe(0)
    await vi.advanceTimersByTimeAsync(1001)
    expect(wrapper.vm.content).toBe('a'.repeat(1201))
    expect(wrapper.vm.progress).toBe(100)
    expect(wrapper.vm.isStreaming).toBe(false)
    wrapper.vm.start()
    await vi.advanceTimersByTimeAsync(20)
    wrapper.vm.stop()
    const content = wrapper.vm.content
    await vi.advanceTimersByTimeAsync(1000)
    expect(wrapper.vm.content).toBe(content)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves emoji and non-Latin text across chunk boundaries', async () => {
    vi.useFakeTimers()
    const source = '你好🙂🚀مرحبا é'
    const wrapper = mountSimulator(source, 1)
    wrapper.vm.start()
    for (let i = 1; i <= Array.from(source).length; i++) {
      await vi.advanceTimersByTimeAsync(260)
      expect(wrapper.vm.content).not.toMatch(/[\uD800-\uDBFF]$/u)
      expect(source.startsWith(wrapper.vm.content)).toBe(true)
    }
    expect(wrapper.vm.content).toBe(source)
    expect(wrapper.vm.totalTokens).toBe(Array.from(source).length / 4)
    wrapper.unmount()
  })

  it('handles an empty source and disposes an active run', async () => {
    vi.useFakeTimers()
    const empty = mountSimulator('')
    empty.vm.start()
    expect(empty.vm.isStreaming).toBe(false)
    expect(empty.vm.actualTps).toBe(0)
    expect(empty.vm.progress).toBe(0)
    empty.unmount()
    const wrapper = mountSimulator()
    wrapper.vm.start()
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
