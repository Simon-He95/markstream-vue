import type { SolidCodeBlockNodeProps } from '../src'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownRender, { CodeBlockNode, HtmlPreviewFrame, PreCodeNode } from '../src'

const state = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), cleanup: vi.fn(), options: vi.fn(), theme: vi.fn(), finalize: vi.fn(), available: true }))
vi.mock('../src/optional/streamDiffs', () => ({ getStreamDiffsRuntime: async () => state.available
  ? { createCodeBlockRuntime: (options: any) => {
      state.options(options)
      let host: HTMLElement
      return {
        createEditor: async (element: HTMLElement, source: string, language: string) => {
          host = element
          element.textContent = source
          state.create(element, source, language)
        },
        updateCode: async (source: string, language: string) => {
          host.textContent = source
          state.update(source, language)
        },
        cleanupEditor: state.cleanup,
        setTheme: state.theme,
        finalizeCode: state.finalize,
        getEditorView: () => ({ updateOptions: state.options }),
        whenVisualReady: async () => true,
      }
    } }
  : null }))
let dispose: (() => void) | undefined
let host: HTMLDivElement
const htmlNode = { type: 'code_block' as const, code: '<h1>Preview</h1>', raw: '```html\n<h1>Preview</h1>\n```', language: 'html', loading: false }
function mount(initial: SolidCodeBlockNodeProps & {
  onCopy?: (source: string) => void
  onPreviewCode?: (event: any) => void
} = { node: htmlNode }) {
  const [props, update] = createSignal(initial)
  dispose = render(() => <CodeBlockNode {...props()} />, host)
  return (next: Partial<typeof initial>) => update(previous => ({ ...previous, ...next }))
}
function click(label: string, role?: string) {
  const target = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.getAttribute('aria-label') === label && (!role || button.getAttribute('role') === role))
  expect(target, label).toBeDefined()
  target!.click()
  return target!
}
function more() {
  click('More')
}
beforeEach(() => {
  state.available = true
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class {
    observe() { }
    disconnect() { }
  })
  host = document.createElement('div')
  document.body.append(host)
})
afterEach(() => {
  dispose?.()
  dispose = undefined
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('vue 3 code toolbar parity', () => {
  it('preserves the editor across collapse, expand, font changes and theme changes', async () => {
    const update = mount()
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    const editor = host.querySelector('.code-block-editor')
    click('Collapse')
    expect((host.querySelector('.code-block-body') as HTMLElement).style.display).toBe('none')
    click('Expand')
    more()
    click('Font size +')
    await vi.waitFor(() => expect(state.options).toHaveBeenCalledWith(expect.objectContaining({ fontSize: 13 })))
    click('Font size reset')
    click('Expand', 'menuitem')
    expect(host.querySelector('.is-expanded')).not.toBeNull()
    update({ isDark: true, theme: { dark: 'github-dark', light: 'github-light' } })
    await vi.waitFor(() => expect(state.theme).toHaveBeenCalledWith('github-dark'))
    expect(host.querySelector('.code-block-editor')).toBe(editor)
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(state.cleanup).not.toHaveBeenCalled()
  })
  it('supports native header render slots in place of the default toolbar', () => {
    mount({ node: htmlNode, headerLeft: <strong>Custom file title</strong>, headerRight: () => <button type="button" data-header-action>Custom action</button> })
    expect(host.querySelector('.code-block-header strong')?.textContent).toBe('Custom file title')
    expect(host.querySelector('[data-header-action]')?.textContent).toBe('Custom action')
    expect(host.querySelector('[aria-label="More"]')).toBeNull()
    expect(host.querySelector('[aria-label="Copy"]')).toBeNull()
  })
  it('honors all toolbar visibility flags and width controls', () => {
    const update = mount({ node: htmlNode, showCopyButton: false, showCollapseButton: false, showExpandButton: false, showFontSizeButtons: false, showPreviewButton: false, minWidth: 240, maxWidth: '90%' })
    expect(host.querySelectorAll('button')).toHaveLength(0)
    expect((host.firstElementChild as HTMLElement).style.minWidth).toBe('240px')
    expect((host.firstElementChild as HTMLElement).style.maxWidth).toBe('90%')
    update({ showHeader: false })
    expect(host.querySelector('.code-block-header')).toBeNull()
  })
  it('waits for an async clipboard writer before feedback and copy events', async () => {
    let finish!: () => void
    const writer = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    const copy = vi.fn()
    mount({ node: htmlNode, clipboardWriter: writer, onCopy: copy })
    click('Copy')
    expect(writer).toHaveBeenCalledWith(htmlNode.code)
    expect(copy).not.toHaveBeenCalled()
    expect(host.querySelector('[aria-label="Copied"]')).toBeNull()
    finish()
    await vi.waitFor(() => expect(copy).toHaveBeenCalledWith(htmlNode.code))
    expect(host.querySelector('[aria-label="Copied"]')).not.toBeNull()
  })
  it('keeps copy feedback unchanged when a clipboard writer rejects', async () => {
    const copy = vi.fn()
    mount({ node: htmlNode, clipboardWriter: async () => {
      throw new Error('denied')
    }, onCopy: copy })
    click('Copy')
    await Promise.resolve()
    expect(copy).not.toHaveBeenCalled()
    expect(host.querySelector('[aria-label="Copied"]')).toBeNull()
  })
  it('creates streaming editors after the first code content and avoids repeated font/theme resets', async () => {
    const update = mount({ node: { ...htmlNode, code: '', raw: '```html', loading: true } })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(state.create).not.toHaveBeenCalled()
    update({ node: { ...htmlNode, code: '<h1>First', raw: '```html\n<h1>First', loading: true } })
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    update({ node: { ...htmlNode, code: '<h1>First content', raw: '```html\n<h1>First content', loading: true } })
    await vi.waitFor(() => expect(state.update).toHaveBeenCalled())
    expect(state.create).toHaveBeenCalledTimes(1)
    expect(state.theme).toHaveBeenCalledTimes(1)
    expect(state.options.mock.calls.filter(([options]) => Object.keys(options).length === 1 && options.fontSize === 12)).toHaveLength(1)
    update({ node: { ...htmlNode, loading: false } })
    await vi.waitFor(() => expect(state.finalize).toHaveBeenCalled())
  })

  it('delays non-streaming editors until final and finalizes their content', async () => {
    const update = mount({ node: { ...htmlNode, loading: true }, stream: false })
    await Promise.resolve()
    expect(state.create).not.toHaveBeenCalled()
    update({ node: { ...htmlNode, loading: false } })
    await vi.waitFor(() => expect(state.create).toHaveBeenCalledTimes(1))
    expect(state.finalize).toHaveBeenCalled()
  })
  it('retains streaming fallback height across handoff and releases it for replacement or font controls', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return { height: this.classList.contains('code-block-body') ? 106 : 0 } as DOMRect
    })
    const update = mount({ node: { ...htmlNode, code: 'first line\n', loading: true } })
    await vi.waitFor(() => expect(host.querySelector('.code-pre-fallback')).toBeNull())
    const body = host.querySelector<HTMLElement>('.code-block-body')!
    expect(body.style.minHeight).toBe('106px')
    update({ node: { ...htmlNode, code: 'first line\n', loading: false } })
    await vi.waitFor(() => expect(state.finalize).toHaveBeenCalled())
    expect(body.style.minHeight).toBe('106px')
    more()
    click('Font size −')
    expect(body.style.minHeight).toBe('')
    update({ node: { ...htmlNode, code: 'replacement', loading: false } })
    expect(body.style.minHeight).toBe('')
  })
  it('shows line numbers and split/unified diffs without optional stream-diffs', async () => {
    state.available = false
    const update = mount({ node: htmlNode, showLineNumbers: true })
    expect(host.querySelector('.markstream-pre__logical-line')?.getAttribute('data-line-number')).toBe('1')
    update({ node: { ...htmlNode, diff: true, originalCode: 'a\nb', updatedCode: 'a\nc' }, codeBlockOptions: { diffStyle: 'unified' } })
    expect(host.querySelector('.markstream-pre--diff-inline')).not.toBeNull()
    expect(host.querySelector('.markstream-pre__diff-line--removed')?.textContent).toContain('b')
    expect(host.querySelector('.markstream-pre__diff-line--added')?.textContent).toContain('c')
    expect(host.querySelector('.code-diff-stats')?.textContent).toBe('-1+1')
  })
})
describe('hTML/SVG artifact preview parity', () => {
  it('opens a live sandboxed HTML preview and closes it via Escape', () => {
    const update = mount()
    const editor = host.querySelector('.code-block-editor')
    more()
    click('Preview')
    const iframe = document.querySelector('iframe')!
    expect(iframe.getAttribute('sandbox')).toBe('')
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(iframe.srcdoc).toContain('<h1>Preview</h1>')
    update({ node: { ...htmlNode, code: '<h2>Updated</h2>' } })
    expect(iframe.srcdoc).toContain('<h2>Updated</h2>')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.querySelector('iframe')).toBeNull()
    expect(host.querySelector('.code-block-editor')).toBe(editor)
  })
  it('prefers an explicit sandbox and opt-in scripts over defaults', () => {
    const update = mount({ node: htmlNode, htmlPreviewAllowScripts: true })
    more()
    click('Preview')
    expect(document.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts')
    update({ htmlPreviewSandbox: 'allow-forms' })
    expect(document.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-forms')
    click('Close')
    expect(document.querySelector('iframe')).toBeNull()
  })
  it('emits HTML and SVG artifact payloads instead of opening an iframe', () => {
    const preview = vi.fn()
    const update = mount({ node: htmlNode, onPreviewCode: preview })
    more()
    click('Preview')
    expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({ node: htmlNode, artifactType: 'text/html', artifactTitle: 'HTML Preview' }))
    update({ node: { ...htmlNode, language: 'svg', code: '<svg />' } })
    more()
    click('Preview')
    expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({ artifactType: 'image/svg+xml', artifactTitle: 'SVG Preview' }))
    expect(document.querySelector('iframe')).toBeNull()
  })
  it('forwards renderer artifact and copy callbacks and closes on unmount', async () => {
    const preview = vi.fn()
    dispose = render(() => <MarkdownRender content={'```html\n<h1>Artifact</h1>\n```'} final smoothStreaming={false} batchRendering={false} viewportPriority={false} onHandleArtifactClick={preview} />, host)
    more()
    click('Preview')
    expect(preview).toHaveBeenCalledWith(expect.objectContaining({ artifactType: 'text/html' }))
    dispose()
    dispose = render(() => <HtmlPreviewFrame code="<!doctype html><html><body>Full document</body></html>" />, host)
    expect(document.querySelector('iframe')?.srcdoc).toBe('<!doctype html><html><body>Full document</body></html>')
    dispose()
    dispose = undefined
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
  it('normalizes trailing newlines in completed native code blocks', () => {
    dispose = render(() => <PreCodeNode node={{ ...htmlNode, code: 'a\r\nb\r\n' }} showLineNumbers />, host)
    expect(host.querySelector('code')?.textContent).toBe('a\r\nb')
    expect([...host.querySelectorAll('.markstream-pre__logical-line')].map(line => line.getAttribute('data-line-number'))).toEqual(['1', '2'])
  })
})
