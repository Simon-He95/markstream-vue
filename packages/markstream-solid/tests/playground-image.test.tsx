import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PinnedImageNode } from '../../../playground-solid/src/PinnedImageNode'
import MarkdownRender from '../src'

let dispose: (() => void) | undefined
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() { }
    disconnect() { }
  })
})
afterEach(() => {
  dispose?.()
  vi.unstubAllGlobals()
})
describe('playground streaming images', () => {
  it('keeps the Image heading and paragraph as text while streaming a custom image', () => {
    const host = document.createElement('div')
    const [content, setContent] = createSignal('')
    dispose = render(() => <MarkdownRender content={content()} final={false} smoothStreaming={false} batchRendering={false} customComponents={{ image: PinnedImageNode }} />, host)
    const source = '## Image\n\nImage\n\n![Vue Logo](/vue-markdown-icon.svg)'
    for (let end = 1; end <= source.length; end++)
      setContent(source.slice(0, end))
    expect(host.querySelector('h2')?.textContent).toBe('Image')
    expect(host.querySelector('p')?.textContent).toBe('Image')
    expect(host.querySelectorAll('.pinned-image-node')).toHaveLength(1)
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/vue-markdown-icon.svg')
    expect(host.querySelector('[data-pinned-image-state="error"]')).toBeNull()
  })
  it('waits for a complete URL before requesting the image', () => {
    const host = document.createElement('div')
    const [node, setNode] = createSignal({ type: 'image', src: 'https://v', loading: true })
    dispose = render(() => <PinnedImageNode node={node()} context={{} as any} />, host)
    expect(host.querySelector('img')).toBeNull()
    setNode({ type: 'image', src: '/vue-markdown-icon.svg', loading: false })
    const image = host.querySelector('img')!
    expect(image.getAttribute('src')).toBe('/vue-markdown-icon.svg')
    image.dispatchEvent(new Event('load'))
    expect(host.firstElementChild?.getAttribute('data-pinned-image-state')).toBe('loaded')
  })
  it('recovers from a failed source when replaced with a valid image', () => {
    const host = document.createElement('div')
    const [node, setNode] = createSignal({ type: 'image', src: '/missing.svg', loading: false })
    dispose = render(() => <PinnedImageNode node={node()} context={{} as any} />, host)
    host.querySelector('img')!.dispatchEvent(new Event('error'))
    expect(host.firstElementChild?.getAttribute('data-pinned-image-state')).toBe('error')
    setNode({ type: 'image', src: '/vue-markdown-icon.svg', loading: false })
    expect(host.firstElementChild?.getAttribute('data-pinned-image-state')).toBe('loading')
    host.querySelector('img')!.dispatchEvent(new Event('load'))
    expect(host.firstElementChild?.getAttribute('data-pinned-image-state')).toBe('loaded')
  })
})
