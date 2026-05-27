import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MathBlockNode from '../src/components/MathBlockNode/MathBlockNode.vue'
import { createMathBlockMinHeightCache, MATH_BLOCK_MIN_HEIGHT_CACHE } from '../src/components/MathBlockNode/minHeightCache'
import { flushAll } from './setup/flush-all'

vi.mock('../src/components/MathInlineNode/katex', () => ({
  getKatexSync: () => null,
  getKatex: async () => null,
}))

vi.mock('../src/workers/katexWorkerClient', async () => {
  const actual: any = await vi.importActual('../src/workers/katexWorkerClient')
  return {
    ...actual,
    renderKaTeXWithBackpressure: vi.fn(() => new Promise<string>(() => {})),
  }
})

const originalOffsetHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

function mockOffsetHeight(height: number) {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get() {
      return height
    },
  })
}

describe('mathBlockNode min-height cache scope', () => {
  afterEach(() => {
    if (originalOffsetHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalOffsetHeightDescriptor)
    }
  })

  it('isolates cached min-height across different scopes for the same indexKey', async () => {
    const rendererCache = createMathBlockMinHeightCache('renderer-test')

    mockOffsetHeight(120)
    const first = mount(MathBlockNode as any, {
      props: {
        node: {
          type: 'math_block',
          content: '',
          raw: '$$x$$',
        },
        indexKey: 'same-index',
        cacheScope: 'msg-a',
      },
      global: {
        provide: {
          [MATH_BLOCK_MIN_HEIGHT_CACHE as symbol]: rendererCache,
        },
      },
    })
    await flushAll()
    expect(first.attributes('style')).toContain('min-height: 120px;')
    first.unmount()

    mockOffsetHeight(40)
    const second = mount(MathBlockNode as any, {
      props: {
        node: {
          type: 'math_block',
          content: '',
          raw: '$$y$$',
        },
        indexKey: 'same-index',
        cacheScope: 'msg-b',
      },
      global: {
        provide: {
          [MATH_BLOCK_MIN_HEIGHT_CACHE as symbol]: rendererCache,
        },
      },
    })
    await flushAll()
    expect(second.attributes('style')).toContain('min-height: 40px;')
    second.unmount()
  })
})
