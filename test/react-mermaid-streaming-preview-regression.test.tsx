import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function settleReact(turns = 6) {
  for (let index = 0; index < turns; index++)
    await flushReact()
}

function createNode(code: string) {
  return {
    type: 'code_block',
    language: 'mermaid',
    code,
    raw: `\`\`\`mermaid\n${code}\`\`\``,
  }
}

function findButtonByText(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll('button')).find(button => button.textContent?.includes(text)) as HTMLButtonElement | undefined
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react mermaid streaming preview regression', () => {
  it('does not render gantt preview before the first complete task line', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const canParseOffthread = vi.fn(async () => true)
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async () => ({
        svg: '<svg data-rendered="gantt" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>',
        bindFunctions: vi.fn(),
      })),
    }

    vi.doMock('../packages/markstream-react/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../packages/markstream-react/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))

    const { MermaidBlockNode } = await import('../packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(MermaidBlockNode as any, {
        node: createNode('gantt\nsection A section\n'),
        loading: true,
      }))
    })
    await settleReact()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    await settleReact()

    expect(canParseOffthread).not.toHaveBeenCalled()
    expect(fakeMermaid.render).not.toHaveBeenCalled()
    expect(host.querySelector('svg[data-rendered]')).toBeFalsy()

    await act(async () => {
      root.unmount()
    })
  })

  it('keeps gantt progressive preview by rendering the last safe task prefix', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const canParseOffthread = vi.fn(async () => true)
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async () => true),
      render: vi.fn(async (_id: string, code: string) => ({
        svg: `<svg data-rendered="${code.includes('Active task') ? 'unsafe' : 'prefix'}" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>`,
        bindFunctions: vi.fn(),
      })),
    }

    vi.doMock('../packages/markstream-react/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread: vi.fn(async () => null),
      terminateWorker: vi.fn(),
    }))
    vi.doMock('../packages/markstream-react/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid: vi.fn(async () => fakeMermaid),
    }))

    const { MermaidBlockNode } = await import('../packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(MermaidBlockNode as any, {
        node: createNode('gantt\nsection A section\nCompleted task :done, des1, 2014-01-06,2014-01-08\nActive task'),
        loading: true,
      }))
    })
    await settleReact()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    await settleReact()

    expect(canParseOffthread).toHaveBeenCalled()
    expect(canParseOffthread).not.toHaveBeenCalledWith(expect.stringContaining('Active task'), expect.anything(), expect.anything())
    expect(fakeMermaid.render).toHaveBeenCalled()
    expect(fakeMermaid.render.mock.calls[0]?.[1]).toContain('Completed task')
    expect(fakeMermaid.render.mock.calls[0]?.[1]).not.toContain('Active task')
    expect(host.querySelector('svg[data-rendered="prefix"]')).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
  })

  it('renders a prefix preview when switching back to preview mid-stream', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.stubGlobal('IntersectionObserver', undefined as any)

    const canParseOffthread = vi.fn(async (code: string) => !code.includes('B-->C'))
    const findPrefixOffthread = vi.fn(async () => 'graph LR\nA-->B\n')
    const fakeMermaid = {
      initialize: vi.fn(),
      parse: vi.fn(async (code: string) => {
        if (code.includes('B-->C'))
          throw new Error('Incomplete mermaid graph')
        return true
      }),
      render: vi.fn(async (_id: string, code: string) => ({
        svg: `<svg data-rendered="${code.includes('B-->C') ? 'full' : 'prefix'}" viewBox="0 0 10 10"><rect width="1" height="1" /></svg>`,
        bindFunctions: vi.fn(),
      })),
    }

    vi.doMock('../packages/markstream-react/src/workers/mermaidWorkerClient', () => ({
      canParseOffthread,
      findPrefixOffthread,
      terminateWorker: vi.fn(),
    }))
    const getMermaid = vi.fn(async () => fakeMermaid)
    vi.doMock('../packages/markstream-react/src/components/MermaidBlockNode/mermaid', () => ({
      getMermaid,
    }))

    const { MermaidBlockNode } = await import('../packages/markstream-react/src/components/MermaidBlockNode/MermaidBlockNode')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(MermaidBlockNode as any, {
        node: createNode('graph LR\nA-->B\n'),
        loading: true,
      }))
    })
    await settleReact()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    await settleReact()

    const sourceButton = findButtonByText(host, 'Source')
    expect(sourceButton).toBeTruthy()

    await act(async () => {
      sourceButton?.click()
    })
    await settleReact()

    fakeMermaid.render.mockClear()
    canParseOffthread.mockClear()
    findPrefixOffthread.mockClear()

    await act(async () => {
      root.render(React.createElement(MermaidBlockNode as any, {
        node: createNode('graph LR\nA-->B\nB-->C\n'),
        loading: true,
      }))
    })
    await settleReact()

    const previewButton = findButtonByText(host, 'Preview')
    expect(previewButton).toBeTruthy()

    await act(async () => {
      previewButton?.click()
    })
    await settleReact()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    await settleReact()

    expect(canParseOffthread).toHaveBeenCalled()
    expect(findPrefixOffthread).toHaveBeenCalled()
    expect(getMermaid).toHaveBeenCalled()
    expect(fakeMermaid.render).toHaveBeenCalledTimes(1)
    expect(fakeMermaid.render.mock.calls[0]?.[1]).toContain('A-->B')
    expect(fakeMermaid.render.mock.calls[0]?.[1]).not.toContain('B-->C')
    expect(host.querySelector('svg[data-rendered="prefix"]')).toBeTruthy()

    await act(async () => {
      root.unmount()
    })
  })
})
