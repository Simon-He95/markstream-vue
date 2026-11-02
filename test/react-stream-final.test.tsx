import { createStreamingTextScope } from 'markstream-core'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { NodeRenderer } from '../packages/markstream-react/src/components/NodeRenderer'
import { TextFinalContext } from '../packages/markstream-react/src/context/textFinal'

it('finishes a nested block without waiting for its streaming parent or stopping its sibling', async () => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const parent = createStreamingTextScope(work => work())
  const render = (content: string, firstFinal: boolean) => (
    <TextFinalContext.Provider value={parent}>
      {[firstFinal, false].map((final, index) => <NodeRenderer key={index} content={content} final={final} smoothStreaming={false} batchRendering={false} deferNodesUntilVisible={false} viewportPriority={false} />)}
    </TextFinalContext.Provider>
  )
  try {
    await act(async () => root.render(render('Hello', false)))
    await act(async () => root.render(render('Hello world', false)))
    expect(host.querySelectorAll('.text-node-stream-delta')).toHaveLength(2)
    await act(async () => root.render(render('Hello world', true)))
    const blocks = host.querySelectorAll('.markdown-renderer')
    expect(blocks[0].querySelector('.text-node-stream-delta')).toBeNull()
    expect(blocks[1].querySelector('.text-node-stream-delta')).not.toBeNull()
    await act(async () => parent.setFinal(true))
    expect(host.querySelectorAll('.text-node-stream-delta')).toHaveLength(0)
    expect(host.textContent).toBe('Hello worldHello world')
  }
  finally {
    await act(async () => root.unmount())
    host.remove()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
  }
})

it('restores text after switching through caller-provided children', async () => {
  const { TextNode } = await import('../packages/markstream-react/src/components/TextNode/TextNode')
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<TextNode node={{ type: 'text', content: 'before' }} />))
    await act(async () => root.render(<TextNode node={{ type: 'text', content: 'before' }}><b>custom child</b></TextNode>))
    expect(host.textContent).toBe('custom child')
    await act(async () => root.render(<TextNode node={{ type: 'text', content: 'replacement' }} />))
    expect(host.textContent).toBe('replacement')
  }
  finally {
    await act(async () => root.unmount())
    host.remove()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
  }
})
