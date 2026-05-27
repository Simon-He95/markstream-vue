import { mount } from '@vue/test-utils'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const unsafeMermaidSvg = `
  <svg viewBox="0 0 10 10" onload="alert(1)">
    <style>.node rect { fill: #fff; stroke: #333; }</style>
    <script>alert(1)</script>
    <foreignObject><iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe></foreignObject>
    <text style="background:url(javascript:alert(1))">x</text>
    <rect width="10" height="10" />
  </svg>
`

async function flushVueUpdates() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

async function flushReactUpdates() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function expectSanitizedMermaidHtml(html: string) {
  expect(html).toMatch(/<svg/i)
  expect(html).toMatch(/<rect/i)
  expect(html).toMatch(/<style/i)
  expect(html).toContain('fill')
  expect(html).not.toMatch(/<script/i)
  expect(html).not.toMatch(/\son[a-z]+\s*=/i)
  expect(html).not.toMatch(/foreignObject/i)
  expect(html).not.toMatch(/srcdoc/i)
  expect(html).not.toMatch(/javascript:/i)
}

function findButtonByText(host: HTMLElement, text: string) {
  const needle = text.toLowerCase()
  return Array.from(host.querySelectorAll('button')).find(button => button.textContent?.toLowerCase().includes(needle)) as HTMLButtonElement | undefined
}

