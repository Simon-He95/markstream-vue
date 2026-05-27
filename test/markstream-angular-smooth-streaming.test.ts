/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveParsedNodes } from '../packages/markstream-angular/src/components/shared/node-helpers'
import { SmoothMarkdownStreamService } from '../packages/markstream-angular/src/services/smooth-markdown-stream.service'

describe('markstream-angular SmoothMarkdownStreamService', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not reveal a large chunk all at once', async () => {
    vi.useFakeTimers()
    const service = new SmoothMarkdownStreamService()
    service.init()

    service.enqueue('a'.repeat(1800))
    expect(service.visible.length).toBeLessThan(service.source.length)

    await vi.advanceTimersByTimeAsync(400)
    expect(service.visible.length).toBeLessThan(service.source.length)

    service.ngOnDestroy()
  })

  it('sets final only after visible catches up', async () => {
    vi.useFakeTimers()
    const service = new SmoothMarkdownStreamService()
    service.init()

    service.enqueue('x'.repeat(1400))
    service.finish()

    expect(service.done).toBe(true)
    expect(service.final).toBe(false)

    service.flush()
    expect(service.final).toBe(true)

    service.ngOnDestroy()
  })

  it('reset clears state and keeps pending at zero', async () => {
    vi.useFakeTimers()
    const service = new SmoothMarkdownStreamService()
    service.init()

    service.enqueue('x'.repeat(1000))
    await vi.advanceTimersByTimeAsync(120)
    service.reset()
    await vi.advanceTimersByTimeAsync(200)

    expect(service.source).toBe('')
    expect(service.visible).toBe('')
    expect(service.pendingChars).toBe(0)

    service.ngOnDestroy()
  })

  it('reopens the stream when enqueue is called after finish', () => {
    const service = new SmoothMarkdownStreamService()
    service.init()

    service.enqueue('hello')
    service.finish({ flush: true })
    expect(service.final).toBe(true)

    service.enqueue(' world')
    expect(service.done).toBe(false)
    expect(service.final).toBe(false)

    service.ngOnDestroy()
  })

  it('normalizes extreme option values', () => {
    const service = new SmoothMarkdownStreamService()
    service.init({
      maxCharsPerCommit: 0,
      maxCommitFps: 0,
      minCharsPerSecond: 0,
      maxCharsPerSecond: -10,
    })

    service.enqueue('test')
    service.flush()
    expect(service.visible).toBe('test')

    service.ngOnDestroy()
  })

  it('enqueue appends to source and visible catches up', async () => {
    vi.useFakeTimers()
    const service = new SmoothMarkdownStreamService()
    service.init({ startDelayMs: 0 })

    service.enqueue('abc')
    expect(service.source).toBe('abc')

    service.enqueue('def')
    expect(service.source).toBe('abcdef')

    await vi.advanceTimersByTimeAsync(2000)
    expect(service.visible).toBe('abcdef')

    service.ngOnDestroy()
  })

  it('pause and resume control the pacing loop', async () => {
    vi.useFakeTimers()
    const service = new SmoothMarkdownStreamService()
    service.init({ startDelayMs: 0 })

    service.enqueue('hello world')
    service.pause()

    await vi.advanceTimersByTimeAsync(1000)
    // While paused, visible should not advance
    expect(service.visible.length).toBeLessThan(service.source.length)

    const visibleBeforeResume = service.visible.length
    service.resume()

    await vi.advanceTimersByTimeAsync(2000)
    expect(service.visible.length).toBeGreaterThan(visibleBeforeResume)

    service.ngOnDestroy()
  })

  it('subscribe notifies listeners on visible advance', async () => {
    vi.useFakeTimers()
    const service = new SmoothMarkdownStreamService()
    service.init({ startDelayMs: 0 })

    const calls: string[] = []
    const unsubscribe = service.subscribe(() => {
      calls.push(service.visible)
    })

    service.enqueue('hello world')
    // The subscribe callback should fire when the controller syncs
    expect(calls.length).toBeGreaterThanOrEqual(1)

    await vi.advanceTimersByTimeAsync(2000)
    expect(calls.length).toBeGreaterThanOrEqual(2)

    unsubscribe()
    service.ngOnDestroy()
  })

  it('subscribe returns an unsubscribe function that stops callbacks', async () => {
    vi.useFakeTimers()
    const service = new SmoothMarkdownStreamService()
    service.init({ startDelayMs: 0 })

    const calls: string[] = []
    const unsubscribe = service.subscribe(() => {
      calls.push(service.visible)
    })

    service.enqueue('abc')
    const countBeforeUnsubscribe = calls.length

    unsubscribe()
    service.enqueue('def')

    await vi.advanceTimersByTimeAsync(2000)
    // No additional calls after unsubscribe
    expect(calls.length).toBe(countBeforeUnsubscribe)

    service.ngOnDestroy()
  })

  it('ngOnDestroy cleans up controller and listeners', async () => {
    vi.useFakeTimers()
    const service = new SmoothMarkdownStreamService()
    service.init()

    const calls: string[] = []
    service.subscribe(() => {
      calls.push(service.visible)
    })

    service.enqueue('test')
    expect(calls.length).toBeGreaterThanOrEqual(1)

    service.ngOnDestroy()

    // After destroy, source/visible should be stale (no further updates)
    const visibleAfterDestroy = service.visible
    service.enqueue('more')
    expect(service.visible).toBe(visibleAfterDestroy)
  })
})

describe('markstream-angular smooth streaming props', () => {
  it('accepts smoothStreaming and smoothStreamingOptions in NodeRendererProps', () => {
    const nodes = resolveParsedNodes({
      content: '# Hello',
      smoothStreaming: 'auto',
      smoothStreamingOptions: { minCharsPerSecond: 100 },
    })
    expect(nodes.length).toBeGreaterThan(0)
  })

  it('accepts smoothStreaming: true', () => {
    const nodes = resolveParsedNodes({
      content: '# Hello',
      smoothStreaming: true,
    })
    expect(nodes.length).toBeGreaterThan(0)
  })

  it('accepts smoothStreaming: false', () => {
    const nodes = resolveParsedNodes({
      content: '# Hello',
      smoothStreaming: false,
    })
    expect(nodes.length).toBeGreaterThan(0)
  })

  it('treats nodes=[] as nodes mode (empty array, not content mode)', () => {
    const nodes = resolveParsedNodes({
      content: '# Hello',
      nodes: [],
      smoothStreaming: 'auto',
    })
    // nodes=[] should return empty array (nodes mode), not parse content
    expect(nodes).toEqual([])
  })
})
