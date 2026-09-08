import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import StreamSpeedPanel from '../playground/src/components/StreamSpeedPanel.vue'

function mountPanel() {
  return mount(StreamSpeedPanel, {
    props: {
      mode: 'tps',
      targetTps: 300,
      actualTps: 299.8,
      totalTokens: 3000,
      elapsedMs: 1000,
      progress: 10,
      isStreaming: true,
      isPaused: false,
      smoothStreaming: true,
    },
  })
}

describe('stream speed controls', () => {
  it('compares the same content duration at 300 and 500 TPS and emits replay selections', async () => {
    const wrapper = mountPanel()
    const selected = wrapper.get('[aria-label="300 estimated TPS"]')
    expect(selected.attributes('aria-pressed')).toBe('true')
    expect(selected.text()).toContain('~10.0s total')
    const faster = wrapper.get('[aria-label="500 estimated TPS"]')
    expect(faster.text()).toContain('~6.0s total')
    await faster.trigger('click')
    expect(wrapper.emitted('speed')).toEqual([[500]])
    expect(wrapper.text()).toContain('1 token = 4 Unicode characters')
  })

  it('hides TPS controls and metrics in random mode', async () => {
    const wrapper = mountPanel()
    await wrapper.get('.speed-mode button:last-child').trigger('click')
    expect(wrapper.emitted('mode')).toEqual([['chunks']])
    await wrapper.setProps({ mode: 'chunks' })
    expect(wrapper.find('#custom-tps').exists()).toBe(false)
    expect(wrapper.find('.speed-metrics').exists()).toBe(false)
    expect(wrapper.text()).toContain('Stream settings apply when you replay')
  })

  it('clamps custom speeds and restores an empty input without replay', async () => {
    const wrapper = mountPanel()
    await wrapper.get('input').setValue('5000')
    expect(wrapper.emitted('speed')).toEqual([[2000]])
    await wrapper.setProps({ targetTps: 2000 })
    await wrapper.get('input').setValue('')
    expect(wrapper.emitted('speed')).toHaveLength(1)
    expect(wrapper.get('input').element.value).toBe('2000')
  })

  it('distinguishes paused or completed input from display smoothing', async () => {
    const wrapper = mountPanel()
    await wrapper.setProps({ isPaused: true })
    expect(wrapper.get('[role="status"]').text()).toBe('Input paused')
    await wrapper.setProps({ isStreaming: false, isPaused: false, progress: 100 })
    expect(wrapper.get('[role="status"]').text()).toBe('Input complete')
    expect(wrapper.text()).toContain('display may trail input')
  })
})
