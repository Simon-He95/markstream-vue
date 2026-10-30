import type { MarkdownRenderProps } from '../src'
import { createEffect, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownRender, { clearGlobalCustomComponents, setCustomComponents } from '../src'

const runtime = vi.hoisted(() => ({
  createEditor: vi.fn(),
  updateCode: vi.fn(),
  cleanupEditor: vi.fn(),
  setTheme: vi.fn(),
}))
vi.mock('../src/optional/streamDiffs', () => ({ getStreamDiffsRuntime: async () => ({ createCodeBlockRuntime: () => runtime }) }))
vi.mock('../src/enhanceRenderedHtml', () => ({ enhanceRenderedHtml: async () => ({ dispose: vi.fn() }) }))
const cleanups: Array<() => void> = []
function mount(initial: MarkdownRenderProps = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const [props, setProps] = createSignal<MarkdownRenderProps>({ smoothStreaming: false, batchRendering: false, ...initial })
  const dispose = render(() => <MarkdownRender {...props()} />, host)
  cleanups.push(() => {
    dispose()
    host.remove()
  })
  return { host, dispose, update: (next: Partial<MarkdownRenderProps>) => setProps(previous => ({ ...previous, ...next })) }
}
const corpus = '# 中文 streaming 🚀\n\nHello **world** and *Solid* with `code`.\n\n- first\n- second\n\n> quote\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```typescript\nconst answer = 42\n```\n\n[link](https://example.com)\n'
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() { }
    disconnect() { }
  })
  vi.clearAllMocks()
})
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  clearGlobalCustomComponents()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
function semanticHtml(host: HTMLElement) {
  const clone = host.cloneNode(true) as HTMLElement
  for (const node of clone.querySelectorAll('.text-node-stream-delta'))
    node.replaceWith(document.createTextNode(node.textContent ?? ''))
  for (const node of clone.querySelectorAll('*')) {
    for (const attribute of [...node.attributes]) {
      if (attribute.name !== 'href' && attribute.name !== 'src' && attribute.name !== 'alt')
        node.removeAttribute(attribute.name)
    }
  }
  return clone.innerHTML.replace(/<!--.*?-->/gs, '')
}
describe('solid renderer streaming and restore', () => {
  it.each([1, 7, 64, 1024])('matches direct final rendering with chunk size %i', async (size) => {
    const direct = mount({ content: corpus, final: true, renderCodeBlocksAsPre: true })
    const streaming = mount({ content: '', final: false, renderCodeBlocksAsPre: true })
    for (let end = size; end < corpus.length + size; end += size)
      streaming.update({ content: corpus.slice(0, end) })
    streaming.update({ final: true })
    expect(semanticHtml(streaming.host)).toBe(semanticHtml(direct.host))
    expect(streaming.host.querySelector('h1')?.textContent).toBe('中文 streaming 🚀')
    expect(streaming.host.querySelector('strong')?.textContent).toBe('world')
    expect(streaming.host.querySelectorAll('li')).toHaveLength(2)
    expect(streaming.host.querySelector('code.language-typescript')?.textContent).toContain('const answer = 42')
  })
  it('keeps settled paragraphs, text and code elements during appends', () => {
    const view = mount({ content: 'settled\n\n```ts\nlet a', final: false, renderCodeBlocksAsPre: true })
    const paragraph = view.host.querySelector('p')
    const text = paragraph?.querySelector('.text-node')
    const code = view.host.querySelector('pre code')
    const root = view.host.firstElementChild
    const slot = view.host.querySelector('.node-slot')
    view.update({ content: 'settled\n\n```ts\nlet a = 1\n```\n\nnext', final: false })
    expect(view.host.firstElementChild, 'root identity').toBe(root)
    expect(view.host.querySelector('.node-slot'), 'slot identity').toBe(slot)
    expect(view.host.querySelector('p')).toBe(paragraph)
    expect(view.host.querySelector('p .text-node')).toBe(text)
    expect(view.host.querySelector('pre code')).toBe(code)
    expect(code?.textContent).toContain('let a = 1')
  })
  it('updates an existing stream-diffs runtime instead of recreating it', async () => {
    const view = mount({ content: '```ts\nlet a\n```', final: false })
    await vi.waitFor(() => expect(runtime.createEditor).toHaveBeenCalledTimes(1))
    view.update({ content: '```ts\nlet a = 1\n```', final: true })
    await vi.waitFor(() => expect(runtime.updateCode).toHaveBeenCalledWith('let a = 1', 'typescript'))
    expect(runtime.createEditor).toHaveBeenCalledTimes(1)
    view.dispose()
    expect(runtime.cleanupEditor).toHaveBeenCalled()
  })
  it('does not update settled code when only a following paragraph changes', async () => {
    const prefix = '```ts\nconst x = 1\n```\n\n'
    const view = mount({ content: `${prefix}tail`, final: false })
    await vi.waitFor(() => expect(runtime.createEditor).toHaveBeenCalledTimes(1))
    runtime.updateCode.mockClear()
    view.update({ content: `${prefix}tail appended` })
    await Promise.resolve()
    await Promise.resolve()
    expect(runtime.updateCode).not.toHaveBeenCalled()
  })
  it('replaces, clears, restores, then resumes streaming without stale content', () => {
    const view = mount({ content: corpus, final: true, renderCodeBlocksAsPre: true })
    view.update({ content: 'replacement', final: false })
    expect(view.host.textContent).toBe('replacement')
    view.update({ content: '' })
    expect(view.host.textContent).toBe('')
    view.update({ content: '# restored\n\nbody', final: true })
    expect(view.host.querySelector('h1')?.textContent).toBe('restored')
    view.update({ content: '# restored\n\nbody appended', final: false })
    expect(view.host.querySelector('p')?.textContent).toBe('body appended')
    view.update({ final: true })
    view.update({ final: true })
    expect(view.host.querySelectorAll('p')).toHaveLength(1)
  })
  it('uses non-empty nodes first and falls back to content for an empty nodes array', () => {
    const view = mount({ content: 'ignored', nodes: [{ type: 'text', content: 'AST' }], final: true })
    expect(view.host.textContent).toBe('AST')
    view.update({ nodes: [] })
    expect(view.host.textContent).toBe('ignored')
    view.update({ nodes: undefined })
    expect(view.host.textContent).toBe('ignored')
  })
  it('updates earlier reference links when a later definition changes', () => {
    const view = mount({ content: '[earlier][target]\n\nTail', final: false })
    expect(view.host.querySelector('a')).toBeNull()
    view.update({ content: '[earlier][target]\n\nTail\n\n[target]: https://example.com/one', final: true })
    expect(view.host.querySelector('a')?.getAttribute('href')).toBe('https://example.com/one')
    view.update({ content: '[earlier][target]\n\nTail\n\n[target]: https://example.com/two' })
    expect(view.host.querySelector('a')?.getAttribute('href')).toBe('https://example.com/two')
  })

  it('does not propagate appended tail updates through unchanged parser nodes', () => {
    const observed: string[] = []
    const Paragraph = (props: any) => {
      createEffect(() => observed.push(props.node.raw))
      return <p>{props.node.raw}</p>
    }
    const view = mount({ content: 'settled prefix\n\nstreamed tail', final: false, customComponents: { paragraph: Paragraph } })
    const prefixUpdates = observed.filter(value => value.startsWith('settled prefix')).length
    expect(prefixUpdates).toBe(1)
    view.update({ content: 'settled prefix\n\nstreamed tail appended' })
    expect(observed.filter(value => value.startsWith('settled prefix'))).toHaveLength(prefixUpdates)
    expect(view.host.textContent).toContain('streamed tail appended')
  })

  it('honors parseOptions.final and custom parser plugins', () => {
    const plugin = vi.fn(md => md)
    const view = mount({ content: '**incomplete', parseOptions: { final: true }, customMarkdownIt: plugin })
    expect(plugin).toHaveBeenCalled()
    expect(view.host.textContent).toContain('incomplete')
  })
  it('updates global/scoped/local native Solid custom components', () => {
    const A = (props: any) => <aside data-custom="a">{props.node.content}</aside>
    const B = (props: any) => <aside data-custom="b">{props.node.content}</aside>
    setCustomComponents({ thinking: A })
    const view = mount({ content: '<thinking>reasoning</thinking>', customHtmlTags: ['thinking'] })
    expect(view.host.querySelector('[data-custom="a"]')?.textContent).toContain('reasoning')
    setCustomComponents({ thinking: B })
    expect(view.host.querySelector('[data-custom="b"]')).not.toBeNull()
    setCustomComponents('scoped', { thinking: A })
    view.update({ customId: 'scoped' })
    expect(view.host.querySelector('[data-custom="a"]')).not.toBeNull()
    view.update({ customId: undefined })
    expect(view.host.querySelector('[data-custom="b"]')).not.toBeNull()
    view.update({ customComponents: { thinking: A } })
    expect(view.host.querySelector('[data-custom="a"]')).not.toBeNull()
  })
  it('renders custom nodes nested in native HTML and supports token attributes', () => {
    const custom = (props: any) => <aside>{props.node.content}</aside>
    const view = mount({ nodes: [{ type: 'html_block', tag: 'div', attrs: { id: 'wrapper' }, children: [{ type: 'thinking', content: 'nested' }] }], customComponents: { thinking: custom } })
    expect(view.host.querySelector('div#wrapper aside')?.textContent, view.host.innerHTML).toBe('nested')
    view.update({ nodes: [{ type: 'heading', level: 2, attrs: [['id', 'heading'], ['onclick', 'bad()']], children: [{ type: 'text', content: 'title' }] }] })
    expect(view.host.querySelector('h2#heading')?.textContent).toBe('title')
    expect(view.host.querySelector('[onclick]')).toBeNull()
  })
  it('keeps language overrides and their heavy-node props ahead of the native pre path', () => {
    const diagram = (props: any) => <aside data-height={props.maxHeight}>{props.node.code}</aside>
    const view = mount({ content: '```mermaid\nflowchart LR\nA --> B\n```', final: true, renderCodeBlocksAsPre: true, customComponents: { mermaid: diagram }, mermaidProps: { maxHeight: '240px' } })
    expect(view.host.querySelector('aside')?.getAttribute('data-height')).toBe('240px')
    const code = (props: any) => <aside data-theme={props.lightTheme}>{props.node.code}</aside>
    view.update({ content: '```ts\nconst x = 1\n```', customComponents: { typescript: code }, codeBlockLightTheme: 'github-light' })
    expect(view.host.querySelector('aside')?.getAttribute('data-theme')).toBe('github-light')
    expect(view.host.querySelector('pre')).toBeNull()
  })

  it('sanitizes HTML, URLs, images and heading attributes', () => {
    const view = mount({ content: '<div onclick="alert(1)"><script>alert(1)</script>safe</div>\n\n[bad](javascript:alert(1))\n\n![bad](javascript:alert(1))', final: true })
    expect(view.host.querySelector('script')).toBeNull()
    expect(view.host.querySelector('[onclick]')).toBeNull()
    expect(view.host.querySelector('[href^="javascript:"]')).toBeNull()
    expect(view.host.querySelector('[src^="javascript:"]')).toBeNull()
  })
  it('escapes raw HTML when requested', () => {
    const view = mount({ content: '<div>safe</div>', htmlPolicy: 'escape', final: true })
    expect(view.host.textContent).toContain('<div>safe</div>')
    expect(view.host.querySelector('.rich-node div')).toBeNull()
  })
  it('batches full history restoration and cancels pending work on unmount', async () => {
    vi.useFakeTimers()
    const content = Array.from({ length: 200 }, (_, index) => `paragraph ${index}`).join('\n\n')
    const view = mount({ content, final: true, batchRendering: true, initialRenderBatchSize: 8, renderBatchSize: 12, maxLiveNodes: 0 })
    expect(view.host.querySelectorAll('.node-slot')).toHaveLength(8)
    await vi.advanceTimersByTimeAsync(1000)
    expect(view.host.querySelectorAll('.node-slot')).toHaveLength(200)
    view.update({ content: `${content}\n\nmore` })
    view.dispose()
    await vi.runAllTimersAsync()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('bounds mounted nodes for large histories', () => {
    const content = Array.from({ length: 1200 }, (_, index) => `paragraph ${index}`).join('\n\n')
    const view = mount({ content, final: true, maxLiveNodes: 60, liveNodeBuffer: 10 })
    expect(view.host.querySelectorAll('.node-slot').length).toBeLessThanOrEqual(60)
    expect(view.host.querySelector('.virtual-spacer')).not.toBeNull()
    expect(view.host.querySelector('.markdown-renderer')?.getAttribute('data-total-nodes')).toBe('1200')
  })
  it('drains smooth streaming on final and resets a non-append replacement', async () => {
    vi.useFakeTimers()
    const view = mount({ content: '', final: false, smoothStreaming: true, smoothStreamingOptions: { flushOnFinish: true } })
    view.update({ content: corpus, final: true })
    await vi.advanceTimersByTimeAsync(1000)
    expect(view.host.querySelector('.markdown-renderer')?.getAttribute('data-stream-caught-up')).toBe('true')
    expect(view.host.textContent).toContain('中文 streaming 🚀')
    view.update({ content: 'new answer', final: false })
    await vi.advanceTimersByTimeAsync(1000)
    expect(view.host.textContent).toBe('new answer')
    view.dispose()
    await vi.runAllTimersAsync()
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['simple', 'precise'] as const)('clears the %s cursor when final arrives and on unmount', async (mode) => {
    vi.useFakeTimers()
    const view = mount({ content: '', final: false, typewriter: mode })
    view.update({ content: 'streamed cursor' })
    await vi.advanceTimersByTimeAsync(20)
    const selector = mode === 'simple' ? '.typewriter-simple-cursor-target' : '.typewriter-cursor'
    expect(view.host.querySelector(selector)).not.toBeNull()
    view.update({ final: true })
    expect(view.host.querySelector(selector)).toBeNull()
    view.dispose()
    await vi.runAllTimersAsync()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('disposes a runtime whose async creation finishes after unmount', async () => {
    let finish!: () => void
    runtime.createEditor.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    const view = mount({ content: '```ts\nconst x = 1\n```', final: true })
    await vi.waitFor(() => expect(runtime.createEditor).toHaveBeenCalled())
    view.dispose()
    finish()
    await Promise.resolve()
    await Promise.resolve()
    expect(runtime.cleanupEditor).toHaveBeenCalled()
  })
})
