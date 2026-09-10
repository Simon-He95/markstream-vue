import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { getMarkdown } from 'stream-markdown-parser'
import { describe, expect, it, vi } from 'vitest'
import MarkdownRender, { clearGlobalCustomComponents, clearKaTeXWorker, CodeBlockNode, computeLiveRange, D2BlockNode, disableD2, disableInfographic, disableKatex, disableMermaid, disableStreamDiffs, enableStreamDiffs, enhanceRenderedHtml, hideTooltip, InfographicBlockNode, isTooltipVisible, MathInlineNode, MermaidBlockNode, parseNestedMarkdownToNodes, renderKaTeXInWorker, resolveCssSize, resolveDeferNodes, resolveNodeOutletCodeMode, resolveNodeOutletCustomInputs, resolveParsedNodes, resolveVirtualizationEnabled, setCustomComponents, setD2Loader, setDefaultI18nMap, setInfographicLoader, setKatexLoader, setKaTeXWorker, setMermaidLoader, setMermaidWorker, setStreamDiffsLoader, showTooltipForAnchor, SolidCodeBlockNode, TextNode, useSafeI18n, useSmoothMarkdownStream } from '../src/index'

const flushAsyncRendering = () => new Promise<void>(resolve => setTimeout(resolve, 0))

describe('markstream-solid renderer foundation', () => {
  it('exposes the Solid code-block alias as the same component', () => {
    expect(SolidCodeBlockNode).toBe(CodeBlockNode)
  })

  it('parses Markdown into the same node structure used by the Svelte renderer', () => {
    const nodes = resolveParsedNodes({ content: '# Heading\n\nHello **world**', final: true })
    expect(nodes.map(node => node.type)).toEqual(['heading', 'paragraph'])
  })

  it('renders parsed Markdown through Solid DOM owners', () => {
    const container = document.createElement('div')
    const dispose = render(() => <MarkdownRender content={'# Heading\n\nHello **world**'} final />, container)
    expect(container.querySelector('h1')?.textContent).toBe('Heading')
    expect(container.querySelector('strong')?.textContent).toBe('world')
    dispose()
  })

  it('treats an explicit empty nodes list as nodes mode', () => {
    expect(resolveParsedNodes({ content: '# ignored', nodes: [], final: true })).toEqual([])
  })

  it('keeps the default Solid parser cache separate from the Svelte cache key', () => {
    const svelteParser = getMarkdown('markstream-svelte::')
    let solidParser: unknown
    resolveParsedNodes({
      content: 'Solid',
      customMarkdownIt: (parser) => {
        solidParser = parser
        return parser
      },
    })
    expect(solidParser).not.toBe(svelteParser)
  })

  it('uses the shared safe HTML renderer for HTML nodes', () => {
    const container = document.createElement('div')
    const dispose = render(() => <MarkdownRender content="<script>alert(1)</script><b>safe</b>" final />, container)
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('safe')
    dispose()
  })

  it('uses the pre renderer only when explicitly requested', () => {
    const container = document.createElement('div')
    const dispose = render(() => <MarkdownRender content={'```ts\nconst answer = 42\n```'} final renderCodeBlocksAsPre />, container)
    expect(container.querySelector('.pre-code-node')?.textContent).toContain('const answer = 42')
    dispose()
  })

  it('selects every specialized code mode and supplies bounded preview heights', () => {
    const mermaid = { type: 'code_block', language: 'mermaid', code: 'flowchart TD\nA --> B' } as any
    const infographic = { type: 'code_block', language: 'infographic', code: '- one\n- two\n- three' } as any
    expect(resolveNodeOutletCodeMode(mermaid)).toBe('mermaid')
    expect(resolveNodeOutletCodeMode({ ...mermaid, language: 'd2lang' })).toBe('d2')
    expect(resolveNodeOutletCodeMode(infographic)).toBe('infographic')
    expect(resolveNodeOutletCodeMode({ ...mermaid, language: 'typescript' })).toBe('code')
    expect(resolveNodeOutletCodeMode(mermaid, { renderCodeBlocksAsPre: true } as any)).toBe('pre')
    expect((resolveNodeOutletCustomInputs(mermaid) as any)?.estimatedPreviewHeightPx).toBe(360)
    expect((resolveNodeOutletCustomInputs(infographic) as any)?.estimatedPreviewHeightPx).toBe(500)
    expect((resolveNodeOutletCustomInputs(mermaid, { mermaidProps: { maxHeight: '300' } } as any) as any)?.estimatedPreviewHeightPx).toBe(300)
  })

  it('keeps the paragraph owner while an append-only stream updates its node', () => {
    const container = document.createElement('div')
    let setContent!: (value: string) => void
    const App = () => {
      const [content, set] = createSignal('Hello')
      setContent = set
      return <MarkdownRender content={content()} final />
    }
    const dispose = render(() => <App />, container)
    const paragraph = container.querySelector('p')
    setContent('Hello world')
    expect(container.querySelector('p')).toBe(paragraph)
    expect(paragraph?.textContent).toBe('Hello world')
    dispose()
  })

  it('keeps the TextNode owner while appending its streaming delta', () => {
    const container = document.createElement('div')
    const state = new Map<string, string>()
    let setText!: (value: string) => void
    const App = () => {
      const [text, set] = createSignal('Hello')
      setText = set
      return <TextNode node={{ type: 'text', content: text() } as any} context={{ fade: true, streamRenderVersion: 1, textStreamState: state, events: {} }} indexKey="text" />
    }
    const dispose = render(() => <App />, container)
    const owner = container.querySelector('.markstream-solid-text-node')
    setText('Hello world')
    expect(container.querySelector('.markstream-solid-text-node')).toBe(owner)
    expect(owner?.textContent).toBe('Hello world')
    expect(owner?.querySelector('.text-node-stream-delta')?.textContent).toBe(' world')
    dispose()
  })

  it('flushes final replacement content without retaining the previous smooth stream', () => {
    const container = document.createElement('div')
    let replace!: () => void
    const App = () => {
      const [state, setState] = createSignal({ content: 'first stream', final: false })
      replace = () => setState({ content: 'replacement final', final: true })
      return <MarkdownRender content={state().content} final={state().final} smoothStreaming smoothStreamingOptions={{ flushOnFinish: true }} />
    }
    const dispose = render(() => <App />, container)
    replace()
    expect(container.textContent).toContain('replacement final')
    expect(container.textContent).not.toContain('first stream')
    dispose()
  })

  it('releases a smooth stream with its Solid owner', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    let enqueue!: (chunk: string) => void
    const StreamOwner = () => {
      const stream = useSmoothMarkdownStream({ startDelayMs: 50, minCharsPerSecond: 1, maxCharsPerSecond: 1 })
      enqueue = stream.enqueue
      return <output>{stream.visible()}</output>
    }
    const dispose = render(() => <StreamOwner />, container)
    enqueue('pending content')
    dispose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(container.textContent).toBe('')
    vi.useRealTimers()
  })

  it.each([
    ['inline', '<span class="markstream-nested-math"><span class="markstream-nested-math__source">x</span><span class="markstream-nested-math__render"></span></span>'],
    ['block', '<div class="markstream-nested-math-block"><span class="markstream-nested-math-block__source">x</span><span class="markstream-nested-math-block__render"></span></div>'],
  ])('does not write %s KaTeX enhancement markup after cancellation', async (_kind, markup) => {
    const deferred = Promise.withResolvers<any>()
    setKatexLoader(() => deferred.promise)
    const root = document.createElement('div')
    root.innerHTML = markup
    let cancelled = false
    const enhanced = enhanceRenderedHtml(root, { isCancelled: () => cancelled })
    cancelled = true
    deferred.resolve({ renderToString: () => '<span class="katex">x</span>' })
    await enhanced
    expect(root.querySelector('.katex')).toBeNull()
    disableKatex()
  })

  it('parses nested custom-tag content with the shared parser behavior', () => {
    const nodes = parseNestedMarkdownToNodes({ content: 'before <Thinking>**inside**</Thinking>' }, { customHtmlTags: ['Thinking'], final: true })
    expect(nodes.length).toBeGreaterThan(0)
    expect(JSON.stringify(nodes)).toContain('inside')
  })

  it('hydrates nested Markdown inside a renderer-scoped custom tag', () => {
    const container = document.createElement('div')
    const dispose = render(() => <MarkdownRender content="<Thinking>**inside**</Thinking>" final customHtmlTags={['Thinking']} customComponents={{ thinking: props => <aside data-thinking>{JSON.stringify(props.node)}</aside> }} />, container)
    expect(container.querySelector('[data-thinking]')?.textContent).toContain('inside')
    dispose()
  })

  it('replaces a node slot when its type changes', () => {
    const container = document.createElement('div')
    let setNodes!: (nodes: any[]) => void
    const App = () => {
      const [nodes, set] = createSignal<any[]>([{ type: 'paragraph', children: [{ type: 'text', content: 'first' }] }])
      setNodes = set
      return <MarkdownRender nodes={nodes()} final />
    }
    const dispose = render(() => <App />, container)
    setNodes([{ type: 'heading', level: 2, children: [{ type: 'text', content: 'second' }] }])
    expect(container.querySelector('p')).toBeNull()
    expect(container.querySelector('h2')?.textContent).toBe('second')
    dispose()
  })

  it('keeps position slots stable while inserted and reordered nodes update', () => {
    const container = document.createElement('div')
    let setNodes!: (nodes: any[]) => void
    const App = () => {
      const [nodes, set] = createSignal<any[]>([
        { type: 'paragraph', children: [{ type: 'text', content: 'first' }] },
        { type: 'paragraph', children: [{ type: 'text', content: 'second' }] },
      ])
      setNodes = set
      return <MarkdownRender nodes={nodes()} final />
    }
    const dispose = render(() => <App />, container)
    const firstSlot = container.querySelector('p')
    setNodes([
      { type: 'paragraph', children: [{ type: 'text', content: 'inserted' }] },
      { type: 'paragraph', children: [{ type: 'text', content: 'second' }] },
      { type: 'paragraph', children: [{ type: 'text', content: 'first' }] },
    ])
    expect(container.querySelector('p')).toBe(firstSlot)
    expect(Array.from(container.querySelectorAll('p')).map(node => node.textContent)).toEqual(['inserted', 'second', 'first'])
    setNodes([
      { type: 'paragraph', children: [{ type: 'text', content: 'remaining first slot' }] },
      { type: 'paragraph', children: [{ type: 'text', content: 'remaining second slot' }] },
    ])
    expect(container.querySelector('p')).toBe(firstSlot)
    expect(Array.from(container.querySelectorAll('p')).map(node => node.textContent)).toEqual(['remaining first slot', 'remaining second slot'])
    dispose()
  })

  it('reacts to runtime global custom component registration', () => {
    const container = document.createElement('div')
    const dispose = render(() => <MarkdownRender nodes={[{ type: 'notice', content: 'hello' } as any]} final />, container)
    setCustomComponents({ notice: props => <aside data-custom-notice>{props.node.content}</aside> })
    expect(container.querySelector('[data-custom-notice]')?.textContent).toBe('hello')
    clearGlobalCustomComponents()
    dispose()
  })

  it('does not keep custom-component listeners after the renderer unmounts', () => {
    const store = (globalThis as any).__MARKSTREAM_SOLID_CUSTOM_COMPONENTS_STORE__ as { listeners: Set<() => void> }
    const before = store.listeners.size
    const container = document.createElement('div')
    const dispose = render(() => <MarkdownRender content="# hi" final />, container)
    expect(store.listeners.size).toBe(before + 1)
    dispose()
    expect(store.listeners.size).toBe(before)
    expect(() => setCustomComponents({ notice: () => <aside /> })).not.toThrow()
    clearGlobalCustomComponents()
  })

  it('keeps renderer-scoped custom components isolated from global registration', () => {
    const container = document.createElement('div')
    setCustomComponents({ notice: props => <aside data-global-notice>{props.node.content}</aside> })
    const dispose = render(() => <MarkdownRender nodes={[{ type: 'notice', content: 'scoped hello' } as any]} final customComponents={{ notice: props => <output data-scoped-notice>{props.node.content}</output> }} />, container)
    expect(container.querySelector('[data-scoped-notice]')?.textContent).toBe('scoped hello')
    expect(container.querySelector('[data-global-notice]')).toBeNull()
    dispose()
    clearGlobalCustomComponents()
  })

  it('uses a language-specific custom component for a code block', () => {
    const container = document.createElement('div')
    setCustomComponents({ typescript: props => <output data-ts-code>{props.node.code}</output> })
    const dispose = render(() => <MarkdownRender nodes={[{ type: 'code_block', language: 'typescript', code: 'const value = 1' } as any]} final />, container)
    expect(container.querySelector('[data-ts-code]')?.textContent).toBe('const value = 1')
    dispose()
    clearGlobalCustomComponents()
  })

  it('mounts a completed long document in configured batches', async () => {
    vi.useFakeTimers()
    const container = document.createElement('div')
    const dispose = render(() => <MarkdownRender content={'one\n\ntwo\n\nthree'} final initialRenderBatchSize={1} renderBatchSize={1} renderBatchDelay={5} />, container)
    expect(container.querySelectorAll('p')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(20)
    expect(container.querySelectorAll('p')).toHaveLength(3)
    dispose()
    vi.useRealTimers()
  })

  it('exposes the Svelte-compatible i18n map API', () => {
    setDefaultI18nMap({ 'solid.greeting': 'Hello Solid' })
    expect(useSafeI18n().t('solid.greeting')).toBe('Hello Solid')
  })

  it('positions and cleans up the singleton tooltip with accessible linkage', async () => {
    hideTooltip(true)
    const anchor = document.createElement('button')
    anchor.getBoundingClientRect = () => new DOMRect(40, 60, 20, 20)
    document.body.appendChild(anchor)
    showTooltipForAnchor(anchor, 'Tooltip content', 'bottom', true, undefined, true)
    await flushAsyncRendering()
    await flushAsyncRendering()
    const tooltip = document.body.querySelector('.ms-tooltip') as HTMLElement
    expect(tooltip.textContent).toBe('Tooltip content')
    expect(tooltip.dataset.visible).toBe('true')
    expect(tooltip.dataset.dark).toBe('true')
    expect(tooltip.style.transform).toContain('translate3d(')
    expect(anchor.getAttribute('aria-describedby')).toBe(tooltip.id)
    expect(isTooltipVisible()).toBe(true)
    hideTooltip(true)
    expect(tooltip.dataset.visible).toBe('false')
    expect(anchor.hasAttribute('aria-describedby')).toBe(false)
    expect(isTooltipVisible()).toBe(false)
    anchor.remove()
  })

  it('exposes shared rich-block CSS sizing helpers', () => {
    expect(resolveCssSize(12)).toBe('12px')
    expect(resolveCssSize(undefined, '100%')).toBe('100%')
  })

  it('matches Svelte render-window limits', () => {
    expect(resolveVirtualizationEnabled(321, 320)).toBe(true)
    expect(resolveVirtualizationEnabled(321, 0)).toBe(false)
    expect(resolveDeferNodes({ parsedNodeCount: 3, virtualizationEnabled: false })).toBe(true)
    expect(resolveDeferNodes({ parsedNodeCount: 901, virtualizationEnabled: false })).toBe(false)
    expect(computeLiveRange(1000, 500, 20, 10)).toEqual({ start: 491, end: 511 })
  })

  it('ignores stale Mermaid completion after the code changes', async () => {
    let resolveLoader!: (value: unknown) => void
    setMermaidLoader(() => new Promise((resolve) => {
      resolveLoader = resolve
    }))
    const container = document.createElement('div')
    let setCode!: (value: string) => void
    const App = () => {
      const [code, set] = createSignal('graph TD; A-->B')
      setCode = set
      return <MarkdownRender nodes={[{ type: 'code_block', language: 'mermaid', code: code() } as any]} final />
    }
    const dispose = render(() => <App />, container)
    setCode('graph TD; C-->D')
    resolveLoader({ render: async (_id: string, source: string) => `<svg><text>${source}</text></svg>` })
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(container.textContent).toContain('C-->D')
    expect(container.textContent).not.toContain('A-->B')
    dispose()
    disableMermaid()
  })

  it('exposes Mermaid source, collapse, and zoom controls', async () => {
    setMermaidLoader(() => ({ render: () => '<svg><text>Mermaid</text></svg>' }))
    const container = document.createElement('div')
    const dispose = render(() => <MarkdownRender nodes={[{ type: 'code_block', language: 'mermaid', code: 'graph TD; A-->B' } as any]} final />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(container.querySelector('.mermaid-render svg')).not.toBeNull()
    ;(Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Source') as HTMLButtonElement).click()
    await flushAsyncRendering()
    expect(container.querySelector('.mermaid-source-fallback')?.textContent).toContain('graph TD')
    ;(container.querySelector('button[aria-label="Collapse"]') as HTMLButtonElement).click()
    await flushAsyncRendering()
    expect((container.querySelector('.mermaid-source-fallback') as HTMLElement | null)?.hidden).toBe(true)
    ;(container.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement).click()
    expect(container.querySelector('button[aria-label="Reset zoom"]')).not.toBeNull()
    dispose()
    disableMermaid()
  })

  it('binds Mermaid interactions only when explicitly enabled', async () => {
    const bindFunctions = vi.fn()
    setMermaidLoader(() => ({ render: () => ({ svg: '<svg><text>Mermaid</text></svg>', bindFunctions }) }))
    const disabledContainer = document.createElement('div')
    const disabledDispose = render(() => <MermaidBlockNode node={{ type: 'code_block', language: 'mermaid', code: 'graph TD; A-->B' } as any} />, disabledContainer)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(bindFunctions).not.toHaveBeenCalled()
    disabledDispose()

    const enabledContainer = document.createElement('div')
    const enabledDispose = render(() => <MermaidBlockNode node={{ type: 'code_block', language: 'mermaid', code: 'graph TD; A-->B' } as any} enableMermaidInteractions />, enabledContainer)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(bindFunctions).toHaveBeenCalledWith(enabledContainer.querySelector('.mermaid-render'))
    enabledDispose()
    disableMermaid()
  })

  it('uses an injected Mermaid worker prefix while streaming incomplete input', async () => {
    class MermaidWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage(message: { id: string, action: string }) {
        const result = message.action === 'canParse' ? false : 'graph TD; A-->B'
        queueMicrotask(() => this.onmessage?.({ data: { id: message.id, ok: true, result } } as MessageEvent))
      }

      terminate() {}
    }
    setMermaidWorker(new MermaidWorker() as unknown as Worker)
    const renderDiagram = vi.fn((_id: string, _source: string) => '<svg><text>Worker preview</text></svg>')
    setMermaidLoader(() => ({ render: renderDiagram }))
    const container = document.createElement('div')
    const dispose = render(() => <MermaidBlockNode node={{ type: 'code_block', language: 'mermaid', code: 'graph TD; A-->B\nA-->' } as any} loading renderDebounceMs={0} />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(renderDiagram).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('graph TD; A-->B'))
    expect(renderDiagram.mock.calls[0][1]).not.toContain('A-->\n')
    dispose()
    disableMermaid()
  })

  it('uses Svelte-compatible Mermaid preview height defaults', async () => {
    setMermaidLoader(() => ({ render: () => '<svg><text>Mermaid</text></svg>' }))
    const container = document.createElement('div')
    const dispose = render(() => <MermaidBlockNode node={{ type: 'code_block', language: 'mermaid', code: 'graph TD\nA --> B' } as any} />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    const preview = container.querySelector('.mermaid-render') as HTMLElement
    expect(preview.style.maxHeight).toBe('500px')
    expect(preview.style.minHeight).toBe('360px')
    dispose()
    disableMermaid()
  })

  it('coalesces streaming Mermaid renders with the Svelte debounce default', async () => {
    vi.useFakeTimers()
    const renderDiagram = vi.fn(() => '<svg><text>Mermaid</text></svg>')
    setMermaidLoader(() => ({ render: renderDiagram }))
    const container = document.createElement('div')
    let setCode!: (value: string) => void
    const App = () => {
      const [code, set] = createSignal('graph TD\nA --> B')
      setCode = set
      return <MermaidBlockNode node={{ type: 'code_block', language: 'mermaid', code: code(), loading: true } as any} />
    }
    const dispose = render(() => <App />, container)
    setCode('graph TD\nA --> C')
    await vi.advanceTimersByTimeAsync(299)
    expect(renderDiagram).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(renderDiagram).toHaveBeenCalledTimes(1)
    dispose()
    disableMermaid()
    vi.useRealTimers()
  })

  it('does not let a stale KaTeX load overwrite newer math', async () => {
    let resolveLoader!: (value: unknown) => void
    setKatexLoader(() => new Promise((resolve) => {
      resolveLoader = resolve
    }))
    const container = document.createElement('div')
    let setContent!: (value: string) => void
    const App = () => {
      const [content, set] = createSignal('$a$')
      setContent = set
      return <MarkdownRender content={content()} final />
    }
    const dispose = render(() => <App />, container)
    setContent('$b$')
    resolveLoader({ renderToString: (source: string) => `<span class="katex">${source}</span>` })
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(container.textContent).toContain('b')
    expect(container.textContent).not.toContain('a')
    dispose()
    disableKatex()
  })

  it('uses an injected KaTeX worker before the main-thread renderer', async () => {
    clearKaTeXWorker()
    class KaTeXWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage(message: { id?: string, type?: string, content?: string, displayMode?: boolean }) {
        if (message.type !== 'render')
          return
        queueMicrotask(() => this.onmessage?.({ data: { id: message.id, content: message.content, displayMode: message.displayMode, html: '<span class="katex">worker math</span>' } } as MessageEvent))
      }

      terminate() {}
    }
    setKaTeXWorker(new KaTeXWorker() as unknown as Worker)
    const mainThreadRenderer = vi.fn(() => '<span class="katex">main thread</span>')
    setKatexLoader(() => ({ renderToString: mainThreadRenderer }))
    const container = document.createElement('div')
    const dispose = render(() => <MathInlineNode node={{ type: 'math_inline', content: 'x' } as any} />, container)
    await vi.waitFor(() => expect(container.textContent).toContain('worker math'))
    expect(mainThreadRenderer).not.toHaveBeenCalled()
    dispose()
    clearKaTeXWorker()
    disableKatex()
  })

  it('rejects pending KaTeX worker work when the worker is cleared', async () => {
    clearKaTeXWorker()
    class SilentWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null
      postMessage() {}
      terminate() {}
    }
    setKatexLoader(() => ({ renderToString: () => '<span class="katex">main thread</span>' }))
    setKaTeXWorker(new SilentWorker() as unknown as Worker)
    const pending = renderKaTeXInWorker('x', false, 10_000)
    clearKaTeXWorker()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    disableKatex()
  })

  it('keeps final math readable when KaTeX is unavailable', async () => {
    disableKatex()
    const container = document.createElement('div')
    const dispose = render(() => <MathInlineNode node={{ type: 'math_inline', content: 'x^2', raw: '$x^2$', loading: false } as any} />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(container.textContent).toContain('$x^2$')
    dispose()
  })

  it('shows source fallbacks when optional diagram peers are unavailable', async () => {
    disableMermaid()
    disableD2()
    disableInfographic()
    const container = document.createElement('div')
    const dispose = render(() => (
      <>
        <MermaidBlockNode node={{ type: 'code_block', language: 'mermaid', code: 'graph TD; A-->B' } as any} />
        <D2BlockNode node={{ type: 'code_block', language: 'd2', code: 'A -> B' } as any} />
        <InfographicBlockNode node={{ type: 'code_block', language: 'infographic', code: 'infographic list-row' } as any} />
      </>
    ), container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(container.querySelector('.mermaid-source-fallback')?.textContent).toContain('graph TD')
    expect(container.querySelector('.d2-source-fallback')?.textContent).toContain('A -> B')
    expect(container.querySelector('.infographic-source-fallback')?.textContent).toContain('infographic')
    dispose()
  })

  it('ignores stale D2 rendering after its source changes', async () => {
    const firstRender = Promise.withResolvers<string>()
    setD2Loader(() => ({
      compile: (source: string) => ({ diagram: source }),
      render: (source: string) => source === 'first' ? firstRender.promise : `<svg><text>${source}</text></svg>`,
    }))
    const container = document.createElement('div')
    let setCode!: (value: string) => void
    const App = () => {
      const [code, set] = createSignal('first')
      setCode = set
      return <D2BlockNode node={{ type: 'code_block', language: 'd2', code: code() } as any} />
    }
    const dispose = render(() => <App />, container)
    await flushAsyncRendering()
    setCode('second')
    await flushAsyncRendering()
    firstRender.resolve('<svg><text>first</text></svg>')
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(container.querySelector('.d2-svg')?.textContent).toContain('second')
    expect(container.querySelector('.d2-svg')?.textContent).not.toContain('first')
    dispose()
    disableD2()
  })

  it('coalesces D2 streaming updates to the latest progressive source', async () => {
    vi.useFakeTimers()
    const renderDiagram = vi.fn((source: string) => `<svg><text>${source}</text></svg>`)
    setD2Loader(() => ({ compile: (source: string) => ({ diagram: source }), render: renderDiagram }))
    const container = document.createElement('div')
    let setCode!: (value: string) => void
    const App = () => {
      const [code, set] = createSignal('first')
      setCode = set
      return <D2BlockNode node={{ type: 'code_block', language: 'd2', code: code(), loading: true } as any} progressiveIntervalMs={100} />
    }
    const dispose = render(() => <App />, container)
    await vi.advanceTimersByTimeAsync(0)
    setCode('second')
    setCode('third')
    await vi.advanceTimersByTimeAsync(100)
    expect(renderDiagram).toHaveBeenLastCalledWith('third', expect.any(Object))
    dispose()
    disableD2()
    vi.useRealTimers()
  })

  it('coalesces Infographic streaming updates to the latest progressive source', async () => {
    vi.useFakeTimers()
    const renderInfographic = vi.fn()
    class Infographic {
      destroy = vi.fn()
      on = vi.fn()

      render(source: string) {
        return renderInfographic(source)
      }
    }
    setInfographicLoader(() => Infographic)
    const container = document.createElement('div')
    let setCode!: (value: string) => void
    const App = () => {
      const [code, set] = createSignal('first')
      setCode = set
      return <InfographicBlockNode node={{ type: 'code_block', language: 'infographic', code: code(), loading: true } as any} progressiveIntervalMs={100} />
    }
    const dispose = render(() => <App />, container)
    await vi.advanceTimersByTimeAsync(0)
    setCode('second')
    setCode('third')
    await vi.advanceTimersByTimeAsync(100)
    expect(renderInfographic).toHaveBeenLastCalledWith('third')
    dispose()
    disableInfographic()
    vi.useRealTimers()
  })

  it('applies the D2 dark theme overrides while preserving renderer options', async () => {
    const renderDiagram = vi.fn(() => '<svg><text>D2</text></svg>')
    setD2Loader(() => ({
      compile: () => ({ diagram: 'graph', renderOptions: { themeOverrides: { B1: '#000000' } } }),
      render: renderDiagram,
    }))
    const container = document.createElement('div')
    const dispose = render(() => <D2BlockNode node={{ type: 'code_block', language: 'd2', code: 'graph' } as any} isDark themeId={1} darkThemeId={200} />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(renderDiagram).toHaveBeenCalledWith('graph', expect.objectContaining({
      themeID: 200,
      darkThemeID: null,
      darkThemeOverrides: null,
      themeOverrides: expect.objectContaining({ N1: '#E5E7EB', B1: '#000000' }),
    }))
    dispose()
    disableD2()
  })

  it('exposes D2 source and collapse controls without hiding the fallback', async () => {
    setD2Loader(() => ({
      compile: (source: string) => ({ diagram: source }),
      render: (source: string) => `<svg><text>${source}</text></svg>`,
    }))
    const container = document.createElement('div')
    const dispose = render(() => <D2BlockNode node={{ type: 'code_block', language: 'd2', code: 'Solid -> D2' } as any} />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    const source = container.querySelector('button')
    expect(source?.textContent).toBe('Preview')
    expect(container.querySelector('button[aria-label="Copy"]')).not.toBeNull()
    ;(Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Source') as HTMLButtonElement).click()
    await flushAsyncRendering()
    expect(container.querySelector('.d2-source-fallback')?.textContent).toContain('Solid -> D2')
    ;(container.querySelector('button[aria-label="Collapse"]') as HTMLButtonElement).click()
    await flushAsyncRendering()
    expect((container.querySelector('.d2-source-fallback') as HTMLElement | null)?.hidden).toBe(true)
    dispose()
    disableD2()
  })

  it('shows D2 source while an asynchronous render has not produced SVG output', async () => {
    const deferred = Promise.withResolvers<string>()
    setD2Loader(() => ({ compile: (source: string) => ({ diagram: source }), render: () => deferred.promise }))
    const container = document.createElement('div')
    const dispose = render(() => <D2BlockNode node={{ type: 'code_block', language: 'd2', code: 'Solid -> D2' } as any} />, container)
    await flushAsyncRendering()
    expect(container.querySelector('[data-markstream-mode]')?.getAttribute('data-markstream-mode')).toBe('fallback')
    expect((container.querySelector('.d2-source-fallback') as HTMLElement).hidden).toBe(false)
    deferred.resolve('<svg><text>Solid</text></svg>')
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(container.querySelector('[data-markstream-mode]')?.getAttribute('data-markstream-mode')).toBe('preview')
    dispose()
    disableD2()
  })

  it('reuses and unmounts Infographic instances during source updates', async () => {
    const renderDiagram = vi.fn(function (this: { container: HTMLElement }, source: string) {
      this.container.innerHTML = `<svg><text>${source}</text></svg>`
    })
    const destroy = vi.fn()
    const instances: unknown[] = []
    class Infographic {
      container: HTMLElement
      constructor(options: { container: HTMLElement }) {
        this.container = options.container
        instances.push(this)
      }

      render(source: string) {
        return renderDiagram.call(this, source)
      }

      destroy = destroy
    }
    setInfographicLoader(() => Infographic)
    const container = document.createElement('div')
    let setCode!: (value: string) => void
    const App = () => {
      const [code, set] = createSignal('first')
      setCode = set
      return <InfographicBlockNode node={{ type: 'code_block', language: 'infographic', code: code() } as any} />
    }
    const dispose = render(() => <App />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    setCode('second')
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(instances).toHaveLength(1)
    expect(destroy).not.toHaveBeenCalled()
    expect(container.querySelector('.infographic-render')?.textContent).toContain('second')
    dispose()
    expect(destroy).toHaveBeenCalledTimes(1)
    disableInfographic()
  })

  it('uses Svelte-compatible Infographic preview height defaults', async () => {
    setInfographicLoader(() => class {
      render() {}
      destroy() {}
    })
    const container = document.createElement('div')
    const dispose = render(() => <InfographicBlockNode node={{ type: 'code_block', language: 'infographic', code: '- one\n- two\n- three' } as any} />, container)
    await flushAsyncRendering()
    const preview = container.querySelector('.infographic-render') as HTMLElement
    expect(preview.style.maxHeight).toBe('500px')
    expect(preview.style.minHeight).toBe('500px')
    dispose()
    disableInfographic()
  })

  it('exposes Infographic source and collapse controls', async () => {
    class Infographic {
      constructor(private readonly options: { container: HTMLElement }) {}

      render(source: string) {
        this.options.container.innerHTML = `<svg><text>${source}</text></svg>`
      }
    }
    setInfographicLoader(() => Infographic)
    const container = document.createElement('div')
    const dispose = render(() => <InfographicBlockNode node={{ type: 'code_block', language: 'infographic', code: 'infographic list-row-simple-horizontal-arrow' } as any} />, container)
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(container.querySelector('.infographic-render svg')).not.toBeNull()
    ;(Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Source') as HTMLButtonElement).click()
    await flushAsyncRendering()
    expect(container.querySelector('.infographic-source-fallback')?.textContent).toContain('infographic')
    ;(container.querySelector('button[aria-label="Collapse"]') as HTMLButtonElement).click()
    await flushAsyncRendering()
    expect((container.querySelector('.infographic-source-fallback') as HTMLElement | null)?.hidden).toBe(true)
    ;(container.querySelector('button[aria-label="Zoom in"]') as HTMLButtonElement).click()
    expect(container.querySelector('button[aria-label="Fullscreen"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Reset zoom"]')).not.toBeNull()
    dispose()
    disableInfographic()
  })

  it('exposes code-block controls without replacing the fallback content', () => {
    disableStreamDiffs()
    const container = document.createElement('div')
    const dispose = render(() => <CodeBlockNode node={{ type: 'code_block', language: 'html', code: '<p>preview</p>' } as any} />, container)
    expect(container.querySelector('.code-block-header')).not.toBeNull()
    expect(container.querySelector('.pre-code-node')?.textContent).toContain('preview')
    expect(container.querySelector('button[aria-label="Preview"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="Copy"]')).not.toBeNull()
    dispose()
    enableStreamDiffs()
  })

  it('keeps line numbers in the CodeBlock pre fallback when requested', () => {
    disableStreamDiffs()
    const container = document.createElement('div')
    const dispose = render(() => <CodeBlockNode node={{ type: 'code_block', language: 'text', code: 'first\nsecond' } as any} showLineNumbers />, container)
    expect(container.querySelector('.pre-code-node--with-line-numbers')).not.toBeNull()
    expect(container.querySelector('.pre-code-node__line-numbers')?.textContent).toBe('1\n2\n')
    dispose()
    enableStreamDiffs()
  })

  it('defers editor creation until a streaming language prefix is complete', async () => {
    const createEditor = vi.fn()
    setStreamDiffsLoader(() => ({ createCodeBlockRuntime: () => ({ createEditor, updateCode: vi.fn() }) }))
    const container = document.createElement('div')
    let setNode!: (node: any) => void
    const App = () => {
      const [node, set] = createSignal<any>({ type: 'code_block', language: 'typ', code: 'const value = 1', loading: true })
      setNode = set
      return <CodeBlockNode node={node()} />
    }
    const dispose = render(() => <App />, container)
    await flushAsyncRendering()
    expect(createEditor).not.toHaveBeenCalled()
    setNode({ type: 'code_block', language: 'typescript', code: 'const value = 1', loading: true })
    await flushAsyncRendering()
    await flushAsyncRendering()
    expect(createEditor).toHaveBeenCalledWith(expect.any(HTMLElement), 'const value = 1', 'typescript')
    dispose()
    enableStreamDiffs()
  })

  it('reuses a code-block runtime and cleans it up with its owner', async () => {
    const createEditor = vi.fn()
    const updateCode = vi.fn()
    const cleanupEditor = vi.fn()
    setStreamDiffsLoader(() => ({
      createCodeBlockRuntime: () => ({ createEditor, updateCode, cleanupEditor }),
    }))
    const container = document.createElement('div')
    let setCode!: (code: string) => void
    const App = () => {
      const [code, set] = createSignal('one')
      setCode = set
      return <CodeBlockNode node={{ type: 'code_block', language: 'typescript', code: code() } as any} />
    }
    const dispose = render(() => <App />, container)
    await flushAsyncRendering()
    expect(createEditor).toHaveBeenCalledTimes(1)
    setCode('two')
    await flushAsyncRendering()
    expect(createEditor).toHaveBeenCalledTimes(1)
    expect(updateCode).toHaveBeenCalledWith('two', 'typescript')
    dispose()
    expect(cleanupEditor).toHaveBeenCalledTimes(1)
    enableStreamDiffs()
  })
})
