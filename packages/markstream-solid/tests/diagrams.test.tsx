import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { D2BlockNode, InfographicBlockNode, MermaidBlockNode } from '../src'

const state = vi.hoisted(() => ({ render: vi.fn(), dispose: vi.fn() }))
vi.mock('../src/enhanceRenderedHtml', () => ({ enhanceRenderedHtml: (host: HTMLElement, options: any) => state.render(host, options) }))
let dispose: (() => void) | undefined
let host: HTMLDivElement
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class {
    observe() { }
    disconnect() { }
  })
  host = document.createElement('div')
  document.body.append(host)
  state.render.mockImplementation(async (target: HTMLElement) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 200 100')
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    text.textContent = target.querySelector('code')!.textContent
    svg.append(text)
    target.replaceChildren(svg)
    return { dispose: state.dispose }
  })
})
afterEach(() => {
  dispose?.()
  host.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const node = { type: 'code_block' as const, code: 'flowchart LR\nA --> B', language: 'mermaid', raw: '', loading: false }
function button(label: string) {
  const target = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.getAttribute('aria-label') === label)!
  expect(target, label).toBeDefined()
  return target
}
describe('vue 3 diagram interaction parity', () => {
  it.each([['mermaid', MermaidBlockNode], ['d2', D2BlockNode], ['infographic', InfographicBlockNode]] as const)('%s supports preview/source/collapse and exports cancelable SVG events', async (kind, Component) => {
    const onExport = vi.fn(event => event.preventDefault())
    dispose = render(() => <Component node={{ ...node, language: kind }} onExport={onExport} />, host)
    await vi.waitFor(() => expect(host.querySelector('.diagram-content svg')).not.toBeNull())
    expect(button('Preview').getAttribute('aria-pressed')).toBe('true')
    button('Source').click()
    expect(button('Source').getAttribute('aria-pressed')).toBe('true')
    button('Preview').click()
    button('Export').click()
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ svgElement: expect.any(SVGElement), svgString: expect.stringContaining('<svg') }))
    button('Collapse').click()
    expect((host.querySelector('.diagram-body') as HTMLElement).style.display).toBe('none')
    button('Expand').click()
    expect((host.querySelector('.diagram-body') as HTMLElement).style.display).not.toBe('none')
  })
  it('supports zoom, reset, fullscreen close, and cancelable mode/modal/copy events', async () => {
    const onCopy = vi.fn(event => event.preventDefault())
    const onMode = vi.fn((_, event) => event.preventDefault())
    const [cancel, setCancel] = createSignal(true)
    dispose = render(() => (
      <MermaidBlockNode
        node={node}
        onCopy={onCopy}
        onToggleMode={cancel() ? onMode : undefined}
        onOpenModal={(event) => {
          if (cancel())
            event.preventDefault()
        }}
      />
    ), host)
    await vi.waitFor(() => expect(host.querySelector('svg')).not.toBeNull())
    button('Zoom in').click()
    expect(host.querySelector('.diagram-content')?.getAttribute('style')).toContain('scale(1.1)')
    button('Reset zoom').click()
    expect(host.querySelector('.diagram-content')?.getAttribute('style')).toContain('scale(1)')
    button('Source').click()
    expect(button('Source').getAttribute('aria-pressed')).toBe('false')
    button('Copy').click()
    expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({ payload: { type: 'copy', text: node.code } }))
    button('Open').click()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    setCancel(false)
    button('Open').click()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
  it('preserves the current preview during a delayed stream update and commits only the newest result', async () => {
    const [value, setValue] = createSignal(node)
    dispose = render(() => <MermaidBlockNode node={value()} renderDebounceMs={0} />, host)
    await vi.waitFor(() => expect(host.querySelector('svg text')?.textContent).toBe(node.code))
    let finish!: () => void
    state.render.mockImplementationOnce((target: HTMLElement) => new Promise((resolve) => {
      finish = () => {
        target.innerHTML = '<svg><text>stale</text></svg>'
        resolve({ dispose: state.dispose })
      }
    }))
    setValue({ ...node, code: 'pending', loading: true })
    await vi.waitFor(() => expect(state.render).toHaveBeenCalledTimes(2))
    expect(host.querySelector('svg text')?.textContent).toBe(node.code)
    setValue({ ...node, code: 'latest' })
    await vi.waitFor(() => expect(host.querySelector('svg text')?.textContent).toBe('latest'))
    finish()
    await Promise.resolve()
    expect(host.querySelector('svg text')?.textContent).toBe('latest')
  })
  it('retains infographic SVG output after the renderer destroys its owned SVG', async () => {
    state.render.mockImplementationOnce(async (target: HTMLElement) => {
      target.innerHTML = '<svg><text>Keep the infographic</text></svg>'
      const svg = target.querySelector('svg')!
      return { dispose: () => svg.remove() }
    })
    dispose = render(() => <InfographicBlockNode node={{ ...node, language: 'infographic' }} />, host)
    await vi.waitFor(() => expect(host.querySelector('.diagram-content svg')?.textContent).toBe('Keep the infographic'))
  })
  it('honors header/button visibility and render-error interception', async () => {
    state.render.mockRejectedValueOnce(new Error('invalid diagram'))
    const onError = vi.fn(() => true)
    dispose = render(() => <MermaidBlockNode node={node} showCopyButton={false} showExportButton={false} showFullscreenButton={false} showCollapseButton={false} showZoomControls={false} showModeToggle={false} onRenderError={onError} />, host)
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error), node.code, expect.any(HTMLElement)))
    expect(host.querySelectorAll('button')).toHaveLength(0)
    expect(host.querySelector('.diagram-error')).toBeNull()
  })
  it('cancels debounce and staging resources on unmount', async () => {
    vi.useFakeTimers()
    dispose = render(() => <MermaidBlockNode node={{ ...node, loading: true }} renderDebounceMs={300} />, host)
    dispose()
    dispose = undefined
    await vi.runAllTimersAsync()
    expect(state.render).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
