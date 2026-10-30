import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { expect, it, vi } from 'vitest'
import { ImageNode } from '../src'

it('keeps an already loaded source when only image metadata changes', () => {
  const host = document.createElement('div')
  const [node, setNode] = createSignal({ type: 'image' as const, src: '/same.svg', alt: 'before', title: null, raw: '' })
  const dispose = render(() => <ImageNode node={node()} />, host)
  try {
    const image = host.querySelector('img')!
    image.dispatchEvent(new Event('load'))
    setNode({ ...node(), alt: 'after' })
    expect(host.querySelector('img')).toBe(image)
    expect(image.alt).toBe('after')
    expect(host.querySelector('.image-placeholder')).toBeNull()
  }
  finally {
    dispose()
  }
})

it('holds an empty streamed source as loading until the node completes', () => {
  const host = document.createElement('div')
  const [loading, setLoading] = createSignal(true)
  const dispose = render(() => <ImageNode node={{ type: 'image', src: '', alt: '', title: null, raw: '', loading: loading() }} />, host)
  try {
    expect(host.querySelector('.image-error')).toBeNull()
    setLoading(false)
    expect(host.querySelector('.image-error')).not.toBeNull()
  }
  finally {
    dispose()
  }
})

it('retries the primary source when fallback configuration changes', () => {
  const host = document.createElement('div')
  const [fallback, setFallback] = createSignal('/first.svg')
  const dispose = render(() => <ImageNode node={{ type: 'image', src: '/primary.svg', alt: '', title: null, raw: '' }} fallbackSrc={fallback()} />, host)
  try {
    host.querySelector('img')!.dispatchEvent(new Event('error'))
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/first.svg')
    host.querySelector('img')!.dispatchEvent(new Event('load'))
    setFallback('/second.svg')
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/primary.svg')
    host.querySelector('img')!.dispatchEvent(new Event('error'))
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/second.svg')
  }
  finally {
    dispose()
  }
})

it('releases the settle deadline without replacing a slow image with an error', async () => {
  vi.useFakeTimers()
  const host = document.createElement('div')
  const loaded = vi.fn()
  const failed = vi.fn()
  const dispose = render(() => <ImageNode node={{ type: 'image', src: '/slow.svg', alt: 'slow', title: null, raw: '' }} onLoad={loaded} onError={failed} />, host)
  try {
    await vi.advanceTimersByTimeAsync(8000)
    expect(host.querySelector('.image-error')).toBeNull()
    expect(host.querySelector('img')).not.toBeNull()
    host.querySelector('img')!.dispatchEvent(new Event('load'))
    expect(loaded).toHaveBeenCalledWith('/slow.svg')
    expect(failed).not.toHaveBeenCalled()
  }
  finally {
    dispose()
    vi.useRealTimers()
  }
})
