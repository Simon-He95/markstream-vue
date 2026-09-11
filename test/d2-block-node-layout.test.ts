import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import D2BlockNode from '../src/components/D2BlockNode/D2BlockNode.vue'
import { MARKSTREAM_NODE_LIFECYCLE_KEY } from '../src/utils/nodeLifecycle'

const d2MockState = vi.hoisted(() => ({
  compileImpl: null as null | ((code: string) => Promise<{
    diagram: { code: string }
    renderOptions: Record<string, unknown>
  }> | {
    diagram: { code: string }
    renderOptions: Record<string, unknown>
  }),
  renderImpl: null as null | ((
    diagram: { code: string },
    options: Record<string, unknown>,
  ) => Promise<{ svg: string }> | { svg: string }),
}))

vi.mock('../src/components/D2BlockNode/d2', () => ({
  getD2: vi.fn(async () => class FakeD2 {
    async compile(code: string) {
      if (d2MockState.compileImpl)
        return await d2MockState.compileImpl(code)
      return {
        diagram: { code },
        renderOptions: {},
      }
    }

    async render(diagram: { code: string }, options: Record<string, unknown>) {
      if (d2MockState.renderImpl)
        return await d2MockState.renderImpl(diagram, options)
      return {
        svg: `<svg width="364" height="766" viewBox="0 0 364 766"><text>${diagram.code}</text><svg class="inner-diagram" width="364" height="766" viewBox="0 0 364 766"><rect width="100" height="100" /></svg></svg>`,
      }
    }
  }),
}))

beforeEach(() => {
  d2MockState.compileImpl = null
  d2MockState.renderImpl = null
})

async function flushRender() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

async function waitForPreview(wrapper: ReturnType<typeof mount>, timeout = 1000) {
  const start = Date.now()
  while (!wrapper.find('.d2-svg').exists()) {
    if (Date.now() - start > timeout)
      throw new Error('Timed out waiting for D2 preview to render')
    await flushRender()
  }
}

async function waitForSvgText(wrapper: ReturnType<typeof mount>, text: string, timeout = 1000) {
  const start = Date.now()
  while (true) {
    const svg = wrapper.find('.d2-svg')
    if (svg.exists() && svg.html().includes(text))
      return
    if (Date.now() - start > timeout)
      throw new Error(`Timed out waiting for D2 preview text: ${text}`)
    await flushRender()
  }
}

async function waitForRenderError(wrapper: ReturnType<typeof mount>, timeout = 1000) {
  const start = Date.now()
  while (!wrapper.find('.d2-error').exists()) {
    if (Date.now() - start > timeout)
      throw new Error('Timed out waiting for D2 render error')
    await flushRender()
  }
}

