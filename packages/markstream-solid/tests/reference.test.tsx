import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { expect, it, vi } from 'vitest'
import { ReferenceNode } from '../src'

it('forwards reference events with the current id, message and thread', () => {
  const host = document.createElement('div')
  document.body.append(host)
  const click = vi.fn()
  const enter = vi.fn()
  const leave = vi.fn()
  const [id, setId] = createSignal('1')
  const dispose = render(() => <ReferenceNode node={{ type: 'reference', id: id() }} messageId="message" threadId="thread" onClick={click} onMouseEnter={enter} onMouseLeave={leave} />, host)
  try {
    const element = host.querySelector('span')!
    const event = new MouseEvent('click', { bubbles: true })
    element.dispatchEvent(event)
    expect(click).toHaveBeenCalledWith(event, '1', 'message', 'thread')
    element.dispatchEvent(new MouseEvent('mouseenter'))
    element.dispatchEvent(new MouseEvent('mouseleave'))
    expect(enter).toHaveBeenCalledWith(expect.any(MouseEvent), '1', 'message', 'thread')
    expect(leave).toHaveBeenCalledWith(expect.any(MouseEvent), '1', 'message', 'thread')
    setId('2')
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(click).toHaveBeenLastCalledWith(expect.any(MouseEvent), '2', 'message', 'thread')
    expect(element.dataset.markstreamReferenceId).toBe('2')
  }
  finally {
    dispose()
    host.remove()
  }
})
