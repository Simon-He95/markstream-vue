import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

async function flushVueUpdates() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('mermaid static render performance', () => {
  it('promotes completed diagrams from SSR fallback to preview with a reserved height', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: '<svg viewBox="0 0 100 100"><rect width="1" height="1" /></svg>',
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
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\nB-->C\nC-->D\nD-->E\nE-->F\nF-->G\nG-->H\nH-->I\nI-->J\nJ-->K\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
        },
        loading: false,
        estimatedPreviewHeightPx: 500,
      },
    })

    expect(wrapper.find('[data-markstream-mermaid="1"]').attributes('data-markstream-mode')).toBe('fallback')
    expect(wrapper.find('.mermaid-source-panel').exists()).toBe(true)

    await flushVueUpdates()

    expect(['pending', 'preview']).toContain(wrapper.find('[data-markstream-mermaid="1"]').attributes('data-markstream-mode'))
    expect(wrapper.find('.mermaid-source-panel').exists()).toBe(false)
    expect((wrapper.get('.mermaid-preview-area').element as HTMLElement).style.height).toBe('500px')

    wrapper.unmount()
  })

  it('renders completed diagrams once without starting preview polling', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const canParseOffthread = vi.fn(async () => true)
    const findPrefixOffthread = vi.fn(async () => 'graph LR\nA-->B\n')
    const terminateWorker = vi.fn()
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async (_id: string, code: string) => ({
        svg: `<svg data-rendered="full">${code}</svg>`,
      })),
    }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread,
      terminateWorker,
    }))
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'graph LR\nA-->B\n',
          raw: '```mermaid\ngraph LR\nA-->B\n```',
        },
        loading: false,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    ;(wrapper.vm as any).viewportReady = true
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await flushVueUpdates()

    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)
    expect(fakeMermaid.render.mock.calls[0]?.[1]).toContain('"flowchart":{"htmlLabels":false}')
    expect(fakeMermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: 'strict',
      flowchart: { htmlLabels: false },
    }))
    expect(canParseOffthread).not.toHaveBeenCalled()
    expect(findPrefixOffthread).not.toHaveBeenCalled()

    wrapper.unmount()
    expect(terminateWorker).toHaveBeenCalled()
  })
})