describe('d2 block layout', () => {
  it('scales only the root svg and does not pin preview height with stale min-heights', async () => {
    const wrapper = mount(D2BlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'a -> b',
          raw: '```d2\na -> b\n```',
        },
        loading: false,
      },
      attachTo: document.body,
    })

    await waitForPreview(wrapper)

    const svgMarkup = wrapper.get('.d2-svg').html()
    expect(svgMarkup.match(/markstream-d2-root-svg/g)?.length ?? 0).toBe(1)

    const setupState = (wrapper.vm as any).$?.setupState
    setupState.bodyMinHeight = 5079
    await nextTick()

    expect(wrapper.get('.d2-block-body').attributes('style') || '').not.toContain('5079')

    wrapper.unmount()
  })

  it('reserves the estimated preview height while the diagram is pending', async () => {
    d2MockState.renderImpl = async (code) => {
      await new Promise(resolve => setTimeout(resolve, 30))
      return { svg: `<svg viewBox="0 0 100 100"><text>${code}</text></svg>` }
    }

    const wrapper = mount(D2BlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'a -> b',
          raw: '```d2\na -> b\n```',
        },
        loading: false,
        estimatedPreviewHeightPx: 445,
      },
      attachTo: document.body,
    })

    await nextTick()
    expect(wrapper.get('.d2-block-body').attributes('style') || '').toContain('445px')

    await waitForPreview(wrapper)
    await nextTick()
    // The reservation is released once the rendered diagram governs the height.
    expect(wrapper.get('.d2-block-body').attributes('style') || '').not.toContain('445px')

    wrapper.unmount()
  })

  it('releases the preview reservation when rendering fails permanently', async () => {
    d2MockState.renderImpl = async () => {
      throw new Error('boom')
    }

    const wrapper = mount(D2BlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'a -> b',
          raw: '```d2\na -> b\n```',
        },
        loading: false,
        estimatedPreviewHeightPx: 445,
      },
      attachTo: document.body,
    })

    await waitForRenderError(wrapper)

    // A diagram that will never render must not hold blank space: the source
    // panel keeps its own natural height.
    const style = wrapper.get('.d2-block-body').attributes('style') || ''
    expect(style).not.toContain('445px')
    expect((wrapper.vm as any).$?.setupState?.bodyMinHeight ?? null).toBeNull()

    wrapper.unmount()
  })

  it('does not reserve preview height for empty code', async () => {
    const wrapper = mount(D2BlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'd2',
          code: '',
          raw: '```d2\n```',
        },
        loading: false,
        estimatedPreviewHeightPx: 445,
      },
      attachTo: document.body,
    })

    await nextTick()
    expect(wrapper.get('.d2-block-body').attributes('style') || '').not.toContain('445px')

    wrapper.unmount()
  })

  it('stores the content height, not the reserved body height, as the fallback floor', async () => {
    // jsdom reports zero-height rects, so stand in for the browser: the body
    // would measure the reserved height, its content measures the real one.
    const rect = (height: number): DOMRect => ({
      x: 0,
      y: 0,
      width: 0,
      height,
      top: 0,
      right: 0,
      bottom: height,
      left: 0,
      toJSON: () => ({}),
    }) as DOMRect
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('d2-block-body') ? rect(445) : rect(210)
      })

    const wrapper = mount(D2BlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'a -> b',
          raw: '```d2\na -> b\n```',
        },
        loading: false,
        estimatedPreviewHeightPx: 445,
      },
      attachTo: document.body,
    })

    await nextTick()
    await nextTick()

    expect((wrapper.vm as any).$?.setupState?.bodyMinHeight).toBe(210)

    wrapper.unmount()
    rectSpy.mockRestore()
  })

  it('reports async render lifecycle height when preview settles', async () => {
    const heightSpy = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(96)
    const lifecycle = {
      reportHeight: vi.fn(),
      markPending: vi.fn(),
      markSettled: vi.fn(),
    }
    const wrapper = mount(D2BlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'a -> b',
          raw: '```d2\na -> b\n```',
        },
        loading: false,
      },
      attrs: {
        'index-key': 'd2-1',
      },
      global: {
        provide: {
          [MARKSTREAM_NODE_LIFECYCLE_KEY]: lifecycle,
        },
      },
      attachTo: document.body,
    })

    await waitForPreview(wrapper)
    await nextTick()

    expect(lifecycle.markPending).toHaveBeenCalledWith('d2-1')
    expect(lifecycle.reportHeight).toHaveBeenCalledWith('d2-1', 96)
    expect(lifecycle.markSettled).toHaveBeenCalledWith('d2-1')

    wrapper.unmount()
    heightSpy.mockRestore()
  })

  it('does not continue rendering when compile resolves after unmount', async () => {
    let releaseCompile: (() => void) | null = null
    const compileStarted = vi.fn()
    const renderAfterCompile = vi.fn(async () => ({
      svg: '<svg viewBox="0 0 10 10"></svg>',
    }))
    d2MockState.compileImpl = async (code) => {
      compileStarted()
      await new Promise<void>((resolve) => {
        releaseCompile = resolve
      })
      return {
        diagram: { code },
        renderOptions: {},
      }
    }
    d2MockState.renderImpl = renderAfterCompile

    const wrapper = mount(D2BlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'a -> b',
          raw: '```d2\na -> b\n```',
        },
        loading: false,
      },
    })

    const start = Date.now()
    while (!compileStarted.mock.calls.length) {
      if (Date.now() - start > 1000)
        throw new Error('Timed out waiting for D2 compile')
      await flushRender()
    }

    wrapper.unmount()
    releaseCompile?.()
    await flushRender()

    expect(renderAfterCompile).not.toHaveBeenCalled()
  })

  it('keeps the preview pending while a newer D2 render replaces an existing svg', async () => {
    let releaseSecondRender: () => void = () => {}
    const secondRenderStarted = vi.fn()
    d2MockState.renderImpl = async (diagram) => {
      if (diagram.code === 'b -> c') {
        secondRenderStarted()
        await new Promise<void>((resolve) => {
          releaseSecondRender = resolve
        })
      }
      return {
        svg: `<svg width="364" height="766" viewBox="0 0 364 766"><text>${diagram.code}</text></svg>`,
      }
    }

    const wrapper = mount(D2BlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'a -> b',
          raw: '```d2\na -> b\n```',
        },
        loading: false,
      },
      attachTo: document.body,
    })

    await waitForSvgText(wrapper, 'a -&gt; b')
    expect(wrapper.attributes('data-markstream-pending')).toBeUndefined()

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'd2',
        code: 'b -> c',
        raw: '```d2\nb -> c\n```',
      },
    })
    await nextTick()

    expect(wrapper.attributes('data-markstream-pending')).toBe('true')
    expect(wrapper.get('.d2-svg').html()).toContain('a -&gt; b')

    const start = Date.now()
    while (!secondRenderStarted.mock.calls.length) {
      if (Date.now() - start > 1000)
        throw new Error('Timed out waiting for second D2 render')
      await flushRender()
    }

    expect(wrapper.attributes('data-markstream-pending')).toBe('true')
    expect(wrapper.get('.d2-svg').html()).toContain('a -&gt; b')

    releaseSecondRender()
    await waitForSvgText(wrapper, 'b -&gt; c')

    expect(wrapper.attributes('data-markstream-pending')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps the preview pending when a newer D2 render replaces a failed render', async () => {
    d2MockState.renderImpl = async (diagram) => {
      if (diagram.code === 'invalid')
        throw new Error('invalid d2')
      return {
        svg: `<svg width="364" height="766" viewBox="0 0 364 766"><text>${diagram.code}</text></svg>`,
      }
    }

    const wrapper = mount(D2BlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'invalid',
          raw: '```d2\ninvalid\n```',
        },
        loading: false,
        progressiveIntervalMs: 10000,
      },
      attachTo: document.body,
    })

    await waitForRenderError(wrapper)
    expect(wrapper.attributes('data-markstream-pending')).toBeUndefined()

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'd2',
        code: 'a -> b',
        raw: '```d2\na -> b\n```',
      },
    })
    await nextTick()

    expect(wrapper.attributes('data-markstream-pending')).toBe('true')

    wrapper.unmount()
  })

  it('shows source fallback when a newer D2 render fails after an existing svg', async () => {
    d2MockState.renderImpl = async (diagram) => {
      if (diagram.code === 'invalid')
        throw new Error('invalid d2')
      return {
        svg: `<svg width="364" height="766" viewBox="0 0 364 766"><text>${diagram.code}</text></svg>`,
      }
    }

    const wrapper = mount(D2BlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'a -> b',
          raw: '```d2\na -> b\n```',
        },
        loading: false,
      },
      attachTo: document.body,
    })

    await waitForSvgText(wrapper, 'a -&gt; b')

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'd2',
        code: 'invalid',
        raw: '```d2\ninvalid\n```',
      },
    })
    await waitForRenderError(wrapper)

    expect(wrapper.attributes('data-markstream-pending')).toBeUndefined()
    expect(wrapper.attributes('data-markstream-mode')).toBe('fallback')
    expect(wrapper.find('.d2-svg').exists()).toBe(false)
    expect(wrapper.get('.d2-code').text()).toContain('invalid')
    expect(wrapper.get('.d2-error').text()).toContain('invalid d2')
    expect(wrapper.html()).not.toContain('a -&gt; b')

    wrapper.unmount()
  })

  it('rerenders when D2 theme IDs change without changing code', async () => {
    d2MockState.renderImpl = async (diagram, options) => {
      return {
        svg: `<svg width="364" height="766" viewBox="0 0 364 766"><text>${diagram.code}:theme-${options.themeID}</text></svg>`,
      }
    }

    const wrapper = mount(D2BlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'a -> b',
          raw: '```d2\na -> b\n```',
        },
        loading: false,
        themeId: 1,
      },
      attachTo: document.body,
    })

    await waitForSvgText(wrapper, 'a -&gt; b:theme-1')

    await wrapper.setProps({ themeId: 2 })
    await nextTick()

    expect(wrapper.attributes('data-markstream-pending')).toBe('true')
    expect(wrapper.get('.d2-svg').html()).toContain('a -&gt; b:theme-1')

    await waitForSvgText(wrapper, 'a -&gt; b:theme-2')
    expect(wrapper.attributes('data-markstream-pending')).toBeUndefined()

    wrapper.unmount()
  })
})

