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

describe('markstream-vue2 mermaid streaming preview regression', () => {
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

    vi.doMock('../packages/markstream-vue2/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../packages/markstream-vue2/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))

    const MermaidBlockNode = (await import('../packages/markstream-vue2/src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
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

    vi.doMock('../packages/markstream-vue2/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../packages/markstream-vue2/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))

    const MermaidBlockNode = (await import('../packages/markstream-vue2/src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
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
})
