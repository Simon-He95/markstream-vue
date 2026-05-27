/**
 * @vitest-environment jsdom
 */

import React, { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { LinkNode } from '../packages/markstream-react/src/components/LinkNode/LinkNode'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { TextNode } from '../packages/markstream-react/src/components/TextNode/TextNode'

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react text streaming fade', () => {
  it('keeps only the latest appended suffix animating during rapid streaming updates, like vue3', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const textStreamState = new Map<string, string>()
    const renderText = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(TextNode as any, {
        node: {
          type: 'text',
          content,
        },
        ctx: {
          typewriter: true,
          textStreamState,
        },
        indexKey: 'stream-0',
      }))

    await act(async () => {
      root.render(renderText('Hello'))
    })
    await flushReact()

    expect(host.textContent).toBe('Hello')
    expect(host.querySelectorAll('.text-node-stream-delta')).toHaveLength(0)

    await act(async () => {
      root.render(renderText('HelloWorld'))
    })
    await flushReact()

    let deltas = Array.from(host.querySelectorAll('.text-node-stream-delta'))
    expect(deltas).toHaveLength(1)
    expect(deltas.map(delta => delta.textContent)).toEqual(['World'])
    expect(host.textContent).toBe('HelloWorld')

    await act(async () => {
      root.render(renderText('HelloWorld'))
    })
    await flushReact()

    deltas = Array.from(host.querySelectorAll('.text-node-stream-delta'))
    expect(deltas).toHaveLength(1)
    expect(deltas.map(delta => delta.textContent)).toEqual(['World'])

    await act(async () => {
      root.render(renderText('HelloWorldAgain'))
    })
    await flushReact()

    deltas = Array.from(host.querySelectorAll('.text-node-stream-delta'))
    expect(deltas).toHaveLength(1)
    expect(deltas.map(delta => delta.textContent)).toEqual(['Again'])
    expect(host.textContent).toBe('HelloWorldAgain')

    await act(async () => {
      deltas[0]?.dispatchEvent(new Event('animationend', { bubbles: true }))
    })
    await flushReact()

    expect(host.querySelectorAll('.text-node-stream-delta')).toHaveLength(0)
    expect(host.textContent).toBe('HelloWorldAgain')

    await act(async () => {
      root.unmount()
    })
  })

  it('preserves appended-text fade spans through the full NodeRenderer streaming path', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        deferNodesUntilVisible: false,
        viewportPriority: false,
        smoothStreaming: false,
      }))

    await act(async () => {
      root.render(renderMarkdown('Hello'))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown('HelloWorld'))
    })
    await flushReact()

    let deltas = Array.from(host.querySelectorAll('.text-node-stream-delta'))
    expect(deltas).toHaveLength(1)
    expect(deltas.map(delta => delta.textContent)).toEqual(['World'])
    expect(host.textContent).toContain('HelloWorld')

    await act(async () => {
      root.render(renderMarkdown('HelloWorldAgain'))
    })
    await flushReact()

    deltas = Array.from(host.querySelectorAll('.text-node-stream-delta'))
    expect(deltas).toHaveLength(1)
    expect(deltas.map(delta => delta.textContent)).toEqual(['Again'])
    expect(host.textContent).toContain('HelloWorldAgain')

    await act(async () => {
      root.unmount()
    })
  })

  it('settles a finished strong-node delta when following sibling text keeps streaming', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        batchRendering: false,
        deferNodesUntilVisible: false,
        viewportPriority: false,
        maxLiveNodes: 0,
        smoothStreaming: false,
      }))

    await act(async () => {
      root.render(renderMarkdown('1. **记忆化递归（动态规划'))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown('1. **记忆化递归（动态规划）*'))
    })
    await flushReact()

    let strongDelta = host.querySelector('.strong-node .text-node-stream-delta')
    expect(strongDelta?.textContent).toBe('）')

    await act(async () => {
      root.render(renderMarkdown('1. **记忆化递归（动态规划）**：'))
    })
    await flushReact()

    strongDelta = host.querySelector('.strong-node .text-node-stream-delta')
    expect(strongDelta).toBeNull()
    expect(host.querySelector('.strong-node')?.textContent).toBe('记忆化递归（动态规划）')

    await act(async () => {
      root.render(renderMarkdown('1. **记忆化递归（动态规划）**：使'))
    })
    await flushReact()

    expect(host.querySelector('.strong-node .text-node-stream-delta')).toBeNull()
    expect(host.textContent).toContain('记忆化递归（动态规划）：使')

    await act(async () => {
      root.unmount()
    })
  })

  it('replays appended-text fade inside heading nodes without fading the whole heading', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        deferNodesUntilVisible: false,
        viewportPriority: false,
        smoothStreaming: false,
      }))

    await act(async () => {
      root.render(renderMarkdown('# Hello'))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown('# HelloWorld'))
    })
    await flushReact()

    const heading = host.querySelector('h1')
    const deltas = Array.from(host.querySelectorAll('.text-node-stream-delta'))

    expect(heading).toBeTruthy()
    expect(deltas).toHaveLength(1)
    expect(deltas[0]?.textContent).toBe('World')
    expect(heading?.textContent).toBe('HelloWorld')

    await act(async () => {
      root.unmount()
    })
  })

  it('replays appended-text fade inside inline code nodes while preserving the code chip shell', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        deferNodesUntilVisible: false,
        viewportPriority: false,
        smoothStreaming: false,
      }))

    await act(async () => {
      root.render(renderMarkdown('Use `foo` now'))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown('Use `foobar` now'))
    })
    await flushReact()

    const inlineCode = host.querySelector('code.inline-code')
    const deltas = Array.from(host.querySelectorAll('code.inline-code .text-node-stream-delta'))

    expect(inlineCode).toBeTruthy()
    expect(deltas).toHaveLength(1)
    expect(deltas[0]?.textContent).toBe('bar')
    expect(inlineCode?.textContent).toBe('foobar')

    await act(async () => {
      root.unmount()
    })
  })

  it('replays appended-text fade while a loading link label grows', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const textStreamState = new Map<string, string>()
    const renderLink = (text: string) =>
      React.createElement(StrictMode, null, React.createElement(LinkNode as any, {
        node: {
          type: 'link',
          href: 'https://example.com',
          title: null,
          text,
          loading: true,
        },
        ctx: {
          typewriter: true,
          textStreamState,
        },
        indexKey: 'link-0',
      }))

    await act(async () => {
      root.render(renderLink('Exam'))
    })
    await flushReact()

    await act(async () => {
      root.render(renderLink('Example'))
    })
    await flushReact()

    const loading = host.querySelector('.link-loading')
    const deltas = Array.from(host.querySelectorAll('.link-loading .text-node-stream-delta'))

    expect(loading).toBeTruthy()
    expect(deltas).toHaveLength(1)
    expect(deltas[0]?.textContent).toBe('ple')
    expect(loading?.textContent).toContain('Example')

    await act(async () => {
      root.unmount()
    })
  })

  it('replays appended-text fade inside list items', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        deferNodesUntilVisible: false,
        viewportPriority: false,
        smoothStreaming: false,
      }))

    await act(async () => {
      root.render(renderMarkdown('- Hello'))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown('- HelloWorld'))
    })
    await flushReact()

    const listItem = host.querySelector('li.list-item')
    const deltas = Array.from(host.querySelectorAll('li.list-item .text-node-stream-delta'))

    expect(listItem).toBeTruthy()
    expect(deltas).toHaveLength(1)
    expect(deltas[0]?.textContent).toBe('World')
    expect(listItem?.textContent).toContain('HelloWorld')

    await act(async () => {
      root.unmount()
    })
  })

  it('keeps explanatory list text visible while an inline code span is still streaming', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    const initial = `- **计算工具验证**
   通过数学计算工具确认结果：`
    const mid = `${initial}
   \`363 ÷ 15,135 × 100 = 2.39841427...`
    const final = `${mid}\``
    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        batchRendering: false,
        deferNodesUntilVisible: false,
        viewportPriority: false,
        maxLiveNodes: 0,
        smoothStreaming: false,
      }))

    await act(async () => {
      root.render(renderMarkdown(initial))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown(mid))
    })
    await flushReact()

    const midText = String(host.textContent ?? '').replace(/\s*\n\s*/g, '')
    expect(midText).toContain('计算工具验证通过数学计算工具确认结果：363 ÷ 15,135 × 100 = 2.39841427')
    expect(host.querySelector('.strong-node')?.textContent).toBe('计算工具验证')
    expect(host.querySelector('code.inline-code')?.textContent).toContain('363 ÷ 15,135 × 100 = 2.39841427')

    await act(async () => {
      root.render(renderMarkdown(final))
    })
    await flushReact()

    const finalText = String(host.textContent ?? '').replace(/\s*\n\s*/g, '')
    expect(finalText).toContain('计算工具验证通过数学计算工具确认结果：363 ÷ 15,135 × 100 = 2.39841427...')
    expect(host.querySelector('.strong-node')?.textContent).toBe('计算工具验证')
    expect(host.querySelector('code.inline-code')?.textContent).toBe('363 ÷ 15,135 × 100 = 2.39841427...')

    await act(async () => {
      root.unmount()
    })
  })
})
