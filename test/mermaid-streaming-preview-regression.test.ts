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
  it('checks the latest source at a bounded interval while chunks keep arriving', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const canParseOffthread = vi.fn(async () => true)
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async (_id: string, code: string) => ({
        svg: `<svg data-code="${code.includes('D') ? 'latest' : 'older'}" viewBox="0 0 10 10" />`,
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
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
        renderDebounceMs: 300,
      },
    })

    ;(wrapper.vm as any).userToggledShowSource = true
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()
    canParseOffthread.mockClear()
    fakeMermaid.render.mockClear()

    await wrapper.setProps({ node: createNode('graph LR\nA-->B\nB-->C\n') })
    await vi.advanceTimersByTimeAsync(120)
    await wrapper.setProps({ node: createNode('graph LR\nA-->B\nB-->C\nC-->D\n') })
    await vi.advanceTimersByTimeAsync(120)
    await wrapper.setProps({ node: createNode('graph LR\nA-->B\nB-->C\nC-->D\nD-->E\n') })
    await vi.advanceTimersByTimeAsync(120)
    await settleStreamingRender()

    expect(canParseOffthread).toHaveBeenCalled()
    expect(canParseOffthread.mock.calls.at(-1)?.[0]).toContain('D-->E')
    wrapper.unmount()
  })

  it('shows a successfully rendered streaming snapshot while newer source is still arriving', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    let resolveSnapshot!: (value: { svg: string }) => void
    const snapshotRender = new Promise<{ svg: string }>((resolve) => {
      resolveSnapshot = resolve
    })
    const canParseOffthread = vi.fn(async () => true)
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn((_id: string, code: string) => {
        if (code.includes('B-->C') && !code.includes('C-->D'))
          return snapshotRender
        return Promise.resolve({
          svg: `<svg data-rendered="${code.includes('C-->D') ? 'latest' : 'initial'}" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>`,
        })
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

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
        renderDebounceMs: 100,
      },
    })

    ;(wrapper.vm as any).userToggledShowSource = true
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()

    await wrapper.setProps({ node: createNode('graph LR\nA-->B\nB-->C\n') })
    await vi.advanceTimersByTimeAsync(120)
    await settleStreamingRender()
    expect(fakeMermaid.render.mock.calls.some(([, code]) => code.includes('B-->C') && !code.includes('C-->D'))).toBe(true)
    await wrapper.setProps({ node: createNode('graph LR\nA-->B\nB-->C\nC-->D\n') })

    resolveSnapshot({
      svg: '<svg data-rendered="snapshot" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>',
    })
    await settleStreamingRender(10)

    expect(wrapper.find('svg[data-rendered="snapshot"]').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(120)
    await settleStreamingRender(10)
    expect(wrapper.find('svg[data-rendered="latest"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('falls back to the main thread when DOMPurify is unavailable in the worker', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const canParseOffthread = vi.fn(async () => Promise.reject(new Error('purify.sanitize is not a function')))
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async () => ({
        svg: '<svg data-rendered="final" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>',
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
        node: createNode('graph LR\nA[Label]-->B\n'),
        loading: true,
        renderDebounceMs: 10000,
      },
    })

    ;(wrapper.vm as any).userToggledShowSource = true
    await settleStreamingRender()
    ;(wrapper.vm as any).mermaidAvailable = false
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()

    const loadingUpdate = wrapper.setProps({ loading: false })
    ;(wrapper.vm as any).mermaidAvailable = true
    await loadingUpdate
    await settleStreamingRender(10)

    expect(canParseOffthread).toHaveBeenCalled()
    expect(fakeMermaid.parse).toHaveBeenCalledTimes(1)
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)
    expect(wrapper.find('svg[data-rendered="final"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Failed to render diagram')
    expect(errorSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('falls back to the main thread when the worker cannot resolve mermaid module chunks', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    // Simulates a Blob URL inline worker (Vite ?worker&inline) that cannot
    // resolve mermaid's lazy-loaded diagram chunks via dynamic import().
    const moduleError = new Error('Failed to resolve module specifier \'./flowDiagram-NV44I4VS-BY9D6YQa.js\'')
    const canParseOffthread = vi.fn(async () => Promise.reject(moduleError))
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async () => ({
        svg: '<svg data-rendered="final" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>',
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
        node: createNode('graph TD\nA-->B\n'),
        loading: true,
        renderDebounceMs: 10000,
      },
    })

    ;(wrapper.vm as any).userToggledShowSource = true
    await settleStreamingRender()
    ;(wrapper.vm as any).mermaidAvailable = false
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()

    const loadingUpdate = wrapper.setProps({ loading: false })
    ;(wrapper.vm as any).mermaidAvailable = true
    await loadingUpdate
    await settleStreamingRender(10)

    expect(canParseOffthread).toHaveBeenCalled()
    expect(fakeMermaid.parse).toHaveBeenCalledTimes(1)
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)
    expect(wrapper.find('svg[data-rendered="final"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Failed to render diagram')
    expect(errorSpy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('does not retry a busy worker parse on the main thread', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const busyError: any = new Error('Worker busy')
    busyError.code = 'WORKER_BUSY'
    const canParseOffthread = vi.fn(async () => Promise.reject(busyError))
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async () => ({
        svg: '<svg viewBox="0 0 10 10"><rect width="1" height="1" /></svg>',
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
    expect(fakeMermaid.parse).not.toHaveBeenCalled()
    expect(fakeMermaid.render).not.toHaveBeenCalled()
    wrapper.unmount()
  })

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

  it('renders the latest source when loading settles during an in-flight render', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    let resolveFirstRender!: (value: { svg: string }) => void
    const firstRender = new Promise<{ svg: string }>((resolve) => {
      resolveFirstRender = resolve
    })
    const canParseOffthread = vi.fn(async () => true)
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn((_id: string, code: string) => {
        if (!code.includes('B-->C'))
          return firstRender
        return Promise.resolve({
          svg: '<svg data-rendered="latest" viewBox="0 0 10 10"><text>B</text></svg>',
        })
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

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
        renderDebounceMs: 10000,
      },
    })

    ;(wrapper.vm as any).userToggledShowSource = true
    await settleStreamingRender()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()

    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)

    await wrapper.setProps({
      node: createNode('graph LR\nA-->B\nB-->C\n'),
    })
    await settleStreamingRender()
    await wrapper.setProps({ loading: false })
    await settleStreamingRender()

    expect(canParseOffthread.mock.calls.some(([code]) => code.includes('B-->C'))).toBe(true)
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)

    resolveFirstRender({
      svg: '<svg data-rendered="stale" viewBox="0 0 10 10"><text>A</text></svg>',
    })
    await settleStreamingRender(10)

    expect(fakeMermaid.render).toHaveBeenCalledTimes(2)
    expect(fakeMermaid.render.mock.calls[1]?.[1]).toContain('B-->C')
    expect(wrapper.find('svg[data-rendered="latest"]').exists()).toBe(true)
    expect(wrapper.find('svg[data-rendered="stale"]').exists()).toBe(false)
    expect((wrapper.vm as any).lastCompletedRenderSignature).toBe('light\u0000graph LR\nA-->B\nB-->C\n')
    wrapper.unmount()
  })

  it('keeps the previous preview when a streaming render fails after loading settles', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    let rejectStreamingRender!: (reason?: unknown) => void
    let resolveFinalRender!: (value: { svg: string }) => void
    const streamingRender = new Promise<{ svg: string }>((_resolve, reject) => {
      rejectStreamingRender = reject
    })
    const finalRender = new Promise<{ svg: string }>((resolve) => {
      resolveFinalRender = resolve
    })
    let latestRenderCount = 0
    const canParseOffthread = vi.fn(async () => true)
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn((_id: string, code: string) => {
        if (!code.includes('B-->C')) {
          return Promise.resolve({
            svg: '<svg data-rendered="previous" viewBox="0 0 10 10"><text>A</text></svg>',
          })
        }
        latestRenderCount++
        return latestRenderCount === 1 ? streamingRender : finalRender
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
        previewPollDelayMs: 10000,
      },
    })

    ;(wrapper.vm as any).userToggledShowSource = true
    await settleStreamingRender()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()

    expect(wrapper.find('svg[data-rendered="previous"]').exists()).toBe(true)

    await wrapper.setProps({
      node: createNode('graph LR\nA-->B\nB-->C\n'),
    })
    await vi.advanceTimersByTimeAsync(400)
    await settleStreamingRender()

    expect(fakeMermaid.render).toHaveBeenCalledTimes(2)

    await wrapper.setProps({ loading: false })
    await settleStreamingRender()
    rejectStreamingRender(new Error('Incomplete streaming diagram'))
    await settleStreamingRender(10)

    expect(errorSpy).not.toHaveBeenCalled()
    expect(fakeMermaid.render).toHaveBeenCalledTimes(3)
    expect(wrapper.find('svg[data-rendered="previous"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Failed to render diagram')

    resolveFinalRender({
      svg: '<svg data-rendered="final" viewBox="0 0 10 10"><text>B</text></svg>',
    })
    await settleStreamingRender(10)
    await vi.advanceTimersByTimeAsync(40)
    await settleStreamingRender()

    expect(wrapper.find('svg[data-rendered="final"]').exists()).toBe(true)
    expect(wrapper.find('svg[data-rendered="previous"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the previous preview when a final render fails after streaming restarts', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    let rejectFinalRender!: (reason?: unknown) => void
    const finalRender = new Promise<{ svg: string }>((_resolve, reject) => {
      rejectFinalRender = reject
    })
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn((_id: string, code: string) => {
        if (code.includes('B-->C'))
          return finalRender
        return Promise.resolve({
          svg: '<svg data-rendered="previous" viewBox="0 0 10 10"><text>A</text></svg>',
        })
      }),
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

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
        renderDebounceMs: 10000,
      },
    })

    ;(wrapper.vm as any).userToggledShowSource = true
    await settleStreamingRender()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()

    expect(wrapper.find('svg[data-rendered="previous"]').exists()).toBe(true)

    await wrapper.setProps({
      node: createNode('graph LR\nA-->B\nB-->C\n'),
    })
    await settleStreamingRender()
    await wrapper.setProps({ loading: false })
    await settleStreamingRender()

    expect(fakeMermaid.render).toHaveBeenCalledTimes(2)

    await wrapper.setProps({ loading: true })
    rejectFinalRender(new Error('Stale final render failure'))
    await settleStreamingRender(10)

    expect(errorSpy).not.toHaveBeenCalled()
    expect(fakeMermaid.render).toHaveBeenCalledTimes(2)
    expect(wrapper.find('svg[data-rendered="previous"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Failed to render diagram')
    wrapper.unmount()
  })

  it('keeps retrying a transient worker busy result beyond 150ms without using the main thread parser', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const busyError: any = new Error('Worker busy')
    busyError.code = 'WORKER_BUSY'
    const canParseOffthread = vi.fn()
      .mockRejectedValueOnce(busyError)
      .mockRejectedValueOnce(busyError)
      .mockRejectedValueOnce(busyError)
      .mockResolvedValueOnce(true)
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async () => ({
        svg: '<svg data-rendered="final" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>',
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
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
        renderDebounceMs: 10000,
      },
    })

    ;(wrapper.vm as any).userToggledShowSource = true
    await settleStreamingRender()
    ;(wrapper.vm as any).mermaidAvailable = false
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()

    const loadingUpdate = wrapper.setProps({ loading: false })
    ;(wrapper.vm as any).mermaidAvailable = true
    await loadingUpdate
    await vi.advanceTimersByTimeAsync(350)
    await settleStreamingRender()

    expect(canParseOffthread).toHaveBeenCalledTimes(4)
    expect(fakeMermaid.parse).not.toHaveBeenCalled()
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)
    expect(wrapper.find('svg[data-rendered="final"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('Failed to render diagram')
  })

  it('bounds retries when the final worker remains busy', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const busyError: any = new Error('Worker busy')
    busyError.code = 'WORKER_BUSY'
    const canParseOffthread = vi.fn(async () => Promise.reject(busyError))
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async () => ({
        svg: '<svg data-rendered="unexpected" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>',
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
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
        renderDebounceMs: 10000,
      },
    })

    ;(wrapper.vm as any).userToggledShowSource = true
    await settleStreamingRender()
    ;(wrapper.vm as any).mermaidAvailable = false
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()

    const loadingUpdate = wrapper.setProps({ loading: false })
    ;(wrapper.vm as any).mermaidAvailable = true
    await loadingUpdate
    await vi.advanceTimersByTimeAsync(5000)
    await settleStreamingRender()

    expect(canParseOffthread).toHaveBeenCalledTimes(9)
    expect(fakeMermaid.parse).not.toHaveBeenCalled()
    expect(fakeMermaid.render).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Failed to render diagram')
    wrapper.unmount()
  })

  it('cancels a final worker busy backoff when the component unmounts', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const busyError: any = new Error('Worker busy')
    busyError.code = 'WORKER_BUSY'
    const canParseOffthread = vi.fn(async () => Promise.reject(busyError))
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async () => ({
        svg: '<svg data-rendered="unexpected" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>',
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
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
        renderDebounceMs: 10000,
      },
    })

    ;(wrapper.vm as any).userToggledShowSource = true
    await settleStreamingRender()
    ;(wrapper.vm as any).mermaidAvailable = false
    ;(wrapper.vm as any).showSource = false
    await settleStreamingRender()

    const loadingUpdate = wrapper.setProps({ loading: false })
    ;(wrapper.vm as any).mermaidAvailable = true
    await loadingUpdate
    await settleStreamingRender()
    expect(canParseOffthread).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(5000)

    expect(canParseOffthread).toHaveBeenCalledTimes(1)
    expect(fakeMermaid.parse).not.toHaveBeenCalled()
    expect(fakeMermaid.render).not.toHaveBeenCalled()
  })

  it('does not terminate the shared parser worker when one instance settles and unmounts', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    let resolveSecondParse: (value: boolean) => void = () => {}
    const canParseOffthread = vi.fn((code: string) => {
      if (code.includes('C-->D')) {
        return new Promise<boolean>((resolve) => {
          resolveSecondParse = resolve
        })
      }
      return Promise.resolve(true)
    })
    const terminateWorker = vi.fn()
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async (_id: string, code: string) => ({
        svg: `<svg data-rendered="${code.includes('C-->D') ? 'second' : 'first'}" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>`,
      })),
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker,
    }))
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const first = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
        renderDebounceMs: 10000,
      },
    })
    const second = mount(MermaidBlockNode as any, {
      props: {
        node: createNode('graph LR\nC-->D\n'),
        loading: true,
        renderDebounceMs: 10000,
      },
    })

    for (const wrapper of [first, second]) {
      ;(wrapper.vm as any).userToggledShowSource = true
      await settleStreamingRender()
      ;(wrapper.vm as any).mermaidAvailable = true
      ;(wrapper.vm as any).showSource = false
    }
    await settleStreamingRender()

    await Promise.all([
      first.setProps({ loading: false }),
      second.setProps({ loading: false }),
    ])
    await settleStreamingRender()

    expect(first.find('svg[data-rendered="first"]').exists()).toBe(true)
    first.unmount()
    expect(terminateWorker).not.toHaveBeenCalled()

    resolveSecondParse(true)
    await settleStreamingRender()

    expect(second.find('svg[data-rendered="second"]').exists()).toBe(true)
    expect(terminateWorker).not.toHaveBeenCalled()
    second.unmount()
    expect(terminateWorker).not.toHaveBeenCalled()
  })
})
