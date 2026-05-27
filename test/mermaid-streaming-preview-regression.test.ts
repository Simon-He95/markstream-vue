import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

async function flushVueUpdates() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

async function settleStreamingRender(turns = 6) {
  for (let index = 0; index < turns; index++)
    await flushVueUpdates()
}

function createNode(code: string) {
  return {
    type: 'code_block',
    language: 'mermaid',
    code,
    raw: `\`\`\`mermaid\n${code}\`\`\``,
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('mermaid streaming preview regression', () => {
  it('does not render gantt preview before the first complete task line', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const canParseOffthread = vi.fn(async () => true)
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: '<svg data-rendered="gantt" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>',
      })),
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('gantt\nsection A section\n'),
        loading: true,
      },
    })

    await flushVueUpdates()

    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()
    await vi.advanceTimersByTimeAsync(400)
    await settleStreamingRender()

    expect(canParseOffthread).not.toHaveBeenCalled()
    expect(fakeMermaid.render).not.toHaveBeenCalled()
    expect(wrapper.find('div._mermaid svg').exists()).toBe(false)
  })

  it('keeps gantt progressive preview by rendering the last safe task prefix', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const canParseOffthread = vi.fn(async () => true)
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async (_id: string, code: string) => ({
        svg: `<svg data-rendered="${code.includes('Active task') ? 'unsafe' : 'prefix'}" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>`,
      })),
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('gantt\nsection A section\nCompleted task :done, des1, 2014-01-06,2014-01-08\nActive task'),
        loading: true,
      },
    })

    await flushVueUpdates()

    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()
    await vi.advanceTimersByTimeAsync(400)
    await settleStreamingRender()

    expect(canParseOffthread).toHaveBeenCalled()
    expect(canParseOffthread).not.toHaveBeenCalledWith(expect.stringContaining('Active task'), expect.anything(), expect.anything())
    expect(fakeMermaid.render).toHaveBeenCalled()
    expect(fakeMermaid.render.mock.calls[0]?.[1]).toContain('Completed task')
    expect(fakeMermaid.render.mock.calls[0]?.[1]).not.toContain('Active task')
    expect(wrapper.find('svg[data-rendered="prefix"]').exists()).toBe(true)
  })

  it('renders a prefix preview immediately when returning to preview mid-stream', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const canParseOffthread = vi.fn(async (code: string) => !code.includes('B-->C'))
    const findPrefixOffthread = vi.fn(async () => 'graph LR\nA-->B\n')
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async (_id: string, code: string) => ({
        svg: `<svg data-rendered="${code.includes('B-->C') ? 'full' : 'prefix'}" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>`,
      })),
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread,
      terminateWorker: vi.fn(),
    }))
    const getMermaid = vi.fn(async () => fakeMermaid)
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid,
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
      },
    })

    await flushVueUpdates()

    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()

    ;(wrapper.vm as any).showSource = true
    await settleStreamingRender()

    fakeMermaid.render.mockClear()
    canParseOffthread.mockClear()
    findPrefixOffthread.mockClear()

    await wrapper.setProps({
      node: createNode('graph LR\nA-->B\nB-->C\n'),
    })
    await settleStreamingRender()

    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()

    expect(canParseOffthread).toHaveBeenCalled()
    expect(findPrefixOffthread).toHaveBeenCalled()
    expect(getMermaid).toHaveBeenCalled()
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)
    expect(fakeMermaid.render.mock.calls[0]?.[1]).toContain('A-->B')
    expect(fakeMermaid.render.mock.calls[0]?.[1]).not.toContain('B-->C')
    expect(wrapper.find('svg[data-rendered="prefix"]').exists()).toBe(true)
  })

  it('does not log transient render failures while streaming', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const canParseOffthread = vi.fn(async () => true)
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => {
        throw new Error('Invalid date: des4')
      }),
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
      },
    })

    await flushVueUpdates()

    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()
    await vi.advanceTimersByTimeAsync(400)
    await settleStreamingRender()

    expect(canParseOffthread).toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(wrapper.find('div._mermaid svg').exists()).toBe(false)
  })

  it('skips malformed preview SVG output while streaming', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const canParseOffthread = vi.fn(async () => true)
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: '<svg viewBox="0 0 10 10"><line x1="NaN" x2="10" y1="0" y2="10" /></svg>',
      })),
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
      },
    })

    await flushVueUpdates()

    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()
    await vi.advanceTimersByTimeAsync(400)
    await settleStreamingRender()

    expect(canParseOffthread).toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    expect(wrapper.find('div._mermaid svg').exists()).toBe(false)
  })

  it('keeps the current preview height while streamed source changes after a preview exists', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: '<svg data-rendered="preview" viewBox="0 0 100 100"><rect width="1" height="1" /></svg>',
      })),
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
        estimatedPreviewHeightPx: 500,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    ;(wrapper.vm as any).containerHeight = '420px'
    wrapper.get('div._mermaid').element.innerHTML = '<svg data-rendered="preview" viewBox="0 0 100 100"><rect width="1" height="1" /></svg>'
    await flushVueUpdates()

    await wrapper.setProps({
      node: createNode('graph LR\nA-->B\nB-->C\nC-->D\n'),
    })
    await flushVueUpdates()

    expect((wrapper.get('.mermaid-preview-area').element as HTMLElement).style.height).toBe('420px')
  })

  it('keeps the previous preview when a streaming render returns a blank SVG', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: '<svg data-rendered="blank" viewBox="0 0 100 100"><defs><marker id="m" /></defs></svg>',
      })),
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    wrapper.get('div._mermaid').element.innerHTML = '<svg data-rendered="previous" viewBox="0 0 100 100"><rect width="1" height="1" /></svg>'
    await flushVueUpdates()

    await wrapper.setProps({
      node: createNode('graph LR\nA-->B\nB-->C\n'),
    })
    await vi.advanceTimersByTimeAsync(400)
    await settleStreamingRender()

    expect(wrapper.find('svg[data-rendered="previous"]').exists()).toBe(true)
    expect(wrapper.find('svg[data-rendered="blank"]').exists()).toBe(false)
  })

  it('keeps the previous preview when streamed Mermaid source is temporarily empty', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: '<svg data-rendered="next" viewBox="0 0 100 100"><rect width="1" height="1" /></svg>',
      })),
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(400)
    await settleStreamingRender()

    wrapper.get('div._mermaid').element.innerHTML = '<svg data-rendered="previous" viewBox="0 0 100 100"><rect width="1" height="1" /></svg>'
    await flushVueUpdates()

    await wrapper.setProps({
      node: createNode(''),
    })
    await vi.advanceTimersByTimeAsync(400)
    await settleStreamingRender()

    expect(wrapper.find('svg[data-rendered="previous"]').exists()).toBe(true)

    await wrapper.setProps({ loading: false })
    await flushVueUpdates()

    expect(wrapper.find('div._mermaid svg').exists()).toBe(false)
  })
})
