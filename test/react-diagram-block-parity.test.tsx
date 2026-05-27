import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  })
}

async function waitForSelector(host: HTMLElement, selector: string, timeout = 1000) {
  const start = Date.now()
  while (!host.querySelector(selector)) {
    if (Date.now() - start > timeout)
      throw new Error(`Timed out waiting for ${selector}`)
    await flushReact()
  }
}

function createNode(language: string, code: string) {
  return {
    type: 'code_block',
    language,
    code,
    raw: `\`\`\`${language}\n${code}\n\`\`\``,
  }
}

function findHeightElement(host: HTMLElement) {
  return Array.from(host.querySelectorAll('div')).find((node) => {
    const el = node as HTMLDivElement
    return !!el.style.height && !!el.querySelector('svg')
  }) as HTMLDivElement | undefined
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.resetModules()
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react diagram parity', () => {
  it('caps mermaid preview height unless maxHeight is none', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    vi.stubGlobal('IntersectionObserver', undefined as any)

    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async () => ({
        svg: '<svg viewBox="0 0 100 200"><rect width="1" height="1" /></svg>',
        bindFunctions: vi.fn(),
      })),
    }

    vi.doMock('../packages/markstream-react/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread: vi.fn(async () => true),
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../packages/markstream-react/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))

    const { MermaidBlockNode } = await import('../packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode')

    const renderWithMaxHeight = async (maxHeight: string) => {
      const host = document.createElement('div')
      document.body.appendChild(host)
      const root = createRoot(host)

      await act(async () => {
        root.render(React.createElement(MermaidBlockNode as any, {
          node: createNode('mermaid', 'graph LR\nA-->B'),
          loading: false,
          maxHeight,
          showHeader: false,
        }))
      })
      await waitForSelector(host, '[data-mermaid-wrapper] svg')
      await flushReact()

      const container = host.querySelector('[data-mermaid-wrapper]')?.parentElement as HTMLElement | null
      expect(container).toBeTruthy()

      return { container, root }
    }

    const capped = await renderWithMaxHeight('150px')
    expect(capped.container?.style.height).toBe('150px')
    await act(async () => {
      capped.root.unmount()
    })

    const uncapped = await renderWithMaxHeight('none')
    expect(uncapped.container?.style.height).toBe('200px')
    await act(async () => {
      uncapped.root.unmount()
    })
  })

  it('scales only the root d2 svg and does not pin preview height with stale min-heights', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    vi.doMock('../packages/markstream-react/src/components/D2BlockNode/d2', () => ({
      getD2: vi.fn(async () => class FakeD2 {
        async compile(code: string) {
          return {
            diagram: { code },
            renderOptions: {},
          }
        }

        async render() {
          return {
            svg: '<svg width="364" height="766" viewBox="0 0 364 766"><svg class="inner-diagram" width="364" height="766" viewBox="0 0 364 766"><rect width="100" height="100" /></svg></svg>',
          }
        }
      }),
    }))

    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      width: 500,
      height: 5079,
      top: 0,
      left: 0,
      bottom: 5079,
      right: 500,
      x: 0,
      y: 0,
      toJSON() {
        return {}
      },
    }) as DOMRect)

    const { D2BlockNode } = await import('../packages/markstream-react/src/components/D2BlockNode/D2BlockNode')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(D2BlockNode as any, {
        node: createNode('d2', 'a -> b'),
        loading: false,
        showHeader: false,
      }))
    })
    await waitForSelector(host, '.d2-svg svg')

    const svgMarkup = host.querySelector('.d2-svg')?.innerHTML || ''
    expect(svgMarkup.match(/markstream-d2-root-svg/g)?.length ?? 0).toBe(1)
    expect(host.querySelector('.d2-block-body')?.getAttribute('style') || '').not.toContain('5079')

    rectSpy.mockRestore()
    await act(async () => {
      root.unmount()
    })
  })

  it('uses maxHeight when measuring infographic preview height', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    vi.doMock('../packages/markstream-react/src/components/InfographicBlockNode/infographic', () => ({
      getInfographic: vi.fn(async () => class FakeInfographic {
        container: HTMLElement

        constructor(options: { container: HTMLElement }) {
          this.container = options.container
        }

        render() {
          Object.defineProperty(this.container, 'scrollHeight', {
            configurable: true,
            value: 900,
          })
          this.container.innerHTML = '<svg viewBox="0 0 100 200"></svg>'
        }

        destroy() {}
      }),
    }))

    const { InfographicBlockNode } = await import('../packages/markstream-react/src/components/InfographicBlockNode/InfographicBlockNode')

    const renderWithMaxHeight = async (maxHeight: string) => {
      const host = document.createElement('div')
      document.body.appendChild(host)
      const root = createRoot(host)

      await act(async () => {
        root.render(React.createElement(InfographicBlockNode as any, {
          node: createNode('infographic', 'infographic list-row-simple-horizontal-arrow'),
          loading: false,
          maxHeight,
          showHeader: false,
        }))
      })
      await waitForSelector(host, 'svg')
      await flushReact()

      const heightElement = findHeightElement(host)
      expect(heightElement).toBeTruthy()

      return { height: heightElement?.style.height, root }
    }

    const capped = await renderWithMaxHeight('500px')
    expect(capped.height).toBe('500px')
    await act(async () => {
      capped.root.unmount()
    })

    const uncapped = await renderWithMaxHeight('none')
    expect(uncapped.height).toBe('900px')
    await act(async () => {
      uncapped.root.unmount()
    })
  })
})