describe('d2 max-height mechanism', () => {
  function mountD2(props: Record<string, unknown> = {}) {
    return mount(D2BlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'd2',
          code: 'a -> b',
          raw: '```d2\na -> b\n```',
        },
        loading: false,
        ...props,
      },
      attachTo: document.body,
    })
  }

  it('leaves no inline max-height by default (CSS token wins)', async () => {
    const wrapper = mountD2()
    await waitForPreview(wrapper)

    const renderStyle = wrapper.get('.d2-render').attributes('style') || ''
    expect(renderStyle).not.toContain('max-height')
    expect(renderStyle).not.toContain('--ms-d2-render-max-height')

    wrapper.unmount()
  })

  it('exposes inline max-height and custom property when maxHeight is set', async () => {
    const wrapper = mountD2({ maxHeight: '400px' })
    await waitForPreview(wrapper)

    const renderStyle = wrapper.get('.d2-render').attributes('style') || ''
    expect(renderStyle).toContain('max-height: 400px')
    expect(renderStyle).toContain('--ms-d2-render-max-height: 400px')

    wrapper.unmount()
  })

  it('treats maxHeight "none" as an explicit override', async () => {
    const wrapper = mountD2({ maxHeight: 'none' })
    await waitForPreview(wrapper)

    const renderStyle = wrapper.get('.d2-render').attributes('style') || ''
    expect(renderStyle).toContain('max-height: none')
    expect(renderStyle).toContain('--ms-d2-render-max-height: none')

    wrapper.unmount()
  })

  it('chains the svg cap to the token in scoped CSS', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/D2BlockNode/D2BlockNode.vue'), 'utf8')
    expect(css).toContain('max-height: var(--ms-d2-render-max-height, var(--ms-size-code-max-height))')
  })
})
