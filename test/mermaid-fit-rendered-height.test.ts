import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import MermaidBlockNode from '../src/components/MermaidBlockNode/MermaidBlockNode.vue'

const mounted: Array<ReturnType<typeof mount>> = []

/**
 * Mounts a block whose render is already at rest (`loading: false`) and whose
 * host reserved `estimatedPreviewHeightPx` — the virtual-list case, where the
 * host can only guess the height before the diagram resolves.
 */
async function mountBlock(props: Record<string, unknown> = {}) {
  const wrapper = mount(MermaidBlockNode as any, {
    props: {
      node: {
        type: 'code_block',
        language: 'mermaid',
        code: 'gantt\n  title timeline\n  section A\n  phase :a1, 0, 5\n',
        raw: '',
      },
      loading: false,
      estimatedPreviewHeightPx: 500,
      ...props,
    },
    attachTo: document.body,
  })
  mounted.push(wrapper)

  // Switch the block to its preview panel: the source panel is what renders
  // until the runtime resolves.
  ;(wrapper.vm as any).mermaidAvailable = true
  ;(wrapper.vm as any).showSource = false
  await nextTick()
  return wrapper
}

// A 1440×220 viewBox laid out at 506px wide renders 77px tall: a wide/flat gantt.
const FLAT_DIAGRAM = '0 0 1440 220'
const CONTAINER_WIDTH = 506

/**
 * Commits a rendered diagram into the block and re-runs the height pass.
 * jsdom has no layout, so the measured width falls back to the container width —
 * the block derives the height from the viewBox ratio and that width.
 */
async function commitDiagram(wrapper: ReturnType<typeof mount>, viewBox: string) {
  const content = wrapper.get('div._mermaid').element as HTMLElement
  content.innerHTML = `<svg viewBox="${viewBox}"></svg>`

  const container = (wrapper.get('[data-mermaid-wrapper]').element as HTMLElement).parentElement as HTMLElement
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: CONTAINER_WIDTH })

  const setupState = (wrapper.vm as any).$?.setupState
  setupState.updateContainerHeight()
  await nextTick()
  return container
}

afterEach(() => {
  while (mounted.length)
    mounted.pop()?.unmount()
})

describe('mermaid fitted preview height', () => {
  it('holds the host reservation by default', async () => {
    const wrapper = await mountBlock()
    const container = await commitDiagram(wrapper, FLAT_DIAGRAM)

    // The host reserved 500px and the block keeps honouring it, so the 77px
    // diagram sits in a box ~6.5× its height — the blank space reported by
    // consumers of the virtual list.
    expect(container.style.height).toBe('500px')
  })

  it('fits the box to the rendered diagram when fitPreviewHeight is on', async () => {
    const wrapper = await mountBlock({ fitPreviewHeight: true })
    const container = await commitDiagram(wrapper, FLAT_DIAGRAM)

    // Below the fitted floor, so the box lands on the floor instead of holding
    // the reservation — and it overrides the host estimate, which is the case
    // that reserves the most empty space.
    expect(container.style.height).toBe('120px')
  })

  it('fits a mid-size diagram to its measured height', async () => {
    const wrapper = await mountBlock({ fitPreviewHeight: true })
    const container = await commitDiagram(wrapper, '0 0 850 507')

    // 506 × (507 / 850) ≈ 301.8px: above the fitted floor, below the cap.
    expect(Number.parseFloat(container.style.height)).toBeCloseTo(301.8, 1)
  })

  it('still caps the fitted height at the preview max height', async () => {
    const wrapper = await mountBlock({ fitPreviewHeight: true })
    const container = await commitDiagram(wrapper, '0 0 200 2000')

    expect(container.style.height).toBe('500px')
  })

  it('keeps the reservation while streaming, even with fitPreviewHeight on', async () => {
    const wrapper = await mountBlock({ fitPreviewHeight: true, loading: true })
    const container = await commitDiagram(wrapper, FLAT_DIAGRAM)

    // A streamed diagram keeps its reserved geometry: shrinking mid-stream would
    // reflow the content below on every render pass.
    expect(container.style.height).toBe('500px')
  })

  it('fits an estimate-only block (no host reservation) too', async () => {
    const wrapper = await mountBlock({ fitPreviewHeight: true, estimatedPreviewHeightPx: undefined })
    const container = await commitDiagram(wrapper, FLAT_DIAGRAM)

    // Without the flag the estimate itself (clamped to the 360px reservation
    // floor) would keep the box at 360px.
    expect(container.style.height).toBe('120px')
  })
})
