import { createElement, createRoot, flushSync } from 'octane'
import { expect, it } from 'vitest'
import { NodeRenderer } from '../../src/index'

it('commits a small final tail before yielding to passive effects', () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const props = { smoothStreaming: true, batchRendering: false, deferNodesUntilVisible: false, viewportPriority: false, maxLiveNodes: 0 }
  try {
    flushSync(() => root.render(createElement(NodeRenderer, { ...props, content: 'Hello', final: false })))
    const content = `Hello${'字'.repeat(995)}`
    flushSync(() => root.render(createElement(NodeRenderer, { ...props, content, final: true })))
    expect(host.textContent).toBe(content)
    expect(host.querySelector('.text-node-stream-delta')).toBeNull()
  }
  finally {
    flushSync(() => root.unmount())
    host.remove()
  }
})
