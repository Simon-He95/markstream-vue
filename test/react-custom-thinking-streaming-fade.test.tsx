/**
 * @vitest-environment jsdom
 */

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { removeCustomComponents, setCustomComponents } from '../packages/markstream-react/src/customComponents'

const scopeId = 'react-thinking-streaming-fade'

function ThinkingNode(props: any) {
  const { node, ctx, customId, isDark, typewriter } = props
  const inheritedTypewriter = typewriter ?? ctx?.typewriter ?? true

  return (
    <section className="thinking-shell">
      <header className="thinking-title">Thinking</header>
      <NodeRenderer
        content={String(node.content ?? '')}
        customId={customId ?? ctx?.customId}
        isDark={isDark ?? ctx?.isDark}
        typewriter={inheritedTypewriter}
        viewportPriority={false}
        deferNodesUntilVisible={false}
        batchRendering={false}
        maxLiveNodes={0}
        smoothStreaming={false}
      />
    </section>
  )
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

afterEach(() => {
  removeCustomComponents(scopeId)
  document.body.innerHTML = ''
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
})

describe('markstream-react custom thinking streaming fade', () => {
  it('preserves appended-text fade inside nested custom components that render a NodeRenderer', async () => {
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    setCustomComponents(scopeId, { thinking: ThinkingNode as any })

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)

    const renderMarkdown = (content: string) =>
      React.createElement(NodeRenderer as any, {
        content,
        customId: scopeId,
        customHtmlTags: ['thinking'],
        deferNodesUntilVisible: false,
        viewportPriority: false,
        smoothStreaming: false,
      })

    await act(async () => {
      root.render(renderMarkdown('<thinking>Hello</thinking>'))
    })
    await flushReact()

    await act(async () => {
      root.render(renderMarkdown('<thinking>HelloWorld</thinking>'))
    })
    await flushReact()

    const thinkingShell = host.querySelector('.thinking-shell')
    const deltas = Array.from(host.querySelectorAll('.thinking-shell .text-node-stream-delta'))

    expect(thinkingShell).toBeTruthy()
    expect(deltas).toHaveLength(1)
    expect(deltas[0]?.textContent).toBe('World')
    expect(thinkingShell?.textContent).toContain('HelloWorld')

    await act(async () => {
      root.unmount()
    })
  })
})
