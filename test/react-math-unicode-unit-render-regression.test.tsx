import katex from 'katex'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

class FakeKaTeXWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  postMessage(data: { id: string, content: string, displayMode: boolean }) {
    queueMicrotask(() => {
      try {
        const html = katex.renderToString(data.content, {
          throwOnError: true,
          displayMode: data.displayMode,
          output: 'html',
          strict: 'ignore',
        })
        this.onmessage?.({
          data: {
            id: data.id,
            html,
            content: data.content,
            displayMode: data.displayMode,
          },
        } as MessageEvent)
      }
      catch (error: any) {
        this.onmessage?.({
          data: {
            id: data.id,
            error: error?.message || String(error),
            content: data.content,
            displayMode: data.displayMode,
          },
        } as MessageEvent)
      }
    })
  }

  terminate() {}
}

let katexWorkerClient: typeof import('../packages/markstream-react/src/workers/katexWorkerClient') | null = null

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

afterEach(() => {
  katexWorkerClient?.clearKaTeXWorker()
  katexWorkerClient?.clearKaTeXCache()
  katexWorkerClient = null
  vi.resetModules()
  document.body.innerHTML = ''
})

describe('markstream-react math unicode unit render regression', () => {
  it('renders inline formulas with unicode unit glyphs through the worker path', async () => {
    katexWorkerClient = await import('../packages/markstream-react/src/workers/katexWorkerClient')
    katexWorkerClient.setKaTeXWorker(new FakeKaTeXWorker() as unknown as Worker)
    const { MathInlineNode } = await import('../packages/markstream-react/src/components/Math/MathInlineNode')

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(MathInlineNode as any, {
        node: {
          type: 'math_inline',
          content: 'c=0.75\\times10^3\\ \\text{J/(kg·℃)}',
          raw: '$c=0.75\\times10^3\\ \\text{J/(kg·℃)}$',
          markup: '$',
          loading: false,
        },
      }))
    })
    await flushReact()

    expect(host.innerHTML).toContain('class="katex"')
    expect(host.textContent).not.toContain('$c=0.75\\times10^3\\ \\text{J/(kg·℃)}$')

    await act(async () => {
      root.unmount()
    })
  })

  it('renders block formulas with unicode unit glyphs through the worker path', async () => {
    katexWorkerClient = await import('../packages/markstream-react/src/workers/katexWorkerClient')
    katexWorkerClient.setKaTeXWorker(new FakeKaTeXWorker() as unknown as Worker)
    const { MathBlockNode } = await import('../packages/markstream-react/src/components/Math/MathBlockNode')

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(React.createElement(MathBlockNode as any, {
        node: {
          type: 'math_block',
          content: 'Q_1=0.75\\times10^3\\ \\text{J/(kg·℃)}\\times1.1\\ \\text{kg}\\times40℃=3.3\\times 10^{4}\\ \\text{J}',
          raw: '$$Q_1=0.75\\times10^3\\ \\text{J/(kg·℃)}\\times1.1\\ \\text{kg}\\times40℃=3.3\\times 10^{4}\\ \\text{J}$$',
          loading: false,
        },
      }))
    })
    await flushReact()

    expect(host.innerHTML).toContain('class="katex-display"')
    expect(host.textContent).not.toContain('$$Q_1=0.75\\times10^3\\ \\text{J/(kg·℃)}\\times1.1\\ \\text{kg}\\times40℃=3.3\\times 10^{4}\\ \\text{J}$$')

    await act(async () => {
      root.unmount()
    })
  })
})
