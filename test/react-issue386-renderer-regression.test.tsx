/**
 * @vitest-environment jsdom
 */

import katex from 'katex'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents, withMarkstreamComponentDisplay } from '../packages/markstream-react/src/customComponents'
import { NodeRenderer as ServerNodeRenderer } from '../packages/markstream-react/src/server'
import { clearKaTeXCache, clearKaTeXWorker, setKaTeXWorker } from '../packages/markstream-react/src/workers/katexWorkerClient'

const REAL_WORLD_MULTILINE_INPUT = `$2.897771955 times 10^{-3}text{m·K}$^[1]^
测试<sup>[3]</sup>。
$x$^[1]^
$x$ ^[1]^
测试^[1]^
$2.897771955 \\times 10^{-3}\\text{m·K}$^[1]^
<sup>[1]</sup>
测试<sup>[12]</sup>结束
A<sup>[3]</sup>B
$x$^[1]^
测试^[1]^
<sup>[3]</sup>
测试<sup>[12]</sup>结束`

class FakeKaTeXWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null

  postMessage(data: { id: string, content: string, displayMode: boolean }) {
    queueMicrotask(() => {
      try {
        const html = katex.renderToString(data.content, {
          throwOnError: false,
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

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function renderMarkdown(content: string, extraProps: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)

  const rerender = async (nextContent: string, nextProps: Record<string, unknown> = {}) => {
    await act(async () => {
      root.render(React.createElement(NodeRenderer as any, {
        content: nextContent,
        viewportPriority: false,
        deferNodesUntilVisible: false,
        maxLiveNodes: 0,
        smoothStreaming: false,
        ...extraProps,
        ...nextProps,
      }))
    })
    await flushReact()
  }

  await rerender(content)

  return {
    host,
    rerender,
    unmount: async () => {
      await act(async () => {
        root.unmount()
      })
    },
  }
}

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  setKaTeXWorker(new FakeKaTeXWorker() as unknown as Worker)
})

afterEach(() => {
  clearKaTeXWorker()
  clearKaTeXCache()
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react issue #386 renderer regressions', () => {
  it('renders bracketed superscript syntax from markdown content', async () => {
    const view = await renderMarkdown('测试^[1]^')

    expect(view.host.querySelector('sup.superscript-node')?.textContent).toBe('[1]')
    expect(view.host.textContent).not.toContain('^[1]^')

    await view.unmount()
  })

  it('renders superscript syntax immediately after inline math', async () => {
    const view = await renderMarkdown('$x$^[1]^')

    expect(view.host.querySelector('.katex')).toBeTruthy()
    expect(view.host.querySelector('sup.superscript-node')?.textContent).toBe('[1]')
    expect(view.host.textContent).not.toContain('^[1]^')

    await view.unmount()
  })

  it('renders superscript syntax after inline math even with separating whitespace', async () => {
    const view = await renderMarkdown('$x$ ^[1]^')

    expect(view.host.querySelector('.katex')).toBeTruthy()
    expect(view.host.querySelector('sup.superscript-node')?.textContent).toBe('[1]')
    expect(view.host.textContent).not.toContain('^[1]^')

    await view.unmount()
  })

  it('preserves brackets inside standard inline html tags', async () => {
    const view = await renderMarkdown('测试<sup>[3]</sup>。')

    expect(view.host.querySelector('.html-inline-node sup')?.textContent).toBe('[3]')
    expect(view.host.querySelectorAll('p.paragraph-node')).toHaveLength(1)
    expect(view.host.querySelector('p.paragraph-node .html-inline-node sup')?.textContent).toBe('[3]')
    expect(view.host.querySelector('p.paragraph-node')?.textContent).toBe('测试[3]。')

    await view.unmount()
  })

  it('keeps inline html embedded in the same paragraph on the client', async () => {
    const view = await renderMarkdown('A<sup>[3]</sup>B')

    expect(view.host.querySelectorAll('p.paragraph-node')).toHaveLength(1)
    expect(view.host.querySelector('p.paragraph-node .html-inline-node sup')?.textContent).toBe('[3]')
    expect(view.host.querySelector('p.paragraph-node')?.textContent).toBe('A[3]B')

    await view.unmount()
  })

  it('keeps inline html embedded in the same paragraph during SSR', () => {
    const html = renderToStaticMarkup(React.createElement(ServerNodeRenderer as any, {
      content: 'A<sup>[3]</sup>B',
      typewriter: false,
    }))

    expect(html).toContain('<p')
    expect(html).toContain('A')
    expect(html).toContain('<sup>[3]</sup>')
    expect(html).toContain('B')
    expect(html).not.toContain('</p><span class="html-inline-node"')
    expect(html).not.toContain('</sup></div></div></div><div class="node-slot"')
  })

  it('recovers incomplete inline html during streaming updates without breaking the paragraph', async () => {
    const view = await renderMarkdown('A<sup>[3]', { final: false })

    expect(view.host.querySelectorAll('p.paragraph-node')).toHaveLength(1)
    expect(view.host.querySelector('p.paragraph-node .html-inline-node sup')?.textContent).toBe('[3]')
    expect(view.host.querySelector('p.paragraph-node')?.textContent).toBe('A[3]')
    expect(view.host.textContent).not.toContain('<sup>[3]')

    await view.rerender('A<sup>[3]</sup>B', { final: false })

    expect(view.host.querySelectorAll('p.paragraph-node')).toHaveLength(1)
    expect(view.host.querySelector('p.paragraph-node .html-inline-node sup')?.textContent).toBe('[3]')
    expect(view.host.querySelector('p.paragraph-node')?.textContent).toBe('A[3]B')
    expect(view.host.textContent).not.toContain('<sup>[3]')

    await view.unmount()
  })

  it('keeps whitelisted custom inline tags embedded in the same paragraph', async () => {
    const scopeId = 'react-inline-ref-regression'
    const InlineRef: React.FC<{ node: { content?: string } }> = ({ node }) => (
      <sup className="inline-ref-node">{node.content || ''}</sup>
    )
    setCustomComponents(scopeId, { 'inline-ref': InlineRef })

    try {
      const view = await renderMarkdown('A<inline-ref>[7]</inline-ref>B', {
        customId: scopeId,
        customHtmlTags: ['inline-ref'],
        final: true,
      })

      expect(view.host.querySelectorAll('p.paragraph-node')).toHaveLength(1)
      expect(view.host.querySelector('p.paragraph-node .inline-ref-node')?.textContent).toBe('[7]')
      expect(view.host.querySelector('p.paragraph-node')?.textContent).toBe('A[7]B')

      await view.unmount()
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('keeps whitelisted custom inline tags embedded in the same paragraph during SSR', () => {
    const scopeId = 'react-inline-ref-ssr-regression'
    const InlineRef: React.FC<{ node: { content?: string } }> = ({ node }) => (
      <sup className="inline-ref-node">{node.content || ''}</sup>
    )
    setCustomComponents(scopeId, { 'inline-ref': InlineRef })

    try {
      const html = renderToStaticMarkup(React.createElement(ServerNodeRenderer as any, {
        content: 'A<inline-ref>[7]</inline-ref>B',
        customId: scopeId,
        customHtmlTags: ['inline-ref'],
        typewriter: false,
      }))

      expect(html).toContain('<p')
      expect(html).toContain('A')
      expect(html).toContain('<sup class="inline-ref-node">[7]</sup>')
      expect(html).toContain('B')
      expect(html).not.toContain('</p><sup class="inline-ref-node">[7]</sup>')
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('lets block-marked custom html tags break out of paragraph wrappers on the client', async () => {
    const scopeId = 'react-blockish-inline-tag-client'
    const BlockRef = withMarkstreamComponentDisplay(({ node }: { node: { content?: string } }) => (
      <div className="block-ref-node">{node.content || ''}</div>
    ), 'block')

    setCustomComponents(scopeId, { 'inline-ref': BlockRef })

    try {
      const view = await renderMarkdown('A<inline-ref>[7]</inline-ref>B', {
        customId: scopeId,
        customHtmlTags: ['inline-ref'],
        final: true,
      })

      expect(view.host.querySelectorAll('p.paragraph-node')).toHaveLength(2)
      expect(view.host.querySelector('p.paragraph-node')?.textContent).toBe('A')
      expect(view.host.querySelector('.block-ref-node')?.textContent).toBe('[7]')
      expect(Array.from(view.host.querySelectorAll('p.paragraph-node')).at(1)?.textContent).toBe('B')
      expect(view.host.innerHTML).not.toContain('<p dir="auto" class="paragraph-node">A<div')

      await view.unmount()
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('lets block-marked custom html tags break out of paragraph wrappers during SSR', () => {
    const scopeId = 'react-blockish-inline-tag-ssr'
    const BlockRef = withMarkstreamComponentDisplay(({ node }: { node: { content?: string } }) => (
      <div className="block-ref-node">{node.content || ''}</div>
    ), 'block')

    setCustomComponents(scopeId, { 'inline-ref': BlockRef })

    try {
      const html = renderToStaticMarkup(React.createElement(ServerNodeRenderer as any, {
        content: 'A<inline-ref>[7]</inline-ref>B',
        customId: scopeId,
        customHtmlTags: ['inline-ref'],
        typewriter: false,
      }))

      expect(html).toContain('<div class="block-ref-node">[7]</div>')
      expect(html).not.toContain('<p dir="auto" class="paragraph-node">A<div class="block-ref-node">[7]</div>B</p>')
      expect(html).toContain('<p dir="auto" class="paragraph-node"><span class="text-node whitespace-pre-wrap break-words">A</span></p>')
      expect(html).toContain('<p dir="auto" class="paragraph-node"><span class="text-node whitespace-pre-wrap break-words">B</span></p>')
    }
    finally {
      removeCustomComponents(scopeId)
    }
  })

  it('renders the real multiline issue-386 input in streaming mode without leaking raw superscript syntax', async () => {
    const view = await renderMarkdown(REAL_WORLD_MULTILINE_INPUT, { final: false })

    const superscripts = Array.from(view.host.querySelectorAll('sup.superscript-node')).map(node => node.textContent)
    const inlineHtmlSup = Array.from(view.host.querySelectorAll('.html-inline-node sup')).map(node => node.textContent)

    expect(view.host.querySelector('.katex')).toBeTruthy()
    expect(superscripts).toEqual(['[1]', '[1]', '[1]', '[1]', '[1]', '[1]', '[1]'])
    expect(inlineHtmlSup).toEqual(['[3]', '[1]', '[12]', '[3]', '[3]', '[12]'])
    expect(view.host.textContent).not.toContain('^[1]^')

    await view.unmount()
  })
})
