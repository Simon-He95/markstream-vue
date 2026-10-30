import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import MarkdownRender from '../src'

let dispose: (() => void) | undefined
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() { }
    disconnect() { }
  })
})
afterEach(() => {
  document.getSelection()?.removeAllRanges()
  dispose?.()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})
it('preserves selected settled text through append and fade settlement', () => {
  const [content, update] = createSignal('Hello')
  const host = document.createElement('div')
  document.body.append(host)
  dispose = render(() => <MarkdownRender content={content()} final={false} smoothStreaming={false} batchRendering={false} fade />, host)
  const text = host.querySelector('.text-node > span')!.firstChild!
  const range = document.createRange()
  range.setStart(text, 1)
  range.setEnd(text, 4)
  document.getSelection()!.addRange(range)
  update('Hello world')
  host.querySelector('.text-node-stream-delta')!.dispatchEvent(new Event('animationend', { bubbles: true }))
  expect(document.getSelection()!.toString()).toBe('ell')
  expect(text.textContent).toBe('Hello')
  expect(host.textContent).toBe('Hello world')
})
it('defers updates to a selected fade segment until selection release', () => {
  const [content, update] = createSignal('Hello')
  const host = document.createElement('div')
  document.body.append(host)
  dispose = render(() => <MarkdownRender content={content()} final={false} smoothStreaming={false} batchRendering={false} fade />, host)
  update('Hello world')
  const segment = host.querySelector('.text-node-stream-delta')!
  const range = document.createRange()
  range.selectNodeContents(segment)
  document.getSelection()!.addRange(range)
  segment.dispatchEvent(new Event('animationend', { bubbles: true }))
  update('Hello world and more')
  expect(document.getSelection()!.toString()).toBe(' world')
  expect(host.textContent).toBe('Hello world')
  document.getSelection()!.removeAllRanges()
  document.dispatchEvent(new Event('selectionchange'))
  expect(host.textContent).toBe('Hello world and more')
})
