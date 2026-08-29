/**
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import NodeRenderer from '../src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../src/utils/nodeComponents'
import { flushAll } from './setup/flush-all'

function rect(partial: Partial<DOMRect>): DOMRect {
  return {
    x: partial.x ?? partial.left ?? 0,
    y: partial.y ?? partial.top ?? 0,
    width: partial.width ?? 0,
    height: partial.height ?? 0,
    top: partial.top ?? 0,
    right: partial.right ?? 0,
    bottom: partial.bottom ?? 0,
    left: partial.left ?? 0,
    toJSON: () => ({}),
  }
}

async function runNextFrame(queuedFrames: FrameRequestCallback[], now: number) {
  const frame = queuedFrames.shift()
  expect(frame).toBeDefined()
  frame?.(now)
  await flushAll()
}

describe('typewriter cursor position', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('simple mode shows the CSS cursor without range positioning', async () => {
    const requestAnimationFrameSpy = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameSpy as unknown as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', vi.fn() as unknown as typeof cancelAnimationFrame)
    const createRangeSpy = vi.spyOn(document, 'createRange')

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: 'simple',
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    await wrapper.setProps({ content: 'hello world' })
    await flushAll()

    expect(wrapper.classes()).toContain('typewriter-simple-cursor')
    expect(wrapper.find('.typewriter-cursor').exists()).toBe(false)
    expect(createRangeSpy).not.toHaveBeenCalled()
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('marks one simple cursor target for nested inline text', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: 'simple',
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    await wrapper.setProps({ content: 'hello **world**' })
    await flushAll()

    const targets = wrapper.findAll('.typewriter-simple-cursor-target')
    expect(targets).toHaveLength(1)
    expect(targets[0].classes()).toContain('text-node')
    expect(targets[0].text()).toBe('world')

    wrapper.unmount()
  })

  it('marks a simple cursor target when node virtualization adds spacers', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: 'simple',
        nodeVirtual: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    await wrapper.setProps({ content: 'first\n\nsecond' })
    await flushAll()

    expect(wrapper.classes()).toContain('virtualized')
    expect(wrapper.find('.node-spacer').exists()).toBe(true)

    const targets = wrapper.findAll('.typewriter-simple-cursor-target')
    expect(targets).toHaveLength(1)
    expect(targets[0].classes()).toContain('text-node')
    expect(targets[0].text()).toBe('second')

    wrapper.unmount()
  })

  it('treats static string true as precise cursor mode', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: 'true' as any,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    await wrapper.setProps({ content: 'hello world' })
    await flushAll()

    expect(wrapper.classes()).not.toContain('typewriter-simple-cursor')
    expect(wrapper.find('.typewriter-cursor').exists()).toBe(true)
    expect(queuedFrames).toHaveLength(1)

    wrapper.unmount()
  })

  it('treats static string false as disabled cursor mode', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: 'false' as any,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    await wrapper.setProps({ content: 'hello world' })
    await flushAll()

    expect(wrapper.classes()).not.toContain('typewriter-simple-cursor')
    expect(wrapper.find('.typewriter-cursor').exists()).toBe(false)
    expect(wrapper.findAll('.typewriter-simple-cursor-target')).toHaveLength(0)
    expect(queuedFrames).toHaveLength(0)

    wrapper.unmount()
  })

  it('does not restore a stale cursor when typewriter is re-enabled without new content', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: 'simple',
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()
    await wrapper.setProps({ content: 'hello world' })
    await flushAll()
    expect(wrapper.classes()).toContain('typewriter-simple-cursor')

    await wrapper.setProps({ typewriter: false })
    await flushAll()
    expect(wrapper.classes()).not.toContain('typewriter-simple-cursor')

    await wrapper.setProps({ typewriter: 'simple' })
    await flushAll()
    expect(wrapper.classes()).not.toContain('typewriter-simple-cursor')

    wrapper.unmount()
  })

  it('clears simple cursor target when stream becomes final', async () => {
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: 'simple',
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    await wrapper.setProps({ content: 'hello **world**' })
    await flushAll()

    expect(wrapper.findAll('.typewriter-simple-cursor-target')).toHaveLength(1)

    await wrapper.setProps({ final: true })
    await flushAll()

    expect(wrapper.classes()).not.toContain('typewriter-simple-cursor')
    expect(wrapper.findAll('.typewriter-simple-cursor-target')).toHaveLength(0)

    wrapper.unmount()
  })

  it('syncs cursor when switching from simple to precise while visible', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: 'simple',
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    await wrapper.setProps({ content: 'hello **world**' })
    await flushAll()

    expect(wrapper.findAll('.typewriter-simple-cursor-target')).toHaveLength(1)
    expect(queuedFrames).toHaveLength(0)

    await wrapper.setProps({ typewriter: 'precise' })
    await flushAll()

    expect(wrapper.find('.typewriter-cursor').exists()).toBe(true)
    expect(wrapper.findAll('.typewriter-simple-cursor-target')).toHaveLength(0)
    expect(queuedFrames).toHaveLength(1)

    wrapper.unmount()
  })

  it('syncs cursor when switching from precise to simple while visible', async () => {
    const queuedFrames: Array<{ id: number, cb: FrameRequestCallback }> = []
    const cancelAnimationFrameSpy = vi.fn((id: number) => {
      const index = queuedFrames.findIndex(frame => frame.id === id)
      if (index >= 0)
        queuedFrames.splice(index, 1)
    })
    let nextFrameId = 1

    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      const id = nextFrameId++
      queuedFrames.push({ id, cb })
      return id
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: 'precise',
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    await wrapper.setProps({ content: 'hello **world**' })
    await flushAll()

    expect(wrapper.find('.typewriter-cursor').exists()).toBe(true)
    expect(queuedFrames).toHaveLength(1)

    const cursorFrameId = queuedFrames[0].id
    await wrapper.setProps({ typewriter: 'simple' })
    await flushAll()

    expect(wrapper.find('.typewriter-cursor').exists()).toBe(false)
    expect(wrapper.findAll('.typewriter-simple-cursor-target')).toHaveLength(1)
    expect(wrapper.get('.typewriter-simple-cursor-target').text()).toBe('world')
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(cursorFrameId)
    expect(queuedFrames).toHaveLength(0)

    wrapper.unmount()
  })

  it('repositions while smooth visible content catches up after the source stops growing', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    const frameIds = new WeakMap<FrameRequestCallback, number>()
    let nextFrameId = 1
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      const id = nextFrameId++
      frameIds.set(cb, id)
      queuedFrames.push(cb)
      return id
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', ((id: number) => {
      const index = queuedFrames.findIndex(cb => frameIds.get(cb) === id)
      if (index >= 0)
        queuedFrames.splice(index, 1)
    }) as typeof cancelAnimationFrame)
    const measuredSlots: HTMLElement[] = []

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const element = this as HTMLElement
      if (element.classList.contains('markdown-renderer'))
        return rect({ left: 20, top: 10 })
      return rect({})
    })

    const originalCreateRange = document.createRange.bind(document)
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = originalCreateRange()
      let rangeNode: Node | null = null
      let endOffset = 0

      range.setStart = vi.fn((node: Node) => {
        rangeNode = node
      })
      range.setEnd = vi.fn((_node: Node, offset: number) => {
        rangeNode = _node
        endOffset = offset
      })
      range.getClientRects = vi.fn(() => {
        let previousLength = 0
        let sibling = rangeNode?.parentElement?.previousSibling ?? null
        const slot = rangeNode?.parentElement?.closest('.node-slot[data-node-index]')
        if (slot instanceof HTMLElement)
          measuredSlots.push(slot)

        while (sibling) {
          previousLength += sibling.textContent?.length ?? 0
          sibling = sibling.previousSibling
        }

        return [
          rect({ right: (previousLength + endOffset) * 10, top: 60, bottom: 80, height: 20 }),
        ] as unknown as DOMRectList
      })

      return range
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        smoothStreaming: true,
        smoothStreamingOptions: {
          startDelayMs: 0,
          minCharsPerSecond: 1000,
          maxCharsPerSecond: 1000,
          maxCommitFps: 60,
          maxCharsPerCommit: 4,
        },
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()
    queuedFrames.length = 0

    await wrapper.setProps({
      content: 'abcdefghijklmnopqrst',
    })
    await flushAll()

    const baseline = performance.now()
    await runNextFrame(queuedFrames, baseline + 50)
    await runNextFrame(queuedFrames, baseline + 66)

    const cursor = wrapper.get('.typewriter-cursor').element as HTMLElement
    const firstVisibleLength = wrapper.get('.text-node').text().length
    expect(firstVisibleLength).toBeGreaterThan(0)
    expect(cursor.style.transform).toBe(`translate(${Math.max(0, firstVisibleLength * 10 - 20)}px, 50px)`)
    expect(cursor.style.visibility).toBe('visible')

    await runNextFrame(queuedFrames, baseline + 100)
    await runNextFrame(queuedFrames, baseline + 116)
    await runNextFrame(queuedFrames, baseline + 132)

    const secondVisibleLength = wrapper.get('.text-node').text().length
    expect(secondVisibleLength).toBeGreaterThan(firstVisibleLength)
    expect(cursor.style.transform).toBe(`translate(${Math.max(0, secondVisibleLength * 10 - 20)}px, 50px)`)
    expect(measuredSlots.length).toBeGreaterThan(0)
    expect(measuredSlots.every(slot => slot.matches('.node-slot[data-node-index]'))).toBe(true)

    wrapper.unmount()
  })

  it('scans only the last rendered text node slot', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    let rangeNode: Node | null = null
    let measuredText = ''
    let measuredSlot: Element | null = null
    const originalCreateRange = document.createRange.bind(document)
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = originalCreateRange()
      range.setStart = vi.fn((node: Node) => {
        rangeNode = node
      })
      range.setEnd = vi.fn((node: Node) => {
        rangeNode = node
      })
      range.getClientRects = vi.fn(() => {
        measuredText = rangeNode?.textContent ?? ''
        measuredSlot = rangeNode?.parentElement?.closest('.node-slot[data-node-index]') ?? null
        return [
          rect({ right: 40, top: 20, bottom: 40, height: 20 }),
        ] as unknown as DOMRectList
      })
      return range
    })

    const huge = 'x'.repeat(20_000)
    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()
    queuedFrames.length = 0

    await wrapper.setProps({ content: `${huge}\n\nlast` })
    await flushAll()
    await runNextFrame(queuedFrames, performance.now() + 16)

    expect(measuredText).toBe('last')
    expect(measuredSlot instanceof HTMLElement && measuredSlot.matches('.node-slot[data-node-index="1"]')).toBe(true)

    wrapper.unmount()
  })

  it('coalesces cursor positioning into one RAF and measures latest content', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    let rangeNode: Node | null = null
    let measuredText = ''
    const originalCreateRange = document.createRange.bind(document)
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = originalCreateRange()
      range.setStart = vi.fn((node: Node) => {
        rangeNode = node
      })
      range.setEnd = vi.fn((node: Node) => {
        rangeNode = node
      })
      range.getClientRects = vi.fn(() => {
        measuredText = rangeNode?.textContent ?? ''
        return [
          rect({ right: measuredText.length * 10, top: 20, bottom: 40, height: 20 }),
        ] as unknown as DOMRectList
      })
      return range
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()
    queuedFrames.length = 0

    await wrapper.setProps({ content: 'hello' })
    await flushAll()
    expect(queuedFrames).toHaveLength(1)

    await wrapper.setProps({ content: 'hello world' })
    await flushAll()
    expect(queuedFrames).toHaveLength(1)

    await runNextFrame(queuedFrames, performance.now() + 16)
    expect(wrapper.get('.text-node').text()).toBe('hello world')
    expect(measuredText).toBe(' world')

    wrapper.unmount()
  })

  it('falls back to previous rendered text slot when the last non-excluded slot has no text', async () => {
    const scopeId = 'typewriter-empty-tail'
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const EmptyNode = {
      name: 'EmptyNode',
      setup() {
        return () => h('span', { class: 'empty-node' })
      },
    }
    setCustomComponents(scopeId, { 'empty-node': EmptyNode })

    let rangeNode: Node | null = null
    let measuredText = ''
    let measuredSlot: Element | null = null
    const originalCreateRange = document.createRange.bind(document)
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = originalCreateRange()
      range.setStart = vi.fn((node: Node) => {
        rangeNode = node
      })
      range.setEnd = vi.fn((node: Node) => {
        rangeNode = node
      })
      range.getClientRects = vi.fn(() => {
        measuredText = rangeNode?.textContent ?? ''
        measuredSlot = rangeNode?.parentElement?.closest('.node-slot[data-node-index]') ?? null
        return [
          rect({ right: 50, top: 20, bottom: 40, height: 20 }),
        ] as unknown as DOMRectList
      })
      return range
    })

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        customId: scopeId,
        customHtmlTags: ['empty-node'],
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    try {
      await flushAll()
      queuedFrames.length = 0

      await wrapper.setProps({ content: 'hello\n\n<empty-node></empty-node>' })
      await flushAll()
      await runNextFrame(queuedFrames, performance.now() + 16)

      expect(measuredText).toBe('hello')
      expect(measuredSlot instanceof HTMLElement && measuredSlot.matches('.node-slot[data-node-index="0"]')).toBe(true)
      expect((wrapper.get('.typewriter-cursor').element as HTMLElement).style.visibility).toBe('visible')
    }
    finally {
      wrapper.unmount()
      removeCustomComponents(scopeId)
    }
  })

  it('repositions when incremental rendering mounts the next slot', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    const queuedFrames: FrameRequestCallback[] = []
    const frameIds = new WeakMap<FrameRequestCallback, number>()
    let nextFrameId = 1
    let wrapper: ReturnType<typeof mount> | null = null
    let rangeNode: Node | null = null
    let measuredText = ''
    let runBatchDelay: (() => void) | null = null

    process.env.NODE_ENV = 'development'
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      const id = nextFrameId++
      frameIds.set(cb, id)
      queuedFrames.push(cb)
      return id
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', ((id: number) => {
      const index = queuedFrames.findIndex(cb => frameIds.get(cb) === id)
      if (index >= 0)
        queuedFrames.splice(index, 1)
    }) as typeof cancelAnimationFrame)

    const nativeSetTimeout = window.setTimeout.bind(window)
    vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, timeout?: number, ...args: any[]) => {
      if (timeout === 20 && typeof handler === 'function') {
        runBatchDelay = () => handler(...args)
        return 2_147_483_647
      }
      return nativeSetTimeout(handler, timeout, ...args)
    }) as typeof window.setTimeout)

    const originalCreateRange = document.createRange.bind(document)
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      const range = originalCreateRange()
      range.setStart = vi.fn((node: Node) => {
        rangeNode = node
      })
      range.setEnd = vi.fn((node: Node) => {
        rangeNode = node
      })
      range.getClientRects = vi.fn(() => {
        measuredText = rangeNode?.textContent ?? ''
        return [
          rect({ right: measuredText.length * 10, top: 20, bottom: 40, height: 20 }),
        ] as unknown as DOMRectList
      })
      return range
    })

    try {
      wrapper = mount(NodeRenderer, {
        props: {
          content: '',
          typewriter: true,
          smoothStreaming: false,
          batchRendering: true,
          maxLiveNodes: 0,
          initialRenderBatchSize: 1,
          renderBatchSize: 1,
          renderBatchDelay: 20,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        },
      })

      await flushAll()
      queuedFrames.length = 0

      await wrapper.setProps({ content: 'first\n\nsecond' })
      await flushAll()

      expect(wrapper.find('.node-slot[data-node-index="1"] .node-placeholder').exists()).toBe(true)
      await runNextFrame(queuedFrames, performance.now() + 16)
      await runNextFrame(queuedFrames, performance.now() + 32)
      expect(measuredText).toBe('first')

      const batchDelay = runBatchDelay
      expect(batchDelay).not.toBeNull()
      batchDelay?.()
      await flushAll()

      expect(wrapper.find('.node-slot[data-node-index="1"] .node-content').exists()).toBe(true)
      // Batch commit-cost measurement uses one RAF before the cursor measurement RAF.
      await runNextFrame(queuedFrames, performance.now() + 64)
      await runNextFrame(queuedFrames, performance.now() + 64)
      expect(measuredText).toBe('second')
    }
    finally {
      wrapper?.unmount()
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('cancels pending cursor RAF when cursor is hidden before the frame runs', async () => {
    const queuedFrameIds: number[] = []
    const cancelAnimationFrameSpy = vi.fn((id: number) => {
      const index = queuedFrameIds.indexOf(id)
      if (index >= 0)
        queuedFrameIds.splice(index, 1)
    })
    let nextFrameId = 1

    vi.stubGlobal('requestAnimationFrame', (() => {
      const id = nextFrameId++
      queuedFrameIds.push(id)
      return id
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    await wrapper.setProps({ content: 'hello world' })
    await flushAll()

    expect(queuedFrameIds).toHaveLength(1)
    const cursorFrameId = queuedFrameIds[0]

    await wrapper.setProps({ final: true })
    await flushAll()

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(cursorFrameId)
    expect(queuedFrameIds).toHaveLength(0)

    wrapper.unmount()
  })

  it('does not flash cursor when leaving nodes mode with unchanged content', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [
          { type: 'paragraph', raw: 'node text', children: [{ type: 'text', content: 'node text', raw: 'node text' }] },
        ],
        content: 'already here',
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    expect(wrapper.find('.typewriter-cursor').exists()).toBe(false)
    expect(queuedFrames).toHaveLength(0)

    await wrapper.setProps({ nodes: undefined })
    await flushAll()

    expect(wrapper.find('.typewriter-cursor').exists()).toBe(false)
    expect(queuedFrames).toHaveLength(0)

    await wrapper.setProps({ content: 'already here!' })
    await flushAll()

    expect(wrapper.find('.typewriter-cursor').exists()).toBe(true)
    expect(queuedFrames).toHaveLength(1)

    wrapper.unmount()
  })

  it('does not show cursor when content ends with a thematic break', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const wrapper = mount(NodeRenderer, {
      props: {
        content: '',
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    await wrapper.setProps({ content: 'hello\n\n---' })
    await flushAll()

    expect(wrapper.find('.typewriter-cursor').exists()).toBe(false)
    expect(queuedFrames).toHaveLength(0)

    wrapper.unmount()
  })

  it('keeps content baseline while cursor is disabled in nodes mode', async () => {
    const queuedFrames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', ((cb: FrameRequestCallback) => {
      queuedFrames.push(cb)
      return queuedFrames.length
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const longText = 'x'.repeat(1000)
    const wrapper = mount(NodeRenderer, {
      props: {
        nodes: [
          { type: 'paragraph', raw: longText, children: [{ type: 'text', content: longText, raw: longText }] },
        ],
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      },
    })

    await flushAll()

    expect(wrapper.find('.typewriter-cursor').exists()).toBe(false)
    expect(queuedFrames).toHaveLength(0)

    await wrapper.setProps({ nodes: undefined, content: 'hi' })
    await flushAll()

    expect(wrapper.find('.typewriter-cursor').exists()).toBe(true)
    expect(queuedFrames).toHaveLength(1)

    wrapper.unmount()
  })
})
