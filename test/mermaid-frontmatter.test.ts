import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const mermaid = (await vi.importActual<typeof import('mermaid')>('mermaid')).default
const frontmatter = '---\ntitle: Example\nconfig:\n  flowchart:\n    nodeSpacing: 73\n---\n'
const diagram = 'flowchart LR\n  A --> B'

async function settle() {
  await nextTick()
  await vi.advanceTimersByTimeAsync(1000)
  await nextTick()
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('mermaid frontmatter', () => {
  async function mountDiagram(code: string, loading = false) {
    const workerPath = '../src/workers/mermaidWorkerClient'
    const loaderPath = '../src/components/MermaidBlockNode/mermaid'
    const parsedSources: string[] = []
    const renderedSources: string[] = []
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    await mermaid.parse(diagram)
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined)
    vi.doMock(workerPath, () => ({
      canParseOffthread: async () => { throw new Error('Worker unavailable') },
      findPrefixOffthread: async () => null,
      terminateWorker: () => {},
    }))
    vi.doMock(loaderPath, () => ({
      getMermaid: async () => ({
        initialize: () => {},
        parse: async (source: string) => {
          const result = await mermaid.parse(source)
          parsedSources.push(source)
          return result
        },
        render: async (_id: string, source: string) => {
          await mermaid.parse(source)
          renderedSources.push(source)
          return { svg: '<svg viewBox="0 0 100 20"><text>A → B</text></svg>' }
        },
      }),
      isMermaidEnabled: () => true,
    }))
    const component = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const node = (value: string) => ({ type: 'code_block', language: 'mermaid', code: value, raw: value })
    const wrapper = mount(component as any, { props: { node: node(code), loading } })
    await nextTick()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).viewportReady = true
    ;(wrapper.vm as any).showSource = false
    return { wrapper, parsedSources, renderedSources, node }
  }

  it.each(['\n', '\r\n'])('renders frontmatter and keeps theme switching with %j line endings', async (newline) => {
    const code = (frontmatter + diagram).replace(/\n/g, newline)
    const { wrapper, renderedSources } = await mountDiagram(code)
    try {
      await settle()
      expect(wrapper.find('svg text').text()).toBe('A → B')
      expect(renderedSources.at(-1)?.startsWith(frontmatter.replace(/\n/g, newline))).toBe(true)
      expect(await mermaid.parse(renderedSources.at(-1)!)).toMatchObject({
        diagramType: 'flowchart-v2',
        config: { theme: 'default', flowchart: { nodeSpacing: 73 } },
      })
      expect(await mermaid.parse(renderedSources.at(-1)!)).toMatchObject({
        config: { htmlLabels: false, flowchart: { htmlLabels: false } },
      })
      await wrapper.setProps({ isDark: true })
      await settle()
      expect(await mermaid.parse(renderedSources.at(-1)!)).toMatchObject({
        config: { theme: 'dark', flowchart: { nodeSpacing: 73 } },
      })
    }
    finally {
      wrapper.unmount()
    }
  })

  it('preserves an author init directive following frontmatter', async () => {
    const code = `${frontmatter}%%{init: {"theme":"forest"}}%%\n${diagram}`
    const { wrapper, renderedSources } = await mountDiagram(code)
    try {
      await settle()
      expect(renderedSources.at(-1)).toBe(code)
      expect(await mermaid.parse(renderedSources.at(-1)!)).toMatchObject({ config: { theme: 'forest' } })
      expect(wrapper.find('svg').exists()).toBe(true)
    }
    finally {
      wrapper.unmount()
    }
  })

  it('recovers after a streamed frontmatter block is completed without a Worker', async () => {
    const { wrapper, node, parsedSources, renderedSources } = await mountDiagram('---\ntitle: Example\n', true)
    try {
      await nextTick()
      await wrapper.setProps({ node: node(frontmatter + diagram) })
      await settle()
      await settle()
      expect(parsedSources.some(source => source.startsWith(frontmatter))).toBe(true)
      await wrapper.setProps({ loading: false })
      await settle()
      expect(renderedSources.at(-1)?.startsWith(frontmatter)).toBe(true)
      expect(wrapper.find('svg').exists()).toBe(true)
    }
    finally {
      wrapper.unmount()
    }
  })
})
