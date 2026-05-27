/**
 * @vitest-environment jsdom
 */

import React, { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('react typewriter/fade separation', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
    vi.unstubAllGlobals()
  })

  it('typewriter defaults to false: no cursor span rendered', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: 'Hello world',
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        })),
      )
    })
    await flushReact()

    const cursor = host.querySelector('.typewriter-cursor')
    expect(cursor).toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('typewriter=true shows cursor span', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: 'Hello world',
          typewriter: true,
          final: false,
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        })),
      )
    })
    await flushReact()

    const cursor = host.querySelector('.typewriter-cursor')
    expect(cursor).not.toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('fade defaults to true: streamed delta fade still works without typewriter', async () => {
    // This is tested implicitly — fade=true by default means the TextNode
    // will still apply delta fade when content grows. We verify the prop
    // flows correctly by checking smooth streaming is NOT auto-enabled
    // by fade=true alone.
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        typewriter: false,
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
      root.render(renderMarkdown('Appended content'))
    })
    await flushReact()

    // With typewriter=false and default maxLiveNodes, auto mode should NOT
    // enable smooth streaming just because fade=true.
    // So content should appear immediately (not paced).
    expect(host.textContent).toContain('Appended content')

    await act(async () => {
      root.unmount()
    })
  })

  it('smoothStreaming=auto should NOT enable because fade=true (default)', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        typewriter: false,
        fade: true,
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
      root.render(renderMarkdown('Not paced by fade'))
    })
    await flushReact()

    // fade=true should NOT cause smooth streaming to auto-enable.
    // Content should appear immediately (not paced).
    expect(host.textContent).toContain('Not paced by fade')

    await act(async () => {
      root.unmount()
    })
  })

  it('typewriter=true auto-enables smooth streaming', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderMarkdown = (content: string) =>
      React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
        content,
        typewriter: true,
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
      root.render(renderMarkdown('Paced by typewriter'))
    })
    await flushReact()

    // typewriter=true should auto-enable smooth streaming.
    // Content should be paced (not immediately visible).
    expect(host.textContent).not.toContain('Paced by typewriter')

    await act(async () => {
      root.unmount()
    })
  })

  it('fade=false does not affect typewriter cursor', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: 'Hello world',
          typewriter: true,
          fade: false,
          final: false,
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        })),
      )
    })
    await flushReact()

    const cursor = host.querySelector('.typewriter-cursor')
    expect(cursor).not.toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('final=true hides typewriter cursor immediately', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    // First render: streaming (no smooth streaming), cursor should be visible
    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: 'Streaming',
          typewriter: true,
          final: false,
          smoothStreaming: false,
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        })),
      )
    })
    await flushReact()

    expect(host.querySelector('.typewriter-cursor')).not.toBeNull()

    // Second render: final=true, cursor should disappear immediately
    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: 'Streaming done',
          typewriter: true,
          final: true,
          smoothStreaming: false,
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        })),
      )
    })
    await flushReact()

    expect(host.querySelector('.typewriter-cursor')).toBeNull()

    await act(async () => {
      root.unmount()
    })
  })

  it('final=false keeps typewriter cursor visible even after timers advance', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers()

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        React.createElement(StrictMode, null, React.createElement(NodeRenderer as any, {
          content: 'Still streaming',
          typewriter: true,
          final: false,
          batchRendering: false,
          viewportPriority: false,
          deferNodesUntilVisible: false,
        })),
      )
    })
    await flushReact()

    const cursor = host.querySelector('.typewriter-cursor')
    expect(cursor).not.toBeNull()

    // Advance all timers — cursor should remain visible because final=false
    // and the cursor is now a derived value, not timeout-based
    await act(async () => {
      vi.advanceTimersByTime(5000)
    })
    await flushReact()

    expect(host.querySelector('.typewriter-cursor')).not.toBeNull()

    vi.useRealTimers()
    await act(async () => {
      root.unmount()
    })
  })
})
