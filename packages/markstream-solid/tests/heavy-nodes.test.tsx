import { render } from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarkdownRender from '../src'
import { enhanceRenderedHtml } from '../src/enhanceRenderedHtml'

const loaders = vi.hoisted(() => ({ mermaid: vi.fn(), d2: vi.fn(), infographic: vi.fn(), code: vi.fn() }))
vi.mock('../src/optional/mermaid', async original => ({ ...await original<any>(), getMermaid: loaders.mermaid }))
vi.mock('../src/optional/d2', async original => ({ ...await original<any>(), getD2: loaders.d2 }))
vi.mock('../src/optional/infographic', async original => ({ ...await original<any>(), getInfographic: loaders.infographic }))
vi.mock('../src/optional/streamDiffs', async original => ({ ...await original<any>(), getStreamDiffsRuntime: loaders.code }))
let cleanup: (() => void) | undefined
afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
describe('heavy-node restoration and safety', () => {
  it('does not load optional integrations while rendering ordinary HTML', async () => {
    const host = document.createElement('div')
    host.innerHTML = '<p><strong>ordinary</strong> HTML</p>'
    const handle = await enhanceRenderedHtml(host)
    expect(loaders.mermaid).not.toHaveBeenCalled()
    expect(loaders.d2).not.toHaveBeenCalled()
    expect(loaders.infographic).not.toHaveBeenCalled()
    expect(loaders.code).not.toHaveBeenCalled()
    handle.dispose()
  })
  it('sanitizes rendered Mermaid SVG before mounting it', async () => {
    loaders.mermaid.mockResolvedValue({ render: async () => '<svg xmlns="http://www.w3.org/2000/svg"><script>bad()</script><a href="javascript:bad()"><text onclick="bad()">safe</text></a></svg>' })
    const host = document.createElement('div')
    host.innerHTML = '<pre><code class="language-mermaid">flowchart LR\nA --> B</code></pre>'
    const handle = await enhanceRenderedHtml(host, { final: true })
    expect(host.querySelector('svg text')?.textContent).toBe('safe')
    expect(host.querySelector('script')).toBeNull()
    expect(host.querySelector('[onclick]')).toBeNull()
    expect(host.querySelector('[href^="javascript:"]')).toBeNull()
    handle.dispose()
  })
  it('does not emit render-final before a restored asynchronous diagram settles', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() { }
      disconnect() { }
    })
    let finish!: () => void
    loaders.mermaid.mockResolvedValue({ render: () => new Promise((resolve) => {
      finish = () => resolve('<svg xmlns="http://www.w3.org/2000/svg"><text>finished</text></svg>')
    }) })
    const host = document.createElement('div')
    document.body.append(host)
    const final = vi.fn()
    const dispose = render(() => <MarkdownRender content={'```mermaid\nflowchart LR\nA --> B\n```'} final smoothStreaming={false} viewportPriority={false} batchRendering={false} onRenderFinal={final} />, host)
    cleanup = () => {
      dispose()
      host.remove()
    }
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    expect(final).not.toHaveBeenCalled()
    finish()
    await vi.waitFor(() => expect(host.querySelector('.diagram-content svg')?.textContent).toBe('finished'))
    await vi.waitFor(() => expect(final).toHaveBeenCalledTimes(1))
  })
})
