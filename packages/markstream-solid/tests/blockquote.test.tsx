import type { MarkdownRenderProps } from '../src'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownRender from '../src'

let dispose: (() => void) | undefined
let host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() { }
    disconnect() { }
  })
  host = document.createElement('div')
  document.body.append(host)
})
afterEach(() => {
  dispose?.()
  host.remove()
  vi.unstubAllGlobals()
})
function mount(initial: MarkdownRenderProps) {
  const [props, setProps] = createSignal({ smoothStreaming: false, batchRendering: false, ...initial })
  dispose = render(() => <MarkdownRender {...props()} />, host)
  return (next: Partial<MarkdownRenderProps>) => setProps(previous => ({ ...previous, ...next }))
}
describe('vue 3 blockquote layout', () => {
  it('contains nested block margins while keeping the innermost simple paragraph direct', () => {
    mount({ content: '>>> Nested **quote**', final: true })
    const quotes = host.querySelectorAll('blockquote')
    expect(quotes).toHaveLength(3)
    expect(quotes[0].querySelector(':scope > .blockquote-content > blockquote')).toBe(quotes[1])
    expect(quotes[1].querySelector(':scope > .blockquote-content > blockquote')).toBe(quotes[2])
    expect(quotes[2].querySelector(':scope > p > strong')?.textContent).toBe('quote')
    expect(quotes[2].querySelector('.blockquote-content')).toBeNull()
  })
  it('preserves paragraph overrides instead of flattening them into the simple path', () => {
    mount({ content: '> Custom paragraph', final: true, customComponents: { paragraph: props => <aside>{props.node.raw}</aside> } })
    expect(host.querySelector('blockquote > .blockquote-content > aside')?.textContent).toBe('Custom paragraph')
    expect(host.querySelector('blockquote > p')).toBeNull()
  })
  it('keeps quote elements during streaming and switches layout for a restored block tree', () => {
    const update = mount({ content: '>>> Streaming', final: false })
    const quotes = [...host.querySelectorAll('blockquote')]
    update({ content: '>>> Streaming **quote**', final: true })
    expect([...host.querySelectorAll('blockquote')]).toEqual(quotes)
    expect(host.querySelector('strong')?.textContent).toBe('quote')
    update({ content: '> Paragraph\n>\n> - List item' })
    expect(host.querySelector('blockquote > .blockquote-content > ul li')?.textContent).toBe('List item')
    update({ content: '> Single paragraph' })
    expect(host.querySelector('blockquote > p')?.textContent).toBe('Single paragraph')
    expect(host.querySelector('.blockquote-content')).toBeNull()
  })
})
