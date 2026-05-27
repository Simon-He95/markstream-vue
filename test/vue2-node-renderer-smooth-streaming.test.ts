/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import * as parser from 'stream-markdown-parser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, provide } from 'vue'
import NodeRenderer from '../packages/markstream-vue2/src/components/NodeRenderer'

async function flushVue() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('vue2 node renderer smooth streaming', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('smooths post-mount appends by default and allows opting out', async () => {
    const content = 'Hello smooth streaming markdown renderer.'

    const smoothWrapper = mount(NodeRenderer as any, {
      props: {
        content: '',
        typewriter: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()
    await smoothWrapper.setProps({ content })
    await flushVue()

    expect(smoothWrapper.text()).not.toContain(content)

    const rawWrapper = mount(NodeRenderer as any, {
      props: {
        content,
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()

    expect(rawWrapper.text()).toContain(content)

    smoothWrapper.unmount()
    rawWrapper.unmount()
  })

  it('renders initial static content immediately', async () => {
    const wrapper = mount(NodeRenderer as any, {
      props: {
        content: 'static markdown',
        typewriter: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()

    expect(wrapper.text()).toContain('static markdown')
    wrapper.unmount()
  })

  it('forces pacing in smoothStreaming=true mode even without typewriter', async () => {
    const wrapper = mount(NodeRenderer as any, {
      props: {
        content: '',
        typewriter: false,
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()
    await wrapper.setProps({ content: 'Force enabled smooth' })
    await flushVue()

    expect(wrapper.text()).not.toContain('Force enabled smooth')
    wrapper.unmount()
  })

  it('keeps auto mode off when typewriter is disabled', async () => {
    const wrapper = mount(NodeRenderer as any, {
      props: {
        content: 'Auto mode test',
        typewriter: false,
        smoothStreaming: 'auto',
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()

    expect(wrapper.text()).toContain('Auto mode test')
    wrapper.unmount()
  })

  it('does not smooth nodes mode', async () => {
    const wrapper = mount(NodeRenderer as any, {
      props: {
        nodes: [{ type: 'text', content: 'Node mode', raw: 'Node mode' }],
        typewriter: true,
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()

    expect(wrapper.text()).toContain('Node mode')
    wrapper.unmount()
  })

  it('suppresses nested auto pacing when the parent already smooths', async () => {
    const Harness = defineComponent({
      name: 'SmoothStreamingHarness',
      setup() {
        provide('markstreamSmoothStreaming', { value: true })
        return () => h(NodeRenderer as any, {
          content: 'Nested auto content',
          typewriter: true,
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        })
      },
    })

    const wrapper = mount(Harness)

    await flushVue()

    expect(wrapper.text()).toContain('Nested auto content')
    wrapper.unmount()
  })

  it('gates final to caughtUp when smooth streaming is enabled', async () => {
    const parseSpy = vi.spyOn(parser, 'parseMarkdownToStructure')

    const wrapper = mount(NodeRenderer as any, {
      props: {
        content: 'seed',
        typewriter: true,
        smoothStreaming: true,
        final: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()
    parseSpy.mockClear()

    await wrapper.setProps({ content: 'seed plus tail', final: true })
    await flushVue()

    const callsBeforeCatchup = parseSpy.mock.calls
      .map(call => call[2] as { final?: boolean } | undefined)
      .filter(options => options && typeof options.final === 'boolean')
    expect(callsBeforeCatchup.some(options => options?.final === true)).toBe(false)

    wrapper.unmount()
    parseSpy.mockRestore()
  })

  it('auto enables smooth streaming when maxLiveNodes <= 0 even if typewriter is false', async () => {
    const wrapper = mount(NodeRenderer as any, {
      props: {
        content: '',
        typewriter: false,
        maxLiveNodes: 0,
        smoothStreaming: 'auto',
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushVue()
    await wrapper.setProps({ content: 'Should pace even without typewriter' })
    await flushVue()

    // With maxLiveNodes=0 and typewriter=false, auto should still enable smooth streaming
    expect(wrapper.text()).not.toContain('Should pace even without typewriter')
    wrapper.unmount()
  })
})
