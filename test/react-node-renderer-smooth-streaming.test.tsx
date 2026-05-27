/**
 * @vitest-environment jsdom
 */

import React, { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as parser from 'stream-markdown-parser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { SmoothStreamingContext } from '../packages/markstream-react/src/context/smoothStreaming'

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('react node renderer smooth streaming', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
    vi.unstubAllGlobals()
  })

  it('smooths post-mount appends by default and allows opting out', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const content = 'Hello smooth streaming markdown renderer.'
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderMarkdown = (props: Record<string, unknown>) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, props))

    await act(async () => {
      root.render(renderMarkdown({
        content: '',
        typewriter: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown({
        content,
        typewriter: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))
    })
    await flushReact()

    expect(host.textContent).not.toContain(content)

    const rawHost = document.createElement('div')
    document.body.appendChild(rawHost)
    const rawRoot = createRoot(rawHost)

    await act(async () => {
      rawRoot.render(renderMarkdown({
        content: '',
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))
    })
    await flushReact()

    await act(async () => {
      rawRoot.render(renderMarkdown({
        content,
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))
    })
    await flushReact()

    expect(rawHost.textContent).toContain(content)

    await act(async () => {
      root.unmount()
      rawRoot.unmount()
    })
  })

  it('renders initial static content immediately', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: 'static markdown',
          typewriter: true,
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        })),
      )
    })
    await flushReact()

    expect(host.textContent).toContain('static markdown')

    await act(async () => {
      root.unmount()
    })
  })

  it('forces pacing in smoothStreaming=true mode even without typewriter', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        typewriter: false,
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))

    await act(async () => {
      root.render(renderMarkdown(''))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown('Force enabled smooth'))
    })
    await flushReact()

    expect(host.textContent).not.toContain('Force enabled smooth')

    await act(async () => {
      root.unmount()
    })
  })

  it('keeps auto mode off when typewriter is disabled', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: 'Auto mode test',
          typewriter: false,
          smoothStreaming: 'auto',
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        })),
      )
    })
    await flushReact()

    expect(host.textContent).toContain('Auto mode test')

    await act(async () => {
      root.unmount()
    })
  })

  it('smoothStreaming=true paces initial client content', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        typewriter: false,
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))

    // Mount with initial content and smoothStreaming=true should pace it
    await act(async () => {
      root.render(renderMarkdown('Initial force paced content'))
    })
    await flushReact()

    // With smoothStreaming=true, even initial content should be paced, not immediately visible
    expect(host.textContent).not.toContain('Initial force paced content')

    await act(async () => {
      root.unmount()
    })
  })

  it('does not smooth nodes mode and suppresses nested auto pacing', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const nodes = [{ type: 'text', content: 'Node mode', raw: 'Node mode' }]

    await act(async () => {
      root.render(React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, { nodes, typewriter: true, smoothStreaming: true, batchRendering: false, viewportPriority: false, deferNodesUntilVisible: false })))
    })
    await flushReact()

    expect(host.textContent).toContain('Node mode')

    const nestedHost = document.createElement('div')
    document.body.appendChild(nestedHost)
    const nestedRoot = createRoot(nestedHost)

    await act(async () => {
      nestedRoot.render(React.createElement(StrictMode, null, React.createElement(SmoothStreamingContext.Provider, { value: true }, React.createElement(NodeRenderer as any, { content: '', typewriter: true, batchRendering: false, viewportPriority: false, deferNodesUntilVisible: false }))))
    })
    await flushReact()

    await act(async () => {
      nestedRoot.render(React.createElement(StrictMode, null, React.createElement(SmoothStreamingContext.Provider, { value: true }, React.createElement(NodeRenderer as any, { content: 'Nested auto content', typewriter: true, batchRendering: false, viewportPriority: false, deferNodesUntilVisible: false }))))
    })
    await flushReact()

    expect(nestedHost.textContent).toContain('Nested auto content')

    await act(async () => {
      root.unmount()
      nestedRoot.unmount()
    })
  })

  it('renders initial content immediately on client hydration', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: 'initial hydration content',
          typewriter: true,
          smoothStreaming: 'auto',
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        })),
      )
    })
    await flushReact()

    expect(host.textContent).toContain('initial hydration content')

    await act(async () => {
      root.unmount()
    })
  })

  it('does not duplicate source when raw content updates rapidly', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        typewriter: true,
        smoothStreaming: false,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))

    await act(async () => {
      root.render(renderMarkdown(''))
    })
    await flushReact()

    // First update
    await act(async () => {
      root.render(renderMarkdown('abc'))
    })
    await flushReact()

    // Rapid second update before visible fully catches up
    await act(async () => {
      root.render(renderMarkdown('abcdef'))
    })
    await flushReact()

    // Final text should be correct without duplication
    // (this verifies source is correctly updated on rapid updates)
    expect(host.textContent).toContain('abcdef')
    expect(host.textContent).not.toContain('abcabcdef')

    await act(async () => {
      root.unmount()
    })
  })

  it('does not duplicate source when smooth content updates rapidly before visible catches up', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        typewriter: true,
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))

    await act(async () => {
      root.render(renderMarkdown(''))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown('abc'))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown('abcdef'))
    })
    await flushReact()

    await act(async () => {
      await vi.runAllTimersAsync()
    })
    await flushReact()

    expect(host.textContent).toContain('abcdef')
    expect(host.textContent).not.toContain('abcabcdef')

    await act(async () => {
      root.unmount()
    })
    vi.useRealTimers()
  })

  it('gates final to caughtUp when smooth streaming is enabled', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    const parseSpy = vi.spyOn(parser, 'parseMarkdownToStructure')

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderMarkdown = (content: string, final: boolean) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        typewriter: true,
        smoothStreaming: true,
        final,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))

    await act(async () => {
      root.render(renderMarkdown('seed', false))
    })
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    await flushReact()
    parseSpy.mockClear()

    await act(async () => {
      root.render(renderMarkdown('seed plus tail', true))
    })
    await flushReact()

    const callsBeforeCatchup = parseSpy.mock.calls
      .map(call => call[2] as { final?: boolean } | undefined)
      .filter(options => options && typeof options.final === 'boolean')
    expect(callsBeforeCatchup.some(options => options?.final === true)).toBe(false)

    await act(async () => {
      await vi.runAllTimersAsync()
    })
    await flushReact()
    await act(async () => {
      root.render(renderMarkdown('seed plus tail', true))
    })
    await flushReact()

    const callsAfterCatchup = parseSpy.mock.calls
      .map(call => call[2] as { final?: boolean } | undefined)
      .filter(options => options && typeof options.final === 'boolean')
    expect(callsAfterCatchup.some(options => options?.final === true)).toBe(true)

    await act(async () => {
      root.unmount()
    })
    parseSpy.mockRestore()
    vi.useRealTimers()
  })

  it('auto enables smooth streaming when maxLiveNodes <= 0 even if typewriter is false', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        typewriter: false,
        maxLiveNodes: 0,
        smoothStreaming: 'auto',
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))

    await act(async () => {
      root.render(renderMarkdown(''))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown('Should pace even without typewriter'))
    })
    await flushReact()

    // With maxLiveNodes=0 and typewriter=false, auto should still enable smooth streaming
    // so content should be paced and not immediately visible
    expect(host.textContent).not.toContain('Should pace even without typewriter')

    await act(async () => {
      root.unmount()
    })
  })

  it('eventually reveals paced content after timers advance', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const content = 'Eventually revealed smooth streaming content'

    const renderMarkdown = (props: Record<string, unknown>) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, props))

    // Mount empty
    await act(async () => {
      root.render(renderMarkdown({
        content: '',
        typewriter: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))
    })
    await flushReact()

    // Update with content; should be paced, not immediate
    await act(async () => {
      root.render(renderMarkdown({
        content,
        typewriter: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))
    })
    await flushReact()

    expect(host.textContent).not.toContain(content)

    // Run all timers to let pacing complete
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    await flushReact()

    // After all timers, content should be fully revealed
    expect(host.textContent).toContain(content)

    await act(async () => {
      root.unmount()
    })
    vi.useRealTimers()
  })

  it('strictMode smoothStreaming=true initial content eventually reveals', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const initialContent = 'StrictMode initial force paced content'

    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        typewriter: false,
        smoothStreaming: true,
        batchRendering: false,
        viewportPriority: false,
        deferNodesUntilVisible: false,
      }))

    // Mount with initial content and smoothStreaming=true in StrictMode
    // StrictMode will replay effects, but controller should survive and continue pacing
    await act(async () => {
      root.render(renderMarkdown(initialContent))
    })
    await flushReact()

    // Initial content should be paced, not immediately visible
    expect(host.textContent).not.toContain(initialContent)

    // Run all timers to let pacing complete
    await act(async () => {
      await vi.runAllTimersAsync()
    })
    await flushReact()

    // After all timers, initial content should be fully revealed
    // This verifies controller survived StrictMode effect replay
    expect(host.textContent).toContain(initialContent)

    await act(async () => {
      root.unmount()
    })
    vi.useRealTimers()
  })
})
