import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MathBlockNode, MathInlineNode } from '../src'

const state = vi.hoisted(() => ({ worker: vi.fn(), renderer: vi.fn(), cache: vi.fn() }))
vi.mock('../src/workers/katexWorkerClient', () => ({ renderKaTeXWithBackpressure: state.worker, setKaTeXCache: state.cache, WORKER_BUSY_CODE: 'WORKER_BUSY' }))
vi.mock('../src/optional/katex', () => ({ getKatex: state.renderer }))
let dispose: (() => void) | undefined
beforeEach(() => {
  state.worker.mockReset()
  state.renderer.mockReset()
  state.cache.mockReset()
})
afterEach(() => {
  dispose?.()
  dispose = undefined
  document.body.replaceChildren()
  vi.useRealTimers()
})

describe('native math worker lifecycle', () => {
  it('uses the worker for block math without loading a main-thread renderer', async () => {
    state.worker.mockResolvedValue('<span class="katex">worker output</span>')
    const host = document.createElement('div')
    document.body.append(host)
    dispose = render(() => <MathBlockNode node={{ type: 'math_block', content: 'x^2', raw: '$$x^2$$' }} />, host)
    await vi.waitFor(() => expect(host.querySelector('.katex')?.textContent).toBe('worker output'))
    expect(state.worker).toHaveBeenCalledWith('x^2', true, expect.objectContaining({ timeout: 3000, waitTimeout: 2000, maxRetries: 8, signal: expect.any(AbortSignal) }))
    expect(state.renderer).not.toHaveBeenCalled()
  })

  it('retains the last preview, coalesces streaming input and ignores stale worker results', async () => {
    vi.useFakeTimers()
    const replies: Array<(value: string) => void> = []
    state.worker.mockImplementation(() => new Promise<string>(resolve => replies.push(resolve)))
    const [node, setNode] = createSignal({ type: 'math_block' as const, content: 'a', raw: '$$a', loading: true })
    const host = document.createElement('div')
    document.body.append(host)
    dispose = render(() => <MathBlockNode node={node()} />, host)
    setNode({ ...node(), content: 'ab' })
    setNode({ ...node(), content: 'abc' })
    await vi.advanceTimersByTimeAsync(32)
    expect(state.worker).toHaveBeenCalledTimes(1)
    replies[0]('<span class="katex">abc</span>')
    await vi.advanceTimersByTimeAsync(0)
    const root = host.querySelector('.math-block')
    setNode({ ...node(), content: 'abcd' })
    expect(host.querySelector('.katex')?.textContent).toBe('abc')
    await vi.advanceTimersByTimeAsync(32)
    const signal = state.worker.mock.calls[1][2].signal as AbortSignal
    setNode({ ...node(), content: 'final', loading: false })
    expect(signal.aborted).toBe(true)
    expect(state.worker).toHaveBeenCalledTimes(3)
    replies[1]('<span class="katex">stale</span>')
    await vi.advanceTimersByTimeAsync(0)
    expect(host.querySelector('.katex')?.textContent).toBe('abc')
    replies[2]('<span class="katex">final</span>')
    await vi.advanceTimersByTimeAsync(0)
    expect(host.querySelector('.katex')?.textContent).toBe('final')
    expect(host.querySelector('.math-block')).toBe(root)
    const active = state.worker.mock.calls[2][2].signal as AbortSignal
    dispose?.()
    dispose = undefined
    expect(active.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses display mode for double-dollar inline nodes', async () => {
    state.worker.mockResolvedValue('<span class="katex">display</span>')
    const host = document.createElement('div')
    dispose = render(() => <MathInlineNode node={{ type: 'math_inline', content: 'x', raw: '$$x$$', markup: '$$' }} />, host)
    await vi.waitFor(() => expect(state.worker).toHaveBeenCalled())
    expect(state.worker.mock.calls[0][1]).toBe(true)
  })

  it('falls back on worker initialization failure and populates the worker cache', async () => {
    state.worker.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 'WORKER_INIT_ERROR' }))
    const main = vi.fn(() => '<span class="katex">fallback</span>')
    state.renderer.mockResolvedValue({ renderToString: main })
    const host = document.createElement('div')
    dispose = render(() => <MathBlockNode node={{ type: 'math_block', content: 'x', raw: '$$x$$' }} />, host)
    await vi.waitFor(() => expect(host.querySelector('.katex')?.textContent).toBe('fallback'))
    expect(main).toHaveBeenCalledWith('x', { displayMode: true, throwOnError: false })
    expect(state.cache).toHaveBeenCalledWith('x', true, '<span class="katex">fallback</span>')
  })
  it('shows completed raw math when the optional renderer and worker are unavailable', async () => {
    state.worker.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 'WORKER_INIT_ERROR' }))
    state.renderer.mockResolvedValue(null)
    const host = document.createElement('div')
    dispose = render(() => <MathBlockNode node={{ type: 'math_block', content: 'x', raw: '$$x$$' }} />, host)
    await vi.waitFor(() => expect(host.querySelector('.math-block__fallback')?.textContent).toBe('$$x$$'))
    expect(host.querySelector('[role="status"]')).toBeNull()
    expect(host.querySelector('[data-markstream-pending]')).toBeNull()
  })
})
