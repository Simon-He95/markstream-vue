import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const MERMAID_RESERVED_HEIGHT_MAX_WAIT_MS = 15_000

async function flushVueUpdates() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

function mockMermaidModule(getMermaid: () => unknown) {
  vi.doMock('../src/workers/mermaidWorkerClient', () => ({
    canParseOffthread: vi.fn(async () => false),
    findPrefixOffthread: vi.fn(async () => null),
    terminateWorker: vi.fn(),
  }))
  vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
    getMermaid: vi.fn(getMermaid as any),
    isMermaidEnabled: vi.fn(() => true),
  }))
}

async function mountBlock(props: Record<string, unknown> = {}) {
  vi.stubGlobal('IntersectionObserver', undefined as any)
  const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
  const wrapper = mount(MermaidBlockNode as any, {
    props: {
      node: {
        type: 'code_block',
        language: 'mermaid',
        code: 'flowchart TD\nA-->B\n',
        raw: '```mermaid\nflowchart TD\nA-->B\n```',
      },
      loading: false,
      estimatedPreviewHeightPx: 500,
      ...props,
    },
  })
  await flushVueUpdates()
  return wrapper
}

function sourcePanelMinHeight(wrapper: ReturnType<typeof mount>) {
  const panel = wrapper.find('.mermaid-source-panel')
  if (!panel.exists())
    return null
  return (panel.element as HTMLElement).style.minHeight || null
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('mermaid source panel reserved height', () => {
  it('holds the reservation while the source panel is the visible panel and mermaid is still loading', async () => {
    // Streamed content ends (loading: false) before the runtime resolves. Dropping
    // the floor here collapses the block from the reserved height to the source
    // height and back once the preview arrives (measured 435 → 233 → 435px).
    mockMermaidModule(() => new Promise(() => {}))
    const wrapper = await mountBlock()

    expect(sourcePanelMinHeight(wrapper)).toBe('500px')

    wrapper.unmount()
  })

  it('drops the reservation once availability resolves to "no runtime"', async () => {
    mockMermaidModule(async () => null)
    const wrapper = await mountBlock()
    await flushVueUpdates()

    expect(sourcePanelMinHeight(wrapper)).toBeNull()

    wrapper.unmount()
  })

  it('drops the reservation when the loader never settles', async () => {
    vi.useFakeTimers()
    // getMermaid() has no timeout of its own, so a hanging consumer loader would
    // otherwise reserve blank space for the life of the block.
    mockMermaidModule(() => new Promise(() => {}))
    const wrapper = await mountBlock()
    await flushVueUpdates()

    expect(sourcePanelMinHeight(wrapper)).toBe('500px')

    vi.advanceTimersByTime(MERMAID_RESERVED_HEIGHT_MAX_WAIT_MS)
    await flushVueUpdates()

    expect(sourcePanelMinHeight(wrapper)).toBeNull()

    wrapper.unmount()
  })

  it('drops the reservation when the source mode is picked explicitly', async () => {
    mockMermaidModule(() => new Promise(() => {}))
    const wrapper = await mountBlock()
    expect(sourcePanelMinHeight(wrapper)).toBe('500px')

    const state = (wrapper.vm as any).$?.setupState
    state.handleSwitchMode('source')
    await flushVueUpdates()

    // The source panel is still the visible one, it just no longer holds space
    // for a preview the user asked not to see.
    expect(wrapper.find('.mermaid-source-panel').exists()).toBe(true)
    expect(sourcePanelMinHeight(wrapper)).toBeNull()

    wrapper.unmount()
  })
})
