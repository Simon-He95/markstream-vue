import { mount } from '@vue/test-utils'
import { sanitizeMermaidSvg } from 'stream-markdown-parser'
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

describe('mermaid strict line breaks', () => {
  it('preserves br labels as safe SVG text lines', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const initialize = vi.fn()
    const render = vi.fn(async () => ({
      svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
    }))
    const fakeMermaid = { initialize, render }

    vi.doMock('../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const code = 'graph TD\nrootCause4["温度梯度与能量<br/>梯级利用设计缺失"]'
    const MermaidBlockNode = (await import('../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code,
          raw: code,
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

    const initConfig = initialize.mock.calls[0]?.[0]
    const renderedCode = render.mock.calls[0]?.[1]
    expect(initConfig).toEqual(expect.objectContaining({
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      dompurifyConfig: expect.objectContaining({
        ADD_TAGS: ['style', 'br'],
      }),
    }))
    expect(renderedCode).toContain('"htmlLabels":false')

    wrapper.unmount()
    vi.useRealTimers()

    const getBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox')
    const getComputedTextLength = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getComputedTextLength')
    const getSubStringLength = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getSubStringLength')
    Object.defineProperties(SVGElement.prototype, {
      getBBox: { configurable: true, value: () => ({ x: 0, y: 0, width: 100, height: 20 }) },
      getComputedTextLength: { configurable: true, value: () => 100 },
      getSubStringLength: { configurable: true, value: (_start: number, length: number) => length * 8 },
    })

    try {
      const actualMermaid = (await vi.importActual<typeof import('mermaid')>('mermaid')).default
      actualMermaid.initialize(initConfig)
      const result = await actualMermaid.render('issue-663', renderedCode)
      const safeSvg = sanitizeMermaidSvg(result.svg)

      expect(safeSvg).toBeTruthy()
      expect(safeSvg).not.toContain('<foreignObject')
      const parsed = new DOMParser().parseFromString(safeSvg!, 'image/svg+xml')
      const label = Array.from(parsed.querySelectorAll('text'))
        .find(node => node.textContent === '温度梯度与能量梯级利用设计缺失')
      const lines = Array.from(label?.children ?? [])
        .filter(node => node.tagName.toLowerCase() === 'tspan')
        .map(node => node.textContent)
      expect(lines).toEqual(['温度梯度与能量', '梯级利用设计缺失'])
    }
    finally {
      if (getBBox)
        Object.defineProperty(SVGElement.prototype, 'getBBox', getBBox)
      else
        delete (SVGElement.prototype as any).getBBox
      if (getComputedTextLength)
        Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', getComputedTextLength)
      else
        delete (SVGElement.prototype as any).getComputedTextLength
      if (getSubStringLength)
        Object.defineProperty(SVGElement.prototype, 'getSubStringLength', getSubStringLength)
      else
        delete (SVGElement.prototype as any).getSubStringLength
    }
  })
})
