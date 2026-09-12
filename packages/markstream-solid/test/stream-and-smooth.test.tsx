import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarkdownRender, { SMOOTH_STREAMING_CONTEXT } from '../src/index'
import { disableStreamDiffs, enableStreamDiffs, setStreamDiffsLoader } from '../src/optional-streamDiffs'

const flushAsyncRendering = () => new Promise<void>(resolve => setTimeout(resolve, 0))

const SLOW_SMOOTH = { startDelayMs: 50, minCharsPerSecond: 1, maxCharsPerSecond: 1 } as const
const GROWTH = 'GROWTH_TOKEN_MUST_APPEAR_WITHOUT_TYPEWRITER_BACKLOG'

function NestedAuto(props: { content: string }) {
  return (
    <div data-nested-auto>
      <MarkdownRender
        content={props.content}
        smoothStreaming="auto"
        typewriter
        maxLiveNodes={0}
        smoothStreamingOptions={SLOW_SMOOTH}
      />
    </div>
  )
}

describe('markstream-solid stream mapping and nested smooth', () => {
  afterEach(() => {
    enableStreamDiffs()
    vi.useRealTimers()
  })

  it('after mount, nested auto shows grown content immediately when the parent is smoothing', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    let setInner!: (value: string) => void
    const App = () => {
      const [inner, set] = createSignal('SEED')
      setInner = set
      return (
        <MarkdownRender
          content="# parent is smoothing\n\n<Nested>slot</Nested>"
          smoothStreaming={true}
          final
          customHtmlTags={['Nested']}
          customComponents={{ nested: () => <NestedAuto content={inner()} /> }}
          smoothStreamingOptions={{ startDelayMs: 0, minCharsPerSecond: 10_000, maxCharsPerSecond: 10_000, flushOnFinish: true }}
        />
      )
    }
    const dispose = render(() => <App />, container)
    await vi.advanceTimersByTimeAsync(20)
    expect(container.querySelector('[data-nested-auto]')?.textContent).toContain('SEED')
    setInner(`SEED ${GROWTH}`)
    await Promise.resolve()
    expect(container.querySelector('[data-nested-auto]')?.textContent).toContain(GROWTH)
    dispose()
  })

  it('after mount, nested auto typewriters grown content when no parent is smoothing', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    let setInner!: (value: string) => void
    const App = () => {
      const [inner, set] = createSignal('SEED')
      setInner = set
      return <NestedAuto content={inner()} />
    }
    const dispose = render(() => <App />, container)
    await vi.advanceTimersByTimeAsync(20)
    expect(container.querySelector('[data-nested-auto]')?.textContent).toContain('SEED')
    setInner(`SEED ${GROWTH}`)
    await Promise.resolve()
    expect(container.querySelector('[data-nested-auto]')?.textContent).not.toContain(GROWTH)
    await vi.advanceTimersByTimeAsync(80_000)
    expect(container.querySelector('[data-nested-auto]')?.textContent).toContain(GROWTH)
    dispose()
  })

  it('keeps explicit nested smoothStreaming=true even when a parent is smoothing', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const inner = 'EXPLICIT_NESTED_SMOOTH'
    const dispose = render(() => (
      <SMOOTH_STREAMING_CONTEXT.Provider value={() => true}>
        <MarkdownRender
          content={inner}
          smoothStreaming={true}
          smoothStreamingOptions={{ startDelayMs: 50, minCharsPerSecond: 1, maxCharsPerSecond: 1 }}
        />
      </SMOOTH_STREAMING_CONTEXT.Provider>
    ), container)
    expect(container.textContent).not.toContain(inner)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(container.textContent).toContain(inner)
    dispose()
  })

  it('does not smooth when smoothStreaming is false', () => {
    const container = document.createElement('div')
    const dispose = render(() => (
      <MarkdownRender
        content="NO_SMOOTH_DELAY"
        smoothStreaming={false}
        typewriter
        maxLiveNodes={0}
        smoothStreamingOptions={{ startDelayMs: 50, minCharsPerSecond: 1, maxCharsPerSecond: 1 }}
      />
    ), container)
    expect(container.textContent).toContain('NO_SMOOTH_DELAY')
    dispose()
  })

  it('does not smooth nodes mode even when typewriter is set', () => {
    const container = document.createElement('div')
    const dispose = render(() => (
      <MarkdownRender
        nodes={[{ type: 'paragraph', children: [{ type: 'text', content: 'NODES_MODE' }] } as any]}
        smoothStreaming="auto"
        typewriter
        maxLiveNodes={0}
        smoothStreamingOptions={{ startDelayMs: 50, minCharsPerSecond: 1, maxCharsPerSecond: 1 }}
      />
    ), container)
    expect(container.textContent).toContain('NODES_MODE')
    dispose()
  })

  it('resets a parent smooth stream without leaving nested auto backlog', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    let setContent!: (value: string) => void
    const App = () => {
      const [content, set] = createSignal('first stream body')
      setContent = set
      return (
        <MarkdownRender
          content={content()}
          smoothStreaming
          smoothStreamingOptions={{ startDelayMs: 0, minCharsPerSecond: 1, maxCharsPerSecond: 1, flushOnFinish: true }}
          customHtmlTags={['Thinking']}
          customComponents={{
            thinking: props => (
              <div data-nested-thinking>
                <MarkdownRender content={String((props.node as any).content ?? '')} smoothStreaming="auto" typewriter maxLiveNodes={0} />
              </div>
            ),
          }}
        />
      )
    }
    const dispose = render(() => <App />, container)
    setContent('replacement final')
    await vi.advanceTimersByTimeAsync(20)
    expect(container.textContent).toContain('replacement final')
    expect(container.textContent).not.toContain('first stream body')
    dispose()
  })

  it('suppresses ThinkingNode nested auto while the parent renderer is actually smoothing', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    let setInner!: (value: string) => void
    const App = () => {
      const [inner, set] = createSignal('SEED')
      setInner = set
      return (
        <MarkdownRender
          content="<Thinking>placeholder</Thinking>"
          smoothStreaming={true}
          final
          customHtmlTags={['Thinking']}
          customComponents={{
            thinking: () => (
              <div data-thinking>
                <NestedAuto content={inner()} />
              </div>
            ),
          }}
          smoothStreamingOptions={{ startDelayMs: 0, minCharsPerSecond: 10_000, maxCharsPerSecond: 10_000, flushOnFinish: true }}
        />
      )
    }
    const dispose = render(() => <App />, container)
    await vi.advanceTimersByTimeAsync(20)
    expect(container.querySelector('[data-thinking] [data-nested-auto]')?.textContent).toContain('SEED')
    setInner(`SEED ${GROWTH}`)
    await Promise.resolve()
    expect(container.querySelector('[data-thinking] [data-nested-auto]')?.textContent).toContain(GROWTH)
    dispose()
  })

  it('does not create a code-block runtime while stream=false and the fence is still loading', async () => {
    const createEditor = vi.fn()
    const createCodeBlockRuntime = vi.fn(() => ({ createEditor, updateCode: vi.fn() }))
    setStreamDiffsLoader(() => ({ createCodeBlockRuntime }))
    const container = document.createElement('div')
    let setLoading!: (value: boolean) => void
    const App = () => {
      const [loading, set] = createSignal(true)
      setLoading = set
      return (
        <MarkdownRender
          nodes={[{ type: 'code_block', language: 'typescript', code: 'const ready = true', loading: loading() } as any]}
          final={false}
          batchRendering={false}
          codeBlockStream={false}
        />
      )
    }
    const dispose = render(() => <App />, container)
    await flushAsyncRendering()
    expect(createCodeBlockRuntime).not.toHaveBeenCalled()
    expect(createEditor).not.toHaveBeenCalled()
    expect(container.querySelector('[data-markstream-code-stream]')?.getAttribute('data-markstream-code-stream')).toBe('false')
    expect(container.querySelector('.pre-code-node')?.textContent).toContain('const ready = true')
    setLoading(false)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(createCodeBlockRuntime).toHaveBeenCalledTimes(1)
    const firstCall = (createCodeBlockRuntime.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]
    expect(firstCall?.[0]?.stream).toBe(false)
    expect(createEditor).toHaveBeenCalledTimes(1)
    dispose()
    disableStreamDiffs()
  })

  it('does not change short-document markup when debugPerformance is set', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const content = '# Heading\n\nHello **world**'
    const left = document.createElement('div')
    const right = document.createElement('div')
    const disposeLeft = render(() => <MarkdownRender content={content} final />, left)
    const disposeRight = render(() => (
      <MarkdownRender
        content={content}
        final
        debugPerformance
      />
    ), right)
    expect(left.querySelector('h1')?.textContent).toBe(right.querySelector('h1')?.textContent)
    expect(left.querySelector('strong')?.textContent).toBe(right.querySelector('strong')?.textContent)
    disposeLeft()
    disposeRight()
    info.mockRestore()
  })

  it('logs parse(sync) only when debugPerformance is true and again after content updates', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const container = document.createElement('div')
    const disposeQuiet = render(() => <MarkdownRender content="# Quiet" final />, container)
    expect(info.mock.calls.some(call => call[0] === '[markstream-solid][perf] parse(sync)')).toBe(false)
    disposeQuiet()
    info.mockClear()

    let setContent!: (value: string) => void
    const App = () => {
      const [content, set] = createSignal('# Heading\n\nHello')
      setContent = set
      return <MarkdownRender content={content()} final debugPerformance />
    }
    const dispose = render(() => <App />, container)
    const first = info.mock.calls.filter(call => call[0] === '[markstream-solid][perf] parse(sync)')
    expect(first.length).toBeGreaterThan(0)
    const payload = first[0][1] as { ms: number, nodes: number, contentLength: number }
    expect(Number.isFinite(payload.ms)).toBe(true)
    expect(payload.nodes).toBeGreaterThan(0)
    expect(payload.contentLength).toBe('# Heading\n\nHello'.length)
    setContent('# Heading\n\nHello **world**')
    const next = info.mock.calls.filter(call => call[0] === '[markstream-solid][perf] parse(sync)')
    expect(next.length).toBeGreaterThan(first.length)
    const last = next[next.length - 1][1] as { contentLength: number }
    expect(last.contentLength).toBe('# Heading\n\nHello **world**'.length)
    dispose()
    info.mockRestore()
  })

  it('does not throw when debugPerformance is on but performance is unavailable', () => {
    const original = globalThis.performance
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: {} })
    const container = document.createElement('div')
    try {
      expect(() => {
        const dispose = render(() => <MarkdownRender content="# x" final debugPerformance />, container)
        dispose()
      }).not.toThrow()
    }
    finally {
      Object.defineProperty(globalThis, 'performance', { configurable: true, value: original })
    }
  })

  it('uses stream ?? context.codeBlockStream ?? true and lets an explicit stream override context', async () => {
    const createEditor = vi.fn()
    setStreamDiffsLoader(() => ({ createCodeBlockRuntime: () => ({ createEditor, updateCode: vi.fn() }) }))
    const container = document.createElement('div')
    const dispose = render(() => (
      <MarkdownRender
        nodes={[{ type: 'code_block', language: 'typ', code: 'const value = 1', loading: true } as any]}
        final={false}
        batchRendering={false}
        codeBlockStream={false}
        codeBlockProps={{ stream: true }}
      />
    ), container)
    await flushAsyncRendering()
    expect(createEditor).not.toHaveBeenCalled()
    expect(container.querySelector('[data-markstream-code-stream]')?.getAttribute('data-markstream-code-stream')).toBe('true')
    dispose()
    disableStreamDiffs()
  })
})