function findButtonBySvgPath(host: HTMLElement, pathStart: string) {
  return Array.from(host.querySelectorAll('button')).find((button) => {
    return Array.from(button.querySelectorAll('path')).some(path => path.getAttribute('d')?.startsWith(pathStart))
  }) as HTMLButtonElement | undefined
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('mermaid block SVG sanitizer', () => {
  it('sanitizes rendered SVG even when Mermaid securityLevel is loose', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const bindFunctions = vi.fn()
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: unsafeMermaidSvg,
        bindFunctions,
      })),
    }

    vi.doMock('../../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
        },
        loading: false,
        isStrict: false,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    ;(wrapper.vm as any).viewportReady = true
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await flushVueUpdates()

    const html = wrapper.get('div._mermaid').html()
    expect(fakeMermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: 'loose',
    }))
    expectSanitizedMermaidHtml(html)
    expect(bindFunctions).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('calls Vue Mermaid bindFunctions only when interactions are enabled', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const bindFunctions = vi.fn()
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
        bindFunctions,
      })),
    }

    vi.doMock('../../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
        },
        loading: false,
        enableMermaidInteractions: true,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    ;(wrapper.vm as any).viewportReady = true
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await flushVueUpdates()

    expect(bindFunctions).toHaveBeenCalledTimes(1)
    expect(bindFunctions.mock.calls[0]?.[0]).toBeInstanceOf(HTMLElement)

    ;(wrapper.vm as any).openModal()
    await flushVueUpdates()
    await flushVueUpdates()

    expect(bindFunctions).toHaveBeenCalledTimes(2)
    const modalTarget = bindFunctions.mock.calls[1]?.[0] as HTMLElement | undefined
    expect(modalTarget).toBeInstanceOf(HTMLElement)
    expect(modalTarget?.classList.contains('fullscreen')).toBe(true)

    wrapper.unmount()
  })

  it('rebinds Vue Mermaid functions when restoring cached preview SVG', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const bindFunctions = vi.fn()
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
        bindFunctions,
      })),
    }

    vi.doMock('../../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
        },
        loading: false,
        enableMermaidInteractions: true,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    ;(wrapper.vm as any).viewportReady = true
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await flushVueUpdates()

    expect(bindFunctions).toHaveBeenCalledTimes(1)

    ;(wrapper.vm as any).showSource = true
    await flushVueUpdates()
    ;(wrapper.vm as any).showSource = false
    await flushVueUpdates()

    expect(bindFunctions).toHaveBeenCalledTimes(2)
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('binds Vue Mermaid functions to the new buffered SVG layer', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const bindFunctions = vi.fn()
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn()
        .mockResolvedValueOnce({
          svg: '<svg data-render="old" viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
          bindFunctions,
        })
        .mockResolvedValueOnce({
          svg: '<svg data-render="new" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" /></svg>',
          bindFunctions,
        }),
    }

    vi.doMock('../../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
        },
        loading: false,
        enableMermaidInteractions: true,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    ;(wrapper.vm as any).viewportReady = true
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await flushVueUpdates()

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'mermaid',
        code: 'flowchart TD\nA-->C\n',
        raw: '```mermaid\nflowchart TD\nA-->C\n```',
      },
    })
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await flushVueUpdates()

    expect(bindFunctions).toHaveBeenCalledTimes(2)
    const secondTarget = bindFunctions.mock.calls[1]?.[0] as HTMLElement | undefined
    expect(secondTarget).toBeInstanceOf(HTMLElement)
    expect(secondTarget?.dataset.mermaidSvgLayer).toBe('1')
    expect(secondTarget?.querySelectorAll('svg')).toHaveLength(1)
    expect(secondTarget?.innerHTML).toContain('data-render="new"')
    expect(secondTarget?.innerHTML).not.toContain('data-render="old"')

    wrapper.unmount()
  })

  it('clears stale Vue Mermaid DOM when the final sanitized SVG is empty', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn()
        .mockResolvedValueOnce({
          svg: '<svg viewBox="0 0 10 10"><rect data-safe="1" width="10" height="10" /></svg>',
        })
        .mockResolvedValueOnce({
          svg: '<svg viewBox="0 0 10 10"><video><rect data-stale="1" width="10" height="10" /></video></svg>',
        }),
    }

    vi.doMock('../../src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../../src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
      isMermaidEnabled: vi.fn(() => true),
    }))

    const MermaidBlockNode = (await import('../../src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
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

    expect(wrapper.get('div._mermaid').html()).toContain('data-safe')

    await wrapper.setProps({
      node: {
        type: 'code_block',
        language: 'mermaid',
        code: 'flowchart TD\nA-->C\n',
        raw: '```mermaid\nflowchart TD\nA-->C\n```',
      },
    })
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await flushVueUpdates()

    const html = wrapper.get('div._mermaid').html()
    expect(html).not.toContain('data-safe')
    expect(html).not.toContain('data-stale')

    wrapper.unmount()
  })

  it('sanitizes React rendered SVG even when Mermaid securityLevel is loose', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const bindFunctions = vi.fn()
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async () => ({
        svg: unsafeMermaidSvg,
        bindFunctions,
      })),
    }

    vi.doMock('../../packages/markstream-react/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    const getMermaid = vi.fn(async () => fakeMermaid)
    vi.doMock('../../packages/markstream-react/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid,
    }))

    const { MermaidBlockNode } = await import('../../packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(MermaidBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
        },
        loading: false,
        isStrict: false,
      }))
    })
    await flushReactUpdates()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    await flushReactUpdates()

    expect(getMermaid).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: 'loose',
    }))
    expectSanitizedMermaidHtml(host.innerHTML)
    expect(bindFunctions).not.toHaveBeenCalled()

    await act(async () => {
      root.unmount()
    })
  })

  it('calls React Mermaid bindFunctions only when interactions are enabled', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const bindFunctions = vi.fn()
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async () => ({
        svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
        bindFunctions,
      })),
    }

    vi.doMock('../../packages/markstream-react/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../../packages/markstream-react/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))

    const { MermaidBlockNode } = await import('../../packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(MermaidBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
        },
        loading: false,
        enableMermaidInteractions: true,
      }))
    })
    await flushReactUpdates()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    await flushReactUpdates()

    expect(bindFunctions).toHaveBeenCalledTimes(1)
    expect(bindFunctions.mock.calls[0]?.[0]).toBeInstanceOf(HTMLElement)

    await act(async () => {
      findButtonBySvgPath(host, 'M15 3h6v6')?.click()
    })
    await flushReactUpdates()

    expect(bindFunctions).toHaveBeenCalledTimes(2)
    const modalTarget = bindFunctions.mock.calls[1]?.[0] as HTMLElement | undefined
    expect(modalTarget).toBeInstanceOf(HTMLElement)
    expect(modalTarget?.classList.contains('mermaid-modal-content')).toBe(true)

    await act(async () => {
      root.unmount()
    })
  })

  it('rebinds React Mermaid functions when restoring cached preview SVG', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const bindFunctions = vi.fn()
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async () => ({
        svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
        bindFunctions,
      })),
    }

    vi.doMock('../../packages/markstream-react/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../../packages/markstream-react/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))

    const { MermaidBlockNode } = await import('../../packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(MermaidBlockNode as any, {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
        },
        loading: false,
        enableMermaidInteractions: true,
      }))
    })
    await flushReactUpdates()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    await flushReactUpdates()

    expect(bindFunctions).toHaveBeenCalledTimes(1)

    await act(async () => {
      findButtonByText(host, 'Source')?.click()
    })
    await flushReactUpdates()

    await act(async () => {
      findButtonByText(host, 'Preview')?.click()
    })
    await flushReactUpdates()

    expect(bindFunctions).toHaveBeenCalledTimes(2)
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.unmount()
    })
  })

  it('gates Mermaid bindFunctions in static Svelte and Angular HTML enhancers', { timeout: 10000 }, async () => {
    const bindFunctions = vi.fn()
    const fakeMermaid = {
      render: vi.fn(async () => ({
        svg: unsafeMermaidSvg,
        bindFunctions,
      })),
    }
    const workerMock = {
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
    }

    vi.doMock('../../packages/markstream-svelte/src/optional/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))
    vi.doMock('../../packages/markstream-svelte/src/workers/mermaidWorkerClient', () => workerMock)
    vi.doMock('../../packages/markstream-angular/src/optional/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))
    vi.doMock('../../packages/markstream-angular/src/workers/mermaidWorkerClient', () => workerMock)

    const { enhanceRenderedHtml: enhanceSvelteHtml } = await import('../../packages/markstream-svelte/src/enhanceRenderedHtml')
    const { enhanceRenderedHtml: enhanceAngularHtml } = await import('../../packages/markstream-angular/src/enhanceRenderedHtml')
    const enhancers = [enhanceSvelteHtml, enhanceAngularHtml]

    for (const enhance of enhancers) {
      const root = document.createElement('div')
      root.innerHTML = '<pre><code class="language-mermaid">flowchart TD\nA-->B</code></pre>'
      await enhance(root, { final: true })
      expectSanitizedMermaidHtml(root.innerHTML)
    }
    expect(bindFunctions).not.toHaveBeenCalled()

    for (const enhance of enhancers) {
      const root = document.createElement('div')
      root.innerHTML = '<pre><code class="language-mermaid">flowchart TD\nA-->B</code></pre>'
      await enhance(root, {
        final: true,
        mermaidProps: { enableMermaidInteractions: true },
      })
      expectSanitizedMermaidHtml(root.innerHTML)
    }
    expect(bindFunctions).toHaveBeenCalledTimes(enhancers.length)
  })

  it('sanitizes Vue 2 rendered SVG even when Mermaid securityLevel is loose', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const bindFunctions = vi.fn()
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: unsafeMermaidSvg,
        bindFunctions,
      })),
    }

    vi.doMock('../../packages/markstream-vue2/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../../packages/markstream-vue2/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))

    const MermaidBlockNode = (await import('../../packages/markstream-vue2/src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
        },
        loading: false,
        isStrict: false,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    ;(wrapper.vm as any).viewportReady = true
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await flushVueUpdates()

    expect(fakeMermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: 'loose',
    }))
    expectSanitizedMermaidHtml(wrapper.get('div._mermaid').html())
    expect(bindFunctions).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('calls Vue 2 Mermaid bindFunctions only when interactions are enabled', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const bindFunctions = vi.fn()
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
        bindFunctions,
      })),
    }

    vi.doMock('../../packages/markstream-vue2/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../../packages/markstream-vue2/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))

    const MermaidBlockNode = (await import('../../packages/markstream-vue2/src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
        },
        loading: false,
        enableMermaidInteractions: true,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    ;(wrapper.vm as any).viewportReady = true
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await flushVueUpdates()

    expect(bindFunctions).toHaveBeenCalledTimes(1)
    expect(bindFunctions.mock.calls[0]?.[0]).toBeInstanceOf(HTMLElement)

    wrapper.unmount()
  })

  it('rebinds Vue 2 Mermaid functions when restoring cached preview SVG', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const bindFunctions = vi.fn()
    const fakeMermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
        bindFunctions,
      })),
    }

    vi.doMock('../../packages/markstream-vue2/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../../packages/markstream-vue2/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))

    const MermaidBlockNode = (await import('../../packages/markstream-vue2/src/components/MermaidBlockNode/MermaidBlockNode.vue')).default
    const wrapper = mount(MermaidBlockNode as any, {
      props: {
        node: {
          type: 'code_block',
          language: 'mermaid',
          code: 'flowchart TD\nA-->B\n',
          raw: '```mermaid\nflowchart TD\nA-->B\n```',
        },
        loading: false,
        enableMermaidInteractions: true,
      },
    })

    await flushVueUpdates()
    ;(wrapper.vm as any).mermaidAvailable = true
    ;(wrapper.vm as any).showSource = false
    ;(wrapper.vm as any).viewportReady = true
    await flushVueUpdates()
    await vi.advanceTimersByTimeAsync(5000)
    await flushVueUpdates()

    expect(bindFunctions).toHaveBeenCalledTimes(1)

    ;(wrapper.vm as any).showSource = true
    await flushVueUpdates()
    ;(wrapper.vm as any).showSource = false
    await flushVueUpdates()

    expect(bindFunctions).toHaveBeenCalledTimes(2)
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })
})
